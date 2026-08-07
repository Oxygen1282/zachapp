from sqlalchemy.ext.asyncio import AsyncSession 
from sqlalchemy import select
from sqlalchemy.orm import selectinload 

from core.security import verify_password

import secrets

from datetime import datetime, timezone

from fastapi import HTTPException

from models.estimate import Estimate
from models.estimate_item import EstimateItem 
from models.job import Job 
from models.client import Client 
from models.item import Item 
from models.tax_location import TaxLocation
from models.user import User

from services.pdf_service import generate_estimate_pdf

from schemas.estimate import EstimateCreate, DeleteEstimateRequest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Compute subtotal, tax, and total on an estimate, in one place.
#
# The tax RATE is passed in rather than read inside here, because it comes
# from different sources depending on lifecycle:
#   - Draft: the LIVE rate looked up from the selected tax_location.
#   - Sent (later): the FROZEN tax_percentage stored on the estimate.
# Passing the rate in lets both cases reuse this exact math.
def _recompute_money(estimate: Estimate, tax_percentage: float | None) -> None:
    estimate.subtotal = sum(
        line.unit_price * line.quantity
        for line in estimate.items
    )

    if tax_percentage:
        # percentage is stored as a percent (8.0) so divide by 100
        estimate.tax_amount = estimate.subtotal * (tax_percentage / 100)
    else:
        estimate.tax_amount = 0.0

    # total is ALWAYS subtotal + tax_amount, regardless of wether there's tax
    estimate.total = estimate.subtotal + estimate.tax_amount

# Look up the live rate for a draft's selected tax location. Returns None if
# no location is selected (no tax). Raises if an invalid id was sent.
async def _get_live_tax_rate(db: AsyncSession, tax_location_id: int | None) -> float | None:
    if tax_location_id is None:
        return None 
    
    result = await db.execute(
        select(TaxLocation).where(TaxLocation.id == tax_location_id)
    )
    location = result.scalar_one_or_none()

    if location is None:
        raise HTTPException(
            status_code=400,
            detail="Selected tax location does not exist",
        )
    
    return location.percentage

# Ensure a catalog item exists for this name (decision: creating a new item
# while invoicing also adds it to the catalog for future use). Reuses the same
# uniqueness idea from the item service — if the name is already in the
# catalog we leave it alone, otherwise we add it. This does NOT affect the
# estimate line itself; the line always keeps its own copied name/description.
async def _ensure_catalog_item(db: AsyncSession, name: str, description: str | None) -> None:
    existing = await db.execute(
        select(Item).where(Item.name == name)
    )

    if existing.scalar_one_or_none() is None: 
        db.add(Item(name=name, description=description))

# Produce the next estimate number: 4-digit year + 3-digit per-year sequence,
# e.g. "2026013" for the 13th estimate sent in 2026.
#
# Approach (option a): derive everything, store no counter.
#   - Year comes from the current date (rolls over on its own each Jan 1).
#   - Sequence = (highest sequence already used THIS year) + 1.
# Only SENT estimates have numbers (drafts are null), so this naturally counts
async def _generate_estimate_number(db: AsyncSession)  -> str:
    year = datetime.now(timezone.utc).year 
    year_prefix = str(year)  

    # Find the highest existing estimate_number that starts with this year.
    # We sort descending and take the top one; if none exist yet this year,
    # there's nothing, so we start the sequence at 0.
    result = await db.execute(
        select(Estimate.estimate_number)
            .where(Estimate.estimate_number.like(f"{year_prefix}%"))
            .order_by(Estimate.estimate_number.desc())
            .limit(1)
    )
    highest = result.scalar_one_or_none()

    if highest is None:
        # First estimate of the year
        next_sequence = 1
    else: 
        # highest looks like "2026012" -> the last 3 chars are the sequence.
        last_sequence = int(highest[4:])    # chars after the 4-digit year
        next_sequence = last_sequence + 1

    # Zero-pad the sequence to 3 digits and join to the year: "2026" + "013".
    return f"{year_prefix}{next_sequence:03d}"

# Resolve the frozen address string for an estimate, from whichever flow:
#   Flow 2 (job_id given): use the job's existing frozen address.
#   Flow 1 (client_address_id given): freeze the chosen client address.
# Also validates the client exists and (if given) the job belongs to the client.
async def _resolve_estimate_address(
        db: AsyncSession,
        client_id: int,
        job_id: int | None,
        client_address_id: int | None,
) -> str:

    # Flow 2: address comes from the job.
    if job_id is not None:
        result = await db.execute(select(Job).where(Job.id == job_id))
        job = result.scalar_one_or_none()
        if job is None:
            raise HTTPException(
                status_code=404,
                detail="Job does not exist",
            )
        return job.address
    # Flow 1: freeze the chosen client address.
    if client_address_id is not None:
        result = await db.execute(
            select(Client).where(Client.id == client_id)
            .options(selectinload(Client.addresses))
        )
        client = result.scalar_one_or_none()
        if client is None:
            raise HTTPException(
                status_code=404,
                detail="Client does not exist",
            )

        addr = next((a for a in client.addresses if a.id == client_address_id), None)
        if addr is None:
            raise HTTPException(
                status_code=400,
                detail="Chosen address does not belong to this client"
            )

        # Compose the frozen address string (same shape as jobs freeze).
        parts = [addr.street]
        if addr.street_line2:
            parts.append(addr.street_line2)
        parts.append(f"{addr.city}, {addr.state} {addr.zip}")
        return ", ".join(parts)

    # Neither given = can't build an addrss.
    raise HTTPException(
        status_code=400,
        detail="An estimate needs a job or a client address",
    )

# When an estimate is created for a job, reflect "Estimate Drafted" onto the
# job (Flow 2). No-op if the job is already past "No Estimates".
async def _set_job_estimate_drafted(db: AsyncSession, job_id: int) -> None:
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if job is not None and job.status == "No Estimates":
        job.status = "Estimate Drafted"

# ---------------------------------------------------------------------------
# Draft operations
# ---------------------------------------------------------------------------

async def create_estimate(db: AsyncSession, data: EstimateCreate) -> Estimate:

    # The client must exist (estimates always have a client).
    client_result = await db.execute(select(Client).where(Client.id == data.client_id))
    if client_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=404,
            detail="Client does not exist"
        )

    # Resolve the frozen address from whichever flow (job or client address).
    address = await _resolve_estimate_address(db, data.client_id, data.job_id, data.client_address_id)

    # Generate the permanent, unguessable public token for the customer link.
    token = secrets.token_urlsafe(32)
    
    # Create the parent. Status defaults to "Draft"; number/date/pdf stay null
    # until it's sent. We build the estimate empty, then attach lines below.
    estimate = Estimate(
        client_id=data.client_id,
        job_id=data.job_id,         # may be None (Flow 1)
        address=address,            # Frozen
        estimate_title=data.estimate_title,
        disclaimer=data.disclaimer,
        tax_location_id=data.tax_location_id,
        public_token=token,
        last_modified=datetime.now(timezone.utc)
    )

    # Attach each line as a child row. Appending to estimate.items is enough —
    # the relationship + cascade from piece 1 makes these real estimate_items
    # rows on commit, with estimate_id wired automatically.
    for line in data.items:

        # New-item-to-catalog rule: make sure the catalog has this item.
        await _ensure_catalog_item(db, line.name, line.description)

        # The line keeps its OWN copied values (frozen history).
        estimate.items.append(
            EstimateItem(
                name=line.name,
                description=line.description,
                unit_price=line.unit_price,
                quantity=line.quantity,
            )
        )

    # Server-side total from the lines we just attached.
    # Compute money using the LIVE rate from the selected location (draft).
    tax_rate = await _get_live_tax_rate(db, data.tax_location_id)
    _recompute_money(estimate, tax_rate)

    db.add(estimate)

    # If this estimate is tied to a job, reflect "Estimate Drafted" onto it.
    if data.job_id is not None:
        await _set_job_estimate_drafted(db, data.job_id)

    await db.commit()
    return await get_estimate_by_id(db, estimate.id)

async def get_estimate_by_id(db: AsyncSession, estimate_id: int) -> Estimate:

    # selectinload(estimate.items) tells SQLAlchemy to fetch the child rows in
    # the same go, so estimate.items is populated when we return it. Without
    # this, accessing .items after the request could error under async (the
    # session would need a lazy follow-up query at a bad time).
    result = await db.execute(
        select(Estimate).where(Estimate.id == estimate_id).options(selectinload(Estimate.items))
    )

    estimate = result.scalar_one_or_none()

    if estimate is None:
        raise HTTPException(
            status_code=404,
            detail="estimate not found",
            )
    
    return estimate 

async def get_estimates(db: AsyncSession):

    # List all estimates, each with its lines eagerly loaded
    result = await db.execute(
        select(Estimate)
        # Read the backend gaurd for scaling purposes.
        # .where(Estimate.is_archived == False)       # Hide archived from default list
        .options(selectinload(Estimate.items))
        .order_by(Estimate.last_modified.desc().nullslast())
    )
    return result.scalars().all()

async def update_estimate(db: AsyncSession, estimate_id: int, data: EstimateCreate) -> Estimate:

    estimate = await get_estimate_by_id(db, estimate_id)

    # Only drafts are editable. Once sent/paid it's locked.
    if estimate.status != "Draft" and estimate.status != "Awaiting Changes":
        raise HTTPException(
            status_code=400,
            detail="Only draft or awaiting-changes estimates can be edited",
        )

    # Re-resolve the frozen address (the flow/source may have changed).
    address = await _resolve_estimate_address(db, data.client_id, data.job_id, data.client_address_id)
    
    # Replace the whole line set. Clearing the list deletes the old rows via
    # delete-orphan (from piece 1); re-appending creates the new ones. This
    # "replace everything" approach is simpler and less bug-prone than trying
    # to diff which individual lines changed.
    estimate.items.clear()

    estimate.client_id = data.client_id
    estimate.job_id = data.job_id
    estimate.address = address
    estimate.estimate_title = data.estimate_title
    estimate.disclaimer = data.disclaimer
    estimate.tax_location_id = data.tax_location_id

    for line in data.items:
        await _ensure_catalog_item(db, line.name, line.description)
        estimate.items.append(
            EstimateItem(
                name=line.name,
                description=line.description,
                unit_price=line.unit_price,
                quantity=line.quantity,
            )
        )

    tax_rate = await _get_live_tax_rate(db, data.tax_location_id)
    _recompute_money(estimate, tax_rate)

    estimate.last_modified = datetime.now(timezone.utc)

    # If the job changed (or was just set), reflect "Estimate Drafted".
    if data.job_id is not None:
        await _set_job_estimate_drafted(db, data.job_id)

    await db.commit()
    return await get_estimate_by_id(db, estimate.id)

async def delete_estimate(db: AsyncSession, estimate_id: int, owner: User, data: DeleteEstimateRequest):

    estimate = await get_estimate_by_id(db, estimate_id)

    # Non-draft estimates require the owner's password (a re-auth gate on
    # deleting something that's actually been sent). Drafts delete freely.
    if estimate.status != "Draft":
        if not verify_password(data.password, owner.password_hash):
            raise HTTPException(
                status_code=403,
                detail="Incorrect Password",
            )
    
    await db.delete(estimate)
    await db.commit()

    return {
        "message": "Estimate deleted"
    }

# ---------------------------------------------------------------------------
# Send operations
# ---------------------------------------------------------------------------

# Send (or re-send) an estimate to the customer. Allowed from Draft (first send)
# or Awaiting Changes (re-send after revising). Assigns a number only on the
# first send (a re-send keeps its number), freezes the tax, sets the sent date,
# flips to "Awaiting Response", and regenerates the PDF. The change_request is
# left intact — it stays as a reference until the customer submits a new one.
async def send_estimate(db: AsyncSession, estimate_id: int) -> Estimate:

    estimate = await get_estimate_by_id(db, estimate_id)

    # ----- Guards ------
    if estimate.status not in ("Draft", "Awaiting Changes"):
        raise HTTPException(
            status_code=400,
            detail="Only draft or awaiting-changes estimates can be sent",
        )

    if len(estimate.items) == 0:
        raise HTTPException(
            status_code=400,
            detail="Cannot send an estimate with no line items",
        )

    # ----- Recipient info for the PDF: client name + the frozen address -----
    client_result = await db.execute(
        select(Client).where(Client.id == estimate.client_id)
    )
    client = client_result.scalar_one_or_none()
    if client is None:
        raise HTTPException(
            status_code=400,
            detail="Estimate's client no longer exists"
        )

    client_name = client.name 
    address = estimate.address  # already frozen on the estimate

    # ----- Freeze the tax (snapshot name + rate) -----
    if estimate.tax_location_id is not None:
        result = await db.execute(
            select(TaxLocation).where(TaxLocation.id == estimate.tax_location_id)
        )
        location = result.scalar_one_or_none()
        estimate.tax_name = location.name
        estimate.tax_percentage = location.percentage
    else: 
        estimate.tax_name = None 
        estimate.tax_percentage = None

    _recompute_money(estimate, estimate.tax_percentage)

    # ----- Assign a number ONLY if it doesn't have one (re-send keeps it) -----
    if estimate.estimate_number is None:
        estimate.estimate_number = await _generate_estimate_number(db)

    estimate.date_sent = datetime.now(timezone.utc)
    estimate.status = "Awaiting Response"

    # ----- Regenerate the PDF (overwrites on re-send) -----
    pdf_path = generate_estimate_pdf(estimate, client_name, address)
    estimate.pdf_path = pdf_path 

    estimate.last_modified = datetime.now(timezone.utc)

    await db.commit() 
    return await get_estimate_by_id(db, estimate.id)

# Customer approves the estimate with their typed signature. Public/token-driven
# (the route resolves the estimate by token, then calls this). Only an estimate
# "Awaiting Response" can be approved — not a draft (never sent), not one already
# acted on. Records the signature + signed date and flips to "Approved".
async def approve_estimate(db: AsyncSession, estimate: Estimate, signature: str) -> Estimate:

    if estimate.status != "Awaiting Response":
        raise HTTPException(
            status_code=400,
            detail="This estimate is not awaiting a response",
        )

    if not signature or signature.strip() == "":
        raise HTTPException(
            status_code=400,
            detail="A signature is required to approve",
        )

    estimate.signature = signature.strip()
    estimate.signed_date = datetime.now(timezone.utc)
    estimate.status = "Approved"

    estimate.last_modified = datetime.now(timezone.utc)

    await db.commit()
    return await get_estimate_by_id(db, estimate.id)

# Customer requests changes with a message. Public/token-driven. Only from
# "Awaiting Response". Overwrites change_request (replacing any prior one) and
# flips to "Awaiting Changes". The owner then revises and re-sends.
async def request_changes(db: AsyncSession, estimate: Estimate, message: str) -> Estimate:

    if estimate.status != "Awaiting Response":
        raise HTTPException(
            status_code=400,
            detail="This estimate is not awaiting a response",
        )

    if not message or message.strip() == "":
        raise HTTPException(
            status_code=400,
            detail="Please describe the changes you'd like"
        )

    estimate.change_request = message.strip()
    estimate.status = "Awaiting Changes"

    estimate.last_modified = datetime.now(timezone.utc)

    await db.commit() 
    return await get_estimate_by_id(db, estimate.id)

# Soft-hide an estimate: filtered from the default list AND made inaccessible on
# the public customer page (the public route checks is_archived). Any status.
async def toggle_archive(db: AsyncSession, estimate_id: int) -> Estimate:
    estimate = await get_estimate_by_id(db, estimate_id)
    estimate.is_archived = not estimate.is_archived
    estimate.last_modified = datetime.now(timezone.utc)
    await db.commit()
    return await get_estimate_by_id(db, estimate.id)

# Resolve an estimate by its PUBLIC TOKEN (the customer's "credential").
# This is how the unauthenticated customer routes identify which estimate —
# the token stands in for a login. Archived estimates are treated as NOT FOUND
# (archiving revokes customer access, per the spec).
async def get_estimate_by_token(db: AsyncSession, token: str) -> Estimate:
    result = await db.execute(
        select(Estimate)
        .where(Estimate.public_token == token)
        .options(selectinload(Estimate.items))
    )
    estimate = result.scalar_one_or_none()

    # Not found, OR archived -> 404. We deliberately don't distinguish the two:
    # an archived estimate should look identical to a nonexistent one to the
    # customer (no information leak about whether it ever existed).
    if estimate is None or estimate.is_archived:
        raise HTTPException(
            status_code=404,
            detail="Estimate not found"
        )

    return estimate

# Mark first-view (for the future notifications center). Stamps first_viewed_at
# ONLY if it's currently null — captures the first open, never overwrites.
async def mark_first_view(db: AsyncSession, estimate: Estimate) -> None:
    if estimate.first_viewed_at is None:
        estimate.first_viewed_at = datetime.now(timezone.utc)
        await db.commit()

# Link an existing (job-less) estimate to a newly-created job. Sets job_id, and
# updates the frozen address (in case it was corrected during conversion).
async def link_estimate_to_job(db: AsyncSession, estimate_id: int, job_id: int, address: str) -> Estimate:
    estimate = await get_estimate_by_id(db, estimate_id)

    # Guard: only link an estimate that isn't already linked.
    if estimate.job_id is not None:
        raise HTTPException(
            status_code=400,
            detail="Estimate is already linked to a job",
        )

    estimate.job_id = job_id 
    estimate.address= address   # re-freeze (may have been corrected)
    estimate.last_modified = datetime.now(timezone.utc)

    await db.commit()
    return await get_estimate_by_id(db, estimate.id)
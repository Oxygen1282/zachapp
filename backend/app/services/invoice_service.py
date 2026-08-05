from sqlalchemy.ext.asyncio import AsyncSession 
from sqlalchemy import select
from sqlalchemy.orm import selectinload 

from datetime import datetime, timezone

from fastapi import HTTPException

from models.invoice import Invoice
from models.invoice_item import InvoiceItem 
from models.job import Job 
from models.client import Client 
from models.item import Item 
from models.tax_location import TaxLocation

from services.pdf_service import generate_invoice_pdf

from schemas.invoice import InvoiceCreate

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Compute subtotal, tax, and total on an invoice, in one place.
#
# The tax RATE is passed in rather than read inside here, because it comes
# from different sources depending on lifecycle:
#   - Draft: the LIVE rate looked up from the selected tax_location.
#   - Sent (later): the FROZEN tax_percentage stored on the invoice.
# Passing the rate in lets both cases reuse this exact math.
def _recompute_money(invoice: Invoice, tax_percentage: float | None) -> None:
    invoice.subtotal = sum(
        line.unit_price * line.quantity
        for line in invoice.items
    )

    if tax_percentage:
        # percentage is stored as a percent (8.0) so divide by 100
        invoice.tax_amount = invoice.subtotal * (tax_percentage / 100)
    else:
        invoice.tax_amount = 0.0

    # total is ALWAYS subtotal + tax_amount, regardless of wether there's tax
    invoice.total = invoice.subtotal + invoice.tax_amount

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
# invoice line itself; the line always keeps its own copied name/description.
async def _ensure_catalog_item(db: AsyncSession, name: str, description: str | None) -> None:
    existing = await db.execute(
        select(Item).where(Item.name == name)
    )

    if existing.scalar_one_or_none() is None: 
        db.add(Item(name=name, description=description))

# Produce the next invoice number: 4-digit year + 3-digit per-year sequence,
# e.g. "2026013" for the 13th invoice sent in 2026.
#
# Approach (option a): derive everything, store no counter.
#   - Year comes from the current date (rolls over on its own each Jan 1).
#   - Sequence = (highest sequence already used THIS year) + 1.
# Only SENT invoices have numbers (drafts are null), so this naturally counts
async def _generate_invoice_number(db: AsyncSession)  -> str:
    year = datetime.now(timezone.utc).year 
    year_prefix = str(year)  

    # Find the highest existing invoice_number that starts with this year.
    # We sort descending and take the top one; if none exist yet this year,
    # there's nothing, so we start the sequence at 0.
    result = await db.execute(
        select(Invoice.invoice_number)
            .where(Invoice.invoice_number.like(f"{year_prefix}%"))
            .order_by(Invoice.invoice_number.desc())
            .limit(1)
    )
    highest = result.scalar_one_or_none()

    if highest is None:
        # First invoice of the year
        next_sequence = 1
    else: 
        # highest looks like "2026012" -> the last 3 chars are the sequence.
        last_sequence = int(highest[4:])    # chars after the 4-digit year
        next_sequence = last_sequence + 1

    # Zero-pad the sequence to 3 digits and join to the year: "2026" + "013".
    return f"{year_prefix}{next_sequence:03d}"

# If a job has at least one invoice and ALL of them are Paid, set the job's
# status to "Paid". Otherwise leave the job's status alone.
async def _reflect_paid_status_on_job(db: AsyncSession, job_id: int) -> None:

    # Count the job's invoices, and how many are NOT paid.
    result = await db.execute(
        select(Invoice.status).where(Invoice.job_id == job_id)
    )
    statuses = result.scalars().all()

    # No invoices at all -> nothing to reflect.
    if len(statuses) == 0:
        return 
    
    # Every invoice paid?
    all_paid = all(status == "Paid" for status in statuses)

    if all_paid:
        job_result = await db.execute(select(Job).where(Job.id == job_id))
        job = job_result.scalar_one_or_none()
        if Job is not None:
            job.status = "Paid"

# ---------------------------------------------------------------------------
# Draft operations
# ---------------------------------------------------------------------------

async def create_invoice(db: AsyncSession, data: InvoiceCreate) -> Invoice:

    # The invoice must point at a real job.
    job = await db.execute(select(Job).where(Job.id == data.job_id))
    if job.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=404,
            detail="Job does not exist"
        )
    
    # Create the parent. Status defaults to "Draft"; number/date/pdf stay null
    # until it's sent. We build the invoice empty, then attach lines below.
    invoice = Invoice(
        job_id=data.job_id,
        due_type=data.due_type,
        due_days=data.due_days,
        invoice_title=data.invoice_title,
        disclaimer=data.disclaimer,
        tax_location_id=data.tax_location_id,
        last_modified=datetime.now(timezone.utc)
    )

    # Attach each line as a child row. Appending to invoice.items is enough —
    # the relationship + cascade from piece 1 makes these real invoice_items
    # rows on commit, with invoice_id wired automatically.
    for line in data.items:

        # New-item-to-catalog rule: make sure the catalog has this item.
        await _ensure_catalog_item(db, line.name, line.description)

        # The line keeps its OWN copied values (frozen history).
        invoice.items.append(
            InvoiceItem(
                name=line.name,
                description=line.description,
                unit_price=line.unit_price,
                quantity=line.quantity,
            )
        )

    # Server-side total from the lines we just attached.
    # Compute money using the LIVE rate from the selected location (draft).
    tax_rate = await _get_live_tax_rate(db, data.tax_location_id)
    _recompute_money(invoice, tax_rate)

    db.add(invoice)
    await db.commit()
    return await get_invoice_by_id(db, invoice.id)

async def get_invoice_by_id(db: AsyncSession, invoice_id: int) -> Invoice:

    # selectinload(Invoice.items) tells SQLAlchemy to fetch the child rows in
    # the same go, so invoice.items is populated when we return it. Without
    # this, accessing .items after the request could error under async (the
    # session would need a lazy follow-up query at a bad time).
    result = await db.execute(
        select(Invoice).where(Invoice.id == invoice_id).options(selectinload(Invoice.items))
    )

    invoice = result.scalar_one_or_none()

    if invoice is None:
        raise HTTPException(
            status_code=404,
            detail="Invoice not found",
            )
    
    return invoice 

async def get_invoices(db: AsyncSession):

    # List all invoices, each with its lines eagerly loaded
    result = await db.execute(
        select(Invoice)
        .options(selectinload(Invoice.items))
        .order_by(Invoice.last_modified.desc().nullslast())
    )
    return result.scalars().all()

async def update_invoice(db: AsyncSession, invoice_id: int, data: InvoiceCreate) -> Invoice:

    invoice = await get_invoice_by_id(db, invoice_id)

    # Only drafts are editable (decision D). Once sent/paid it's locked.
    if invoice.status != "Draft":
        raise HTTPException(
            status_code=400,
            detail="Only draft invoices can be edited",
        )
    
    # Replace the whole line set. Clearing the list deletes the old rows via
    # delete-orphan (from piece 1); re-appending creates the new ones. This
    # "replace everything" approach is simpler and less bug-prone than trying
    # to diff which individual lines changed.
    invoice.items.clear()

    invoice.job_id = data.job_id
    invoice.due_type = data.due_type
    invoice.due_days = data.due_days
    invoice.invoice_title = data.invoice_title
    invoice.disclaimer = data.disclaimer
    invoice.tax_location_id = data.tax_location_id

    for line in data.items:
        await _ensure_catalog_item(db, line.name, line.description)
        invoice.items.append(
            InvoiceItem(
                name=line.name,
                description=line.description,
                unit_price=line.unit_price,
                quantity=line.quantity,
            )
        )

    tax_rate = await _get_live_tax_rate(db, data.tax_location_id)
    _recompute_money(invoice, tax_rate)

    invoice.last_modified = datetime.now(timezone.utc)

    await db.commit()
    return await get_invoice_by_id(db, invoice.id)

async def delete_invoice(db: AsyncSession, invoice_id: int):

    invoice = await get_invoice_by_id(db, invoice_id)

    # Dev-stage rule (decision F): allow deleting drafts freely. Sent invoices
    # should be VOIDED, not deleted, once you deploy — we'll add that guard
    # and a void action later. For now, deleting a draft removes it and its
    # lines (cascade handles the children).

    # !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    # !  Re-add the "Draft" Gaurd before Deployment !
    # !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

    # if invoice.status != "Draft":
    #     raise HTTPException(
    #         status_code=400,
    #         detail="Only draft invoices can be deleted (set invoices must be voided)",
    #     )
    
    await db.delete(invoice)
    await db.commit()

    return {
        "message": "Invoice deleted"
    }

# ---------------------------------------------------------------------------
# Send operations
# ---------------------------------------------------------------------------

# Send a draft invoice: assign its number, freeze the tax, set the issue date,
# render + save the PDF, and lock it as "Sent". This is ONE transaction — if
# any step fails, nothing is committed and the invoice stays a clean draft.
async def send_invoice(db: AsyncSession, invoice_id: int) -> Invoice:

    # Load the invoice WITH its line items (needed for the PDF + totals).
    invoice = await get_invoice_by_id(db, invoice_id)

    # ----- Gaurds -----
    if invoice.status != "Draft":
        raise HTTPException(
            status_code=400, 
            detail="Only draft invoices can be sent",
        )
    
    if len(invoice.items) == 0:
        raise HTTPException(
            status_code=400,
            detail="Cannot send an invoice with no line items",
        )
    
    # ---- Load the client name + job address for the PDF ----
    # The recipient name comes from the CLIENT, the address from the JOB
    # (its frozen string). We need both, so load the job and its client.
    job_result = await db.execute(
        select(Job)
        .where(Job.id == invoice.job_id)
        .options(selectinload(Job.client))
    )
    job = job_result.scalar_one_or_none()

    if job is None:
        raise HTTPException(
            status_code=400,
            detail="Invoice's job no longer exists",
        )
    
    client_name = job.client.name
    job_address = job.address 

    # ---- Freeze the tax (copy live rate onto the invoice) ----
    # While a draft, tax was computed from the live location. Now we snapshot
    # the name + percentage so this sent invoice is immune to later rate edits.
    if invoice.tax_location_id is not None:
        rate = await _get_live_tax_rate(db, invoice.tax_location_id)
        result = await db.execute(
            select(TaxLocation).where(TaxLocation.id == invoice.tax_location_id)
        )
        location = result.scalar_one_or_none()
        invoice.tax_name = location.name 
        invoice.tax_percentage = location.percentage
    else:
        invoice.tax_name = None 
        invoice.tax_percentage = None

    # Recompute money using the now-FROZEN percentage (not the live lookup).
    _recompute_money(invoice, invoice.tax_percentage)

    # ---- Assign the number and issue date ----
    invoice.invoice_number = await _generate_invoice_number(db)
    invoice.date_issued = datetime.now(timezone.utc)

    # ---- Lock it BEFORE rendering, so is_paid/status on the PDF are correct ----
    invoice.status = "Sent"

    # ---- Render + save the PDF, store its path ----
    pdf_path = generate_invoice_pdf(invoice, client_name, job_address)
    invoice.pdf_path = pdf_path

    invoice.last_modified = datetime.now(timezone.utc)

    # ---- Commit everything as one transaction ----
    await db.commit()

    return await get_invoice_by_id(db, invoice.id)

# Mark a SENT invoice as Paid: flip its status, regenerate the PDF so the
# PAID watermark appears, and reflect onto the job (the job becomes "Paid"
# only when ALL of its invoices are paid).
async def mark_invoice_paid(db: AsyncSession, invoice_id: int) -> Invoice:

    invoice = await get_invoice_by_id(db, invoice_id)

    # Only a Sent invoice can be paid. Not a draft (never sent), not already paid.
    if invoice.status != "Sent":
        raise HTTPException(
            status_code=400,
            detail="Only sent invoices can be marked paid",
        )
    
    # Load the job + client again, for the PDF regeneration (recipient name
    # from client, address from job) — same as send.
    job_result = await db.execute(
        select(Job)
        .where(Job.id == invoice.job_id)
        .options(selectinload(Job.client))
    )
    job = job_result.scalar_one_or_none()

    if job is None:
        raise HTTPException(
            status_code=400,
            detail="Invoice's job no longer exists"
        )
    
    client_name = job.client.name
    job_address = job.address

    # ---- Flip status BEFORE regenerating, so is_paid is true in the PDF ----
    invoice.status = "Paid"
    invoice.date_paid = datetime.now(timezone.utc)

    # ---- Regenerate the PDF (now with the PAID watermark) ----
    # Overwrites the same file (same client + invoice number -> same filename).
    pdf_path = generate_invoice_pdf(invoice, client_name, job_address)
    invoice.pdf_path = pdf_path

    invoice.last_modified = datetime.now(timezone.utc)

    # ---- Reflect onto the job: is EVERY invoice for this job now Paid? ----
    await _reflect_paid_status_on_job(db, invoice.job_id)

    await db.commit()

    return await get_invoice_by_id(db, invoice.id)

# Void a SENT invoice: flip status to "Void", regenerate the PDF with the red
# VOID watermark, and lock it. Unlike paid, voiding does NOT reflect onto the
# job (a voided invoice isn't a completed payment).
async def void_invoice(db: AsyncSession, invoice_id: int) -> Invoice:
    invoice = await get_invoice_by_id(db, invoice_id)

    if invoice.status != "Sent":
        raise HTTPException(
            status_code=400,
            detail="Only sent invoices can be voided"
        )
    
    # Load job + client for the PDF regeneration (same as send/paid).
    job_result = await db.execute(
        select(Job)
        .where(Job.id == invoice.job_id)
        .options(selectinload(Job.client))
    )
    job = job_result.scalar_one_or_none()

    if job is None:
        raise HTTPException(
            status_code=400,
            detail="Invoice's job no longer exists"
        )
    
    client_name = job.client.name
    job_address = job.address

    # Flip status BEFORE regenerating so the PDF gets the VOID watermark.
    invoice.status = "Void"

    pdf_path = generate_invoice_pdf(invoice, client_name, job_address)
    invoice.pdf_path = pdf_path

    invoice.last_modified = datetime.now(timezone.utc)

    await db.commit()
    return await get_invoice_by_id(db, invoice_id)
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse

from sqlalchemy.ext.asyncio import AsyncSession 
from sqlalchemy import select

import os 

from db.database import get_db

from core.dependencies import require_owner

from models.user import User
from models.client import Client

from schemas.estimate import (
    EstimateCreate,
    EstimateRead,
    EstimatePublicRead,
    EstimateApprove,
    EstimateChangeRequest,
    DeleteEstimateRequest,
    LinkEstimateToJobRequest,
)

from services.estimate_service import (
    create_estimate,
    get_estimates,
    get_estimate_by_id,
    update_estimate,
    delete_estimate,
    send_estimate,
    toggle_archive,
    get_estimate_by_token,
    mark_first_view,
    approve_estimate,
    request_changes,
    link_estimate_to_job,
    resend_estimate_email,
)

router = APIRouter(prefix="/estimates", tags=["estimates"])

# CREATE (draft) — POST /estimates/
@router.post("/", response_model=EstimateRead)
async def create(
    data: EstimateCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await create_estimate(db, data)

# Send - owner only
@router.post("/{estimate_id}/send", response_model=EstimateRead)
async def send(
    estimate_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await send_estimate(db, estimate_id)

# Resend the "View Estimate" email for an already-sent estimate. Owner-only.
@router.post("/{estimate_id}/resend-email", response_model=EstimateRead)
async def resend_email(
    estimate_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await resend_estimate_email(db, estimate_id)

# Archive toggle - owner only
@router.post("/{estimate_id}/toggle-archive", response_model=EstimateRead)
async def archive_toggle(
    estimate_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
): 
    return await toggle_archive(db, estimate_id)

@router.post("/{estimate_id}/link-job", response_model=EstimateRead)
async def link_job(
    estimate_id: int,
    data: LinkEstimateToJobRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await link_estimate_to_job(db, estimate_id, data.job_id, data.address)

# LIST — GET /estimates/
@router.get("/", response_model=list[EstimateRead])
async def list_estimates(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await get_estimates(db)

# READ ONE — GET /estimates/{estimate_id}
@router.get("/{estimate_id}", response_model=EstimateRead)
async def get_one(
    estimate_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await get_estimate_by_id(db, estimate_id)

# Serve the generated PDF for an estimate so the browser can view/download it.
@router.get("/{estimate_id}/pdf")
async def get_estimate_pdf(
    estimate_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    estimate = await get_estimate_by_id(db, estimate_id)

    # Only sent/approved estimates have a PDF; drafts don't.
    if not estimate.pdf_path or not os.path.exists(estimate.pdf_path):
        raise HTTPException(
            status_code=404, 
            detail="No PDF for this estimate",
        )
    
    # FileResponse streams the file from disk with the right content type.
    # filename= sets the name the browser suggests on download.
    return FileResponse(
        estimate.pdf_path,
        media_type="application/pdf",
        filename=os.path.basename(estimate.pdf_path)
    )

# UPDATE (draft only) — PUT /estimates/{estimate_id}
@router.put("/{estimate_id}", response_model=EstimateRead)
async def update(
    estimate_id: int,
    data: EstimateCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await update_estimate(db, estimate_id, data)

# DELETE — DELETE /estimates/{estimate_id}
@router.post("/{estimate_id}/delete")
async def delete(
    estimate_id: int,
    data: DeleteEstimateRequest,
    db: AsyncSession = Depends(get_db),
    owner: User = Depends(require_owner),
):
    return await delete_estimate(db, estimate_id, owner, data)

# ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
#
#                                                       PUBLIC ROUTER
#
# ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# A SEPARATE router for the public, unauthenticated customer surface. No
# require_owner — the token in the URL is the only credential. Mounted at
# /public/estimates so it's clearly distinct from the owner routes.
public_router = APIRouter(prefix="/public/estimates", tags=["estimates-public"])

# Build the narrow public view of an estimate (adds the client name, which
# isn't on the estimate model). Shared by the view/approve/request responses.
async def _build_public_view(db: AsyncSession, estimate) -> EstimatePublicRead:
    client_result = await db.execute(
        select(Client).where(Client.id == estimate.client_id)
    )
    client = client_result.scalar_one_or_none()
    if client is None:
        raise HTTPException(
            status_code=404,
            detail="Estimate not found",
        )

    client_name = client.name

    return EstimatePublicRead(
        estimate_number=estimate.estimate_number,
        status=estimate.status,
        client_name=client_name,
        address=estimate.address,
        estimate_title=estimate.estimate_title,
        disclaimer=estimate.disclaimer,

        date_sent=estimate.date_sent,
        signature=estimate.signature,
        signed_date=estimate.signed_date,

        tax_name=estimate.tax_name,
        tax_percentage=estimate.tax_percentage,
        subtotal=estimate.subtotal,
        tax_amount=estimate.tax_amount,
        total=estimate.total,

        items=estimate.items,
    )

# VIEW an estimate by token — no login. Stamps first-view.
@public_router.get("/{token}", response_model=EstimatePublicRead)
async def public_view(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    estimate = await get_estimate_by_token(db, token)
    await mark_first_view(db, estimate)
    return await _build_public_view(db, estimate)

# APPROVE by token — customer signs.
@public_router.post("/{token}/approve", response_model=EstimatePublicRead)
async def public_approve(
    token: str,
    data: EstimateApprove,
    db: AsyncSession = Depends(get_db),
):
    estimate = await get_estimate_by_token(db, token)
    updated = await approve_estimate(db, estimate, data.signature)
    return  await _build_public_view(db, updated)

# REQUEST CHANGES by token — customer sends a message.
@public_router.post("/{token}/request-changes", response_model=EstimatePublicRead)
async def public_request_changes(
    token: str,
    data: EstimateChangeRequest,
    db: AsyncSession = Depends(get_db),
): 
    estimate = await get_estimate_by_token(db, token)
    updated = await request_changes(db, estimate, data.change_request)
    return await _build_public_view(db, updated)

# Download the estimate PDF by token — no login. Same archived/not-found rules.
@public_router.get("/{token}/pdf")
async def public_estimate_pdf(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    estimate = await get_estimate_by_token(db, token)

    if not estimate.pdf_path or not os.path.exists(estimate.pdf_path):
        raise HTTPException(
            status_code=404,
            detail="No PDF for this Estimate",
        )

    return FileResponse(
        estimate.pdf_path,
        media_type="application/pdf",
        filename=os.path.basename(estimate.pdf_path),
    )
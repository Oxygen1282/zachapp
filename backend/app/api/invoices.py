from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import FileResponse, RedirectResponse

from starlette.concurrency import run_in_threadpool

from sqlalchemy.ext.asyncio import AsyncSession 
from sqlalchemy import select
from sqlalchemy.orm import selectinload

import os 

from db.database import get_db

from core.dependencies import require_owner
from core.stripe_config import FRONTEND_BASE_URL

from models.user import User
from models.invoice import Invoice
from models.job import Job

from schemas.invoice import InvoiceCreate, InvoiceRead

from services.stripe_service import create_checkout_session, verify_webhook

from services.invoice_service import (
    create_invoice,
    get_invoices,
    get_invoice_by_id,
    update_invoice,
    delete_invoice,
    send_invoice,
    mark_invoice_paid,
    void_invoice,
    resend_invoice_email,
    handle_successful_payment,
)

router = APIRouter(prefix="/invoices", tags=["invoices"])

# CREATE (draft) — POST /invoices/
@router.post("/", response_model=InvoiceRead)
async def create(
    data: InvoiceCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await create_invoice(db, data)

# Send a draft invoice (assign number, freeze tax, render PDF, lock)
@router.post("/{invoice_id}/send", response_model=InvoiceRead)
async def send(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await send_invoice(db, invoice_id)

# Resend the email for an already-sent invoice (retry delivery / customer
# didn't receive it). Owner-only. Returns the invoice with email_status set.
@router.post("/{invoice_id}/resend-email", response_model=InvoiceRead)
async def resend_email(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await resend_invoice_email(db, invoice_id)

@router.post("/{invoice_id}/paid", response_model=InvoiceRead)
async def mark_paid(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await mark_invoice_paid(db, invoice_id)

@router.post("/{invoice_id}/void", response_model=InvoiceRead)
async def void(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
): 
    return await void_invoice(db, invoice_id)

# LIST — GET /invoices/
@router.get("/", response_model=list[InvoiceRead])
async def list_invoices(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await get_invoices(db)

# READ ONE — GET /invoices/{invoice_id}
@router.get("/{invoice_id}", response_model=InvoiceRead)
async def get_one(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await get_invoice_by_id(db, invoice_id)

# Serve the generated PDF for an invoice so the browser can view/download it.
@router.get("/{invoice_id}/pdf")
async def get_invoice_pdf(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    invoice = await get_invoice_by_id(db, invoice_id)

    # Only sent/paid invoices have a PDF; drafts don't.
    if not invoice.pdf_path or not os.path.exists(invoice.pdf_path):
        raise HTTPException(
            status_code=404, 
            detail="No PDF for this invoice",
        )
    
    # FileResponse streams the file from disk with the right content type.
    # filename= sets the name the browser suggests on download.
    return FileResponse(
        invoice.pdf_path,
        media_type="application/pdf",
        filename=os.path.basename(invoice.pdf_path)
    )

# UPDATE (draft only) — PUT /invoices/{invoice_id}
@router.put("/{invoice_id}", response_model=InvoiceRead)
async def update(
    invoice_id: int,
    data: InvoiceCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await update_invoice(db, invoice_id, data)

# DELETE — DELETE /invoices/{invoice_id}
@router.delete("/{invoice_id}")
async def delete(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await delete_invoice(db, invoice_id)

# ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
#
#                                                       PUBLIC ROUTER
#
# ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# Public, unauthenticated pay surface — the token in the URL is the only
# credential (same model as public estimates). Mounted at /public/invoices.
public_router = APIRouter(prefix="/public/invoices", tags=["invoices-public"])

# The stable pay link. The email's "Pay Now" button points here. On each hit we
# mint a FRESH Stripe checkout session and redirect the customer to it — so the
# emailed link never goes stale even though Stripe sessions expire.
@public_router.get("/{token}/pay")
async def pay_invoice(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    # Look up by token (never by id on a public surface).
    result = await db.execute(select(Invoice).where(Invoice.public_token == token))
    invoice = result.scalar_one_or_none()
    if invoice is None:
        raise HTTPException(
            status_code=404,
            detail="Invoice not found"
        )

    # Don't let a draft be paid (no number/total yet), and don't let an
    # already-paid or void invoice be paid again.
    if invoice.status == "Draft":
        raise HTTPException(
            status_code=400, 
            detail="This invoice isn't ready for payment yet",
        )

    if invoice.status == "Paid":
        # Already paid — send them to a friendly "already paid" page rather than
        # charging again.
        return RedirectResponse(
            url=f"{FRONTEND_BASE_URL}/pay/already-paid",
            status_code=303
        )

    if invoice.status == "VOID":
        raise HTTPException(
            status_code=400,
            detail="This invoice has been voided",
        )

    # Build the summary line and mint a fresh session, then redirect to Stripe.
    # (job_type gives the brand name; load it via the job like the send flow.)
    job_result = await db.execute(
        select(Job).where(Job.id == invoice.job_id).options(selectinload(Job.client))
    )
    job = job_result.scalar_one_or_none()
    brand = job.job_type if job is not None else "Rad Power Washing"

    description = f"Invoice #{invoice.invoice_number} — {brand}"
    checkout_url = await create_checkout_session(invoice, description)

    # 303 redirect sends the customer's browser to Stripe's hosted checkout.
    return RedirectResponse(
        url=checkout_url,
        status_code=303,
    )

# Stripe posts payment events here. NO auth dependency — Stripe isn't logged in;
# the SIGNATURE is the credential (verified inside). This endpoint is the ONLY
# thing that marks an invoice paid — never the redirect.
@public_router.post("/stripe-webhook")
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    # Read the RAW body BEFORE any parsing — signature verification hashes the
    # exact bytes Stripe sent. Parsing first would change them and break the check.
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    # Verify + parse (in a threadpool; the Stripe SDK is sync).
    event = await run_in_threadpool(verify_webhook, payload, sig_header)

    # We only care about completed checkout sessions. Ignore everything else
    # (Stripe sends many event types) with a 200 so Stripe stops retrying them.
    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]

        # Pull the invoice id we stashed in metadata when creating the session.
        metadata = session.metadata.to_dict() if session.metadata else {}
        invoice_id_str = metadata.get("invoice_id")

        if invoice_id_str:
            # Extra safety: only fulfill if the session is actually paid.
            # (payment_status is "paid" on a completed successful session.)
            if session.payment_status == "paid":
                await handle_successful_payment(db, int(invoice_id_str))

    # Always return 200 for events we've handled or intentionally ignore, so
    # Stripe considers delivery successful and stops retrying.
    return {"received": True}
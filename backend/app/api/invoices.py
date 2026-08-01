from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse

from sqlalchemy.ext.asyncio import AsyncSession 

import os 

from db.database import get_db

from core.dependencies import require_owner

from models.user import User

from schemas.invoice import InvoiceCreate, InvoiceRead

from services.invoice_service import (
    create_invoice,
    get_invoices,
    get_invoice_by_id,
    update_invoice,
    delete_invoice,
    send_invoice,
    mark_invoice_paid,
    void_invoice,
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
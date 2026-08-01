from fastapi import APIRouter, Depends 
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db

from core.dependencies import require_owner

from models.user import User

from schemas.job_finances import JobFinancesCreate, JobFinancesUpdate, JobFinancesRead
from services.job_finance_service import (
    create_job_finances,
    get_all_finances,
    get_finances_by_job_id,
    update_job_finances,
    delete_job_finances,
)

router = APIRouter(prefix="/finances", tags=["Finances"])

@router.post("/", response_model=JobFinancesRead)
async def create_finances(
    data: JobFinancesCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
): 
    return await create_job_finances(db, data)

@router.get("/", response_model=list[JobFinancesRead])
async def list_finances(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await get_all_finances(db)

@router.get("/{job_id}", response_model=JobFinancesRead)
async def get_finances(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await get_finances_by_job_id(db, job_id)

@router.put("/{job_id}", response_model=JobFinancesRead)
async def update_finances(
    job_id: int,
    data: JobFinancesUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await update_job_finances(db, job_id, data)

@router.delete("/{job_id}")
async def delete_finances(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await delete_job_finances(db, job_id)

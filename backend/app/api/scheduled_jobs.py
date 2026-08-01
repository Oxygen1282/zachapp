from fastapi import APIRouter, Depends

from sqlalchemy.ext.asyncio import AsyncSession 
from sqlalchemy import select 

from core.dependencies import require_content_manager, get_current_user

from models.user import User

from db.database import get_db 

from schemas.scheduled_job import ScheduledJobCreate, ScheduledJobRead

from services.scheduled_job_service import create_scheduled_job, get_scheduled_jobs, get_scheduled_job_by_id, update_scheduled_job, delete_scheduled_job

router = APIRouter(prefix="/scheduled_jobs", tags=["scheduled_jobs"])

@router.post("/", response_model=ScheduledJobRead)
async def create(
    job: ScheduledJobCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_content_manager),
):
    return await create_scheduled_job(db, job)

@router.get("/", response_model=list[ScheduledJobRead])
async def list_scheduled_jobs(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await get_scheduled_jobs(db)

@router.get("/{job_id}", response_model=ScheduledJobRead)
async def get_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await get_scheduled_job_by_id(db, job_id)

@router.put("/{job_id}", response_model=ScheduledJobRead)
async def update(
    job_id: int,
    job_data: ScheduledJobCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_content_manager),
):
    return await update_scheduled_job(db, job_id, job_data)

@router.delete("/{job_id}")
async def delete(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_content_manager),
):
    return await delete_scheduled_job(db, job_id)
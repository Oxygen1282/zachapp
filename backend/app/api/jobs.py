from fastapi import APIRouter, Depends

from sqlalchemy.ext.asyncio import AsyncSession 

from core.dependencies import require_content_manager, get_current_user

from models.user import User

from sqlalchemy import select

from db.database import get_db

from schemas.job import JobCreate, JobUpdate, JobRead

from services.job_service import create_job, get_jobs, get_job_by_id, update_job_service, delete_job_service

router = APIRouter(prefix="/jobs", tags=["jobs"])

@router.post("/", response_model=JobRead)
async def create(
    job: JobCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_content_manager),
):
    return await create_job(db, job)

@router.get("/", response_model=list[JobRead])
async def list_jobs(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await get_jobs(db)

@router.get("/{job_id}", response_model=JobRead)
async def get_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await get_job_by_id(db, job_id)

@router.put("/{job_id}", response_model=JobRead)
async def update_job(
    job_id: int,
    job_data: JobUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_content_manager),
):
    return await update_job_service(db, job_id, job_data)

@router.delete("/{job_id}")
async def delete_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_content_manager),
):
    return await delete_job_service(db, job_id)
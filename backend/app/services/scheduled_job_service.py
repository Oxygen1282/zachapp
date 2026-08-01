from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from fastapi import HTTPException

from models.scheduled_job import ScheduledJob

from schemas.scheduled_job import ScheduledJobCreate

async def create_scheduled_job(db: AsyncSession, job_data: ScheduledJobCreate) -> ScheduledJob:
    job = ScheduledJob(**job_data.model_dump())
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job 

async def get_scheduled_jobs(db: AsyncSession):
    result = await db.execute(select(ScheduledJob))
    return result.scalars().all()

async def get_scheduled_job_by_id(db: AsyncSession, job_id: int):
    result = await db.execute(
        select (ScheduledJob).where(ScheduledJob.id == job_id)
    )

    job = result.scalar_one_or_none()

    if job is None:
        raise HTTPException(
            status_code=404,
            detail="Job not found"
        )
    
    return job

async def update_scheduled_job(db: AsyncSession, job_id: int, job_data: ScheduledJobCreate):
    result = await db.execute(
        select(ScheduledJob).where(ScheduledJob.id == job_id)
    )

    job = result.scalar_one_or_none()

    if job is None:
        raise HTTPException(
            status_code=404,
            detail="Job not found"
        )
    
    job.job_name = job_data.job_name 
    job.job_comments = job_data.job_comments
    job.employees = job_data.employees

    await db.commit()
    await db.refresh(job)

    return job

async def delete_scheduled_job(db: AsyncSession, job_id: int):
    result = await db.execute(
        select(ScheduledJob).where(ScheduledJob.id == job_id)
    )

    job = result.scalar_one_or_none()

    if job is None:
        raise HTTPException(
            status_code=404,
            detail="Job not found"
        )
    
    await db.delete(job)
    await db.commit()

    return {
        "message": "Job deleted"
    }
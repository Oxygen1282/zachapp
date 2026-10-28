from sqlalchemy.ext.asyncio import AsyncSession 
from sqlalchemy import select, func

from fastapi import HTTPException

from models.job import Job
from models.client import Client 
from models.client_address import ClientAddress
from models.invoice import Invoice
from models.estimate import Estimate

from schemas.job import JobCreate, JobUpdate

from datetime import datetime, timezone

# Compose the structured address fields into one display string. Single place
# that decides address formatting, so the frozen job string and any future
# on-screen rendering stay consistent. Skips the optional line 2 if empty.
def _compose_address(addr: ClientAddress) -> str:
    parts = [addr.street]

    if addr.street_line2: 
        parts.append(addr.street_line2)

    parts.append(f"{addr.city}, {addr.state} {addr.zip}")

    return ", ".join(parts)

# Resolve client_address_id -> a ClientAddress that actually belongs to this
# client, then return its composed string. Guards against picking an address
# that doesn't exist or belongs to a different client.
async def _resolve_frozen_address(db: AsyncSession, client_id: int, client_address_id: int) -> str:
    result = await db.execute(
        select(ClientAddress).where(
            ClientAddress.id == client_address_id,
            ClientAddress.client_id == client_id,
        )
    )
    addr = result.scalar_one_or_none()

    if addr is None:
        raise HTTPException(
            status_code=400,
            detail="Chosen address does not exist for this client",
        )
    
    return _compose_address(addr)

async def create_job(db: AsyncSession, data: JobCreate) -> Job:
    
    # The client must exist.
    client = await db.execute(
        select(Client).where(Client.id == data.client_id)
        )
    if client.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=404,
            detail="Client does not exist"
        )
    
    # Freeze the chosen address into a string
    frozen_address = await _resolve_frozen_address(db, data.client_id, data.client_address_id)

    # Build the job explicitly (not **model_dump()) — the incoming schema has
    # client_address_id, which is NOT a Job column; it's an input we resolved
    # above. So we set fields by hand rather than spreading the payload.
    job = Job(
        client_id=data.client_id,
        address=frozen_address,
        description=data.description,
        job_type=data.job_type,
        status=data.status if data.status else "New",
        last_modified=datetime.now(timezone.utc)
    )

    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job 

async def get_jobs(db: AsyncSession):
    result = await db.execute(
        select(Job).order_by(Job.last_modified.desc().nullslast())
    )
    return result.scalars().all()

async def get_job_by_id(db: AsyncSession, job_id: int):
    result = await db.execute(
        select(Job).where(Job.id == job_id)
    )

    job = result.scalar_one_or_none() 

    if job is None:
        raise HTTPException(
            status_code=404,
            detail="Job not found"
        )
    
    return job

async def update_job_service(db: AsyncSession, job_id: int, data: JobUpdate):

    job = await get_job_by_id(db, job_id)

    job.description = data.description
    job.status = data.status if data.status else "New"

    # Two-way job_type sync: if this job's job_type changed, update any linked
    # estimate(s) to match. A job can have multiple estimates over its life, so
    # update all of them.
    if data.job_type is not None and data.job_type != job.job_type:
        job.job_type = data.job_type 
        est_result = await db.execute(
            select(Estimate).where(Estimate.job_id == job.id)
        )
        for est in est_result.scalars().all():
            est.job_type = data.job_type

    # Only re-resolve/re-freeze the address if a new one was chosen.
    # If client_address_id is None, the job keeps its existing frozen address.
    if data.client_address_id is not None:
        job.address = await _resolve_frozen_address(db, job.client_id, data.client_address_id)

    job.last_modified = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(job)
    return job

async def delete_job_service(db: AsyncSession, job_id: int):
    
    job = await get_job_by_id(db, job_id)

    # Block if any invoice references this job
    invoice_count = await db.execute(
        select(func.count()).select_from(Invoice).where(Invoice.job_id == job_id)
    )
    if invoice_count.scalar_one() > 0:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete a job that has invoices. Delete the invoices first."
        )

    # Unlink any estimates pointing at this job (they revert to job-less).
    result = await db.execute(select(Estimate).where(Estimate.job_id == job_id))
    linked_estimates = result.scalars().all()
    for est in linked_estimates:
        est.job_id = None

    await db.delete(job)
    await db.commit()

    return {
        "message": "Job deleted"
    }
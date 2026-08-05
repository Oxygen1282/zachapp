from sqlalchemy.ext.asyncio import AsyncSession 
from sqlalchemy import select 

from models.job import Job
from models.job_finances import JobFinances
from models.user import User

from schemas.job_finances import JobFinancesCreate, JobFinancesUpdate, EmployeeCostEntryInput

from fastapi import HTTPException

from datetime import datetime, timezone

# Resolve the raw employee-cost inputs into fully-frozen entries.
# For each entry:
#   - If it arrived WITH a rate, it's an existing frozen entry — keep the rate.
#   - If it arrived WITHOUT a rate (None), it's new — look up the employee's
#     current hourly rate and freeze it now.
# In both cases, cost = hours * rate is recomputed server-side (the client's
# cost is never trusted). Returns the list of resolved dicts to store, plus
# the total labor cost.
async def _resolve_employee_entries(db: AsyncSession, entries: list[EmployeeCostEntryInput]): 
    resolved = []
    total_labor = 0.0

    for entry in entries:
        # Look up the user (for name, and for the rate on new entries).
        result = await db.execute(select(User).where(User.id == entry.user_id))
        user = result.scalar_one_or_none()
        if user is None:
            raise HTTPException(
                status_code=400,
                detail=f"User {entry.user_id} does not exist"
            )

        # Freeze-or-keep the rate.
        if entry.rate is not None:
            # Existing entry = keep its frozen rate.
            rate = entry.rate 
        else: 
            # New entry = freeze the employee's current rate
            if user.pay_rate is None:
                raise HTTPException(
                    status_code=400,
                    detail=f"{user.name} has no pay rate set",
                )
            rate = user.pay_rate 

        cost = entry.hours * rate
        total_labor += cost 

        resolved.append({
            "user_id": user.id,
            "name": user.name,      # frozen name for display 
            "hours": entry.hours,
            "rate": rate,           # frozen rate 
            "cost": cost,           # server-computed 
        })

    return resolved, total_labor

async def create_job_finances(db: AsyncSession, data: JobFinancesCreate) -> JobFinances:

    # Check to see if job exists before creating finances
    result = await db.execute(
        select(Job).where(Job.id == data.job_id)
    )

    job = result.scalar_one_or_none()

    if job is None:
        raise HTTPException(
            status_code=404,
            detail="Job does not exist"
        )
    
    # Check if a job already has finances
    existing = await db.execute(
        select(JobFinances).where(JobFinances.job_id == data.job_id)
    )

    existing_finances = existing.scalar_one_or_none()

    if existing_finances:
        raise HTTPException(
            status_code=400,
            detail="Job already has finances"
        )

    # Calculate amount spent on materials and employees
    total_materials = sum(data.materials_out.values())
    resolved_employees, total_labor = await _resolve_employee_entries(db, data.employees_out)

    finances = JobFinances(
        job_id=data.job_id,

        money_in=data.money_in,

        materials_out=data.materials_out,       # dictionary of materials and cost
        employees_out=resolved_employees,       # dictionary of employee names, and labor cost

        total_material_cost=total_materials,    # float of total cost of materials
        total_labor_cost=total_labor,       # float of total cost of employee labor

        job_profit=data.money_in - total_materials - total_labor,

        last_modified=datetime.now(timezone.utc),
    )

    db.add(finances)
    await db.commit()
    await db.refresh(finances)

    return finances

# Return every finance record (used to pupulate the accounting table)
async def get_all_finances(db: AsyncSession):
    result = await db.execute(
        select(JobFinances).order_by(JobFinances.last_modified.desc().nullslast())
    )
    return result.scalars().all()

# Return the finances for a single job
async def get_finances_by_job_id(db: AsyncSession, job_id: int) -> JobFinances:
    result = await db.execute(
        select(JobFinances).where(JobFinances.job_id == job_id)
    )
    finances = result.scalar_one_or_none()

    if finances is None:
        raise HTTPException(
            status_code=404,
            detail="Finances not found for this job"
        )
    
    return finances

# Overwrite a job's finances in one shot, recomputing totals server-side
async def update_job_finances(db: AsyncSession, job_id: int, data: JobFinancesUpdate) -> JobFinances:
    result = await db.execute(
        select(JobFinances).where(JobFinances.job_id == job_id)
    )
    finances = result.scalar_one_or_none()

    if finances is None:
        raise HTTPException(
            status_code=404,
            detail="Finances not found for this job"
        )

    resolved_employees, total_labor = await _resolve_employee_entries(db, data.employees_out)
    
    # Overwrite the editable fields
    finances.money_in = data.money_in
    finances.materials_out = data.materials_out
    finances.employees_out = resolved_employees

    # Recompute totals and profit here so the numbers are always
    # authoritative, regardless of what the client sends
    finances.total_material_cost = sum(data.materials_out.values())
    finances.total_labor_cost = total_labor
    finances.job_profit = finances.money_in - (finances.total_material_cost + finances.total_labor_cost)

    finances.last_modified = datetime.now(timezone.utc)     # stamp on every edit

    await db.commit()
    await db.refresh(finances)

    return finances 

# Delete a job's finances
async def delete_job_finances(db: AsyncSession, job_id: int):
    result = await db.execute(
        select(JobFinances).where(JobFinances.job_id == job_id)
    )
    finances = result.scalar_one_or_none()

    if finances is None:
        raise HTTPException(
            status_code=404,
            detail="Finances not found for this job"
        )
    
    await db.delete(finances)
    await db.commit()

    return {
        "message": "Finances deleted"
    }
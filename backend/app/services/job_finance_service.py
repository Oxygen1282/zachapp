from sqlalchemy.ext.asyncio import AsyncSession 
from sqlalchemy import select 
from models.job import Job
from models.job_finances import JobFinances
from schemas.job_finances import JobFinancesCreate, JobFinancesUpdate
from fastapi import HTTPException

async def create_job_finances(db: AsyncSession, data: JobFinancesCreate) -> JobFinances:

    # Calculate amount spent on materials and employees
    total_materials = sum(data.materials_out.values())
    total_employees = sum(data.employees_out.values())

    overall_profit = data.money_in - (total_employees + total_materials)

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
    

    finances = JobFinances(
        job_id=data.job_id,

        money_in=data.money_in,

        materials_out=data.materials_out,       # dictionary of materials and cost
        employees_out=data.employees_out,       # dictionary of employee names, and labor cost

        total_material_cost=total_materials,    # float of total cost of materials
        total_labor_cost=total_employees,       # float of total cost of employee labor

        job_profit=overall_profit
    )

    db.add(finances)
    await db.commit()
    await db.refresh(finances)

    return finances

# Return every finance record (used to pupulate the accounting table)
async def get_all_finances(db: AsyncSession):
    result = await db.execute(select(JobFinances))
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
    
    # Overwrite the editable fields
    finances.money_in = data.money_in
    finances.materials_out = data.materials_out
    finances.employees_out = data.employees_out

    # Recompute totals and profit here so the numbers are always
    # authoritative, regardless of what the client sends
    finances.total_material_cost = sum(data.materials_out.values())
    finances.total_labor_cost = sum(data.employees_out.values())
    finances.job_profit = finances.money_in - (finances.total_material_cost + finances.total_labor_cost)

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

# # Method to edit money_in
# async def edit_money_in(db: AsyncSession, finances: JobFinances, new_amount: float) -> JobFinances:
#     finances.money_in = new_amount
#     finances.job_profit = finances.money_in - (finances.total_material_cost + finances.total_labor_cost)

#     await db.commit()
#     await db.refresh(finances)
#     return finances

# # Method to edit materials_out
# async def edit_materials(db: AsyncSession, finances: JobFinances, material_name: str, cost: float) -> JobFinances:
#     finances.materials_out[material_name] = cost 
#     finances.total_material_cost = sum(finances.materials_out.values())
#     finances.job_profit = finances.money_in - (finances.total_material_cost + finances.total_labor_cost)

#     await db.commit()
#     await db.refresh(finances)
#     return finances 

# # Method to edit employees_out
# async def edit_employees(db: AsyncSession, finances: JobFinances, employee_name: str, cost: float) -> JobFinances:
#     finances.employees_out[employee_name] = cost 
#     finances.total_labor_cost = sum(finances.employees_out.values())
#     finances.job_profit = finances.money_in - (finances.total_material_cost + finances.total_labor_cost)

#     await db.commit()
#     await db.refresh(finances)
#     return finances
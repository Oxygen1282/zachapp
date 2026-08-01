from sqlalchemy.ext.asyncio import AsyncSession 
from sqlalchemy import select 

from fastapi import HTTPException 

from models.tax_location import TaxLocation
from schemas.tax_location import TaxLocationCreate


async def create_tax_location(db: AsyncSession, data: TaxLocationCreate) -> TaxLocation:

    # Friendly duplicate-name check (the DB constraint is the real guarantee;
    # this returns a clean 400 instead of a raw IntegrityError).
    existing = await db.execute(
        select(TaxLocation).where(TaxLocation.name == data.name)
    )

    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=400,
            detail="A tax location with that name already exists",
        )
    
    location = TaxLocation(
        name=data.name,
        percentage=data.percentage,
    )

    db.add(location)
    await db.commit()
    await db.refresh(location)

    return location 

async def get_tax_locations(db: AsyncSession):
    result = await db.execute(select(TaxLocation))
    return result.scalars().all()

async def get_tax_location_by_id(db: AsyncSession, location_id: int) -> TaxLocation:
    result = await db.execute(
        select(TaxLocation).where(TaxLocation.id == location_id)
    )

    location = result.scalar_one_or_none()

    if location is None:
        raise HTTPException(
            status_code=404,
            detail="Tax location not found",
        )
    
    return location

async def update_tax_location(db: AsyncSession, location_id: int, data: TaxLocationCreate) -> TaxLocation:

    location = await get_tax_location_by_id(db, location_id)

    # Uniqueness check that lets this location keep its own name, but blocks
    # taking a name another location already has (the "Item.id != item_id"
    # self-exclusion pattern from the catalog).

    existing = await db.execute(
        select(TaxLocation).where(
            TaxLocation.name ==data.name,
            TaxLocation.id != location_id,
        )
    )

    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=400,
            detail="A tax location with that name already exists",
        )
    
    # Editing a rate (your requirement: taxes change over the years) is just
    # overwriting percentage here. Note this changes the location's CURRENT
    # rate for future invoices and drafts — invoices already SENT kept their
    # frozen copy, so they're unaffected.
    location.name = data.name 
    location.percentage = data.percentage

    await db.commit()
    await db.refresh(location)

    return location 

async def delete_tax_location(db: AsyncSession, location_id: int):

    location = await get_tax_location_by_id(db, location_id)

    # Hard delete — safe because every sent invoice froze its own copy of the
    # name + percentage, so removing this row never touches invoice history.
    await db.delete(location)
    await db.commit()

    return {
        "message": "Tax location deleted"
    }

# Compose a "name (percentage%)" label the way it appears on the invoice
# summary, e.g. "Cuyahoga County (8.0%)". Handy for the picker and the PDF.
def format_tax_label(location: TaxLocation) -> str:
    return f"{location.name} ({location.percentage}%)"
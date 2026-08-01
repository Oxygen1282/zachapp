from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession 

from db.database import get_db

from core.dependencies import require_owner

from models.user import User

from schemas.tax_location import TaxLocationCreate, TaxLocationRead
from services.tax_location_service import (
    create_tax_location,
    get_tax_locations,
    get_tax_location_by_id,
    update_tax_location,
    delete_tax_location,
)

router = APIRouter(prefix="/tax_locations", tags=["tax_locations"])

@router.post("/", response_model=TaxLocationRead)
async def create(
    data: TaxLocationCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
): 
    return await create_tax_location(db, data)

@router.get("/", response_model=list[TaxLocationRead])
async def list_tax_locations(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await get_tax_locations(db)

@router.get("/{locations_id}", response_model=TaxLocationRead)
async def get_one(
    location_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await get_tax_location_by_id(db, location_id)

@router.put("/{location_id}", response_model=TaxLocationRead)
async def update(
    location_id: int,
    data: TaxLocationCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await update_tax_location(db, location_id, data)

@router.delete("/{location_id}")
async def delete(
    location_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await delete_tax_location(db, location_id)
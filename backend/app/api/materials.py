from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession 

from db.database import get_db

from core.dependencies import require_owner

from models.user import User

from schemas.material import MaterialCreate, MaterialRead
from services.material_service import (
    create_material,
    get_materials,
    get_material_by_id,
    update_material,
    delete_material,
)

router = APIRouter(prefix="/materials", tags=["materials"])

@router.post("/", response_model=MaterialRead)
async def create(
    data: MaterialCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await create_material(db, data)

@router.get("/", response_model=list[MaterialRead])
async def list_materials(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await get_materials(db)

@router.get("/{material_id}", response_model=MaterialRead)
async def get_one(
    material_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await get_material_by_id(db, material_id)

@router.put("/{material_id}", response_model=MaterialRead)
async def update(
    material_id: int,
    data: MaterialCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
): 
    return await update_material(db, material_id, data)

@router.delete("/{material_id}")
async def delete(
    material_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
): 
    return await delete_material(db, material_id)
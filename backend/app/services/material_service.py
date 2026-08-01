from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select 

from fastapi import HTTPException

from models.material import Material
from schemas.material import MaterialCreate

async def create_material(db: AsyncSession, data: MaterialCreate) -> Material:

    # Friendly duplicate-name check (DB constraint is the real guarantee).
    existing = await db.execute(
        select(Material).where(Material.name == data.name)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=400,
            detail="A material with that name already exists",
        )
    
    material = Material(name=data.name)
    db.add(material)
    await db.commit()
    await db.refresh(material)
    return material 

async def get_materials(db: AsyncSession):
    result = await db.execute(select(Material))
    return result.scalars().all()

async def get_material_by_id(db: AsyncSession, material_id: int) -> Material:
    result = await db.execute(
        select(Material).where(Material.id == material_id)
    )
    material = result.scalar_one_or_none()

    if material is None:
        raise HTTPException(
            status_code=404,
            detail="Material not found",
            )
    return material 

async def update_material(db: AsyncSession, material_id: int, data: MaterialCreate):
    
    material = await get_material_by_id(db, material_id)

    # Self-excluding uniqueness: allow keeping its own name, block taking another's.
    existing = await db.execute(
        select(Material).where(
            Material.name == data.name,
            Material.id != material_id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=400,
            detail="A material with that name already exists",
        )
    
    material.name = data.name
    await db.commit()
    await db.refresh(material)
    return material 

async def delete_material(db: AsyncSession, material_id: int) :

    material = await get_material_by_id(db, material_id)

    # Hard delete — safe. finances' materials_out copied the name as a dict key,
    # so removing a catalog material never touches existing finance records.
    await db.delete(material)
    await db.commit()

    return {
        "message": "Material deleted"
    }
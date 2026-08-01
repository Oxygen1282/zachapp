from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession 

from core.dependencies import require_content_manager, get_current_user

from models.user import User

from db.database import get_db 
from schemas.client import ClientCreate, ClientRead 
from services.client_service import (
    create_client, 
    get_clients,
    get_client_by_id, 
    update_client, 
    delete_client,
)

router = APIRouter(prefix = "/clients", tags=["clients"])

@router.post("/", response_model=ClientRead)
async def create(
    data: ClientCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_content_manager),     # <-- gaurd
):
    return await create_client(db, data)

@router.get("/", response_model=list[ClientRead])
async def list_clients(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),    # <-- just authenticated, any role
):
    return await get_clients(db)

@router.get("/{client_id}", response_model=ClientRead)
async def get_one(
    client_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await get_client_by_id(db, client_id)

@router.put("/{client_id}", response_model=ClientRead)
async def update(
    client_id: int,
    data: ClientCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_content_manager), 
):
    return await update_client(db, client_id, data)

@router.delete("/{client_id}")
async def delete(
    client_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_content_manager),
):
    return await delete_client(db, client_id)
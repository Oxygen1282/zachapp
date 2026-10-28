from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db 

from core.dependencies import get_current_user, require_owner

from models.user import User

from schemas.notification import NotificationRead, OwnerMesageCreate

from services.notification_service import (
    get_notifications_for_user,
    mark_notification_read,
    mark_all_read,
    create_owner_message,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])

# LIST — role-aware. Any authenticated user; the service filters by role.
@router.get("/", response_model=list[NotificationRead])
async def list_notifications(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await get_notifications_for_user(db, user)

# Mark ONE read.
@router.post("/{notification_id}/read")
async def read_one(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await mark_notification_read(db, notification_id, user)

# Mark ALL of the caller's visible notifications read.
@router.post("/read-all")
async def read_all(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await mark_all_read(db, user)

# Owner broadcasts a message to everyone.
@router.post("/owner-message", response_model=NotificationRead)
async def owner_message(
    data: OwnerMesageCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await create_owner_message(db, data.message)
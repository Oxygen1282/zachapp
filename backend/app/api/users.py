from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db

from core.dependencies import require_owner, require_content_manager, get_current_user

from models.user import User

from schemas.user import UserCreate, UserRead, LoginRequest, TokenResponse, UserUpdate, DeleteUserRequest, UserAssignable
from schemas.timesheet import TimesheetRead

from services.timesheet_service import get_user_timesheets
from services.user_service import (
    create_user,
    login,
    get_all_users,
    get_user_by_id,
    update_user,
    set_user_active,
    delete_user,
    get_assignable_users,
)

router = APIRouter(prefix="/users", tags=["users"])

@router.post("/", response_model=UserRead)
async def create(
    data: UserCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await create_user(db, data)

@router.post("/login", response_model=TokenResponse)
async def login_route(
    data: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    return await login(db, data)

# List all users — Owner + Manager (Manager needs it to pick whose timesheets to edit).
@router.get("/", response_model=list[UserRead])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_content_manager)
):
    return await get_all_users(db)

# Assignable users (active Employees + Managers) — any logged-in user, for
# assignment dropdowns and displaying assigned names on the calendar.
@router.get("/assignable", response_model=list[UserAssignable])
async def assignable_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await get_assignable_users(db)

@router.get("/{user_id}", response_model=UserRead)
async def get_one_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_content_manager),
):
    return await get_user_by_id(db, user_id)

# Edit a user incl. pay — Owner only.
@router.put("/{user_id}", response_model=UserRead)
async def edit_user(
    user_id: int,
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
): 
    return await update_user(db, user_id, data)

# Deactivate / reactivate — Owner only.
@router.post("/{user_id}/deactivate", response_model=UserRead)
async def deactivate_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
): 
    return await set_user_active(db, user_id, False)

@router.post("/{user_id}/reactivate", response_model=UserRead)
async def reactivate_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
): 
    return await set_user_active(db, user_id, True)

# Password-gated hard delete — Owner only. The owner is the CURRENT user, so we
# take them from the token to re-verify their password.
@router.post("/{user_id}/delete")
async def hard_delete_user(
        user_id: int,
        data: DeleteUserRequest,
        db: AsyncSession = Depends(get_db),
        owner: User = Depends(require_owner),
): 
    return await delete_user(db, user_id, owner, data)

# An employee's timesheets — Owner + Manager (for review/editing).
@router.get("/{user_id}/timesheets", response_model=list[TimesheetRead])
async def user_timesheets(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_content_manager),
):
    return await get_user_timesheets(db, user_id)
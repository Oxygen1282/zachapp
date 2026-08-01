from fastapi import Depends, HTTPException, Header 
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select 

from db.database import get_db
from models.user import User
from core.security import decode_access_token, can_manage_content, is_owner

# Extract the current user from the Authorization header. This is the "who am I"
# dependency — every protected endpoint depends on this (directly or via a guard).
async def get_current_user(
        authorization: str = Header(None),
        db: AsyncSession = Depends(get_db)
) -> User:
    # The header looks like "Bearer <token>". Missing or malformed -> 401.
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Not authenticated",
        )

    token = authorization.split(" ", 1)[1]

    try: 
        payload = decode_access_token(token)
    except ValueError:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=401, 
            detail="Invalid token",
        )

    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=401,
            detail="User no longer exists",
        )

    return user 

# Guard: requires Owner OR Manager (content-editing tier).
# Use on create/edit endpoints for clients, jobs, calendar, timesheet-edits.
async def require_content_manager(current_user: User = Depends(get_current_user)) -> User:
    if not can_manage_content(current_user.permissions):
        raise HTTPException(
            status_code=403,
            detail="Not authorized",
        )
    return current_user 

# Guard: requires Owner ONLY.
# Use on accounting, invoices, and user-management endpoints.
async def require_owner(current_user: User = Depends(get_current_user)) -> User:
    if not is_owner(current_user.permissions):
        raise HTTPException(
            status_code=403,
            detail="Not authorized",
        )
    return current_user
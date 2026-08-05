from sqlalchemy.ext.asyncio import AsyncSession 
from sqlalchemy import select 
from fastapi import HTTPException

from models.user import User 
from schemas.user import UserCreate, LoginRequest, UserUpdate, DeleteUserRequest
from core.security import hash_password, verify_password, create_access_token

async def create_user(db: AsyncSession, data: UserCreate) -> User:
    # Reject duplicate email.
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=400,
            detail="A user with that email already exists",
        )
    
    user = User(
        name=data.name,
        permissions=data.permissions,
        email=data.email,
        password_hash=hash_password(data.password),     # hash HERE, never store plaintext
        pay_type=data.pay_type,
        pay_rate=data.pay_rate,
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user 

async def login(db: AsyncSession, data: LoginRequest):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    # Same error whether the email doesn't exist OR the password is wrong —
    # don't reveal which. Telling an attacker "that email exists but wrong
    # password" leaks who has accounts.
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    # Deactivated users cannot log in.
    if not user.is_active:
        raise HTTPException(
            status_code=403,
            detail="This account has been deactivated",
        )
    
    token = create_access_token(user.id, user.permissions)
    return {
        "access_token": token,
        "token_type": "bearer",
        "permissions": user.permissions,
        "name": user.name,
    }

async def get_all_users(db: AsyncSession):
    result = await db.execute(select(User))
    return result.scalars().all()

async def get_user_by_id(db: AsyncSession, user_id: int) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=404,
            detail="User Not Found",
        )
    return user 

async def update_user(db: AsyncSession, user_id: int, data: UserUpdate) -> User:
    user = await get_user_by_id(db, user_id)

    # Reject an email collision with a DIFFERENT user.
    existing = await db.execute(
        select(User).where(User.email == data.email, User.id != user_id)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=400, 
            detail="A user with that email already exists"
        )

    user.name = data.name 
    user.permissions = data.permissions 
    user.email = data.email 
    user.pay_type = data.pay_type
    user.pay_rate = data.pay_rate 

    # Only change the password if a new one was provided; blank = keep current.
    if data.password:
        user.password_hash = hash_password(data.password)

    await db.commit()
    await db.refresh(user)
    return user 

async def set_user_active(db: AsyncSession, user_id: int, active: bool) -> User:
    user = await get_user_by_id(db, user_id)

    # Owners are always active — they can't be locked out of their own system.
    if user.permissions == "Owner" and not active:
        raise HTTPException(
            status_code=400,
            detail="Owner accounts cannot be deactivated",
        )
    user.is_active = active 
    await db.commit()
    await db.refresh(user)
    return user 

async def delete_user(db: AsyncSession, user_id: int, owner: User, data: DeleteUserRequest):
    # Re-verify the OWNER's own password — a re-authentication gate on this
    # irreversible action (which cascade-deletes the user's timesheet history).
    if not verify_password(data.password, owner.password_hash):
        raise HTTPException(
            status_code=403,
            detail="Incorrect Password",
        )

    user = await get_user_by_id(db, user_id)

    # Guard: don't let an owner delete themselves.
    if user.id == owner.id:
        raise HTTPException(
            status_code=400,
            detail="You cannot delete your own account"
        )

    await db.delete(user)   # cascade remove their timesheets
    await db.commit()
    return {
        "message": "User Deleted"
    }

# Active Employees + Managers, for assignment dropdowns and name display.
# Any logged-in user can call this (employees need it to see who's assigned),
# so it returns only id + name + permissions — no pay, email, or hash.

async def get_assignable_users(db: AsyncSession):
    result = await db.execute(
        select(User).where(
            User.is_active == True,
            User.permissions.in_(["Employee", "Manager"]),
        )
    )

    return result.scalars().all()
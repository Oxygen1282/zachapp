from fastapi import APIRouter, Depends 

from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db

from models.user import User 

from schemas.timesheet import TimesheetRead, TimesheetUpdate, TimesheetDeleteRequest

from core.dependencies import get_current_user, require_content_manager, require_owner

from services.timesheet_service import (
    clock_in,
    clock_out,
    start_break,
    end_break,
    get_my_timesheets,
    get_current_shift,
    update_timesheet,
    delete_timesheet,
)

router = APIRouter(prefix="/timesheets", tags=["timesheets"])

# ----- Clock actions: no body, act on the current user -----

@router.post("/clock-in", response_model=TimesheetRead)
async def clock_in_route(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await clock_in(db, current_user)

@router.post("/clock-out", response_model=TimesheetRead)
async def clock_out_route(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await clock_out(db, current_user)

@router.post("/break-start", response_model=TimesheetRead)
async def break_start_route(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await start_break(db, current_user)

@router.post("/break-end", response_model=TimesheetRead)
async def break_end_route(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await end_break(db, current_user)

# ----- Reads -----

@router.get("/me", response_model=list[TimesheetRead])
async def my_timesheets_route(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await get_my_timesheets(db, current_user)

# The current open shift, or null if not clocked in. response_model allows None.
@router.get("/current", response_model=TimesheetRead | None)
async def current_shift_route(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await get_current_shift(db, current_user)

# Edit a completed shift (fix forgotten clock-in/out) — Owner + Manager.
@router.put("/{timesheet_id}", response_model=TimesheetRead)
async def edit_timesheet(
    timesheet_id: int,
    data: TimesheetUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_content_manager),
):
    return await update_timesheet(db, timesheet_id, data)

# Password-gated delete of a timesheet (e.g. a dishonest clock-in) — Owner only.
@router.post("/{timesheet_id}/delete")
async def delete_timesheet_route(
    timesheet_id: int,
    data: TimesheetDeleteRequest,
    db: AsyncSession = Depends(get_db),
    owner: User = Depends(require_owner),
):
    return await delete_timesheet(db, timesheet_id, owner, data)
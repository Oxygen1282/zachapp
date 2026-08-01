from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from datetime import datetime, timezone 

from fastapi import HTTPException

from models.timesheet import Timesheet
from models.user import User 

from schemas.timesheet import TimesheetUpdate, TimesheetDeleteRequest

from core.security import verify_password

# ---------------------------------------------------------------------------
# Helper: find the user's currently-open shift (clocked in, not yet out).
# Returns the Timesheet or None. "Open" = clock_out is null.
# ---------------------------------------------------------------------------
async def _get_open_shift(db: AsyncSession, user_id: int) -> Timesheet | None:
    result = await db.execute(
        select(Timesheet).where(
            Timesheet.user_id == user_id,
            Timesheet.clock_out.is_(None),
        )
    )
    return result.scalar_one_or_none()

# Whole minutes between two datetimes.
def _minutes_between(start: datetime, end: datetime) -> int:
    return int((end - start).total_seconds() // 60)

# ---------------------------------------------------------------------------
# Clock in: create a new open shift for the user.
# ---------------------------------------------------------------------------
async def clock_in(db: AsyncSession, user: User) -> Timesheet:

    # Owners don't clock in (their pay isn't hourly).
    if user.permissions == "Owner":
        raise HTTPException(
            status_code=403,
            detail="Owners do not clock in"
        )

    # No double clock-in: if there's already an open shift, refuse.
    existing = await _get_open_shift(db, user.id)
    if existing is not None:
        raise HTTPException(
            status_code=400,
            detail="You are already clocked in"
        )

    now = datetime.now(timezone.utc)

    shift = Timesheet(
        user_id=user.id,
        date=now.date(),        # clock-in date
        clock_in=now,
        break_time=0,           # starts at zero, accumulates as breaks end
    )
    db.add(shift)
    await db.commit()
    await db.refresh(shift)
    return shift 

# ---------------------------------------------------------------------------
# Start a break: stamp break_start on the open shift. Clears any previous
# break_end so break_start/break_end represent the CURRENT break's timer.
# ---------------------------------------------------------------------------
async def start_break(db: AsyncSession, user: User) -> Timesheet:

    shift = await _get_open_shift(db, user.id)
    if shift is None: 
        raise HTTPException(
            status_code=400,
            detail="You are not clocked in"
        )

     # Already on a break? (break_start set, break_end null) -> refuse.
    if shift.break_start is not None and shift.break_end is None:
        raise HTTPException(
            status_code=400,
            detail="You are already on a break"
        )

    now = datetime.now(timezone.utc)
    shift.break_start = now 
    shift.break_end = None      # clear the previous break's end; this is a new break

    await db.commit()
    await db.refresh(shift)
    return shift

# ---------------------------------------------------------------------------
# End a break: stamp break_end, add this break's duration to break_time.
# ---------------------------------------------------------------------------
async def end_break(db: AsyncSession, user: User) -> Timesheet:

    shift = await _get_open_shift(db, user.id)
    if shift is None:
        raise HTTPException(
            status_code=400,
            detail="You are not clocked in"
        )

    # Must be on a break to end one.
    if shift.break_start is None or shift.break_end is not None:
        raise HTTPException(
            status_code=400,
            detail="You are not on a break"
        )

    shift.break_end = datetime.now(timezone.utc)

    # Add THIS break's duration onto the running total
    this_break = _minutes_between(shift.break_start, shift.break_end)
    shift.break_time = shift.break_time + this_break

    await db.commit()
    await db.refresh(shift)
    return shift 

# ---------------------------------------------------------------------------
# Clock out: close the shift, compute payable time.
# ---------------------------------------------------------------------------
async def clock_out(db: AsyncSession, user: User) -> Timesheet:

    shift = await _get_open_shift(db, user.id)
    if shift is None:
        raise HTTPException(
            status_code=400,
            detail="You are not clocked in"
        )

    # Can't clock out mid-break -- end the break first
    if shift.break_start is not None and shift.break_end is None:
        raise HTTPException(
            status_code=400,
            detail="End your break before clocking out"
        )

    now = datetime.now(timezone.utc)
    shift.clock_out = now 

    # payable = total shift minutes - accumulated break minutes.
    total = _minutes_between(shift.clock_in, now)
    shift.payable_time = total - shift.break_time 

    await db.commit()
    await db.refresh(shift)
    return shift 

# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------

# The user's own shifts, most recent first.
async def get_my_timesheets(db: AsyncSession, user: User):
    result = await db.execute(
        select(Timesheet)
        .where(Timesheet.user_id == user.id)
        .order_by(Timesheet.clock_in.desc())
    )
    return result.scalars().all()

# The user's current OPEN shift, or None. Lets the UI know what state to show.
async def get_current_shift(db: AsyncSession, user: User) -> Timesheet | None:
    return await _get_open_shift(db, user.id)

# An employee's shifts, newest first — for the owner/manager to review.
async def get_user_timesheets(db: AsyncSession, user_id: int):
    result = await db.execute(
        select(Timesheet)
        .where(Timesheet.user_id == user_id)
        .order_by(Timesheet.clock_in.desc())
    )
    return result.scalars().all()

# Edit a COMPLETED shift (fix a forgotten clock-in/out). Recomputes payable_time
# from the corrected times — the client's numbers are never trusted.
async def update_timesheet(db: AsyncSession, timesheet_id: int, data: TimesheetUpdate) -> Timesheet:

    result = await db.execute(select(Timesheet).where(Timesheet.id == timesheet_id))
    shift = result.scalar_one_or_none()

    if shift is None:
        raise HTTPException(
            status_code=404,
            detail="Timesheet not found"
        )

    # Only completed shifts are editable — not one someone's currently clocked into.
    if shift.clock_out is None:
        raise HTTPException(status_code=400, detail="Cannot edit an open shift")

    # Basic sanity: clock_out must be after clock_in, break can't be negative.
    if data.clock_out <= data.clock_in:
        raise HTTPException(
            status_code=400,
            detail="Clock-Out must be after Clock-In",
        )

    if data.break_time < 0: 
        raise HTTPException(
            status_code=400,
            detail="Break time cannot be negative",
        )

    shift.clock_in = data.clock_in
    shift.clock_out = data.clock_out 
    shift.break_time = data.break_time 
    shift.date = data.clock_in.date()       # keep the date in sync with clock-in 

    # Recompute payable_time server-side from the corrected values.
    total = _minutes_between(data.clock_in, data.clock_out)
    payable = total - data.break_time 

    # Guard: break can't exceed the shift length (would make payable negative).
    if payable < 0:
        raise HTTPException(
            status_code=400, 
            detail="Break time exceeds shift length",
        )

    shift.payable_time = payable 

    await db.commit()
    await db.refresh(shift)
    return shift 

async def delete_timesheet(db: AsyncSession, timesheet_id: int, owner: User, data: TimesheetDeleteRequest):

    # Re-verify the owner's own password — re-authentication gate on this
    # irreversible deletion (e.g. removing a dishonest clock-in).
    if not verify_password(data.password, owner.password_hash):
        raise HTTPException(
            status_code=403,
            detail="Incorrect Password"
        )

    result = await db.execute(select(Timesheet).where(Timesheet.id == timesheet_id))
    shift = result.scalar_one_or_none()

    if shift is None:
        raise HTTPException(
            status_code=404, 
            detail="Timesheet not found",
        )

    await db.delete(shift)
    await db.commit()
    return {
        "message": "Timesheet Deleted"
    }
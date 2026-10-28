from sqlalchemy.ext.asyncio import AsyncSession 
from sqlalchemy import select, update 

from fastapi import HTTPException

from datetime import datetime, timezone 

from models.notification import Notification
from models.notification_read import NotificationRead as ReadRecipt
from models.client import Client 

from core.security import is_owner

# ---------------------------------------------------------------------------
# Core writer
# ---------------------------------------------------------------------------
# Low-level create. Every message-builder funnels through this. It does NOT
# commit — it just stages the row. Builders called from INSIDE another service
# (approve_estimate, clock_in, mark_invoice_paid, ...) rely on that caller's
# commit, so the notification lands in the SAME transaction as the event that
# triggered it (if the event rolls back, so does its notification). Standalone
# callers (the owner-message endpoint) commit themselves.
async def create_notification(db: AsyncSession, type: str, message: str, audience: str) -> Notification:
    notification = Notification(
        time=datetime.now(timezone.utc),
        type=type,
        notification_message=message,
        audience=audience,
    )
    db.add(notification)
    return notification

# Look up the client name for an estimate's message. The estimate service's
# approve/request/first-view functions don't have the client loaded, so the
# estimate builders fetch it here (this is the "data specific to the estimate"
# the message needs).
async def _estimate_client_name(db: AsyncSession, estimate) -> str:
    result = await db.execute(select(Client).where(Client.id == estimate.client_id))
    client = result.scalar_one_or_none()
    if client is None:
        raise HTTPException(
            status_code=404,
            detail="Client not found"
        )

    return client.name 

# ---------------------------------------------------------------------------
# Message builders — one per trigger. Each formats the frozen string and
# stages the notification (no commit). Owner-only unless noted.
#
# Note on the two shapes below: builders that must LOOK UP data they don't
# already hold (the estimate builders, which fetch the client) guard that
# lookup. Builders that RECEIVE an already-loaded, already-validated object
# from their caller (clock-in's user; the invoice builders' invoice +
# client_name) do NOT re-query — the caller holds valid objects, so a re-fetch
# would be a redundant round-trip guarding an impossible case.
# ---------------------------------------------------------------------------

# Timesheets: an employee/manager clocked in. (Owners never clock in.)
# Receives the caller's already-authenticated User — no re-query needed.
async def notify_clock_in(db: AsyncSession, user) -> None:
    message = f"{user.name} clocked in."
    await create_notification(db, "Timesheets", message, "owner")

# Estimates: customer opened the estimate link for the first time.
async def notify_estimate_first_view(db: AsyncSession, estimate) -> None:
    client_name = await _estimate_client_name(db, estimate)
    number = estimate.estimate_number[4:] if estimate.estimate_number else "—"
    message = f"Est #{number}: {client_name} opened the estimate."
    await create_notification(db, "Estimates", message, "owner")

# Estimates: customer approved (signed).
async def notify_estimate_approved(db: AsyncSession, estimate) -> None:
    client_name = await _estimate_client_name(db, estimate)
    number = estimate.estimate_number[4:] if estimate.estimate_number else "—"
    message = f"Est #{number}: {client_name} approved the estimate."
    await create_notification(db, "Estimates", message, "owner")

# Estimates: customer requested changes.
async def notify_estimate_change_request(db: AsyncSession, estimate) -> None:
    client_name = await _estimate_client_name(db, estimate)
    number = estimate.estimate_number[4:] if estimate.estimate_number else "—"
    message = f"Est #{number}: {client_name} requested changes."
    await create_notification(db, "Estimates", message, "owner")

# Invoices: opened for the first time. The invoice service loads the client
# (job -> client) at the call site and passes the name in — no re-query here.
async def notify_invoice_first_view(db: AsyncSession, invoice, client_name: str) -> None:
    number = invoice.invoice_number if invoice.invoice_number else "—"
    message = f"Invoice #{number}: {client_name} opened the invoice."
    await create_notification(db, "Invoices", message, "owner")

# Invoices: marked paid. client_name passed in from the caller (same as above).
async def notify_invoice_paid(db: AsyncSession, invoice, client_name: str) -> None:
    number = invoice.invoice_number if invoice.invoice_number else "—"
    message = f"Invoice #{number}: {client_name}'s paid the invoice."
    await create_notification(db, "Invoices", message, "owner")

# ---------------------------------------------------------------------------
# Owner broadcast (standalone — commits itself)
# ---------------------------------------------------------------------------
async def create_owner_message(db: AsyncSession, message: str) -> Notification:
    text = (message or "").strip()
    if text == "":
        raise HTTPException(
            status_code=400,
            detail="Message cannot be empty"
        )

    notification = await create_notification(db, "Owner Message", text, "all")
    await db.commit()
    await db.refresh(notification)
    notification.is_read = False        # newly created-> unread for everyone
    return notification

# ---------------------------------------------------------------------------
# Reads + read-state (now per-user via the notification_reads join table)
# ---------------------------------------------------------------------------

# Role-aware list, newest first, with is_read computed FOR THIS USER.
# Owner sees everything; everyone else sees only broadcast ("all") messages.
async def get_notifications_for_user(db: AsyncSession, user):
    stmt = select(Notification).order_by(Notification.time.desc())
    if not is_owner(user.permissions):
        stmt = stmt.where(Notification.audience == "all")
    result = await db.execute(stmt)
    notifications = result.scalars().all()

    # One query for THIS user's read-rows, then mark each notification.
    read_result = await db.execute(
        select(ReadRecipt.notification_id).where(ReadRecipt.user_id == user.id)
    )
    read_ids = set(read_result.scalars().all())

    # Attach a computed is_read per notification. Pydantic (from_attributes)
    # reads this attribute off the ORM object when serializing.
    for n in notifications:
        n.is_read = n.id in read_ids

    return notifications

# Return True if this user may see this notification (owner sees all; others
# only broadcasts). Shared by the read endpoints so visibility rules live once.
def _user_can_see(notification, user) -> bool:
    if is_owner(user.permissions):
        return True 
    return notification.audience == "all"

# Mark ONE read FOR THIS USER — insert a read-row if none exists. Idempotent:
# re-reading is a no-op. Non-owners can't mark (or probe) an owner-only row —
# it 404s like a nonexistent one.
async def mark_notification_read(db: AsyncSession, notification_id: int, user):
    result = await db.execute(select(Notification).where(Notification.id == notification_id))
    notification = result.scalar_one_or_none()

    if notification is None or not _user_can_see(notification, user):
        raise HTTPException(
            status_code=404,
            detail="Notification not found",
        )

    # Already read? Nothing to do.
    existing = await db.execute(
        select(ReadRecipt).where(
            ReadRecipt.notification_id == notification_id,
            ReadRecipt.user_id == user.id,
        )
    )

    if existing.scalar_one_or_none() is None:
        db.add(ReadRecipt(notification_id=notification_id, user_id=user.id))
        await db.commit()

    return {
        "message": "Notification marked read"
    }

# Mark ALL of the caller's VISIBLE notifications read FOR THIS USER — insert a
# read-row for each visible notification the user hasn't already read.
async def mark_all_read(db: AsyncSession, user) -> dict:
    stmt = select(Notification.id)
    if not is_owner(user.permissions):
        stmt = stmt.where(Notification.audience == "all")
    visible_result = await db.execute(stmt)
    visible_ids = set(visible_result.scalars().all())

    read_result = await db.execute(
        select(ReadRecipt.notification_id).where(ReadRecipt.user_id == user.id)
    )
    already_read = set(read_result.scalars().all())

    to_add = visible_ids - already_read
    for notification_id in to_add:
        db.add(ReadRecipt(notification_id=notification_id, user_id=user.id))

    if to_add:
        await db.commit()

    return {
        "message": "All notifications marked read"
    }
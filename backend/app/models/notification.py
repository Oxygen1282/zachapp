from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime
from db.database import Base
from datetime import datetime, timezone

# A single entry in the notification center. One row per event. Deliberately
# flat: the message is FROZEN (pre-formatted) at creation, so editing a client's
# name later never rewrites old notifications — same snapshot principle used on
# invoice/estimate lines and frozen tax.
class Notification(Base):

    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)

    # When the event happened. Indexed because the center orders by recency
    # (newest first) — the index keeps that sort fast as the table grows.
    time = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True)

    # One of: "Estimates", "Invoices", "Timesheets", "Owner Message".
    # Stored as a plain string; the allowed set is enforced in the service
    # (like job_type / due_type elsewhere), not as a DB enum.
    type = Column(String, nullable=False)

    # The fully-formatted line shown in the table (e.g.
    # "Est #449: Dan Surelle requested changes."). Built by a message-builder
    # helper from event data. Text (not String) since some run long.
    notification_message = Column(Text, nullable=False)

    # Who may see this:
    #   "owner" -> owner-only (clock-ins, estimate/invoice activity, payments)
    #   "all"   -> everyone (owner broadcast messages)
    # The list endpoint filters by the viewer's role against this.
    audience = Column(String, nullable=False, default="owner")
from sqlalchemy import Column, Integer, ForeignKey, UniqueConstraint
from db.database import Base 

# Per-user read state. A row here means "this user has read this notification."
# No row = unread for that user. Read-ness is now a property of the
# (notification, user) PAIR, not of the notification itself — so employee 1
# reading a broadcast leaves it unread for employee 2.
class NotificationRead(Base):

    __tablename__ = "notification_reads"

    id = Column(Integer, primary_key=True, index=True)

    # Which notification was read. Cascade: if the notification is deleted, its
    # read-rows go with it.
    notification_id = Column(
        Integer, 
        ForeignKey("notifications.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Who read it. Cascade: if the user is deleted, their read-rows go too
    # (matches how the user's timesheets cascade).
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # A user reads a given notification at most once — one row per pair. This
    # makes "mark read" idempotent at the DB level.
    __table_args__ = (
        UniqueConstraint("notification_id", "user_id", name="uq_notification_user"),
    )
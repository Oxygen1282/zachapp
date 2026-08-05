from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.orm import relationship 

from db.database import Base 

from datetime import datetime, timezone

# The top-level entity. A client owns many jobs and many addresses.
# Name/phone/email live here now (they moved off Job) — they're facts about
# the person, not about a specific job.
class Client(Base):

    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)

    # When this record was last created/edited — used to sort lists by
    # most-recently-interacted. Updated on every save.
    last_modified = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # The client's list of saved addresses (the pick-list a Job chooses from).
    # One-to-many: deleting a client removes its addresses too.
    addresses = relationship(
        "ClientAddress",
        back_populates="client",
        cascade="all, delete-orphan",
    )

    # A client's jobs. Same one-to-many shape. We DON'T cascade-delete jobs
    # here by default — see the note below on why deleting a client with jobs
    # is a decision, not an automatic wipe.
    jobs = relationship(
        "Job",
        back_populates="client",
    )
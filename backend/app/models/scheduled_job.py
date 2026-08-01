from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.dialects.postgresql import JSONB 
from sqlalchemy.ext.mutable import MutableList 
from db.database import Base

class ScheduledJob(Base):
    __tablename__ = "scheduled_jobs"

    id = Column(Integer, primary_key=True, index=True)

    job_name = Column(String, nullable=False)
    job_comments = Column(Text, nullable=True)

    job_start_date = Column(DateTime(timezone=True), nullable=False)
    job_end_date = Column(DateTime(timezone=True), nullable=False)

    # A plain list of assigned employee names, e.g. ["Dan", "Sarah"].
    # JSONB list (not a dict) since we're only tracking WHO is assigned, not
    # any per-employee value. MutableList so in-place changes are tracked.
    # (Temporary approach — becomes a proper employee dropdown when Users lands.)
    employees = Column(MutableList.as_mutable(JSONB), default=list)

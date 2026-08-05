from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.mutable import MutableDict, MutableList

from datetime import datetime, timezone

from db.database import Base 

class JobFinances(Base):
    __tablename__ = "job_finances"

    id = Column(Integer, primary_key=True, index=True)

    job_id = Column(
        Integer, 
        ForeignKey("jobs.id"), 
        unique=True,
        nullable=False
    )

    job = relationship(
        "Job", 
        back_populates="finances"
    )

    money_in = Column(Float, nullable=False)

    # Materials stay a name -> cost dict (unchanged).
    materials_out = Column(MutableDict.as_mutable(JSONB), default=dict)

    # Employees are now a LIST of frozen entries, each:
    #   {"user_id": int, "name": str, "hours": float, "rate": float, "cost": float}
    # The rate is frozen at entry; cost = hours * rate, computed server-side.
    employees_out = Column(MutableList.as_mutable(JSONB), default=list)

    total_material_cost = Column(Float, default=0.0)
    total_labor_cost = Column(Float, default=0.0)

    job_profit = Column(Float, default=0.0)

    # When this record was last created/edited — used to sort accounting by
    # most-recently-interacted (Feature 4). Set on every save.
    last_modified = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
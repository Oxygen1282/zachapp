from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.mutable import MutableDict
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
    
    materials_out = Column(MutableDict.as_mutable(JSONB), default=dict)
    employees_out = Column(MutableDict.as_mutable(JSONB), default=dict)

    total_material_cost = Column(Float, default=0.0)
    total_labor_cost = Column(Float, default=0.0)

    job_profit = Column(Float, default=0.0)
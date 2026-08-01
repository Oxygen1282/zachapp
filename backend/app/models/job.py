from sqlalchemy import Column, Integer, String, Text, ForeignKey
from sqlalchemy.orm import relationship
from db.database import Base 

class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)

    # Job is now a CHILD of Client. name/phone/email moved UP to Client —
    # they're facts about the person, not the job.
    client_id = Column(
        Integer,
        ForeignKey("clients.id"),
        nullable=False,
    )

    # The job's address: a FROZEN string, composed and copied from whichever
    # ClientAddress was chosen at creation. Not a foreign key to the address —
    # editing/deleting the client's address later must not rewrite this job.

    address = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    job_type = Column(String, nullable=False)
    status = Column(String, nullable=False, default="New")

    # ----- Relationships -----

    # Back to the owning client (pairs with Client.jobs from piece 1).
    client = relationship(
        "Client",
        back_populates="jobs",
    )

    finances = relationship(
        "JobFinances", 
        back_populates="job", 
        uselist=False,
        cascade="all, delete-orphan"
    )
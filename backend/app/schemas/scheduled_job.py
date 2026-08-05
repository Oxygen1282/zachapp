from pydantic import BaseModel, Field 
from datetime import datetime

class ScheduledJobBase(BaseModel):
    
    job_name: str 
    job_comments: str | None = None

    job_start_date: datetime
    job_end_date: datetime

    # Assigned employee names. Defaults to empty so it's optional on create.
    employees: list[int] = Field(default_factory=list)

class ScheduledJobCreate(ScheduledJobBase):
    pass 

class ScheduledJobRead(ScheduledJobBase):
    id: int 

    model_config = {
        "from_attributes": True
    }
from pydantic import BaseModel 
from datetime import datetime, date 

# A full timesheet row as returned to the client. All the clock actions return
# the updated shift in this shape, and the timesheet lists are lists of these.
class TimesheetRead(BaseModel):
    id: int 
    user_id: int 
    date: date 

    clock_in: datetime 
    clock_out: datetime | None = None 

    break_start: datetime | None = None 
    break_end: datetime | None = None 

    break_time: int         # minutes, running total, initialized to 0
    payable_time: int | None = None     # minutes, null until clocked out

    model_config = {
        "from_attributes": True
    }

class TimesheetUpdate(BaseModel):
    clock_in: datetime
    clock_out: datetime 
    break_time: int     # minutes; the owner sets total break directly when fixing 

class TimesheetDeleteRequest(BaseModel):
    password: str       # the OWNER's password, re-verified before deletion
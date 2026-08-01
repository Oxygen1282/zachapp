from pydantic import BaseModel
from typing import Literal

class JobBase(BaseModel):
    description: str | None = None 
    status: str | None = None

    # Literal restricts this field to EXACTLY these two strings. Pydantic
    # rejects any other value with a 422 before your code runs — so the API
    # itself guarantees job_type is always one of the two, no matter what
    # the client sends. This is the schema-level enforcement; the dropdown
    # is the UI-level version of the same rule.
    job_type: Literal["Rad Power Washing", "Rad Renovations"]


# CREATE: address is REQUIRED - a new job must have one.
# CREATE: the client this job is for, plus WHICH of the client's addresses to
# use. The backend resolves client_address_id into the frozen address string —
# the client never sends the composed address itself.
class JobCreate(JobBase):
    client_id: int
    client_address_id: int

# UPDATE: address is OPTIONAL. If client_address_id is None, the job keeps its
# existing frozen address; if provided, the address is re-resolved and re-frozen.
class JobUpdate(JobBase):
    client: int
    client_address_id: int | None = None

class JobRead(JobBase):
    id: int 
    client_id: int 
    address: str 

    model_config = {
        "from_attributes": True
    } 
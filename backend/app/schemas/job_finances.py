from pydantic import BaseModel, Field
from datetime import datetime 

# One employee's labor entry on a job.
# INPUT: client sends user_id + hours always. rate is sent back for EXISTING
# entries (already frozen) and OMITTED for NEW ones (backend looks it up and
# freezes). cost is never sent by the client — the backend computes it.
class EmployeeCostEntryInput(BaseModel):
    user_id: int
    hours: float 
    rate: float | None = None       # present = keep frozen; absent = freeze fresh

# OUTPUT: the fully-resolved entry the backend returns/stores.
class EmployeeCostEntry(BaseModel):
    user_id: int
    name: str
    hours: float 
    rate: float 
    cost: float

class JobFinancesCreate(BaseModel):
    job_id: int 
    money_in: float

    # Materials: unchanged name -> cost dict.
    materials_out: dict[str, float] = Field(default_factory=dict)

    # Employees: list of entries. Uses the INPUT shape (rate optional).
    employees_out: list[EmployeeCostEntryInput] = Field(default_factory=list)

class JobFinancesUpdate(BaseModel):
    # Same editable fields as create, minus job_id (fixed by URL)
    money_in: float 

    materials_out: dict[str, float] = Field(default_factory=dict)
    employees_out: list[EmployeeCostEntryInput] = Field(default_factory=list)

class JobFinancesRead(BaseModel):
    id: int 
    job_id: int

    money_in: float 

    materials_out: dict[str, float] = Field(default_factory=dict)
    employees_out: list[EmployeeCostEntry] = Field(default_factory=list)

    total_material_cost: float
    total_labor_cost: float

    job_profit: float

    last_modified: datetime | None = None

    model_config = {
        "from_attributes": True 
    }

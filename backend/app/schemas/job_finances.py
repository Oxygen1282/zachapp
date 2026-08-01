from pydantic import BaseModel, Field
from typing import Dict

class JobFinancesBase(BaseModel): 
    job_id: int

    money_in: float

    materials_out: Dict[str, float] = Field(default_factory=dict)
    employees_out: Dict[str, float] = Field(default_factory=dict)

class JobFinancesCreate(JobFinancesBase):
    pass

class JobFinancesUpdate(BaseModel):
    # Same editable fields as create, minus job_id (fixed by URL)
    money_in: float 

    materials_out: Dict[str, float] = Field(default_factory=dict)
    employees_out: Dict[str, float] = Field(default_factory=dict)

class JobFinancesRead(JobFinancesBase):
    id: int 

    total_material_cost: float
    total_labor_cost: float

    job_profit: float

    model_config = {
        "from_attributes": True 
    }

class JobFinancesSummary(BaseModel):
    job_profit: float 

    model_config = {
        "from_attributes": True
    }
from pydantic import BaseModel, Field 

# Shared fields. percentage join the name.
class TaxLocationBase(BaseModel):
    name: str 

    # The tax rate as a PERCENT (8.0 == 8%). Field(ge=0) rejects negative
    # rates at the API boundary — a negative tax makes no sense, and this
    # stops it with a clean 422 before the value ever reaches the math.
    # (ge = "greater than or equal to". No upper bound, so unusual-but-valid
    # rates aren't blocked.)
    percentage: float = Field(ge=0)

# CREATE / UPDATE body — same fields, no id (DB-assigned). Reused for both,
# since editing a location takes the exact same fields as creating one.
class TaxLocationCreate(TaxLocationBase):
    pass 

# READ — adds the DB id.
class TaxLocationRead(TaxLocationBase):
    id: int

    model_config = {
        "from_attributes": True 
    }
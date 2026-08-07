from pydantic import BaseModel

# What the client sends for ONE line when creating/editing an estimate.
# No id and no estimate_id: the id is DB-assigned, and the estimate_id is set
# by the backend from the parent (the client never wires up the link itself).
class EstimateItemCreate(BaseModel):
    name: str
    description: str | None = None 
    unit_price: float 
    quantity: int 

# What the API returns for one line. Adds the DB-assigned id, plus a COMPUTED
# line_total the client never sends — see the note below on why it's here.
class EstimateItemRead(BaseModel):
    id: int 
    name: str 
    description: str | None = None
    unit_price: float 
    quantity: int 

    # Not a stored column — computed on the way out (unit_price * quantity)
    # so the frontend gets the line total without doing the math itself.
    line_total: float 

    model_config = {
        "from_attributes": True
    }
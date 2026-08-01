from pydantic import BaseModel

# What the client sends for one address. No id, no client_id: id is DB-assigned,
# and client_id is wired by the backend from the parent.
class ClientAddressCreate(BaseModel):
    street: str 
    street_line2: str | None = None 
    city: str 
    state: str 
    zip: str 

# What the API returns for one address — adds the DB id.
class ClientAddressRead(BaseModel):
    id: int 
    street: str 
    street_line2: str | None = None 
    city: str 
    state: str 
    zip: str 

    model_config = {
        "from_attributes": True
    }
from pydantic import BaseModel

from schemas.client_address import ClientAddressCreate, ClientAddressRead

# Create/edit body: the client's own fields plus its list of addresses,
# nested — same "parent carries its children" shape as InvoiceCreate.
class ClientCreate(BaseModel):
    name: str
    phone: str | None = None 
    email: str | None = None

    addresses: list[ClientAddressCreate] = []

# Full read: client fields, the DB id, and the addresses nested back out.
class ClientRead(BaseModel):
    id: int
    name: str
    phone: str | None = None
    email: str | None = None

    addresses: list[ClientAddressRead] = []

    model_config = {
        "from_attributes": True
    }
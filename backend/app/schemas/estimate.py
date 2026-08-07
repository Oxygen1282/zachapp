from pydantic import BaseModel 
from datetime import datetime 
from typing import Literal

from schemas.estimate_item import EstimateItemCreate, EstimateItemRead

# What the client sends to CREATE or update (a draft) estimate.
# The client supplies the job it's for and the list of line items — nothing
# about status, number, PDF, or total, because those are all backend-owned.

class EstimateCreate(BaseModel):
    # Estimates always have a client. job_id is optional (Flow 1 has no job yet).
    client_id: int
    job_id: int | None = None

    # Which client address to freeze onto the estimate (Flow 1). In Flow 2
    # (from a job), the address comes from the job — see the service.
    client_address_id: int | None = None

    estimate_title: str | None = None 
    disclaimer: str | None = None 

    # Which tax location is selected. Optional (None = no tax). This is the
    # ONLY tax field the client sends — the rate, name, and all money totals
    # are derived/frozen by the server, never sent in.
    tax_location_id: int | None = None

    # The NEW part: a field whose type is a LIST of another schema. This is
    # how one request carries the parent AND all its children together.
    items: list[EstimateItemCreate] = []

# What the API returns for a full estimate.
class EstimateRead(BaseModel):
    id: int 
    client_id: int
    job_id: int | None = None 
    address: str 

    estimate_title: str | None = None 
    disclaimer: str | None = None

    # Backend-owned lifecycle fields (see the models). Nullable ones are
    # None until the relevant step happens (number/date/pdf until sent).
    status: str 
    estimate_number: str | None = None  

    date_sent: datetime | None = None

    pdf_path: str | None = None 

    # Customer-facing fields
    public_token: str 
    signature: str | None = None 
    signed_date: datetime | None = None 
    change_request: str | None = None 
    is_archived: bool

    # Tax: The live reference plus the frozen copies (null until sent).
    tax_location_id: int | None = None 
    tax_name: str | None = None 
    tax_percentage: float | None = None 

    # The tree computed money values
    subtotal: float 
    tax_amount: float 
    total: float 

    # The children, nested on the way out too - each shaped by estimateItemRead
    items: list[EstimateItemRead] = []

    model_config = {
        "from_attributes": True
    }

# What the PUBLIC customer page returns — deliberately NARROW. The customer
# sees only what belongs on their estimate view. It OMITS internal bookkeeping:
# no ids (client/job/tax_location), no pdf_path, no is_archived, no public_token
# (they already have it — echoing it back is needless), no last_modified.
# This is the "expose the minimum" principle for an unauthenticated surface.
class EstimatePublicRead(BaseModel):
    estimate_number: str | None = None 
    status: str 

    # Recipient info (client name + frozen address) — supplied by the service,
    # not read straight off the model, since client_name comes from the client.
    client_name: str 
    address: str 

    estimate_title: str | None = None 
    disclaimer: str | None = None 

    date_sent: datetime | None = None 

    # The signature + change request ARE shown (the customer sees their own
    # approval/signature reflected back once they've acted).
    signature: str | None = None 
    signed_date: datetime | None = None 

    # Frozen tax display 
    tax_name: str | None = None 
    tax_percentage: float | None = None 

    subtotal: float 
    tax_amount: float 
    total: float 

    items: list[EstimateItemRead] = []

# Customer approves - sends their typed signature.
class EstimateApprove(BaseModel):
    signature: str 

# Customer requests changes - sends their message.
class EstimateChangeRequest(BaseModel):
    change_request: str 

# Password (owner's) sent when deleting a non-draft estimate.
class DeleteEstimateRequest(BaseModel):
    password: str | None = None     # required only for non-draft deletes (checked in service)

# Body for linking an estimate to a newly-created job (from "Convert to Job").
class LinkEstimateToJobRequest(BaseModel):
    job_id: int
    address: str


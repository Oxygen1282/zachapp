from pydantic import BaseModel 
from datetime import datetime 
from typing import Literal

from schemas.invoice_item import InvoiceItemCreate, InvoiceItemRead

# What the client sends to CREATE or update (a draft) invoice.
# The client supplies the job it's for and the list of line items — nothing
# about status, number, PDF, or total, because those are all backend-owned.

class InvoiceCreate(BaseModel):
    job_id: int

    invoice_title: str | None = None 
    disclaimer: str | None = None 

    due_type: Literal["on_completion", "days"] = "on_completion"
    due_days: int | None = None

    # Which tax location is selected. Optional (None = no tax). This is the
    # ONLY tax field the client sends — the rate, name, and all money totals
    # are derived/frozen by the server, never sent in.
    tax_location_id: int | None = None

    # The NEW part: a field whose type is a LIST of another schema. This is
    # how one request carries the parent AND all its children together.
    items: list[InvoiceItemCreate] = []

# What the API returns for a full invoice.
class InvoiceRead(BaseModel):
    id: int 
    job_id: int 

    invoice_title: str | None = None 
    disclaimer: str | None = None

    due_type: str
    due_days: int | None = None

    # Backend-owned lifecycle fields (see the models). Nullable ones are
    # None until the relevant step happens (number/date/pdf until sent).
    status: str 
    invoice_number: str | None = None  

    date_issued: datetime | None = None
    date_paid: datetime | None = None
    first_viewed_at: datetime | None = None

    public_token: str

    pdf_path: str | None = None 

    # Tax: The live reference plus the frozen copies (null until sent).
    tax_location_id: int | None = None 
    tax_name: str | None = None 
    tax_percentage: float | None = None 

    # Per-response signal, set ONLY during a send/resend operation — "sent" or
    # "failed". Not a DB column; it reflects whether the email went out on THIS
    # response. None on any other response (list, get, update), which is why it
    # must be Optional with a default.
    email_status: str | None = None 

    # The tree computed money values
    subtotal: float 
    tax_amount: float 
    total: float 

    # The children, nested on the way out too - each shaped by invoiceItemRead
    items: list[InvoiceItemRead] = []

    model_config = {
        "from_attributes": True
    }
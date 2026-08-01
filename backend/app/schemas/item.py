from pydantic import BaseModel 

# ---------------------------------------------------------------------------
# Schemas describe the SHAPE of data crossing the API boundary, and Pydantic
# validates incoming requests against them automatically. They're separate
# from the SQLAlchemy model on purpose: the model is how data is STORED, the
# schemas are what the API ACCEPTS and RETURNS. Keeping them apart means you
# can expose exactly the fields you want, no more.
# ---------------------------------------------------------------------------

# The fields a human actually fills in. We put the shared fields in a base
# class so we don't repeat them, exactly like your job / finances schemas.
class ItemBase(BaseModel):

    # Required: an item must have a name. Pydantic rejects a request that
    # omits this with a clear 422 error before your code ever runs.
    name: str 

    # Optional: description can be left out. "| None = None" means the field
    # may be null, and defaults to null if the client doesn't send it.
    description: str | None = None 

# What the API expects in the BODY when CREATING an item (POST /items/).
# It's just the base fields — no id, because the database assigns the id.
class ItemCreate(ItemBase):
    pass 

# What the API SENDS BACK when returning an item (GET, POST, PUT responses).
# Same fields as create, PLUS the id the database generated.
class ItemRead(ItemBase):

    # Present on the way out, never sent in on the way in.
    id: int 

    # This lets Pydantic build an ItemRead directly from a SQLAlchemy Item
    # object (reading attributes like item.id, item.name) instead of needing
    # a plain dict. Without it, returning an ORM object from a route would
    # fail. Every one of your Read schemas has this for the same reason.
    model_config = {
        "from_attributes": True
    }
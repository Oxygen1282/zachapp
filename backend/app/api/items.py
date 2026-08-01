from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db

from core.dependencies import require_owner

from models.user import User

from schemas.item import ItemCreate, ItemRead
from services.item_service import (
    create_item,
    get_items, 
    get_item_by_id,
    update_item,
    delete_item,
)

# ---------------------------------------------------------------------------
# The router groups all the item endpoints under one URL prefix. Routes stay
# deliberately thin: each one validates input (via the schema), calls the
# matching service function, and returns the result. All real logic lives in
# the service. This mirrors your jobs / scheduled_jobs / finances routers.
# ---------------------------------------------------------------------------

# prefix="/items" means every route below starts with /items.
# tags=["items"] just groups them together in the /docs page.
router = APIRouter(prefix="/items", tags=["items"])

# CREATE — POST /items/
# The body is validated against ItemCreate; the response is shaped by ItemRead.
@router.post("/", response_model=ItemRead)
async def create(
    data: ItemCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await create_item(db, data)

# LIST — GET /items/
# Returns every item. response_model=list[ItemRead] shapes each one in the list.
@router.get("/", response_model=list[ItemRead])
async def list_items(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await get_items(db)

# READ ONE — GET /items/{item_id}
# The {item_id} in the path is passed in as an int (FastAPI validates that).
@router.get("/{items_id}", response_model=ItemRead)
async def get_one(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await get_item_by_id(db, item_id)

# UPDATE — PUT /items/{item_id}
# Reuses ItemCreate as the body (update takes the same fields as create).
@router.put("/{item_id}", response_model=ItemRead)
async def update(
    item_id: int,
    data: ItemCreate, 
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await update_item(db, item_id, data)

# DELETE — DELETE /items/{item_id}
# No response_model: the service returns a simple {"message": ...} dict.
@router.delete("/{item_id}")
async def delete(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_owner),
):
    return await delete_item(db, item_id)
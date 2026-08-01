from sqlalchemy.ext.asyncio import AsyncSession 
from sqlalchemy import select 

from fastapi import HTTPException 

from models.item import Item 
from schemas.item import ItemCreate 

# ---------------------------------------------------------------------------
# The service layer holds the database logic. Routes stay thin (just wiring),
# and everything that actually touches the database or enforces a rule lives
# here. This mirrors your job_service / job_finance_service files exactly.
# ---------------------------------------------------------------------------

async def create_item(db: AsyncSession, data: ItemCreate) -> Item:

    # Friendly uniqueness pre-check. The database column already forbids
    # duplicate names, but hitting that raw constraint throws an ugly 500.
    # Checking first lets us return a clear 400 the frontend can display.
    existing = await db.execute(
        select(Item).where(Item.name == data.name)
    )

    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=400,
            detail="An item with that name already exists"
        )
    
    # Build the ORM object from the validated request data.
    # (data has already passed Pydantic validation by the time we're here.)
    item = Item(
        name=data.name,
        description=data.description,
    )

    db.add(item)            # stage the new row
    await db.commit()       # write it to the database
    await db.refresh(item)  # reload it so item.id (assigned by DB) is populated

    return item

async def get_items(db: AsyncSession):

    # Return every item in the catalog (used to populate the item picker
    # and the catalog management screen).
    result = await db.execute(select(Item))
    return result.scalars().all()

async def get_item_by_id(db: AsyncSession, item_id: int) -> Item:

    result = await db.execute(
        select(Item).where(Item.id == item_id)
    )

    item = result.scalar_one_or_none()

    # scalar_one_or_none() returns None if no row matched. Turn that into a
    # clean 404 instead of letting downstream code crash on a None.
    if item is None:
        raise HTTPException(
            status_code=404,
            detail="Item not found"
        )
    
    return item

async def update_item(db: AsyncSession, item_id: int, data: ItemCreate) -> Item:

    # First make sure the item exists (reuses the 404 logic above).
    item = await get_item_by_id(db, item_id)

    # Uniqueness check again, but with a twist: the item is allowed to keep
    # its OWN name. We only block if some OTHER item already has the new name.
    # "Item.id != item_id" is what excludes this item from the collision check.
    existing = await db.execute(
        select(Item).where(
            Item.name == data.name,
            Item.id != item_id,
        )
    )

    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=400,
            detail="An item with that name already exists"
        )
    
    # Overwrite the editable fields with the incoming values
    item.name = data.name
    item.description = data.description

    await db.commit()
    await db.refresh(item)

    return item

async def delete_item(db: AsyncSession, item_id: int):

    # 404 if it doesn't exist.
    item = await get_item_by_id(db, item_id)

    # Hard delete (decision A). This is safe because invoice lines COPY the
    # item's name/description at creation, so deleting a catalog item never
    # affects past invoices. If you later add the active/inactive flag, this
    # is the function that would flip a flag instead of removing the row.

    await db.delete(item)
    await db.commit()

    return {
        "message": "Item deleted"
    }
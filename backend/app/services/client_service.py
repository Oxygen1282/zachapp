from sqlalchemy.ext.asyncio import AsyncSession 
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload 

from fastapi import HTTPException 

from models.job import Job
from models.client import Client 
from models.client_address import ClientAddress 

from schemas.client import ClientCreate 

from datetime import datetime, timezone

async def create_client(db: AsyncSession, data: ClientCreate) -> Client:

    # Build the parent, then attach each address as a child row. Appending to
    # client.addresses is enough — the relationship + cascade turns these into
    # real client_addresses rows on commit, with client_id wired automatically.
    client = Client(
        name=data.name,
        phone=data.phone, 
        email=data.email,
        last_modified=datetime.now(timezone.utc)
    )

    for addr in data.addresses:
        client.addresses.append(
            ClientAddress(
                street=addr.street,
                street_line2=addr.street_line2,
                city=addr.city,
                state=addr.state,
                zip=addr.zip,
            )
        )

    db.add(client)
    await db.commit()

    # Reload with addresses eagerly loaded (async needs this before the
    # response tries to read client.addresses — same reason as invoices).
    return await get_client_by_id(db, client.id)
    
async def get_clients(db: AsyncSession):
    # List all clients, each with addresses eagerly loaded.
    result = await db.execute(
        select(Client)
        .options(selectinload(Client.addresses))
        .order_by(Client.last_modified.desc().nullslast())
    )
    return result.scalars().all()

async def get_client_by_id(db: AsyncSession, client_id: int) -> Client:
    result = await db.execute(
        select(Client).where(Client.id == client_id).options(selectinload(Client.addresses))
    )

    client = result.scalar_one_or_none()

    if client is None:
        raise HTTPException(
            status_code=404, 
            detail="Client not found",
        )
    
    return client 


async def update_client(db: AsyncSession, client_id: int, data: ClientCreate) -> Client:

    client = await get_client_by_id(db, client_id)

    # Update the clients on fields
    client.name = data.name 
    client.phone = data.phone
    client.email = data.email 

    # Replace the whole address list: clear (delete-orphan removes old rows),
    # then re-append. Same "send the full list, server reconciles" approach as
    # invoice line items — simpler and less error-prone than diffing.

    client.addresses.clear()

    for addr in data.addresses: 
        client.addresses.append(
            ClientAddress(
                street=addr.street,
                street_line2=addr.street_line2,
                city=addr.city,
                state=addr.state,
                zip=addr.zip,
            )
        )

    client.last_modified = datetime.now(timezone.utc)

    await db.commit()
    return await get_client_by_id(db, client.id)

async def delete_client(db: AsyncSession, client_id: int):

    client = await get_client_by_id(db, client_id)

    # Block deletion if this client still has jobs (the decision from piece 1:
    # deleting a client must not silently wipe its jobs/invoices/finances).
    # We COUNT jobs with an explicit query rather than reading client.jobs,
    # because that relationship isn't eager-loaded here and a lazy load under
    # async is unreliable. An explicit query is robust and clear.
    job_count = await db.execute(
        select(func.count()).select_from(Job).where(Job.client_id == client_id)
    )

    if job_count.scalar_one() > 0:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete a client that still has jobs. Delete or reassign the jobs first",
        )
    
    await db.delete(client)
    await db.commit() 

    return {
        "message": "Client deleted"
    }
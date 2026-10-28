import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import users
from api import jobs
from api import job_finances
from api import scheduled_jobs
from api import items
from api import invoices
from api import clients
from api import tax_locations
from api import materials 
from api import timesheets
from api import estimates
from api import notifications

from models.job import Job
from models.job_finances import JobFinances
from models.scheduled_job import ScheduledJob

from db.database import engine, Base

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):

    # Schema is now managed by Alembic - run `alembic upgrade head` instead
    # async with engine.begin() as conn:
    #     await conn.run_sync(Base.metadata.create_all)
    
    yield 

app = FastAPI(
    title="ZachApp Backend", 
    lifespan=lifespan
)

app.include_router(users.router)
app.include_router(jobs.router)
app.include_router(job_finances.router)
app.include_router(scheduled_jobs.router)
app.include_router(items.router)
app.include_router(invoices.router)             # owner routes(/invoices)
app.include_router(invoices.public_router)      # public routes (/public/invoices)
app.include_router(clients.router)
app.include_router(tax_locations.router)
app.include_router(materials.router)
app.include_router(timesheets.router)
app.include_router(estimates.router)            # owner routes (/estimates)
app.include_router(estimates.public_router)     # public routes (/pulic/estimates)
app.include_router(notifications.router)

# Comma-separated list of allowed origins, from the environment.
# e.g. "http://localhost:5173" locally, or "https://app.radpw.com" in prod.
_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "ok"}
from sqlalchemy import Column, Integer, String 
from db.database import Base 

# The catalog of reusable material names, e.g. "Sodium Hypochlorite", "Sealant".
# Names only — no price, because the cost of a material varies per job and is
# entered fresh each time on the finances record. This table just supplies the
# reusable pick-list; the actual per-job cost lives in finances' materials_out.
# Hard-deletable and editable, like the other catalogs.
class Material(Base):

    __tablename__ = "materials"

    id = Column(Integer, primary_key=True, index=True)

    # Unique so there aren't two identical material names in the pick-list.
    # DB enforces it; the service adds a friendly duplicate check.
    name = Column(String, unique=True, nullable=False, index=True) 
from sqlalchemy import Column, Integer, String, Float 
from db.database import Base 

# A reusable tax location (e.g. "Cuyahoga County", 8.0%). Editable reference
# data: rates can be changed over the years, and rows can be hard-deleted,
# because every SENT invoice freezes its own copy of the name + percentage.
# So this table never holds invoice history — just the current pick-list.
class TaxLocation(Base):

    __tablename__ = "tax_locations"

    id = Column(Integer, primary_key=True, index=True)

    # Name of the taxing location. Unique — no two "Cuyahoga County" rows.
    # The DB enforces it; the service adds a friendly duplicate check.
    name = Column(String, unique=True, nullable=False, index=True)

    # The tax rate stored as a PERCENT (e.g. 8.0 means 8%), NOT a fraction
    # (0.08). This must stay consistent everywhere: the math divides by 100
    # (subtotal * percentage / 100). Storing it as a percent matches how it's
    # entered and printed ("8.0%"), and keeps one convention end to end.
    percentage = Column(Float, nullable=False)
from sqlalchemy import Column, Integer, String, Text
from db.database import Base 

# The catalog of reusable line items you can pick from when building an invoice.
# This is ONLY the reusable definition (name + description). It intentionally
# has no price — per the plan, price and quantity are entered fresh on each
# invoice line at creation time, never pulled live from here. That way editing
# the catalog later never rewrites the numbers on past invoices.
class Item(Base):

    # The phiscal table name in Postgres.
    __tablename__ = "items"

    # Primary key. Auto-incrementing integer, indexed for fast lookups.
    id = Column(Integer, primary_key=True, index=True)

    # The item's name (e.g. "Pressure Wash - Driveway").
    #   unique=True   -> the database itself forbids two items with the same
    #                    name. This is the real guarantee; the service layer
    #                    will also check first so you get a friendly error
    #                    instead of a raw database exception.
    #   nullable=False -> an item must always have a name.
    #   index=True    -> speeds up lookups/uniqueness checks on name.
    name = Column(String, unique=True, nullable=False, index=True)

    # A longer description of the item. Text (not String) since it may be
    # a sentence or two. nullable=True -> the description is optional.

    description = Column(Text, nullable=True)
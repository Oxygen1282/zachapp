from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey 
from sqlalchemy.orm import relationship
from db.database import Base

# A single line on an invoice — the CHILD. One row per line item.
class InvoiceItem(Base):

    __tablename__ = "invoice_items"

    id = Column(Integer, primary_key=True, index=True)

    # Which invoice this line belongs to. ForeignKey to invoices.id.
    # ondelete="CASCADE" is the DATABASE-level counterpart to the Python-side
    # cascade above: if an invoice row is deleted directly in the DB, its
    # line rows go too. Belt and suspenders — the ORM cascade handles it in
    # app code, this handles it at the database.
    invoice_id = Column(
        Integer,
        ForeignKey("invoices.id", ondelete="CASCADE"),
        nullable=False,
    )

    # The item's name and description, COPIED from the catalog at creation.
    # This is deliberate: the line keeps its own frozen copy so editing or
    # deleting the catalog item later never changes past invoices. This is
    # why there's NO foreign key to the items table.
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    # Price per unit and quantity, captured fresh on this invoice (never
    # pulled live from the catalog — the catalog has no price). The line
    # total (unit_price * quantity) is computed, not stored, so it can never
    # drift out of sync with its parts.
    unit_price = Column(Float, nullable=False)
    quantity = Column(Integer, nullable=False)

    # The other side of the parent's `items` relationship.
    invoice = relationship(
        "Invoice",
        back_populates="items",
    )

    # Computed, not stored. This is a plain Python property on the ORM object,
    # so reading `line.line_total` returns unit_price * quantity on the fly.
    # It's what lets InvoiceItemRead's `line_total` field resolve via
    # from_attributes — Pydantic reads it like any other attribute, never
    # knowing (or caring) that it's derived rather than a column.
    @property
    def line_total(self) -> float:
        return self.unit_price * self.quantity
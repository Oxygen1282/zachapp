from sqlalchemy import Column, Integer, String, Float, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from db.database import Base 

from datetime import datetime, timezone

# The invoice itself — the PARENT. One row per invoice. It owns many
# invoice_items (the line items), and belongs to one job.

class Invoice(Base):

    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)

    # Which job this invoice is for. ForeignKey ties it to jobs.id at the
    # database level — Postgres will reject an invoice pointing at a job that
    # doesn't exist. NOT unique here (unlike finances): a job can have MANY
    # invoices, which is the whole reason for the "sum the paid ones" feature.
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)

    # Lifecycle status: "Draft" -> "Sent" -> "Paid" (decision D/E).
    # Defaults to Draft; every invoice starts editable and unsent.
    status = Column(String, nullable=False, default="Draft")

    # The 7-digit human-facing number (e.g. "2026013"). NULL until the invoice
    # is sent — drafts don't consume a number (decision C). String, not Int,
    # because the leading year digits matter and it's an identifier, not a
    # quantity you'd do math on.
    invoice_number = Column(String, unique=True, nullable=True)

    # When the invoice was issued (i.e. sent). NULL while it's a draft.
    date_issued = Column(DateTime(timezone=True), nullable=True)

    # When the invoice was marked paid. NULL until then. For now this is set
    # manually at mark-paid; the future payment-link feature may overwrite it
    # with the actual settlement date.
    date_paid = Column(DateTime(timezone=True), nullable=True)

    # Payment terms. "on_completion" (default) means no fixed due date — the
    # PDF shows "On completion". "days" means the due date is date_issued +
    # due_days. Stored as a plain string; the allowed values are enforced in
    # the schema (like job_type), not as a DB enum.
    due_type = Column(String, nullable=False, default="on_completion")

    # Number of days after issue that payment is due. Only meaningful when
    # due_type == "days"; NULL / ignored when due_type == "on_completion".
    due_days = Column(Integer, nullable=True)

    # Path to the generated PDF on disk (decision: store path, not bytes).
    # NULL until the PDF is generated at send-time.
    pdf_path = Column(String, nullable=True)

    # Free-text title shown on the PDF (e.g. "Job #1355 Frangula (Power Washing
    # Invoice)"). Nullable — optional, editable while Draft.
    invoice_title = Column(String, nullable=True)

    # Optional disclaimer / message block on the PDF. Blank by default; only
    # rendered on the PDF if non-empty. Text (not String) since it's a
    # paragraph. Editable while Draft.
    disclaimer = Column(Text, nullable=True)

    # When this record was last created/edited — used to sort lists by
    # most-recently-interacted. Updated on every save.
    last_modified = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # ----- Tax -----

    # Live reference to the selected tax location, used WHILE DRAFT to look up
    # the current rate. Nullable: tax is optional (no location = no tax).
    # ondelete="SET NULL" so deleting a tax location doesn't delete invoices —
    # it just clears the reference (sent invoices already froze their copy).
    tax_location_id = Column(
        Integer,
        ForeignKey("tax_locations.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Frozen copies, set AT SEND. Null on a draft; once sent, these hold the
    # name + rate the invoice was sent with, forever — immune to later edits
    # of the tax_locations table.
    tax_name = Column(String, nullable=True)
    tax_percentage = Column(Float, nullable=True)

    # ---------- Money (all computed server-side) -----------

    # Sum of the line totals (unit_price * quantity).
    subtotal = Column(Float, nullable=False, default=0.0)

    # subtotal * (tax_percentage / 100). 0 when theres no tax.
    tax_amount = Column(Float, nullable=False, default=0.0)

    # The invoice total. Computed server-side from the line items and saved
    # here for fast display and for the finances rollup. The line items remain
    # the source of truth; this is a cached sum, recomputed whenever lines change.
    total = Column(Float, nullable=False, default=0.0)

    # ----- Relationships -----

    # The link to the child rows. This does NOT create a column; it's a
    # Python-side convenience so you can write `invoice.items` and get the
    # list of InvoiceItem objects for this invoice.
    #
    #   back_populates="invoice" -> pairs with the matching attribute on the
    #       child so both sides stay in sync in memory.
    #   cascade="all, delete-orphan" -> deleting an invoice deletes ITS line
    #       items too, and removing a line from the list deletes that row.
    #       This is what makes the child rows truly "owned" by the parent.
    items = relationship(
        "InvoiceItem",
        back_populates="invoice",
        cascade="all, delete-orphan",
    )
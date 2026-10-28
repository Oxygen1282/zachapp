from sqlalchemy import Column, Integer, String, Float, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship

from db.database import Base 

from datetime import datetime, timezone

# The estimate itself — the PARENT. One row per estimate. It owns many
# estimate_items (the line items), and belongs to one job.

class Estimate(Base):

    __tablename__ = "estimates"

    id = Column(Integer, primary_key=True, index=True)

    # Estimates always belong to a client (unlike invoices, which reach the
    # client through their job). Required.
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)

    # Nullable: an estimate can exist before its job does (Flow 1: Client ->
    # Estimate -> Job). Set when created from a job, or when "Convert to Job"
    # spawns and links one.
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=True)

    # Lifecycle status: "Draft" -> "Sent" -> "Paid" (decision D/E).
    # Defaults to Draft; every estimate starts editable and unsent.
    status = Column(String, nullable=False, default="Draft")

    # Frozen address string. From the job's address (Flow 2) or a chosen client
    # address (Flow 1). Stored directly because the estimate may have no job.
    address = Column(String, nullable=False)

    # The 7-digit human-facing number (e.g. "2026013"). NULL until the estimate
    # is sent — drafts don't consume a number (decision C). String, not Int,
    # because the leading year digits matter and it's an identifier, not a
    # quantity you'd do math on.
    estimate_number = Column(String, unique=True, nullable=True)

    # When the estimate was issued (i.e. sent). NULL while it's a draft.
    date_sent = Column(DateTime(timezone=True), nullable=True)

    # When the customer FIRST opened the public estimate link. Null until then.
    # Set once, on the first hit to the public view endpoint — the "opened for
    # the first time" signal for the future notifications center. Only the
    # first view stamps it; later views leave it unchanged.
    first_viewed_at = Column(DateTime(timezone=True), nullable=True)

    # Path to the generated PDF on disk (decision: store path, not bytes).
    # NULL until the PDF is generated at send-time.
    pdf_path = Column(String, nullable=True)

    # Free-text title shown on the PDF (e.g. "Job #1355 Frangula (Power Washing
    # estimate)"). Nullable — optional, editable while Draft.
    estimate_title = Column(String, nullable=True)

    # Which business line this estimate is for (e.g. "Rad Power Washing").
    # Required at creation; used as the sender/brand name on the estimate email,
    # replacing the old hardcoded string. Independent of any linked job's type.
    job_type = Column(String, nullable=False)

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
    # ondelete="SET NULL" so deleting a tax location doesn't delete estimates —
    # it just clears the reference (sent estimates already froze their copy).
    tax_location_id = Column(
        Integer,
        ForeignKey("tax_locations.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Frozen copies, set AT SEND. Null on a draft; once sent, these hold the
    # name + rate the estimate was sent with, forever — immune to later edits
    # of the tax_locations table.
    tax_name = Column(String, nullable=True)
    tax_percentage = Column(Float, nullable=True)

    # ---------- Money (all computed server-side) -----------

    # Sum of the line totals (unit_price * quantity).
    subtotal = Column(Float, nullable=False, default=0.0)

    # subtotal * (tax_percentage / 100). 0 when theres no tax.
    tax_amount = Column(Float, nullable=False, default=0.0)

    # The estimate total. Computed server-side from the line items and saved
    # here for fast display and for the finances rollup. The line items remain
    # the source of truth; this is a cached sum, recomputed whenever lines change.
    total = Column(Float, nullable=False, default=0.0)

    # ----- Customer-facing access + actions -----

    # Unguessable permanent token for the public customer link. Generated at
    # creation. The customer views/approves/requests-changes via this token,
    # with NO login — so it must be long and random (secrets, not a sequence)
    public_token = Column(String, unique=True, nullable=False, index=True)

    # Typed signature (customer's name) captured at approval. Null until approved.
    signature = Column(String, nullable=True)

    # When the customer approved (and signed). Null until approved.
    signed_date = Column(DateTime(timezone=True), nullable=True)

    # The customer's typed message when requesting changes. Null unless they did.
    change_request = Column(Text, nullable=True)

    # Soft-hide flag. Archived estimates are filtered from the default list AND
    # become inaccessible on the public customer page. Reversible.
    is_archived = Column(Boolean, nullable=False, default=False)

    # ----- Relationships -----

    # The link to the child rows. This does NOT create a column; it's a
    # Python-side convenience so you can write `estimate.items` and get the
    # list of estimateItem objects for this estimate.
    #
    #   back_populates="estimate" -> pairs with the matching attribute on the
    #       child so both sides stay in sync in memory.
    #   cascade="all, delete-orphan" -> deleting an estimate deletes ITS line
    #       items too, and removing a line from the list deletes that row.
    #       This is what makes the child rows truly "owned" by the parent.
    items = relationship(
        "EstimateItem",
        back_populates="estimate",
        cascade="all, delete-orphan",
    )
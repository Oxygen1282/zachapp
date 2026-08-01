from sqlalchemy import Column, Integer, String, Float, Boolean
from sqlalchemy.orm import relationship
from db.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String, nullable=False)

    # "Owner" or "Employee" — enforced in the schema (Literal), stored as string.
    permissions = Column(String, nullable=False)

    # Login credentials. email is the username; unique so no duplicates.
    email = Column(String, unique=True, nullable=False, index=True)

    # NEVER the plaintext password — a one-way bcrypt hash. You can verify a
    # password against this, but the original can never be recovered from it.
    password_hash = Column(String, nullable=False)

    # Pay. Nullable because salary handling comes later, and an Owner may not
    # need pay fields. pay_type: "hourly" or "salary".
    pay_type = Column(String, nullable=True)
    pay_rate = Column(Float, nullable=True)

    # Active employees can log in and appear in selections. Deactivating is the
    # normal offboarding (preserves timesheet/pay history); hard delete is the
    # deliberate, password-gated erase. Defaults to active.
    is_active = Column(Boolean, nullable=False, default=True)

    # A user's timesheet shifts (child table — built in Phase 5).
    # Declared now so the relationship exists; the model comes later.
    timesheets = relationship(
      "Timesheet",
      back_populates="user", 
      cascade="all, delete-orphan"
    )
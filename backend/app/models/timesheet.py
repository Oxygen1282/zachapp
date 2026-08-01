from sqlalchemy import Column, Integer, DateTime, Date, ForeignKey 
from sqlalchemy.orm import relationship 
from db.database import Base 

class Timesheet(Base):
    __tablename__ = "timesheets"

    id = Column(Integer, primary_key=True, index=True)

    # Whose shift this is.
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # The calendar date of the shift (clock-in date). Timestamps are UTC;
    # this is mainly for display/grouping.
    date = Column(Date, nullable=False)

    # Shift boundaries. clock_out is null while the shift is open (in progress).
    clock_in = Column(DateTime(timezone=True), nullable=False)
    clock_out = Column(DateTime(timezone=True), nullable=True)

    # Scratch space for the CURRENT break being timed. break_start set +
    # break_end null = a break is in progress. Once a break ends, its duration
    # is added to break_time and these may be overwritten by the next break.
    break_start = Column(DateTime(timezone=True), nullable=True)
    break_end = Column(DateTime(timezone=True), nullable=True)

    # Running total of ALL break time this shift, in minutes. Starts at 0,
    # accumulates each time a break ends. This is the durable break record;
    # break_start/break_end are just the in-progress timer.
    break_time = Column(Integer, nullable=False, default=0)

    # Computed at clock-out: (clock_out - clock_in) - break_time, in minutes.
    # Null until the shift is closed.
    payable_time = Column(Integer, nullable=True)

    user = relationship(
        "User",
        back_populates="timesheets",
    )
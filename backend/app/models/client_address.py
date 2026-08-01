from sqlalchemy import Column, Integer, String, ForeignKey 
from sqlalchemy.orm import relationship 
from db.database import Base 

# One saved address for a client. Structured fields (not one string) so a
# future autocomplete can populate them directly and the PDF can render a
# proper two-line block. These get COMPOSED into a display string when shown;
# they're never stored pre-composed here.
class ClientAddress(Base):

    __tablename__ = "client_addresses"

    id = Column(Integer, primary_key=True, index=True)

    client_id = Column(
        Integer,
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
    )

    street = Column(String, nullable=False)         # line 1
    street_line2 = Column(String, nullable=True)    # optional apt/suit/unit
    city = Column(String, nullable=False)
    state = Column(String, nullable=False)
    zip = Column(String, nullable=False)            # String, not Int 

    client = relationship(
        "Client",
        back_populates="addresses",
    )
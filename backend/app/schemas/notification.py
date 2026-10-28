from pydantic import BaseModel
from datetime import datetime 

# What the API returns for one notification (the table rows are a list of these).
class NotificationRead(BaseModel):
    id: int 
    time: datetime 
    type: str 
    notification_message: str 
    audience: str 
    is_read: bool 

    model_config = {
        "from_attributes": True 
    }

# Body the owner sends to broadcast a message to everyone. Just the text —
# type ("Owner Message") and audience ("all") are set by the server.
class OwnerMesageCreate(BaseModel):
    message: str
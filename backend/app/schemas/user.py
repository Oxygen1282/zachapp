from pydantic import BaseModel
from typing import Literal 

class UserCreate(BaseModel):
    name: str
    permissions: Literal["Owner", "Manager", "Employee"]
    email: str
    password: str       # plaintext IN (we hash it); never stored as-is
    pay_type: Literal["Hourly", "Salary"] | None = None 
    pay_rate: float | None = None 

class UserUpdate(BaseModel):
    name: str
    permissions: Literal["Owner", "Manager", "Employee"]
    email: str 
    password: str | None = None     # None/blank = keep existing password
    pay_type: Literal["Hourly", "Salary"] | None = None 
    pay_rate: float | None = None 

class UserRead(BaseModel):
    id: int
    name: str 
    permissions: str 
    email: str 
    pay_type: str | None = None 
    pay_rate: float | None = None 
    is_active: bool
    # NOTE: no password field. the hash NEVER goes out over the API.

    model_config = {
        "from_attributes": True
    }

class LoginRequest(BaseModel):
    email: str 
    password: str 

class TokenResponse(BaseModel):
    access_token: str 
    token_type: str = "bearer"
    permissions: str        # so the frontend knows which UI to show
    name: str 

class DeleteUserRequest(BaseModel):
    password: str       # the OWNER's password, re-verified before deleting 
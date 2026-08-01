from datetime import datetime, timedelta, timezone 
from passlib.context import CryptContext 
from jose import jwt, JWTError

# bcrypt hashing context. bcrypt is a deliberately slow, salted hashing
# algorithm designed for passwords — slowness is a feature (it makes brute-
# forcing expensive).
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Secret used to sign JWT tokens. Read from the environment (your .env has
# SECRET_KEY). This MUST stay secret — anyone with it can forge tokens.
import os 
SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-change-me")
ALGORITHM = "HS256"
TOKEN_EXPIRE_MINUTES = 60 * 12      # 12 hours

# Hash a plaintext password for storage. Called when creating a user
def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)

# Check a plaintext password against a stored hash. Returns True/False.
# This is how login verifies a password without ever un-hashing anything.
def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)

# Create a signed JWT token carrying the user's id and permissions.
def create_access_token(user_id: int, permissions: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),            # "subject" — who the token is for
        "permissions": permissions,     # baked in so guards can check role
        "exp": expire,                  # expiry — token stops working after this
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

# Capability helpers — express what a permission level CAN DO, so guards read
# as intent rather than listing roles. Change roles/rules in ONE place here.

def can_manage_content(permissions: str) -> bool:
    # Create/edit clients, jobs, calendar events; edit timesheets.
    # Owner and Manager share this tier.
    return permissions in ("Owner", "Manager")

def is_owner(permissions: str) -> bool:
    # Owner-exclusive: accounting, invoices, creating employees, editing pay.
    return permissions == "Owner"

# Decode + verify a token. Returns the payload dict, or raises if the token is
# invalid/expired/tampered. The SECRET_KEY check is what makes tampering fail —
# a user can't edit their token to change permissions without breaking the signature.
def decode_access_token(token: str) -> dict:
    try: 
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise ValueError("Invalid or expired token")
from pydantic import BaseModel 

class MaterialBase(BaseModel):
    name: str 

class MaterialCreate(MaterialBase): 
    pass 

class MaterialRead(MaterialBase):
    id: int 

    model_config = {
        "from_attributes": True 
    }
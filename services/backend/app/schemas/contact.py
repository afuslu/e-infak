from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID


class ContactMessageCreate(BaseModel):
    name: str = Field(..., max_length=200)
    phone: str = Field(..., max_length=20)
    message: str = Field(..., min_length=1)


class ContactMessageResponse(BaseModel):
    id: UUID
    name: str
    created_at: datetime

    class Config:
        from_attributes = True

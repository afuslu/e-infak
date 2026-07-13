from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID


class PreRegistrationCreate(BaseModel):
    program: str = Field(..., max_length=50)
    student_name: str = Field(..., max_length=200)
    student_age: str = Field(..., max_length=10)
    parent_name: str = Field(..., max_length=200)
    parent_phone: str = Field(..., max_length=20)


class PreRegistrationResponse(BaseModel):
    id: UUID
    student_name: str
    created_at: datetime

    class Config:
        from_attributes = True

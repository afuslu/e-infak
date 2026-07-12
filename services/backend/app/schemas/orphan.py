from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date
from uuid import UUID
from app.models.orphan import OrphanStatus

class OrphanBase(BaseModel):
    first_name: str = Field(..., max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    birth_date: date
    gender: str = Field(..., max_length=10)
    country: str = Field(..., max_length=100)
    city: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    photo_url: Optional[str] = None
    monthly_sponsor_amount_cents: int = Field(default=40000, gt=0)

class OrphanCreate(OrphanBase):
    pass

class OrphanResponse(OrphanBase):
    id: UUID
    organization_id: UUID
    status: OrphanStatus
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# Sponsorship Schemas
class OrphanSponsorshipBase(BaseModel):
    donor_name: str = Field(..., max_length=200)
    donor_phone: str = Field(..., max_length=20)
    end_date: Optional[datetime] = None

class OrphanSponsorshipCreate(OrphanSponsorshipBase):
    donation_id: Optional[UUID] = None

class OrphanSponsorshipResponse(OrphanSponsorshipBase):
    id: UUID
    organization_id: UUID
    orphan_id: UUID
    donation_id: Optional[UUID] = None
    start_date: datetime
    active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

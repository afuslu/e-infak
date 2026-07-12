from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID
from app.models.kurban import KurbanCampaignStatus, KurbanAnimalType, KurbanStatus

# Kurban Campaign Schemas
class KurbanCampaignBase(BaseModel):
    title: str = Field(..., max_length=300)
    description: Optional[str] = None
    price_per_share_cents: int = Field(..., gt=0)

class KurbanCampaignCreate(KurbanCampaignBase):
    pass

class KurbanCampaignResponse(KurbanCampaignBase):
    id: UUID
    organization_id: UUID
    status: KurbanCampaignStatus
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# Kurban Animal Schemas
class KurbanAnimalBase(BaseModel):
    animal_number: str = Field(..., max_length=50)
    type: KurbanAnimalType = KurbanAnimalType.COW
    video_url: Optional[str] = None

class KurbanAnimalCreate(KurbanAnimalBase):
    campaign_id: UUID

class KurbanAnimalResponse(KurbanAnimalBase):
    id: UUID
    organization_id: UUID
    campaign_id: UUID
    status: KurbanStatus
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# Kurban Share Schemas
class KurbanShareBase(BaseModel):
    donor_name: str = Field(..., max_length=200)
    donor_phone: str = Field(..., max_length=20)
    share_number: int = Field(default=1, ge=1, le=7)

class KurbanShareCreate(KurbanShareBase):
    animal_id: UUID
    donation_id: UUID

class KurbanShareResponse(KurbanShareBase):
    id: UUID
    organization_id: UUID
    animal_id: UUID
    donation_id: UUID
    status: KurbanStatus
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class KurbanSlaughterRequest(BaseModel):
    video_url: Optional[str] = None

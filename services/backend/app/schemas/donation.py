from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
from uuid import UUID
from app.models.donation import DonationStatus, PaymentMethod, DonorType


class DonorCreate(BaseModel):
    donor_type: DonorType = DonorType.INDIVIDUAL
    first_name: str = Field(..., max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    company_name: Optional[str] = Field(None, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    tc_no: Optional[str] = Field(None, max_length=11)
    tax_number: Optional[str] = Field(None, max_length=20)
    allow_email: bool = True
    allow_sms: bool = True
    is_anonymous: bool = False


class DonorResponse(BaseModel):
    id: UUID
    full_name: str
    email: Optional[str]
    phone: Optional[str]
    total_donations: int
    total_donated_cents: int
    created_at: datetime

    class Config:
        from_attributes = True


class DonationCreate(BaseModel):
    campaign_id: UUID
    amount_cents: int = Field(..., gt=0)
    payment_method: PaymentMethod = PaymentMethod.CREDIT_CARD
    donor: DonorCreate
    donor_message: Optional[str] = None
    is_anonymous: bool = False


class DonationResponse(BaseModel):
    id: UUID
    receipt_number: str
    amount_cents: int
    amount_lira: float
    status: DonationStatus
    payment_method: PaymentMethod
    campaign_id: UUID
    donor_id: UUID
    transaction_id: Optional[str]
    card_last_4: Optional[str]
    card_brand: Optional[str]
    paid_at: Optional[datetime]
    receipt_pdf_url: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ThreeDSecureResponse(BaseModel):
    """3D Secure redirect data"""
    redirect_url: str
    redirect_method: str = "POST"
    form_data: dict
    donation_id: UUID
    receipt_number: str


class DonationCallbackRequest(BaseModel):
    """VPOS callback data"""
    transaction_id: str
    status: str
    message: Optional[str] = None
    signature: str

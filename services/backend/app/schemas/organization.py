from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID


class OrganizationBase(BaseModel):
    name: str = Field(..., max_length=200)
    legal_name: str = Field(..., max_length=200)
    slug: str = Field(..., max_length=100)
    email: EmailStr
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    tax_number: Optional[str] = None
    primary_domain: str = Field(..., max_length=255)
    custom_domains: List[str] = []
    theme_primary_color: str = Field(default="#065f46", pattern=r"^#[0-9A-Fa-f]{6}$")
    theme_accent_color: str = Field(default="#0284c7", pattern=r"^#[0-9A-Fa-f]{6}$")
    logo_url: Optional[str] = None
    logo_dark_url: Optional[str] = None
    bank_name: Optional[str] = None
    iban: Optional[str] = None
    account_holder: Optional[str] = None


class OrganizationCreate(OrganizationBase):
    payment_secret_ref: Optional[str] = None


class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    legal_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    theme_primary_color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    theme_accent_color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    logo_url: Optional[str] = None
    is_active: Optional[bool] = None


class OrganizationResponse(OrganizationBase):
    id: UUID
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

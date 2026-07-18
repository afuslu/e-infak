from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, model_validator


class CheckoutDonor(BaseModel):
    first_name: str = Field(min_length=2, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    phone: str = Field(min_length=10, max_length=32)
    is_anonymous: bool = False
    allow_email: bool = False
    allow_sms: bool = False


class CheckoutItem(BaseModel):
    campaign_id: UUID
    quantity: int = Field(default=1, ge=1, le=100)
    unit_amount_cents: int = Field(gt=0)
    donor_message: Optional[str] = Field(default=None, max_length=1000)
    metadata: dict[str, Any] = Field(default_factory=dict)


class CheckoutSessionCreate(BaseModel):
    items: list[CheckoutItem] = Field(min_length=1, max_length=50)
    donor: CheckoutDonor
    payment_method: Literal["credit_card", "bank_transfer"] = "credit_card"
    currency: Literal["TRY", "EUR", "USD"] = "TRY"
    locale: Literal["tr", "en", "ar"] = "tr"
    idempotency_key: str = Field(min_length=16, max_length=128)
    consent_version: str = Field(default="2026-07", max_length=32)
    kvkk_accepted: bool

    @model_validator(mode="after")
    def require_kvkk(self):
        if not self.kvkk_accepted:
            raise ValueError("KVKK aydınlatma metni onayı zorunludur")
        return self


class CheckoutSessionResponse(BaseModel):
    checkout_id: UUID
    status: str
    redirect_url: Optional[str] = None
    expires_at: Optional[str] = None
    transfer_reference: Optional[str] = None
    bank_name: Optional[str] = None
    iban: Optional[str] = None
    account_holder: Optional[str] = None


class CheckoutStatusItem(BaseModel):
    campaign_id: UUID
    campaign_title: str
    quantity: int
    total_amount_cents: int
    receipt_number: Optional[str] = None


class CheckoutStatusResponse(BaseModel):
    checkout_id: UUID
    status: str
    total_cents: int
    currency: str
    transfer_reference: Optional[str] = None
    failure_message: Optional[str] = None
    refunded_cents: int = 0
    reconciliation_status: Optional[str] = None
    items: list[CheckoutStatusItem]

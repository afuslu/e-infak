from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.rate_limit import rate_limit
from app.models.api_key import ApiKey
from app.models.campaign import Campaign
from app.models.donation import Donation, DonationStatus, Donor, PaymentMethod

router = APIRouter(
    prefix="/public-api",
    tags=["public-api"],
    dependencies=[Depends(rate_limit("public-api", limit=120, window_seconds=60))],
)


async def require_api_key(
    request: Request,
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
    db: AsyncSession = Depends(get_db),
) -> ApiKey:
    if not x_api_key or not x_api_key.startswith("infak_"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Geçerli bir X-API-Key başlığı gereklidir.",
        )
    key_hash = hashlib.sha256(x_api_key.strip().encode("utf-8")).hexdigest()
    key = (
        await db.execute(
            select(ApiKey).where(ApiKey.key_hash == key_hash, ApiKey.is_active == True)
        )
    ).scalar_one_or_none()
    if not key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Geçersiz veya iptal edilmiş API anahtarı.",
        )

    org_state = getattr(request.state, "organization_id", None)
    if org_state and str(key.organization_id) != str(org_state):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="API anahtarı bu kurum için yetkili değil.",
        )

    now = datetime.now(timezone.utc)
    if key.expires_at and key.expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API anahtarının süresi dolmuş.",
        )

    key.last_used_at = now
    await db.commit()
    return key


def require_scope(required: str):
    async def _dep(key: ApiKey = Depends(require_api_key)) -> ApiKey:
        scopes = set(key.scopes or [])
        if required.endswith(":read") and "read_only" in scopes:
            return key
        if required not in scopes and "*" not in scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Bu uç nokta için '{required}' kapsamı gereklidir.",
            )
        return key

    return _dep


@router.get("/campaigns")
async def list_public_api_campaigns(
    key: ApiKey = Depends(require_scope("campaigns:read")),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(Campaign)
            .where(Campaign.organization_id == key.organization_id, Campaign.is_active == True)
            .order_by(Campaign.created_at.desc())
        )
    ).scalars().all()
    return [
        {
            "id": str(c.id),
            "slug": c.slug,
            "title": c.title,
            "category": c.category,
            "target_amount_cents": c.target_amount_cents,
            "collected_amount_cents": c.collected_amount_cents,
            "currency": c.currency,
        }
        for c in rows
    ]


@router.get("/donations")
async def list_public_api_donations(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    key: ApiKey = Depends(require_scope("donations:read")),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(Donation, Campaign.title)
            .outerjoin(Campaign, Donation.campaign_id == Campaign.id)
            .where(
                Donation.organization_id == key.organization_id,
                Donation.status == DonationStatus.COMPLETED,
            )
            .order_by(Donation.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return [
        {
            "id": str(d.id),
            "receipt_number": d.receipt_number,
            "campaign_id": str(d.campaign_id) if d.campaign_id else None,
            "campaign_title": c_title or "Genel Bağış",
            "amount_cents": d.amount_cents,
            "currency": d.currency,
            "payment_method": d.payment_method.value if hasattr(d.payment_method, "value") else str(d.payment_method),
            "created_at": d.created_at,
        }
        for d, c_title in rows
    ]


@router.get("/donors")
async def list_public_api_donors(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    key: ApiKey = Depends(require_scope("donors:read")),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(Donor)
            .where(Donor.organization_id == key.organization_id)
            .order_by(Donor.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()
    return [
        {
            "id": str(d.id),
            "name": d.name,
            "email": d.email,
            "phone": d.phone,
            "city": getattr(d, "city", None),
            "created_at": d.created_at,
        }
        for d in rows
    ]


class PublicApiDonationCreate(BaseModel):
    campaign_id: Optional[UUID] = None
    donor_name: str = Field(min_length=2, max_length=120)
    donor_phone: Optional[str] = Field(default=None, max_length=32)
    donor_email: Optional[str] = Field(default=None, max_length=160)
    amount_cents: int = Field(ge=100)
    currency: str = Field(default="TRY", max_length=8)
    external_reference: Optional[str] = Field(default=None, max_length=80)


@router.post("/donations", status_code=status.HTTP_201_CREATED)
async def create_public_api_donation(
    payload: PublicApiDonationCreate,
    key: ApiKey = Depends(require_scope("donations:write")),
    db: AsyncSession = Depends(get_db),
):
    from app.services.donor_matching import find_or_create_donor

    campaign_id = payload.campaign_id
    if campaign_id:
        camp = (
            await db.execute(
                select(Campaign).where(
                    Campaign.id == campaign_id,
                    Campaign.organization_id == key.organization_id,
                )
            )
        ).scalar_one_or_none()
        if not camp:
            raise HTTPException(status_code=404, detail="Kampanya bulunamadı.")
    else:
        camp = (
            await db.execute(
                select(Campaign)
                .where(Campaign.organization_id == key.organization_id, Campaign.is_active == True)
                .order_by(Campaign.created_at.asc())
            )
        ).scalars().first()
        if not camp:
            raise HTTPException(status_code=400, detail="Kurumda aktif kampanya bulunmuyor.")
        campaign_id = camp.id

    parts = payload.donor_name.strip().split(None, 1)
    first_name = parts[0]
    last_name = parts[1] if len(parts) > 1 else "-"

    donor = await find_or_create_donor(
        db,
        organization_id=key.organization_id,
        first_name=first_name,
        last_name=last_name,
        phone=payload.donor_phone,
        email=payload.donor_email,
    )

    receipt_no = f"API-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{secrets.token_hex(3).upper()}"
    donation = Donation(
        organization_id=key.organization_id,
        campaign_id=campaign_id,
        donor_id=donor.id,
        amount_cents=payload.amount_cents,
        currency=(payload.currency or "TRY").upper(),
        status=DonationStatus.PENDING,
        payment_method=PaymentMethod.BANK_TRANSFER,
        receipt_number=receipt_no,
        donor_message=payload.external_reference,
    )
    db.add(donation)
    await db.commit()
    await db.refresh(donation)
    return {
        "id": str(donation.id),
        "receipt_number": donation.receipt_number,
        "status": donation.status.value if hasattr(donation.status, "value") else str(donation.status),
        "amount_cents": donation.amount_cents,
        "currency": donation.currency,
    }

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models.donation import Donation, DonationStatus
from app.models.user import User
from app.schemas.donation import DonationCreate, DonationResponse

router = APIRouter(prefix="/donations", tags=["donations"])


@router.post("", status_code=410)
async def legacy_create_donation(donation_in: DonationCreate):
    """Card handling was removed; all payments must use secure checkout."""
    raise HTTPException(
        status_code=410,
        detail="Bu uç kaldırıldı. Güvenli ödeme için /api/v1/checkout/sessions kullanın.",
    )


@router.get("/{donation_id}", response_model=DonationResponse)
async def get_donation(
    request: Request,
    donation_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Donation).where(
            Donation.id == donation_id,
            Donation.organization_id == request.state.organization_id,
        )
    )
    donation = result.scalar_one_or_none()
    if not donation:
        raise HTTPException(status_code=404, detail="Bağış bulunamadı")
    return donation


@router.get("", response_model=list[DonationResponse])
async def list_donations(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    status: Optional[DonationStatus] = None,
    campaign_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Donation).where(Donation.organization_id == request.state.organization_id)
    if status:
        query = query.where(Donation.status == status)
    if campaign_id:
        query = query.where(Donation.campaign_id == campaign_id)
    query = query.order_by(Donation.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return result.scalars().all()

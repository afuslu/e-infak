from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from typing import Optional
from uuid import UUID, uuid4
from datetime import datetime, timezone
from app.core.db import get_db
from app.models.donation import Donation, Donor, DonationStatus
from app.models.campaign import Campaign
from app.schemas.donation import (
    DonationCreate,
    DonationResponse,
    ThreeDSecureResponse,
    DonorResponse,
)
from app.utils.vpos import get_vpos_client
from app.models.user import User
from app.api.deps import get_current_user

router = APIRouter(prefix="/donations", tags=["donations"])


async def get_or_create_donor(
    organization_id: str,
    donor_data: dict,
    db: AsyncSession,
) -> Donor:
    """Get existing donor or create new one"""
    
    # Try to find existing donor by email or phone
    query = select(Donor).where(Donor.organization_id == organization_id)
    
    if donor_data.get("email"):
        query = query.where(Donor.email == donor_data["email"])
    elif donor_data.get("phone"):
        query = query.where(Donor.phone == donor_data["phone"])
    else:
        # Create new donor if no email/phone
        donor = Donor(organization_id=organization_id, **donor_data)
        db.add(donor)
        return donor
    
    result = await db.execute(query)
    donor = result.scalar_one_or_none()
    
    if donor:
        # Update donor info
        for key, value in donor_data.items():
            if value is not None:
                setattr(donor, key, value)
        return donor
    
    # Create new donor
    donor = Donor(organization_id=organization_id, **donor_data)
    db.add(donor)
    return donor


def generate_receipt_number(organization_id: str) -> str:
    """Generate unique receipt number"""
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    org_prefix = organization_id[:8].upper()
    return f"MCB-{org_prefix}-{timestamp}"


@router.post("", response_model=ThreeDSecureResponse, status_code=201)
async def create_donation(
    request: Request,
    donation_in: DonationCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Create donation and return 3D Secure redirect data
    """
    
    organization_id = request.state.organization_id
    
    # Verify campaign exists and is active
    campaign_result = await db.execute(
        select(Campaign).where(
            Campaign.id == donation_in.campaign_id,
            Campaign.organization_id == organization_id,
        )
    )
    campaign = campaign_result.scalar_one_or_none()
    
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    if not campaign.is_active:
        raise HTTPException(status_code=400, detail="Campaign is not active")
    
    # Check minimum donation amount
    if donation_in.amount_cents < campaign.min_donation_cents:
        raise HTTPException(
            status_code=400,
            detail=f"Minimum donation amount is {campaign.min_donation_cents / 100} TL",
        )
    
    # Get or create donor
    donor = await get_or_create_donor(
        organization_id,
        donation_in.donor.model_dump(),
        db,
    )
    
    # Create donation record
    receipt_number = generate_receipt_number(organization_id)
    
    donation = Donation(
        organization_id=organization_id,
        campaign_id=campaign.id,
        donor_id=donor.id,
        receipt_number=receipt_number,
        amount_cents=donation_in.amount_cents,
        payment_method=donation_in.payment_method,
        status=DonationStatus.PENDING,
        donor_message=donation_in.donor_message,
        is_anonymous=donation_in.is_anonymous,
        idempotency_key=str(uuid4()),
    )
    
    db.add(donation)
    await db.flush()  # Get donation ID
    
    # Prepare 3D Secure form
    vpos_client = get_vpos_client()
    
    base_url = request.base_url
    success_url = f"{base_url}api/v1/donations/callback/success"
    fail_url = f"{base_url}api/v1/donations/callback/fail"
    
    threeds_data = vpos_client.prepare_3d_secure_form(
        amount_cents=donation.amount_cents,
        order_id=str(donation.id),
        card_number=donation_in.card_number,
        card_expiry_month=donation_in.card_expiry_month,
        card_expiry_year=donation_in.card_expiry_year,
        card_cvv=donation_in.card_cvv,
        card_holder_name=donation_in.card_holder_name or donor.full_name,
        success_url=success_url,
        fail_url=fail_url,
    )
    
    # Save card info (last 4 digits only)
    donation.card_last_4 = donation_in.card_number[-4:]
    
    await db.commit()
    
    return ThreeDSecureResponse(
        redirect_url=threeds_data["url"],
        redirect_method=threeds_data["method"],
        form_data=threeds_data["data"],
        donation_id=donation.id,
        receipt_number=donation.receipt_number,
    )


@router.post("/callback/success")
async def payment_callback_success(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Handle successful payment callback from VPOS"""
    
    form_data = await request.form()
    callback_data = dict(form_data)
    
    # Verify signature
    vpos_client = get_vpos_client()
    
    if not vpos_client.verify_callback_signature(
        transaction_id=callback_data.get("TransactionId"),
        status=callback_data.get("Status"),
        signature=callback_data.get("Hash"),
    ):
        raise HTTPException(status_code=400, detail="Invalid signature")
    
    # Parse response
    response = vpos_client.parse_callback_response(callback_data)
    
    # Find donation
    donation_id = UUID(callback_data.get("OrderId"))
    result = await db.execute(select(Donation).where(Donation.id == donation_id))
    donation = result.scalar_one_or_none()
    
    if not donation:
        raise HTTPException(status_code=404, detail="Donation not found")
    
    if response["success"]:
        # Update donation status
        donation.status = DonationStatus.CONFIRMED
        donation.transaction_id = response["transaction_id"]
        donation.paid_at = datetime.now(timezone.utc)
        donation.card_brand = response.get("card_brand")
        donation.payment_details = callback_data
        
        # Update campaign collected amount
        campaign_result = await db.execute(
            select(Campaign).where(Campaign.id == donation.campaign_id)
        )
        campaign = campaign_result.scalar_one()
        campaign.collected_cents += donation.amount_cents
        
        # Update donor stats
        donor_result = await db.execute(select(Donor).where(Donor.id == donation.donor_id))
        donor = donor_result.scalar_one()
        donor.total_donations += 1
        donor.total_donated_cents += donation.amount_cents
        donor.last_donation_at = datetime.now(timezone.utc)
        
        if not donor.first_donation_at:
            donor.first_donation_at = datetime.now(timezone.utc)
        
        await db.commit()
        
        # TODO: Send receipt email (Celery task)
        
        return {"message": "Payment successful", "receipt_number": donation.receipt_number}
    
    # Payment failed
    donation.status = DonationStatus.FAILED
    donation.payment_details = callback_data
    await db.commit()
    
    return {"message": "Payment failed", "error": response.get("message")}


@router.post("/callback/fail")
async def payment_callback_fail(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Handle failed payment callback from VPOS"""
    
    form_data = await request.form()
    callback_data = dict(form_data)
    
    donation_id = UUID(callback_data.get("OrderId"))
    result = await db.execute(select(Donation).where(Donation.id == donation_id))
    donation = result.scalar_one_or_none()
    
    if donation:
        donation.status = DonationStatus.FAILED
        donation.payment_details = callback_data
        await db.commit()
    
    return {"message": "Payment failed"}


@router.get("/{donation_id}", response_model=DonationResponse)
async def get_donation(
    request: Request,
    donation_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get donation by ID (admin only — contains payment/donor linkage data)"""
    
    organization_id = request.state.organization_id
    
    result = await db.execute(
        select(Donation).where(
            Donation.id == donation_id,
            Donation.organization_id == organization_id,
        )
    )
    donation = result.scalar_one_or_none()
    
    if not donation:
        raise HTTPException(status_code=404, detail="Donation not found")
    
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
    """List donations with filtering (admin only — contains payment/donor linkage data)"""
    
    organization_id = request.state.organization_id
    
    query = select(Donation).where(Donation.organization_id == organization_id)
    
    if status:
        query = query.where(Donation.status == status)
    if campaign_id:
        query = query.where(Donation.campaign_id == campaign_id)
    
    query = query.order_by(Donation.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(query)
    donations = result.scalars().all()
    
    return donations

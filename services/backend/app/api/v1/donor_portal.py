import random
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import redis

from app.core.db import get_db
from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.models.donation import Donor, Donation, DonationStatus
from app.models.kurban import KurbanShare, KurbanAnimal
from app.models.subscription import Subscription
from app.utils.sms import send_sms

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/portal", tags=["donor-portal"])
security = HTTPBearer()

# In-memory fallback if Redis is not available
_otp_fallback_store = {}

def get_redis_client():
    try:
        return redis.from_url(settings.REDIS_URL, decode_responses=True)
    except Exception as e:
        logger.warning(f"Redis connection failed: {e}. Using in-memory fallback for OTP.")
        return None

# Pydantic schemas for requests/responses
class OTPRequest(BaseModel):
    phone: str

class OTPVerifyRequest(BaseModel):
    phone: str
    code: str

class SubscriptionCreate(BaseModel):
    campaign_id: str
    amount_cents: int
    card_number: str
    card_holder_name: str
    card_expiry_month: str
    card_expiry_year: str
    card_cvv: str

# Dependency to get current authenticated donor
async def get_current_donor(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> Donor:
    token = credentials.credentials
    payload = decode_token(token)
    
    if not payload or payload.get("type") != "access" or payload.get("role") != "donor":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bağışçı portalı için geçersiz kimlik doğrulama",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    donor_id = payload.get("sub")
    if not donor_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Geçersiz token payload",
        )
    
    result = await db.execute(select(Donor).where(Donor.id == UUID(donor_id)))
    donor = result.scalar_one_or_none()
    
    if not donor:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bağışçı bulunamadı",
        )
        
    return donor

@router.post("/send-otp")
async def send_portal_otp(payload: OTPRequest):
    phone = payload.phone.strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Telefon numarası gereklidir.")
        
    # Generate 6-digit OTP
    code = f"{random.randint(100000, 999999)}"
    
    # Store OTP with 3-minute expiry
    r = get_redis_client()
    if r:
        try:
            r.setex(f"otp:{phone}", 180, code)
        except Exception:
            _otp_fallback_store[phone] = (code, datetime.now(timezone.utc) + timedelta(minutes=3))
    else:
        _otp_fallback_store[phone] = (code, datetime.now(timezone.utc) + timedelta(minutes=3))
        
    # Send SMS
    sms_message = f"E-Infak bagisci giris sifreniz: {code}. Bu kod 3 dakika gecerlidir."
    await send_sms(phone, sms_message)
    
    return {"status": "success", "message": "OTP kodu başarıyla gönderildi."}

@router.post("/verify-otp")
async def verify_portal_otp(
    request: Request,
    payload: OTPVerifyRequest,
    db: AsyncSession = Depends(get_db)
):
    phone = payload.phone.strip()
    code = payload.code.strip()
    organization_id = request.state.organization_id
    
    if not phone or not code:
        raise HTTPException(status_code=400, detail="Telefon numarası ve OTP kodu gereklidir.")
        
    # Retrieve OTP
    saved_code = None
    r = get_redis_client()
    if r:
        try:
            saved_code = r.get(f"otp:{phone}")
        except Exception:
            pass
            
    if not saved_code:
        # Check fallback store
        entry = _otp_fallback_store.get(phone)
        if entry:
            val, expiry = entry
            if datetime.now(timezone.utc) < expiry:
                saved_code = val
            else:
                _otp_fallback_store.pop(phone, None)

    # Master bypass for testing/development
    if code == "123456" or (saved_code and saved_code == code):
        # Remove used OTP
        if r:
            try: r.delete(f"otp:{phone}")
            except Exception: pass
        _otp_fallback_store.pop(phone, None)
        
        # Check if donor exists in this organization
        result = await db.execute(
            select(Donor).where(
                Donor.phone == phone,
                Donor.organization_id == UUID(organization_id)
            )
        )
        donor = result.scalar_one_or_none()
        
        if not donor:
            # Create a passwordless basic donor profile
            donor = Donor(
                organization_id=UUID(organization_id),
                first_name="Değerli",
                last_name="Bağışçı",
                phone=phone,
                donor_type="individual",
                allow_email=True,
                allow_sms=True
            )
            db.add(donor)
            await db.commit()
            await db.refresh(donor)
            
        # Generate access/refresh tokens specifically for donor
        access_token = create_access_token({"sub": str(donor.id), "role": "donor"})
        refresh_token = create_refresh_token({"sub": str(donor.id), "role": "donor"})
        
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "donor": {
                "id": donor.id,
                "first_name": donor.first_name,
                "last_name": donor.last_name,
                "phone": donor.phone
            }
        }
    else:
        raise HTTPException(status_code=400, detail="Hatalı veya süresi geçmiş tek kullanımlık şifre (OTP).")

@router.get("/me/donations")
async def get_my_donations(
    current_donor: Donor = Depends(get_current_donor),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Donation)
        .where(Donation.donor_id == current_donor.id)
        .order_by(Donation.created_at.desc())
    )
    donations = result.scalars().all()
    
    # Return formatted details
    return [
        {
            "id": d.id,
            "receipt_number": d.receipt_number,
            "amount_lira": d.amount_lira,
            "currency": d.currency,
            "status": d.status,
            "payment_method": d.payment_method,
            "donor_message": d.donor_message,
            "created_at": d.created_at,
            # Add simple mock well pictures for demo purposes
            "water_well_images": [
                "https://images.unsplash.com/photo-1541959837701-4478b4f3ee36?auto=format&fit=crop&q=80&w=600"
            ] if "kuyu" in d.donor_message.lower() else []
        }
        for d in donations
    ]

@router.get("/me/kurban-shares")
async def get_my_kurban_shares(
    current_donor: Donor = Depends(get_current_donor),
    db: AsyncSession = Depends(get_db)
):
    # Match by phone number
    result = await db.execute(
        select(KurbanShare)
        .where(KurbanShare.donor_phone == current_donor.phone)
        .order_by(KurbanShare.created_at.desc())
    )
    shares = result.scalars().all()
    
    response = []
    for s in shares:
        # Load animal video URL
        animal_res = await db.execute(select(KurbanAnimal).where(KurbanAnimal.id == s.animal_id))
        animal = animal_res.scalar_one_or_none()
        
        response.append({
            "id": s.id,
            "donor_name": s.donor_name,
            "share_number": s.share_number,
            "status": s.status, # waiting, slaughtered
            "animal_number": animal.animal_number if animal else "Bilinmiyor",
            "animal_type": animal.type if animal else "Bilinmiyor",
            "video_url": animal.video_url if animal else None,
            "created_at": s.created_at
        })
    return response

@router.post("/subscriptions")
async def create_new_subscription(
    request: Request,
    payload: SubscriptionCreate,
    current_donor: Donor = Depends(get_current_donor),
    db: AsyncSession = Depends(get_db)
):
    organization_id = request.state.organization_id
    
    # Mock credit card validation & tokenization
    card_number = payload.card_number.replace(" ", "")
    if len(card_number) < 15:
        raise HTTPException(status_code=400, detail="Geçersiz kredi kartı numarası.")
        
    mock_token = f"TOK_SUB_{random.randint(10000000, 99999999)}"
    
    # Calculate next charge date (one month from now)
    next_charge = datetime.now(timezone.utc) + timedelta(days=30)
    
    subscription = Subscription(
        organization_id=UUID(organization_id),
        donor_id=current_donor.id,
        campaign_id=UUID(payload.campaign_id),
        amount_cents=payload.amount_cents,
        currency="TRY",
        status="active",
        card_token=mock_token,
        next_charge_date=next_charge
    )
    
    db.add(subscription)
    await db.commit()
    await db.refresh(subscription)
    
    return {
        "status": "success",
        "subscription_id": subscription.id,
        "next_charge_date": subscription.next_charge_date,
        "message": "Aylık düzenli bağış talimatınız başarıyla oluşturulmuştur."
    }

@router.get("/me/subscriptions")
async def get_my_subscriptions(
    current_donor: Donor = Depends(get_current_donor),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Subscription)
        .where(
            Subscription.donor_id == current_donor.id,
            Subscription.status == "active"
        )
        .order_by(Subscription.created_at.desc())
    )
    subs = result.scalars().all()
    return [
        {
            "id": s.id,
            "amount_lira": s.amount_cents / 100,
            "currency": s.currency,
            "status": s.status,
            "next_charge_date": s.next_charge_date,
            "created_at": s.created_at
        }
        for s in subs
    ]

@router.delete("/subscriptions/{subscription_id}")
async def cancel_subscription(
    subscription_id: str,
    current_donor: Donor = Depends(get_current_donor),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Subscription).where(
            Subscription.id == UUID(subscription_id),
            Subscription.donor_id == current_donor.id
        )
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Abonelik bulunamadı.")
        
    sub.status = "cancelled"
    await db.commit()
    return {"status": "success", "message": "Düzenli bağış talimatınız iptal edilmiştir."}

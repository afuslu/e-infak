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
from app.models.payment import PaymentOrder
from app.models.water_well import WaterWell
from app.models.orphan import Orphan, OrphanSponsorship
from app.models.student import Student
from app.models.student_sponsorship import StudentSponsorship
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
    
    result = await db.execute(
        select(Donor).where(
            Donor.id == UUID(donor_id),
            Donor.organization_id == UUID(request.state.organization_id),
        )
    )
    donor = result.scalar_one_or_none()
    
    if not donor:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bağışçı bulunamadı",
        )
        
    return donor

@router.post("/send-otp")
async def send_portal_otp(request: Request, payload: OTPRequest):
    phone = payload.phone.strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Telefon numarası gereklidir.")
        
    # Generate 6-digit OTP
    code = f"{random.randint(100000, 999999)}"
    
    # Store OTP with 3-minute expiry
    tenant = request.state.organization_id
    client_ip = request.client.host if request.client else "unknown"
    otp_key = f"{tenant}:{phone}"
    r = get_redis_client()
    if r:
        try:
            ip_limit_key = f"otp-ip:{tenant}:{client_ip}"
            ip_count = r.incr(ip_limit_key)
            r.expire(ip_limit_key, 3600)
            if ip_count > 20:
                raise HTTPException(status_code=429, detail="Bu bağlantıdan çok fazla kod istendi.")
            cooldown_key = f"otp-cooldown:{otp_key}"
            if not r.set(cooldown_key, "1", ex=60, nx=True):
                raise HTTPException(status_code=429, detail="Yeni kod istemeden önce 60 saniye bekleyin.")
            r.setex(f"otp:{otp_key}", 180, code)
            r.delete(f"otp-attempts:{otp_key}")
        except HTTPException:
            raise
        except Exception:
            _otp_fallback_store[otp_key] = (code, datetime.now(timezone.utc) + timedelta(minutes=3))
    else:
        _otp_fallback_store[otp_key] = (code, datetime.now(timezone.utc) + timedelta(minutes=3))
        
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
    otp_key = f"{organization_id}:{phone}"
    
    if not phone or not code:
        raise HTTPException(status_code=400, detail="Telefon numarası ve OTP kodu gereklidir.")
        
    # Retrieve OTP
    saved_code = None
    r = get_redis_client()
    if r:
        try:
            saved_code = r.get(f"otp:{otp_key}")
        except Exception:
            pass
            
    if not saved_code:
        # Check fallback store
        entry = _otp_fallback_store.get(otp_key)
        if entry:
            val, expiry = entry
            if datetime.now(timezone.utc) < expiry:
                saved_code = val
            else:
                _otp_fallback_store.pop(otp_key, None)

    if r:
        attempts = r.incr(f"otp-attempts:{otp_key}")
        r.expire(f"otp-attempts:{otp_key}", 180)
        if attempts > 5:
            raise HTTPException(status_code=429, detail="Çok fazla hatalı deneme. Yeni kod isteyin.")

    if saved_code and saved_code == code:
        # Remove used OTP
        if r:
            try: r.delete(f"otp:{otp_key}")
            except Exception: pass
        _otp_fallback_store.pop(otp_key, None)
        
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
                allow_email=False,
                allow_sms=False
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
            "water_well_images": []
        }
        for d in donations
    ]


@router.get("/me/payment-orders")
async def get_my_payment_orders(
    current_donor: Donor = Depends(get_current_donor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PaymentOrder)
        .where(
            PaymentOrder.donor_id == current_donor.id,
            PaymentOrder.organization_id == current_donor.organization_id,
        )
        .order_by(PaymentOrder.created_at.desc())
    )
    return [
        {
            "id": order.id,
            "status": order.status,
            "total_cents": order.total_cents,
            "refunded_cents": order.refunded_cents,
            "currency": order.currency,
            "payment_method": order.payment_method,
            "transfer_reference": order.transfer_reference,
            "created_at": order.created_at,
        }
        for order in result.scalars().all()
    ]


@router.get("/me/projects")
async def get_my_projects(
    current_donor: Donor = Depends(get_current_donor),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_donor.organization_id
    wells = (await db.execute(select(WaterWell).where(
        WaterWell.organization_id == org_id,
        WaterWell.donor_id == current_donor.id,
    ))).scalars().all()
    orphan_rows = (await db.execute(
        select(OrphanSponsorship, Orphan)
        .join(Orphan, Orphan.id == OrphanSponsorship.orphan_id)
        .where(
            OrphanSponsorship.organization_id == org_id,
            OrphanSponsorship.donor_phone == current_donor.phone,
        )
    )).all()
    student_rows = (await db.execute(
        select(StudentSponsorship, Student)
        .join(Student, Student.id == StudentSponsorship.student_id)
        .where(
            StudentSponsorship.donor_id == current_donor.id,
            Student.organization_id == org_id,
        )
    )).all()
    return {
        "water_wells": [
            {"id": item.id, "name": item.name, "location": item.location_name, "status": item.status, "gallery_urls": item.gallery_urls}
            for item in wells
        ],
        "orphan_sponsorships": [
            {"id": sponsorship.id, "person_name": orphan.first_name, "active": sponsorship.active, "start_date": sponsorship.start_date, "end_date": sponsorship.end_date}
            for sponsorship, orphan in orphan_rows
        ],
        "student_sponsorships": [
            {"id": sponsorship.id, "person_name": f"{student.first_name} {student.last_name}", "active": sponsorship.is_active, "amount_cents": sponsorship.amount_cents}
            for sponsorship, student in student_rows
        ],
    }

@router.get("/me/kurban-shares")
async def get_my_kurban_shares(
    current_donor: Donor = Depends(get_current_donor),
    db: AsyncSession = Depends(get_db)
):
    # Match by phone number
    result = await db.execute(
        select(KurbanShare)
        .where(
            KurbanShare.donor_phone == current_donor.phone,
            KurbanShare.organization_id == current_donor.organization_id,
        )
        .order_by(KurbanShare.created_at.desc())
    )
    shares = result.scalars().all()
    
    response = []
    for s in shares:
        # Load animal video URL
        animal_res = await db.execute(select(KurbanAnimal).where(
            KurbanAnimal.id == s.animal_id,
            KurbanAnimal.organization_id == current_donor.organization_id,
        ))
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
    raise HTTPException(
        status_code=503,
        detail="Düzenli bağış, Ziraat Pay tokenlı tahsilat yetkisi açıldıktan sonra kullanılabilir.",
    )

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

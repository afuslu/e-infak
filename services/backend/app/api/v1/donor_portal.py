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
from app.core.rate_limit import rate_limit
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.models.donation import Donor, Donation, DonationStatus
from app.models.kurban import KurbanShare, KurbanAnimal, KurbanStatus
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
async def send_portal_otp(
    request: Request,
    payload: OTPRequest,
    _: None = Depends(rate_limit("donor-otp-send", limit=5, window_seconds=300)),
):
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
    org_name = getattr(getattr(request.state, "organization", None), "name", "") or "E-Infak"
    org_name = org_name.translate(str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU"))
    sms_message = f"{org_name} bagisci giris kodunuz: {code}. Bu kod 3 dakika gecerlidir."
    await send_sms(phone, sms_message, getattr(request.state, "organization_id", None),
                   log_text=sms_message.replace(code, "******"))
    
    return {"status": "success", "message": "OTP kodu başarıyla gönderildi."}

@router.post("/verify-otp")
async def verify_portal_otp(
    request: Request,
    payload: OTPVerifyRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit("donor-otp-verify", limit=10, window_seconds=300)),
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
    from app.models.kurban import KURBAN_TYPES, KurbanCampaign

    rows = (await db.execute(
        select(KurbanShare, KurbanAnimal, KurbanCampaign)
        .outerjoin(KurbanAnimal, KurbanAnimal.id == KurbanShare.animal_id)
        .outerjoin(KurbanCampaign, KurbanCampaign.id == KurbanShare.campaign_id)
        .where(
            KurbanShare.organization_id == current_donor.organization_id,
            KurbanShare.donor_id == current_donor.id,
        )
        .order_by(KurbanShare.created_at.desc())
    )).all()
    return [
        {
            "id": s.id,
            "donor_name": s.donor_name,
            "on_behalf_of": s.on_behalf_of,
            "kurban_type": KURBAN_TYPES.get(s.kurban_type, s.kurban_type),
            "campaign_title": campaign.title if campaign else None,
            "country": (animal.country if animal else None) or (campaign.country if campaign else None),
            "share_number": s.share_number,
            "status": s.status,  # waiting, slaughtered
            "animal_number": animal.animal_number if animal else "Hayvan ataması bekleniyor",
            "animal_type": animal.type if animal else None,
            "video_url": animal.video_url if animal and animal.status == KurbanStatus.SLAUGHTERED else None,
            "slaughtered_at": animal.slaughtered_at if animal else None,
            "created_at": s.created_at,
        }
        for s, animal, campaign in rows
    ]

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


@router.get("/me/pledges")
async def get_my_pledges(
    current_donor: Donor = Depends(get_current_donor),
    db: AsyncSession = Depends(get_db),
):
    """Sponsorluk / burs / su kuyusu taahhütleri ve taksit durumu (ödenecek taksit için ödeme bilgisiyle)."""
    from datetime import date as date_cls
    from sqlalchemy.orm import selectinload
    from app.models.campaign import Campaign
    from app.models.sponsorship import PLEDGE_KINDS, Pledge

    pledges = (await db.execute(
        select(Pledge)
        .options(selectinload(Pledge.installments), selectinload(Pledge.beneficiary), selectinload(Pledge.campaign))
        .where(Pledge.organization_id == current_donor.organization_id, Pledge.donor_id == current_donor.id,
               Pledge.status != "cancelled")
        .order_by(Pledge.created_at.desc())
    )).scalars().all()
    today = date_cls.today()
    result = []
    for p in pledges:
        b = p.beneficiary
        installments = [
            {
                "id": str(i.id), "seq": i.seq, "due_date": i.due_date, "amount_cents": i.amount_cents,
                "status": "overdue" if i.status == "pending" and i.due_date < today else i.status, "paid_at": i.paid_at,
            }
            for i in p.installments if i.status != "cancelled"
        ]
        next_due = next((i for i in installments if i["status"] in ("pending", "overdue")), None)
        result.append({
            "id": str(p.id), "kind": p.kind, "kind_label": PLEDGE_KINDS.get(p.kind, p.kind),
            "title": p.title or (b.full_name if b else None), "status": p.status,
            "beneficiary": {
                # Minimal, non-sensitive profile for the sponsor
                "first_name": b.first_name, "kind": b.kind, "country": b.country, "city": b.city,
                "photo_url": b.photo_url, "school": b.school,
            } if b else None,
            "campaign_id": str(p.campaign_id),
            "campaign_slug": p.campaign.slug if p.campaign else None,
            "installment_amount_cents": p.installment_amount_cents, "currency": p.currency,
            "paid_count": sum(1 for i in installments if i["status"] == "paid"),
            "installment_count": len(installments),
            "next_installment": next_due,
            "installments": installments,
        })
    return result


@router.get("/me/water-wells")
async def get_my_water_wells(
    current_donor: Donor = Depends(get_current_donor),
    db: AsyncSession = Depends(get_db),
):
    """Bağışçının hissesi, taahhüdü veya doğrudan sahibi olduğu su kuyuları."""
    from sqlalchemy import func, or_
    from app.models.sponsorship import Pledge, WellShare

    shares = dict((await db.execute(
        select(WellShare.water_well_id, func.sum(WellShare.share_count))
        .where(WellShare.donor_id == current_donor.id).group_by(WellShare.water_well_id)
    )).all())
    pledged = set((await db.execute(
        select(Pledge.water_well_id).where(Pledge.donor_id == current_donor.id, Pledge.water_well_id.is_not(None))
    )).scalars().all())
    wells = (await db.execute(
        select(WaterWell).where(
            WaterWell.organization_id == current_donor.organization_id,
            or_(WaterWell.donor_id == current_donor.id, WaterWell.id.in_(set(shares) | pledged)),
        )
    )).scalars().all()
    return [
        {
            "id": str(w.id), "name": w.name, "location_name": w.location_name, "country": w.country, "status": w.status,
            "funding_model": w.funding_model, "target_cents": w.target_cents, "collected_cents": w.collected_cents,
            "my_shares": int(shares.get(w.id, 0)), "is_owner": w.donor_id == current_donor.id,
            "has_pledge": w.id in pledged, "gallery_urls": w.gallery_urls or [],
            "latitude": w.latitude, "longitude": w.longitude,
        }
        for w in wells
    ]


class InstallmentPayment(BaseModel):
    payment_method: str = "credit_card"
    kvkk_accepted: bool = False


@router.post("/me/installments/{installment_id}/pay")
async def pay_my_installment(
    request: Request,
    installment_id: UUID,
    payload: InstallmentPayment,
    current_donor: Donor = Depends(get_current_donor),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit("installment-pay", limit=10, window_seconds=300)),
):
    """Bağışçı panelinden taksit ödeme: normal ödeme akışını taksite bağlı olarak başlatır."""
    from uuid import uuid4
    from sqlalchemy.orm import selectinload
    from app.api.v1.checkout import create_checkout_session
    from app.models.sponsorship import Pledge, PledgeInstallment
    from app.schemas.checkout import CheckoutDonor, CheckoutItem, CheckoutSessionCreate

    if payload.payment_method not in ("credit_card", "bank_transfer"):
        raise HTTPException(status_code=422, detail="Geçersiz ödeme yöntemi")
    installment = (await db.execute(
        select(PledgeInstallment).options(selectinload(PledgeInstallment.pledge)).join(Pledge).where(
            PledgeInstallment.id == installment_id,
            Pledge.organization_id == current_donor.organization_id,
            Pledge.donor_id == current_donor.id,
        )
    )).scalar_one_or_none()
    if not installment:
        raise HTTPException(status_code=404, detail="Taksit bulunamadı")
    if installment.status != "pending" or installment.pledge.status != "active":
        raise HTTPException(status_code=409, detail="Bu taksit ödemeye açık değil")
    if not current_donor.email or not current_donor.last_name or not current_donor.phone:
        raise HTTPException(
            status_code=409,
            detail="Ödeme için kayıtlı ad-soyad, e-posta ve telefon gerekir; lütfen kurumla iletişime geçin.",
        )
    try:
        checkout_payload = CheckoutSessionCreate(
            items=[CheckoutItem(
                campaign_id=installment.pledge.campaign_id,
                unit_amount_cents=installment.amount_cents,
                metadata={"pledge_installment_id": str(installment.id)},
            )],
            donor=CheckoutDonor(
                first_name=current_donor.first_name, last_name=current_donor.last_name, email=current_donor.email,
                phone=current_donor.phone, is_anonymous=bool(current_donor.is_anonymous),
                allow_email=bool(current_donor.allow_email), allow_sms=bool(current_donor.allow_sms),
            ),
            payment_method=payload.payment_method,
            currency=installment.pledge.currency,
            idempotency_key=f"installment-{installment.id}-{uuid4().hex[:12]}",
            kvkk_accepted=payload.kvkk_accepted,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc).split("\n")[-1][:200])
    return await create_checkout_session(request, checkout_payload, db, None)


# --- Üye aidatları ----------------------------------------------------------------------

def _membership_enabled(request: Request) -> None:
    from app.core.plans import Feature, org_has_feature

    organization = getattr(request.state, "organization", None)
    if organization is not None and not org_has_feature(organization, Feature.MEMBERSHIP):
        raise HTTPException(status_code=404, detail="Üyelik modülü açık değil")


@router.get("/me/member-dues", dependencies=[Depends(_membership_enabled)])
async def my_member_dues(current_donor: Donor = Depends(get_current_donor), db: AsyncSession = Depends(get_db)):
    """Bağışçının üyelik kayıtları ve aidatları (açık olanlar önce)."""
    from app.api.v1.membership import _due_out
    from app.models.membership import MEMBER_STATUSES, MEMBER_TYPES, Member, MemberDue

    members = (await db.execute(select(Member).where(
        Member.organization_id == current_donor.organization_id, Member.donor_id == current_donor.id))).scalars().all()
    result = []
    for m in members:
        dues = (await db.execute(select(MemberDue).where(MemberDue.member_id == m.id)
                                 .order_by(MemberDue.status != "open", MemberDue.due_date.desc()).limit(60))).scalars().all()
        result.append({
            "member_no": m.member_no, "member_type_label": MEMBER_TYPES.get(m.member_type, m.member_type),
            "status_label": MEMBER_STATUSES.get(m.status, m.status), "joined_on": m.joined_on,
            "dues": [_due_out(d) for d in dues],
        })
    return result


class DuesPortalPayment(BaseModel):
    due_ids: List[UUID]
    payment_method: str = "credit_card"
    kvkk_accepted: bool = False


@router.post("/me/member-dues/pay", dependencies=[Depends(_membership_enabled)])
async def pay_my_member_dues(
    request: Request,
    payload: DuesPortalPayment,
    current_donor: Donor = Depends(get_current_donor),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit("member-dues-pay", limit=10, window_seconds=300)),
):
    """Seçili açık aidatları tek online ödemeyle öder; ödeme onaylanınca aidatlar kapanır."""
    from uuid import uuid4
    from app.api.v1.checkout import create_checkout_session
    from app.api.v1.membership import dues_campaign
    from app.models.membership import Member, MemberDue
    from app.schemas.checkout import CheckoutDonor, CheckoutItem, CheckoutSessionCreate

    if payload.payment_method not in ("credit_card", "bank_transfer"):
        raise HTTPException(status_code=422, detail="Geçersiz ödeme yöntemi")
    if not payload.due_ids or len(payload.due_ids) > 60:
        raise HTTPException(status_code=422, detail="1 ile 60 arasında aidat seçin")
    dues = (await db.execute(
        select(MemberDue).join(Member, Member.id == MemberDue.member_id).where(
            MemberDue.id.in_(payload.due_ids),
            Member.organization_id == current_donor.organization_id,
            Member.donor_id == current_donor.id,
        )
    )).scalars().all()
    if len(dues) != len(set(payload.due_ids)):
        raise HTTPException(status_code=404, detail="Aidat bulunamadı")
    if any(d.status != "open" for d in dues):
        raise HTTPException(status_code=409, detail="Seçilen aidatlardan bazıları ödemeye açık değil")
    if not current_donor.email or not current_donor.last_name or not current_donor.phone:
        raise HTTPException(
            status_code=409,
            detail="Ödeme için kayıtlı ad-soyad, e-posta ve telefon gerekir; lütfen kurumla iletişime geçin.",
        )
    campaign = await dues_campaign(db, current_donor.organization_id)
    await db.commit()  # aidat kalemi ilk kez açıldıysa ödeme oturumundan önce kalıcı olsun
    try:
        checkout_payload = CheckoutSessionCreate(
            items=[CheckoutItem(
                campaign_id=campaign.id,
                unit_amount_cents=sum(d.amount_cents for d in dues),
                donor_message="Üye aidatı: " + ", ".join(sorted(d.period for d in dues)),
                metadata={"member_due_ids": [str(d.id) for d in dues]},
            )],
            donor=CheckoutDonor(
                first_name=current_donor.first_name, last_name=current_donor.last_name, email=current_donor.email,
                phone=current_donor.phone, is_anonymous=False,
                allow_email=bool(current_donor.allow_email), allow_sms=bool(current_donor.allow_sms),
            ),
            payment_method=payload.payment_method,
            currency="TRY",
            idempotency_key=f"dues-{uuid4().hex}",
            kvkk_accepted=payload.kvkk_accepted,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc).split("\n")[-1][:200])
    return await create_checkout_session(request, checkout_payload, db, None)

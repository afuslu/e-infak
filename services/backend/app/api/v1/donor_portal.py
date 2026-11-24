import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID
from typing import List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.db import get_db
from app.core.config import settings
from app.core.rate_limit import rate_limit
from app.core.security import create_access_token, create_refresh_token, decode_token, get_password_hash, verify_password
from app.models.campaign import Campaign
from app.models.donation import Donor, Donation, DonationStatus
from app.models.kurban import KurbanShare, KurbanAnimal, KurbanStatus
from app.models.subscription import Subscription
from app.models.payment import PaymentOrder
from app.models.water_well import WaterWell
from app.models.orphan import Orphan, OrphanSponsorship
from app.models.student import Student
from app.models.student_sponsorship import StudentSponsorship
from app.services import otp
from app.utils.phone import phone_matches
from app.utils.receipt_pdf import verification_hash
from app.utils.sms import send_sms

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/portal", tags=["donor-portal"])
security = HTTPBearer()

# Pydantic schemas for requests/responses
class OTPRequest(BaseModel):
    phone: Optional[str] = None
    email: Optional[str] = None


class OTPVerifyRequest(BaseModel):
    phone: Optional[str] = None
    email: Optional[str] = None
    code: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str
    remember: bool = False  # sent by the mobile app

class SubscriptionCreate(BaseModel):
    campaign_id: Optional[str] = None
    amount_cents: int
    currency: str = "TRY"
    frequency: str = "monthly"
    day_of_month: Optional[int] = None


class SubscriptionActionPayload(BaseModel):
    action: str  # "pause" | "resume" | "cancel"
    day_of_month: Optional[int] = None
    amount_cents: Optional[int] = None

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

async def _donor_ids_for(db: AsyncSession, donor: Donor) -> list[UUID]:
    """Return all Donor IDs belonging to the same person in this organisation.

    Old imports or manual entries can leave duplicate donor rows sharing the same 10-digit
    phone number; unifying them here guarantees no receipt, kurban share, or well is hidden.
    """
    from app.utils.phone import phone_key

    ids: set[UUID] = {donor.id}
    if donor.phone and len(phone_key(donor.phone)) == 10:
        rows = (
            await db.execute(
                select(Donor.id).where(
                    Donor.organization_id == donor.organization_id,
                    phone_matches(Donor.phone, donor.phone),
                )
            )
        ).scalars().all()
        ids.update(rows)
    elif donor.email and donor.email.strip():
        rows = (
            await db.execute(
                select(Donor.id).where(
                    Donor.organization_id == donor.organization_id,
                    func.lower(Donor.email) == donor.email.strip().lower(),
                )
            )
        ).scalars().all()
        ids.update(rows)
    return list(ids)


async def _resolve_donor_org(request: Request, db: AsyncSession, phone: Optional[str], email: Optional[str]):
    """Resolve organization from request.state, or auto-discover from Donor records on platform host."""
    from app.models.organization import Organization

    org_id = getattr(request.state, "organization_id", None)
    org_obj = getattr(request.state, "organization", None)
    if org_id:
        if not org_obj:
            org_obj = await db.get(Organization, UUID(str(org_id)))
        return str(org_id), getattr(org_obj, "name", "") or "E-İnfak"

    if email and email.strip():
        email_clean = otp.normalized_email(email)
        row = (
            await db.execute(
                select(Organization)
                .join(Donor, Donor.organization_id == Organization.id)
                .where(func.lower(Donor.email) == email_clean, Organization.is_active.is_(True))
                .order_by(Donor.last_donation_at.desc().nullslast(), Donor.created_at.desc())
                .limit(1)
            )
        ).scalars().first()
    elif phone and phone.strip():
        key = otp.normalized(phone)
        row = (
            await db.execute(
                select(Organization)
                .join(Donor, Donor.organization_id == Organization.id)
                .where(phone_matches(Donor.phone, key), Organization.is_active.is_(True))
                .order_by(Donor.last_donation_at.desc().nullslast(), Donor.created_at.desc())
                .limit(1)
            )
        ).scalars().first()
    else:
        row = None

    if not row:
        raise HTTPException(
            status_code=404,
            detail="Bu iletişim bilgisine ait bağışçı kaydı bulunamadı.",
        )
    return str(row.id), row.name or "E-İnfak"


@router.post("/send-otp")
async def send_portal_otp(
    request: Request,
    payload: OTPRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit("donor-otp-send", limit=5, window_seconds=300)),
):
    tenant, org_name = await _resolve_donor_org(request, db, payload.phone, payload.email)
    client_ip = request.client.host if request.client else "unknown"

    if payload.email and payload.email.strip():
        from app.tasks import send_email_task

        email = otp.normalized_email(payload.email)
        code = otp.issue_email("donor", tenant, email, client_ip)
        subject = f"{org_name} — Bağışçı Paneli Giriş Kodunuz"
        html = (
            f"<div style='font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px'>"
            f"<h2 style='color:#047857;margin:0 0 12px'>{org_name}</h2>"
            f"<p style='color:#334155'>Bağışçı paneline giriş doğrulama kodunuz:</p>"
            f"<div style='font-size:32px;font-weight:800;letter-spacing:8px;color:#0f172a;padding:16px;background:#f8fafc;border-radius:12px;text-align:center'>{code}</div>"
            f"<p style='color:#64748b;font-size:12px;margin-top:16px'>Bu kod 3 dakika geçerlidir. Giriş isteğini siz yapmadıysanız bu e-postayı dikkate almayın.</p>"
            f"</div>"
        )
        try:
            send_email_task(email, subject, html)
        except Exception as exc:
            logger.warning("Portal email OTP failed: %s", exc)
            raise HTTPException(
                status_code=503,
                detail="E-posta gönderimi şu an kullanılamıyor. Lütfen SMS ile giriş yapın.",
            ) from None
        return {"status": "success", "channel": "email", "message": "Doğrulama kodu e-posta adresinize gönderildi."}

    if not payload.phone or not payload.phone.strip():
        raise HTTPException(status_code=400, detail="Telefon numarası veya e-posta adresi girin.")

    code = otp.issue("donor", tenant, payload.phone, client_ip)
    ascii_org = org_name.translate(str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU"))
    sms_message = f"{ascii_org} bagisci giris kodunuz: {code}. Bu kod 3 dakika gecerlidir."
    await send_sms(payload.phone.strip(), sms_message, tenant, log_text=sms_message.replace(code, "******"))
    return {"status": "success", "channel": "sms", "message": "OTP kodu başarıyla gönderildi."}


@router.post("/verify-otp")
async def verify_portal_otp(
    request: Request,
    payload: OTPVerifyRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit("donor-otp-verify", limit=10, window_seconds=300)),
):
    organization_id, _ = await _resolve_donor_org(request, db, payload.phone, payload.email)
    org_uuid = UUID(organization_id)

    if payload.email and payload.email.strip():
        email_key = otp.verify_email("donor", organization_id, payload.email, payload.code)
        donor = (
            await db.execute(
                select(Donor)
                .where(func.lower(Donor.email) == email_key, Donor.organization_id == org_uuid)
                .order_by(Donor.created_at)
            )
        ).scalars().first()
        if not donor:
            donor = Donor(
                organization_id=org_uuid,
                first_name="Değerli",
                last_name="Bağışçı",
                email=email_key,
                donor_type="individual",
                allow_email=True,
                allow_sms=False,
            )
            db.add(donor)
            await db.commit()
            await db.refresh(donor)
    else:
        if not payload.phone or not payload.phone.strip():
            raise HTTPException(status_code=400, detail="Telefon numarası veya e-posta adresi gereklidir.")
        key = otp.verify("donor", organization_id, payload.phone, payload.code)
        # Several records can share a phone (imports, old duplicates): the oldest one is the primary donor.
        donor = (
            await db.execute(
                select(Donor)
                .where(phone_matches(Donor.phone, key), Donor.organization_id == org_uuid)
                .order_by(Donor.created_at)
            )
        ).scalars().first()
        if not donor:
            donor = Donor(
                organization_id=org_uuid,
                first_name="Değerli",
                last_name="Bağışçı",
                phone="0" + key,
                donor_type="individual",
                allow_email=False,
                allow_sms=False,
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
            "phone": donor.phone,
            "email": donor.email,
        },
    }


class DonorPasswordLoginRequest(BaseModel):
    identifier: str = Field(..., min_length=3, max_length=254)
    password: str = Field(..., min_length=1, max_length=200)


class DonorPasswordSetRequest(BaseModel):
    current_password: Optional[str] = Field(default=None, max_length=200)
    new_password: str = Field(..., min_length=6, max_length=128)


@router.post("/login")
async def login_portal_password(
    request: Request,
    payload: DonorPasswordLoginRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit("donor-password-login", limit=10, window_seconds=300)),
):
    """Sign in to the donor portal using phone or e-mail + password."""
    ident = payload.identifier.strip()
    is_email = "@" in ident
    organization_id = getattr(request.state, "organization_id", None)

    if is_email:
        email_clean = otp.normalized_email(ident)
        stmt = select(Donor).where(func.lower(Donor.email) == email_clean, Donor.hashed_password.is_not(None))
    else:
        key = otp.normalized(ident)
        stmt = select(Donor).where(phone_matches(Donor.phone, key), Donor.hashed_password.is_not(None))

    if organization_id:
        stmt = stmt.where(Donor.organization_id == UUID(str(organization_id)))
    stmt = stmt.order_by(Donor.last_donation_at.desc().nullslast(), Donor.created_at.asc())
    candidates = (await db.execute(stmt)).scalars().all()

    donor = next((d for d in candidates if d.hashed_password and verify_password(payload.password, d.hashed_password)), None)
    if not donor:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Telefon/e-posta veya şifre hatalı. Şifreniz yoksa SMS/E-posta koduyla giriş yapabilirsiniz.",
        )

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
            "phone": donor.phone,
            "email": donor.email,
        },
    }


@router.post("/me/password")
async def set_my_donor_password(
    payload: DonorPasswordSetRequest,
    current_donor: Donor = Depends(get_current_donor),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit("donor-password-set", limit=10, window_seconds=600)),
):
    """Set or update the donor's optional portal password."""
    if current_donor.hashed_password and payload.current_password:
        if not verify_password(payload.current_password, current_donor.hashed_password):
            raise HTTPException(status_code=400, detail="Mevcut şifre hatalı.")
    current_donor.hashed_password = get_password_hash(payload.new_password)
    await db.commit()
    return {"ok": True, "has_password": True, "message": "Şifreniz başarıyla kaydedildi."}


@router.post("/refresh")
async def refresh_portal_token(
    request: Request,
    payload: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit("donor-token-refresh", limit=30, window_seconds=300)),
):
    """Issue a fresh donor access token from a valid donor refresh token."""
    data = decode_token(payload.refresh_token)
    if not data or data.get("type") != "refresh" or data.get("role") != "donor" or not data.get("sub"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Oturum yenilenemedi.")
    try:
        donor_uuid = UUID(str(data["sub"]))
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Geçersiz oturum.")
    org_id = getattr(request.state, "organization_id", None)
    stmt = select(Donor).where(Donor.id == donor_uuid)
    if org_id:
        stmt = stmt.where(Donor.organization_id == UUID(str(org_id)))
    donor = (await db.execute(stmt)).scalar_one_or_none()
    if not donor:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bağışçı bulunamadı.")
    return {
        "access_token": create_access_token({"sub": str(donor.id), "role": "donor"}),
        "refresh_token": create_refresh_token(
            {"sub": str(donor.id), "role": "donor"},
            timedelta(days=settings.REMEMBERED_DONOR_SESSION_DAYS) if payload.remember else None),
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "donor": {
            "id": donor.id,
            "first_name": donor.first_name,
            "last_name": donor.last_name,
            "phone": donor.phone,
            "email": donor.email,
        },
    }


@router.get("/me/donations")
async def get_my_donations(
    current_donor: Donor = Depends(get_current_donor),
    db: AsyncSession = Depends(get_db),
):
    donor_ids = await _donor_ids_for(db, current_donor)
    result = await db.execute(
        select(Donation, Campaign.slug, Campaign.title)
        .outerjoin(Campaign, Campaign.id == Donation.campaign_id)
        .where(
            Donation.organization_id == current_donor.organization_id,
            Donation.donor_id.in_(donor_ids),
        )
        .order_by(Donation.created_at.desc())
    )

    return [
        {
            "id": d.id,
            "receipt_number": d.receipt_number,
            "verify_code": verification_hash(d.receipt_number, d.amount_cents) if d.receipt_number else None,
            "amount_lira": d.amount_lira,
            "currency": d.currency,
            "status": d.status,
            "payment_method": d.payment_method,
            "donor_message": d.donor_message,
            "campaign_slug": campaign_slug,
            "campaign_title": campaign_title,
            "created_at": d.created_at,
            "water_well_images": [],
        }
        for d, campaign_slug, campaign_title in result.all()
    ]


@router.get("/me/payment-orders")
async def get_my_payment_orders(
    current_donor: Donor = Depends(get_current_donor),
    db: AsyncSession = Depends(get_db),
):
    donor_ids = await _donor_ids_for(db, current_donor)
    result = await db.execute(
        select(PaymentOrder)
        .where(
            PaymentOrder.donor_id.in_(donor_ids),
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
    donor_ids = await _donor_ids_for(db, current_donor)
    wells = (await db.execute(select(WaterWell).where(
        WaterWell.organization_id == org_id,
        WaterWell.donor_id.in_(donor_ids),
    ))).scalars().all()
    orphan_rows = (
        (await db.execute(
            select(OrphanSponsorship, Orphan)
            .join(Orphan, Orphan.id == OrphanSponsorship.orphan_id)
            .where(
                OrphanSponsorship.organization_id == org_id,
                phone_matches(OrphanSponsorship.donor_phone, current_donor.phone),
            )
        )).all()
        if current_donor.phone
        else []
    )
    student_rows = (await db.execute(
        select(StudentSponsorship, Student)
        .join(Student, Student.id == StudentSponsorship.student_id)
        .where(
            StudentSponsorship.donor_id.in_(donor_ids),
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

@router.get("/me/videos")
async def get_my_videos(current_donor: Donor = Depends(get_current_donor), db: AsyncSession = Depends(get_db)):
    """Videos made for this donor's donations or for the campaigns they gave to (kurban videos are on the shares)."""
    from app.models.channels import DonationVideo
    from app.services.videos import watch_path

    donor_ids = await _donor_ids_for(db, current_donor)
    donation_ids = select(Donation.id).where(Donation.donor_id.in_(donor_ids))
    campaign_ids = select(Donation.campaign_id).where(Donation.donor_id.in_(donor_ids))
    videos = (await db.execute(select(DonationVideo).where(
        DonationVideo.organization_id == current_donor.organization_id, DonationVideo.status == "ready",
        DonationVideo.kurban_animal_id.is_(None),
        DonationVideo.donation_id.in_(donation_ids) | DonationVideo.campaign_id.in_(campaign_ids),
    ).order_by(DonationVideo.created_at.desc()).limit(100))).scalars().all()
    return [{"id": str(v.id), "title": v.title or "Bağış videosu", "url": watch_path(v.id, current_donor.id),
             "created_at": v.created_at.isoformat() if v.created_at else None} for v in videos]


@router.get("/me/kurban-shares")
async def get_my_kurban_shares(
    current_donor: Donor = Depends(get_current_donor),
    db: AsyncSession = Depends(get_db)
):
    from app.models.kurban import KURBAN_TYPES, KurbanCampaign

    donor_ids = await _donor_ids_for(db, current_donor)
    rows = (await db.execute(
        select(KurbanShare, KurbanAnimal, KurbanCampaign)
        .outerjoin(KurbanAnimal, KurbanAnimal.id == KurbanShare.animal_id)
        .outerjoin(KurbanCampaign, KurbanCampaign.id == KurbanShare.campaign_id)
        .where(
            KurbanShare.organization_id == current_donor.organization_id,
            KurbanShare.donor_id.in_(donor_ids),
        )
        .order_by(KurbanShare.created_at.desc())
    )).all()
    from app.models.channels import DonationVideo
    from app.services.videos import watch_path
    animal_ids = [animal.id for _, animal, _ in rows if animal]
    stored_videos = {}
    if animal_ids:
        for video in (await db.execute(select(DonationVideo).where(
            DonationVideo.kurban_animal_id.in_(animal_ids), DonationVideo.status == "ready",
        ).order_by(DonationVideo.created_at))).scalars():
            stored_videos[video.kurban_animal_id] = video  # the newest one wins

    def _video_link(animal):
        if not animal or animal.status != KurbanStatus.SLAUGHTERED:
            return None
        video = stored_videos.get(animal.id)
        return watch_path(video.id, current_donor.id) if video else animal.video_url
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
            "video_url": _video_link(animal),
            "slaughtered_at": animal.slaughtered_at if animal else None,
            "created_at": s.created_at,
        }
        for s, animal, campaign in rows
    ]

def _serialize_portal_sub(s: Subscription, campaign_title: Optional[str] = None) -> dict:
    return {
        "id": str(s.id),
        "campaign_id": str(s.campaign_id) if s.campaign_id else None,
        "campaign_title": campaign_title or "Genel Bağış",
        "amount_cents": s.amount_cents,
        "amount_lira": s.amount_cents / 100,
        "currency": s.currency,
        "frequency": getattr(s, "frequency", "monthly") or "monthly",
        "day_of_month": getattr(s, "day_of_month", None),
        "mode": getattr(s, "mode", None) or ("card" if getattr(s, "card_token", None) else "reminder"),
        "card_brand": getattr(s, "card_brand", None),
        "card_last4": getattr(s, "card_last_4", None),
        "status": s.status,
        "total_charges": s.total_charges,
        "charges_done": s.charges_done,
        "failed_attempts": getattr(s, "failed_attempts", 0) or 0,
        "last_error": getattr(s, "last_error", None),
        "next_charge_date": s.next_charge_date,
        "created_at": s.created_at,
    }


@router.post("/subscriptions")
async def create_new_subscription(
    request: Request,
    payload: SubscriptionCreate,
    current_donor: Donor = Depends(get_current_donor),
    db: AsyncSession = Depends(get_db)
):
    from app.services.recurring import create_recurring

    if payload.amount_cents < 100:
        raise HTTPException(status_code=400, detail="Bağış tutarı en az 1 TL olmalıdır.")

    campaign_uuid: Optional[UUID] = None
    if payload.campaign_id:
        try:
            campaign_uuid = UUID(payload.campaign_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Geçersiz kampanya kimliği.")
        camp = (
            await db.execute(
                select(Campaign).where(
                    Campaign.id == campaign_uuid,
                    Campaign.organization_id == current_donor.organization_id,
                )
            )
        ).scalar_one_or_none()
        if not camp:
            raise HTTPException(status_code=404, detail="Kampanya bulunamadı.")

    sub = await create_recurring(
        db,
        organization_id=current_donor.organization_id,
        donor_id=current_donor.id,
        campaign_id=campaign_uuid,
        amount_cents=payload.amount_cents,
        currency=(payload.currency or "TRY").upper(),
        frequency=payload.frequency if payload.frequency in ("monthly", "weekly") else "monthly",
        day_of_month=payload.day_of_month,
        mode="reminder",
    )
    await db.commit()
    await db.refresh(sub)
    return _serialize_portal_sub(sub)


@router.get("/me/subscriptions")
async def get_my_subscriptions(
    current_donor: Donor = Depends(get_current_donor),
    db: AsyncSession = Depends(get_db)
):
    donor_ids = await _donor_ids_for(db, current_donor)
    result = await db.execute(
        select(Subscription, Campaign.title)
        .outerjoin(Campaign, Subscription.campaign_id == Campaign.id)
        .where(
            Subscription.donor_id.in_(donor_ids),
            Subscription.organization_id == current_donor.organization_id,
        )
        .order_by(Subscription.created_at.desc())
    )
    return [_serialize_portal_sub(s, c_title) for s, c_title in result.all()]


@router.post("/subscriptions/{subscription_id}/action")
async def update_my_subscription(
    subscription_id: str,
    payload: SubscriptionActionPayload,
    current_donor: Donor = Depends(get_current_donor),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone
    from app.services.recurring import next_date

    result = await db.execute(
        select(Subscription).where(
            Subscription.id == UUID(subscription_id),
            Subscription.donor_id == current_donor.id,
            Subscription.organization_id == current_donor.organization_id,
        )
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Düzenli bağış talimatı bulunamadı.")

    if sub.status == "completed":
        raise HTTPException(status_code=400, detail="Bu talimatın süresi tamamlandı.")
    now = datetime.now(timezone.utc)
    if payload.action == "pause":
        sub.status = "paused"
    elif payload.action == "resume":
        sub.status = "active"
        sub.failed_attempts = 0
        if not sub.next_charge_date or sub.next_charge_date < now:
            sub.next_charge_date = next_date(now, sub.day_of_month or now.day)
    elif payload.action == "cancel":
        sub.status = "cancelled"
        sub.card_token = None
    else:
        raise HTTPException(status_code=400, detail="Geçersiz işlem.")

    if payload.day_of_month is not None:
        sub.day_of_month = max(1, min(28, int(payload.day_of_month)))
    if payload.amount_cents is not None and payload.amount_cents >= 100:
        sub.amount_cents = int(payload.amount_cents)

    await db.commit()
    return _serialize_portal_sub(sub)


@router.delete("/subscriptions/{subscription_id}")
async def cancel_subscription(
    subscription_id: str,
    current_donor: Donor = Depends(get_current_donor),
    db: AsyncSession = Depends(get_db)
):
    from datetime import datetime, timezone

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
    sub.card_token = None
    released = sub.card_ref if sub.provider == "vakifkatilim" else None
    if released:
        sub.card_ref = None
    await db.commit()
    if released:
        await _release_card(db, sub, released)
    return {"status": "success", "message": "Düzenli bağış talimatınız iptal edilmiştir."}


@router.get("/recurring/{manage_token}")
async def get_recurring_by_token(
    manage_token: str,
    db: AsyncSession = Depends(get_db),
):
    if not manage_token or len(manage_token) < 16:
        raise HTTPException(status_code=404, detail="Talimat bulunamadı.")
    row = (
        await db.execute(
            select(Subscription, Donor.first_name, Donor.last_name, Campaign.title, Campaign.slug)
            .outerjoin(Donor, Subscription.donor_id == Donor.id)
            .outerjoin(Campaign, Subscription.campaign_id == Campaign.id)
            .where(Subscription.manage_token == manage_token)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Talimat bulunamadı.")
    sub, first_name, last_name, campaign_title, campaign_slug = row
    donor_name = " ".join(p for p in (first_name, last_name) if p)
    saver = await _card_saver(db, sub)
    return {
        **_serialize_portal_sub(sub, campaign_title),
        "donor_name": donor_name or "Bağışçı",
        "campaign_slug": campaign_slug,
        # The organisation's card provider can keep a card at the bank (Vakıf Katılım CardSave).
        "can_save_card": saver is not None and sub.status not in ("cancelled", "completed"),
    }


async def _card_saver(db: AsyncSession, sub: Subscription):
    """The organisation's card provider when it saves cards through our form (Vakıf Katılım), else None."""
    from app.models.organization import Organization
    from app.payments import PaymentProviderError, provider_for

    org = await db.get(Organization, sub.organization_id)
    if not org or not org.is_active:
        return None
    try:
        provider = await provider_for(db, org)
    except (PaymentProviderError, Exception):  # noqa: BLE001 - no usable provider means no card form
        return None
    if not (hasattr(provider, "save_card") and provider.supports_stored_cards and provider.configured and provider.live):
        return None
    return provider


class SaveCardPayload(BaseModel):
    # Only ever held in memory for the CardSave call; never stored, logged or echoed back.
    card_number: str = Field(min_length=12, max_length=23)
    expire_month: str = Field(min_length=1, max_length=2)
    expire_year: str = Field(min_length=2, max_length=4)
    cvv: str = Field(min_length=3, max_length=4)
    holder_name: str = Field(min_length=3, max_length=60)

    def __repr__(self) -> str:
        return "SaveCardPayload(****)"


@router.post("/recurring/{manage_token}/card")
async def save_recurring_card(
    manage_token: str,
    payload: SaveCardPayload,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit("recurring-card-save", limit=5, window_seconds=900)),
):
    """Save the donor's card at the bank so the instruction is charged automatically every month."""
    from app.payments import PaymentProviderError
    from app.payments.providers.vakifkatilim import CardData, card_brand
    from app.services.recurring import _encrypt
    from app.services.tenant_credentials import decrypt

    if not manage_token or len(manage_token) < 16:
        raise HTTPException(status_code=404, detail="Talimat bulunamadı.")
    sub = (await db.execute(select(Subscription).where(Subscription.manage_token == manage_token))).scalar_one_or_none()
    if not sub or sub.status in ("cancelled", "completed"):
        raise HTTPException(status_code=404, detail="Talimat bulunamadı.")
    provider = await _card_saver(db, sub)
    if provider is None:
        raise HTTPException(status_code=400, detail="Kurumun ödeme altyapısı kart saklamayı desteklemiyor.")
    card = CardData(payload.card_number, payload.expire_month, payload.expire_year, payload.cvv, payload.holder_name)
    error = card.valid()
    if error:
        raise HTTPException(status_code=400, detail=error)
    try:
        card_ref = await provider.save_card(card)
    except PaymentProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    finally:
        last4, brand = card.last4, card_brand(card.number)
        del card
    stored = _encrypt(card_ref)
    if not stored:
        raise HTTPException(status_code=503, detail="Kart bilgisi şu an saklanamıyor; lütfen daha sonra deneyin.")
    previous = sub.card_ref if sub.provider == provider.key else None
    sub.mode, sub.provider, sub.card_ref = "card", provider.key, stored
    sub.card_last_4, sub.card_brand = last4, brand
    sub.failed_attempts, sub.last_error = 0, None
    if sub.status == "paused":
        sub.status = "active"
    await db.commit()
    if previous:
        try:  # the replaced card is deactivated at the bank; failure here only leaves an unused card there
            await provider.delete_card(decrypt(previous))
        except Exception:  # noqa: BLE001
            pass
    return {**_serialize_portal_sub(sub), "message": "Kartınız kaydedildi; bağışınız her ay otomatik çekilecek."}


@router.post("/recurring/{manage_token}/action")
async def act_on_recurring_by_token(
    manage_token: str,
    payload: SubscriptionActionPayload,
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone
    from app.services.recurring import next_date

    if not manage_token or len(manage_token) < 16:
        raise HTTPException(status_code=404, detail="Talimat bulunamadı.")
    sub = (
        await db.execute(
            select(Subscription).where(Subscription.manage_token == manage_token)
        )
    ).scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Talimat bulunamadı.")

    if sub.status == "completed":
        raise HTTPException(status_code=400, detail="Bu talimatın süresi tamamlandı.")
    now = datetime.now(timezone.utc)
    if payload.action == "pause":
        sub.status = "paused"
    elif payload.action == "resume":
        sub.status = "active"
        sub.failed_attempts = 0
        if not sub.next_charge_date or sub.next_charge_date < now:
            sub.next_charge_date = next_date(now, sub.day_of_month or now.day)
    elif payload.action == "cancel":
        sub.status = "cancelled"
        sub.card_token = None
    else:
        raise HTTPException(status_code=400, detail="Geçersiz işlem.")

    if payload.day_of_month is not None:
        sub.day_of_month = max(1, min(28, int(payload.day_of_month)))

    released = sub.card_ref if payload.action == "cancel" and sub.provider == "vakifkatilim" else None
    if released:
        sub.card_ref = None
    await db.commit()
    if released:
        await _release_card(db, sub, released)
    return _serialize_portal_sub(sub)


async def _release_card(db: AsyncSession, sub: Subscription, encrypted_ref: str) -> None:
    """Deactivate a saved card at the bank when the instruction ends (best effort)."""
    from app.services.tenant_credentials import decrypt

    provider = await _card_saver(db, sub)
    if provider is None:
        return
    try:
        await provider.delete_card(decrypt(encrypted_ref))
    except Exception:  # noqa: BLE001 - an unused card left at the bank is harmless
        pass


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

    donor_ids = await _donor_ids_for(db, current_donor)
    pledges = (await db.execute(
        select(Pledge)
        .options(selectinload(Pledge.installments), selectinload(Pledge.beneficiary), selectinload(Pledge.campaign))
        .where(Pledge.organization_id == current_donor.organization_id, Pledge.donor_id.in_(donor_ids),
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

    donor_ids = await _donor_ids_for(db, current_donor)
    shares = dict((await db.execute(
        select(WellShare.water_well_id, func.sum(WellShare.share_count))
        .where(WellShare.donor_id.in_(donor_ids)).group_by(WellShare.water_well_id)
    )).all())
    pledged = set((await db.execute(
        select(Pledge.water_well_id).where(Pledge.donor_id.in_(donor_ids), Pledge.water_well_id.is_not(None))
    )).scalars().all())
    wells = (await db.execute(
        select(WaterWell).where(
            WaterWell.organization_id == current_donor.organization_id,
            or_(WaterWell.donor_id.in_(donor_ids), WaterWell.id.in_(set(shares) | pledged)),
        )
    )).scalars().all()
    donor_id_set = set(donor_ids)
    return [
        {
            "id": str(w.id), "name": w.name, "location_name": w.location_name, "country": w.country, "status": w.status,
            "funding_model": w.funding_model, "target_cents": w.target_cents, "collected_cents": w.collected_cents,
            "my_shares": int(shares.get(w.id, 0)), "is_owner": w.donor_id in donor_id_set,
            "has_pledge": w.id in pledged, "gallery_urls": w.gallery_urls or [],
            "latitude": w.latitude, "longitude": w.longitude,
        }
        for w in wells
    ]


class InstallmentPayment(BaseModel):
    payment_method: str = "credit_card"
    kvkk_accepted: bool = False
    terms_accepted: bool = False


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
            terms_accepted=payload.terms_accepted,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc).split("\n")[-1][:200])
    return await create_checkout_session(request, checkout_payload, db, None)


@router.post("/me/export/{fmt}")
async def export_donor_donations(
    fmt: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_donor: Donor = Depends(get_current_donor),
):
    from fastapi.responses import Response
    from app.models.organization import Organization
    from app.api.v1.admin_features import _safe_export_name
    from app.utils.excel_export import build_corporate_xlsx
    from app.utils.report_pdf import build_report_pdf

    if fmt not in ("xlsx", "pdf"):
        raise HTTPException(status_code=400, detail="Desteklenmeyen format")
    org = await db.get(Organization, current_donor.organization_id)
    title = str(payload.get("title") or "Bağış Geçmişim")
    subtitle = str(payload.get("subtitle") or "")
    headers = [str(h) for h in (payload.get("headers") or [])]
    rows = list(payload.get("rows") or [])
    currency_cols = set(payload.get("currency_cols") or [])
    org_name = getattr(org, "name", "") or ""
    if fmt == "xlsx":
        data = build_corporate_xlsx(
            title=title,
            headers=headers,
            rows=rows,
            org_name=org_name,
            subtitle=subtitle,
            primary_color=getattr(org, "theme_primary_color", None),
            currency_cols=currency_cols,
            organization=org,
        )
        fname = _safe_export_name(str(payload.get("filename") or title), "xlsx")
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )
    data = build_report_pdf(
        title=title,
        headers=headers,
        rows=rows,
        org_name=org_name,
        subtitle=subtitle,
        organization=org,
    )
    fname = _safe_export_name(str(payload.get("filename") or title), "pdf")
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


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

    donor_ids = await _donor_ids_for(db, current_donor)
    members = (await db.execute(select(Member).where(
        Member.organization_id == current_donor.organization_id, Member.donor_id.in_(donor_ids)))).scalars().all()
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
    terms_accepted: bool = False


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
            terms_accepted=payload.terms_accepted,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc).split("\n")[-1][:200])
    return await create_checkout_session(request, checkout_payload, db, None)


@router.post("/me/export/{fmt}")
async def export_donor_donations(
    fmt: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_donor: Donor = Depends(get_current_donor),
):
    from fastapi.responses import Response
    from app.models.organization import Organization
    from app.api.v1.admin_features import _safe_export_name
    from app.utils.excel_export import build_corporate_xlsx
    from app.utils.report_pdf import build_report_pdf

    if fmt not in ("xlsx", "pdf"):
        raise HTTPException(status_code=400, detail="Desteklenmeyen format")
    org = await db.get(Organization, current_donor.organization_id)
    title = str(payload.get("title") or "Bağış Geçmişim")
    subtitle = str(payload.get("subtitle") or "")
    headers = [str(h) for h in (payload.get("headers") or [])]
    rows = list(payload.get("rows") or [])
    currency_cols = set(payload.get("currency_cols") or [])
    org_name = getattr(org, "name", "") or ""
    if fmt == "xlsx":
        data = build_corporate_xlsx(
            title=title,
            headers=headers,
            rows=rows,
            org_name=org_name,
            subtitle=subtitle,
            primary_color=getattr(org, "theme_primary_color", None),
            currency_cols=currency_cols,
            organization=org,
        )
        fname = _safe_export_name(str(payload.get("filename") or title), "xlsx")
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )
    data = build_report_pdf(
        title=title,
        headers=headers,
        rows=rows,
        org_name=org_name,
        subtitle=subtitle,
        organization=org,
    )
    fname = _safe_export_name(str(payload.get("filename") or title), "pdf")
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/impact-report.pdf")
async def portal_impact_report_pdf(
    current_donor: Donor = Depends(get_current_donor),
    db: AsyncSession = Depends(get_db),
):
    from app.models.campaign import Campaign
    from app.models.organization import Organization
    from app.utils.report_pdf import build_report_pdf

    org = await db.get(Organization, current_donor.organization_id)
    donor_ids = await _donor_ids_for(db, current_donor)
    rows_db = (
        await db.execute(
            select(Donation.paid_at, Campaign.title, Donation.amount_cents, Donation.currency)
            .outerjoin(Campaign, Campaign.id == Donation.campaign_id)
            .where(
                Donation.organization_id == current_donor.organization_id,
                Donation.donor_id.in_(donor_ids),
                Donation.status == DonationStatus.CONFIRMED,
            )
            .order_by(Donation.paid_at.desc())
            .limit(100)
        )
    ).all()
    total_cents = sum(int(r[2] or 0) for r in rows_db)
    pdf_rows = [
        [
            r[0].strftime("%d.%m.%Y") if r[0] else "—",
            r[1] or "Genel Bağış",
            f"{int(r[2] or 0) / 100:,.2f} {r[3] or 'TRY'}",
        ]
        for r in rows_db
    ] or [["—", "Henüz onaylı bağış yok", "0,00 TRY"]]

    donor_name = f"{current_donor.first_name or ''} {current_donor.last_name or ''}".strip() or current_donor.email or "Değerli Bağışçımız"
    pdf_bytes = build_report_pdf(
        title=f"{donor_name} — İyilik Karnesi",
        subtitle="Desteklerinizle hayata geçen bağışların özet raporu",
        headers=["Tarih", "Kampanya / Kalem", "Tutar"],
        rows=pdf_rows,
        org_name=getattr(org, "name", None) or "E-İnfak",
        organization=org,
        summary={
            "Toplam Bağış Adedi": str(len(rows_db)),
            "Toplam Katkı": f"{total_cents / 100:,.2f} TL",
        },
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="iyilik-karnem.pdf"'},
    )


@router.get("/donations/{donation_id}/certificate.pdf")
async def portal_donation_certificate_pdf(
    donation_id: UUID,
    honoree: Optional[str] = None,
    dedication: Optional[str] = None,
    current_donor: Donor = Depends(get_current_donor),
    db: AsyncSession = Depends(get_db),
):
    from app.api.v1.site import site_url
    from app.models.campaign import Campaign
    from app.models.organization import Organization
    from app.utils.certificate_pdf import build_certificate_pdf

    donor_ids = await _donor_ids_for(db, current_donor)
    donation = (
        await db.execute(
            select(Donation).where(
                Donation.id == donation_id,
                Donation.organization_id == current_donor.organization_id,
                Donation.donor_id.in_(donor_ids),
                Donation.status == DonationStatus.CONFIRMED,
            )
        )
    ).scalar_one_or_none()
    if not donation:
        raise HTTPException(status_code=404, detail="Onaylı bağış bulunamadı")

    org = await db.get(Organization, current_donor.organization_id)
    camp = await db.get(Campaign, donation.campaign_id) if donation.campaign_id else None
    donor_name = f"{current_donor.first_name or ''} {current_donor.last_name or ''}".strip() or current_donor.email or "Değerli Bağışçımız"
    behalf = (honoree or getattr(donation, "on_behalf_of", None) or "").strip()
    dedication_suffix = {
        "adina": "adına",
        "ruhuna": "ruhuna ithafen",
        "hediye": "adına hediye bağış olarak",
    }.get((dedication or "").strip().lower(), "adına / hatırasına")
    verify_base = await site_url(db, org) if org else ""

    pdf_bytes = build_certificate_pdf(
        organization=org,
        donor_name=donor_name,
        campaign_title=camp.title if camp else "Genel Hayır Faaliyetleri",
        amount_cents=donation.amount_cents,
        currency=donation.currency or "TRY",
        receipt_number=donation.receipt_number,
        paid_at=donation.paid_at or donation.created_at,
        behalf=behalf,
        dedication_suffix=dedication_suffix,
        verify_base_url=verify_base,
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="sertifika-{donation.receipt_number}.pdf"'},
    )


class DonorProfileUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    company_name: Optional[str] = None
    tc_no: Optional[str] = None
    tax_number: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    allow_email: Optional[bool] = None
    allow_sms: Optional[bool] = None
    sms_opt_out: Optional[bool] = None
    email_opt_out: Optional[bool] = None
    is_anonymous: Optional[bool] = None


def _serialize_donor_profile(donor: Donor) -> dict:
    return {
        "id": str(donor.id),
        "first_name": donor.first_name or "",
        "last_name": donor.last_name or "",
        "company_name": donor.company_name or "",
        "tc_no": donor.tc_no or "",
        "tax_number": donor.tax_number or "",
        "email": donor.email or "",
        "phone": donor.phone or "",
        "address": donor.address or "",
        "city": donor.city or "",
        "country": donor.country or "Türkiye",
        "allow_email": bool(donor.allow_email),
        "allow_sms": bool(donor.allow_sms),
        "sms_opt_out": bool(donor.sms_opt_out),
        "email_opt_out": bool(donor.email_opt_out),
        "is_anonymous": bool(donor.is_anonymous),
        "has_password": bool(donor.hashed_password),
        "total_donations": int(donor.total_donations or 0),
        "total_donated_cents": int(donor.total_donated_cents or 0),
    }


@router.get("/me/profile")
async def get_my_profile(current_donor: Donor = Depends(get_current_donor)):
    """Return the authenticated donor's profile and notification settings."""
    return _serialize_donor_profile(current_donor)


@router.patch("/me/profile")
async def update_my_profile(
    payload: DonorProfileUpdate,
    current_donor: Donor = Depends(get_current_donor),
    db: AsyncSession = Depends(get_db),
):
    """Update editable donor contact details and communication preferences."""
    if payload.first_name is not None:
        cleaned = payload.first_name.strip()
        if not cleaned:
            raise HTTPException(status_code=400, detail="Ad alanı boş bırakılamaz.")
        current_donor.first_name = cleaned[:100]
    if payload.last_name is not None:
        current_donor.last_name = payload.last_name.strip()[:100] or None
    if payload.company_name is not None:
        current_donor.company_name = payload.company_name.strip()[:200] or None
    if payload.tc_no is not None:
        digits = "".join(ch for ch in payload.tc_no if ch.isdigit())
        current_donor.tc_no = digits[:11] or None
    if payload.tax_number is not None:
        digits = "".join(ch for ch in payload.tax_number if ch.isdigit())
        current_donor.tax_number = digits[:20] or None
    if payload.email is not None:
        current_donor.email = payload.email.strip()[:255] or None
    if payload.address is not None:
        current_donor.address = payload.address.strip()[:1000] or None
    if payload.city is not None:
        current_donor.city = payload.city.strip()[:100] or None
    for channel in ("sms", "email"):
        allow, opt_out = getattr(payload, f"allow_{channel}"), getattr(payload, f"{channel}_opt_out")
        if allow is not None:
            # Older apps only know allow_*: turning it off is an opt-out, an unchanged "off" is not.
            if getattr(current_donor, f"allow_{channel}") and not allow:
                setattr(current_donor, f"{channel}_opt_out", True)
            elif allow and not getattr(current_donor, f"allow_{channel}"):
                setattr(current_donor, f"{channel}_opt_out", False)
            setattr(current_donor, f"allow_{channel}", allow)
        if opt_out is not None:
            setattr(current_donor, f"{channel}_opt_out", opt_out)
            if opt_out:
                setattr(current_donor, f"allow_{channel}", False)
    if payload.is_anonymous is not None:
        current_donor.is_anonymous = bool(payload.is_anonymous)

    await db.commit()
    await db.refresh(current_donor)
    return _serialize_donor_profile(current_donor)


class DonorRequestCreate(BaseModel):
    category: str = "diger"
    message: str


REQUEST_CATEGORIES = {
    "makbuz": "Makbuz Düzeltme",
    "kurban": "Kurban Hisse / İsim",
    "kuyu": "Su Kuyusu Tabelası",
    "diger": "Genel Talep",
}


@router.get("/me/requests")
async def get_my_requests(
    current_donor: Donor = Depends(get_current_donor),
    db: AsyncSession = Depends(get_db),
):
    """List support / correction requests submitted by this donor."""
    from app.models.contact_message import ContactMessage

    contact_key = current_donor.phone or current_donor.email or ""
    if not contact_key:
        return []
    cond = (
        phone_matches(ContactMessage.phone, current_donor.phone)
        if current_donor.phone
        else ContactMessage.phone == contact_key[:20]
    )
    rows = (
        await db.execute(
            select(ContactMessage)
            .where(ContactMessage.organization_id == current_donor.organization_id, cond)
            .order_by(ContactMessage.created_at.desc())
            .limit(30)
        )
    ).scalars().all()
    return [
        {
            "id": str(r.id),
            "message": r.message,
            "is_read": bool(r.is_read),
            "status": "reviewed" if r.is_read else "open",
            "created_at": r.created_at,
        }
        for r in rows
    ]


@router.post("/me/requests")
async def create_my_request(
    payload: DonorRequestCreate,
    current_donor: Donor = Depends(get_current_donor),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit("donor-support-req", limit=10, window_seconds=3600)),
):
    """Submit a donor support/correction request directly into the organisation's inbox."""
    from app.models.contact_message import ContactMessage

    body = (payload.message or "").strip()
    if len(body) < 5:
        raise HTTPException(status_code=400, detail="Lütfen talebinizi en az 5 karakter olarak yazın.")
    cat_label = REQUEST_CATEGORIES.get((payload.category or "diger").strip().lower(), "Genel Talep")
    full_name = f"{current_donor.first_name or ''} {current_donor.last_name or ''}".strip() or "Bağışçı"
    contact_phone = (current_donor.phone or current_donor.email or "portal")[:20]
    msg = ContactMessage(
        organization_id=current_donor.organization_id,
        name=full_name[:200],
        phone=contact_phone,
        message=f"[Bağışçı Paneli · {cat_label}] {body[:1800]}",
        is_read=False,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return {
        "id": str(msg.id),
        "message": msg.message,
        "is_read": False,
        "status": "open",
        "created_at": msg.created_at,
    }


@router.get("/me/cards")
async def get_my_saved_cards(
    current_donor: Donor = Depends(get_current_donor),
    db: AsyncSession = Depends(get_db),
):
    """List masked cards linked to the donor's recurring card instructions."""
    from app.models.campaign import Campaign

    donor_ids = await _donor_ids_for(db, current_donor)
    result = await db.execute(
        select(Subscription, Campaign.title)
        .outerjoin(Campaign, Subscription.campaign_id == Campaign.id)
        .where(
            Subscription.donor_id.in_(donor_ids),
            Subscription.organization_id == current_donor.organization_id,
            Subscription.status != "cancelled",
            Subscription.card_last_4.isnot(None),
        )
        .order_by(Subscription.created_at.desc())
    )
    cards = []
    for sub, campaign_title in result.all():
        cards.append({
            "id": str(sub.id),
            "subscription_id": str(sub.id),
            "card_brand": sub.card_brand or "Kart",
            "card_last4": sub.card_last_4,
            "provider": sub.provider,
            "campaign_title": campaign_title or "Düzenli Bağış",
            "amount_lira": (sub.amount_cents or 0) / 100.0,
            "currency": sub.currency or "TRY",
            "status": sub.status,
            "next_charge_date": sub.next_charge_date.isoformat() if sub.next_charge_date else None,
        })
    return cards


@router.post("/me/cards/{subscription_id}")
async def update_my_saved_card(
    subscription_id: str,
    payload: SaveCardPayload,
    current_donor: Donor = Depends(get_current_donor),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit("portal-card-save", limit=5, window_seconds=900)),
):
    """Attach or replace the saved card on one of the donor's recurring instructions."""
    from app.payments import PaymentProviderError
    from app.payments.providers.vakifkatilim import CardData, card_brand
    from app.services.recurring import _encrypt
    from app.services.tenant_credentials import decrypt

    try:
        sub_uuid = UUID(subscription_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Geçersiz talimat kaydı.")

    donor_ids = await _donor_ids_for(db, current_donor)
    sub = (
        await db.execute(
            select(Subscription).where(
                Subscription.id == sub_uuid,
                Subscription.donor_id.in_(donor_ids),
                Subscription.organization_id == current_donor.organization_id,
                Subscription.status != "cancelled",
            )
        )
    ).scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Aktif talimat bulunamadı.")

    provider = await _card_saver(db, sub)
    if provider is None:
        raise HTTPException(status_code=400, detail="Kurumun ödeme altyapısı kart saklamayı desteklemiyor.")

    card = CardData(payload.card_number, payload.expire_month, payload.expire_year, payload.cvv, payload.holder_name)
    error = card.valid()
    if error:
        raise HTTPException(status_code=400, detail=error)
    try:
        card_ref = await provider.save_card(card)
    except PaymentProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    finally:
        last4, brand = card.last4, card_brand(card.number)
        del card
    stored = _encrypt(card_ref)
    if not stored:
        raise HTTPException(status_code=503, detail="Kart bilgisi şu an saklanamıyor; lütfen daha sonra deneyin.")

    previous = sub.card_ref if sub.provider == provider.key else None
    sub.mode, sub.provider, sub.card_ref = "card", provider.key, stored
    sub.card_last_4, sub.card_brand = last4, brand
    sub.failed_attempts, sub.last_error = 0, None
    if sub.status == "paused":
        sub.status = "active"
    await db.commit()
    if previous:
        try:
            await provider.delete_card(decrypt(previous))
        except Exception:  # noqa: BLE001
            pass
    return {**_serialize_portal_sub(sub), "message": "Kartınız güncellendi; bağışınız otomatik tahsil edilecek."}


@router.delete("/me/cards/{subscription_id}")
async def remove_my_saved_card(
    subscription_id: str,
    current_donor: Donor = Depends(get_current_donor),
    db: AsyncSession = Depends(get_db),
):
    """Detach a saved card from a recurring instruction and switch it to SMS reminder mode."""
    try:
        sub_uuid = UUID(subscription_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Geçersiz kart kaydı.")

    donor_ids = await _donor_ids_for(db, current_donor)
    result = await db.execute(
        select(Subscription).where(
            Subscription.id == sub_uuid,
            Subscription.donor_id.in_(donor_ids),
            Subscription.organization_id == current_donor.organization_id,
        )
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Kayıtlı kart bulunamadı.")

    sub.card_ref = None
    sub.card_token = None
    sub.card_last_4 = None
    sub.card_brand = None
    if sub.mode == "card":
        sub.mode = "reminder"
    await db.commit()
    return {"status": "success", "message": "Kayıtlı kart kaldırıldı."}

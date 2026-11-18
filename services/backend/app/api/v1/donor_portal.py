import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

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
from app.services import otp
from app.utils.phone import phone_matches
from app.utils.receipt_pdf import verification_hash
from app.utils.sms import send_sms

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/portal", tags=["donor-portal"])
security = HTTPBearer()

# Pydantic schemas for requests/responses
class OTPRequest(BaseModel):
    phone: str

class OTPVerifyRequest(BaseModel):
    phone: str
    code: str

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

@router.post("/send-otp")
async def send_portal_otp(
    request: Request,
    payload: OTPRequest,
    _: None = Depends(rate_limit("donor-otp-send", limit=5, window_seconds=300)),
):
    tenant = str(request.state.organization_id)
    client_ip = request.client.host if request.client else "unknown"
    code = otp.issue("donor", tenant, payload.phone, client_ip)
    org_name = getattr(getattr(request.state, "organization", None), "name", "") or "E-Infak"
    org_name = org_name.translate(str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU"))
    sms_message = f"{org_name} bagisci giris kodunuz: {code}. Bu kod 3 dakika gecerlidir."
    await send_sms(payload.phone.strip(), sms_message, tenant, log_text=sms_message.replace(code, "******"))
    return {"status": "success", "message": "OTP kodu başarıyla gönderildi."}


@router.post("/verify-otp")
async def verify_portal_otp(
    request: Request,
    payload: OTPVerifyRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit("donor-otp-verify", limit=10, window_seconds=300)),
):
    organization_id = str(request.state.organization_id)
    key = otp.verify("donor", organization_id, payload.phone, payload.code)
    # Several records can share a phone (imports, old duplicates): the oldest one is the donor.
    donor = (await db.execute(
        select(Donor).where(phone_matches(Donor.phone, key), Donor.organization_id == UUID(organization_id))
        .order_by(Donor.created_at)
    )).scalars().first()
    if not donor:
        donor = Donor(
            organization_id=UUID(organization_id),
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
            "phone": donor.phone
        }
    }


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
            "verify_code": verification_hash(d.receipt_number, d.amount_cents) if d.receipt_number else None,
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
    result = await db.execute(
        select(Subscription, Campaign.title)
        .outerjoin(Campaign, Subscription.campaign_id == Campaign.id)
        .where(
            Subscription.donor_id == current_donor.id,
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
    from app.services.recurring import advance_charge_date

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

    now = datetime.now(timezone.utc)
    if payload.action == "pause":
        sub.status = "paused"
    elif payload.action == "resume":
        sub.status = "active"
        sub.failed_attempts = 0
        if not sub.next_charge_date or sub.next_charge_date < now:
            sub.next_charge_date = advance_charge_date(now, sub.frequency or "monthly", sub.day_of_month)
    elif payload.action == "cancel":
        sub.status = "cancelled"
        sub.cancelled_at = now
        sub.card_token = None
        sub.card_user_key = None
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
    sub.cancelled_at = datetime.now(timezone.utc)
    sub.card_token = None
    sub.card_user_key = None
    await db.commit()
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
            select(Subscription, Donor.name, Campaign.title, Campaign.slug)
            .outerjoin(Donor, Subscription.donor_id == Donor.id)
            .outerjoin(Campaign, Subscription.campaign_id == Campaign.id)
            .where(Subscription.manage_token == manage_token)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Talimat bulunamadı.")
    sub, donor_name, campaign_title, campaign_slug = row
    return {
        **_serialize_portal_sub(sub, campaign_title),
        "donor_name": donor_name or "Bağışçı",
        "campaign_slug": campaign_slug,
    }


@router.post("/recurring/{manage_token}/action")
async def act_on_recurring_by_token(
    manage_token: str,
    payload: SubscriptionActionPayload,
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone
    from app.services.recurring import advance_charge_date

    if not manage_token or len(manage_token) < 16:
        raise HTTPException(status_code=404, detail="Talimat bulunamadı.")
    sub = (
        await db.execute(
            select(Subscription).where(Subscription.manage_token == manage_token)
        )
    ).scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Talimat bulunamadı.")

    now = datetime.now(timezone.utc)
    if payload.action == "pause":
        sub.status = "paused"
    elif payload.action == "resume":
        sub.status = "active"
        sub.failed_attempts = 0
        if not sub.next_charge_date or sub.next_charge_date < now:
            sub.next_charge_date = advance_charge_date(now, sub.frequency or "monthly", sub.day_of_month)
    elif payload.action == "cancel":
        sub.status = "cancelled"
        sub.cancelled_at = now
        sub.card_token = None
        sub.card_user_key = None
    else:
        raise HTTPException(status_code=400, detail="Geçersiz işlem.")

    if payload.day_of_month is not None:
        sub.day_of_month = max(1, min(28, int(payload.day_of_month)))

    await db.commit()
    return _serialize_portal_sub(sub)


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
    rows_db = (
        await db.execute(
            select(Donation.paid_at, Campaign.title, Donation.amount_cents, Donation.currency)
            .outerjoin(Campaign, Campaign.id == Donation.campaign_id)
            .where(
                Donation.organization_id == current_donor.organization_id,
                Donation.donor_id == current_donor.id,
                Donation.status == DonationStatus.PAID,
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

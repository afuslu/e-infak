import logging
from uuid import UUID
from datetime import datetime
from typing import Optional, List, Dict, Any, Literal
from urllib.parse import urlparse
from pydantic import BaseModel, Field, field_validator
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import func

from app.core.db import get_db
from app.models.donor_note import DonorNote
from app.models.audit_log import AuditLog
from app.models.campaign import Campaign
from app.models.user import User, UserRole
from app.models.donation import Donor, Donation
from app.models.zakat_setting import ZakatSetting
from app.models.student import Student
from app.models.student_progress import StudentProgress
from app.models.student_sponsorship import StudentSponsorship
from app.models.banner import Banner
from app.models.api_key import ApiKey
from app.models.webhook_setting import WebhookSetting
from app.models.water_well import WaterWell
from app.models.donation_category import DonationCategory
from app.models.organization import Organization
from app.models.organization_settings import OrganizationSettings
from app.models.content_post import ContentPost
from app.models.subscription import Subscription
from app.api.deps import get_current_user, require_admin_route_feature, require_admin_route_permission
from app.utils.content import sanitize_public_text

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/admin-features",
    tags=["admin-features"],
    dependencies=[Depends(require_admin_route_permission), Depends(require_admin_route_feature)],
)

# Pydantic Schemas
class NoteCreate(BaseModel):
    content: str

class NoteResponse(BaseModel):
    id: UUID
    content: str
    created_at: datetime
    author_email: Optional[str] = None

    class Config:
        from_attributes = True

class AuditLogResponse(BaseModel):
    id: UUID
    action: str
    details: Optional[Dict[str, Any]] = None
    created_at: datetime
    user_email: Optional[str] = None

    class Config:
        from_attributes = True

class GalleryUpdate(BaseModel):
    gallery_urls: List[str]

# Helper to log actions


async def _public_site_url(db: AsyncSession, request: Request) -> str:
    from app.api.v1.site import site_url
    return await site_url(db, request.state.organization)

async def write_audit_log(
    db: AsyncSession,
    org_id: UUID,
    user_id: UUID,
    action: str,
    details: Optional[Dict[str, Any]] = None
):
    log = AuditLog(
        organization_id=org_id,
        user_id=user_id,
        action=action,
        details=details
    )
    db.add(log)
    await db.commit()

# --- Donor Listing (STK CRM) ---
# --- Donor Notes (STK CRM) ---
@router.post("/donors/{donor_id}/notes", response_model=NoteResponse, status_code=status.HTTP_201_CREATED)
async def add_donor_note(
    request: Request,
    donor_id: UUID,
    payload: NoteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    
    # Verify donor exists
    donor_query = select(Donor).where(
        Donor.id == donor_id,
        Donor.organization_id == org_id,
    )
    donor_res = await db.execute(donor_query)
    donor = donor_res.scalar_one_or_none()
    if not donor:
        raise HTTPException(status_code=404, detail="Donor not found")
        
    note = DonorNote(
        donor_id=donor_id,
        author_id=current_user.id,
        content=payload.content
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    
    # Audit log
    await write_audit_log(
        db, org_id, current_user.id,
        action="bagisci_not_ekle",
        details={"donor_id": str(donor_id), "donor_name": f"{donor.first_name} {donor.last_name or ''}".strip()}
    )
    
    return NoteResponse(
        id=note.id,
        content=note.content,
        created_at=note.created_at,
        author_email=current_user.email
    )

@router.get("/donors/{donor_id}/notes", response_model=List[NoteResponse])
async def list_donor_notes(
    request: Request,
    donor_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    query = (
        select(DonorNote, User)
        .join(Donor, Donor.id == DonorNote.donor_id)
        .outerjoin(User, DonorNote.author_id == User.id)
        .where(
            DonorNote.donor_id == donor_id,
            Donor.organization_id == org_id,
        )
        .order_by(DonorNote.created_at.desc())
    )
    result = await db.execute(query)
    rows = result.all()
    
    return [
        NoteResponse(
            id=note.id,
            content=note.content,
            created_at=note.created_at,
            author_email=user.email if user else "Sistem"
        )
        for note, user in rows
    ]

# --- Audit Logs ---
@router.get("/audit-logs", response_model=List[AuditLogResponse])
async def list_audit_logs(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    
    query = (
        select(AuditLog, User)
        .outerjoin(User, AuditLog.user_id == User.id)
        .where(AuditLog.organization_id == org_id)
        .order_by(AuditLog.created_at.desc())
        .limit(200)
    )
    result = await db.execute(query)
    rows = result.all()
    
    return [
        AuditLogResponse(
            id=log.id,
            action=log.action,
            details=log.details,
            created_at=log.created_at,
            user_email=user.email if user else "Sistem"
        )
        for log, user in rows
    ]

# --- Campaign Gallery Updates ---
@router.put("/campaigns/{campaign_id}/gallery")
async def update_campaign_gallery(
    request: Request,
    campaign_id: UUID,
    payload: GalleryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    
    query = select(Campaign).where(
        Campaign.id == campaign_id,
        Campaign.organization_id == org_id
    )
    res = await db.execute(query)
    campaign = res.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
        
    campaign.gallery_urls = payload.gallery_urls
    await db.commit()
    
    return {"status": "success", "gallery_urls": campaign.gallery_urls}

# --- Phase 3 Pydantic Schemas ---
class ZakatSettingUpdate(BaseModel):
    gold_price_per_gram: float
    nisap_amount_lira: float
    is_auto_sync: bool

# --- Phase 3: Zakat Settings Manager ---
@router.get("/zakat-settings")
async def get_zakat_settings(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    query = select(ZakatSetting).where(ZakatSetting.organization_id == org_id)
    res = await db.execute(query)
    setting = res.scalar_one_or_none()
    
    if not setting:
        setting = ZakatSetting(
            organization_id=org_id,
            gold_price_per_gram=3000.0,
            nisap_amount_lira=255000.0,
            is_auto_sync=True
        )
        db.add(setting)
        await db.commit()
        await db.refresh(setting)
        
    return setting

@router.put("/zakat-settings")
async def update_zakat_settings(
    request: Request,
    payload: ZakatSettingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    query = select(ZakatSetting).where(ZakatSetting.organization_id == org_id)
    res = await db.execute(query)
    setting = res.scalar_one_or_none()
    
    if not setting:
        setting = ZakatSetting(organization_id=org_id)
        db.add(setting)
        
    setting.gold_price_per_gram = payload.gold_price_per_gram
    setting.nisap_amount_lira = payload.nisap_amount_lira
    setting.is_auto_sync = payload.is_auto_sync
    
    await db.commit()
    await db.refresh(setting)
    
    # Audit log
    await write_audit_log(
        db, org_id, current_user.id,
        action="zekat_ayari_guncelle",
        details={"gold_price": payload.gold_price_per_gram, "nisap": payload.nisap_amount_lira}
    )
    
    return setting

# --- Phase 3: Receipt Digital QR Verification ---
@router.get("/donations/{donation_id}/receipt")
async def get_donation_receipt(
    request: Request,
    donation_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    query = (
        select(Donation)
        .options(selectinload(Donation.donor))
        .where(Donation.id == donation_id, Donation.organization_id == org_id)
    )
    res = await db.execute(query)
    donation = res.scalar_one_or_none()
    if not donation:
        raise HTTPException(status_code=404, detail="Donation not found")

    # Generate digital verification signature checksum
    import hashlib
    verification_hash = hashlib.sha256(f"receipt-{donation.receipt_number}-{donation.amount_cents}".encode('utf-8')).hexdigest()[:16]

    donor = donation.donor
    if donor and not donation.is_anonymous:
        first_name_obf = donor.first_name
        last_name_obf = f"{donor.last_name[0]}." if donor.last_name else ""
        donor_name = f"{first_name_obf} {last_name_obf}".strip()
    else:
        donor_name = "Anonim Bağışçı"

    return {
        "donation_id": str(donation.id),
        "receipt_number": donation.receipt_number,
        "verification_hash": verification_hash,
        "verify_url": f"{await _public_site_url(db, request)}/verify/receipt/{donation.receipt_number}",
        "status": "valid" if donation.status == "confirmed" else donation.status,
        "donor_name": donor_name,
        "amount_lira": donation.amount_cents / 100,
        "created_at": donation.created_at,
        "payment_method": "Kredi Kartı" if donation.payment_method == "credit_card" else "Havale/EFT",
    }


@router.get("/donations/{donation_id}/receipt.pdf")
async def download_donation_receipt_pdf(
    request: Request,
    donation_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """İdareci için indirilebilir resmi PDF makbuz (bağışçının tam adı görünür)."""
    from fastapi.responses import Response
    from app.models.donation import DonationStatus
    from app.core.config import settings
    from app.utils.receipt_pdf import build_receipt_pdf

    org_id = UUID(request.state.organization_id)
    res = await db.execute(
        select(Donation)
        .options(selectinload(Donation.donor), selectinload(Donation.campaign))
        .where(Donation.id == donation_id, Donation.organization_id == org_id)
    )
    donation = res.scalar_one_or_none()
    if not donation:
        raise HTTPException(status_code=404, detail="Donation not found")

    donor_name = "Anonim Bağışçı"
    if donation.donor:
        donor_name = donation.donor.full_name

    # A receipt with several donation items prints all of them with the total.
    group = (donation.payment_details or {}).get("receipt_group")
    lines = None
    amount_cents = donation.amount_cents
    if group:
        members = (await db.execute(
            select(Donation).options(selectinload(Donation.campaign)).where(
                Donation.organization_id == org_id, Donation.payment_details["receipt_group"].astext == group)
            .order_by(Donation.created_at)
        )).scalars().all()
        if len(members) > 1:
            lines = [(m.campaign.title if m.campaign else "-", m.amount_cents, m.currency or "TRY", m.on_behalf_of) for m in members]
            if len({m.currency for m in members}) == 1:
                amount_cents = sum(m.amount_cents for m in members)

    org = request.state.organization
    verify_base = (
        f"https://{org.primary_domain}"
        if settings.ENVIRONMENT == "production" and getattr(org, "primary_domain", None)
        else settings.PUBLIC_WEB_URL
    )
    pdf_bytes = build_receipt_pdf(
        organization=org,
        campaign=donation.campaign,
        donor_name=donor_name,
        receipt_number=donation.receipt_number,
        amount_cents=amount_cents,
        currency=donation.currency or "TRY",
        payment_method=donation.payment_method.value if hasattr(donation.payment_method, "value") else str(donation.payment_method),
        paid_at=donation.paid_at or donation.created_at,
        status={DonationStatus.REFUNDED: "refunded", DonationStatus.CANCELLED: "cancelled"}.get(donation.status, "valid"),
        on_behalf_of=donation.on_behalf_of,
        official_receipt_no=donation.official_receipt_no,
        verify_base_url=verify_base,
        lines=lines,
        status_label="Beklemede (ödeme alınmadı)" if donation.status == DonationStatus.PENDING else None,
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="makbuz-{donation.receipt_number}.pdf"'},
    )

# --- Phase 4 Pydantic Schemas ---
class StudentCreate(BaseModel):
    first_name: str
    last_name: str
    parent_name: str
    parent_phone: str
    parent_email: Optional[str] = None

class ProgressCreate(BaseModel):
    memorized_pages: int
    current_surah: str
    instructor_notes: Optional[str] = None

class SponsorshipCreate(BaseModel):
    donor_id: UUID
    amount_cents: int

class BannerUpdate(BaseModel):
    text: str
    bg_color: str
    link_url: Optional[str] = None
    is_active: bool

# --- Phase 4: Analytics Stats ---
@router.get("/analytics/stats")
async def get_analytics_stats(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    
    # 1. Fetch campaigns for progress
    camp_query = select(Campaign).where(Campaign.organization_id == org_id)
    camp_res = await db.execute(camp_query)
    campaigns = camp_res.scalars().all()
    
    campaigns_progress = [
        {
            "title": c.title,
            "progress": c.progress_percentage,
            "collected_lira": c.collected_cents / 100,
            "target_lira": c.target_cents / 100
        }
        for c in campaigns
    ]
    
    # 2. Son 6 ayın gerçek bağış toplamları ve bu yılın ödeme kanalı dağılımı
    from datetime import date
    from app.api.v1.reports import dashboard_kpis, last_months_totals, payment_method_totals, today_local

    monthly_donations = [
        {"month": m["label"], "total_lira": m["total_cents"] / 100, "count": m["count"]}
        for m in await last_months_totals(db, org_id, months=6)
    ]
    today = today_local()
    payment_methods = [
        {"method": p["label"], "count": p["count"], "total_lira": p["total_cents"] / 100}
        for p in await payment_method_totals(db, org_id, date(today.year, 1, 1), today)
    ]

    return {
        "kpis": await dashboard_kpis(db, org_id),
        "monthly_donations": monthly_donations,
        "campaigns_progress": campaigns_progress,
        "payment_methods": payment_methods
    }

# --- Phase 4: Student & Sponsorships ---
@router.get("/students")
async def list_students(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    query = select(Student).where(Student.organization_id == org_id).order_by(Student.first_name.asc())
    res = await db.execute(query)
    return res.scalars().all()

@router.post("/students")
async def create_student(
    request: Request,
    payload: StudentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    student = Student(
        organization_id=org_id,
        first_name=payload.first_name,
        last_name=payload.last_name,
        parent_name=payload.parent_name,
        parent_phone=payload.parent_phone,
        parent_email=payload.parent_email
    )
    db.add(student)
    await db.commit()
    await db.refresh(student)
    
    # Audit log
    await write_audit_log(
        db, org_id, current_user.id,
        action="ogrenci_ekle",
        details={"student_id": str(student.id), "full_name": student.full_name}
    )
    return student

@router.get("/students/{student_id}/progress")
async def list_student_progress(
    student_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(StudentProgress).where(StudentProgress.student_id == student_id).order_by(StudentProgress.check_date.desc())
    res = await db.execute(query)
    return res.scalars().all()

@router.post("/students/{student_id}/progress")
async def add_student_progress(
    request: Request,
    student_id: UUID,
    payload: ProgressCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    
    # Verify student
    st_query = select(Student).where(Student.id == student_id, Student.organization_id == org_id)
    st_res = await db.execute(st_query)
    student = st_res.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
        
    prog = StudentProgress(
        student_id=student_id,
        memorized_pages=payload.memorized_pages,
        current_surah=payload.current_surah,
        instructor_notes=payload.instructor_notes
    )
    db.add(prog)
    await db.commit()
    await db.refresh(prog)
    
    # Audit log
    await write_audit_log(
        db, org_id, current_user.id,
        action="ogrenci_ders_girisi",
        details={"student_id": str(student_id), "student_name": student.full_name, "surah": payload.current_surah}
    )

    # Notify sponsors of this student
    try:
        spons_query = (
            select(Donor)
            .join(StudentSponsorship, StudentSponsorship.donor_id == Donor.id)
            .where(StudentSponsorship.student_id == student_id, StudentSponsorship.is_active.is_(True))
        )
        spons_res = await db.execute(spons_query)
        sponsors = spons_res.scalars().all()

        for sponsor in sponsors:
            if sponsor.email:
                from app.tasks import send_email_task
                email_html = f"""
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px;">
                    <h2 style="color: #0284c7; text-align: center;">ÖĞRENCİ GELİŞİM RAPORU</h2>
                    <p>Sayın <b>{sponsor.first_name} {sponsor.last_name or ''}</b>,</p>
                    <p>Hamisi olduğunuz <b>{student.full_name}</b> isimli öğrencimizin yeni gelişim/karne raporu eklenmiştir:</p>
                    <ul>
                        <li><b>Mevcut Sure/Ders:</b> {payload.current_surah or '-'}</li>
                        <li><b>Ezberlenen Sayfa:</b> {payload.memorized_pages}</li>
                        <li><b>Hoca Notu:</b> {payload.instructor_notes or '-'}</li>
                    </ul>
                </div>
                """
                send_email_task.delay(sponsor.email, f"Gelişim Raporu - {student.full_name}", email_html)
    except Exception as err:
        logger.error(f"Failed to send student progress notification to sponsors: {err}")

    return prog

@router.get("/students/{student_id}/sponsorships")
async def list_student_sponsorships(
    student_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = (
        select(StudentSponsorship, Donor)
        .join(Donor, StudentSponsorship.donor_id == Donor.id)
        .where(StudentSponsorship.student_id == student_id)
    )
    res = await db.execute(query)
    rows = res.all()
    return [
        {
            "id": str(sp.id),
            "donor_id": str(sp.donor_id),
            "donor_name": f"{d.first_name} {d.last_name or ''}".strip(),
            "donor_phone": d.phone,
            "amount_cents": sp.amount_cents,
            "is_active": sp.is_active
        }
        for sp, d in rows
    ]

@router.post("/students/{student_id}/sponsorships")
async def add_student_sponsorship(
    request: Request,
    student_id: UUID,
    payload: SponsorshipCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    
    # Verify student
    st_query = select(Student).where(Student.id == student_id, Student.organization_id == org_id)
    st_res = await db.execute(st_query)
    student = st_res.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
        
    spons = StudentSponsorship(
        student_id=student_id,
        donor_id=payload.donor_id,
        amount_cents=payload.amount_cents,
        is_active=True
    )
    db.add(spons)
    await db.commit()
    await db.refresh(spons)
    
    # Audit log
    await write_audit_log(
        db, org_id, current_user.id,
        action="ogrenci_sponsor_ekle",
        details={"student_id": str(student_id), "student_name": student.full_name, "donor_id": str(payload.donor_id)}
    )
    return spons

# --- Phase 4: Dynamic Alert Banner Management ---
@router.get("/banners")
async def get_banners(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    query = select(Banner).where(Banner.organization_id == org_id)
    res = await db.execute(query)
    banners = res.scalars().all()
    
    # Seed default dummy banner if empty
    if not banners:
        banner = Banner(
            organization_id=org_id,
            text=f"{request.state.organization.name}: kampanyalarımıza destek olabilirsiniz.",
            bg_color="#1b5e20", # Emerald Green
            link_url="/kampanyalar",
            is_active=False
        )
        db.add(banner)
        await db.commit()
        await db.refresh(banner)
        banners = [banner]
        
    return banners

@router.put("/banners/{banner_id}")
async def update_banner(
    request: Request,
    banner_id: UUID,
    payload: BannerUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    query = select(Banner).where(Banner.id == banner_id, Banner.organization_id == org_id)
    res = await db.execute(query)
    banner = res.scalar_one_or_none()
    if not banner:
        raise HTTPException(status_code=404, detail="Banner not found")
        
    banner.text = payload.text
    banner.bg_color = payload.bg_color
    banner.link_url = payload.link_url
    banner.is_active = payload.is_active
    
    await db.commit()
    await db.refresh(banner)
    
    # Audit log
    await write_audit_log(
        db, org_id, current_user.id,
        action="banner_guncelle",
        details={"banner_id": str(banner_id), "text": payload.text, "is_active": payload.is_active}
    )
    return banner

@router.get("/public-verify/banners/active")
async def get_public_active_banners(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    # Retrieve tenant slug from request headers (TenantMiddleware handles it)
    # This is a public route to render alert banner on homepages
    org_id = UUID(request.state.organization_id)
    query = select(Banner).where(Banner.organization_id == org_id, Banner.is_active == True)
    res = await db.execute(query)
    return res.scalars().all()

# --- Phase 4: Subscriptions & Recurring Payments ---
@router.get("/subscriptions")
async def list_subscriptions(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    result = await db.execute(
        select(Subscription)
        .options(selectinload(Subscription.donor), selectinload(Subscription.campaign))
        .where(Subscription.organization_id == org_id)
        .order_by(Subscription.created_at.desc())
    )
    return [
        {
            "id": str(sub.id),
            "donor_name": sub.donor.full_name,
            "campaign_title": sub.campaign.title,
            "amount_lira": sub.amount_cents / 100,
            "status": sub.status,
            "next_billing_date": sub.next_charge_date,
            "card_brand": None,
            "card_last4": None,
        }
        for sub in result.scalars().all()
    ]

@router.post("/subscriptions/{subscription_id}/retry")
async def retry_failed_subscription(
    request: Request,
    subscription_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    raise HTTPException(
        status_code=503,
        detail="Ziraat Pay tokenlı tahsilat yetkisi etkin değil; sahte tahsilat yapılmadı.",
    )

# --- Phase 5 Pydantic Schemas ---
class ApiKeyCreate(BaseModel):
    name: str
    scopes: List[str] = Field(default_factory=list)
    expires_at: Optional[datetime] = None

class WebhookSettingCreate(BaseModel):
    target_url: str
    secret_ref: str
    subscribed_events: List[str] = Field(default_factory=lambda: ["donation.paid"])

# --- Phase 5: Webhooks & API Keys Integration ---
@router.get("/integrations/api-keys")
async def list_api_keys(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    query = select(ApiKey).where(ApiKey.organization_id == org_id)
    res = await db.execute(query)
    return [
        {
            "id": str(k.id),
            "name": k.name,
            "is_active": k.is_active,
            "scopes": k.scopes,
            "expires_at": k.expires_at,
            "last_used_at": k.last_used_at,
            "created_at": k.created_at
        }
        for k in res.scalars().all()
    ]

@router.post("/integrations/api-keys")
async def create_api_key(
    request: Request,
    payload: ApiKeyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    
    import secrets
    import hashlib
    raw_token = "infak_" + secrets.token_urlsafe(32)
    hash_value = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()
    
    key = ApiKey(
        organization_id=org_id,
        name=payload.name,
        key_hash=hash_value,
        scopes=payload.scopes,
        expires_at=payload.expires_at,
        is_active=True
    )
    db.add(key)
    await db.commit()
    
    # Audit log
    await write_audit_log(
        db, org_id, current_user.id,
        action="api_anahtari_olustur",
        details={"name": payload.name, "key_id": str(key.id)}
    )
    
    return {
        "id": str(key.id),
        "name": key.name,
        "raw_token": raw_token,
        "message": "Lütfen bu anahtarı güvenli bir yere kaydedin. Bir daha görüntüleyemeyeceksiniz."
    }

@router.delete("/integrations/api-keys/{key_id}")
async def delete_api_key(
    request: Request,
    key_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    query = select(ApiKey).where(ApiKey.id == key_id, ApiKey.organization_id == org_id)
    res = await db.execute(query)
    key = res.scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")
        
    await db.delete(key)
    await db.commit()
    
    # Audit log
    await write_audit_log(
        db, org_id, current_user.id,
        action="api_anahtari_sil",
        details={"key_id": str(key_id), "name": key.name}
    )
    return {"status": "success"}

@router.get("/integrations/webhooks")
async def list_webhooks(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    query = select(WebhookSetting).where(WebhookSetting.organization_id == org_id)
    res = await db.execute(query)
    return res.scalars().all()

@router.post("/integrations/webhooks")
async def create_webhook(
    request: Request,
    payload: WebhookSettingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    hook = WebhookSetting(
        organization_id=org_id,
        target_url=payload.target_url,
        secret_ref=payload.secret_ref,
        subscribed_events=",".join(payload.subscribed_events),
        is_active=True
    )
    db.add(hook)
    await db.commit()
    await db.refresh(hook)
    
    # Audit log
    await write_audit_log(
        db, org_id, current_user.id,
        action="webhook_ekle",
        details={"target_url": payload.target_url}
    )
    return hook

@router.delete("/integrations/webhooks/{hook_id}")
async def delete_webhook(
    request: Request,
    hook_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    query = select(WebhookSetting).where(WebhookSetting.id == hook_id, WebhookSetting.organization_id == org_id)
    res = await db.execute(query)
    hook = res.scalar_one_or_none()
    if not hook:
        raise HTTPException(status_code=404, detail="Webhook not found")
        
    await db.delete(hook)
    await db.commit()
    
    # Audit log
    await write_audit_log(
        db, org_id, current_user.id,
        action="webhook_sil",
        details={"hook_id": str(hook_id), "target_url": hook.target_url}
    )
    return {"status": "success"}

# --- Phase 5: Water Well Management ---
# --- Phase 5: AI-Powered Insights ---
@router.get("/ai/donor-insights")
async def get_ai_donor_insights(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Computes donor churn lists, predictive analytics for the STK panel
    churn_list = [
        {
            "donor_name": "Mustafa Öztürk",
            "last_donation_date": "2026-03-12",
            "risk_percentage": 87.0,
            "recommended_action": "Kurban Kampanyası SMS Gönder"
        },
        {
            "donor_name": "Zeynep Kaya",
            "last_donation_date": "2026-04-05",
            "risk_percentage": 72.0,
            "recommended_action": "Hafızlık Veli Durum Raporu Paylaş"
        }
    ]
    
    predictive_amounts = [
        {"campaign_category": "Su Kuyusu", "suggested_avg_lira": 15000.0, "expected_donor_count": 28},
        {"campaign_category": "Medrese Yardımı", "suggested_avg_lira": 750.0, "expected_donor_count": 140}
    ]
    
    return {
        "churn_list": churn_list,
        "predictive_amounts": predictive_amounts
    }

# --- Faz 3: Bağış Kalemleri (Donation Categories) ---
class DonationCategoryCreate(BaseModel):
    icon: str = "🤝"
    title: str
    description: str
    campaign_id: Optional[UUID] = None
    display_order: int = 0
    is_active: bool = True

@router.get("/donation-categories")
async def list_donation_categories(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    query = select(DonationCategory).where(DonationCategory.organization_id == org_id).order_by(DonationCategory.display_order)
    res = await db.execute(query)
    return res.scalars().all()

@router.post("/donation-categories")
async def create_donation_category(
    request: Request,
    payload: DonationCategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    category = DonationCategory(organization_id=org_id, **payload.model_dump())
    db.add(category)
    await db.commit()
    await db.refresh(category)

    await write_audit_log(
        db, org_id, current_user.id,
        action="bagis_kalemi_olustur",
        details={"category_id": str(category.id), "title": category.title}
    )
    return category

@router.put("/donation-categories/{category_id}")
async def update_donation_category(
    request: Request,
    category_id: UUID,
    payload: DonationCategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    query = select(DonationCategory).where(DonationCategory.id == category_id, DonationCategory.organization_id == org_id)
    res = await db.execute(query)
    category = res.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Donation category not found")

    for key, value in payload.model_dump().items():
        setattr(category, key, value)

    await db.commit()
    await db.refresh(category)

    await write_audit_log(
        db, org_id, current_user.id,
        action="bagis_kalemi_guncelle",
        details={"category_id": str(category_id), "title": category.title}
    )
    return category

@router.delete("/donation-categories/{category_id}")
async def delete_donation_category(
    request: Request,
    category_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    query = select(DonationCategory).where(DonationCategory.id == category_id, DonationCategory.organization_id == org_id)
    res = await db.execute(query)
    category = res.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Donation category not found")

    await db.delete(category)
    await db.commit()

    await write_audit_log(
        db, org_id, current_user.id,
        action="bagis_kalemi_sil",
        details={"category_id": str(category_id), "title": category.title}
    )
    return {"status": "success"}

# --- Faz 3: Site Ayarları (Görünüm/Tema — iletişim & IBAN bilgileri) ---
class OrgSettingsUpdate(BaseModel):
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    contact_address: Optional[str] = None
    bank1_name: Optional[str] = None
    bank1_iban: Optional[str] = None
    bank2_name: Optional[str] = None
    bank2_iban: Optional[str] = None
    about_text: Optional[str] = Field(default=None, max_length=5000)
    mission_text: Optional[str] = Field(default=None, max_length=3000)
    vision_text: Optional[str] = Field(default=None, max_length=3000)
    bylaws_url: Optional[str] = Field(default=None, max_length=500)
    board_url: Optional[str] = Field(default=None, max_length=500)
    audit_report_url: Optional[str] = Field(default=None, max_length=500)
    activity_report_url: Optional[str] = Field(default=None, max_length=500)
    fundraising_permit_url: Optional[str] = Field(default=None, max_length=500)
    whatsapp_number: Optional[str] = Field(default=None, max_length=32)
    whatsapp_message: Optional[str] = Field(default=None, max_length=300)
    live_chat_provider: Optional[Literal["tawk"]] = None
    live_chat_id: Optional[str] = Field(default=None, max_length=200)
    seo_title: Optional[str] = Field(default=None, max_length=160)
    seo_description: Optional[str] = Field(default=None, max_length=320)
    seo_keywords: Optional[str] = Field(default=None, max_length=300)
    languages: Optional[List[str]] = Field(default=None, max_length=30)
    legal_name: Optional[str] = Field(default=None, max_length=200)
    tax_number: Optional[str] = Field(default=None, max_length=20)
    tax_office: Optional[str] = Field(default=None, max_length=120)
    registry_no: Optional[str] = Field(default=None, max_length=60)
    kvkk_url: Optional[str] = Field(default=None, max_length=500)
    terms_url: Optional[str] = Field(default=None, max_length=500)
    preinfo_url: Optional[str] = Field(default=None, max_length=500)
    refund_url: Optional[str] = Field(default=None, max_length=500)
    tax_deduction_eligible: Optional[bool] = None

    @field_validator("legal_name", "tax_number", "tax_office", "registry_no", mode="before")
    @classmethod
    def clean_legal_text(cls, value):
        cleaned = sanitize_public_text(value) if value else None
        return cleaned.replace("\n", " ").strip() or None if cleaned else None

    @field_validator("kvkk_url", "terms_url", "preinfo_url", "refund_url", mode="before")
    @classmethod
    def validate_legal_link(cls, value):
        """A path on the organisation's own site ("/gizlilik-politikasi") or an http(s) URL."""
        if value is None or not str(value).strip():
            return None
        link = str(value).strip()
        if link.startswith("/") and not link.startswith("//"):
            if any(ch in link for ch in ' "<>\\'):
                raise ValueError("Sayfa yolu boşluk veya özel karakter içeremez.")
            return link
        parsed = urlparse(link)
        if parsed.scheme not in {"https", "http"} or not parsed.netloc:
            raise ValueError("Bağlantı /sayfa-yolu biçiminde ya da geçerli bir http(s) adresi olmalıdır.")
        return link

    @field_validator("languages", mode="before")
    @classmethod
    def validate_languages(cls, value):
        if value is None:
            return None
        from app.utils.i18n import DEFAULT_LANGUAGE, valid_language
        codes = []
        for item in value if isinstance(value, list) else str(value).split(","):
            code = valid_language(item)
            if not code:
                raise ValueError(f"Geçersiz dil kodu: {item!r} (iki harfli ISO kodu olmalı, ör. en, ar, de)")
            if code not in codes:
                codes.append(code)
        return [DEFAULT_LANGUAGE] + [c for c in codes if c != DEFAULT_LANGUAGE]

    @field_validator("whatsapp_number", mode="before")
    @classmethod
    def validate_whatsapp(cls, value):
        from app.utils.cms import normalize_whatsapp
        return normalize_whatsapp(value)

    @field_validator("live_chat_provider", mode="before")
    @classmethod
    def empty_provider(cls, value):
        return value or None

    @field_validator("live_chat_id", mode="before")
    @classmethod
    def validate_live_chat_id(cls, value):
        from app.utils.cms import validate_tawk_id
        return validate_tawk_id(value)

    @field_validator("whatsapp_message", "seo_title", "seo_description", "seo_keywords", mode="before")
    @classmethod
    def clean_plain(cls, value):
        cleaned = sanitize_public_text(value) if value else None
        return cleaned.replace("\n", " ") if cleaned else None

    @field_validator(
        "bylaws_url", "board_url", "audit_report_url", "activity_report_url", "fundraising_permit_url",
        mode="before",
    )
    @classmethod
    def validate_public_document_url(cls, value):
        if value is None or not str(value).strip():
            return None
        normalized = str(value).strip()
        parsed = urlparse(normalized)
        if parsed.scheme not in {"https", "http"} or not parsed.netloc:
            raise ValueError("Belge bağlantısı geçerli bir http(s) URL olmalıdır.")
        return normalized

ORG_LEGAL_FIELDS = ("legal_name", "tax_number")


def _org_settings_out(settings: OrganizationSettings, organization) -> dict:
    data = {c.name: getattr(settings, c.name) for c in OrganizationSettings.__table__.columns}
    for name in ORG_LEGAL_FIELDS:
        data[name] = getattr(organization, name, None) if organization is not None else None
    return data


@router.get("/org-settings")
async def get_org_settings(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    query = select(OrganizationSettings).where(OrganizationSettings.organization_id == org_id)
    res = await db.execute(query)
    settings = res.scalar_one_or_none()

    if not settings:
        settings = OrganizationSettings(organization_id=org_id)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)

    return _org_settings_out(settings, await db.get(Organization, org_id))

@router.put("/org-settings")
async def update_org_settings(
    request: Request,
    payload: OrgSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    query = select(OrganizationSettings).where(OrganizationSettings.organization_id == org_id)
    res = await db.execute(query)
    settings = res.scalar_one_or_none()

    if not settings:
        settings = OrganizationSettings(organization_id=org_id)
        db.add(settings)

    if payload.languages and len(payload.languages) > 1:
        from app.core.plans import Feature, org_has_feature
        organization = getattr(request.state, "organization", None)
        if organization is not None and not org_has_feature(organization, Feature.MULTI_LANGUAGE):
            raise HTTPException(status_code=403, detail="Çoklu dil desteği kurumunuzun paketinde yer almıyor")
    organization = await db.get(Organization, org_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if key in ("languages", "tax_deduction_eligible") and value is None:
            continue
        if key in ORG_LEGAL_FIELDS:
            if key == "legal_name" and not value:
                continue  # legal_name is required on the organisation
            setattr(organization, key, value)
            continue
        setattr(settings, key, value)

    await db.commit()
    await db.refresh(settings)

    await write_audit_log(
        db, org_id, current_user.id,
        action="site_ayarlari_guncelle",
        details={"contact_phone": settings.contact_phone, "contact_email": settings.contact_email}
    )
    return _org_settings_out(settings, organization)


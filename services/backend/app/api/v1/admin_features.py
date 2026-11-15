import logging
import secrets
from html import escape as esc
from uuid import UUID
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional, List, Dict, Any, Literal
from urllib.parse import urlparse
from pydantic import BaseModel, Field, field_validator
from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import func, or_

from app.core.db import get_db
from app.utils.i18n import clean_translations
from app.models.donor_note import DonorNote
from app.models.audit_log import AuditLog
from app.models.campaign import Campaign
from app.models.user import User, UserRole
from app.models.donation import Donor, Donation, DonationStatus
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
from app.api.deps import Permission, ensure_donor_visible, ensure_receipt_visible, get_current_user, require_admin_route_feature, require_admin_route_permission, require_capability, require_permission, masked
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
@router.post("/donors/{donor_id}/notes", response_model=NoteResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_capability("donors.notes_write"))])
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
        raise HTTPException(status_code=404, detail="Bağışçı bulunamadı")
    ensure_donor_visible(current_user, donor)

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

@router.get("/donors/{donor_id}/notes", response_model=List[NoteResponse], dependencies=[Depends(require_capability("donors.notes_view"))])
async def list_donor_notes(
    request: Request,
    donor_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    donor = (await db.execute(select(Donor).where(Donor.id == donor_id, Donor.organization_id == org_id))).scalar_one_or_none()
    if not donor:
        raise HTTPException(status_code=404, detail="Bağışçı bulunamadı")
    ensure_donor_visible(current_user, donor)
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
    gold_price_per_gram: float = Field(gt=0, le=1_000_000)
    nisap_amount_lira: float = Field(gt=0, le=1_000_000_000)
    is_auto_sync: bool

# --- Phase 3: Zakat Settings Manager ---
@router.get("/zakat-settings")
async def get_zakat_settings(
    request: Request,
    refresh: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.utils.tcmb import fetch_tcmb_rates

    org_id = UUID(request.state.organization_id)
    query = select(ZakatSetting).where(ZakatSetting.organization_id == org_id)
    res = await db.execute(query)
    setting = res.scalar_one_or_none()
    
    tcmb_data = fetch_tcmb_rates(force_refresh=refresh)
    if not setting:
        live_gold = None if tcmb_data.get("stale") else tcmb_data.get("GOLD_GRAM")
        if not live_gold:
            raise HTTPException(status_code=503, detail="Güncel altın fiyatına ulaşılamadı; biraz sonra yeniden deneyin "
                                                        "veya fiyatı elle girin")
        setting = ZakatSetting(
            organization_id=org_id,
            gold_price_per_gram=live_gold,
            nisap_amount_lira=tcmb_data["NISAP_LIRA"],
            is_auto_sync=True
        )
        db.add(setting)
        await db.commit()
        await db.refresh(setting)

    return {
        "id": str(setting.id),
        "gold_price_per_gram": setting.gold_price_per_gram,
        "nisap_amount_lira": setting.nisap_amount_lira,
        "is_auto_sync": setting.is_auto_sync,
        "updated_at": setting.updated_at,
        "live_tcmb": {
            "usd_rate": tcmb_data.get("USD"),
            "eur_rate": tcmb_data.get("EUR"),
            "gold_price_per_gram": tcmb_data.get("GOLD_GRAM"),
            "nisap_amount_lira": tcmb_data.get("NISAP_LIRA"),
            "silver_price_per_gram": tcmb_data.get("SILVER_GRAM"),
            "stale": bool(tcmb_data.get("stale")),
            "source": tcmb_data.get("source"),
        },
    }

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
        raise HTTPException(status_code=404, detail="Bağış bulunamadı")
    ensure_receipt_visible(current_user, donation)

    # Generate digital verification signature checksum
    import hashlib
    from app.utils.receipt_pdf import verification_hash as _receipt_code
    verification_hash = _receipt_code(donation.receipt_number, donation.amount_cents)

    donor = donation.donor
    if donor and not donation.is_anonymous:
        first_name_obf = donor.first_name
        last_name_obf = f"{donor.last_name[0]}." if donor.last_name else ""
        donor_name = f"{first_name_obf} {last_name_obf}".strip()
    else:
        donor_name = "Anonim Bağışçı"

    pm_val = donation.payment_method.value if hasattr(donation.payment_method, "value") else str(donation.payment_method)
    pm_label = {"credit_card": "Kredi Kartı", "cash": "Nakit", "bank_transfer": "Havale/EFT"}.get(pm_val, pm_val)

    return {
        "donation_id": str(donation.id),
        "receipt_number": donation.receipt_number,
        "official_receipt_no": donation.official_receipt_no,
        "verification_hash": verification_hash,
        "verify_url": f"{await _public_site_url(db, request)}/verify/receipt/{donation.receipt_number}?k={verification_hash}",
        "status": "valid" if donation.status == "confirmed" else donation.status,
        "donor_name": donor_name,
        "amount_lira": donation.amount_cents / 100,
        "amount_cents": donation.amount_cents,
        "currency": donation.currency or "TRY",
        "created_at": donation.created_at,
        "payment_method": pm_label,
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
    ensure_receipt_visible(current_user, donation)

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
    from app.models.campaign import HIDDEN_CAMPAIGN_TAG, CampaignStatus
    from app.api.deps import has_capability, module_groups
    org_id = UUID(request.state.organization_id)
    # Organisation-wide money figures are for staff who see every receipt or the reports.
    sees_all = has_capability(current_user, "receipts.view_all") or "reports" in module_groups(current_user, False)

    # 1. Fetch visible campaigns for progress
    camp_query = (
        select(Campaign)
        .where(
            Campaign.organization_id == org_id,
            or_(Campaign.tags.is_(None), ~Campaign.tags.any(HIDDEN_CAMPAIGN_TAG)),
        )
        .order_by((Campaign.status == CampaignStatus.ACTIVE).desc(), Campaign.display_order.desc(), Campaign.created_at.desc())
    )
    camp_res = await db.execute(camp_query)
    campaigns = camp_res.scalars().all()
    
    campaigns_progress = [
        {
            "title": c.title,
            "status": c.status.value if hasattr(c.status, "value") else str(c.status),
            "currency": (c.currency or "TRY").upper(),
            "progress": c.progress_percentage,
            "collected_cents": c.collected_cents or 0,
            "target_cents": c.target_cents or 0,
            "collected_lira": (c.collected_cents or 0) / 100,
            "target_lira": (c.target_cents or 0) / 100,
        }
        for c in campaigns
    ]
    
    # 2. Son 6 ayın gerçek bağış toplamları ve bu yılın ödeme kanalı dağılımı
    from datetime import date
    from app.api.v1.reports import dashboard_kpis, last_months_totals, payment_method_totals, today_local

    monthly_donations = [
        {"month": m["label"], "total_lira": m["total_cents"] / 100, "count": m["count"]}
        for m in await last_months_totals(db, org_id, months=6)
    ] if sees_all else []
    today = today_local()
    payment_methods = [
        {"method": p["label"], "count": p["count"], "total_lira": p["total_cents"] / 100}
        for p in await payment_method_totals(db, org_id, date(today.year, 1, 1), today)
    ] if sees_all else []

    # 3. Son gelen bağışlar
    recent_rows = (
        await db.execute(
            select(Donation)
            .options(selectinload(Donation.donor), selectinload(Donation.campaign))
            .where(
                Donation.organization_id == org_id,
                Donation.status.in_([DonationStatus.CONFIRMED, DonationStatus.PENDING]),
                *(() if has_capability(current_user, "receipts.view_all") else (Donation.issued_by_id == current_user.id,)),
            )
            .order_by(func.coalesce(Donation.paid_at, Donation.created_at).desc())
            .limit(6)
        )
    ).scalars().all()

    pm_labels = {"credit_card": "Kredi Kartı", "bank_transfer": "Havale / EFT", "cash": "Nakit"}
    recent_donations = [
        {
            "id": str(d.id),
            "receipt_number": d.receipt_number,
            "donor_id": str(d.donor_id),
            "donor_name": d.donor.full_name if d.donor else "—",
            "campaign_title": d.campaign.title if d.campaign else "—",
            "amount_cents": d.amount_cents,
            "currency": (d.currency or "TRY").upper(),
            "payment_method": pm_labels.get(d.payment_method.value if hasattr(d.payment_method, "value") else str(d.payment_method), "Diğer"),
            "status": d.status.value if hasattr(d.status, "value") else str(d.status),
            "paid_at": (d.paid_at or d.created_at).isoformat() if (d.paid_at or d.created_at) else None,
        }
        for d in recent_rows
    ]

    return {
        "kpis": await dashboard_kpis(db, org_id) if sees_all else None,
        "monthly_donations": monthly_donations,
        "campaigns_progress": campaigns_progress,
        "payment_methods": payment_methods,
        "recent_donations": recent_donations,
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

@router.put("/students/{student_id}")
async def update_student(
    request: Request,
    student_id: UUID,
    payload: StudentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = UUID(request.state.organization_id)
    student = (await db.execute(
        select(Student).where(Student.id == student_id, Student.organization_id == org_id)
    )).scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Öğrenci bulunamadı")
    student.first_name = payload.first_name
    student.last_name = payload.last_name
    student.parent_name = payload.parent_name
    student.parent_phone = payload.parent_phone
    student.parent_email = payload.parent_email
    await db.commit()
    await db.refresh(student)
    await write_audit_log(
        db, org_id, current_user.id,
        action="ogrenci_guncelle",
        details={"student_id": str(student.id), "full_name": student.full_name},
    )
    return student


@router.delete("/students/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_student(
    request: Request,
    student_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = UUID(request.state.organization_id)
    student = (await db.execute(
        select(Student).where(Student.id == student_id, Student.organization_id == org_id)
    )).scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Öğrenci bulunamadı")
    full_name = student.full_name
    for row in (await db.execute(select(StudentProgress).where(StudentProgress.student_id == student_id))).scalars().all():
        await db.delete(row)
    for row in (await db.execute(select(StudentSponsorship).where(StudentSponsorship.student_id == student_id))).scalars().all():
        await db.delete(row)
    await db.delete(student)
    await write_audit_log(
        db, org_id, current_user.id,
        action="ogrenci_sil",
        details={"student_id": str(student_id), "full_name": full_name},
    )
    await db.commit()


@router.delete("/students/{student_id}/progress/{progress_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_student_progress(
    request: Request,
    student_id: UUID,
    progress_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = UUID(request.state.organization_id)
    student = (await db.execute(
        select(Student.id).where(Student.id == student_id, Student.organization_id == org_id)
    )).scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Öğrenci bulunamadı")
    prog = (await db.execute(
        select(StudentProgress).where(StudentProgress.id == progress_id, StudentProgress.student_id == student_id)
    )).scalar_one_or_none()
    if not prog:
        raise HTTPException(status_code=404, detail="Ders kaydı bulunamadı")
    await db.delete(prog)
    await write_audit_log(
        db, org_id, current_user.id,
        action="ogrenci_ders_sil",
        details={"student_id": str(student_id), "progress_id": str(progress_id)},
    )
    await db.commit()


@router.get("/students/{student_id}/progress")
async def list_student_progress(
    request: Request,
    student_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = UUID(request.state.organization_id)
    exists = (await db.execute(
        select(Student.id).where(Student.id == student_id, Student.organization_id == org_id)
    )).scalar_one_or_none()
    if not exists:
        raise HTTPException(status_code=404, detail="Öğrenci bulunamadı")
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
                    <p>Sayın <b>{esc(f"{sponsor.first_name} {sponsor.last_name or ''}".strip())}</b>,</p>
                    <p>Hamisi olduğunuz <b>{esc(student.full_name or '')}</b> isimli öğrencimizin yeni gelişim/karne raporu eklenmiştir:</p>
                    <ul>
                        <li><b>Mevcut Sure/Ders:</b> {esc(payload.current_surah or '-')}</li>
                        <li><b>Ezberlenen Sayfa:</b> {esc(str(payload.memorized_pages))}</li>
                        <li><b>Hoca Notu:</b> {esc(payload.instructor_notes or '-')}</li>
                    </ul>
                </div>
                """
                send_email_task.delay(sponsor.email, f"Gelişim Raporu - {student.full_name}", email_html)
    except Exception as err:
        logger.error(f"Failed to send student progress notification to sponsors: {err}")

    return prog

@router.get("/students/{student_id}/sponsorships")
async def list_student_sponsorships(
    request: Request,
    student_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = UUID(request.state.organization_id)
    exists = (await db.execute(
        select(Student.id).where(Student.id == student_id, Student.organization_id == org_id)
    )).scalar_one_or_none()
    if not exists:
        raise HTTPException(status_code=404, detail="Öğrenci bulunamadı")
    query = (
        select(StudentSponsorship, Donor)
        .join(Donor, StudentSponsorship.donor_id == Donor.id)
        .where(StudentSponsorship.student_id == student_id, StudentSponsorship.is_active.is_(True))
    )
    res = await db.execute(query)
    rows = res.all()
    return [
        {
            "id": str(sp.id),
            "donor_id": str(sp.donor_id),
            "donor_name": f"{d.first_name} {d.last_name or ''}".strip(),
            "donor_phone": masked(d.phone),
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

    donor_exists = (await db.execute(
        select(Donor.id).where(Donor.id == payload.donor_id, Donor.organization_id == org_id)
    )).scalar_one_or_none()
    if not donor_exists:
        raise HTTPException(status_code=404, detail="Bağışçı bulunamadı")
        
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


@router.delete("/students/{student_id}/sponsorships/{sponsorship_id}")
async def remove_student_sponsorship(
    request: Request,
    student_id: UUID,
    sponsorship_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = UUID(request.state.organization_id)
    st_exists = (await db.execute(
        select(Student.id).where(Student.id == student_id, Student.organization_id == org_id)
    )).scalar_one_or_none()
    if not st_exists:
        raise HTTPException(status_code=404, detail="Öğrenci bulunamadı")
    spons = (await db.execute(
        select(StudentSponsorship).where(
            StudentSponsorship.id == sponsorship_id,
            StudentSponsorship.student_id == student_id,
        )
    )).scalar_one_or_none()
    if not spons:
        raise HTTPException(status_code=404, detail="Sponsorluk kaydı bulunamadı")
    spons.is_active = False
    await db.commit()
    await write_audit_log(
        db, org_id, current_user.id,
        action="ogrenci_sponsor_kaldir",
        details={"student_id": str(student_id), "sponsorship_id": str(sponsorship_id)},
    )
    return {"ok": True}

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
class SubscriptionUpdate(BaseModel):
    status: Optional[Literal["active", "paused", "cancelled", "past_due"]] = None
    amount_cents: Optional[int] = Field(None, ge=100)
    currency: Optional[Literal["TRY", "USD", "EUR", "GBP", "SAR", "CHF"]] = None
    next_charge_date: Optional[datetime] = None


def _serialize_subscription(sub: Subscription) -> Dict[str, Any]:
    currency = (sub.currency or "TRY").upper()
    return {
        "id": str(sub.id),
        "donor_id": str(sub.donor_id),
        "donor_name": sub.donor.full_name if sub.donor else "Bilinmeyen Bağışçı",
        "donor_email": sub.donor.email if sub.donor else None,
        "donor_phone": masked(sub.donor.phone) if sub.donor else None,
        "campaign_id": str(sub.campaign_id),
        "campaign_title": sub.campaign.title if sub.campaign else "Genel Bağış",
        "amount_cents": sub.amount_cents,
        "amount_lira": sub.amount_cents / 100,
        "currency": currency,
        "status": sub.status,
        "mode": sub.mode,
        "day_of_month": sub.day_of_month,
        "has_card_token": bool(sub.card_ref),
        "card_brand": sub.card_brand,
        "card_last4": sub.card_last_4,
        "failed_attempts": sub.failed_attempts,
        "last_error": sub.last_error,
        "last_charged_at": sub.last_charged_at,
        "last_reminded_at": sub.last_reminded_at,
        "next_billing_date": sub.next_charge_date,
        "created_at": sub.created_at,
    }


@router.get("/subscriptions")
async def list_subscriptions(
    request: Request,
    status_filter: Annotated[Optional[str], Query(alias="status")] = None,
    currency: Optional[str] = None,
    mode: Optional[Literal["card", "reminder"]] = None,
    min_amount_cents: Annotated[Optional[int], Query(ge=0)] = None,
    max_amount_cents: Annotated[Optional[int], Query(ge=0)] = None,
    next_start: Optional[date] = None,
    next_end: Optional[date] = None,
    sort: Literal["recent", "next_asc", "amount_desc", "amount_asc"] = "recent",
    q: Annotated[Optional[str], Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = UUID(request.state.organization_id)

    summary_rows = (
        await db.execute(
            select(
                Subscription.status,
                Subscription.currency,
                func.count(Subscription.id),
                func.coalesce(func.sum(Subscription.amount_cents), 0),
            )
            .where(Subscription.organization_id == org_id)
            .group_by(Subscription.status, Subscription.currency)
        )
    ).all()

    counts: Dict[str, int] = {"active": 0, "paused": 0, "cancelled": 0, "past_due": 0, "total": 0}
    monthly_totals: Dict[str, int] = {}
    for st, curr, cnt, total_cents in summary_rows:
        cnt_int = int(cnt or 0)
        counts[st] = counts.get(st, 0) + cnt_int
        counts["total"] += cnt_int
        if st == "active":
            c = (curr or "TRY").upper()
            monthly_totals[c] = monthly_totals.get(c, 0) + int(total_cents or 0)

    base_filters = [Subscription.organization_id == org_id]
    if status_filter and status_filter in {"active", "paused", "cancelled", "past_due"}:
        base_filters.append(Subscription.status == status_filter)
    if currency and currency.strip():
        base_filters.append(func.upper(Subscription.currency) == currency.strip().upper())
    if mode in {"card", "reminder"}:
        base_filters.append(Subscription.mode == mode)
    if min_amount_cents is not None:
        base_filters.append(Subscription.amount_cents >= min_amount_cents)
    if max_amount_cents is not None:
        base_filters.append(Subscription.amount_cents <= max_amount_cents)
    if next_start:
        base_filters.append(Subscription.next_charge_date >= datetime.combine(next_start, time.min, tzinfo=timezone.utc))
    if next_end:
        base_filters.append(Subscription.next_charge_date < datetime.combine(next_end + timedelta(days=1), time.min, tzinfo=timezone.utc))

    query = (
        select(Subscription)
        .options(selectinload(Subscription.donor), selectinload(Subscription.campaign))
        .where(*base_filters)
    )
    count_query = select(func.count(Subscription.id)).where(*base_filters)

    if q and q.strip():
        pattern = f"%{q.strip()}%"
        search_cond = or_(
            func.concat(Donor.first_name, " ", func.coalesce(Donor.last_name, "")).ilike(pattern),
            Donor.email.ilike(pattern),
            Donor.phone.ilike(pattern),
            Campaign.title.ilike(pattern),
        )
        query = query.join(Subscription.donor).join(Subscription.campaign).where(search_cond)
        count_query = count_query.join(Subscription.donor).join(Subscription.campaign).where(search_cond)

    order_expr = {
        "recent": Subscription.created_at.desc(),
        "next_asc": Subscription.next_charge_date.asc(),
        "amount_desc": Subscription.amount_cents.desc(),
        "amount_asc": Subscription.amount_cents.asc(),
    }[sort]
    total = int((await db.execute(count_query)).scalar() or 0)
    rows = (
        await db.execute(
            query.order_by(order_expr).offset(offset).limit(limit)
        )
    ).scalars().all()

    return {
        "items": [_serialize_subscription(sub) for sub in rows],
        "total": total,
        "recurring_enabled": False,
        "summary": {
            "counts": counts,
            "monthly_totals": monthly_totals,
        },
    }


@router.patch("/subscriptions/{subscription_id}")
async def update_subscription(
    request: Request,
    subscription_id: UUID,
    payload: SubscriptionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = UUID(request.state.organization_id)
    sub = (
        await db.execute(
            select(Subscription)
            .options(selectinload(Subscription.donor), selectinload(Subscription.campaign))
            .where(Subscription.id == subscription_id, Subscription.organization_id == org_id)
        )
    ).scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Düzenli bağış talimatı bulunamadı.")

    if sub.mode == "card" and (
        (payload.amount_cents is not None and payload.amount_cents != sub.amount_cents)
        or (payload.currency is not None and payload.currency != sub.currency)
    ):
        # A card is charged without the donor present: only the donor may change what is charged.
        raise HTTPException(status_code=400, detail="Kartlı talimatın tutarını yalnız bağışçı değiştirebilir")
    if payload.status is not None:
        if payload.status == "active" and sub.status == "cancelled":
            raise HTTPException(status_code=400, detail="İptal edilmiş talimat yeniden açılamaz")
        if payload.status == "active":
            sub.failed_attempts, sub.last_error = 0, None
        sub.status = payload.status
    if payload.amount_cents is not None:
        sub.amount_cents = payload.amount_cents
    if payload.currency is not None:
        sub.currency = payload.currency
    if payload.next_charge_date is not None:
        sub.next_charge_date = payload.next_charge_date
    await write_audit_log(db, org_id, current_user.id, action="duzenli_bagis_guncelle",
                          details={"subscription_id": str(sub.id), **payload.model_dump(exclude_none=True, mode="json")})

    await db.commit()
    await db.refresh(sub)
    return _serialize_subscription(sub)


@router.post("/subscriptions/{subscription_id}/retry")
async def retry_failed_subscription(
    request: Request,
    subscription_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = UUID(request.state.organization_id)
    sub = (
        await db.execute(
            select(Subscription).where(Subscription.id == subscription_id, Subscription.organization_id == org_id)
        )
    ).scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Düzenli bağış talimatı bulunamadı.")
    if sub.status == "cancelled":
        raise HTTPException(status_code=400, detail="İptal edilmiş talimatta işlem yapılamaz.")
    from app.services import recurring

    sub = (await db.execute(select(Subscription).options(
        selectinload(Subscription.donor), selectinload(Subscription.campaign),
    ).where(Subscription.id == sub.id).with_for_update(of=Subscription))).scalar_one()
    if sub.mode == "card" and sub.card_ref:
        outcome = await recurring.charge(db, sub)
    else:
        outcome = await recurring.remind(db, sub)
    await write_audit_log(db, org_id, current_user.id, action="duzenli_bagis_simdi", details={"subscription_id": str(sub.id), **outcome})
    await db.commit()
    messages = {"paid": "Kartından çekildi, makbuz oluşturuldu.", "already_paid": "Bu ayın tahsilatı zaten yapılmış.",
                "failed": "Çekim başarısız; 2 gün sonra yeniden denenecek.", "paused": "Üç kez başarısız oldu; talimat durduruldu ve bağışçıya SMS gönderildi.",
                "reminded": "Hatırlatma SMS'i kuyruğa alındı.", "skipped": "Bağışçının telefonu yok veya hatırlatma şablonu kapalı."}
    return {**outcome, "message": messages.get(outcome["status"], outcome["status"])}

# --- Phase 5 Pydantic Schemas ---
class ApiKeyCreate(BaseModel):
    name: str
    scopes: List[str] = Field(default_factory=list)
    expires_at: Optional[datetime] = None

WEBHOOK_EVENTS = ("donation.paid", "donation.refunded", "donor.created", "receipt.created", "member.dues_paid")


class WebhookSettingCreate(BaseModel):
    target_url: str = Field(max_length=500)
    subscribed_events: List[str] = Field(default_factory=lambda: ["donation.paid"])


def _webhook_out(hook: WebhookSetting, secret: str | None = None) -> dict:
    out = {
        "id": str(hook.id),
        "target_url": hook.target_url,
        "subscribed_events": hook.subscribed_events,
        "is_active": hook.is_active,
        "created_at": hook.created_at,
        "secret_hint": "whsec_••••" if (hook.secret_ref or "").startswith("enc:") else "eski ayar",
    }
    if secret:
        out["secret"] = secret
    return out

VALID_API_SCOPES = ("donations:read", "donors:read", "donations:write", "campaigns:read")


def _clean_scopes(scopes: List[str] | None) -> List[str]:
    if not scopes:
        return ["donations:read", "campaigns:read"]
    cleaned = [s for s in dict.fromkeys(scopes) if s in VALID_API_SCOPES or s == "read_only"]
    return cleaned or ["donations:read", "campaigns:read"]


# --- Phase 5: Webhooks & API Keys Integration ---
@router.get("/integrations/api-keys")
async def list_api_keys(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    query = select(ApiKey).where(ApiKey.organization_id == org_id).order_by(ApiKey.created_at.desc())
    res = await db.execute(query)
    return [
        {
            "id": str(k.id),
            "name": k.name,
            "key_prefix": f"infak_…{k.key_hash[:6]}" if k.key_hash else "infak_…",
            "is_active": k.is_active,
            "scopes": k.scopes or [],
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
    scopes = _clean_scopes(payload.scopes)
    
    key = ApiKey(
        organization_id=org_id,
        name=payload.name,
        key_hash=hash_value,
        scopes=scopes,
        expires_at=payload.expires_at,
        is_active=True
    )
    db.add(key)
    await db.commit()
    
    # Audit log
    await write_audit_log(
        db, org_id, current_user.id,
        action="api_anahtari_olustur",
        details={"name": payload.name, "key_id": str(key.id), "scopes": scopes}
    )
    
    return {
        "id": str(key.id),
        "name": key.name,
        "key_prefix": f"infak_…{hash_value[:6]}",
        "scopes": scopes,
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
    current_user: User = Depends(require_permission(Permission.SETTINGS_MANAGE)),
):
    org_id = UUID(request.state.organization_id)
    res = await db.execute(select(WebhookSetting).where(WebhookSetting.organization_id == org_id))
    return [_webhook_out(hook) for hook in res.scalars().all()]


@router.post("/integrations/webhooks")
async def create_webhook(
    request: Request,
    payload: WebhookSettingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.SETTINGS_MANAGE)),
):
    from app.services.tenant_credentials import CredentialsUnavailable, encrypt
    from app.utils.net import UnsafeUrl, assert_public_url

    org_id = UUID(request.state.organization_id)
    try:
        target_url = assert_public_url(payload.target_url)
    except UnsafeUrl as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    events = [event for event in dict.fromkeys(payload.subscribed_events) if event in WEBHOOK_EVENTS]
    if not events:
        raise HTTPException(status_code=400, detail="En az bir geçerli olay seçin")
    # The signing secret is generated here and shown once; it is stored encrypted, never read from env.
    secret = "whsec_" + secrets.token_urlsafe(32)
    try:
        secret_ref = "enc:" + encrypt({"secret": secret})
    except CredentialsUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    hook = WebhookSetting(
        organization_id=org_id,
        target_url=target_url,
        secret_ref=secret_ref,
        subscribed_events=",".join(events),
        is_active=True,
    )
    db.add(hook)
    await db.commit()
    await db.refresh(hook)
    await write_audit_log(db, org_id, current_user.id, action="webhook_ekle", details={"target_url": target_url})
    return _webhook_out(hook, secret)


@router.delete("/integrations/webhooks/{hook_id}")
async def delete_webhook(
    request: Request,
    hook_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.SETTINGS_MANAGE))
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

_CAMPAIGN_CATEGORY_LABELS = {
    "genel": "Genel Bağış",
    "egitim": "Eğitim",
    "saglik": "Sağlık",
    "gida": "Gıda",
    "su": "Su Kuyusu",
    "yetim": "Yetim",
    "kurban": "Kurban",
    "insaat": "İnşaat",
    "zekat": "Zekât",
    "fitre": "Fitre",
    "fidye": "Fidye",
    "sadaka": "Sadaka",
    "adak": "Adak",
    "akika": "Akika",
}


# --- Phase 5: RFM & Donor Insights ---
@router.get("/ai/donor-insights")
async def get_ai_donor_insights(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.insights import compute_org_insights

    org_id = UUID(request.state.organization_id)
    return await compute_org_insights(db, org_id, mask_fn=masked)

# --- Faz 3: Bağış Kalemleri (Donation Categories) ---
DONATION_CATEGORY_I18N = ("title", "description")


class DonationCategoryCreate(BaseModel):
    icon: str = Field(default="🤝", min_length=1, max_length=10)
    image_url: Optional[str] = Field(None, max_length=500)
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(..., min_length=1, max_length=500)
    campaign_id: Optional[UUID] = None
    donation_type: Optional[str] = Field(None, max_length=40)
    target_url: Optional[str] = Field(None, max_length=500)
    suggested_amounts_cents: List[int] = Field(default_factory=list)
    translations: Dict[str, Dict[str, str]] = Field(default_factory=dict)
    display_order: int = 0
    is_active: bool = True

    @field_validator("icon", "title", "description", "image_url", "donation_type", "target_url", mode="before")
    @classmethod
    def _strip_text(cls, v: Any) -> Any:
        if isinstance(v, str):
            stripped = v.strip()
            return stripped or None if v is not None else None
        return v

    @field_validator("suggested_amounts_cents", mode="before")
    @classmethod
    def _clean_amounts(cls, v: Any) -> List[int]:
        if not v:
            return []
        return [int(x) for x in v if isinstance(x, (int, float)) and int(x) > 0][:12]

    @field_validator("translations", mode="before")
    @classmethod
    def _clean_i18n(cls, v: Any) -> Dict[str, Dict[str, str]]:
        if not v:
            return {}
        return clean_translations(v, DONATION_CATEGORY_I18N, max_lengths={"title": 200, "description": 500}) or {}


def _serialize_donation_category(category: DonationCategory) -> Dict[str, Any]:
    return {
        "id": str(category.id),
        "organization_id": str(category.organization_id),
        "campaign_id": str(category.campaign_id) if category.campaign_id else None,
        "campaign_title": category.campaign.title if category.campaign else None,
        "icon": category.icon,
        "image_url": category.image_url,
        "title": category.title,
        "description": category.description,
        "donation_type": category.donation_type,
        "target_url": category.target_url,
        "suggested_amounts_cents": category.suggested_amounts_cents or [],
        "translations": category.translations or {},
        "display_order": category.display_order,
        "is_active": category.is_active,
        "created_at": category.created_at,
        "updated_at": category.updated_at,
    }


async def _verify_category_campaign(db: AsyncSession, org_id: UUID, campaign_id: Optional[UUID]) -> None:
    if not campaign_id:
        return
    found = (
        await db.execute(
            select(Campaign.id).where(Campaign.id == campaign_id, Campaign.organization_id == org_id)
        )
    ).scalar_one_or_none()
    if not found:
        raise HTTPException(status_code=400, detail="Seçilen kampanya bu organizasyona ait değil veya bulunamadı.")


@router.get("/donation-categories")
async def list_donation_categories(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    query = (
        select(DonationCategory)
        .options(selectinload(DonationCategory.campaign))
        .where(DonationCategory.organization_id == org_id)
        .order_by(DonationCategory.display_order.asc(), DonationCategory.created_at.asc())
    )
    res = await db.execute(query)
    return [_serialize_donation_category(c) for c in res.scalars().all()]


@router.post("/donation-categories")
async def create_donation_category(
    request: Request,
    payload: DonationCategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    await _verify_category_campaign(db, org_id, payload.campaign_id)
    category = DonationCategory(organization_id=org_id, **payload.model_dump())
    db.add(category)
    await db.commit()

    loaded = (
        await db.execute(
            select(DonationCategory)
            .options(selectinload(DonationCategory.campaign))
            .where(DonationCategory.id == category.id)
        )
    ).scalar_one()

    await write_audit_log(
        db, org_id, current_user.id,
        action="bagis_kalemi_olustur",
        details={"category_id": str(loaded.id), "title": loaded.title}
    )
    return _serialize_donation_category(loaded)


@router.put("/donation-categories/{category_id}")
async def update_donation_category(
    request: Request,
    category_id: UUID,
    payload: DonationCategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    query = (
        select(DonationCategory)
        .options(selectinload(DonationCategory.campaign))
        .where(DonationCategory.id == category_id, DonationCategory.organization_id == org_id)
    )
    res = await db.execute(query)
    category = res.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Bağış kalemi bulunamadı")

    await _verify_category_campaign(db, org_id, payload.campaign_id)

    for key, value in payload.model_dump().items():
        setattr(category, key, value)

    await db.commit()
    loaded = (
        await db.execute(
            select(DonationCategory)
            .options(selectinload(DonationCategory.campaign))
            .where(DonationCategory.id == category.id)
        )
    ).scalar_one()

    await write_audit_log(
        db, org_id, current_user.id,
        action="bagis_kalemi_guncelle",
        details={"category_id": str(category_id), "title": loaded.title}
    )
    return _serialize_donation_category(loaded)


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
        raise HTTPException(status_code=404, detail="Bağış kalemi bulunamadı")

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


class TableExportIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    subtitle: Optional[str] = Field(default=None, max_length=200)
    filename: Optional[str] = Field(default=None, max_length=120)
    headers: List[str] = Field(min_length=1, max_length=30)
    rows: List[List[Any]] = Field(default_factory=list, max_length=5000)
    summary: Optional[List[List[str]]] = Field(default=None, max_length=6)
    currency_cols: Optional[List[int]] = None


def _safe_export_name(raw: Optional[str], ext: str) -> str:
    import re
    base = re.sub(r"[^a-zA-Z0-9._-]+", "-", (raw or "rapor").strip()).strip("-.") or "rapor"
    base = re.sub(r"\.(csv|xlsx|pdf)$", "", base, flags=re.IGNORECASE)
    return f"{base}.{ext}"


@router.post("/export/xlsx")
async def export_table_xlsx(
    payload: TableExportIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from fastapi.responses import Response
    from app.utils.excel_export import build_corporate_xlsx

    org = await db.get(Organization, UUID(request.state.organization_id))
    data = build_corporate_xlsx(
        title=payload.title,
        headers=payload.headers,
        rows=payload.rows,
        org_name=getattr(org, "name", "") or "",
        subtitle=payload.subtitle or "",
        primary_color=getattr(org, "theme_primary_color", None),
        currency_cols=set(payload.currency_cols or []),
        organization=org,
    )
    fname = _safe_export_name(payload.filename or payload.title, "xlsx")
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.post("/export/pdf")
async def export_table_pdf(
    payload: TableExportIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from fastapi.responses import Response
    from app.utils.report_pdf import build_report_pdf

    org = await db.get(Organization, UUID(request.state.organization_id))
    data = build_report_pdf(
        title=payload.title,
        headers=payload.headers,
        rows=payload.rows,
        org_name=getattr(org, "name", "") or "",
        subtitle=payload.subtitle or "",
        organization=org,
        summary=payload.summary,
    )
    fname = _safe_export_name(payload.filename or payload.title, "pdf")
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


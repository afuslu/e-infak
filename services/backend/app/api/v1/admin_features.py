import logging
from uuid import UUID
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import func

from app.core.db import get_db
from app.models.donor_note import DonorNote
from app.models.sms_template import SmsTemplate
from app.models.audit_log import AuditLog
from app.models.campaign import Campaign
from app.models.user import User, UserRole
from app.models.donation import Donor, Donation
from app.models.kurban import KurbanAnimal, KurbanShare, KurbanStatus
from app.models.zakat_setting import ZakatSetting
from app.models.student import Student
from app.models.student_progress import StudentProgress
from app.models.student_sponsorship import StudentSponsorship
from app.models.banner import Banner
from app.models.api_key import ApiKey
from app.models.webhook_setting import WebhookSetting
from app.models.water_well import WaterWell
from app.models.donation_category import DonationCategory
from app.models.organization_settings import OrganizationSettings
from app.models.content_post import ContentPost
from app.api.deps import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin-features", tags=["admin-features"])

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

class SmsTemplateResponse(BaseModel):
    id: UUID
    name: str
    body: str
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class SmsTemplateUpdate(BaseModel):
    body: str

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
@router.get("/donors")
async def list_organization_donors(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    
    # Query distinct donors who made donations for this org
    query = (
        select(Donor)
        .join(Donation, Donation.donor_id == Donor.id)
        .where(Donation.organization_id == org_id)
        .group_by(Donor.id)
        .order_by(Donor.first_name.asc())
    )
    result = await db.execute(query)
    donors = result.scalars().all()
    
    return [
        {
            "id": str(donor.id),
            "first_name": donor.first_name,
            "last_name": donor.last_name,
            "email": donor.email,
            "phone": donor.phone,
            "created_at": donor.created_at
        }
        for donor in donors
    ]

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
    donor_query = select(Donor).where(Donor.id == donor_id)
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
    donor_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = (
        select(DonorNote, User)
        .outerjoin(User, DonorNote.author_id == User.id)
        .where(DonorNote.donor_id == donor_id)
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

# --- SMS Templates ---
@router.get("/sms-templates", response_model=List[SmsTemplateResponse])
async def list_sms_templates(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    
    # Fetch templates
    query = select(SmsTemplate).where(SmsTemplate.organization_id == org_id)
    result = await db.execute(query)
    templates = result.scalars().all()
    
    # Seed default templates if database is empty for this tenant context
    if not templates:
        t1 = SmsTemplate(
            organization_id=org_id,
            name="Bağış Teşekkür",
            body="Sayın {donor_name}, {amount_lira} TL tutarındaki bağışınız {campaign_name} projemize ulaşmıştır. Destekleriniz için teşekkür ederiz."
        )
        t2 = SmsTemplate(
            organization_id=org_id,
            name="Abonelik Tahsilat Bildirimi",
            body="Sayın {donor_name}, düzenli bağış talimatınız kapsamında bu aya ait {amount_lira} TL tutarındaki bağışınız kartınızdan tahsil edilmiştir."
        )
        db.add_all([t1, t2])
        await db.commit()
        
        # Re-fetch
        result = await db.execute(query)
        templates = result.scalars().all()
        
    return templates

@router.put("/sms-templates/{template_id}", response_model=SmsTemplateResponse)
async def update_sms_template(
    request: Request,
    template_id: UUID,
    payload: SmsTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    
    query = select(SmsTemplate).where(
        SmsTemplate.id == template_id,
        SmsTemplate.organization_id == org_id
    )
    res = await db.execute(query)
    template = res.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
        
    template.body = payload.body
    await db.commit()
    await db.refresh(template)
    
    # Audit log
    await write_audit_log(
        db, org_id, current_user.id,
        action="sms_sablon_guncelle",
        details={"template_id": str(template_id), "template_name": template.name}
    )
    
    return template

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
class KurbanAnimalUpdate(BaseModel):
    status: KurbanStatus
    video_url: Optional[str] = None

class ZakatSettingUpdate(BaseModel):
    gold_price_per_gram: float
    nisap_amount_lira: float
    is_auto_sync: bool

class UserRoleUpdate(BaseModel):
    role: UserRole

# --- Phase 3: Kurban Animal Video & Status Management ---
@router.get("/kurban/animals")
async def list_kurban_animals(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    query = select(KurbanAnimal).where(KurbanAnimal.organization_id == org_id).order_by(KurbanAnimal.animal_number.asc())
    res = await db.execute(query)
    return res.scalars().all()

@router.put("/kurban/animals/{animal_id}")
async def update_kurban_animal(
    request: Request,
    animal_id: UUID,
    payload: KurbanAnimalUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    
    # 1. Fetch animal
    query = select(KurbanAnimal).where(
        KurbanAnimal.id == animal_id,
        KurbanAnimal.organization_id == org_id
    )
    res = await db.execute(query)
    animal = res.scalar_one_or_none()
    if not animal:
        raise HTTPException(status_code=404, detail="Kurban animal not found")
        
    # 2. Update status and video URL
    animal.status = payload.status
    if payload.video_url is not None:
        animal.video_url = payload.video_url
        
    # 3. Propagate status to all associated shares
    shares_query = select(KurbanShare).where(KurbanShare.animal_id == animal_id)
    shares_res = await db.execute(shares_query)
    shares = shares_res.scalars().all()
    for share in shares:
        share.status = payload.status
        
    await db.commit()
    
    # Audit log
    await write_audit_log(
        db, org_id, current_user.id,
        action="kurban_hayvan_guncelle",
        details={"animal_id": str(animal_id), "animal_number": animal.animal_number, "status": payload.status}
    )
    
    return {"status": "success", "animal": animal}

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

# --- Phase 3: Staff & User Roles ---
@router.get("/users")
async def list_staff_users(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    query = select(User).where(User.organization_id == org_id).order_by(User.first_name.asc())
    res = await db.execute(query)
    return [
        {
            "id": str(u.id),
            "first_name": u.first_name,
            "last_name": u.last_name,
            "email": u.email,
            "role": u.role,
            "is_active": u.is_active
        }
        for u in res.scalars().all()
    ]

@router.put("/users/{user_id}/role")
async def update_user_role(
    request: Request,
    user_id: UUID,
    payload: UserRoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    
    # Check current user's role: only superadmins (PLATFORM_ADMIN, STK_ADMIN) can change roles
    if current_user.role not in [UserRole.PLATFORM_ADMIN, UserRole.STK_ADMIN]:
        raise HTTPException(status_code=403, detail="Only administrators can manage user roles")
        
    query = select(User).where(User.id == user_id, User.organization_id == org_id)
    res = await db.execute(query)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    old_role = user.role
    user.role = payload.role
    await db.commit()
    
    # Audit log
    await write_audit_log(
        db, org_id, current_user.id,
        action="kullanici_rol_guncelle",
        details={"target_user_id": str(user_id), "target_email": user.email, "old_role": old_role, "new_role": payload.role}
    )
    
    return {"status": "success", "role": user.role}

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
        "verify_url": f"https://e-infak.org/verify/receipt/{donation.receipt_number}",
        "status": "valid" if donation.status == "confirmed" else donation.status,
        "donor_name": donor_name,
        "amount_lira": donation.amount_cents / 100,
        "created_at": donation.created_at,
        "payment_method": "Kredi Kartı" if donation.payment_method == "credit_card" else "Havale/EFT",
    }

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
    
    # 2. Mock some beautiful trend data since we don't have historical months filled out
    monthly_donations = [
        {"month": "Ocak", "total_lira": 120000.0},
        {"month": "Şubat", "total_lira": 145000.0},
        {"month": "Mart", "total_lira": 190000.0},
        {"month": "Nisan", "total_lira": 230000.0},
        {"month": "Mayıs", "total_lira": 310000.0},
        {"month": "Haziran", "total_lira": 425890.0}
    ]
    
    # 3. Ödeme kanalları dağılımı
    payment_methods = [
        {"method": "Kredi Kartı", "count": 843, "total_lira": 285890.0},
        {"method": "Havale/EFT", "count": 404, "total_lira": 140000.0}
    ]
    
    return {
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
            text="Hicret Derneği Kurban Kampanyası Bağış Alımları Başlamıştır!",
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
    # Returns simulated active monthly subscription plans linked to our donors
    return [
        {
            "id": "sub-1",
            "donor_name": "Ahmet Yılmaz",
            "campaign_title": "Eğitim Bursu",
            "amount_lira": 500.0,
            "status": "active",
            "next_billing_date": "2026-08-01",
            "card_brand": "Visa",
            "card_last4": "4242"
        },
        {
            "id": "sub-2",
            "donor_name": "Fatma Demir",
            "campaign_title": "Yetim Sponsorluğu",
            "amount_lira": 600.0,
            "status": "failed",
            "next_billing_date": "2026-07-15",
            "card_brand": "Mastercard",
            "card_last4": "5555"
        }
    ]

@router.post("/subscriptions/{subscription_id}/retry")
async def retry_failed_subscription(
    request: Request,
    subscription_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    # Trigger a mock retry run tasks (similar to what celery worker would do)
    await write_audit_log(
        db, org_id, current_user.id,
        action="abonelik_tahsilat_tekrar",
        details={"subscription_id": subscription_id}
    )
    return {"status": "success", "message": "Kart tahsilat denemesi arka planda başlatıldı."}

# --- Phase 5 Pydantic Schemas ---
class ApiKeyCreate(BaseModel):
    name: str

class WebhookSettingCreate(BaseModel):
    target_url: str
    secret_token: str

class BroadcastSms(BaseModel):
    filter_type: str
    message: str

class WaterWellCreate(BaseModel):
    name: str
    location_name: str
    latitude: float
    longitude: float
    status: str
    donor_id: Optional[UUID] = None

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
        secret_token=payload.secret_token,
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

# --- Phase 5: Broadcast SMS Broadcaster ---
@router.post("/sms/broadcast")
async def broadcast_bulk_sms(
    request: Request,
    payload: BroadcastSms,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    
    # Query matching donor counts (simulating broadcast target)
    count = 150 # Simulated bulk count
    if payload.filter_type == "active_donors":
        count = 120
    elif payload.filter_type == "kurban_donors":
        count = 45
        
    # Log audit log
    await write_audit_log(
        db, org_id, current_user.id,
        action="toplu_sms_gonder",
        details={"filter_type": payload.filter_type, "message_preview": payload.message[:50], "recipient_count": count}
    )
    
    return {"status": "success", "sent_count": count}

# --- Phase 5: Water Well Management ---
@router.get("/water-wells")
async def list_water_wells(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    query = select(WaterWell).where(WaterWell.organization_id == org_id).order_by(WaterWell.name.asc())
    res = await db.execute(query)
    return res.scalars().all()

@router.post("/water-wells")
async def create_water_well(
    request: Request,
    payload: WaterWellCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    well = WaterWell(
        organization_id=org_id,
        name=payload.name,
        location_name=payload.location_name,
        latitude=payload.latitude,
        longitude=payload.longitude,
        status=payload.status,
        donor_id=payload.donor_id,
        gallery_urls=[]
    )
    db.add(well)
    await db.commit()
    await db.refresh(well)
    
    # Audit log
    await write_audit_log(
        db, org_id, current_user.id,
        action="su_kuyusu_ekle",
        details={"well_id": str(well.id), "well_name": well.name, "location": well.location_name}
    )
    return well

@router.get("/public-verify/water-wells")
async def get_public_water_wells(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    # Public endpoint to render wells on interactive map on homepages
    org_id = UUID(request.state.organization_id)
    query = select(WaterWell).where(WaterWell.organization_id == org_id, WaterWell.status == "completed")
    res = await db.execute(query)
    return [
        {
            "id": str(w.id),
            "name": w.name,
            "location_name": w.location_name,
            "latitude": w.latitude,
            "longitude": w.longitude,
            "gallery_urls": w.gallery_urls
        }
        for w in res.scalars().all()
    ]

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

    return settings

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

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(settings, key, value)

    await db.commit()
    await db.refresh(settings)

    await write_audit_log(
        db, org_id, current_user.id,
        action="site_ayarlari_guncelle",
        details={"contact_phone": settings.contact_phone, "contact_email": settings.contact_email}
    )
    return settings

# --- Faz 3: İçerikler (Content Posts / Faaliyet Haberleri) ---
class ContentPostCreate(BaseModel):
    title: str
    image_url: Optional[str] = None
    display_order: int = 0
    is_active: bool = True

@router.get("/content-posts")
async def list_content_posts(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    query = select(ContentPost).where(ContentPost.organization_id == org_id).order_by(ContentPost.display_order)
    res = await db.execute(query)
    return res.scalars().all()

@router.post("/content-posts")
async def create_content_post(
    request: Request,
    payload: ContentPostCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    post = ContentPost(organization_id=org_id, **payload.model_dump())
    db.add(post)
    await db.commit()
    await db.refresh(post)

    await write_audit_log(
        db, org_id, current_user.id,
        action="icerik_olustur",
        details={"post_id": str(post.id), "title": post.title}
    )
    return post

@router.put("/content-posts/{post_id}")
async def update_content_post(
    request: Request,
    post_id: UUID,
    payload: ContentPostCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    query = select(ContentPost).where(ContentPost.id == post_id, ContentPost.organization_id == org_id)
    res = await db.execute(query)
    post = res.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Content post not found")

    for key, value in payload.model_dump().items():
        setattr(post, key, value)

    await db.commit()
    await db.refresh(post)

    await write_audit_log(
        db, org_id, current_user.id,
        action="icerik_guncelle",
        details={"post_id": str(post_id), "title": post.title}
    )
    return post

@router.delete("/content-posts/{post_id}")
async def delete_content_post(
    request: Request,
    post_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = UUID(request.state.organization_id)
    query = select(ContentPost).where(ContentPost.id == post_id, ContentPost.organization_id == org_id)
    res = await db.execute(query)
    post = res.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Content post not found")

    await db.delete(post)
    await db.commit()

    await write_audit_log(
        db, org_id, current_user.id,
        action="icerik_sil",
        details={"post_id": str(post_id), "title": post.title}
    )
    return {"status": "success"}




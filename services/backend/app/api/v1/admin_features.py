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
    query = select(Donation).where(Donation.id == donation_id, Donation.organization_id == org_id)
    res = await db.execute(query)
    donation = res.scalar_one_or_none()
    if not donation:
        raise HTTPException(status_code=404, detail="Donation not found")
        
    # Generate digital verification signature checksum
    import hashlib
    verification_hash = hashlib.sha256(f"receipt-{donation.receipt_number}-{donation.amount_cents}".encode('utf-8')).hexdigest()[:16]
    
    return {
        "donation_id": str(donation.id),
        "receipt_number": donation.receipt_number,
        "verification_hash": verification_hash,
        "verify_url": f"https://e-infak.org/verify/receipt/{donation.receipt_number}"
    }

@router.get("/public-verify/receipt/{receipt_number}")
async def public_verify_receipt(
    receipt_number: str,
    db: AsyncSession = Depends(get_db)
):
    # Public verification endpoint (doesn't require auth!)
    query = (
        select(Donation, Donor)
        .join(Donor, Donation.donor_id == Donor.id)
        .where(Donation.receipt_number == receipt_number, Donation.status == "confirmed")
    )
    res = await db.execute(query)
    row = res.first()
    if not row:
        raise HTTPException(status_code=404, detail="Geçersiz makbuz numarası veya bağış onaylanmamış.")
        
    donation, donor = row
    
    # Obfuscate names for privacy (Ahmet Yılmaz -> A*** Y***)
    def obfuscate(name: str):
        if len(name) <= 1:
            return name
        return name[0] + "*" * (len(name) - 1)
        
    first_name_obf = obfuscate(donor.first_name)
    last_name_obf = obfuscate(donor.last_name or "")
    
    return {
        "status": "valid",
        "receipt_number": donation.receipt_number,
        "donor_name": f"{first_name_obf} {last_name_obf}".strip(),
        "amount_lira": donation.amount_cents / 100,
        "created_at": donation.created_at,
        "payment_method": "Kredi Kartı" if donation.payment_method == "credit_card" else "Havale/EFT"
    }


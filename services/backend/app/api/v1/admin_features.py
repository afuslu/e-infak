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
from app.models.user import User
from app.models.donation import Donor
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
    
    # Audit log
    await write_audit_log(
        db, org_id, current_user.id,
        action="kampanya_galeri_guncelle",
        details={"campaign_id": str(campaign_id), "campaign_title": campaign.title}
    )
    
    return {"status": "success", "gallery_urls": campaign.gallery_urls}

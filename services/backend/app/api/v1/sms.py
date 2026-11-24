"""SMS: templates, quick send with preview, and the log of everything that was sent.

Paths contain "/sms", so api.deps requires the SMS module and (for writes) "Bağışçı ve SMS yönetimi".
"""
import csv
import io
import json
from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated, Literal, Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, mask_phone, require_admin_route_feature, require_admin_route_permission, require_capability, masked
from app.core.db import get_db
from app.models.audit_log import AuditLog
from app.models.automation import BankTransaction
from app.models.campaign import Campaign
from app.models.donation import Donation, DonationStatus, Donor
from app.models.organization import Organization
from app.models.sms_batch import SmsBatch
from app.models.sms_message import SMS_OPEN_STATUSES, SMS_SOURCES, SMS_STATUSES, SmsMessage
from app.models.sms_template import SmsTemplate
from app.models.user import User
from app.services.sms_audience import Audience, audience_label, audience_options, resolve
from app.services.sms_service import (
    AUTO_MODES, MAX_PARTS, SMS_EVENTS, SMS_VARIABLES, _kick_batch, after_quiet_hours, build_context, cancel_batch,
    clean_sms_text, collect_reports, create_batch, enqueue_sms, opt_out_token, provider_balance, render_bulk,
    ensure_default_templates, kick_after_commit, related_sms, render_template, segment_info, site_url,
    unknown_variables, verify_opt_out_token,
)
from app.sms import SmsError

router = APIRouter(
    prefix="/admin-features/sms",
    tags=["sms"],
    dependencies=[Depends(require_admin_route_permission), Depends(require_admin_route_feature)],
)
public_router = APIRouter(prefix="/public/sms", tags=["sms-public"])
TZ = ZoneInfo("Europe/Istanbul")
RELATED_TYPES = ("donation", "bank_transaction", "kurban_share", "member_due", "pledge_installment")


def _org_id(request: Request) -> UUID:
    org_id = getattr(request.state, "organization_id", None)
    if not org_id:
        raise HTTPException(status_code=400, detail="Kurum bilgisi bulunamadı")
    return UUID(org_id)


def _audit(db: AsyncSession, org_id: UUID, user: User, action: str, details: dict) -> None:
    db.add(AuditLog(organization_id=org_id, user_id=user.id, action=action, details=details))


# --- Templates -----------------------------------------------------------------------

class TemplateIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    body: str = Field(min_length=2, max_length=1500)
    event_key: Optional[str] = None
    # Receipt SMS of this campaign use this text (not together with an event)
    campaign_id: Optional[UUID] = None
    auto_mode: Literal["auto", "manual", "off"] = "manual"
    is_active: bool = True


def _template_row(template: SmsTemplate, stats: Optional[dict] = None) -> dict:
    return {
        "id": str(template.id), "name": template.name, "body": template.body, "event_key": template.event_key,
        "event_label": SMS_EVENTS[template.event_key][0] if template.event_key in SMS_EVENTS else None,
        "campaign_id": str(template.campaign_id) if template.campaign_id else None,
        "auto_mode": template.auto_mode, "is_active": template.is_active,
        "has_default": template.event_key in SMS_EVENTS,
        "stats": stats or {"sent": 0, "delivered": 0, "failed": 0, "last_used_at": None},
        "segments": segment_info(template.body), "updated_at": template.updated_at or template.created_at,
    }


async def _template(db: AsyncSession, org_id: UUID, template_id: UUID) -> SmsTemplate:
    template = (await db.execute(select(SmsTemplate).where(
        SmsTemplate.id == template_id, SmsTemplate.organization_id == org_id,
    ))).scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Şablon bulunamadı")
    return template


async def _apply_template(db: AsyncSession, org_id: UUID, template: SmsTemplate, payload: TemplateIn) -> None:
    body = clean_sms_text(payload.body)
    unknown = unknown_variables(body)
    if unknown:
        raise HTTPException(status_code=422, detail="Bilinmeyen değişken: " + ", ".join("{%s}" % u for u in unknown))
    if payload.event_key and payload.event_key not in SMS_EVENTS:
        raise HTTPException(status_code=422, detail="Bilinmeyen olay")
    if payload.event_key and (await db.execute(select(SmsTemplate.id).where(
        SmsTemplate.organization_id == org_id, SmsTemplate.event_key == payload.event_key,
        SmsTemplate.id != template.id,
    ))).first():
        raise HTTPException(status_code=409, detail="Bu olaya bağlı başka bir şablon var; önce onu ayırın")
    if payload.campaign_id:
        if payload.event_key:
            raise HTTPException(status_code=422, detail="Şablon ya bir olaya ya da bir kampanyaya bağlanabilir")
        from app.models.campaign import Campaign
        if not (await db.execute(select(Campaign.id).where(
                Campaign.id == payload.campaign_id, Campaign.organization_id == org_id))).first():
            raise HTTPException(status_code=404, detail="Kampanya bulunamadı")
        if (await db.execute(select(SmsTemplate.id).where(
                SmsTemplate.organization_id == org_id, SmsTemplate.campaign_id == payload.campaign_id,
                SmsTemplate.id != template.id))).first():
            raise HTTPException(status_code=409, detail="Bu kampanyaya bağlı başka bir şablon var")
    template.campaign_id = payload.campaign_id
    template.name = payload.name.strip()
    template.body = body
    template.event_key = payload.event_key or None
    template.auto_mode = payload.auto_mode if payload.event_key else "manual"
    template.is_active = payload.is_active


@router.get("/meta")
async def sms_meta():
    return {
        "variables": [{"key": key, "label": label} for key, label in SMS_VARIABLES.items()],
        "events": [{"key": key, "label": spec[0], "default_mode": spec[1]} for key, spec in SMS_EVENTS.items()],
        "auto_modes": AUTO_MODES, "statuses": SMS_STATUSES, "sources": SMS_SOURCES, "max_parts": MAX_PARTS,
    }


@router.get("/templates")
async def list_templates(request: Request, db: AsyncSession = Depends(get_db)):
    org_id = _org_id(request)
    await ensure_default_templates(db, org_id)
    await db.commit()
    templates = (await db.execute(
        select(SmsTemplate).where(SmsTemplate.organization_id == org_id)
        .order_by(SmsTemplate.sort_order, SmsTemplate.created_at)
    )).scalars().all()
    stats_map: dict[UUID, dict] = {}
    if templates:
        t_ids = [t.id for t in templates]
        for tid, status, cnt, last_at in (await db.execute(
            select(SmsMessage.template_id, SmsMessage.status, func.count(SmsMessage.id), func.max(SmsMessage.created_at))
            .where(SmsMessage.organization_id == org_id, SmsMessage.template_id.in_(t_ids))
            .group_by(SmsMessage.template_id, SmsMessage.status)
        )).all():
            entry = stats_map.setdefault(tid, {"sent": 0, "delivered": 0, "failed": 0, "last_used_at": None})
            if status in ("sent", "delivered"):
                entry["sent"] += int(cnt)
            if status == "delivered":
                entry["delivered"] += int(cnt)
            if status == "failed":
                entry["failed"] += int(cnt)
            if last_at and (not entry["last_used_at"] or last_at > entry["last_used_at"]):
                entry["last_used_at"] = last_at
    return [_template_row(t, stats_map.get(t.id)) for t in templates]


@router.post("/templates", status_code=201, dependencies=[Depends(require_capability("sms.templates"))])
async def create_template(request: Request, payload: TemplateIn, db: AsyncSession = Depends(get_db),
                          current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    count = (await db.execute(
        select(func.count(SmsTemplate.id)).where(SmsTemplate.organization_id == org_id)
    )).scalar() or 0
    if count >= 100:
        raise HTTPException(status_code=409, detail="En fazla 100 şablon tanımlanabilir")
    template = SmsTemplate(organization_id=org_id, name="", body="", sort_order=count + 1)
    await _apply_template(db, org_id, template, payload)
    db.add(template)
    _audit(db, org_id, current_user, "sms_sablon_ekle", {"name": template.name})
    await db.commit()
    await db.refresh(template)
    return _template_row(template)


@router.put("/templates/{template_id}", dependencies=[Depends(require_capability("sms.templates"))])
async def update_template(request: Request, template_id: UUID, payload: TemplateIn,
                          db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    template = await _template(db, org_id, template_id)
    await _apply_template(db, org_id, template, payload)
    _audit(db, org_id, current_user, "sms_sablon_guncelle", {"template_id": str(template.id), "name": template.name})
    await db.commit()
    await db.refresh(template)
    return _template_row(template)


@router.post("/templates/{template_id}/reset", dependencies=[Depends(require_capability("sms.templates"))])
async def reset_template(request: Request, template_id: UUID, db: AsyncSession = Depends(get_db),
                         current_user: User = Depends(get_current_user)):
    """Restore a built-in event template's default text."""
    org_id = _org_id(request)
    template = await _template(db, org_id, template_id)
    if not template.event_key or template.event_key not in SMS_EVENTS:
        raise HTTPException(status_code=409, detail="Yalnızca olay şablonları varsayılan metne sıfırlanabilir")
    template.body = SMS_EVENTS[template.event_key][3]
    _audit(db, org_id, current_user, "sms_sablon_sifirla", {"template_id": str(template.id), "event": template.event_key})
    await db.commit()
    await db.refresh(template)
    return _template_row(template)


@router.delete("/templates/{template_id}", dependencies=[Depends(require_capability("sms.templates"))])
async def delete_template(request: Request, template_id: UUID, db: AsyncSession = Depends(get_db),
                          current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    template = await _template(db, org_id, template_id)
    _audit(db, org_id, current_user, "sms_sablon_sil", {"name": template.name})
    await db.delete(template)
    await db.commit()
    return {"status": "deleted"}


# --- Preview and send ----------------------------------------------------------------

class SmsTarget(BaseModel):
    """What the message is about; values of these records fill the template variables."""
    donor_id: Optional[UUID] = None
    donation_id: Optional[UUID] = None
    transfer_id: Optional[UUID] = None
    # Values typed on a form that is not saved yet (a receipt being written): {"tutar": "1.000,00"}
    variables: dict[str, str] = Field(default_factory=dict)


class SendIn(SmsTarget):
    phone: Optional[str] = Field(default=None, max_length=20)
    body: str = Field(min_length=2, max_length=1500)
    template_id: Optional[UUID] = None
    send_at: Optional[datetime] = None
    related_type: Optional[str] = None
    related_id: Optional[UUID] = None
    # Required for a donor without SMS permission: the message is about their own donation, not promotion.
    informational: bool = False


async def _records(db: AsyncSession, org_id: UUID, target: SmsTarget):
    donor = donation = transfer = None
    if target.donation_id:
        donation = (await db.execute(select(Donation).where(
            Donation.id == target.donation_id, Donation.organization_id == org_id,
        ))).scalar_one_or_none()
        if not donation:
            raise HTTPException(status_code=404, detail="Bağış bulunamadı")
    if target.transfer_id:
        transfer = (await db.execute(select(BankTransaction).where(
            BankTransaction.id == target.transfer_id, BankTransaction.organization_id == org_id,
        ))).scalar_one_or_none()
        if not transfer:
            raise HTTPException(status_code=404, detail="Banka hareketi bulunamadı")
    donor_id = target.donor_id or (donation.donor_id if donation else None)
    if donor_id:
        donor = (await db.execute(select(Donor).where(
            Donor.id == donor_id, Donor.organization_id == org_id,
        ))).scalar_one_or_none()
        if not donor:
            raise HTTPException(status_code=404, detail="Bağışçı bulunamadı")
    return donor, donation, transfer


@router.get("/preview")
async def preview_sms(
    request: Request, template_id: UUID, donor_id: Optional[UUID] = None, donation_id: Optional[UUID] = None,
    transfer_id: Optional[UUID] = None, variables: Annotated[Optional[str], Query(max_length=2000)] = None,
    db: AsyncSession = Depends(get_db), current_user: Optional[User] = Depends(get_current_user),
):
    """A template filled in for a donor / receipt / transfer, with its length.

    `variables` is a JSON object of values typed on a form that is not saved yet. Read-only, so staff
    who write receipts can see the text without the right to send SMS.
    """
    org_id = _org_id(request)
    try:
        extra = json.loads(variables) if variables else {}
        if not isinstance(extra, dict):
            raise ValueError
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Değişkenler okunamadı") from exc
    target = SmsTarget(donor_id=donor_id, donation_id=donation_id, transfer_id=transfer_id,
                       variables={str(k): str(v) for k, v in extra.items() if v is not None})
    template = await _template(db, org_id, template_id)
    donor, donation, transfer = await _records(db, org_id, target)
    context = await build_context(db, org_id, donor=donor, donation=donation, transfer=transfer,
                                  extra=target.variables)
    rendered = render_template(template.body, context)
    return {
        "body": rendered, "segments": segment_info(rendered),
        "phone": (mask_phone(donor.phone, current_user) if current_user else donor.phone) if donor else None,
        "allow_sms": bool(donor.allow_sms) if donor else None,
    }


@router.post("/send", dependencies=[Depends(require_capability("sms.send"))])
async def send_sms(request: Request, payload: SendIn, db: AsyncSession = Depends(get_db),
                   current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    donor, donation, transfer = await _records(db, org_id, payload)
    typed = (payload.phone or "").strip()
    # A masked number ("0532 *** ** 12") means "the donor's own number".
    phone = (typed if typed and "*" not in typed else None) or (donor.phone if donor else None)
    if not phone:
        raise HTTPException(status_code=409, detail="Gönderilecek telefon numarası yok")
    # A message about the donor's own receipt or transfer is information, not promotion.
    informational = payload.informational or bool(donation or transfer)
    if not (donor and donor.allow_sms) and not informational:
        raise HTTPException(
            status_code=409,
            detail="Bağışçının SMS izni yok. Yalnızca kendi bağışıyla ilgili bilgilendirme gönderilebilir; "
                   "tanıtım içerikli ileti gönderilemez (İYS).",
        )
    related = None
    if payload.related_type and payload.related_id:
        if payload.related_type not in RELATED_TYPES:
            raise HTTPException(status_code=422, detail="Bilinmeyen kayıt türü")
        related = (payload.related_type, payload.related_id)
    elif donation:
        related = ("donation", donation.id)
    elif transfer:
        related = ("bank_transaction", transfer.id)
    send_at = payload.send_at
    if send_at:
        send_at = send_at if send_at.tzinfo else send_at.replace(tzinfo=TZ)
        if send_at > datetime.now(timezone.utc) + timedelta(days=366):
            raise HTTPException(status_code=422, detail="Gönderim tarihi en fazla bir yıl sonrası olabilir")
    template_id = (await _template(db, org_id, payload.template_id)).id if payload.template_id else None
    try:
        message = await enqueue_sms(
            db, org_id, phone, payload.body, donor_id=donor.id if donor else None,
            source="receipt" if donation else ("transfer" if transfer else "manual"), related=related,
            template_id=template_id, send_at=send_at, created_by=current_user.id,
        )
    except SmsError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    _audit(db, org_id, current_user, "sms_gonder", {
        "sms_no": message.seq_no, "donor_id": str(donor.id) if donor else None, "parts": message.parts,
        "scheduled": message.status == "scheduled", "without_consent": not (donor and donor.allow_sms),
    })
    await db.commit()
    return {"id": str(message.id), "seq_no": message.seq_no, "status": message.status,
            "send_after": message.send_after, "parts": message.parts}


# --- Log -----------------------------------------------------------------------------

def _message_row(message: SmsMessage, donor_name: Optional[str], template_name: Optional[str],
                 sender: Optional[str], viewer: Optional[User] = None) -> dict:
    return {
        "id": str(message.id), "seq_no": message.seq_no,
        "phone": mask_phone(message.phone, viewer) if viewer else message.phone,
        "donor_id": str(message.donor_id) if message.donor_id else None, "donor_name": donor_name,
        "body": message.body, "status": message.status, "source": message.source,
        "related_type": message.related_type,
        "related_id": str(message.related_id) if message.related_id else None,
        "batch_id": str(message.batch_id) if message.batch_id else None,
        "ab_variant": message.ab_variant,
        "click_count": message.click_count or 0,
        "clicked_at": message.clicked_at,
        "template_name": template_name, "encoding": message.encoding, "parts": message.parts,
        "provider": message.provider, "provider_ref": message.provider_ref, "error": message.error,
        "attempts": message.attempts, "report_checks": message.report_checks or 0,
        "report_checked_at": message.report_checked_at,
        "send_after": message.send_after, "sent_at": message.sent_at, "delivered_at": message.delivered_at,
        "created_at": message.created_at, "created_by": sender,
    }


def _messages_scope(
    org_id: UUID,
    *,
    source: Optional[str] = None,
    q: Optional[str] = None,
    donor_id: Optional[UUID] = None,
    batch_id: Optional[UUID] = None,
    related_type: Optional[str] = None,
    related_id: Optional[UUID] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> list:
    scope = [SmsMessage.organization_id == org_id]
    if source:
        scope.append(SmsMessage.source == source)
    if donor_id:
        scope.append(SmsMessage.donor_id == donor_id)
    if batch_id:
        scope.append(SmsMessage.batch_id == batch_id)
    if related_type and related_id:
        scope += [SmsMessage.related_type == related_type, SmsMessage.related_id == related_id]
    if date_from:
        scope.append(SmsMessage.created_at >= datetime.combine(date_from, time.min, tzinfo=TZ))
    if date_to:
        scope.append(SmsMessage.created_at < datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=TZ))
    if q and q.strip():
        term = q.strip()
        digits = "".join(ch for ch in term if ch.isdigit())
        matches = [SmsMessage.body.ilike(f"%{term}%"), Donor.first_name.ilike(f"%{term}%"),
                   Donor.last_name.ilike(f"%{term}%"), Donor.company_name.ilike(f"%{term}%")]
        if len(digits) >= 3:
            matches.append(SmsMessage.phone.like(f"%{digits.lstrip('0')}%"))
        if term.lstrip("#").isdigit():
            matches.append(SmsMessage.seq_no == int(term.lstrip("#")))
        scope.append(or_(*matches))
    return scope


@router.get("/messages")
async def list_messages(
    request: Request, db: AsyncSession = Depends(get_db),
    status: Optional[str] = None, source: Optional[str] = None, q: Annotated[Optional[str], Query(max_length=80)] = None,
    donor_id: Optional[UUID] = None, batch_id: Optional[UUID] = None, related_type: Optional[str] = None, related_id: Optional[UUID] = None,
    date_from: Optional[date] = None, date_to: Optional[date] = None,
    sort: Literal["date_desc", "date_asc", "parts_desc"] = "date_desc",
    page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=500)] = 50,
    current_user: Optional[User] = Depends(get_current_user),
):
    org_id = _org_id(request)
    scope = _messages_scope(
        org_id, source=source, q=q, donor_id=donor_id, batch_id=batch_id,
        related_type=related_type, related_id=related_id, date_from=date_from, date_to=date_to,
    )

    counts = dict((await db.execute(
        select(SmsMessage.status, func.count(SmsMessage.id)).select_from(SmsMessage)
        .outerjoin(Donor, Donor.id == SmsMessage.donor_id).where(*scope).group_by(SmsMessage.status)
    )).all())
    wanted = [s for s in (status or "").split(",") if s]  # "queued,scheduled" = everything waiting
    where = scope + ([SmsMessage.status.in_(wanted)] if wanted else [])
    order_cols = {
        "date_desc": (SmsMessage.created_at.desc(), SmsMessage.seq_no.desc()),
        "date_asc": (SmsMessage.created_at.asc(), SmsMessage.seq_no.asc()),
        "parts_desc": (SmsMessage.parts.desc(), SmsMessage.created_at.desc()),
    }[sort]
    rows = (await db.execute(
        select(SmsMessage, Donor, SmsTemplate.name, User.email)
        .outerjoin(Donor, Donor.id == SmsMessage.donor_id)
        .outerjoin(SmsTemplate, SmsTemplate.id == SmsMessage.template_id)
        .outerjoin(User, User.id == SmsMessage.created_by)
        .where(*where).order_by(*order_cols)
        .offset((page - 1) * page_size).limit(page_size)
    )).all()
    batch_name = None
    if batch_id:
        batch_name = (await db.execute(select(SmsBatch.name).where(
            SmsBatch.id == batch_id, SmsBatch.organization_id == org_id))).scalar_one_or_none()
    error_summary = []
    if counts.get("failed", 0) > 0:
        err_rows = (await db.execute(
            select(SmsMessage.error, func.count(SmsMessage.id)).select_from(SmsMessage)
            .outerjoin(Donor, Donor.id == SmsMessage.donor_id)
            .where(*scope, SmsMessage.status == "failed", SmsMessage.error.is_not(None))
            .group_by(SmsMessage.error).order_by(func.count(SmsMessage.id).desc()).limit(5)
        )).all()
        error_summary = [{"error": err, "count": int(cnt)} for err, cnt in err_rows]
    return {
        "items": [_message_row(m, d.full_name if d else None, t, u, current_user) for m, d, t, u in rows],
        "total": sum(counts.get(s, 0) for s in wanted) if wanted else sum(counts.values()),
        "counts": {key: counts.get(key, 0) for key in SMS_STATUSES},
        "parts_sent": (await db.execute(
            select(func.coalesce(func.sum(SmsMessage.parts), 0)).select_from(SmsMessage)
            .outerjoin(Donor, Donor.id == SmsMessage.donor_id)
            .where(*scope, SmsMessage.status.in_(("sent", "delivered")))
        )).scalar(),
        "batch_name": batch_name,
        "error_summary": error_summary,
    }


@router.get("/messages/export")
async def export_messages(
    request: Request, db: AsyncSession = Depends(get_db),
    status: Optional[str] = None, source: Optional[str] = None, q: Annotated[Optional[str], Query(max_length=80)] = None,
    donor_id: Optional[UUID] = None, batch_id: Optional[UUID] = None,
    date_from: Optional[date] = None, date_to: Optional[date] = None,
    sort: Literal["date_desc", "date_asc", "parts_desc"] = "date_desc",
    current_user: Optional[User] = Depends(get_current_user),
):
    """Export all matching SMS messages (up to 50,000 rows) as UTF-8 BOM CSV."""
    org_id = _org_id(request)
    scope = _messages_scope(org_id, source=source, q=q, donor_id=donor_id, batch_id=batch_id,
                            date_from=date_from, date_to=date_to)
    wanted = [s for s in (status or "").split(",") if s]  # "queued,scheduled" = everything waiting
    where = scope + ([SmsMessage.status.in_(wanted)] if wanted else [])
    order_cols = {
        "date_desc": (SmsMessage.created_at.desc(), SmsMessage.seq_no.desc()),
        "date_asc": (SmsMessage.created_at.asc(), SmsMessage.seq_no.asc()),
        "parts_desc": (SmsMessage.parts.desc(), SmsMessage.created_at.desc()),
    }[sort]
    rows = (await db.execute(
        select(SmsMessage, Donor, SmsTemplate.name, User.email)
        .outerjoin(Donor, Donor.id == SmsMessage.donor_id)
        .outerjoin(SmsTemplate, SmsTemplate.id == SmsMessage.template_id)
        .outerjoin(User, User.id == SmsMessage.created_by)
        .where(*where).order_by(*order_cols).limit(50_000)
    )).all()
    buf = io.StringIO()
    buf.write("\ufeff")
    writer = csv.writer(buf, delimiter=";")
    writer.writerow(["No", "Tarih", "Alıcı", "Telefon", "Mesaj", "Kaynak", "Parça", "Durum", "Sağlayıcı", "Ref", "Tıklama", "Hata", "Gönderen"])
    for m, d, _t, u in rows:
        phone = mask_phone(m.phone, current_user) if current_user else m.phone
        writer.writerow([
            m.seq_no,
            m.created_at.astimezone(TZ).strftime("%d.%m.%Y %H:%M") if m.created_at else "",
            d.full_name if d else "",
            phone,
            m.body,
            m.source,
            m.parts,
            m.status,
            m.provider or "",
            m.provider_ref or "",
            m.click_count or 0,
            m.error or "",
            u or "",
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="sms-gonderimleri.csv"'},
    )


@router.get("/account")
async def sms_account_info(request: Request, db: AsyncSession = Depends(get_db)):
    """Which SMS account the organisation sends with and how much credit is left."""
    return await provider_balance(db, _org_id(request))


@router.get("/related")
async def related_messages(request: Request, related_type: str, ids: str = Query(max_length=8000),
                           db: AsyncSession = Depends(get_db)):
    """Latest SMS per record (comma separated ids), for the SMS column of receipt and transfer lists."""
    if related_type not in RELATED_TYPES:
        raise HTTPException(status_code=422, detail="Bilinmeyen kayıt türü")
    try:
        wanted = [UUID(part) for part in ids.split(",") if part.strip()][:300]
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Geçersiz kayıt numarası") from exc
    return await related_sms(db, _org_id(request), related_type, wanted)


async def _message(db: AsyncSession, org_id: UUID, message_id: UUID) -> SmsMessage:
    message = (await db.execute(select(SmsMessage).where(
        SmsMessage.id == message_id, SmsMessage.organization_id == org_id,
    ).with_for_update())).scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="SMS bulunamadı")
    return message


@router.post("/messages/{message_id}/retry", dependencies=[Depends(require_capability("sms.send"))])
async def retry_message(request: Request, message_id: UUID, db: AsyncSession = Depends(get_db),
                        current_user: User = Depends(get_current_user)):
    """Send a failed or cancelled message again, or a scheduled one right now."""
    org_id = _org_id(request)
    message = await _message(db, org_id, message_id)
    if message.status not in ("failed", "cancelled", "scheduled"):
        raise HTTPException(status_code=409, detail="Bu SMS yeniden gönderilemez")
    if message.source == "otp":
        raise HTTPException(status_code=409, detail="Giriş kodları yeniden gönderilemez")
    message.status, message.attempts, message.error = "queued", 0, None
    message.send_after = datetime.now(timezone.utc)
    kick_after_commit(db, message.id)
    _audit(db, org_id, current_user, "sms_yeniden_gonder", {"sms_no": message.seq_no})
    await db.commit()
    return {"status": message.status}


@router.post("/messages/{message_id}/cancel", dependencies=[Depends(require_capability("sms.send"))])
async def cancel_message(request: Request, message_id: UUID, db: AsyncSession = Depends(get_db),
                         current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    message = await _message(db, org_id, message_id)
    if message.status not in SMS_OPEN_STATUSES:
        raise HTTPException(status_code=409, detail="Yalnızca bekleyen SMS iptal edilebilir")
    message.status = "cancelled"
    _audit(db, org_id, current_user, "sms_iptal", {"sms_no": message.seq_no})
    await db.commit()
    return {"status": message.status}


class BulkMessageActionIn(BaseModel):
    ids: Optional[list[UUID]] = None
    batch_id: Optional[UUID] = None
    source: Optional[str] = None


@router.post("/messages/bulk-retry", dependencies=[Depends(require_capability("sms.send"))])
async def bulk_retry_messages(request: Request, payload: BulkMessageActionIn, db: AsyncSession = Depends(get_db),
                              current_user: User = Depends(get_current_user)):
    """Re-queue selected or matching failed/cancelled non-OTP messages in a single request."""
    org_id = _org_id(request)
    now = datetime.now(timezone.utc)
    where = [
        SmsMessage.organization_id == org_id,
        SmsMessage.status.in_(("failed", "cancelled")),
        SmsMessage.source != "otp",
    ]
    if payload.ids:
        where.append(SmsMessage.id.in_(payload.ids[:500]))
    if payload.batch_id:
        where.append(SmsMessage.batch_id == payload.batch_id)
    if payload.source:
        where.append(SmsMessage.source == payload.source)
    target_ids = (await db.execute(select(SmsMessage.id).where(*where).limit(1000))).scalars().all()
    if not target_ids:
        return {"retried": 0}
    await db.execute(
        update(SmsMessage).where(SmsMessage.id.in_(target_ids))
        .values(status="queued", attempts=0, error=None, send_after=now)
    )
    for mid in target_ids[:50]:
        kick_after_commit(db, mid)
    _audit(db, org_id, current_user, "sms_toplu_yeniden_gonder", {"count": len(target_ids)})
    await db.commit()
    return {"retried": len(target_ids)}


@router.post("/messages/bulk-cancel", dependencies=[Depends(require_capability("sms.send"))])
async def bulk_cancel_messages(request: Request, payload: BulkMessageActionIn, db: AsyncSession = Depends(get_db),
                               current_user: User = Depends(get_current_user)):
    """Cancel selected open (queued/scheduled) messages in a single request."""
    org_id = _org_id(request)
    if not payload.ids:
        return {"cancelled": 0}
    result = await db.execute(
        update(SmsMessage)
        .where(SmsMessage.organization_id == org_id, SmsMessage.id.in_(payload.ids[:500]),
               SmsMessage.status.in_(SMS_OPEN_STATUSES))
        .values(status="cancelled")
    )
    cancelled = result.rowcount or 0
    _audit(db, org_id, current_user, "sms_toplu_iptal", {"count": cancelled})
    await db.commit()
    return {"cancelled": cancelled}


@router.post("/reports/refresh", dependencies=[Depends(require_capability("sms.send"))])
async def refresh_delivery_reports(request: Request, db: AsyncSession = Depends(get_db)):
    """Manually poll provider delivery reports for this organisation's sent messages."""
    org_id = _org_id(request)
    totals = await collect_reports(db, org_id=org_id)
    await db.commit()
    return totals


# --- Bulk ----------------------------------------------------------------------------

class BatchIn(BaseModel):
    name: Optional[str] = Field(default=None, max_length=120)
    body: str = Field(min_length=2, max_length=1500)
    audience: Audience
    commercial: bool = False  # promotion / campaign announcement: İYS-checked, consent required
    template_id: Optional[UUID] = None
    campaign_id: Optional[UUID] = None
    send_at: Optional[datetime] = None
    quiet_hours: bool = True  # do not send at night; wait for 08:00
    throttle_per_minute: Optional[int] = Field(default=None, ge=10, le=10000)
    ab_variant_body: Optional[str] = Field(default=None, max_length=1500)
    ab_test_percent: Optional[int] = Field(default=None, ge=10, le=90)


class BatchPatchIn(BaseModel):
    name: Optional[str] = Field(default=None, max_length=120)
    body: Optional[str] = Field(default=None, min_length=2, max_length=1500)
    send_at: Optional[datetime] = None
    quiet_hours: bool = True
    throttle_per_minute: Optional[int] = Field(default=None, ge=10, le=10000)


class BulkTestIn(BaseModel):
    phone: str = Field(min_length=7, max_length=32)
    body: str = Field(min_length=2, max_length=1500)
    sample_name: Optional[str] = Field(default=None, max_length=120)
    campaign_id: Optional[UUID] = None
    variables: dict[str, str] = Field(default_factory=dict)


async def _plan(db: AsyncSession, org_id: UUID, payload: BatchIn):
    unknown = unknown_variables(payload.body)
    if unknown:
        raise HTTPException(status_code=422, detail="Bilinmeyen değişken: " + ", ".join("{%s}" % u for u in unknown))
    if payload.ab_variant_body and payload.ab_variant_body.strip():
        unknown_b = unknown_variables(payload.ab_variant_body)
        if unknown_b:
            raise HTTPException(status_code=422, detail="B varyantında bilinmeyen değişken: " + ", ".join("{%s}" % u for u in unknown_b))
    if payload.audience.kind == "campaign" and not payload.audience.campaign_id:
        raise HTTPException(status_code=422, detail="Kampanya seçin")
    if payload.audience.kind == "tag" and not (payload.audience.tag or "").strip():
        raise HTTPException(status_code=422, detail="Etiket seçin")
    if payload.audience.kind == "city" and not (payload.audience.city or "").strip():
        raise HTTPException(status_code=422, detail="Şehir seçin")
    if payload.audience.kind == "list" and not payload.audience.list_id:
        raise HTTPException(status_code=422, detail="Liste seçin")
    recipients, stats = await resolve(db, org_id, payload.audience, commercial=payload.commercial)
    now = datetime.now(timezone.utc)
    send_at = payload.send_at
    if send_at and not send_at.tzinfo:
        send_at = send_at.replace(tzinfo=TZ)
    if send_at and send_at > now + timedelta(days=366):
        raise HTTPException(status_code=422, detail="Gönderim tarihi en fazla bir yıl sonrası olabilir")
    start = max(send_at or now, now)
    adjusted = after_quiet_hours(start) if payload.quiet_hours else start
    return recipients, stats, (adjusted if adjusted > now + timedelta(seconds=30) else None), adjusted != start


@router.get("/audience-options")
async def get_audience_options(request: Request, db: AsyncSession = Depends(get_db)):
    return await audience_options(db, _org_id(request))


@router.post("/batches/preview")
async def preview_batch(request: Request, payload: BatchIn, db: AsyncSession = Depends(get_db)):
    """Who would get the message and what it costs, without sending anything."""
    org_id = _org_id(request)
    recipients, stats, send_at, moved = await _plan(db, org_id, payload)
    org = await db.get(Organization, org_id)
    base_url = site_url(org) if org else None
    ctx = await build_context(db, org_id, campaign_id=payload.campaign_id)
    try:
        rendered = render_bulk(clean_sms_text(payload.body), ctx, recipients, org_id=org_id, base_url=base_url, preview_only=True)
        rendered_b = (
            render_bulk(clean_sms_text(payload.ab_variant_body), ctx, recipients[:1], org_id=org_id, base_url=base_url, preview_only=True)
            if payload.ab_variant_body and payload.ab_variant_body.strip() and recipients
            else None
        )
    except SmsError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    sample = rendered[0] if rendered else None
    sample_b = rendered_b[0] if rendered_b else None
    return {
        "recipients": len(recipients), "stats": stats, "parts_total": sum(info["parts"] for _r, _t, info in rendered),
        "max_parts": max((info["parts"] for _r, _t, info in rendered), default=0),
        "org_name": org.name if org else None,
        "sample": {"name": sample[0].name, "phone": masked(sample[0].phone), "body": sample[1], "segments": sample[2]} if sample else None,
        "ab_sample": {"body": sample_b[1], "segments": sample_b[2]} if sample_b else None,
        "send_at": send_at, "moved_for_quiet_hours": moved,
        "label": await audience_label(db, org_id, payload.audience),
    }


@router.post("/batches/test", dependencies=[Depends(require_capability("sms.bulk"))])
async def send_bulk_test(request: Request, payload: BulkTestIn, db: AsyncSession = Depends(get_db),
                         current_user: User = Depends(get_current_user)):
    """Send a single test SMS with realistic sample variables without polluting the batch list."""
    org_id = _org_id(request)
    unknown = unknown_variables(payload.body)
    if unknown:
        raise HTTPException(status_code=422, detail="Bilinmeyen değişken: " + ", ".join("{%s}" % u for u in unknown))
    sample_name = (payload.sample_name or "").strip() or f"{current_user.first_name or ''} {current_user.last_name or ''}".strip() or "Örnek Bağışçı"
    org = await db.get(Organization, org_id)
    base_url = site_url(org) if org else ""
    ctx = await build_context(db, org_id, campaign_id=payload.campaign_id, extra={
        **payload.variables,
        "ad_soyad": sample_name,
        "ad": sample_name.split(" ")[0],
    })
    if "{ret_linki}" in payload.body and base_url:
        ctx["ret_linki"] = f"{base_url}/sms-iptal/{opt_out_token(org_id, payload.phone)}"
    rendered = render_template(payload.body, ctx)
    try:
        message = await enqueue_sms(
            db, org_id, payload.phone, rendered, source="test", created_by=current_user.id,
        )
    except SmsError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    _audit(db, org_id, current_user, "toplu_sms_test", {"sms_no": message.seq_no})
    await db.commit()
    return {"id": str(message.id), "seq_no": message.seq_no, "status": message.status, "body": rendered}


def _batch_row(batch: SmsBatch, counts: dict, sender: Optional[str], *,
               clicks: int = 0, donations_count: int = 0, donations_cents: int = 0,
               ab_stats: Optional[dict] = None) -> dict:
    delivered = counts.get("delivered", 0)
    sent_only = counts.get("sent", 0)
    done = sent_only + delivered
    waiting = counts.get("queued", 0) + counts.get("scheduled", 0)
    state = ("cancelled" if batch.cancelled_at and not waiting else
             "scheduled" if counts.get("scheduled", 0) and not counts.get("queued", 0) and not done else
             "sending" if waiting else "done")
    return {
        "id": str(batch.id), "name": batch.name, "body": batch.body, "audience_label": batch.audience_label,
        "commercial": batch.commercial, "total": batch.total, "sent": done, "delivered": delivered,
        "failed": counts.get("failed", 0), "waiting": waiting, "cancelled": counts.get("cancelled", 0),
        "state": state, "send_after": batch.send_after, "created_at": batch.created_at, "created_by": sender,
        "campaign_id": str(batch.campaign_id) if batch.campaign_id else None,
        "throttle_per_minute": batch.throttle_per_minute,
        "ab_variant_body": batch.ab_variant_body, "ab_test_percent": batch.ab_test_percent,
        "clicks": clicks, "donations_count": donations_count, "donations_cents": donations_cents,
        "ab_stats": ab_stats,
    }


@router.post("/batches", status_code=201, dependencies=[Depends(require_capability("sms.bulk"))])
async def send_batch(request: Request, payload: BatchIn, db: AsyncSession = Depends(get_db),
                     current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    recipients, stats, send_at, _moved = await _plan(db, org_id, payload)
    label = await audience_label(db, org_id, payload.audience)
    template_id = (await _template(db, org_id, payload.template_id)).id if payload.template_id else None
    audience = payload.audience.model_dump(mode="json")
    if audience.get("numbers"):  # the list is in the messages; do not keep a second copy of the numbers
        audience["numbers"] = f"{len(recipients)} numara"
    try:
        batch = await create_batch(
            db, org_id, name=(payload.name or "").strip() or label, body=payload.body, audience=audience, label=label,
            recipients=recipients, commercial=payload.commercial, send_at=send_at, created_by=current_user.id,
            template_id=template_id, campaign_id=payload.campaign_id,
            throttle_per_minute=payload.throttle_per_minute,
            ab_variant_body=payload.ab_variant_body, ab_test_percent=payload.ab_test_percent,
        )
    except SmsError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    _audit(db, org_id, current_user, "toplu_sms_gonder", {
        "batch_id": str(batch.id), "audience": label, "recipients": batch.total, "commercial": payload.commercial,
        "without_consent": bool(payload.audience.include_without_consent and not payload.commercial), **stats,
    })
    await db.commit()
    waiting = "scheduled" if send_at else "queued"
    return _batch_row(batch, {waiting: batch.total}, current_user.email)


@router.get("/batches")
async def list_batches(request: Request, db: AsyncSession = Depends(get_db), limit: Annotated[int, Query(ge=1, le=100)] = 30):
    org_id = _org_id(request)
    rows = (await db.execute(
        select(SmsBatch, User.email).outerjoin(User, User.id == SmsBatch.created_by)
        .where(SmsBatch.organization_id == org_id).order_by(SmsBatch.created_at.desc()).limit(limit)
    )).all()
    counts: dict = {}
    clicks_by_batch: dict[UUID, int] = {}
    ab_by_batch: dict[UUID, dict] = {}
    roi_by_batch: dict[UUID, tuple[int, int]] = {}
    if rows:
        batch_ids = [b.id for b, _ in rows]
        for batch_id, status, number in (await db.execute(
            select(SmsMessage.batch_id, SmsMessage.status, func.count(SmsMessage.id))
            .where(SmsMessage.batch_id.in_(batch_ids)).group_by(SmsMessage.batch_id, SmsMessage.status)
        )).all():
            counts.setdefault(batch_id, {})[status] = number

        for batch_id, click_total in (await db.execute(
            select(SmsMessage.batch_id, func.count(SmsMessage.id))
            .where(SmsMessage.batch_id.in_(batch_ids), SmsMessage.click_count > 0)
            .group_by(SmsMessage.batch_id)
        )).all():
            clicks_by_batch[batch_id] = click_total

        for batch_id, variant, status, number, clicked in (await db.execute(
            select(
                SmsMessage.batch_id, SmsMessage.ab_variant, SmsMessage.status,
                func.count(SmsMessage.id),
                func.count(SmsMessage.id).filter(SmsMessage.click_count > 0),
            )
            .where(SmsMessage.batch_id.in_(batch_ids), SmsMessage.ab_variant.is_not(None))
            .group_by(SmsMessage.batch_id, SmsMessage.ab_variant, SmsMessage.status)
        )).all():
            entry = ab_by_batch.setdefault(batch_id, {}).setdefault(variant, {"total": 0, "delivered": 0, "clicks": 0})
            entry["total"] += number
            if status in ("sent", "delivered"):
                entry["delivered"] += number
            entry["clicks"] += clicked

        # Attributed conversions: confirmed donations by recipients within 7 days of batch send_after
        for batch, _email in rows:
            if not batch.send_after or batch.cancelled_at:
                continue
            window_end = batch.send_after + timedelta(days=7)
            donor_subq = select(SmsMessage.donor_id).where(
                SmsMessage.batch_id == batch.id,
                SmsMessage.donor_id.is_not(None),
                SmsMessage.status.in_(("sent", "delivered")),
            )
            don_where = [
                Donation.organization_id == org_id,
                Donation.status == DonationStatus.CONFIRMED,
                Donation.donor_id.in_(donor_subq),
                Donation.created_at >= batch.send_after,
                Donation.created_at <= window_end,
            ]
            if batch.campaign_id:
                don_where.append(Donation.campaign_id == batch.campaign_id)
            d_cnt, d_sum = (await db.execute(
                select(func.count(Donation.id), func.coalesce(func.sum(Donation.amount_cents), 0)).where(*don_where)
            )).one()
            roi_by_batch[batch.id] = (int(d_cnt or 0), int(d_sum or 0))

    return [
        _batch_row(
            batch, counts.get(batch.id, {}), email,
            clicks=clicks_by_batch.get(batch.id, 0),
            donations_count=roi_by_batch.get(batch.id, (0, 0))[0],
            donations_cents=roi_by_batch.get(batch.id, (0, 0))[1],
            ab_stats=ab_by_batch.get(batch.id),
        )
        for batch, email in rows
    ]


@router.patch("/batches/{batch_id}", dependencies=[Depends(require_capability("sms.bulk"))])
async def update_scheduled_batch(request: Request, batch_id: UUID, payload: BatchPatchIn,
                                 db: AsyncSession = Depends(get_db),
                                 current_user: User = Depends(get_current_user)):
    """Edit a scheduled bulk SMS before it begins sending."""
    org_id = _org_id(request)
    batch = (await db.execute(select(SmsBatch).where(
        SmsBatch.id == batch_id, SmsBatch.organization_id == org_id).with_for_update())).scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Toplu gönderim bulunamadı")
    if batch.cancelled_at:
        raise HTTPException(status_code=409, detail="İptal edilmiş gönderim düzenlenemez")
    scheduled_msgs = (await db.execute(
        select(SmsMessage).where(SmsMessage.batch_id == batch.id, SmsMessage.status == "scheduled")
        .order_by(SmsMessage.seq_no)
    )).scalars().all()
    if not scheduled_msgs:
        raise HTTPException(status_code=409, detail="Yalnızca henüz başlamamış zamanlanmış gönderimler düzenlenebilir")

    now = datetime.now(timezone.utc)
    if payload.name is not None and payload.name.strip():
        batch.name = payload.name.strip()
    if payload.throttle_per_minute is not None:
        batch.throttle_per_minute = payload.throttle_per_minute

    new_send_after = batch.send_after
    if payload.send_at is not None:
        send_at = payload.send_at if payload.send_at.tzinfo else payload.send_at.replace(tzinfo=TZ)
        if send_at > now + timedelta(days=366):
            raise HTTPException(status_code=422, detail="Gönderim tarihi en fazla bir yıl sonrası olabilir")
        start = max(send_at, now)
        new_send_after = after_quiet_hours(start) if payload.quiet_hours else start
        batch.send_after = new_send_after

    if payload.body is not None:
        unknown = unknown_variables(payload.body)
        if unknown:
            raise HTTPException(status_code=422, detail="Bilinmeyen değişken: " + ", ".join("{%s}" % u for u in unknown))
        batch.body = clean_sms_text(payload.body)
        org = await db.get(Organization, org_id)
        base_url = site_url(org) if org else settings.PUBLIC_WEB_URL.rstrip("/")
        base_ctx = await build_context(db, org_id, campaign_id=batch.campaign_id)
        donor_ids = [m.donor_id for m in scheduled_msgs if m.donor_id]
        donors = {}
        if donor_ids:
            for d in (await db.execute(select(Donor).where(Donor.id.in_(donor_ids)))).scalars().all():
                donors[d.id] = d
        for idx, msg in enumerate(scheduled_msgs):
            donor = donors.get(msg.donor_id)
            ctx = {
                **base_ctx,
                "ad_soyad": donor.full_name if donor else "",
                "ad": donor.first_name if donor else "",
            }
            if "{ret_linki}" in batch.body:
                ctx["ret_linki"] = f"{base_url}/sms-iptal/{opt_out_token(org_id, msg.phone, msg.donor_id)}"
            if msg.track_code:
                ctx["odeme_linki"] = f"{base_url}/s/{msg.track_code}"
            rendered = render_template(batch.body, ctx)
            info = segment_info(rendered)
            if not info["parts"] or info["parts"] > MAX_PARTS:
                raise HTTPException(status_code=422, detail="Mesaj uzunluğu geçersiz (en fazla 10 SMS)")
            msg.body = rendered
            msg.encoding = info["encoding"]
            msg.parts = info["parts"]

    throttle = batch.throttle_per_minute
    for idx, msg in enumerate(scheduled_msgs):
        msg.send_after = new_send_after + timedelta(minutes=idx // throttle) if throttle else new_send_after

    _audit(db, org_id, current_user, "toplu_sms_duzenle", {"batch_id": str(batch.id)})
    await db.commit()
    return {"ok": True, "send_after": batch.send_after}


@router.post("/batches/{batch_id}/retry-failed", dependencies=[Depends(require_capability("sms.bulk"))])
async def retry_batch_failed(request: Request, batch_id: UUID, db: AsyncSession = Depends(get_db),
                             current_user: User = Depends(get_current_user)):
    """Re-queue all failed messages of a specific bulk SMS batch."""
    org_id = _org_id(request)
    batch = (await db.execute(select(SmsBatch).where(
        SmsBatch.id == batch_id, SmsBatch.organization_id == org_id))).scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Toplu gönderim bulunamadı")
    now = datetime.now(timezone.utc)
    result = await db.execute(
        update(SmsMessage)
        .where(SmsMessage.batch_id == batch.id, SmsMessage.status == "failed")
        .values(status="queued", attempts=0, error=None, send_after=now)
    )
    retried = result.rowcount or 0
    if retried:
        from sqlalchemy import event
        event.listen(db.sync_session, "after_commit", lambda _s: _kick_batch(str(batch.id)), once=True)
    _audit(db, org_id, current_user, "toplu_sms_basarisiz_tekrar", {"batch_id": str(batch.id), "retried": retried})
    await db.commit()
    return {"retried": retried}


@router.post("/batches/{batch_id}/cancel", dependencies=[Depends(require_capability("sms.bulk"))])
async def cancel_bulk(request: Request, batch_id: UUID, db: AsyncSession = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    batch = (await db.execute(select(SmsBatch).where(
        SmsBatch.id == batch_id, SmsBatch.organization_id == org_id).with_for_update())).scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Toplu gönderim bulunamadı")
    cancelled = await cancel_batch(db, batch)
    _audit(db, org_id, current_user, "toplu_sms_iptal", {"batch_id": str(batch.id), "cancelled": cancelled})
    await db.commit()
    return {"cancelled": cancelled}


# --- Public Opt-out & Click Tracking -------------------------------------------------

@public_router.get("/opt-out/{token}")
async def get_opt_out_info(token: str, db: AsyncSession = Depends(get_db)):
    parsed = verify_opt_out_token(token)
    if not parsed:
        raise HTTPException(status_code=404, detail="Geçersiz veya süresi dolmuş bağlantı")
    org_id, phone, donor_id = parsed
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Kurum bulunamadı")
    q = select(Donor.allow_sms).where(Donor.organization_id == org_id)
    q = q.where(Donor.id == donor_id) if donor_id else q.where(Donor.phone == phone)
    allow = (await db.execute(q)).scalars().first()
    return {
        "org_name": org.name,
        "phone_masked": masked(phone),
        "opted_out": allow is False,
    }


@public_router.post("/opt-out/{token}")
async def confirm_opt_out(token: str, db: AsyncSession = Depends(get_db)):
    parsed = verify_opt_out_token(token)
    if not parsed:
        raise HTTPException(status_code=404, detail="Geçersiz veya süresi dolmuş bağlantı")
    org_id, phone, donor_id = parsed
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Kurum bulunamadı")
    where = [Donor.organization_id == org_id]
    if donor_id:
        where.append(or_(Donor.id == donor_id, Donor.phone == phone))
    else:
        where.append(Donor.phone == phone)
    await db.execute(update(Donor).where(*where).values(allow_sms=False))
    await db.commit()
    return {"ok": True, "org_name": org.name}


@public_router.get("/r/{code}")
async def track_sms_click(code: str, db: AsyncSession = Depends(get_db)):
    msg = (await db.execute(select(SmsMessage).where(SmsMessage.track_code == code))).scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Bağlantı bulunamadı")
    now = datetime.now(timezone.utc)
    if not msg.clicked_at:
        msg.clicked_at = now
    msg.click_count = (msg.click_count or 0) + 1
    org = await db.get(Organization, msg.organization_id)
    base = site_url(org) if org else ""
    target = base
    if msg.batch_id:
        batch = await db.get(SmsBatch, msg.batch_id)
        if batch and batch.campaign_id:
            camp = await db.get(Campaign, batch.campaign_id)
            if camp and camp.slug:
                target = f"{base}/kampanyalar/{camp.slug}"
    sep = "&" if "?" in target else "?"
    redirect_url = f"{target}{sep}utm_source=sms&utm_medium=bulk&utm_campaign={msg.batch_id or 'sms'}"
    await db.commit()
    return {"redirect_url": redirect_url}

"""SMS: templates, quick send with preview, and the log of everything that was sent.

Paths contain "/sms", so api.deps requires the SMS module and (for writes) "Bağışçı ve SMS yönetimi".
"""
import json
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal, Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin_route_feature, require_admin_route_permission
from app.core.db import get_db
from app.models.audit_log import AuditLog
from app.models.automation import BankTransaction
from app.models.donation import Donation, Donor
from app.models.sms_batch import SmsBatch
from app.models.sms_message import SMS_OPEN_STATUSES, SMS_SOURCES, SMS_STATUSES, SmsMessage
from app.models.sms_template import SmsTemplate
from app.models.user import User
from app.services.sms_audience import Audience, audience_label, audience_options, resolve
from app.services.sms_service import (
    AUTO_MODES, MAX_PARTS, SMS_EVENTS, SMS_VARIABLES, after_quiet_hours, build_context, cancel_batch, clean_sms_text,
    create_batch, enqueue_sms, render_bulk,
    ensure_default_templates, kick_after_commit, related_sms, render_template, segment_info, unknown_variables,
)
from app.sms import SmsError

router = APIRouter(
    prefix="/admin-features/sms",
    tags=["sms"],
    dependencies=[Depends(require_admin_route_permission), Depends(require_admin_route_feature)],
)
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


def _template_row(template: SmsTemplate) -> dict:
    return {
        "id": str(template.id), "name": template.name, "body": template.body, "event_key": template.event_key,
        "event_label": SMS_EVENTS[template.event_key][0] if template.event_key in SMS_EVENTS else None,
        "campaign_id": str(template.campaign_id) if template.campaign_id else None,
        "auto_mode": template.auto_mode, "is_active": template.is_active,
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
    return [_template_row(t) for t in templates]


@router.post("/templates", status_code=201)
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


@router.put("/templates/{template_id}")
async def update_template(request: Request, template_id: UUID, payload: TemplateIn,
                          db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    template = await _template(db, org_id, template_id)
    await _apply_template(db, org_id, template, payload)
    _audit(db, org_id, current_user, "sms_sablon_guncelle", {"template_id": str(template.id), "name": template.name})
    await db.commit()
    await db.refresh(template)
    return _template_row(template)


@router.delete("/templates/{template_id}")
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
    transfer_id: Optional[UUID] = None, variables: Optional[str] = Query(default=None, max_length=2000),
    db: AsyncSession = Depends(get_db),
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
        "phone": donor.phone if donor else None, "allow_sms": bool(donor.allow_sms) if donor else None,
    }


@router.post("/send")
async def send_sms(request: Request, payload: SendIn, db: AsyncSession = Depends(get_db),
                   current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    donor, donation, transfer = await _records(db, org_id, payload)
    phone = (payload.phone or "").strip() or (donor.phone if donor else None)
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
                 sender: Optional[str]) -> dict:
    return {
        "id": str(message.id), "seq_no": message.seq_no, "phone": message.phone,
        "donor_id": str(message.donor_id) if message.donor_id else None, "donor_name": donor_name,
        "body": message.body, "status": message.status, "source": message.source,
        "related_type": message.related_type,
        "related_id": str(message.related_id) if message.related_id else None,
        "template_name": template_name, "encoding": message.encoding, "parts": message.parts,
        "provider": message.provider, "error": message.error, "attempts": message.attempts,
        "send_after": message.send_after, "sent_at": message.sent_at, "delivered_at": message.delivered_at,
        "created_at": message.created_at, "created_by": sender,
    }


@router.get("/messages")
async def list_messages(
    request: Request, db: AsyncSession = Depends(get_db),
    status: Optional[str] = None, source: Optional[str] = None, q: Optional[str] = Query(default=None, max_length=80),
    donor_id: Optional[UUID] = None, related_type: Optional[str] = None, related_id: Optional[UUID] = None,
    date_from: Optional[date] = None, date_to: Optional[date] = None,
    page: int = Query(default=1, ge=1), page_size: int = Query(default=50, ge=1, le=200),
):
    org_id = _org_id(request)
    scope = [SmsMessage.organization_id == org_id]
    if source:
        scope.append(SmsMessage.source == source)
    if donor_id:
        scope.append(SmsMessage.donor_id == donor_id)
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
                   Donor.last_name.ilike(f"%{term}%")]
        if len(digits) >= 3:
            matches.append(SmsMessage.phone.like(f"%{digits.lstrip('0')}%"))
        if term.lstrip("#").isdigit():
            matches.append(SmsMessage.seq_no == int(term.lstrip("#")))
        scope.append(or_(*matches))

    counts = dict((await db.execute(
        select(SmsMessage.status, func.count(SmsMessage.id)).select_from(SmsMessage)
        .outerjoin(Donor, Donor.id == SmsMessage.donor_id).where(*scope).group_by(SmsMessage.status)
    )).all())
    where = scope + ([SmsMessage.status == status] if status else [])
    rows = (await db.execute(
        select(SmsMessage, Donor, SmsTemplate.name, User.email)
        .outerjoin(Donor, Donor.id == SmsMessage.donor_id)
        .outerjoin(SmsTemplate, SmsTemplate.id == SmsMessage.template_id)
        .outerjoin(User, User.id == SmsMessage.created_by)
        .where(*where).order_by(SmsMessage.created_at.desc(), SmsMessage.seq_no.desc())
        .offset((page - 1) * page_size).limit(page_size)
    )).all()
    return {
        "items": [_message_row(m, d.full_name if d else None, t, u) for m, d, t, u in rows],
        "total": counts.get(status, 0) if status else sum(counts.values()),
        "counts": {key: counts.get(key, 0) for key in SMS_STATUSES},
        "parts_sent": (await db.execute(
            select(func.coalesce(func.sum(SmsMessage.parts), 0)).select_from(SmsMessage)
            .outerjoin(Donor, Donor.id == SmsMessage.donor_id)
            .where(*scope, SmsMessage.status.in_(("sent", "delivered")))
        )).scalar(),
    }


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


@router.post("/messages/{message_id}/retry")
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


@router.post("/messages/{message_id}/cancel")
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


# --- Bulk ----------------------------------------------------------------------------

class BatchIn(BaseModel):
    name: Optional[str] = Field(default=None, max_length=120)
    body: str = Field(min_length=2, max_length=1500)
    audience: Audience
    commercial: bool = False  # promotion / campaign announcement: İYS-checked, consent required
    template_id: Optional[UUID] = None
    send_at: Optional[datetime] = None
    quiet_hours: bool = True  # do not send at night; wait for 08:00


async def _plan(db: AsyncSession, org_id: UUID, payload: BatchIn):
    unknown = unknown_variables(payload.body)
    if unknown:
        raise HTTPException(status_code=422, detail="Bilinmeyen değişken: " + ", ".join("{%s}" % u for u in unknown))
    if payload.audience.kind == "campaign" and not payload.audience.campaign_id:
        raise HTTPException(status_code=422, detail="Kampanya seçin")
    if payload.audience.kind == "tag" and not (payload.audience.tag or "").strip():
        raise HTTPException(status_code=422, detail="Etiket seçin")
    if payload.audience.kind == "city" and not (payload.audience.city or "").strip():
        raise HTTPException(status_code=422, detail="Şehir seçin")
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
    try:
        rendered = render_bulk(clean_sms_text(payload.body), await build_context(db, org_id), recipients)
    except SmsError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    sample = rendered[0] if rendered else None
    return {
        "recipients": len(recipients), "stats": stats, "parts_total": sum(info["parts"] for _r, _t, info in rendered),
        "max_parts": max((info["parts"] for _r, _t, info in rendered), default=0),
        "sample": {"name": sample[0].name, "phone": sample[0].phone, "body": sample[1], "segments": sample[2]} if sample else None,
        "send_at": send_at, "moved_for_quiet_hours": moved,
        "label": await audience_label(db, org_id, payload.audience),
    }


def _batch_row(batch: SmsBatch, counts: dict, sender: Optional[str]) -> dict:
    done = counts.get("sent", 0) + counts.get("delivered", 0)
    waiting = counts.get("queued", 0) + counts.get("scheduled", 0)
    state = ("cancelled" if batch.cancelled_at and not waiting else
             "scheduled" if counts.get("scheduled", 0) else "sending" if waiting else "done")
    return {
        "id": str(batch.id), "name": batch.name, "body": batch.body, "audience_label": batch.audience_label,
        "commercial": batch.commercial, "total": batch.total, "sent": done, "failed": counts.get("failed", 0),
        "waiting": waiting, "cancelled": counts.get("cancelled", 0), "state": state,
        "send_after": batch.send_after, "created_at": batch.created_at, "created_by": sender,
    }


@router.post("/batches", status_code=201)
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
            template_id=template_id,
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
async def list_batches(request: Request, db: AsyncSession = Depends(get_db), limit: int = Query(default=30, ge=1, le=100)):
    org_id = _org_id(request)
    rows = (await db.execute(
        select(SmsBatch, User.email).outerjoin(User, User.id == SmsBatch.created_by)
        .where(SmsBatch.organization_id == org_id).order_by(SmsBatch.created_at.desc()).limit(limit)
    )).all()
    counts: dict = {}
    if rows:
        for batch_id, status, number in (await db.execute(
            select(SmsMessage.batch_id, SmsMessage.status, func.count(SmsMessage.id))
            .where(SmsMessage.batch_id.in_([b.id for b, _ in rows])).group_by(SmsMessage.batch_id, SmsMessage.status)
        )).all():
            counts.setdefault(batch_id, {})[status] = number
    return [_batch_row(batch, counts.get(batch.id, {}), email) for batch, email in rows]


@router.post("/batches/{batch_id}/cancel")
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

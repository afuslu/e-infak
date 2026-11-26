"""WhatsApp Business: account, templates, sends, inbox, automatic notifications, consent, links/QR,
calls and Meta's webhook."""
import json
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_feature, require_module
from app.core.db import get_db
from app.core.plans import Feature
from app.models.audit_log import AuditLog
from app.models.campaign import Campaign
from app.models.channels import WhatsAppCall, WhatsAppConversation, WhatsAppMessage
from app.models.donation import Donor
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.services import whatsapp as wa
from app.services import whatsapp_calls as calls
from app.services import whatsapp_events as events
from app.services import whatsapp_inbox as inbox
from app.services.integrations import HOOK_SECRET, ensure_hook_secret, hook_url, resolve_hook
from app.services.sms_audience import Audience, audience_label, resolve
from app.services.tenant_credentials import CredentialsUnavailable, get_credentials, masked, save_credentials

router = APIRouter(prefix="/admin-features/whatsapp", tags=["whatsapp"],
                   dependencies=[Depends(require_feature(Feature.WHATSAPP))])
hooks_router = APIRouter(prefix="/hooks", tags=["hooks"])
reader = require_module("sms", "donors", write=False)
sender = require_module("sms")
settings_manager = require_module("settings")
MAX_BULK = 20_000


def _org_id(request: Request) -> UUID:
    return UUID(str(request.state.organization_id))


async def _org(db: AsyncSession, request: Request) -> Organization:
    org = await db.get(Organization, _org_id(request))
    if not org:
        raise HTTPException(status_code=404, detail="Kurum bulunamadı")
    return org


async def _creds(db: AsyncSession, org_id: UUID) -> dict:
    try:
        return await get_credentials(db, org_id, wa.PROVIDER) or {}
    except CredentialsUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


async def _ready_creds(db: AsyncSession, org_id: UUID) -> dict:
    creds = await _creds(db, org_id)
    if not wa.configured(creds):
        raise HTTPException(status_code=400, detail="Önce WhatsApp hesabını tanımlayın")
    return creds


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


def _account(org_id: UUID, creds: dict) -> dict:
    return {
        "configured": wa.configured(creds),
        "values": masked(wa.PROVIDER, creds),
        "webhook_url": hook_url("whatsapp", org_id, creds.get(HOOK_SECRET)),
        "verify_token": creds.get(HOOK_SECRET),
        "can_list_templates": bool(creds.get("business_account_id")),
        "signed_webhooks": bool(creds.get("app_secret")),
    }


def _row(m: WhatsAppMessage, donor: Optional[Donor] = None) -> dict:
    return {
        "id": str(m.id), "phone": m.phone, "donor_id": str(m.donor_id) if m.donor_id else None,
        "donor_name": donor.full_name if donor else None, "kind": m.kind, "template_name": m.template_name,
        "params": m.params or [], "body": m.body, "status": m.status, "error": m.error,
        "direction": m.direction, "source": m.source, "media": m.media, "interactive": m.interactive,
        "conversation_id": str(m.conversation_id) if m.conversation_id else None,
        "fallback_sms": bool((m.fallback or {}).get("done")),
        "batch_id": str(m.batch_id) if m.batch_id else None,
        "created_at": _iso(m.created_at), "sent_at": _iso(m.sent_at),
        "delivered_at": _iso(m.delivered_at), "read_at": _iso(m.read_at),
    }


# --- account -----------------------------------------------------------------------------------

@router.get("/account")
async def get_account(request: Request, db: AsyncSession = Depends(get_db), _: User = Depends(reader)):
    org_id = _org_id(request)
    return _account(org_id, await _creds(db, org_id))


@router.get("/account/health")
async def account_health(request: Request, db: AsyncSession = Depends(get_db), _: User = Depends(reader)):
    """Number, verified name, quality rating and messaging tier straight from Meta."""
    org = await _org(db, request)
    info = await wa.phone_info(await _ready_creds(db, org.id))
    display = info.get("display_phone_number")
    if display and wa.normalize_phone(display) != inbox.settings_of(org).get("display_phone"):
        inbox.save_settings(org, "display_phone", wa.normalize_phone(display))
        await db.commit()
    return info


class AccountIn(BaseModel):
    values: dict[str, str] = Field(default_factory=dict)


@router.put("/account")
async def save_account(payload: AccountIn, request: Request, db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(settings_manager)):
    org_id = _org_id(request)
    previous = await _creds(db, org_id)
    values = {**payload.values, HOOK_SECRET: previous.get(HOOK_SECRET) or ""}
    try:
        await save_credentials(db, org_id, wa.PROVIDER, values, actor=current_user.email)
        creds = await ensure_hook_secret(db, org_id, wa.PROVIDER, actor=current_user.email)
    except CredentialsUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    db.add(AuditLog(organization_id=org_id, user_id=current_user.id, action="whatsapp_hesabi_guncelle",
                    details={"fields": sorted(k for k in creds if k != HOOK_SECRET)}))
    await db.commit()
    return _account(org_id, creds)


# --- templates ---------------------------------------------------------------------------------

@router.get("/templates")
async def templates(request: Request, all: bool = False, db: AsyncSession = Depends(get_db),
                    _: User = Depends(reader)):
    """Approved templates for sending; `all=true` also lists pending and rejected ones."""
    creds = await _creds(db, _org_id(request))
    try:
        return await wa.list_templates(creds, approved_only=not all)
    except wa.WhatsAppError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class TemplateButton(BaseModel):
    type: Literal["QUICK_REPLY", "URL", "PHONE_NUMBER"]
    text: str = Field(max_length=25)
    url: Optional[str] = Field(default=None, max_length=2000)
    phone_number: Optional[str] = Field(default=None, max_length=30)


class TemplateIn(BaseModel):
    name: str = Field(min_length=1, max_length=512)
    language: str = Field(default="tr", max_length=10)
    category: Literal["UTILITY", "MARKETING"] = "UTILITY"
    header_text: Optional[str] = Field(default=None, max_length=60)
    body: str = Field(min_length=1, max_length=1024)
    footer: Optional[str] = Field(default=None, max_length=60)
    examples: list[str] = Field(default_factory=list, max_length=20)
    buttons: list[TemplateButton] = Field(default_factory=list, max_length=10)


@router.post("/templates")
async def create_template(payload: TemplateIn, request: Request, db: AsyncSession = Depends(get_db),
                          current_user: User = Depends(settings_manager)):
    org_id = _org_id(request)
    creds = await _creds(db, org_id)
    spec = payload.model_dump()
    spec["header"] = {"format": "TEXT", "text": payload.header_text} if payload.header_text else None
    try:
        created = await wa.create_template(creds, spec)
    except wa.WhatsAppError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.add(AuditLog(organization_id=org_id, user_id=current_user.id, action="whatsapp_sablon_olustur",
                    details={"name": created["name"], "category": created["category"]}))
    await db.commit()
    return created


@router.delete("/templates/{name}")
async def delete_template(name: str, request: Request, db: AsyncSession = Depends(get_db),
                          current_user: User = Depends(settings_manager)):
    org_id = _org_id(request)
    try:
        await wa.delete_template(await _creds(db, org_id), name)
    except wa.WhatsAppError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.add(AuditLog(organization_id=org_id, user_id=current_user.id, action="whatsapp_sablon_sil",
                    details={"name": name}))
    await db.commit()
    return {"deleted": name}


# --- automatic notifications ---------------------------------------------------------------------

@router.get("/events")
async def list_events(request: Request, db: AsyncSession = Depends(get_db), _: User = Depends(reader)):
    from app.services.sms_service import SMS_EVENTS, event_template

    org = await _org(db, request)
    out = []
    for key, (label, _mode, _name, _body) in SMS_EVENTS.items():
        _sms_body, sms_mode, _tid = await event_template(db, org.id, key)
        suggested = events.SUGGESTED.get(key)
        out.append({"key": key, "label": label, "sms_mode": sms_mode, **events.event_config(org, key),
                    "suggested": suggested})
    return out


class EventIn(BaseModel):
    channel: Literal["sms", "whatsapp", "both"] = "sms"
    template_name: Optional[str] = Field(default=None, max_length=120)
    language: Optional[str] = Field(default=None, max_length=10)
    params: list[str] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def _template(self):
        if self.channel != "sms" and not (self.template_name or "").strip():
            raise ValueError("WhatsApp ile göndermek için onaylı bir şablon seçin")
        return self


@router.put("/events/{event_key}")
async def save_event(event_key: str, payload: EventIn, request: Request, db: AsyncSession = Depends(get_db),
                     current_user: User = Depends(settings_manager)):
    from app.services.sms_service import SMS_EVENTS

    if event_key not in SMS_EVENTS:
        raise HTTPException(status_code=404, detail="Bilinmeyen olay")
    org = await _org(db, request)
    current = dict(inbox.settings_of(org)["events"])
    current[event_key] = payload.model_dump()
    inbox.save_settings(org, "events", current)
    db.add(AuditLog(organization_id=org.id, user_id=current_user.id, action="whatsapp_otomatik_bildirim",
                    details={"event": event_key, "channel": payload.channel, "template": payload.template_name}))
    await db.commit()
    return {"key": event_key, **events.event_config(org, event_key)}


@router.post("/events/{event_key}/suggested-template")
async def create_suggested(event_key: str, request: Request, db: AsyncSession = Depends(get_db),
                           current_user: User = Depends(settings_manager)):
    """Submit the ready-made template of an event to Meta and point the event at it (WhatsApp first)."""
    suggestion = events.SUGGESTED.get(event_key)
    if not suggestion:
        raise HTTPException(status_code=404, detail="Bu olay için hazır şablon yok")
    org = await _org(db, request)
    creds = await _creds(db, org.id)
    examples = ["Ayşe Yılmaz", "250,00", "Su Kuyusu", "BG-2026-000123", "https://ornek.org/bagisci"]
    try:
        created = await wa.create_template(creds, {**suggestion, "language": creds.get("default_language") or "tr",
                                                   "examples": examples})
    except wa.WhatsAppError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    current = dict(inbox.settings_of(org)["events"])
    current[event_key] = {"channel": "whatsapp", "template_name": created["name"],
                          "language": creds.get("default_language") or "tr", "params": suggestion["params"]}
    inbox.save_settings(org, "events", current)
    db.add(AuditLog(organization_id=org.id, user_id=current_user.id, action="whatsapp_sablon_olustur",
                    details={"name": created["name"], "event": event_key}))
    await db.commit()
    return {**created, "event": {"key": event_key, **events.event_config(org, event_key)}}


# --- inbox, consent and auto-reply settings ------------------------------------------------------

@router.get("/settings")
async def get_settings(request: Request, db: AsyncSession = Depends(get_db), _: User = Depends(reader)):
    conf = inbox.settings_of(await _org(db, request))
    conf.pop("events", None)
    return conf


class ConsentSettings(BaseModel):
    require_opt_in_for_bulk: bool = True
    checkout_checkbox: bool = False
    opt_out_keywords: list[str] = Field(default_factory=list, max_length=20)
    opt_in_keywords: list[str] = Field(default_factory=list, max_length=20)
    opt_out_reply: str = Field(default="", max_length=1000)
    opt_in_reply: str = Field(default="", max_length=1000)


class Welcome(BaseModel):
    enabled: bool = False
    text: str = Field(default="", max_length=1024)
    buttons: list[Annotated[str, Field(max_length=20)]] = Field(default_factory=list, max_length=3)


class Away(BaseModel):
    enabled: bool = False
    text: str = Field(default="", max_length=1024)
    start: str = Field(default="09:00", pattern=r"^\d{2}:\d{2}$")
    end: str = Field(default="18:00", pattern=r"^\d{2}:\d{2}$")
    days: list[Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]] = Field(default_factory=list)


class Rule(BaseModel):
    keywords: list[str] = Field(default_factory=list, max_length=20)
    text: str = Field(max_length=1024)
    buttons: list[Annotated[str, Field(max_length=20)]] = Field(default_factory=list, max_length=3)
    url: Optional[str] = Field(default=None, max_length=2000, pattern=r"^https?://")
    url_label: Optional[str] = Field(default=None, max_length=20)


class AutoReply(BaseModel):
    welcome: Welcome = Field(default_factory=Welcome)
    away: Away = Field(default_factory=Away)
    rules: list[Rule] = Field(default_factory=list, max_length=50)


class SettingsIn(BaseModel):
    notify_staff: Optional[bool] = None
    display_phone: Optional[str] = Field(default=None, max_length=30)
    consent: Optional[ConsentSettings] = None
    auto_reply: Optional[AutoReply] = None


@router.put("/settings")
async def save_settings(payload: SettingsIn, request: Request, db: AsyncSession = Depends(get_db),
                        current_user: User = Depends(settings_manager)):
    org = await _org(db, request)
    if payload.notify_staff is not None:
        inbox.save_settings(org, "notify_staff", payload.notify_staff)
    if payload.display_phone is not None:
        inbox.save_settings(org, "display_phone", wa.normalize_phone(payload.display_phone))
    if payload.consent is not None:
        data = payload.consent.model_dump()
        for key in ("opt_out_keywords", "opt_in_keywords"):
            data[key] = [k.strip() for k in data[key] if k.strip()]
        inbox.save_settings(org, "consent", data)
    if payload.auto_reply is not None:
        inbox.save_settings(org, "auto_reply", payload.auto_reply.model_dump())
    db.add(AuditLog(organization_id=org.id, user_id=current_user.id, action="whatsapp_ayarlari",
                    details={"sections": sorted(k for k, v in payload.model_dump().items() if v is not None)}))
    await db.commit()
    conf = inbox.settings_of(org)
    conf.pop("events", None)
    return conf


class ConsentIn(BaseModel):
    donor_id: UUID
    opt_in: bool


@router.put("/consent")
async def set_consent(payload: ConsentIn, request: Request, db: AsyncSession = Depends(get_db),
                      current_user: User = Depends(sender)):
    org_id = _org_id(request)
    donor = await db.get(Donor, payload.donor_id)
    if not donor or donor.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Bağışçı bulunamadı")
    await inbox.set_consent(db, org_id, phone=donor.phone, donor=donor, opt_in=payload.opt_in, source="staff")
    db.add(AuditLog(organization_id=org_id, user_id=current_user.id, action="whatsapp_izin",
                    details={"donor_id": str(donor.id), "opt_in": payload.opt_in}))
    await db.commit()
    return _consent(donor)


def _consent(donor: Donor) -> dict:
    return {"donor_id": str(donor.id), "opt_in": bool(donor.whatsapp_opt_in_at) and not donor.whatsapp_opt_out,
            "opt_out": bool(donor.whatsapp_opt_out), "opt_in_at": _iso(donor.whatsapp_opt_in_at),
            "source": donor.whatsapp_consent_source}


@router.get("/consent/stats")
async def consent_stats(request: Request, db: AsyncSession = Depends(get_db), _: User = Depends(reader)):
    org_id = _org_id(request)
    opt_in = (await db.execute(select(func.count()).select_from(Donor).where(
        Donor.organization_id == org_id, Donor.whatsapp_opt_in_at.is_not(None),
        Donor.whatsapp_opt_out.is_(False)))).scalar_one()
    opt_out = (await db.execute(select(func.count()).select_from(Donor).where(
        Donor.organization_id == org_id, Donor.whatsapp_opt_out.is_(True)))).scalar_one()
    return {"opt_in": opt_in, "opt_out": opt_out}


# --- sending -----------------------------------------------------------------------------------

class MessageContent(BaseModel):
    kind: Literal["template", "text", "interactive"] = "template"
    template_name: Optional[str] = Field(default=None, max_length=120)
    language: Optional[str] = Field(default=None, max_length=10)
    params: list[str] = Field(default_factory=list, max_length=10)
    text: Optional[str] = Field(default=None, max_length=4096)
    interactive: Optional[dict] = None

    @model_validator(mode="after")
    def _check(self):
        if self.kind == "template" and not (self.template_name or "").strip():
            raise ValueError("Şablon seçin")
        if self.kind == "text" and not (self.text or "").strip():
            raise ValueError("Mesaj metni boş olamaz")
        if self.kind == "interactive":
            error = wa.validate_interactive(self.interactive or {})
            if error:
                raise ValueError(error)
        return self


class SendIn(MessageContent):
    donor_id: Optional[UUID] = None
    phone: Optional[str] = Field(default=None, max_length=30)


async def _send_now(db: AsyncSession, org_id: UUID, creds: dict, *, phone: str, donor: Optional[Donor],
                    content: MessageContent, user: User, source: str, conversation=None,
                    reply_to: Optional[str] = None) -> WhatsAppMessage:
    from app.services.sms_service import build_context

    context = await build_context(db, org_id, donor=donor)
    params = wa.render_params(content.params, context)
    text = wa.render_params([content.text], context)[0] if content.text else None
    interactive = None
    if content.kind == "interactive":
        interactive = dict(content.interactive or {})
        interactive["body"] = wa.render_params([interactive.get("body") or ""], context)[0]
    msg = WhatsAppMessage(
        organization_id=org_id, donor_id=donor.id if donor else (conversation.donor_id if conversation else None),
        conversation_id=conversation.id if conversation else None, phone=phone, kind=content.kind,
        template_name=content.template_name if content.kind == "template" else None,
        language=content.language or creds.get("default_language") or "tr", params=params,
        body=text if content.kind == "text" else ((interactive or {}).get("body") or " | ".join(params) or None),
        interactive=interactive, created_by=user.id, source=source, reply_to=reply_to,
    )
    db.add(msg)
    await db.flush()
    await wa.send_queued(db, msg, creds)
    return msg


@router.post("/send")
async def send_one(payload: SendIn, request: Request, db: AsyncSession = Depends(get_db),
                   current_user: User = Depends(sender)):
    org_id = _org_id(request)
    creds = await _ready_creds(db, org_id)
    donor = None
    if payload.donor_id:
        donor = await db.get(Donor, payload.donor_id)
        if not donor or donor.organization_id != org_id:
            raise HTTPException(status_code=404, detail="Bağışçı bulunamadı")
    phone = (payload.phone or (donor.phone if donor else "") or "").strip()
    if len(wa.normalize_phone(phone)) < 10:
        raise HTTPException(status_code=400, detail="Geçerli bir telefon numarası gerekli")
    if await inbox.opted_out(db, org_id, phone, donor):
        raise HTTPException(status_code=400, detail="Bu kişi WhatsApp mesajı almak istemiyor (DUR yazmış)")
    msg = await _send_now(db, org_id, creds, phone=phone, donor=donor, content=payload, user=current_user,
                          source="manual")
    await db.commit()
    if msg.status == "failed":
        raise HTTPException(status_code=400, detail=msg.error or "Mesaj gönderilemedi")
    return _row(msg, donor)


class BulkIn(MessageContent):
    audience: Audience
    dry_run: bool = False

    @model_validator(mode="after")
    def _template_only(self):
        if self.kind != "template":
            raise ValueError("Toplu gönderimde yalnızca onaylı şablon kullanılabilir")
        return self


async def _whatsapp_filter(db: AsyncSession, org, recipients: list, stats: dict) -> list:
    """Drop numbers that wrote DUR and, when the organisation asks for it, donors without WhatsApp opt-in."""
    require = inbox.settings_of(org)["consent"].get("require_opt_in_for_bulk", True)
    donor_ids = [r.donor_id for r in recipients if r.donor_id]
    consent: dict = {}
    for chunk in range(0, len(donor_ids), 5000):
        rows = (await db.execute(select(Donor.id, Donor.whatsapp_opt_in_at, Donor.whatsapp_opt_out).where(
            Donor.id.in_(donor_ids[chunk:chunk + 5000])))).all()
        consent.update({d: (opt_in, opt_out) for d, opt_in, opt_out in rows})
    stopped = set((await db.execute(select(WhatsAppConversation.phone).where(
        WhatsAppConversation.organization_id == org.id, WhatsAppConversation.opted_out.is_(True)))).scalars())
    kept = []
    stats["no_whatsapp_consent"] = 0
    for r in recipients:
        opt_in, opt_out = consent.get(r.donor_id, (None, False))
        if opt_out or wa.normalize_phone(r.phone) in stopped or (require and not opt_in):
            stats["no_whatsapp_consent"] += 1
            continue
        kept.append(r)
    return kept


@router.post("/bulk")
async def send_bulk(payload: BulkIn, request: Request, db: AsyncSession = Depends(get_db),
                    current_user: User = Depends(sender)):
    from app.services.sms_service import build_context

    org = await _org(db, request)
    org_id = org.id
    creds = await _ready_creds(db, org_id)
    recipients, stats = await resolve(db, org_id, payload.audience)
    recipients = await _whatsapp_filter(db, org, recipients, stats)
    if len(recipients) > MAX_BULK:
        raise HTTPException(status_code=400, detail=f"Bir seferde en fazla {MAX_BULK} kişiye gönderilebilir")
    label = await audience_label(db, org_id, payload.audience)
    if payload.dry_run:
        return {"recipients": len(recipients), "stats": stats, "audience": label,
                "require_opt_in": inbox.settings_of(org)["consent"].get("require_opt_in_for_bulk", True),
                "sample": [{"phone": r.phone, "name": r.name} for r in recipients[:5]]}
    if not recipients:
        raise HTTPException(status_code=400, detail="Bu kitlede gönderilebilecek numara yok")
    batch_id = uuid.uuid4()
    base_context = await build_context(db, org_id)
    language = payload.language or creds.get("default_language") or "tr"
    for r in recipients:
        context = {**base_context, "ad": r.first_name, "ad_soyad": r.name}
        params = wa.render_params(payload.params, context)
        db.add(WhatsAppMessage(organization_id=org_id, donor_id=r.donor_id, phone=r.phone, kind="template",
                               template_name=payload.template_name, language=language, params=params,
                               body=" | ".join(params) or None, batch_id=batch_id, created_by=current_user.id,
                               source="bulk"))
    db.add(AuditLog(organization_id=org_id, user_id=current_user.id, action="whatsapp_toplu_gonderim",
                    details={"batch_id": str(batch_id), "count": len(recipients), "audience": label,
                             "template": payload.template_name}))
    await db.commit()
    wa.kick_dispatch()
    return {"batch_id": str(batch_id), "queued": len(recipients), "stats": stats, "audience": label}


@router.post("/batches/{batch_id}/cancel")
async def cancel_batch(batch_id: UUID, request: Request, db: AsyncSession = Depends(get_db),
                       _: User = Depends(sender)):
    count = await wa.cancel_batch(db, _org_id(request), batch_id)
    await db.commit()
    return {"cancelled": count}


# --- log ---------------------------------------------------------------------------------------

@router.get("/messages")
async def messages(request: Request, status: Optional[str] = None, days: Optional[int] = Query(default=None, ge=1, le=365),
                   donor_id: Optional[UUID] = None, direction: Optional[Literal["in", "out"]] = "out",
                   batch_id: Optional[UUID] = None, q: Optional[str] = Query(default=None, max_length=60),
                   page: int = Query(default=1, ge=1), page_size: int = Query(default=50, ge=1, le=200),
                   db: AsyncSession = Depends(get_db), _: User = Depends(reader)):
    org_id = _org_id(request)
    query = select(WhatsAppMessage, Donor).outerjoin(Donor, Donor.id == WhatsAppMessage.donor_id).where(
        WhatsAppMessage.organization_id == org_id)
    if direction and not donor_id:
        query = query.where(WhatsAppMessage.direction == direction)
    if status:
        query = query.where(WhatsAppMessage.status.in_([s for s in status.split(",") if s]))
    if days:
        query = query.where(WhatsAppMessage.created_at >= datetime.now(timezone.utc) - timedelta(days=days))
    if donor_id:
        query = query.where(WhatsAppMessage.donor_id == donor_id)
    if batch_id:
        query = query.where(WhatsAppMessage.batch_id == batch_id)
    if q:
        like = f"%{q.strip()}%"
        query = query.where(WhatsAppMessage.phone.ilike(like) | Donor.first_name.ilike(like)
                            | Donor.last_name.ilike(like) | WhatsAppMessage.template_name.ilike(like))
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    rows = (await db.execute(query.order_by(WhatsAppMessage.created_at.desc())
                             .offset((page - 1) * page_size).limit(page_size))).all()
    return {"total": total, "items": [_row(m, d) for m, d in rows]}


@router.get("/stats")
async def stats(request: Request, days: int = Query(default=30, ge=1, le=365), db: AsyncSession = Depends(get_db),
                _: User = Depends(reader)):
    org_id = _org_id(request)
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (await db.execute(select(WhatsAppMessage.status, func.count()).where(
        WhatsAppMessage.organization_id == org_id, WhatsAppMessage.created_at >= since,
        WhatsAppMessage.direction == "out",
    ).group_by(WhatsAppMessage.status))).all()
    counts = {s: 0 for s in ("queued", "sent", "delivered", "read", "failed")}
    counts.update({s: n for s, n in rows})
    received = (await db.execute(select(func.count()).select_from(WhatsAppMessage).where(
        WhatsAppMessage.organization_id == org_id, WhatsAppMessage.created_at >= since,
        WhatsAppMessage.direction == "in"))).scalar_one()
    unread = (await db.execute(select(func.count()).select_from(WhatsAppConversation).where(
        WhatsAppConversation.organization_id == org_id, WhatsAppConversation.unread_count > 0,
        WhatsAppConversation.status == "open"))).scalar_one()
    return {"days": days, "counts": counts, "total": sum(counts.values()), "received": received,
            "unread_conversations": unread}


# --- inbox -------------------------------------------------------------------------------------

def _conv_row(c: WhatsAppConversation, donor: Optional[Donor] = None, agent: Optional[User] = None) -> dict:
    now = datetime.now(timezone.utc)
    return {
        "id": str(c.id), "phone": c.phone, "contact_name": c.contact_name,
        "donor_id": str(c.donor_id) if c.donor_id else None, "donor_name": donor.full_name if donor else None,
        "status": c.status, "unread_count": c.unread_count or 0, "last_preview": c.last_preview,
        "last_message_at": _iso(c.last_message_at), "last_inbound_at": _iso(c.last_inbound_at),
        "window_open": wa.window_open(c.last_inbound_at, now),
        "window_closes_at": _iso(c.last_inbound_at + wa.WINDOW) if c.last_inbound_at else None,
        "assigned_to": str(c.assigned_to) if c.assigned_to else None,
        "assigned_name": agent.full_name if agent else None, "opted_out": bool(c.opted_out),
        "source_ref": c.source_ref,
    }


async def _conversation(db: AsyncSession, org_id: UUID, conversation_id: UUID) -> WhatsAppConversation:
    conv = await db.get(WhatsAppConversation, conversation_id)
    if not conv or conv.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Konuşma bulunamadı")
    return conv


@router.get("/conversations")
async def conversations(request: Request, status: Optional[Literal["open", "closed"]] = "open",
                        mine: bool = False, unread: bool = False, q: Optional[str] = Query(default=None, max_length=60),
                        page: int = Query(default=1, ge=1), page_size: int = Query(default=40, ge=1, le=100),
                        db: AsyncSession = Depends(get_db), current_user: User = Depends(reader)):
    org_id = _org_id(request)
    query = (select(WhatsAppConversation, Donor).outerjoin(Donor, Donor.id == WhatsAppConversation.donor_id)
             .where(WhatsAppConversation.organization_id == org_id,
                    WhatsAppConversation.last_message_at.is_not(None)))
    if status:
        query = query.where(WhatsAppConversation.status == status)
    if mine:
        query = query.where(WhatsAppConversation.assigned_to == current_user.id)
    if unread:
        query = query.where(WhatsAppConversation.unread_count > 0)
    if q:
        like = f"%{q.strip()}%"
        query = query.where(or_(WhatsAppConversation.phone.ilike(like), WhatsAppConversation.contact_name.ilike(like),
                                Donor.first_name.ilike(like), Donor.last_name.ilike(like)))
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    rows = (await db.execute(query.order_by(WhatsAppConversation.last_message_at.desc().nulls_last())
                             .offset((page - 1) * page_size).limit(page_size))).all()
    agents = {u.id: u for u in (await db.execute(select(User).where(
        User.id.in_({c.assigned_to for c, _ in rows if c.assigned_to})))).scalars()} if rows else {}
    return {"total": total, "items": [_conv_row(c, d, agents.get(c.assigned_to)) for c, d in rows]}


@router.get("/conversations/{conversation_id}")
async def conversation_detail(conversation_id: UUID, request: Request, before: Optional[datetime] = None,
                              db: AsyncSession = Depends(get_db), _: User = Depends(reader)):
    org_id = _org_id(request)
    conv = await _conversation(db, org_id, conversation_id)
    donor = await db.get(Donor, conv.donor_id) if conv.donor_id else None
    agent = await db.get(User, conv.assigned_to) if conv.assigned_to else None
    query = select(WhatsAppMessage).where(
        WhatsAppMessage.organization_id == org_id,
        or_(WhatsAppMessage.conversation_id == conv.id, WhatsAppMessage.phone.in_(
            [conv.phone, "+" + conv.phone, "0" + conv.phone[2:]] if conv.phone.startswith("90") else [conv.phone])),
    )
    if before:
        query = query.where(WhatsAppMessage.created_at < before)
    rows = list((await db.execute(query.order_by(WhatsAppMessage.created_at.desc()).limit(80))).scalars())
    rows.reverse()
    out = _conv_row(conv, donor, agent)
    out["messages"] = [_row(m) for m in rows]
    out["consent"] = _consent(donor) if donor else None
    out["donor"] = ({"id": str(donor.id), "name": donor.full_name, "phone": donor.phone, "email": donor.email,
                     "total_donated_cents": donor.total_donated_cents or 0, "total_donations": donor.total_donations or 0,
                     "last_donation_at": _iso(donor.last_donation_at)} if donor else None)
    return out


@router.post("/conversations/{conversation_id}/read")
async def mark_conversation_read(conversation_id: UUID, request: Request, db: AsyncSession = Depends(get_db),
                                 _: User = Depends(reader)):
    org_id = _org_id(request)
    conv = await _conversation(db, org_id, conversation_id)
    had_unread = (conv.unread_count or 0) > 0
    conv.unread_count = 0
    last_in = (await db.execute(select(WhatsAppMessage.provider_ref).where(
        WhatsAppMessage.conversation_id == conv.id, WhatsAppMessage.direction == "in",
    ).order_by(WhatsAppMessage.created_at.desc()).limit(1))).scalar_one_or_none()
    await db.commit()
    if had_unread and last_in:
        try:
            await wa.mark_read(await _creds(db, org_id), last_in)  # blue ticks on the donor's phone
        except HTTPException:
            pass
    return {"ok": True}


class ConversationUpdate(BaseModel):
    status: Optional[Literal["open", "closed"]] = None
    assigned_to: Optional[UUID] = None
    unassign: bool = False
    donor_id: Optional[UUID] = None


@router.patch("/conversations/{conversation_id}")
async def update_conversation(conversation_id: UUID, payload: ConversationUpdate, request: Request,
                              db: AsyncSession = Depends(get_db), _: User = Depends(sender)):
    org_id = _org_id(request)
    conv = await _conversation(db, org_id, conversation_id)
    if payload.status:
        conv.status = payload.status
    if payload.unassign:
        conv.assigned_to = None
    elif payload.assigned_to:
        agent = await db.get(User, payload.assigned_to)
        if not agent or agent.organization_id != org_id or not agent.is_active:
            raise HTTPException(status_code=404, detail="Personel bulunamadı")
        conv.assigned_to = agent.id
    if payload.donor_id:
        donor = await db.get(Donor, payload.donor_id)
        if not donor or donor.organization_id != org_id:
            raise HTTPException(status_code=404, detail="Bağışçı bulunamadı")
        conv.donor_id = donor.id
        for m in (await db.execute(select(WhatsAppMessage).where(
                WhatsAppMessage.conversation_id == conv.id, WhatsAppMessage.donor_id.is_(None)))).scalars():
            m.donor_id = donor.id
    await db.commit()
    donor = await db.get(Donor, conv.donor_id) if conv.donor_id else None
    agent = await db.get(User, conv.assigned_to) if conv.assigned_to else None
    return _conv_row(conv, donor, agent)


class StartIn(BaseModel):
    donor_id: Optional[UUID] = None
    phone: Optional[str] = Field(default=None, max_length=30)


@router.post("/conversations")
async def start_conversation(payload: StartIn, request: Request, db: AsyncSession = Depends(get_db),
                             _: User = Depends(sender)):
    """Open (or find) the thread with a donor, e.g. from the donor card."""
    org_id = _org_id(request)
    donor = None
    if payload.donor_id:
        donor = await db.get(Donor, payload.donor_id)
        if not donor or donor.organization_id != org_id:
            raise HTTPException(status_code=404, detail="Bağışçı bulunamadı")
    phone = payload.phone or (donor.phone if donor else None) or ""
    conv = await inbox.conversation_for(db, org_id, phone, donor_id=donor.id if donor else None)
    if not conv:
        raise HTTPException(status_code=400, detail="Geçerli bir telefon numarası gerekli")
    await db.commit()
    return _conv_row(conv, donor)


class ReplyIn(MessageContent):
    reply_to: Optional[str] = Field(default=None, max_length=128)


@router.post("/conversations/{conversation_id}/reply")
async def reply(conversation_id: UUID, payload: ReplyIn, request: Request, db: AsyncSession = Depends(get_db),
                current_user: User = Depends(sender)):
    org_id = _org_id(request)
    conv = await _conversation(db, org_id, conversation_id)
    creds = await _ready_creds(db, org_id)
    if conv.opted_out:
        raise HTTPException(status_code=400, detail="Bu kişi WhatsApp mesajı almak istemiyor (DUR yazmış)")
    if payload.kind != "template" and not wa.window_open(conv.last_inbound_at):
        raise HTTPException(status_code=400, detail="24 saatlik pencere kapalı: yalnızca onaylı şablon gönderebilirsiniz")
    donor = await db.get(Donor, conv.donor_id) if conv.donor_id else None
    msg = await _send_now(db, org_id, creds, phone=conv.phone, donor=donor, content=payload, user=current_user,
                          source="reply", conversation=conv, reply_to=payload.reply_to)
    if not conv.assigned_to:
        conv.assigned_to = current_user.id
    conv.unread_count = 0
    await db.commit()
    if msg.status == "failed":
        raise HTTPException(status_code=400, detail=msg.error or "Mesaj gönderilemedi")
    return _row(msg)


@router.post("/conversations/{conversation_id}/media")
async def reply_media(conversation_id: UUID, request: Request, file: UploadFile = File(...),
                      caption: str = Form(default="", max_length=1024), db: AsyncSession = Depends(get_db),
                      current_user: User = Depends(sender)):
    org_id = _org_id(request)
    conv = await _conversation(db, org_id, conversation_id)
    creds = await _ready_creds(db, org_id)
    if conv.opted_out:
        raise HTTPException(status_code=400, detail="Bu kişi WhatsApp mesajı almak istemiyor (DUR yazmış)")
    if not wa.window_open(conv.last_inbound_at):
        raise HTTPException(status_code=400, detail="24 saatlik pencere kapalı: dosya gönderilemez")
    mime = (file.content_type or "").split(";")[0].strip().lower()
    kind = wa.UPLOAD_TYPES.get(mime)
    if not kind:
        raise HTTPException(status_code=400, detail="Bu dosya türü WhatsApp'ta gönderilemez (JPG, PNG, PDF, Office, MP3, MP4)")
    content = await file.read(wa.MAX_UPLOAD_BYTES + 1)
    if len(content) > wa.MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Dosya en fazla 8 MB olabilir")
    filename = re.sub(r"[^\w.\- ]", "_", file.filename or "dosya")[:120]
    try:
        media_id = await wa.upload_media(creds, content, mime, filename)
    except wa.WhatsAppError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    msg = WhatsAppMessage(organization_id=org_id, donor_id=conv.donor_id, conversation_id=conv.id, phone=conv.phone,
                          kind=kind, body=caption.strip() or None, created_by=current_user.id, source="reply",
                          media={"id": media_id, "mime_type": mime, "filename": filename})
    db.add(msg)
    await db.flush()
    await wa.send_queued(db, msg, creds)
    if not conv.assigned_to:
        conv.assigned_to = current_user.id
    await db.commit()
    if msg.status == "failed":
        raise HTTPException(status_code=400, detail=msg.error or "Dosya gönderilemedi")
    return _row(msg)


@router.get("/media/{message_id}")
async def media(message_id: UUID, request: Request, db: AsyncSession = Depends(get_db), _: User = Depends(reader)):
    """Incoming photo / document / voice note, fetched from Meta with the organisation's token."""
    org_id = _org_id(request)
    msg = await db.get(WhatsAppMessage, message_id)
    if not msg or msg.organization_id != org_id or not (msg.media or {}).get("id"):
        raise HTTPException(status_code=404, detail="Dosya bulunamadı")
    try:
        content, mime = await wa.download_media(await _ready_creds(db, org_id), msg.media["id"])
    except wa.WhatsAppError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    filename = re.sub(r'[^\w.\- ]', "_", msg.media.get("filename") or f"whatsapp-{msg.kind}")
    return Response(content=content, media_type=mime, headers={
        "Content-Disposition": f'inline; filename="{filename}"', "Cache-Control": "private, max-age=3600"})


@router.get("/agents")
async def agents(request: Request, db: AsyncSession = Depends(get_db), _: User = Depends(reader)):
    rows = (await db.execute(select(User).where(
        User.organization_id == _org_id(request), User.is_active.is_(True), User.role != UserRole.PLATFORM_ADMIN,
    ).order_by(User.first_name))).scalars().all()
    return [{"id": str(u.id), "name": u.full_name or u.email} for u in rows]


# --- links and QR codes ------------------------------------------------------------------------

def qr_svg(text: str, size: int = 320) -> str:
    from reportlab.graphics import renderSVG
    from reportlab.graphics.barcode.qr import QrCodeWidget
    from reportlab.graphics.shapes import Drawing

    widget = QrCodeWidget(text, barLevel="M")
    x0, y0, x1, y1 = widget.getBounds()
    drawing = Drawing(size, size, transform=[size / (x1 - x0), 0, 0, size / (y1 - y0), 0, 0])
    drawing.add(widget)
    return renderSVG.drawToString(drawing)


async def _link(db: AsyncSession, org: Organization, campaign_id: Optional[UUID], text: Optional[str]) -> dict:
    phone = inbox.settings_of(org).get("display_phone")
    if not phone:
        raise HTTPException(status_code=400, detail="Kurumun WhatsApp numarası bilinmiyor: Hesap Ayarları'ndan "
                                                    "bağlantıyı kontrol edin veya numarayı elle yazın")
    message = (text or "").strip()
    code = None
    if campaign_id:
        campaign = await db.get(Campaign, campaign_id)
        if not campaign or campaign.organization_id != org.id:
            raise HTTPException(status_code=404, detail="Bağış kalemi bulunamadı")
        code = (campaign.slug or str(campaign.id)[:8]).upper()[:40]
        message = message or f"Merhaba, «{campaign.title}» hakkında bilgi almak ve bağış yapmak istiyorum."
        message = f"{message} (Kod: {code})"
    from urllib.parse import quote
    url = f"https://wa.me/{phone}" + (f"?text={quote(message)}" if message else "")
    return {"url": url, "phone": phone, "text": message, "code": code}


@router.get("/link")
async def link(request: Request, campaign_id: Optional[UUID] = None, text: Optional[str] = Query(default=None, max_length=500),
               db: AsyncSession = Depends(get_db), _: User = Depends(reader)):
    return await _link(db, await _org(db, request), campaign_id, text)


@router.get("/qr")
async def qr(request: Request, campaign_id: Optional[UUID] = None, text: Optional[str] = Query(default=None, max_length=500),
             db: AsyncSession = Depends(get_db), _: User = Depends(reader)):
    data = await _link(db, await _org(db, request), campaign_id, text)
    return Response(content=qr_svg(data["url"]), media_type="image/svg+xml",
                    headers={"Content-Disposition": 'inline; filename="whatsapp-qr.svg"'})


# --- calls -------------------------------------------------------------------------------------

def _call_row(c: WhatsAppCall, donor: Optional[Donor] = None, *, with_sdp: bool = False) -> dict:
    out = {
        "id": str(c.id), "call_id": c.call_id, "direction": c.direction, "phone": c.phone, "status": c.status,
        "donor_id": str(c.donor_id) if c.donor_id else None, "donor_name": donor.full_name if donor else None,
        "conversation_id": str(c.conversation_id) if c.conversation_id else None,
        "started_at": _iso(c.started_at), "connected_at": _iso(c.connected_at), "ended_at": _iso(c.ended_at),
        "duration_seconds": c.duration_seconds, "error": c.error,
        "answered_by": str(c.answered_by) if c.answered_by else None,
    }
    if with_sdp:
        out.update(sdp_offer=c.sdp_offer, sdp_answer=c.sdp_answer)
    return out


@router.get("/calls/settings")
async def get_call_settings(request: Request, db: AsyncSession = Depends(get_db), _: User = Depends(reader)):
    try:
        return await calls.get_settings(await _ready_creds(db, _org_id(request)))
    except wa.WhatsAppError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class CallHours(BaseModel):
    day: Literal["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]
    open: str = Field(pattern=r"^\d{2}:\d{2}$")
    close: str = Field(pattern=r"^\d{2}:\d{2}$")


class SipIn(BaseModel):
    enabled: bool = False
    hostname: str = Field(default="", max_length=255)
    port: str = Field(default="5061", pattern=r"^\d{1,5}$")


class CallSettingsIn(BaseModel):
    enabled: bool
    show_call_icon: bool = True
    callback_permission: bool = True
    hours_enabled: bool = False
    timezone: str = Field(default="Europe/Istanbul", max_length=60)
    hours: list[CallHours] = Field(default_factory=list, max_length=14)
    sip: SipIn = Field(default_factory=SipIn)


@router.put("/calls/settings")
async def save_call_settings(payload: CallSettingsIn, request: Request, db: AsyncSession = Depends(get_db),
                             current_user: User = Depends(settings_manager)):
    org_id = _org_id(request)
    creds = await _ready_creds(db, org_id)
    try:
        await calls.save_settings(creds, payload.model_dump())
        current = await calls.get_settings(creds)
    except wa.WhatsAppError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.add(AuditLog(organization_id=org_id, user_id=current_user.id, action="whatsapp_arama_ayarlari",
                    details={"enabled": payload.enabled, "sip": payload.sip.enabled}))
    await db.commit()
    return current


@router.get("/calls")
async def call_log(request: Request, page: int = Query(default=1, ge=1), db: AsyncSession = Depends(get_db),
                   _: User = Depends(reader)):
    org_id = _org_id(request)
    query = select(WhatsAppCall, Donor).outerjoin(Donor, Donor.id == WhatsAppCall.donor_id).where(
        WhatsAppCall.organization_id == org_id)
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    rows = (await db.execute(query.order_by(WhatsAppCall.started_at.desc()).offset((page - 1) * 50).limit(50))).all()
    return {"total": total, "items": [_call_row(c, d) for c, d in rows]}


@router.get("/calls/live")
async def live_calls(request: Request, db: AsyncSession = Depends(get_db), _: User = Depends(sender)):
    """Ringing calls (with the SDP offer the browser answers) and calls still going on."""
    org_id = _org_id(request)
    since = datetime.now(timezone.utc) - timedelta(minutes=90)
    rows = (await db.execute(select(WhatsAppCall, Donor).outerjoin(Donor, Donor.id == WhatsAppCall.donor_id).where(
        WhatsAppCall.organization_id == org_id, WhatsAppCall.started_at >= since,
        WhatsAppCall.status.in_(["ringing", "accepted", "connected"]),
    ).order_by(WhatsAppCall.started_at.desc()).limit(10))).all()
    stale = datetime.now(timezone.utc) - timedelta(seconds=75)
    return [_call_row(c, d, with_sdp=True) for c, d in rows if c.status != "ringing" or c.started_at >= stale]


async def _call(db: AsyncSession, org_id: UUID, call_id: UUID) -> WhatsAppCall:
    call = await db.get(WhatsAppCall, call_id)
    if not call or call.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Arama bulunamadı")
    return call


@router.get("/calls/{call_id}")
async def call_detail(call_id: UUID, request: Request, db: AsyncSession = Depends(get_db), _: User = Depends(sender)):
    call = await _call(db, _org_id(request), call_id)
    donor = await db.get(Donor, call.donor_id) if call.donor_id else None
    return _call_row(call, donor, with_sdp=True)


class AnswerIn(BaseModel):
    sdp: str = Field(min_length=20, max_length=20_000)


@router.post("/calls/{call_id}/accept")
async def accept_call(call_id: UUID, payload: AnswerIn, request: Request, db: AsyncSession = Depends(get_db),
                      current_user: User = Depends(sender)):
    org_id = _org_id(request)
    call = await _call(db, org_id, call_id)
    if call.status != "ringing" or call.direction != "USER_INITIATED":
        raise HTTPException(status_code=409, detail="Bu arama artık cevaplanamaz")
    creds = await _ready_creds(db, org_id)
    try:
        await calls.call_action(creds, call.call_id, "pre_accept", payload.sdp)
        await calls.call_action(creds, call.call_id, "accept", payload.sdp)
    except wa.WhatsAppError as exc:
        call.error = str(exc)
        await db.commit()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    call.status, call.sdp_answer, call.answered_by = "connected", payload.sdp, current_user.id
    call.connected_at = datetime.now(timezone.utc)
    await db.commit()
    return _call_row(call)


@router.post("/calls/{call_id}/{action}")
async def end_call(call_id: UUID, action: Literal["reject", "terminate"], request: Request,
                   db: AsyncSession = Depends(get_db), _: User = Depends(sender)):
    org_id = _org_id(request)
    call = await _call(db, org_id, call_id)
    if call.status in ("ended", "missed", "rejected", "failed"):
        return _call_row(call)
    try:
        await calls.call_action(await _ready_creds(db, org_id), call.call_id, action)
    except wa.WhatsAppError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    call.status = "rejected" if action == "reject" else "ended"
    call.ended_at = datetime.now(timezone.utc)
    if call.connected_at and not call.duration_seconds:
        call.duration_seconds = int((call.ended_at - call.connected_at).total_seconds())
    await db.commit()
    return _call_row(call)


class StartCallIn(BaseModel):
    sdp: str = Field(min_length=20, max_length=20_000)


@router.post("/conversations/{conversation_id}/call")
async def start_call(conversation_id: UUID, payload: StartCallIn, request: Request,
                     db: AsyncSession = Depends(get_db), current_user: User = Depends(sender)):
    """Call the donor from the browser (they must have given call permission)."""
    org_id = _org_id(request)
    conv = await _conversation(db, org_id, conversation_id)
    creds = await _ready_creds(db, org_id)
    try:
        call_id = await calls.start_call(creds, conv.phone, payload.sdp)
    except wa.WhatsAppError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    call = WhatsAppCall(organization_id=org_id, call_id=call_id, direction="BUSINESS_INITIATED", phone=conv.phone,
                        donor_id=conv.donor_id, conversation_id=conv.id, status="ringing",
                        answered_by=current_user.id)
    db.add(call)
    await db.commit()
    return _call_row(call)


@router.get("/conversations/{conversation_id}/call-permission")
async def get_call_permission(conversation_id: UUID, request: Request, db: AsyncSession = Depends(get_db),
                              _: User = Depends(sender)):
    org_id = _org_id(request)
    conv = await _conversation(db, org_id, conversation_id)
    try:
        return {"status": await calls.call_permission(await _ready_creds(db, org_id), conv.phone)}
    except wa.WhatsAppError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/conversations/{conversation_id}/call-permission")
async def request_call_permission(conversation_id: UUID, request: Request, db: AsyncSession = Depends(get_db),
                                  current_user: User = Depends(sender)):
    org_id = _org_id(request)
    conv = await _conversation(db, org_id, conversation_id)
    if not wa.window_open(conv.last_inbound_at):
        raise HTTPException(status_code=400, detail="Arama izni yalnızca 24 saatlik pencere açıkken istenebilir")
    creds = await _ready_creds(db, org_id)
    content = MessageContent(kind="interactive", interactive={
        "type": "call_permission_request", "body": "Sizi WhatsApp üzerinden arayabilmemiz için izin verir misiniz?"})
    donor = await db.get(Donor, conv.donor_id) if conv.donor_id else None
    msg = await _send_now(db, org_id, creds, phone=conv.phone, donor=donor, content=content, user=current_user,
                          source="reply", conversation=conv)
    await db.commit()
    if msg.status == "failed":
        raise HTTPException(status_code=400, detail=msg.error or "İzin isteği gönderilemedi")
    return _row(msg)


# --- Meta webhook ------------------------------------------------------------------------------

@hooks_router.get("/whatsapp/{token}")
async def whatsapp_verify(token: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Meta's subscription check: echo hub.challenge when hub.verify_token is ours."""
    found = await resolve_hook(db, wa.PROVIDER, token)
    params = request.query_params
    if not found or params.get("hub.mode") != "subscribe" or params.get("hub.verify_token") != found[1].get(HOOK_SECRET):
        raise HTTPException(status_code=403, detail="Doğrulama başarısız")
    return Response(content=params.get("hub.challenge") or "", media_type="text/plain")


async def _template_updates(db: AsyncSession, org_id: UUID, body: dict) -> None:
    from app.services.staff_notify import notify_system_alert

    for entry in body.get("entry") or []:
        for change in entry.get("changes") or []:
            if change.get("field") != "message_template_status_update":
                continue
            value = change.get("value") or {}
            state = value.get("event")
            if state not in ("APPROVED", "REJECTED", "DISABLED", "PAUSED"):
                continue
            label = {"APPROVED": "onaylandı", "REJECTED": "reddedildi", "DISABLED": "devre dışı bırakıldı",
                     "PAUSED": "duraklatıldı"}[state]
            reason = value.get("reason")
            await notify_system_alert(
                db, org_id, f"WhatsApp şablonu {label}",
                f"{value.get('message_template_name')} ({value.get('message_template_language')})"
                + (f": {reason}" if reason and reason != "NONE" else ""),
                data={"url": "/admin/whatsapp?tab=templates"},
            )


@hooks_router.post("/whatsapp/{token}")
async def whatsapp_events(token: str, request: Request, db: AsyncSession = Depends(get_db)):
    found = await resolve_hook(db, wa.PROVIDER, token)
    if not found:
        raise HTTPException(status_code=404, detail="Bilinmeyen webhook")
    org_id, creds = found
    raw = await request.body()
    if not wa.verify_signature(creds.get("app_secret"), raw, request.headers.get("x-hub-signature-256")):
        raise HTTPException(status_code=401, detail="İmza doğrulanamadı")
    try:
        body = json.loads(raw or b"{}")
    except ValueError:
        raise HTTPException(status_code=400, detail="JSON bekleniyor") from None
    if not isinstance(body, dict):
        body = {}
    await wa.apply_statuses(db, org_id, body)
    await inbox.apply_incoming(db, org_id, body, creds)
    ringing = await calls.apply_call_events(db, org_id, body)
    await db.commit()
    if ringing:
        await calls.notify_ringing(db, org_id, ringing)
        await db.commit()
    try:
        await _template_updates(db, org_id, body)
        await db.commit()
    except Exception:  # noqa: BLE001 - Meta must still get its 200
        await db.rollback()
    return {"ok": True}

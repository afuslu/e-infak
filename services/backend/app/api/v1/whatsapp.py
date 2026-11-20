"""WhatsApp Business: account, templates, single and bulk sends, message log and Meta's webhook."""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_feature, require_module
from app.core.db import get_db
from app.core.plans import Feature
from app.models.audit_log import AuditLog
from app.models.channels import WhatsAppMessage
from app.models.donation import Donor
from app.models.user import User
from app.services import whatsapp as wa
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


async def _creds(db: AsyncSession, org_id: UUID) -> dict:
    try:
        return await get_credentials(db, org_id, wa.PROVIDER) or {}
    except CredentialsUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _account(org_id: UUID, creds: dict) -> dict:
    return {
        "configured": wa.configured(creds),
        "values": masked(wa.PROVIDER, creds),
        "webhook_url": hook_url("whatsapp", org_id, creds.get(HOOK_SECRET)),
        "verify_token": creds.get(HOOK_SECRET),
        "can_list_templates": bool(creds.get("business_account_id")),
    }


def _row(m: WhatsAppMessage, donor: Optional[Donor] = None) -> dict:
    return {
        "id": str(m.id), "phone": m.phone, "donor_id": str(m.donor_id) if m.donor_id else None,
        "donor_name": donor.full_name if donor else None, "kind": m.kind, "template_name": m.template_name,
        "params": m.params or [], "body": m.body, "status": m.status, "error": m.error,
        "batch_id": str(m.batch_id) if m.batch_id else None,
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "sent_at": m.sent_at.isoformat() if m.sent_at else None,
        "delivered_at": m.delivered_at.isoformat() if m.delivered_at else None,
        "read_at": m.read_at.isoformat() if m.read_at else None,
    }


# --- account -----------------------------------------------------------------------------------

@router.get("/account")
async def get_account(request: Request, db: AsyncSession = Depends(get_db), _: User = Depends(reader)):
    org_id = _org_id(request)
    return _account(org_id, await _creds(db, org_id))


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


@router.get("/templates")
async def templates(request: Request, db: AsyncSession = Depends(get_db), _: User = Depends(reader)):
    creds = await _creds(db, _org_id(request))
    try:
        items = await wa.list_templates(creds)
    except wa.WhatsAppError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return [t for t in items if t["status"] == "APPROVED"]


# --- sending -----------------------------------------------------------------------------------

class MessageContent(BaseModel):
    kind: Literal["template", "text"] = "template"
    template_name: Optional[str] = Field(default=None, max_length=120)
    language: Optional[str] = Field(default=None, max_length=10)
    params: list[str] = Field(default_factory=list, max_length=10)
    text: Optional[str] = Field(default=None, max_length=4096)

    @model_validator(mode="after")
    def _check(self):
        if self.kind == "template" and not (self.template_name or "").strip():
            raise ValueError("Şablon seçin")
        if self.kind == "text" and not (self.text or "").strip():
            raise ValueError("Mesaj metni boş olamaz")
        return self


class SendIn(MessageContent):
    donor_id: Optional[UUID] = None
    phone: Optional[str] = Field(default=None, max_length=30)


@router.post("/send")
async def send_one(payload: SendIn, request: Request, db: AsyncSession = Depends(get_db),
                   current_user: User = Depends(sender)):
    from app.services.sms_service import build_context

    org_id = _org_id(request)
    creds = await _creds(db, org_id)
    if not wa.configured(creds):
        raise HTTPException(status_code=400, detail="Önce WhatsApp hesabını tanımlayın")
    donor = None
    if payload.donor_id:
        donor = await db.get(Donor, payload.donor_id)
        if not donor or donor.organization_id != org_id:
            raise HTTPException(status_code=404, detail="Bağışçı bulunamadı")
    phone = (payload.phone or (donor.phone if donor else "") or "").strip()
    if len(wa.normalize_phone(phone)) < 10:
        raise HTTPException(status_code=400, detail="Geçerli bir telefon numarası gerekli")
    context = await build_context(db, org_id, donor=donor)
    params = wa.render_params(payload.params, context)
    msg = WhatsAppMessage(
        organization_id=org_id, donor_id=donor.id if donor else None, phone=phone, kind=payload.kind,
        template_name=payload.template_name if payload.kind == "template" else None,
        language=payload.language or creds.get("default_language") or "tr", params=params,
        body=payload.text if payload.kind == "text" else " | ".join(params) or None, created_by=current_user.id,
    )
    db.add(msg)
    await db.flush()
    await wa.send_queued(db, msg, creds)
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


@router.post("/bulk")
async def send_bulk(payload: BulkIn, request: Request, db: AsyncSession = Depends(get_db),
                    current_user: User = Depends(sender)):
    from app.services.sms_service import build_context

    org_id = _org_id(request)
    creds = await _creds(db, org_id)
    if not wa.configured(creds):
        raise HTTPException(status_code=400, detail="Önce WhatsApp hesabını tanımlayın")
    recipients, stats = await resolve(db, org_id, payload.audience)
    if len(recipients) > MAX_BULK:
        raise HTTPException(status_code=400, detail=f"Bir seferde en fazla {MAX_BULK} kişiye gönderilebilir")
    label = await audience_label(db, org_id, payload.audience)
    if payload.dry_run:
        return {"recipients": len(recipients), "stats": stats, "audience": label,
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
                               body=" | ".join(params) or None, batch_id=batch_id, created_by=current_user.id))
    db.add(AuditLog(organization_id=org_id, user_id=current_user.id, action="whatsapp_toplu_gonderim",
                    details={"batch_id": str(batch_id), "count": len(recipients), "audience": label,
                             "template": payload.template_name}))
    await db.commit()
    _kick_dispatch()
    return {"batch_id": str(batch_id), "queued": len(recipients), "stats": stats, "audience": label}


def _kick_dispatch() -> None:
    try:
        from app.tasks import dispatch_whatsapp_task
        dispatch_whatsapp_task.delay()
    except Exception:  # noqa: BLE001 - the beat task picks the queue up within a minute anyway
        pass


@router.post("/batches/{batch_id}/cancel")
async def cancel_batch(batch_id: UUID, request: Request, db: AsyncSession = Depends(get_db),
                       _: User = Depends(sender)):
    count = await wa.cancel_batch(db, _org_id(request), batch_id)
    await db.commit()
    return {"cancelled": count}


# --- log ---------------------------------------------------------------------------------------

@router.get("/messages")
async def messages(request: Request, status: Optional[str] = None, donor_id: Optional[UUID] = None,
                   batch_id: Optional[UUID] = None, q: Optional[str] = Query(default=None, max_length=60),
                   page: int = Query(default=1, ge=1), page_size: int = Query(default=50, ge=1, le=200),
                   db: AsyncSession = Depends(get_db), _: User = Depends(reader)):
    org_id = _org_id(request)
    query = select(WhatsAppMessage, Donor).outerjoin(Donor, Donor.id == WhatsAppMessage.donor_id).where(
        WhatsAppMessage.organization_id == org_id)
    if status:
        query = query.where(WhatsAppMessage.status == status)
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
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (await db.execute(select(WhatsAppMessage.status, func.count()).where(
        WhatsAppMessage.organization_id == _org_id(request), WhatsAppMessage.created_at >= since,
    ).group_by(WhatsAppMessage.status))).all()
    counts = {s: 0 for s in ("queued", "sent", "delivered", "read", "failed")}
    counts.update({s: n for s, n in rows})
    return {"days": days, "counts": counts, "total": sum(counts.values())}


# --- Meta webhook ------------------------------------------------------------------------------

@hooks_router.get("/whatsapp/{token}")
async def whatsapp_verify(token: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Meta's subscription check: echo hub.challenge when hub.verify_token is ours."""
    found = await resolve_hook(db, wa.PROVIDER, token)
    params = request.query_params
    if not found or params.get("hub.mode") != "subscribe" or params.get("hub.verify_token") != found[1].get(HOOK_SECRET):
        raise HTTPException(status_code=403, detail="Doğrulama başarısız")
    return Response(content=params.get("hub.challenge") or "", media_type="text/plain")


@hooks_router.post("/whatsapp/{token}")
async def whatsapp_events(token: str, request: Request, db: AsyncSession = Depends(get_db)):
    found = await resolve_hook(db, wa.PROVIDER, token)
    if not found:
        raise HTTPException(status_code=404, detail="Bilinmeyen webhook")
    try:
        body = await request.json()
    except ValueError:
        raise HTTPException(status_code=400, detail="JSON bekleniyor") from None
    await wa.apply_statuses(db, found[0], body if isinstance(body, dict) else {})
    await db.commit()
    return {"ok": True}

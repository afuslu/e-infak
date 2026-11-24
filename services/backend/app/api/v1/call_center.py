"""Call center (NetGSM Netsantral): account, staff extensions, click-to-call, live pop-up, call log, webhook."""
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, require_feature, require_module
from app.core.db import get_db
from app.core.plans import Feature
from app.models.audit_log import AuditLog
from app.models.channels import CallLog
from app.models.donation import Donation, DonationStatus, Donor
from app.models.user import User
from app.services import netsantral as ns
from app.services.integrations import HOOK_SECRET, ensure_hook_secret, find_donor_by_phone, hook_url, resolve_hook
from app.services.tenant_credentials import CredentialsUnavailable, get_credentials, masked, save_credentials

router = APIRouter(prefix="/admin-features/call-center", tags=["call-center"],
                   dependencies=[Depends(require_feature(Feature.CALL_CENTER))])
hooks_router = APIRouter(prefix="/hooks", tags=["hooks"])
staff = require_module("donors", "sms", write=False)
caller = require_module("donors", "sms")
settings_manager = require_module("settings")
STATUS_LABELS = {"ringing": "Çalıyor", "answered": "Görüşmede", "missed": "Cevapsız", "busy": "Meşgul",
                 "failed": "Başarısız", "ended": "Tamamlandı"}


def _org_id(request: Request) -> UUID:
    return UUID(str(request.state.organization_id))


async def _creds(db: AsyncSession, org_id: UUID) -> dict:
    try:
        return await get_credentials(db, org_id, ns.PROVIDER) or {}
    except CredentialsUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _account(org_id: UUID, creds: dict, user: User) -> dict:
    return {"configured": ns.configured(creds), "values": masked(ns.PROVIDER, creds),
            "webhook_url": hook_url("netsantral", org_id, creds.get(HOOK_SECRET)),
            "my_extension": user.phone_extension}


async def _donor_summary(db: AsyncSession, donor: Optional[Donor]) -> Optional[dict]:
    if not donor:
        return None
    total, count, last = (await db.execute(select(
        func.coalesce(func.sum(Donation.amount_cents), 0), func.count(Donation.id), func.max(Donation.paid_at),
    ).where(Donation.donor_id == donor.id, Donation.status == DonationStatus.CONFIRMED))).one()
    return {"id": str(donor.id), "name": donor.full_name, "city": donor.city, "tags": donor.tags or [],
            "total_cents": int(total or 0), "donation_count": int(count or 0),
            "last_donation_at": last.isoformat() if last else None}


def _row(c: CallLog, donor: Optional[Donor] = None, user: Optional[User] = None) -> dict:
    return {
        "id": str(c.id), "unique_id": c.unique_id, "direction": c.direction, "phone": c.customer_phone,
        "extension": c.extension, "status": c.status, "status_label": STATUS_LABELS.get(c.status, c.status),
        "talk_seconds": c.talk_seconds, "recording_url": c.recording_url, "note": c.note,
        "donor_id": str(c.donor_id) if c.donor_id else None, "donor_name": donor.full_name if donor else None,
        "started_by": f"{user.first_name} {user.last_name}".strip() if user else None,
        "started_at": c.started_at.isoformat() if c.started_at else None,
        "answered_at": c.answered_at.isoformat() if c.answered_at else None,
        "ended_at": c.ended_at.isoformat() if c.ended_at else None,
    }


# --- account and extensions --------------------------------------------------------------------

@router.get("/account")
async def get_account(request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(staff)):
    org_id = _org_id(request)
    return _account(org_id, await _creds(db, org_id), user)


class AccountIn(BaseModel):
    values: dict[str, str] = Field(default_factory=dict)


@router.put("/account")
async def save_account(payload: AccountIn, request: Request, db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(settings_manager)):
    org_id = _org_id(request)
    previous = await _creds(db, org_id)
    try:
        await save_credentials(db, org_id, ns.PROVIDER, {**payload.values, HOOK_SECRET: previous.get(HOOK_SECRET) or ""},
                               actor=current_user.email)
        creds = await ensure_hook_secret(db, org_id, ns.PROVIDER, actor=current_user.email)
    except CredentialsUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    db.add(AuditLog(organization_id=org_id, user_id=current_user.id, action="santral_hesabi_guncelle",
                    details={"fields": sorted(k for k in creds if k != HOOK_SECRET)}))
    await db.commit()
    return _account(org_id, creds, current_user)


class ExtensionIn(BaseModel):
    extension: Optional[str] = Field(default=None, max_length=10, pattern=r"^\d{0,10}$")


@router.put("/my-extension")
async def set_my_extension(payload: ExtensionIn, db: AsyncSession = Depends(get_db),
                           current_user: User = Depends(staff)):
    user = await db.get(User, current_user.id)
    user.phone_extension = (payload.extension or "").strip() or None
    await db.commit()
    return {"my_extension": user.phone_extension}


@router.get("/extensions")
async def extensions(request: Request, db: AsyncSession = Depends(get_db), _: User = Depends(settings_manager)):
    users = (await db.execute(select(User).where(User.organization_id == _org_id(request), User.is_active.is_(True))
                              .order_by(User.first_name))).scalars().all()
    return [{"id": str(u.id), "name": f"{u.first_name} {u.last_name}".strip(), "email": u.email,
             "extension": u.phone_extension} for u in users]


class UserExtensionIn(ExtensionIn):
    user_id: UUID


@router.put("/extensions")
async def set_extension(payload: UserExtensionIn, request: Request, db: AsyncSession = Depends(get_db),
                        _: User = Depends(settings_manager)):
    user = await db.get(User, payload.user_id)
    if not user or user.organization_id != _org_id(request):
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    user.phone_extension = (payload.extension or "").strip() or None
    await db.commit()
    return {"id": str(user.id), "extension": user.phone_extension}


# --- calls -------------------------------------------------------------------------------------

class CallIn(BaseModel):
    donor_id: Optional[UUID] = None
    phone: Optional[str] = Field(default=None, max_length=30)


@router.post("/call")
async def click_to_call(payload: CallIn, request: Request, db: AsyncSession = Depends(get_db),
                        current_user: User = Depends(caller)):
    org_id = _org_id(request)
    creds = await _creds(db, org_id)
    donor = None
    if payload.donor_id:
        donor = await db.get(Donor, payload.donor_id)
        if not donor or donor.organization_id != org_id:
            raise HTTPException(status_code=404, detail="Bağışçı bulunamadı")
    phone = (payload.phone or (donor.phone if donor else "") or "").strip()
    crm_id = uuid4().hex[:16]
    try:
        answer = await ns.originate(creds, phone, current_user.phone_extension or "", crm_id)
    except ns.NetsantralError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    unique_id = str(answer.get("unique_id") or f"crm-{crm_id}")
    call = (await db.execute(select(CallLog).where(
        CallLog.organization_id == org_id, CallLog.provider == ns.PROVIDER, CallLog.unique_id == unique_id,
    ))).scalar_one_or_none()
    if call is None:
        call = CallLog(organization_id=org_id, provider=ns.PROVIDER, unique_id=unique_id, direction="out",
                       customer_phone=phone[:20], extension=current_user.phone_extension)
        db.add(call)
    call.started_by = current_user.id
    if donor:
        call.donor_id = donor.id
    elif not call.donor_id:
        found = await find_donor_by_phone(db, org_id, phone)
        call.donor_id = found.id if found else None
    await db.commit()
    return {"ok": True, "message": "Önce dahiliniz çalacak, açınca bağışçı aranacak", "call": _row(call, donor)}


@router.get("/live")
async def live_calls(request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(staff)):
    """Calls ringing or in progress for the pop-up: the user's own extension first, all ringing calls otherwise."""
    org_id = _org_id(request)
    since = datetime.now(timezone.utc) - timedelta(minutes=3)
    query = select(CallLog, Donor).outerjoin(Donor, Donor.id == CallLog.donor_id).where(
        CallLog.organization_id == org_id, CallLog.direction == "in", CallLog.status.in_(("ringing", "answered")),
        CallLog.updated_at >= since,
    )
    if user.phone_extension:
        query = query.where(or_(CallLog.extension == user.phone_extension, CallLog.extension.is_(None)))
    rows = (await db.execute(query.order_by(CallLog.started_at.desc()).limit(5))).all()
    out = []
    for call, donor in rows:
        out.append({**_row(call, donor), "donor": await _donor_summary(db, donor)})
    return out


@router.get("/calls")
async def calls(request: Request, direction: Optional[str] = None, status: Optional[str] = None,
                days: Optional[int] = Query(default=None, ge=1, le=365),
                donor_id: Optional[UUID] = None, q: Optional[str] = Query(default=None, max_length=60),
                page: int = Query(default=1, ge=1), page_size: int = Query(default=50, ge=1, le=200),
                db: AsyncSession = Depends(get_db), _: User = Depends(staff)):
    org_id = _org_id(request)
    query = (select(CallLog, Donor, User).outerjoin(Donor, Donor.id == CallLog.donor_id)
             .outerjoin(User, User.id == CallLog.started_by).where(CallLog.organization_id == org_id))
    if direction in ("in", "out"):
        query = query.where(CallLog.direction == direction)
    if status:
        query = query.where(CallLog.status.in_([s for s in status.split(",") if s]))
    if days:
        query = query.where(CallLog.started_at >= datetime.now(timezone.utc) - timedelta(days=days))
    if donor_id:
        query = query.where(CallLog.donor_id == donor_id)
    if q:
        like = f"%{q.strip()}%"
        query = query.where(CallLog.customer_phone.ilike(like) | Donor.first_name.ilike(like)
                            | Donor.last_name.ilike(like) | CallLog.extension.ilike(like))
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    rows = (await db.execute(query.order_by(CallLog.started_at.desc())
                             .offset((page - 1) * page_size).limit(page_size))).all()
    return {"total": total, "items": [_row(c, d, u) for c, d, u in rows]}


@router.get("/stats")
async def stats(request: Request, days: int = Query(default=30, ge=1, le=365), db: AsyncSession = Depends(get_db),
                _: User = Depends(staff)):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (await db.execute(select(CallLog.direction, CallLog.status, func.count(),
                                    func.coalesce(func.sum(CallLog.talk_seconds), 0)).where(
        CallLog.organization_id == _org_id(request), CallLog.started_at >= since,
    ).group_by(CallLog.direction, CallLog.status))).all()
    out = {"incoming": 0, "outgoing": 0, "missed": 0, "talk_seconds": 0}
    for direction, status, count, talk in rows:
        out["incoming" if direction == "in" else "outgoing"] += count
        out["missed"] += count if status in ("missed", "busy") and direction == "in" else 0
        out["talk_seconds"] += int(talk or 0)
    return {"days": days, **out}


@router.get("/smart-queue")
async def smart_call_queue(
    request: Request,
    focus: str = Query(default="all", pattern="^(all|missed_callback|monthly|churn_risk|seasonal|high_value)$"),
    cooldown_days: int = Query(default=7, ge=0, le=90),
    limit: int = Query(default=30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(staff),
):
    """'Bugün Kimi Arayalım?' — bağış alışkanlıklarına göre önceliklendirilmiş günlük arama listesi."""
    from app.services.smart_call_queue import build_smart_call_queue

    return await build_smart_call_queue(
        db,
        _org_id(request),
        focus=focus,
        cooldown_days=cooldown_days,
        limit=limit,
    )


class NoteIn(BaseModel):
    note: Optional[str] = Field(default=None, max_length=2000)
    donor_id: Optional[UUID] = None


@router.patch("/calls/{call_id}")
async def update_call(call_id: UUID, payload: NoteIn, request: Request, db: AsyncSession = Depends(get_db),
                      _: User = Depends(caller)):
    org_id = _org_id(request)
    call = await db.get(CallLog, call_id)
    if not call or call.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Çağrı bulunamadı")
    if "note" in payload.model_fields_set:
        call.note = (payload.note or "").strip() or None
    if payload.donor_id:
        donor = await db.get(Donor, payload.donor_id)
        if not donor or donor.organization_id != org_id:
            raise HTTPException(status_code=404, detail="Bağışçı bulunamadı")
        call.donor_id = donor.id
    await db.commit()
    donor = await db.get(Donor, call.donor_id) if call.donor_id else None
    return _row(call, donor)


# --- Netsantral webhook ------------------------------------------------------------------------

@hooks_router.post("/netsantral/{token}")
async def netsantral_events(token: str, request: Request, db: AsyncSession = Depends(get_db)):
    found = await resolve_hook(db, ns.PROVIDER, token)
    if not found:
        raise HTTPException(status_code=404, detail="Bilinmeyen webhook")
    try:
        body = await request.json()
    except ValueError:
        form = await request.form()
        body = dict(form)
    events = body if isinstance(body, list) else [body]
    for event in events:
        if isinstance(event, dict):
            await ns.apply_event(db, found[0], event)
    await db.commit()
    return {"ok": True}

"""Operator SMS donations: settings (keywords → campaigns), webhook, file import, records and manual booking."""
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import require_feature, require_module
from app.core.db import get_db
from app.core.plans import Feature
from app.models.audit_log import AuditLog
from app.models.campaign import Campaign
from app.models.channels import SmsDonationRecord
from app.models.donation import Donor
from app.models.organization import Organization
from app.models.user import User
from app.services import sms_donations as svc
from app.services.integrations import HOOK_SECRET, ensure_hook_secret, hook_url, resolve_hook
from app.services.tenant_credentials import CredentialsUnavailable, get_credentials

router = APIRouter(prefix="/admin-features/sms-donations", tags=["sms-donations"],
                   dependencies=[Depends(require_feature(Feature.SMS_DONATION))])
hooks_router = APIRouter(prefix="/hooks", tags=["hooks"])
public_router = APIRouter(prefix="/public", tags=["public"])
reader = require_module("receipts", "bank", "reports", write=False)
writer = require_module("receipts", "bank")
settings_manager = require_module("settings")
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_WEBHOOK_RECORDS = 500


def _org_id(request: Request) -> UUID:
    return UUID(str(request.state.organization_id))


async def _org(request: Request, db: AsyncSession) -> Organization:
    return await db.get(Organization, _org_id(request))


def _row(r: SmsDonationRecord, campaign: Optional[Campaign] = None, donor: Optional[Donor] = None) -> dict:
    return {
        "id": str(r.id), "ref": r.external_ref, "source": r.source, "phone": r.phone,
        "amount_cents": r.amount_cents, "keyword": r.keyword, "operator": r.operator,
        "received_at": r.received_at.isoformat() if r.received_at else None, "status": r.status, "error": r.error,
        "campaign_id": str(r.campaign_id) if r.campaign_id else None, "campaign_title": campaign.title if campaign else None,
        "donor_id": str(r.donor_id) if r.donor_id else None, "donor_name": donor.full_name if donor else None,
        "donation_id": str(r.donation_id) if r.donation_id else None,
    }


# --- settings ----------------------------------------------------------------------------------

@router.get("/settings")
async def get_settings(request: Request, db: AsyncSession = Depends(get_db), _: User = Depends(reader)):
    org = await _org(request, db)
    try:
        creds = await get_credentials(db, org.id, svc.PROVIDER) or {}
    except CredentialsUnavailable:
        creds = {}
    return {**svc.settings_of(org), "webhook_url": hook_url("sms-donation", org.id, creds.get(HOOK_SECRET))}


class SettingsIn(BaseModel):
    short_code: str = Field(default="", max_length=20)
    public_note: str = Field(default="", max_length=300)
    keywords: dict[str, UUID] = Field(default_factory=dict, max_length=200)
    default_campaign_id: Optional[UUID] = None
    default_amount: Optional[float] = Field(default=None, ge=0, le=100_000)
    create_donors: bool = True
    send_receipt: bool = False


@router.put("/settings")
async def save_settings(payload: SettingsIn, request: Request, db: AsyncSession = Depends(get_db),
                        current_user: User = Depends(settings_manager)):
    org = await _org(request, db)
    campaign_ids = {*payload.keywords.values(), *([payload.default_campaign_id] if payload.default_campaign_id else [])}
    if campaign_ids:
        found = set((await db.execute(select(Campaign.id).where(
            Campaign.organization_id == org.id, Campaign.id.in_(campaign_ids)))).scalars().all())
        if found != campaign_ids:
            raise HTTPException(status_code=400, detail="Seçilen bağış kalemlerinden biri bulunamadı")
    keywords = {}
    for key, cid in payload.keywords.items():
        word = (key or "").strip().split()[0].upper()[:60] if (key or "").strip() else ""
        if word:
            keywords[word] = str(cid)
    org.settings = {**(org.settings or {}), "sms_donation": {
        "short_code": payload.short_code.strip(),
        "public_note": payload.public_note.strip(),
        "keywords": keywords,
        "default_campaign_id": str(payload.default_campaign_id) if payload.default_campaign_id else None,
        "default_amount": payload.default_amount, "create_donors": payload.create_donors,
        "send_receipt": payload.send_receipt,
    }}
    flag_modified(org, "settings")
    try:
        creds = await ensure_hook_secret(db, org.id, svc.PROVIDER, actor=current_user.email)
    except CredentialsUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    db.add(AuditLog(organization_id=org.id, user_id=current_user.id, action="sms_bagis_ayarlari",
                    details={"keywords": sorted(keywords)}))
    await db.commit()
    return {**svc.settings_of(org), "webhook_url": hook_url("sms-donation", org.id, creds.get(HOOK_SECRET))}


# --- import ------------------------------------------------------------------------------------

@router.post("/import")
async def import_file(request: Request, file: UploadFile = File(...), dry_run: bool = Form(default=False),
                      db: AsyncSession = Depends(get_db), current_user: User = Depends(writer)):
    from app.api.v1.data_tools import _cell, _read_table

    content = await file.read(MAX_FILE_BYTES + 1)
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="Dosya 10 MB'tan büyük olamaz")
    headers, rows, _, _ = _read_table(content, file.filename or "")
    org = await _org(request, db)
    cfg = svc.settings_of(org)
    summary = {"rows": len(rows), "created": 0, "recorded": 0, "unmatched": 0, "duplicates": 0, "errors": []}
    preview = []
    for index, values in enumerate(rows, start=2):
        data = {h: (v if not isinstance(v, str) else _cell(v)) for h, v in zip(headers, values)}
        if dry_run:
            try:
                item = svc.normalize(data, cfg["default_amount"])
            except svc.SmsDonationError as exc:
                summary["errors"].append({"row": index, "error": str(exc)})
                continue
            if len(preview) < 20:
                preview.append({**item, "received_at": item["received_at"].isoformat()})
            continue
        try:
            async with db.begin_nested():
                rec, created = await svc.record(db, org, data, source="file")
        except svc.SmsDonationError as exc:
            summary["errors"].append({"row": index, "error": str(exc)})
            continue
        if not created:
            summary["duplicates"] += 1
            continue
        summary["created"] += 1
        summary["recorded" if rec.status == "recorded" else "unmatched"] += 1
    summary["errors"] = summary["errors"][:50]
    if dry_run:
        return {**summary, "headers": headers, "preview": preview}
    db.add(AuditLog(organization_id=org.id, user_id=current_user.id, action="sms_bagis_dosya_aktarimi",
                    details={"file": file.filename, **{k: v for k, v in summary.items() if k != "errors"}}))
    await db.commit()
    return summary


# --- records -----------------------------------------------------------------------------------

@router.get("/records")
async def records(request: Request, status: Optional[str] = None, days: Optional[int] = Query(default=None, ge=1, le=730),
                  q: Optional[str] = Query(default=None, max_length=60),
                  page: int = Query(default=1, ge=1), page_size: int = Query(default=50, ge=1, le=200),
                  db: AsyncSession = Depends(get_db), _: User = Depends(reader)):
    org_id = _org_id(request)
    query = (select(SmsDonationRecord, Campaign, Donor)
             .outerjoin(Campaign, Campaign.id == SmsDonationRecord.campaign_id)
             .outerjoin(Donor, Donor.id == SmsDonationRecord.donor_id)
             .where(SmsDonationRecord.organization_id == org_id))
    if status:
        query = query.where(SmsDonationRecord.status == status)
    if days:
        query = query.where(SmsDonationRecord.received_at >= datetime.now(timezone.utc) - timedelta(days=days))
    if q:
        like = f"%{q.strip()}%"
        query = query.where(SmsDonationRecord.phone.ilike(like) | SmsDonationRecord.keyword.ilike(like)
                            | SmsDonationRecord.external_ref.ilike(like))
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    rows = (await db.execute(query.order_by(SmsDonationRecord.received_at.desc())
                             .offset((page - 1) * page_size).limit(page_size))).all()
    return {"total": total, "items": [_row(r, c, d) for r, c, d in rows]}


@router.get("/stats")
async def stats(request: Request, days: int = Query(default=30, ge=1, le=730), db: AsyncSession = Depends(get_db),
                _: User = Depends(reader)):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (await db.execute(select(SmsDonationRecord.status, func.count(),
                                    func.coalesce(func.sum(SmsDonationRecord.amount_cents), 0)).where(
        SmsDonationRecord.organization_id == _org_id(request), SmsDonationRecord.received_at >= since,
    ).group_by(SmsDonationRecord.status))).all()
    by_keyword = (await db.execute(select(SmsDonationRecord.keyword, func.count(),
                                          func.coalesce(func.sum(SmsDonationRecord.amount_cents), 0)).where(
        SmsDonationRecord.organization_id == _org_id(request), SmsDonationRecord.received_at >= since,
        SmsDonationRecord.status == "recorded",
    ).group_by(SmsDonationRecord.keyword).order_by(func.count().desc()).limit(20))).all()
    out = {"days": days, "count": 0, "total_cents": 0, "unmatched": 0}
    for status, count, total in rows:
        if status == "recorded":
            out["count"] += count
            out["total_cents"] += int(total or 0)
        elif status == "unmatched":
            out["unmatched"] += count
    out["keywords"] = [{"keyword": k or "—", "count": n, "total_cents": int(t or 0)} for k, n, t in by_keyword]
    return out


class AssignIn(BaseModel):
    campaign_id: Optional[UUID] = None
    donor_id: Optional[UUID] = None


@router.post("/records/{record_id}/assign")
async def assign(record_id: UUID, payload: AssignIn, request: Request, db: AsyncSession = Depends(get_db),
                 current_user: User = Depends(writer)):
    org = await _org(request, db)
    rec = await db.get(SmsDonationRecord, record_id)
    if not rec or rec.organization_id != org.id:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    try:
        await svc.assign(db, org, rec, payload.campaign_id, payload.donor_id)
    except svc.SmsDonationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.add(AuditLog(organization_id=org.id, user_id=current_user.id, action="sms_bagis_elle_kayit",
                    details={"record": str(rec.id), "donation": str(rec.donation_id)}))
    await db.commit()
    campaign = await db.get(Campaign, rec.campaign_id) if rec.campaign_id else None
    donor = await db.get(Donor, rec.donor_id) if rec.donor_id else None
    return _row(rec, campaign, donor)


@router.post("/records/{record_id}/ignore")
async def ignore(record_id: UUID, request: Request, db: AsyncSession = Depends(get_db), _: User = Depends(writer)):
    rec = await db.get(SmsDonationRecord, record_id)
    if not rec or rec.organization_id != _org_id(request):
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    if rec.donation_id:
        raise HTTPException(status_code=400, detail="Bağışı kaydedilmiş satır yok sayılamaz")
    rec.status = "ignored"
    await db.commit()
    return _row(rec)


# --- provider webhook --------------------------------------------------------------------------

@hooks_router.post("/sms-donation/{token}")
async def sms_donation_hook(token: str, request: Request, db: AsyncSession = Depends(get_db)):
    """JSON object, JSON list, {"records": [...]} or a form post; each record is booked once."""
    found = await resolve_hook(db, svc.PROVIDER, token)
    if not found:
        raise HTTPException(status_code=404, detail="Bilinmeyen webhook")
    org = await db.get(Organization, found[0])
    if not org or not org.is_active:
        raise HTTPException(status_code=404, detail="Bilinmeyen webhook")
    try:
        body = await request.json()
    except ValueError:
        body = dict(await request.form())
    items = body.get("records") if isinstance(body, dict) and isinstance(body.get("records"), list) else body
    items = items if isinstance(items, list) else [items]
    if len(items) > MAX_WEBHOOK_RECORDS:
        raise HTTPException(status_code=413, detail=f"Bir istekte en fazla {MAX_WEBHOOK_RECORDS} kayıt")
    results = []
    for item in items:
        if not isinstance(item, dict):
            results.append({"ok": False, "error": "Kayıt bir nesne olmalı"})
            continue
        try:
            async with db.begin_nested():
                rec, created = await svc.record(db, org, item, source="webhook")
            results.append({"ok": True, "ref": rec.external_ref, "status": rec.status, "duplicate": not created})
        except svc.SmsDonationError as exc:
            results.append({"ok": False, "error": str(exc)})
    await db.commit()
    return {"ok": all(r["ok"] for r in results), "results": results}


# --- public website integration ----------------------------------------------------------------

@public_router.get("/sms-donations")
async def public_sms_donations(request: Request, db: AsyncSession = Depends(get_db)):
    """Short code and keyword->campaign instructions for the public website."""
    org = await _org(request, db)
    if not org or not org.is_active:
        return {"enabled": False, "short_code": "", "default_amount": None, "public_note": "", "items": []}
    cfg = svc.settings_of(org)
    short_code = cfg.get("short_code") or ""
    kw_map = cfg.get("keywords") or {}
    if not short_code and not kw_map:
        return {"enabled": False, "short_code": "", "default_amount": None, "public_note": "", "items": []}
    campaign_ids = []
    for raw_cid in kw_map.values():
        try:
            campaign_ids.append(UUID(str(raw_cid)))
        except ValueError:
            continue
    campaigns: dict[str, Campaign] = {}
    if campaign_ids:
        rows = (await db.execute(select(Campaign).where(
            Campaign.organization_id == org.id, Campaign.id.in_(campaign_ids),
        ))).scalars().all()
        campaigns = {str(c.id): c for c in rows}
    items = []
    for word, cid in sorted(kw_map.items()):
        c = campaigns.get(str(cid))
        items.append({
            "keyword": word,
            "campaign_id": str(cid),
            "campaign_title": c.title if c else None,
            "campaign_slug": c.slug if c else None,
        })
    return {
        "enabled": bool(short_code),
        "short_code": short_code,
        "default_amount": cfg.get("default_amount"),
        "public_note": cfg.get("public_note") or "",
        "items": items,
    }

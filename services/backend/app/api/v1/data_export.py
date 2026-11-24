"""Verilerim ve Ayrılma: per-dataset Excel, full backup and the organisation's own offboarding request."""
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.background import BackgroundTask

from app.api.deps import get_current_user, has_capability, require_admin_route_permission
from app.core.db import get_db
from app.core.impersonation import is_impersonating
from app.core.security import create_access_token, decode_token
from app.models.audit_log import AuditLog
from app.models.data_export import DataExport, OrganizationOffboarding
from app.models.organization import Organization
from app.models.user import User
from app.services import data_export as svc

router = APIRouter(prefix="/admin-features/data-export", tags=["data-export"],
                   dependencies=[Depends(require_admin_route_permission)])
files_router = APIRouter(prefix="/data-export-files", tags=["data-export"])

# The backup shows everything, so it needs every permission that guards a part of it.
REQUIRED = ("settings.manage", "users.manage", "donors.export", "donors.view_all", "donors.phone", "donors.notes_view",
            "receipts.export", "receipts.view_all", "finance.manage")
CHECKLIST = {
    "yedek": "Tam yedek indirildi ve açılıp kontrol edildi",
    "sms": "SMS firmasında e-İnfak için açılan API kullanıcısı kaldırıldı",
    "pos": "Sanal POS panelinde e-İnfak için açılan API kullanıcısı kaldırıldı",
    "banka": "Bankalara verilen hesap ekstresi paylaşım izni kaldırıldı",
    "alan_adi": "Alan adı (DNS) yeni adrese yönlendirildi",
    "duzenli": "Düzenli bağış talimatları için bağışçılar bilgilendirildi",
    "mobil": "Personel mobil uygulamadan çıkış yaptı",
}


async def full_access(request: Request, db: AsyncSession = Depends(get_db),
                      current_user: User = Depends(get_current_user)) -> User:
    from sqlalchemy.orm import selectinload

    user = (await db.execute(select(User).options(selectinload(User.staff_role)).where(User.id == current_user.id))).scalar_one()
    if not all(has_capability(user, key) for key in REQUIRED):
        raise HTTPException(status_code=403, detail="Tüm kurum verisine yalnız tam yetkili yöneticiler erişebilir")
    return user


def _no_simulation() -> None:
    if is_impersonating():
        raise HTTPException(status_code=403, detail="Destek oturumunda kurum verisi indirilemez ve ayrılma işlemi yapılamaz")


def _org(request: Request) -> UUID:
    return UUID(request.state.organization_id)


def _log(db: AsyncSession, org_id: UUID, user: Optional[User], action: str, **details) -> None:
    db.add(AuditLog(organization_id=org_id, user_id=user.id if user else None, action=action, details=details))


def export_out(e: DataExport) -> dict:
    expired = e.status == "ready" and e.expires_at and e.expires_at < datetime.now(timezone.utc)
    return {"id": str(e.id), "status": "expired" if expired else e.status, "include_media": e.include_media,
            "size_bytes": e.size_bytes, "sha256": e.sha256, "counts": e.counts or {}, "error": e.error,
            "created_at": e.created_at, "finished_at": e.finished_at, "expires_at": e.expires_at,
            "downloaded_at": e.downloaded_at}


def offboarding_out(o: Optional[OrganizationOffboarding]) -> Optional[dict]:
    if not o or o.status == "cancelled":
        return None
    today = datetime.now(svc.TZ).date()
    return {"status": o.status, "reason": o.reason, "requested_at": o.requested_at, "closes_on": o.closes_on,
            "days_left": (o.closes_on - today).days if o.closes_on else None, "operator_note": o.operator_note,
            "backup_confirmed_at": o.backup_confirmed_at,
            "checklist": [{"key": k, "label": v, "done": bool((o.checklist or {}).get(k))} for k, v in CHECKLIST.items()]}


async def get_offboarding(db: AsyncSession, org_id: UUID) -> Optional[OrganizationOffboarding]:
    return (await db.execute(select(OrganizationOffboarding).where(
        OrganizationOffboarding.organization_id == org_id))).scalar_one_or_none()


async def _active_offboarding(db: AsyncSession, org_id: UUID) -> OrganizationOffboarding:
    row = await get_offboarding(db, org_id)
    if not row or row.status == "cancelled":
        raise HTTPException(status_code=404, detail="Açık bir ayrılma talebi yok")
    return row


@router.get("/summary")
async def get_summary(request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(full_access)):
    org_id = _org(request)
    exports = (await db.execute(select(DataExport).where(DataExport.organization_id == org_id)
                                .order_by(DataExport.created_at.desc()).limit(10))).scalars().all()
    media = svc.media_files(org_id)
    return {"datasets": await svc.summary(db, org_id), "media_files": len(media),
            "media_bytes": sum(f.stat().st_size for f, _ in media), "exports": [export_out(e) for e in exports],
            "offboarding": offboarding_out(await get_offboarding(db, org_id)), "keep_days": svc.KEEP_DAYS}


@router.get("/datasets/{key}.xlsx")
async def download_dataset(key: str, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(full_access)):
    _no_simulation()
    if key not in svc.DATASETS:
        raise HTTPException(status_code=404, detail="Veri türü bulunamadı")
    org_id = _org(request)
    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        path = Path(tmp.name)
    try:
        counts = await svc.write_dataset(db, org_id, key, path)
        _log(db, org_id, user, "veri_disa_aktar", dataset=key, count=sum(counts.values()))
        await db.commit()
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return FileResponse(path, filename=f"{key}-{date.today().isoformat()}.xlsx",
                        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        background=BackgroundTask(path.unlink, missing_ok=True))


class BackupIn(BaseModel):
    include_media: bool = True


@router.post("/backups", status_code=201)
async def create_backup(request: Request, payload: BackupIn, db: AsyncSession = Depends(get_db),
                        user: User = Depends(full_access)):
    _no_simulation()
    org_id = _org(request)
    # Serialise requests of one organisation so two backups are never queued together.
    await db.execute(select(Organization.id).where(Organization.id == org_id).with_for_update())
    running = (await db.execute(select(DataExport.id).where(
        DataExport.organization_id == org_id, DataExport.status.in_(("queued", "running"))))).first()
    if running:
        raise HTTPException(status_code=409, detail="Hazırlanmakta olan bir yedek var")
    export = DataExport(organization_id=org_id, requested_by=user.id, include_media=payload.include_media, status="queued")
    db.add(export)
    _log(db, org_id, user, "tam_yedek_istendi", include_media=payload.include_media)
    await db.commit()
    await db.refresh(export)
    from app.tasks import build_data_export_task
    try:
        build_data_export_task.apply_async((str(export.id),), retry=False, ignore_result=True)
    except Exception as exc:
        export.status, export.error = "failed", "Yedek işçisine ulaşılamadı; biraz sonra yeniden deneyin"
        await db.commit()
        raise HTTPException(status_code=503, detail=export.error) from exc
    return export_out(export)


@router.post("/backups/{export_id}/link")
async def backup_link(export_id: UUID, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(full_access)):
    """A 10-minute link, so a large file downloads straight to disk instead of through page memory."""
    _no_simulation()
    export = (await db.execute(select(DataExport).where(
        DataExport.id == export_id, DataExport.organization_id == _org(request)))).scalar_one_or_none()
    if not export or export_out(export)["status"] != "ready" or not svc.export_path(export).is_file():
        raise HTTPException(status_code=404, detail="Yedek hazır değil ya da süresi doldu")
    token = create_access_token({"sub": str(export.id), "uid": str(user.id), "scope": "data_export"}, timedelta(minutes=10))
    return {"url": f"/api/v1/data-export-files/{token}"}


@files_router.get("/{token}")
async def backup_file(token: str, db: AsyncSession = Depends(get_db)):
    data = decode_token(token)
    if not data or data.get("scope") != "data_export":
        raise HTTPException(status_code=404, detail="Bağlantının süresi doldu")
    export = await db.get(DataExport, UUID(data["sub"]))
    if not export or export_out(export)["status"] != "ready":
        raise HTTPException(status_code=404, detail="Yedek hazır değil ya da süresi doldu")
    user = await db.get(User, UUID(data["uid"]))
    path = svc.export_path(export)
    if not user or not user.is_active or user.organization_id != export.organization_id or not path.is_file():
        raise HTTPException(status_code=404, detail="Dosya bulunamadı")
    export.downloaded_at = datetime.now(timezone.utc)
    _log(db, export.organization_id, user, "tam_yedek_disa_aktarildi", export_id=str(export.id), size=export.size_bytes)
    await db.commit()
    return FileResponse(path, filename=f"yedek-{export.created_at.astimezone(svc.TZ):%Y-%m-%d}.zip", media_type="application/zip",
                        headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})


class OffboardingIn(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=1000)


@router.post("/offboarding", status_code=201)
async def request_offboarding(request: Request, payload: OffboardingIn, db: AsyncSession = Depends(get_db),
                              user: User = Depends(full_access)):
    _no_simulation()
    org_id = _org(request)
    row = await get_offboarding(db, org_id)
    if row and row.status != "cancelled":
        raise HTTPException(status_code=409, detail="Zaten açık bir ayrılma talebi var")
    if not row:
        row = OrganizationOffboarding(organization_id=org_id)
        db.add(row)
    row.status, row.reason, row.requested_by = "requested", (payload.reason or "").strip() or None, user.id
    row.requested_at, row.closes_on, row.operator_note = datetime.now(timezone.utc), None, None
    row.checklist, row.backup_confirmed_at, row.backup_confirmed_by = {}, None, None
    _log(db, org_id, user, "ayrilma_talebi", reason=row.reason)
    await db.commit()
    return offboarding_out(row)


@router.delete("/offboarding", status_code=204)
async def cancel_offboarding(request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(full_access)):
    _no_simulation()
    row = await _active_offboarding(db, _org(request))
    row.status, row.closes_on = "cancelled", None
    _log(db, row.organization_id, user, "ayrilma_iptal")
    await db.commit()


class ChecklistIn(BaseModel):
    key: Literal["yedek", "sms", "pos", "banka", "alan_adi", "duzenli", "mobil"]
    done: bool


@router.patch("/offboarding/checklist")
async def update_checklist(request: Request, payload: ChecklistIn, db: AsyncSession = Depends(get_db),
                           user: User = Depends(full_access)):
    _no_simulation()
    row = await _active_offboarding(db, _org(request))
    row.checklist = {**(row.checklist or {}), payload.key: payload.done}
    await db.commit()
    return offboarding_out(row)


@router.post("/offboarding/confirm-backup")
async def confirm_backup(request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(full_access)):
    """The organisation states that it holds its data; only possible after a full backup was downloaded."""
    _no_simulation()
    row = await _active_offboarding(db, _org(request))
    downloaded = (await db.execute(select(DataExport.id).where(
        DataExport.organization_id == row.organization_id, DataExport.downloaded_at >= row.requested_at))).first()
    if not downloaded:
        raise HTTPException(status_code=409, detail="Önce ayrılma talebinden sonra bir tam yedek indirin")
    row.backup_confirmed_at, row.backup_confirmed_by = datetime.now(timezone.utc), user.id
    row.checklist = {**(row.checklist or {}), "yedek": True}
    _log(db, row.organization_id, user, "yedek_onaylandi")
    await db.commit()
    return offboarding_out(row)


@router.get("/notice")
async def closing_notice(request: Request, db: AsyncSession = Depends(get_db)):
    """Countdown strip of the panel: every staff member sees the closing date, nothing else."""
    data = offboarding_out(await get_offboarding(db, _org(request)))
    if not data or data["status"] != "scheduled":
        return None
    return {"closes_on": data["closes_on"], "days_left": data["days_left"]}

"""Mobil Uygulama Yapıcı API: design drafts, publishing, the public design and store applications."""
import asyncio
import hashlib
import io
import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin_route_feature, require_admin_route_permission
from app.api.v1.platform import _audit, get_platform_user
from app.api.v1.site import site_url
from app.core.db import get_db
from app.models.audit_log import AuditLog
from app.models.media import MediaAsset
from app.models.mobile_app import MobileApp, MobileAppRequest, MobileAppRevision
from app.models.organization import Organization
from app.models.platform import PlatformUser
from app.models.user import User
from app.services import media as media_service
from app.services.app_design import catalog, check_targets, default_design, validate_design
from app.services.blocks import BlockError

admin_router = APIRouter(
    prefix="/admin-features/app-builder",
    tags=["app-builder"],
    dependencies=[Depends(require_admin_route_permission), Depends(require_admin_route_feature)],
)
public_router = APIRouter(tags=["app-builder-public"])
platform_router = APIRouter(prefix="/platform/app-requests", tags=["platform"])

KEEP_REVISIONS = 50


def _org_id(request: Request) -> UUID:
    return UUID(request.state.organization_id)


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _app(db: AsyncSession, org_id: UUID, create: bool = False, lock: bool = False) -> Optional[MobileApp]:
    query = select(MobileApp).where(MobileApp.organization_id == org_id)
    app = (await db.execute(query.with_for_update() if lock else query)).scalar_one_or_none()
    if app is None and create:
        app = MobileApp(organization_id=org_id, version=0)
        db.add(app)
        await db.flush()
    return app


def _out(app: Optional[MobileApp]) -> dict:
    return {
        "design": (app and (app.draft or app.config)) or default_design(),
        "version": app.version if app else 0,
        "has_draft": bool(app and app.draft is not None),
        "is_published": bool(app and app.config is not None),
        "published_at": app.published_at.isoformat() if app and app.published_at else None,
        "published_by": app.published_by if app else None,
    }


def _check_version(app: MobileApp, version: int) -> None:
    if version != app.version:
        raise HTTPException(status_code=409, detail={
            "message": f"Tasarım başka bir oturumda değiştirildi ({app.draft_updated_by or 'bilinmiyor'}). Sayfayı yenileyin.",
            "version": app.version,
        })


def _log(db: AsyncSession, org_id: UUID, user: User, action: str, **details) -> None:
    db.add(AuditLog(organization_id=org_id, user_id=user.id, action=action, details=details))


@admin_router.get("/catalog")
async def get_catalog():
    return catalog()


@admin_router.get("/design")
async def get_design(request: Request, db: AsyncSession = Depends(get_db)):
    return _out(await _app(db, _org_id(request)))


class DraftIn(BaseModel):
    design: dict[str, Any]
    version: int = Field(ge=0)


class VersionIn(BaseModel):
    version: int = Field(ge=0)


@admin_router.put("/design/draft")
async def save_draft(payload: DraftIn, request: Request, db: AsyncSession = Depends(get_db),
                     user: User = Depends(get_current_user)):
    """Autosave. `version` must match: someone else's newer save is never overwritten."""
    try:
        design = validate_design(payload.design)
    except BlockError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    app = await _app(db, _org_id(request), create=True, lock=True)
    _check_version(app, payload.version)
    app.draft = design
    app.version += 1
    app.draft_updated_at, app.draft_updated_by = _now(), user.email
    await db.commit()
    return {"version": app.version}


@admin_router.post("/design/publish")
async def publish(payload: VersionIn, request: Request, db: AsyncSession = Depends(get_db),
                  user: User = Depends(get_current_user)):
    """Exactly the version the editor shows goes live; it is kept as a revision."""
    org_id = _org_id(request)
    app = await _app(db, org_id, create=True, lock=True)
    _check_version(app, payload.version)
    try:
        design = validate_design(app.draft or app.config or default_design())
        await check_targets(db, org_id, design)
    except BlockError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    app.config, app.draft = design, None
    app.version += 1
    app.published_at, app.published_by = _now(), user.email
    db.add(MobileAppRevision(organization_id=org_id, config=design, created_by=user.email))
    await db.flush()
    old = (await db.execute(
        select(MobileAppRevision.id).where(MobileAppRevision.organization_id == org_id)
        .order_by(MobileAppRevision.created_at.desc()).offset(KEEP_REVISIONS)
    )).scalars().all()
    if old:
        await db.execute(delete(MobileAppRevision).where(MobileAppRevision.id.in_(old)))
    _log(db, org_id, user, "uygulama_tasarimi_yayinla", pages=len(design["pages"]))
    await db.commit()
    return _out(app)


@admin_router.post("/design/discard")
async def discard(payload: VersionIn, request: Request, db: AsyncSession = Depends(get_db)):
    app = await _app(db, _org_id(request), create=True, lock=True)
    _check_version(app, payload.version)
    app.draft = None
    app.version += 1
    await db.commit()
    return _out(app)


@admin_router.post("/design/unpublish")
async def unpublish(payload: VersionIn, request: Request, db: AsyncSession = Depends(get_db),
                    user: User = Depends(get_current_user)):
    """Back to the built-in design; the published one becomes the draft unless a draft exists."""
    org_id = _org_id(request)
    app = await _app(db, org_id, create=True, lock=True)
    _check_version(app, payload.version)
    if app.draft is None:
        app.draft = app.config
    app.config = None
    app.version += 1
    _log(db, org_id, user, "uygulama_tasarimi_kaldir")
    await db.commit()
    return _out(app)


@admin_router.get("/design/revisions")
async def revisions(request: Request, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(MobileAppRevision).where(MobileAppRevision.organization_id == _org_id(request))
        .order_by(MobileAppRevision.created_at.desc())
    )).scalars().all()
    return [{"id": str(r.id), "created_at": r.created_at.isoformat(), "created_by": r.created_by} for r in rows]


@admin_router.post("/design/revisions/{revision_id}/restore")
async def restore(revision_id: UUID, payload: VersionIn, request: Request, db: AsyncSession = Depends(get_db),
                  user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    revision = (await db.execute(select(MobileAppRevision).where(
        MobileAppRevision.id == revision_id, MobileAppRevision.organization_id == org_id))).scalar_one_or_none()
    if not revision:
        raise HTTPException(status_code=404, detail="Sürüm bulunamadı")
    app = await _app(db, org_id, create=True, lock=True)
    _check_version(app, payload.version)
    try:
        app.draft = validate_design(revision.config)
    except BlockError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    app.version += 1
    app.draft_updated_at, app.draft_updated_by = _now(), user.email
    await db.commit()
    return _out(app)


@public_router.get("/public/app-design")
async def public_design(request: Request, db: AsyncSession = Depends(get_db)):
    """The published design, or null (the app then shows its built-in one). Drafts never leave the admin API."""
    app = await _app(db, _org_id(request))
    body = json.dumps({"design": app.config if app else None}, ensure_ascii=False, separators=(",", ":")).encode()
    etag = f'"{hashlib.sha256(body).hexdigest()[:20]}"'
    # The organisation may come from the bearer token, so shared caches must not keep this.
    headers = {"ETag": etag, "Cache-Control": "private, no-cache"}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)
    return Response(content=body, media_type="application/json", headers=headers)


# --- Store application --------------------------------------------------------------------

STATUSES = ("draft", "submitted", "in_review", "built", "in_store", "changes_requested")
EDITABLE = ("draft", "changes_requested")
ACCOUNT = "^(none|applied|ready)$"
PACKAGE = re.compile(r"^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,}$")


class StoreIn(BaseModel):
    app_name: str = Field(default="", max_length=30)
    package_id: str = Field(default="", max_length=80)
    short_description: str = Field(default="", max_length=80)
    full_description: str = Field(default="", max_length=4000)
    icon_url: str = Field(default="", max_length=500)
    splash_url: str = Field(default="", max_length=500)
    splash_color: str = Field(default="#FFFFFF", pattern="^#[0-9a-fA-F]{6}$")
    privacy_url: str = Field(default="", max_length=300)
    support_email: str = Field(default="", max_length=200)
    contact_name: str = Field(default="", max_length=120)
    contact_phone: str = Field(default="", max_length=30)
    google_account: str = Field(default="none", pattern=ACCOUNT)
    apple_account: str = Field(default="none", pattern=ACCOUNT)


def _request_out(row: Optional[MobileAppRequest], org: Organization) -> dict:
    base = StoreIn(app_name=org.name[:30], support_email=org.email or "").model_dump()
    return {
        "data": {**base, **(row.data if row else {})},
        "status": row.status if row else "draft",
        "note": row.note if row else None,
        "editable": row is None or row.status in EDITABLE,
        "submitted_at": row.submitted_at.isoformat() if row and row.submitted_at else None,
    }


async def _request(db: AsyncSession, org_id: UUID) -> Optional[MobileAppRequest]:
    return (await db.execute(select(MobileAppRequest).where(
        MobileAppRequest.organization_id == org_id).with_for_update())).scalar_one_or_none()


async def _original(db: AsyncSession, org_id: UUID, url: str, label: str) -> Path:
    """The kept original of an image in the organisation's own library."""
    match = re.match(rf"^/api/v1/media/{org_id}/([a-f0-9]{{24}})[^/]*$", url.split("?")[0])
    asset = match and (await db.execute(select(MediaAsset).where(
        MediaAsset.organization_id == org_id, MediaAsset.token == match[1]))).scalar_one_or_none()
    name = asset and (asset.original_file or Path(asset.url.split("?")[0]).name)
    path = media_service.org_dir(org_id) / name if name else None
    if not path or not path.is_file():
        raise HTTPException(status_code=422, detail=f"{label}: görseli ortam kütüphanesinden yükleyin")
    return path


def _image_info(path: Path) -> tuple[str, int, int, bool]:
    from PIL import Image

    with Image.open(path) as image:
        alpha = image.mode in ("RGBA", "LA") or "transparency" in image.info
        if alpha:
            alpha = image.convert("RGBA").getchannel("A").getextrema()[0] < 255
        return image.format or "", image.width, image.height, alpha


async def _check_complete(db: AsyncSession, org_id: UUID, data: StoreIn) -> None:
    names = {"app_name": "Uygulama adı", "short_description": "Kısa açıklama", "full_description": "Uzun açıklama",
             "icon_url": "İkon", "splash_url": "Açılış görseli", "privacy_url": "Gizlilik adresi",
             "support_email": "Destek e-postası", "contact_name": "Yetkili adı", "contact_phone": "Yetkili telefonu"}
    missing = [label for key, label in names.items() if not getattr(data, key).strip()]
    if missing:
        raise HTTPException(status_code=422, detail=f"Eksik alanlar: {', '.join(missing)}")
    if not PACKAGE.fullmatch(data.package_id):
        raise HTTPException(status_code=422, detail="Paket kimliği org.kurum.mobil biçiminde olmalı")
    if not re.fullmatch(r"https://\S+\.\S+", data.privacy_url):
        raise HTTPException(status_code=422, detail="Gizlilik adresi https:// ile başlamalı")
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", data.support_email):
        raise HTTPException(status_code=422, detail="Destek e-postası geçersiz")
    icon = await _original(db, org_id, data.icon_url, "İkon")
    fmt, width, height, alpha = await asyncio.to_thread(_image_info, icon)
    if fmt != "PNG" or (width, height) != (1024, 1024) or alpha:
        raise HTTPException(status_code=422, detail="İkon 1024×1024 piksel, saydam olmayan PNG olmalı")
    splash = await _original(db, org_id, data.splash_url, "Açılış görseli")
    if (await asyncio.to_thread(_image_info, splash))[0] != "PNG":
        raise HTTPException(status_code=422, detail="Açılış görseli PNG olmalı")
    taken = (await db.execute(select(MobileAppRequest.id).where(
        MobileAppRequest.organization_id != org_id, MobileAppRequest.status != "draft",
        MobileAppRequest.data["package_id"].astext == data.package_id))).first()
    if taken:
        raise HTTPException(status_code=422, detail="Bu paket kimliği başka bir başvuruda kullanılıyor")


@admin_router.get("/store")
async def get_store(request: Request, db: AsyncSession = Depends(get_db)):
    org = await db.get(Organization, _org_id(request))
    return _request_out(await _request(db, org.id), org)


async def _save_store(payload: StoreIn, request: Request, db: AsyncSession) -> tuple[MobileAppRequest, Organization]:
    org = await db.get(Organization, _org_id(request))
    row = await _request(db, org.id)
    if row and row.status not in EDITABLE:
        raise HTTPException(status_code=409, detail="Başvuru inceleniyor; şu an değiştirilemez")
    if not row:
        row = MobileAppRequest(organization_id=org.id, status="draft")
        db.add(row)
    row.data = payload.model_dump()
    return row, org


@admin_router.put("/store")
async def save_store(payload: StoreIn, request: Request, db: AsyncSession = Depends(get_db)):
    row, org = await _save_store(payload, request, db)
    await db.commit()
    return _request_out(row, org)


@admin_router.post("/store/submit")
async def submit_store(payload: StoreIn, request: Request, db: AsyncSession = Depends(get_db),
                       user: User = Depends(get_current_user)):
    await _check_complete(db, _org_id(request), payload)
    row, org = await _save_store(payload, request, db)
    row.status, row.submitted_at, row.submitted_by = "submitted", _now(), user.email
    _log(db, org.id, user, "uygulama_basvurusu_gonder", package_id=payload.package_id)
    await db.commit()
    out = _request_out(row, org)
    try:
        from app.services.push_service import notify_platform_push

        await notify_platform_push(
            db,
            title=f"Mağaza Yayın Başvurusu · {org.name}",
            body=f"{payload.app_name} ({payload.package_id}) inceleme bekliyor.",
            data={"route": "platform_org", "org_id": str(org.id)},
        )
        await db.commit()
    except Exception:  # noqa: BLE001
        await db.rollback()
    return out


# --- Platform operators -------------------------------------------------------------------

def _platform_row(row: MobileAppRequest, org: Organization) -> dict:
    return {**_request_out(row, org), "id": str(row.id), "organization": org.name, "slug": org.slug,
            "submitted_by": row.submitted_by}


@platform_router.get("")
async def list_requests(db: AsyncSession = Depends(get_db), _: PlatformUser = Depends(get_platform_user)):
    rows = (await db.execute(
        select(MobileAppRequest, Organization).join(Organization, Organization.id == MobileAppRequest.organization_id)
        .where(MobileAppRequest.status != "draft").order_by(MobileAppRequest.submitted_at.desc())
    )).all()
    return [_platform_row(row, org) for row, org in rows]


class RequestStatusIn(BaseModel):
    status: str = Field(pattern="^(submitted|in_review|built|in_store|changes_requested)$")
    note: Optional[str] = Field(default=None, max_length=1000)


async def _submitted(db: AsyncSession, request_id: UUID) -> tuple[MobileAppRequest, Organization]:
    row = await db.get(MobileAppRequest, request_id)
    if not row or row.status == "draft":
        raise HTTPException(status_code=404, detail="Başvuru bulunamadı")
    return row, await db.get(Organization, row.organization_id)


@platform_router.patch("/{request_id}")
async def update_request(request_id: UUID, payload: RequestStatusIn, request: Request, db: AsyncSession = Depends(get_db),
                         operator: PlatformUser = Depends(get_platform_user)):
    row, org = await _submitted(db, request_id)
    org_id = org.id
    note = (payload.note or "").strip() or None
    if payload.status == "changes_requested" and not note:
        raise HTTPException(status_code=422, detail="Düzeltme isterken not yazın")
    _audit(db, request, operator, "uygulama_basvurusu_durum", organization_id=org.id, old=row.status, new=payload.status)
    row.status, row.note = payload.status, note
    await db.commit()
    out = _platform_row(row, org)
    try:
        from app.services import staff_notify

        status_labels = {
            "in_review": "İncelemeye alındı",
            "built": "Uygulama paketi derlendi",
            "in_store": "Mağazada yayına alındı!",
            "changes_requested": "Düzeltme istendi",
            "submitted": "Başvuru alındı",
        }
        label = status_labels.get(payload.status, payload.status)
        await staff_notify.notify_system_alert(
            db,
            org_id,
            title=f"Mobil Uygulama Başvurusu · {label}",
            body=note or f"Mağaza yayın başvurunuzun durumu '{label}' olarak güncellendi.",
        )
        await db.commit()
    except Exception:  # noqa: BLE001
        await db.rollback()
    return out


def _zip(manifest: dict, icon: Path, splash: Path) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("app.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        archive.write(icon, "icon.png")
        archive.write(splash, "splash.png")
    return buffer.getvalue()


@platform_router.get("/{request_id}/package")
async def package(request_id: UUID, db: AsyncSession = Depends(get_db), _: PlatformUser = Depends(get_platform_user)):
    """What apps/mobile/scripts/add-tenant.mjs needs to add this app."""
    row, org = await _submitted(db, request_id)
    data = StoreIn(**row.data)
    host = (await site_url(db, org)).split("://", 1)[-1].split("/")[0]
    manifest = {
        "slug": org.slug, "name": data.app_name, "fullName": org.legal_name or org.name, "tagline": org.tagline or "",
        "host": host, "primaryColor": org.theme_primary_color or "#065F46", "accentColor": org.theme_accent_color or "#0284C7",
        "packageAndroid": data.package_id, "bundleIos": data.package_id,
        "scheme": re.sub(r"[^a-z0-9]", "", org.slug.lower()), "splashColor": data.splash_color,
        "store": {k: getattr(data, k) for k in ("short_description", "full_description", "privacy_url", "support_email")},
    }
    icon = await _original(db, org.id, data.icon_url, "İkon")
    splash = await _original(db, org.id, data.splash_url, "Açılış görseli")
    content = await asyncio.to_thread(_zip, manifest, icon, splash)
    return Response(content=content, media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{org.slug}-uygulama.zip"'})

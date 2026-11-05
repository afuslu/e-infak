"""Site builder API: block pages with drafts, publishing, revisions and private previews."""
import hashlib
import hmac
import time
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin_route_feature, require_admin_route_permission
from app.core.config import settings
from app.core.db import get_db
from app.models.audit_log import AuditLog
from app.models.cms import SitePage, SitePageRevision
from app.models.organization import Organization
from app.models.user import User
from app.services.blocks import BlockError, catalog, home_blocks_for, page_blocks_from_body, validate_blocks
from app.utils.cms import slugify, validate_slug

admin_router = APIRouter(
    prefix="/admin-features/site-builder",
    tags=["site-builder"],
    dependencies=[Depends(require_admin_route_permission), Depends(require_admin_route_feature)],
)
public_router = APIRouter(tags=["site-builder-public"])

HOME_SLUG = "__home__"
KEEP_REVISIONS = 50
PREVIEW_SECONDS = 2 * 3600


def _org_id(request: Request) -> UUID:
    return UUID(request.state.organization_id)


def _preview_token(page_id: UUID, expires: int) -> str:
    signature = hmac.new(settings.SECRET_KEY.encode(), f"preview:{page_id}:{expires}".encode(), hashlib.sha256).hexdigest()
    return f"{expires}.{signature[:40]}"


def _preview_ok(page_id: UUID, token: Optional[str]) -> bool:
    try:
        expires, _ = str(token).split(".", 1)
        if int(expires) < time.time():
            return False
        return hmac.compare_digest(_preview_token(page_id, int(expires)), str(token))
    except (ValueError, AttributeError):
        return False


async def _home(db: AsyncSession, org_id: UUID) -> Optional[SitePage]:
    return (await db.execute(
        select(SitePage).where(SitePage.organization_id == org_id, SitePage.kind == "home")
    )).scalar_one_or_none()


async def _page(db: AsyncSession, org_id: UUID, page_id: str, create_home: bool = False) -> SitePage:
    if page_id == "home":
        page = await _home(db, org_id)
        if page or not create_home:
            if not page:
                raise HTTPException(status_code=404, detail="Ana sayfa henüz düzenlenmedi")
            return page
        page = SitePage(organization_id=org_id, kind="home", slug=HOME_SLUG, title="Ana sayfa", body="",
                        is_published=True, translations={})
        db.add(page)
        await db.flush()
        return page
    try:
        pid = UUID(page_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Sayfa bulunamadı")
    page = (await db.execute(
        select(SitePage).where(SitePage.id == pid, SitePage.organization_id == org_id)
    )).scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Sayfa bulunamadı")
    return page


def _working_blocks(page: Optional[SitePage], org: Organization) -> list[dict]:
    """What the editor starts from: draft, else published, else today's rendering as blocks."""
    if page is not None and page.draft_blocks is not None:
        return page.draft_blocks
    if page is not None and page.blocks is not None:
        return page.blocks
    if page is None or page.kind == "home":
        return home_blocks_for(org)
    return page_blocks_from_body(page.title, page.body)


def _summary(page: SitePage) -> dict:
    return {
        "id": "home" if page.kind == "home" else str(page.id),
        "kind": page.kind,
        "slug": None if page.kind == "home" else page.slug,
        "title": page.title,
        "is_published": page.is_published,
        "uses_blocks": page.blocks is not None,
        "has_draft": page.draft_blocks is not None,
        "published_at": page.published_at.isoformat() if page.published_at else None,
        "draft_updated_at": page.draft_updated_at.isoformat() if page.draft_updated_at else None,
    }


@admin_router.get("/catalog")
async def builder_catalog():
    return catalog()


@admin_router.get("/pages")
async def list_pages(request: Request, db: AsyncSession = Depends(get_db)):
    org_id = _org_id(request)
    pages = (await db.execute(
        select(SitePage).where(SitePage.organization_id == org_id).order_by(SitePage.kind, SitePage.title)
    )).scalars().all()
    out = [_summary(p) for p in pages]
    if not any(p.kind == "home" for p in pages):
        out.insert(0, {"id": "home", "kind": "home", "slug": None, "title": "Ana sayfa", "is_published": True,
                       "uses_blocks": False, "has_draft": False, "published_at": None, "draft_updated_at": None})
    return sorted(out, key=lambda p: (p["kind"] != "home", p["title"].lower()))


class NewPage(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    slug: Optional[str] = Field(default=None, max_length=150)


@admin_router.post("/pages", status_code=status.HTTP_201_CREATED)
async def create_page(payload: NewPage, request: Request, db: AsyncSession = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    try:
        slug = validate_slug(payload.slug or slugify(payload.title) or "sayfa")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    base, n = slug, 2
    while (await db.execute(select(SitePage.id).where(SitePage.organization_id == org_id, SitePage.slug == slug))).first():
        slug, n = f"{base}-{n}", n + 1
    page = SitePage(organization_id=org_id, kind="page", slug=slug, title=payload.title.strip(), body="",
                    is_published=False, translations={})
    page.draft_blocks = validate_blocks(page_blocks_from_body(page.title, ""))
    page.draft_updated_at, page.draft_updated_by = datetime.now(timezone.utc), current_user.email
    db.add(page)
    await db.flush()
    db.add(AuditLog(organization_id=org_id, user_id=current_user.id, action="sayfa_olustur",
                    details={"page_id": str(page.id), "slug": slug, "via": "site_yapici"}))
    await db.commit()
    return _summary(page)


@admin_router.get("/pages/{page_id}")
async def get_page(page_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    org_id = _org_id(request)
    org = await db.get(Organization, org_id)
    if page_id == "home":
        page = await _home(db, org_id)
    else:
        page = await _page(db, org_id, page_id)
    return {
        **(_summary(page) if page else {"id": "home", "kind": "home", "title": "Ana sayfa", "slug": None,
                                       "is_published": True, "uses_blocks": False, "has_draft": False,
                                       "published_at": None, "draft_updated_at": None}),
        "blocks": _working_blocks(page, org),
        "version": page.version if page else 0,
        "draft_updated_by": page.draft_updated_by if page else None,
    }


class DraftIn(BaseModel):
    blocks: list[Any]
    version: int = Field(ge=0)


@admin_router.put("/pages/{page_id}/draft")
async def save_draft(page_id: str, payload: DraftIn, request: Request, db: AsyncSession = Depends(get_db),
                     current_user: User = Depends(get_current_user)):
    """Autosave. `version` must match: someone else's newer save is never overwritten."""
    org_id = _org_id(request)
    try:
        blocks = validate_blocks(payload.blocks)
    except BlockError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    page = await _page(db, org_id, page_id, create_home=True)
    if payload.version != page.version:
        raise HTTPException(status_code=409, detail={
            "message": f"Bu sayfa başka bir oturumda değiştirildi ({page.draft_updated_by or 'bilinmiyor'}). Sayfayı yenileyin.",
            "version": page.version,
        })
    page.draft_blocks = blocks
    page.version += 1
    page.draft_updated_at, page.draft_updated_by = datetime.now(timezone.utc), current_user.email
    await db.commit()
    return {"version": page.version, "blocks": blocks, "draft_updated_at": page.draft_updated_at.isoformat()}


@admin_router.post("/pages/{page_id}/publish")
async def publish(page_id: str, request: Request, db: AsyncSession = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    org = await db.get(Organization, org_id)
    page = await _page(db, org_id, page_id, create_home=True)
    blocks = validate_blocks(_working_blocks(page, org))
    page.blocks, page.draft_blocks = blocks, None
    page.is_published = True
    page.version += 1
    page.published_at, page.published_by = datetime.now(timezone.utc), current_user.email
    db.add(SitePageRevision(page_id=page.id, organization_id=org_id, blocks=blocks, created_by=current_user.email))
    await db.flush()
    old = (await db.execute(
        select(SitePageRevision.id).where(SitePageRevision.page_id == page.id)
        .order_by(SitePageRevision.created_at.desc()).offset(KEEP_REVISIONS)
    )).scalars().all()
    if old:
        await db.execute(delete(SitePageRevision).where(SitePageRevision.id.in_(old)))
    db.add(AuditLog(organization_id=org_id, user_id=current_user.id, action="sayfa_yayinla",
                    details={"page": page.slug, "blocks": len(blocks)}))
    await db.commit()
    return {**_summary(page), "version": page.version}


@admin_router.post("/pages/{page_id}/discard")
async def discard_draft(page_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    org_id = _org_id(request)
    page = await _page(db, org_id, page_id)
    page.draft_blocks = None
    page.version += 1
    await db.commit()
    return {"version": page.version}


@admin_router.get("/pages/{page_id}/revisions")
async def revisions(page_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    org_id = _org_id(request)
    if page_id == "home" and not await _home(db, org_id):
        return []
    page = await _page(db, org_id, page_id)
    rows = (await db.execute(
        select(SitePageRevision).where(SitePageRevision.page_id == page.id).order_by(SitePageRevision.created_at.desc())
    )).scalars().all()
    return [{"id": str(r.id), "created_at": r.created_at.isoformat(), "created_by": r.created_by,
             "blocks": len(r.blocks), "note": r.note} for r in rows]


@admin_router.post("/pages/{page_id}/revisions/{revision_id}/restore")
async def restore_revision(page_id: str, revision_id: UUID, request: Request, db: AsyncSession = Depends(get_db),
                           current_user: User = Depends(get_current_user)):
    """Puts an old version back as the draft; it goes live only when published."""
    org_id = _org_id(request)
    page = await _page(db, org_id, page_id)
    revision = (await db.execute(select(SitePageRevision).where(
        SitePageRevision.id == revision_id, SitePageRevision.page_id == page.id
    ))).scalar_one_or_none()
    if not revision:
        raise HTTPException(status_code=404, detail="Sürüm bulunamadı")
    page.draft_blocks = validate_blocks(revision.blocks)
    page.version += 1
    page.draft_updated_at, page.draft_updated_by = datetime.now(timezone.utc), current_user.email
    await db.commit()
    return {"version": page.version, "blocks": page.draft_blocks}


@admin_router.post("/pages/{page_id}/preview-link")
async def preview_link(page_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    org_id = _org_id(request)
    page = await _page(db, org_id, page_id, create_home=True)
    await db.commit()
    token = _preview_token(page.id, int(time.time()) + PREVIEW_SECONDS)
    path = "/" if page.kind == "home" else f"/sayfa/{page.slug}"
    return {"path": f"{path}?onizleme={token}", "expires_in": PREVIEW_SECONDS}


# --- Public -----------------------------------------------------------------------

def _visible_now(blocks: list[dict]) -> list[dict]:
    """Drop blocks outside their publication window (and their children recursively)."""
    now = datetime.now(timezone.utc)
    out = []
    for block in blocks or []:
        advanced = block.get("advanced") or {}
        try:
            starts = datetime.fromisoformat(advanced["starts_at"]) if advanced.get("starts_at") else None
            ends = datetime.fromisoformat(advanced["ends_at"]) if advanced.get("ends_at") else None
        except ValueError:
            starts = ends = None
        starts = starts.replace(tzinfo=timezone.utc) if starts and starts.tzinfo is None else starts
        ends = ends.replace(tzinfo=timezone.utc) if ends and ends.tzinfo is None else ends
        if (starts and now < starts) or (ends and now > ends):
            continue
        if block.get("children"):
            block = {**block, "children": _visible_now(block["children"])}
        out.append(block)
    return out


@public_router.get("/public/home")
async def public_home(request: Request, onizleme: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    """Published home blocks (or the draft with a valid preview token). null = classic home page."""
    page = await _home(db, _org_id(request))
    if not page:
        return {"blocks": None, "preview": False}
    if onizleme and _preview_ok(page.id, onizleme):
        org = await db.get(Organization, page.organization_id)
        return {"blocks": _working_blocks(page, org), "preview": True}
    return {"blocks": _visible_now(page.blocks) if page.blocks is not None else None, "preview": False}


async def public_page_blocks(page: SitePage, token: Optional[str], db: AsyncSession) -> tuple[Optional[list], bool]:
    """Used by the public page endpoint: (blocks or None for a legacy page, is_preview)."""
    if token and _preview_ok(page.id, token):
        org = await db.get(Organization, page.organization_id)
        return _working_blocks(page, org), True
    return (_visible_now(page.blocks) if page.blocks is not None else None), False

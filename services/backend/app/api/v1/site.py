"""Public website data, tenant resolution for the gateway, and site appearance management."""
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin_route_feature, require_admin_route_permission
from app.core.config import settings
from app.core.db import get_db
from app.core.rate_limit import rate_limit
from app.models.audit_log import AuditLog
from app.models.organization import Organization, OrganizationDomain
from app.models.organization_settings import OrganizationSettings
from app.models.user import User
from app.services.site import DEFAULT_SECTIONS, SECTION_LABELS, TEMPLATES, SiteAppearance, appearance_of, apply_appearance, public_site
from app.services.tenancy import resolve_org_slug, tls_allowed
from app.utils.i18n import request_language

public_router = APIRouter(tags=["site"])
admin_router = APIRouter(
    prefix="/admin-features",
    tags=["site-admin"],
    dependencies=[Depends(require_admin_route_permission), Depends(require_admin_route_feature)],
)



async def site_url(db: AsyncSession, org: Organization) -> str:
    """Canonical public address: the primary active custom domain, else the platform subdomain."""
    domain = (await db.execute(
        select(OrganizationDomain.domain).where(
            OrganizationDomain.organization_id == org.id, OrganizationDomain.status == "active",
        ).order_by(OrganizationDomain.is_primary.desc(), OrganizationDomain.created_at).limit(1)
    )).scalar_one_or_none()
    if domain:
        return f"https://{domain}"
    if org.subdomain:
        return f"https://{org.subdomain}.{settings.PLATFORM_BASE_DOMAIN}"
    return settings.PUBLIC_WEB_URL


# --- Public ------------------------------------------------------------------------

@public_router.get("/public/site")
async def get_public_site(request: Request, db: AsyncSession = Depends(get_db)):
    """Branding, template and texts of the current organisation's website."""
    org = await db.get(Organization, UUID(request.state.organization_id))
    settings_row = (await db.execute(
        select(OrganizationSettings).where(OrganizationSettings.organization_id == org.id)
    )).scalar_one_or_none()
    from app.core.plans import org_features

    data = public_site(org, settings_row, request_language(request))
    data["url"] = await site_url(db, org)
    data["features"] = sorted(f.value for f in org_features(org))
    return data


@public_router.get("/directory")
async def platform_directory(db: AsyncSession = Depends(get_db)):
    """Organisations listed on the platform landing page (they can opt out)."""
    orgs = (await db.execute(
        select(Organization).where(Organization.is_active.is_(True)).order_by(Organization.name)
    )).scalars().all()
    result = []
    for org in orgs:
        if (org.site or {}).get("show_in_directory", True) is False:
            continue
        result.append({
            "slug": org.slug, "name": org.name, "tagline": org.tagline, "logo_url": org.logo_url,
            "primary_color": org.theme_primary_color, "url": await site_url(db, org),
        })
    return result


@public_router.get("/internal/resolve-host")
async def resolve_host(host: str = Query(max_length=253), db: AsyncSession = Depends(get_db)):
    """Used by the web gateway to map a request host to an organisation."""
    slug = await resolve_org_slug(db, host)
    if not slug:
        raise HTTPException(status_code=404, detail="Unknown host")
    return {"slug": slug}


@public_router.get("/internal/tls-allowed")
async def tls_allowed_check(
    domain: str = Query(max_length=253),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit("tls-ask", limit=120)),
):
    """Caddy on-demand TLS `ask` endpoint: 200 issues a certificate, anything else refuses."""
    if not await tls_allowed(db, domain):
        raise HTTPException(status_code=403, detail="Domain not served")
    return Response(status_code=200)


@public_router.get("/media/{org_id}/{name}")
async def get_media(org_id: UUID, name: str):
    from app.services.media import MIME_TYPES, PUBLIC_NAME

    if not PUBLIC_NAME.fullmatch(name):
        raise HTTPException(status_code=404, detail="Not found")
    path = Path(settings.MEDIA_ROOT) / str(org_id) / name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(
        path, media_type=MIME_TYPES[name.rsplit(".", 1)[1]],
        headers={"Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"},
    )


# --- Admin: appearance ---------------------------------------------------------------

@admin_router.get("/site-appearance")
async def get_site_appearance(request: Request, db: AsyncSession = Depends(get_db),
                              current_user: User = Depends(get_current_user)):
    org = await db.get(Organization, UUID(request.state.organization_id))
    return {
        **appearance_of(org),
        "name": org.name,
        "url": await site_url(db, org),
        "templates": [{"key": k, "label": v, "default_sections": DEFAULT_SECTIONS[k]} for k, v in TEMPLATES.items()],
        "sections": [{"key": k, "label": v} for k, v in SECTION_LABELS.items()],
    }


@admin_router.put("/site-appearance")
async def update_site_appearance(request: Request, payload: SiteAppearance, db: AsyncSession = Depends(get_db),
                                 current_user: User = Depends(get_current_user)):
    org = await db.get(Organization, UUID(request.state.organization_id))
    apply_appearance(org, payload)
    db.add(AuditLog(organization_id=org.id, user_id=current_user.id, action="site_gorunum_guncelle",
                    details={"template": org.template}))
    await db.commit()
    return appearance_of(org)


@admin_router.post("/uploads", status_code=status.HTTP_201_CREATED)
async def upload_image(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(rate_limit("upload", limit=60, window_seconds=300)),
):
    """Logo / görsel yükleme. Yalnız gerçek görseller (PNG, JPEG, WEBP, GIF, ICO) kabul edilir; SVG reddedilir.

    Yüklenen her görsel medya kütüphanesine de kaydedilir (WebP'ye çevrilir, boyutları üretilir).
    """
    from app.services.media import MAX_UPLOAD_BYTES, create_asset

    org = await db.get(Organization, UUID(request.state.organization_id))
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    asset = await create_asset(db, org, content, file.filename, getattr(current_user, "id", None))
    await db.commit()
    return {"url": asset.url, "width": asset.width, "height": asset.height, "id": str(asset.id)}

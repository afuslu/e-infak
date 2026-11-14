"""Public website data, tenant resolution for the gateway, and site appearance management."""
import logging
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
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
from app.services.site import DEFAULT_SECTIONS, FONTS, SECTION_LABELS, TEMPLATES, THEME_KITS, SiteAppearance, appearance_of, apply_appearance, public_site
from app.services import domains
from app.services.tenancy import forget_host, resolve_org_slug, tls_allowed, twin
from app.utils.i18n import request_language

logger = logging.getLogger(__name__)
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
    data["card_payments"] = await card_payments_available(db, org)
    return data


async def card_payments_available(db: AsyncSession, org) -> bool:
    """True when the organisation's card provider has its credentials; otherwise the
    website offers bank transfer only instead of a card option that would fail."""
    from app.payments import provider_for

    try:
        return bool((await provider_for(db, org)).configured)
    except Exception:  # noqa: BLE001 - a broken credential row must not take the website down
        logger.warning("card provider check failed for %s", org.slug, exc_info=True)
        return False


class DemoRequestIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    organization: str = Field(min_length=2, max_length=200)
    phone: str = Field(min_length=7, max_length=32)
    email: str | None = Field(default=None, max_length=255)
    plan: str | None = Field(default=None, max_length=20)
    message: str | None = Field(default=None, max_length=2000)
    website: str | None = Field(default=None, max_length=200)  # hidden field; only bots fill it


@public_router.post("/directory/demo-request", status_code=201,
                    dependencies=[Depends(rate_limit("demo-request", limit=5, window_seconds=3600))])
async def create_demo_request(payload: DemoRequestIn, request: Request, db: AsyncSession = Depends(get_db)):
    """Demo / offer request from the platform landing page; listed in the platform console."""
    from app.core.plans import Plan
    from app.models.platform import DemoRequest
    from app.utils.content import sanitize_public_text

    if payload.website:  # a bot: answer as if it worked, store nothing
        return {"status": "received"}
    digits = "".join(ch for ch in payload.phone if ch.isdigit())
    if not 10 <= len(digits) <= 15:
        raise HTTPException(status_code=422, detail="Geçerli bir telefon numarası girin")
    email = (payload.email or "").strip().lower() or None
    if email and ("@" not in email or "." not in email.split("@")[-1]):
        raise HTTPException(status_code=422, detail="Geçerli bir e-posta adresi girin")
    db.add(DemoRequest(
        name=sanitize_public_text(payload.name) or "", organization=sanitize_public_text(payload.organization) or "",
        phone=digits, email=email, plan=payload.plan if payload.plan in {p.value for p in Plan} else None,
        message=sanitize_public_text(payload.message), ip_address=request.client.host if request.client else None,
    ))
    await db.commit()
    return {"status": "received"}


@public_router.get("/directory/plans")
async def platform_plans():
    """Packages as the product defines them, so the landing page cannot drift from the real limits."""
    from app.core.plans import FEATURE_LABELS, PLAN_FEATURES, PLAN_LABELS, PLAN_LIMITS, Plan

    plans, seen = [], frozenset()
    for plan in Plan:
        features = PLAN_FEATURES[plan]
        plans.append({
            "key": plan.value, "label": PLAN_LABELS[plan], "users": PLAN_LIMITS[plan]["users"],
            "bank_accounts": PLAN_LIMITS[plan]["bank_accounts"],
            "new_features": sorted(FEATURE_LABELS[f] for f in features - seen if f in FEATURE_LABELS),
        })
        seen = features
    return plans


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
        "fonts": [{"key": k, "label": v} for k, v in FONTS.items()],
        "theme_kits": THEME_KITS,
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


# --- Admin: custom domains -------------------------------------------------------------

class SiteDomainIn(BaseModel):
    domain: str = Field(min_length=3, max_length=253)


async def _own_domain(request: Request, db: AsyncSession, domain_id: UUID) -> OrganizationDomain:
    row = await db.get(OrganizationDomain, domain_id)
    if not row or str(row.organization_id) != request.state.organization_id:
        raise HTTPException(status_code=404, detail="Alan adı bulunamadı")
    return row


@admin_router.get("/site-domains")
async def list_site_domains(request: Request, db: AsyncSession = Depends(get_db),
                            current_user: User = Depends(get_current_user)):
    org = await db.get(Organization, UUID(request.state.organization_id))
    rows = (await db.execute(select(OrganizationDomain).where(
        OrganizationDomain.organization_id == org.id).order_by(OrganizationDomain.created_at))).scalars().all()
    return {
        "subdomain": f"{org.subdomain}.{settings.PLATFORM_BASE_DOMAIN}" if org.subdomain else None,
        "url": await site_url(db, org),
        "public_ip": settings.PLATFORM_PUBLIC_IP,
        "domains": [domains.domain_out(r) for r in rows],
    }


@admin_router.post("/site-domains", status_code=status.HTTP_201_CREATED)
async def add_site_domain(request: Request, payload: SiteDomainIn, db: AsyncSession = Depends(get_db),
                          current_user: User = Depends(get_current_user)):
    try:
        row = await domains.add_domain(db, UUID(request.state.organization_id), payload.domain)
    except domains.DomainError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    db.add(AuditLog(organization_id=row.organization_id, user_id=current_user.id, action="alan_adi_ekle",
                    details={"domain": row.domain}))
    await db.commit()
    return domains.domain_out(row)


@admin_router.post("/site-domains/{domain_id}/verify")
async def verify_site_domain(request: Request, domain_id: UUID, db: AsyncSession = Depends(get_db),
                             current_user: User = Depends(get_current_user),
                             _: None = Depends(rate_limit("domain-verify", limit=30))):
    row = await _own_domain(request, db, domain_id)
    was_active = row.status == "active"
    result = await domains.verify(db, row)
    if result.ok and not was_active:
        db.add(AuditLog(organization_id=row.organization_id, user_id=current_user.id, action="alan_adi_dogrulandi",
                        details={"domain": row.domain}))
        await db.commit()
        domains.warm_certificates_soon([row.domain, f"www.{row.domain}"])
    return domains.domain_out(row)


@admin_router.delete("/site-domains/{domain_id}")
async def remove_site_domain(request: Request, domain_id: UUID, db: AsyncSession = Depends(get_db),
                             current_user: User = Depends(get_current_user)):
    row = await _own_domain(request, db, domain_id)
    domain = row.domain
    await db.delete(row)
    db.add(AuditLog(organization_id=UUID(request.state.organization_id), user_id=current_user.id,
                    action="alan_adi_sil", details={"domain": domain}))
    await db.commit()
    await forget_host(domain, twin(domain))
    return {"ok": True}

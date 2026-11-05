"""Which organisation does a host name belong to?

Sources, in order:
1. `<subdomain>.<PLATFORM_BASE_DOMAIN>` → Organization.subdomain (reserved labels excluded)
2. An `active` OrganizationDomain (also matches the bare/`www.` twin of a stored domain)
3. localhost / 127.0.0.1 outside production → DEV_DEFAULT_ORG_SLUG

Results are cached in Redis for a minute; a Redis outage only disables caching.
"""
import logging
import re
from typing import Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.organization import Organization, OrganizationDomain

logger = logging.getLogger(__name__)

CACHE_SECONDS = 60
RESERVED_SUBDOMAINS = {
    "www", "api", "app", "admin", "platform", "panel", "cname", "mail", "smtp", "static", "cdn",
    "status", "docs", "help", "destek", "e-infak",
}
_HOST = re.compile(r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$")
_LABEL = re.compile(r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$")


def normalize_host(host: Optional[str]) -> Optional[str]:
    text = (host or "").strip().lower().rstrip(".")
    if text.startswith("[") or text.count(":") > 1:  # IPv6 literal
        return None
    text = text.split(":")[0]
    if text in ("localhost", "127.0.0.1"):
        return text
    return text if _HOST.fullmatch(text) and len(text) <= 253 else None


def valid_subdomain(label: str) -> bool:
    return bool(_LABEL.fullmatch(label or "")) and label not in RESERVED_SUBDOMAINS


def platform_subdomain(host: str) -> Optional[str]:
    """`hicret` for `hicret.e-infak.org`; None for the platform itself or deeper names."""
    base = settings.PLATFORM_BASE_DOMAIN.lower()
    if not host.endswith("." + base):
        return None
    label = host[: -(len(base) + 1)]
    return label if "." not in label and valid_subdomain(label) else None


def twin(host: str) -> str:
    return host[4:] if host.startswith("www.") else f"www.{host}"


def _cache():
    try:
        from app.core.rate_limit import _client
        return _client()
    except Exception:  # pragma: no cover - redis missing
        return None


async def _lookup(db: AsyncSession, host: str) -> Optional[str]:
    if host in ("localhost", "127.0.0.1"):
        return settings.DEV_DEFAULT_ORG_SLUG if settings.ENVIRONMENT != "production" else None
    label = platform_subdomain(host)
    if label:
        return (await db.execute(
            select(Organization.slug).where(Organization.subdomain == label, Organization.is_active.is_(True))
        )).scalar_one_or_none()
    return (await db.execute(
        select(Organization.slug)
        .join(OrganizationDomain, OrganizationDomain.organization_id == Organization.id)
        .where(
            OrganizationDomain.status == "active",
            Organization.is_active.is_(True),
            or_(OrganizationDomain.domain == host, OrganizationDomain.domain == twin(host)),
        )
        .limit(1)
    )).scalar_one_or_none()


async def resolve_org_slug(db: AsyncSession, host: Optional[str], use_cache: bool = True) -> Optional[str]:
    normalized = normalize_host(host)
    if not normalized:
        return None
    key = f"tenant-host:{normalized}"
    cache = _cache() if use_cache else None
    if cache is not None:
        try:
            cached = await cache.get(key)
            if cached is not None:
                return cached or None
        except Exception as exc:
            logger.warning("tenant cache unavailable: %s", exc)
            cache = None
    slug = await _lookup(db, normalized)
    if cache is not None:
        try:
            await cache.set(key, slug or "", ex=CACHE_SECONDS)
        except Exception:
            pass
    return slug


async def forget_host(*hosts: str) -> None:
    """Drop cached answers after domains or subdomains change."""
    cache = _cache()
    if cache is None:
        return
    keys = []
    for host in hosts:
        normalized = normalize_host(host)
        if normalized:
            keys += [f"tenant-host:{normalized}", f"tenant-host:{twin(normalized)}"]
    if keys:
        try:
            await cache.delete(*keys)
        except Exception:
            pass


async def tls_allowed(db: AsyncSession, domain: Optional[str]) -> bool:
    """Caddy on-demand TLS gate: only hosts that resolve to an active organisation get a certificate."""
    host = normalize_host(domain)
    if not host or host in ("localhost", "127.0.0.1"):
        return False
    if host in (settings.PLATFORM_BASE_DOMAIN, f"www.{settings.PLATFORM_BASE_DOMAIN}"):
        return True
    return await resolve_org_slug(db, host, use_cache=False) is not None

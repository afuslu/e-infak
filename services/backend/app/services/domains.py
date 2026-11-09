"""Custom domain verification and certificate warm-up.

An organisation proves it controls a domain with two DNS records:
  A    <domain>                      → PLATFORM_PUBLIC_IP
  TXT  _einfak-verify.<domain>       → the row's verification_token

DNS is read over HTTPS (Cloudflare, then Google JSON API) so the backend needs no
resolver libraries and sees public DNS rather than the container's resolver.

Certificates: the `certs` Caddy container issues them on demand (gated by
/internal/tls-allowed) into a directory host nginx reads per handshake. A TLS
handshake with the right SNI is what makes Caddy issue or renew, so
`warm_certificate` performs one.
"""
import asyncio
import logging
import secrets
import socket
import ssl
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.organization import Organization, OrganizationDomain
from app.services.tenancy import forget_host, normalize_host, twin

logger = logging.getLogger(__name__)

TXT_PREFIX = "_einfak-verify"
DOH_ENDPOINTS = ("https://cloudflare-dns.com/dns-query", "https://dns.google/resolve")
_TYPES = {"A": 1, "TXT": 16}


class DnsLookupError(Exception):
    """No DNS-over-HTTPS endpoint answered."""


MAX_DOMAINS_PER_ORG = 5
STALE_CLAIM = timedelta(days=7)


class DomainError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code, self.detail = status_code, detail


async def add_domain(db: AsyncSession, organization_id, raw: str) -> OrganizationDomain:
    """New pending domain for an organisation (caller commits). `www.` is folded into the apex.

    A pending claim by another organisation that never verified within a week does not
    block the real owner."""
    domain = normalize_host(raw)
    if domain and domain.startswith("www."):
        domain = domain[4:]
    base = settings.PLATFORM_BASE_DOMAIN
    if not domain or "." not in domain or domain == base or domain.endswith("." + base) or domain == "127.0.0.1":
        raise DomainError(422, "Geçerli bir alan adı girin (ör. kurumadi.org)")
    existing = (await db.execute(select(OrganizationDomain).where(OrganizationDomain.domain == domain))).scalar_one_or_none()
    if existing:
        stale = (existing.status == "pending" and existing.organization_id != organization_id
                 and existing.created_at and existing.created_at < datetime.now(timezone.utc) - STALE_CLAIM)
        if not stale:
            raise DomainError(409, "Bu alan adı başka bir kayıtta var")
        await db.delete(existing)
        await db.flush()
    count = len((await db.execute(select(OrganizationDomain.id).where(
        OrganizationDomain.organization_id == organization_id))).all())
    if count >= MAX_DOMAINS_PER_ORG:
        raise DomainError(422, f"En fazla {MAX_DOMAINS_PER_ORG} alan adı eklenebilir")
    row = OrganizationDomain(organization_id=organization_id, domain=domain, status="pending",
                             verification_token=secrets.token_hex(16), is_primary=False)
    db.add(row)
    await db.flush()
    return row


@dataclass
class DnsAnswer:
    status: int  # 0 NOERROR, 3 NXDOMAIN, ...
    values: list[str] = field(default_factory=list)


async def doh_query(name: str, rtype: str, client: Optional[httpx.AsyncClient] = None) -> DnsAnswer:
    own = client is None
    client = client or httpx.AsyncClient(timeout=6.0)
    try:
        last_error: Optional[Exception] = None
        for endpoint in DOH_ENDPOINTS:
            try:
                resp = await client.get(endpoint, params={"name": name, "type": rtype},
                                        headers={"accept": "application/dns-json"})
                resp.raise_for_status()
                data = resp.json()
            except (httpx.HTTPError, ValueError) as exc:
                last_error = exc
                continue
            values = [str(a.get("data", "")) for a in data.get("Answer") or [] if a.get("type") == _TYPES[rtype]]
            if rtype == "TXT":
                # TXT data arrives quoted and may be split into several strings: "ab" "cd"
                values = ["".join(part for part in v.split('"') if part.strip()) for v in values]
            return DnsAnswer(status=int(data.get("Status", 2)), values=values)
        raise DnsLookupError(str(last_error))
    finally:
        if own:
            await client.aclose()


@dataclass
class CheckResult:
    ok: bool
    error: Optional[str] = None
    www_ok: bool = False


async def check_dns(domain: str, token: str, client: Optional[httpx.AsyncClient] = None) -> CheckResult:
    """Both records must be right; the error text is shown to the organisation as is."""
    target = settings.PLATFORM_PUBLIC_IP.strip()
    if not target:
        return CheckResult(False, "Sunucu IP adresi (PLATFORM_PUBLIC_IP) ayarlı değil; platform yöneticisine bildirin.")
    try:
        txt = await doh_query(f"{TXT_PREFIX}.{domain}", "TXT", client)
        a = await doh_query(domain, "A", client)
        www = await doh_query(f"www.{domain}", "A", client)
    except DnsLookupError:
        return CheckResult(False, "DNS sorgulanamadı; biraz sonra tekrar deneyin.")
    errors = []
    if token not in txt.values:
        found = ", ".join(txt.values) or ("kayıt yok" if txt.status in (0, 3) else f"DNS hatası {txt.status}")
        errors.append(f"TXT {TXT_PREFIX}.{domain} doğrulama kodu eşleşmiyor ({found[:60]})")
    if a.status == 3:
        errors.append(f"{domain} için DNS kaydı bulunamadı (NXDOMAIN)")
    elif target not in a.values:
        errors.append(f"A {domain} → {target} olmalı (şu an: {', '.join(a.values) or 'yok'})")
    return CheckResult(not errors, "; ".join(errors)[:300] or None, www_ok=target in www.values)


async def activate(db: AsyncSession, row: OrganizationDomain) -> None:
    """Make `row` the organisation's live primary domain (caller commits)."""
    others = (await db.execute(select(OrganizationDomain).where(
        OrganizationDomain.organization_id == row.organization_id, OrganizationDomain.id != row.id))).scalars().all()
    for other in others:
        other.is_primary = False
    row.status, row.is_primary, row.verified_at, row.last_check_error = "active", True, datetime.now(timezone.utc), None


async def verify(db: AsyncSession, row: OrganizationDomain, client: Optional[httpx.AsyncClient] = None) -> CheckResult:
    """Check DNS and activate a pending domain when it passes. Commits."""
    result = await check_dns(row.domain, row.verification_token, client)
    row.last_checked_at = datetime.now(timezone.utc)
    if result.ok:
        if row.status != "active":
            await activate(db, row)
        row.last_check_error = None
    else:
        row.last_check_error = result.error
    await db.commit()
    if result.ok:
        await forget_host(row.domain, twin(row.domain))
    return result


def domain_out(row: OrganizationDomain) -> dict:
    target = settings.PLATFORM_PUBLIC_IP or "<sunucu IP>"
    return {
        "id": str(row.id), "domain": row.domain, "status": row.status, "is_primary": row.is_primary,
        "verification_token": row.verification_token,
        "verified_at": row.verified_at.isoformat() if row.verified_at else None,
        "last_checked_at": row.last_checked_at.isoformat() if row.last_checked_at else None,
        "last_check_error": row.last_check_error,
        "dns_records": [
            {"type": "A", "name": "@", "host": row.domain, "value": target},
            {"type": "A", "name": "www", "host": f"www.{row.domain}", "value": target},
            {"type": "TXT", "name": TXT_PREFIX, "host": f"{TXT_PREFIX}.{row.domain}", "value": row.verification_token},
        ],
    }


# --- Periodic work ---------------------------------------------------------------

PENDING_RECHECK = timedelta(minutes=10)
PENDING_GIVE_UP = timedelta(days=14)


async def verify_pending(db: AsyncSession) -> int:
    """Beat task body: re-check pending domains not checked in the last few minutes."""
    now = datetime.now(timezone.utc)
    rows = (await db.execute(select(OrganizationDomain).where(
        OrganizationDomain.status == "pending",
        OrganizationDomain.created_at > now - PENDING_GIVE_UP,
        (OrganizationDomain.last_checked_at.is_(None)) | (OrganizationDomain.last_checked_at < now - PENDING_RECHECK),
    ).limit(50))).scalars().all()
    activated = 0
    async with httpx.AsyncClient(timeout=6.0) as client:
        for row in rows:
            if (await verify(db, row, client)).ok:
                activated += 1
                warm_certificates_soon([row.domain, f"www.{row.domain}"])
    return activated


async def served_hosts(db: AsyncSession) -> list[str]:
    """Every name that should hold a certificate: org subdomains and active domains (+www)."""
    base = settings.PLATFORM_BASE_DOMAIN
    subs = (await db.execute(select(Organization.subdomain).where(
        Organization.is_active.is_(True), Organization.subdomain.is_not(None)))).scalars().all()
    domains = (await db.execute(
        select(OrganizationDomain.domain).join(Organization, Organization.id == OrganizationDomain.organization_id)
        .where(OrganizationDomain.status == "active", Organization.is_active.is_(True)))).scalars().all()
    return [f"{s}.{base}" for s in subs if s] + [h for d in domains for h in (d, f"www.{d}")]


def _handshake(host: str) -> None:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE  # only asking Caddy to obtain/renew; nobody trusts this channel
    with socket.create_connection((settings.CERT_SERVICE_HOST, settings.CERT_SERVICE_PORT), timeout=120) as sock:
        with ctx.wrap_socket(sock, server_hostname=host):
            pass


async def warm_certificate(host: str) -> bool:
    if not settings.CERT_SERVICE_HOST:
        return False
    try:
        await asyncio.to_thread(_handshake, host)
        return True
    except (OSError, ssl.SSLError) as exc:
        logger.info("certificate warm-up for %s failed: %s", host, exc)
        return False


async def points_here(host: str, client: Optional[httpx.AsyncClient] = None) -> bool:
    """Avoid failed ACME validations (Let's Encrypt limits them) for names not pointed at us."""
    if not settings.PLATFORM_PUBLIC_IP:
        return False
    try:
        return settings.PLATFORM_PUBLIC_IP in (await doh_query(host, "A", client)).values
    except DnsLookupError:
        return False


async def warm_hosts(hosts: list[str]) -> int:
    done = 0
    async with httpx.AsyncClient(timeout=6.0) as client:
        for host in hosts:
            if await points_here(host, client) and await warm_certificate(host):
                done += 1
    return done


def warm_certificates_soon(hosts: list[str]) -> None:
    """Queue a warm-up on the worker; harmless when Celery is not reachable (tests, dev)."""
    if not settings.CERT_SERVICE_HOST:
        return
    try:
        from app.tasks import warm_certificates_task
        warm_certificates_task.delay(hosts)
    except Exception as exc:  # pragma: no cover - broker down
        logger.warning("could not queue certificate warm-up: %s", exc)

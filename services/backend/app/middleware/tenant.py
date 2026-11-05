import hashlib
import hmac
import time

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy import select

from app.core.config import settings
from app.core.db import AsyncSessionLocal
from app.models.organization import Organization
from app.services.tenancy import normalize_host, resolve_org_slug

# Paths that are not bound to one organisation.
BYPASS_PATHS = {"/health", "/docs", "/redoc", "/openapi.json"}
# Login works on the platform host too; the user is then found by e-mail.
ORGLESS_PATHS = {"/api/v1/auth/login", "/api/v1/auth/refresh"}
BYPASS_PREFIXES = ("/api/v1/payments/", "/api/v1/internal/", "/api/v1/platform", "/api/v1/media/", "/api/v1/directory")


class TenantMiddleware(BaseHTTPMiddleware):
    """Resolve the organisation of a request and put it on `request.state`.

    - A host that belongs to an organisation (subdomain or verified custom
      domain, see app/services/tenancy.py) decides the tenant.
    - Otherwise — the internal API host behind the web gateway — the
      `x-organization-slug` header decides; in production it must carry the
      gateway's HMAC signature so a browser cannot choose a tenant.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path in BYPASS_PATHS or path.startswith(BYPASS_PREFIXES):
            return await call_next(request)

        async with AsyncSessionLocal() as session:
            host = normalize_host(request.headers.get("host"))
            org_slug = None
            if host and host not in ("localhost", "127.0.0.1"):
                org_slug = await resolve_org_slug(session, host)
            if not org_slug:
                requested_slug = request.headers.get("x-organization-slug")
                if requested_slug and (
                    settings.ENVIRONMENT != "production" or self._valid_proxy_signature(requested_slug, request)
                ):
                    org_slug = requested_slug
                elif requested_slug is None:
                    org_slug = await resolve_org_slug(session, host)
                # An unsigned header in production is ignored: it never selects a tenant.
            if not org_slug:
                # Platform host (e-infak.org): a signed-in user works in their own organisation.
                org_slug = await self._slug_from_token(session, request)
            if not org_slug:
                if path in ORGLESS_PATHS:
                    return await call_next(request)
                return JSONResponse({"detail": "Organization not found"}, status_code=404)

            organization = (await session.execute(
                select(Organization).where(Organization.slug == org_slug, Organization.is_active.is_(True))
            )).scalar_one_or_none()
            if not organization:
                return JSONResponse({"detail": "Organization not found or inactive"}, status_code=404)

            request.state.organization_id = str(organization.id)
            request.state.organization_slug = org_slug
            request.state.organization = organization

        return await call_next(request)

    @staticmethod
    async def _slug_from_token(session, request: Request):
        from uuid import UUID

        from app.core.security import decode_token
        from app.models.user import User

        auth = request.headers.get("authorization", "")
        if not auth.lower().startswith("bearer "):
            return None
        payload = decode_token(auth[7:].strip())
        if not payload or payload.get("type", "access") != "access" or not payload.get("sub"):
            return None
        try:
            user_id = UUID(str(payload["sub"]))
        except ValueError:
            return None
        return (await session.execute(
            select(Organization.slug).join(User, User.organization_id == Organization.id)
            .where(User.id == user_id, User.is_active.is_(True))
        )).scalar_one_or_none()

    @staticmethod
    def _valid_proxy_signature(slug: str, request: Request) -> bool:
        """Accept tenant context from the web gateway, never from a browser."""
        timestamp = request.headers.get("x-einfak-tenant-timestamp", "")
        signature = request.headers.get("x-einfak-tenant-signature", "")
        try:
            issued_at = int(timestamp)
        except ValueError:
            return False
        if abs(time.time() - issued_at) > settings.TENANT_SIGNATURE_MAX_AGE_SECONDS:
            return False
        payload = f"{slug}:{timestamp}".encode("utf-8")
        expected = hmac.new(
            settings.TENANT_PROXY_SECRET.encode("utf-8"), payload, hashlib.sha256
        ).hexdigest()
        return bool(signature) and hmac.compare_digest(signature, expected)

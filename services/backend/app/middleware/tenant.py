from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import AsyncSessionLocal
from app.models.organization import Organization
from sqlalchemy import select


class TenantMiddleware(BaseHTTPMiddleware):
    """
    Multi-tenant middleware that extracts organization from hostname
    and sets it in request state for RLS (Row Level Security)
    """
    
    async def dispatch(self, request: Request, call_next):
        # Bypass health check and API documentation endpoints
        if request.url.path == "/health" or request.url.path in ["/docs", "/redoc", "/openapi.json"]:
            return await call_next(request)
            
        # Prefer an explicit x-organization-slug header (set by the Next.js
        # frontend after it resolves the tenant from the browser's Host header)
        # over re-deriving it from this request's own Host header, which is
        # almost always the internal API host (e.g. 127.0.0.1:8020) and would
        # otherwise always resolve to the dev default tenant.
        hostname = request.headers.get("host", "").split(":")[0].lower()
        hostname_org = await self.get_org_slug_from_hostname(hostname)
        if hostname in {
            "hicretdernegi.org", "www.hicretdernegi.org",
            "kardeslikpayi.org", "www.kardeslikpayi.org",
        } or hostname.endswith(".e-infak.org"):
            org_slug = hostname_org
        else:
            org_slug = request.headers.get("x-organization-slug") or hostname_org
        
        if not org_slug:
            raise HTTPException(status_code=404, detail="Organization not found")
        
        # Get organization from database
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Organization).where(
                    Organization.slug == org_slug,
                    Organization.is_active == True
                )
            )
            organization = result.scalar_one_or_none()
            
            if not organization:
                raise HTTPException(status_code=404, detail="Organization not found or inactive")
            
            # Set organization in request state
            request.state.organization_id = str(organization.id)
            request.state.organization_slug = org_slug
            request.state.organization = organization
        
        response = await call_next(request)
        return response
    
    async def get_org_slug_from_hostname(self, hostname: str) -> str:
        """
        Extract organization slug from hostname
        
        Examples:
        - hicretdernegi.org -> hicret-dernegi
        - kardeslikpayi.org -> kardeslik-payi
        - test.e-infak.org -> test
        - localhost -> hicret-dernegi (default for dev)
        """
        
        # Custom domain mapping
        domain_map = {
            "hicretdernegi.org": "hicret-dernegi",
            "www.hicretdernegi.org": "hicret-dernegi",
            "kardeslikpayi.org": "kardeslik-payi",
            "www.kardeslikpayi.org": "kardeslik-payi",
        }
        
        if hostname in domain_map:
            return domain_map[hostname]
        
        # Subdomain routing (*.e-infak.org)
        if hostname.endswith(".e-infak.org"):
            subdomain = hostname.split(".")[0]
            if subdomain not in ["www", "e-infak"]:
                return subdomain
        
        # Development default
        if hostname == "localhost" or hostname == "127.0.0.1":
            return "hicret-dernegi"
        
        return None

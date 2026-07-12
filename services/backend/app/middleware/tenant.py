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
            
        # Get hostname from request
        hostname = request.headers.get("host", "").split(":")[0]
        
        # Extract organization slug from hostname
        org_slug = await self.get_org_slug_from_hostname(hostname)
        
        if not org_slug:
            # For API routes, allow without organization (will be handled by endpoint)
            if request.url.path.startswith("/api/"):
                return await call_next(request)
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
        if "e-infak.org" in hostname:
            subdomain = hostname.split(".")[0]
            if subdomain not in ["www", "e-infak"]:
                return subdomain
        
        # Development default
        if "localhost" in hostname or "127.0.0.1" in hostname:
            return "hicret-dernegi"
        
        return None

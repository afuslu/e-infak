import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.middleware.tenant import TenantMiddleware
from app.api.v1 import campaigns, auth, donations, kurban, orphans, donor_portal, parent_portal, finance, admin_features, public_forms, checkout, reconciliation, bank_sync, staff, reports, cms, crm, sponsorship, field_ops, site, provider_accounts, platform, site_builder, media, poverty, receipt_books, data_tools, membership, accounting, inventory, sms, security, public_api, mobile, reminders, whatsapp, call_center, sms_donations, videos, campaign_tabs, mailing
from app.core.db import AsyncSessionLocal
from app.core.security import decode_token
from app.models.audit_log import AuditLog
from app.models.user import UserRole
from app.core.observability import configure_observability
from uuid import UUID

configure_observability()
logger = logging.getLogger(__name__)

_is_prod = settings.ENVIRONMENT == "production"
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    debug=settings.DEBUG,
    docs_url=None if _is_prod else "/docs",
    redoc_url=None if _is_prod else "/redoc",
    openapi_url=None if _is_prod else "/openapi.json",
)

# Multi-tenant middleware (added first so CORSMiddleware wraps outside it in LIFO order)
app.add_middleware(TenantMiddleware)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    if (
        request.method in {"POST", "PUT", "PATCH", "DELETE"}
        and request.url.path.startswith("/api/")
        and response.status_code < 400
        and getattr(request.state, "organization_id", None)
    ):
        user_id = None
        authorization = request.headers.get("authorization", "")
        if authorization.lower().startswith("bearer "):
            token_payload = decode_token(authorization.split(" ", 1)[1])
            if token_payload and token_payload.get("role") in {role.value for role in UserRole}:
                try:
                    user_id = UUID(token_payload["sub"])
                except (KeyError, TypeError, ValueError):
                    user_id = None
        try:
            async with AsyncSessionLocal() as audit_session:
                audit_session.add(AuditLog(
                    organization_id=UUID(request.state.organization_id),
                    user_id=user_id,
                    action=f"{request.method} {request.url.path}"[:100],
                    details={
                        "status_code": response.status_code,
                        "client_ip": request.client.host if request.client else None,
                    },
                ))
                await audit_session.commit()
        except Exception as exc:
            logger.warning("Audit log write failed for %s %s: %s", request.method, request.url.path, exc)
    response.headers["X-Content-Type-Options"] = "nosniff"
    # Payment hand-off pages set their own, narrower policy (provider form / frame hosts).
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers.setdefault("Content-Security-Policy", (
        "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; "
        "script-src 'self' 'unsafe-inline'; connect-src 'self' https://vpos.ziraatpay.com.tr "
        "https://test.ziraatpay.com.tr; frame-ancestors 'none'; base-uri 'self'; form-action 'self' "
        "https://vpos.ziraatpay.com.tr https://test.ziraatpay.com.tr"
    ))
    if settings.ENVIRONMENT == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# Include routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(campaigns.router, prefix="/api/v1")
app.include_router(donations.router, prefix="/api/v1")
app.include_router(kurban.router, prefix="/api/v1")
app.include_router(orphans.router, prefix="/api/v1")
app.include_router(donor_portal.router, prefix="/api/v1")
app.include_router(parent_portal.router, prefix="/api/v1")
app.include_router(finance.router, prefix="/api/v1")
# Before site.public_router: its /media/{org_id}/{name} would otherwise catch /media/video/{token}.
app.include_router(videos.public_router, prefix="/api/v1")
app.include_router(site.public_router, prefix="/api/v1")
app.include_router(site.admin_router, prefix="/api/v1")
app.include_router(media.router, prefix="/api/v1")
app.include_router(provider_accounts.router, prefix="/api/v1")
app.include_router(platform.router, prefix="/api/v1")
app.include_router(site_builder.admin_router, prefix="/api/v1")
app.include_router(site_builder.public_router, prefix="/api/v1")
app.include_router(staff.router, prefix="/api/v1")
app.include_router(cms.admin_router, prefix="/api/v1")
app.include_router(cms.public_router, prefix="/api/v1")
# Before crm: /donors/duplicates must not be captured by /donors/{donor_id}.
app.include_router(data_tools.router, prefix="/api/v1")
app.include_router(crm.router, prefix="/api/v1")
app.include_router(campaign_tabs.router, prefix="/api/v1")
app.include_router(mailing.router, prefix="/api/v1")
app.include_router(sms.router, prefix="/api/v1")
app.include_router(sms.public_router, prefix="/api/v1")
app.include_router(security.router, prefix="/api/v1")
app.include_router(sponsorship.router, prefix="/api/v1")
app.include_router(sponsorship.public_router, prefix="/api/v1")
app.include_router(field_ops.router, prefix="/api/v1")
app.include_router(poverty.router, prefix="/api/v1")
app.include_router(poverty.public_router, prefix="/api/v1")
app.include_router(receipt_books.router, prefix="/api/v1")
app.include_router(membership.router, prefix="/api/v1")
app.include_router(accounting.router, prefix="/api/v1")
app.include_router(inventory.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")
app.include_router(reminders.router, prefix="/api/v1")
app.include_router(admin_features.router, prefix="/api/v1")
app.include_router(public_forms.router, prefix="/api/v1")
app.include_router(checkout.router, prefix="/api/v1")
app.include_router(reconciliation.router, prefix="/api/v1")
app.include_router(bank_sync.router, prefix="/api/v1")
app.include_router(public_api.router, prefix="/api/v1")
app.include_router(mobile.router, prefix="/api/v1")
app.include_router(whatsapp.router, prefix="/api/v1")
app.include_router(whatsapp.hooks_router, prefix="/api/v1")
app.include_router(call_center.router, prefix="/api/v1")
app.include_router(call_center.hooks_router, prefix="/api/v1")
app.include_router(sms_donations.router, prefix="/api/v1")
app.include_router(sms_donations.hooks_router, prefix="/api/v1")
app.include_router(sms_donations.public_router, prefix="/api/v1")
app.include_router(videos.router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
    }


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "E-İnfak API v2.0",
        "docs": "/docs",
        "health": "/health",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )

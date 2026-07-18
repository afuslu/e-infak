from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.middleware.tenant import TenantMiddleware
from app.api.v1 import campaigns, auth, donations, kurban, orphans, donor_portal, parent_portal, finance, admin_features, public_forms, checkout, reconciliation
from app.core.db import AsyncSessionLocal
from app.core.security import decode_token
from app.models.audit_log import AuditLog
from app.models.user import UserRole
from uuid import UUID

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    debug=settings.DEBUG,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Multi-tenant middleware
app.add_middleware(TenantMiddleware)


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
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; "
        "script-src 'self' 'unsafe-inline'; connect-src 'self' https://vpos.ziraatpay.com.tr "
        "https://test.ziraatpay.com.tr; frame-ancestors 'none'; base-uri 'self'; form-action 'self' "
        "https://vpos.ziraatpay.com.tr https://test.ziraatpay.com.tr"
    )
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
app.include_router(admin_features.router, prefix="/api/v1")
app.include_router(public_forms.router, prefix="/api/v1")
app.include_router(checkout.router, prefix="/api/v1")
app.include_router(reconciliation.router, prefix="/api/v1")


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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.middleware.tenant import TenantMiddleware
from app.api.v1 import campaigns, auth, donations, kurban, orphans, donor_portal, parent_portal, finance, admin_features, public_forms

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

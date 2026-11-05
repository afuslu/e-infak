from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import Optional
import enum
from uuid import UUID
from app.core.db import get_db
from app.core.security import decode_token
from app.models.user import User, UserRole
from app.models.organization import Organization
from app.core.plans import Feature, org_has_feature, FEATURE_LABELS

security = HTTPBearer()


class Permission(str, enum.Enum):
    ADMIN_READ = "admin_read"
    DONOR_MANAGE = "donor_manage"
    CONTENT_MANAGE = "content_manage"
    OPERATIONS_MANAGE = "operations_manage"
    FINANCE_MANAGE = "finance_manage"
    SETTINGS_MANAGE = "settings_manage"
    USER_MANAGE = "user_manage"
    REPORT_READ = "report_read"


PERMISSION_LABELS = {
    Permission.ADMIN_READ: "Paneli görüntüleme",
    Permission.DONOR_MANAGE: "Bağışçı ve SMS yönetimi",
    Permission.CONTENT_MANAGE: "Kampanya ve içerik yönetimi",
    Permission.OPERATIONS_MANAGE: "Saha operasyonları (kurban, öğrenci, su kuyusu)",
    Permission.FINANCE_MANAGE: "Finans, ödeme ve mutabakat",
    Permission.SETTINGS_MANAGE: "Kurum ayarları ve entegrasyonlar",
    Permission.USER_MANAGE: "Personel, birim ve rol yönetimi",
    Permission.REPORT_READ: "Raporları görüntüleme",
}


ROLE_PERMISSIONS = {
    UserRole.PLATFORM_ADMIN: set(Permission),
    UserRole.STK_ADMIN: set(Permission),
    UserRole.MUHASEBE: {Permission.ADMIN_READ, Permission.FINANCE_MANAGE, Permission.REPORT_READ},
    UserRole.CRM: {Permission.ADMIN_READ, Permission.DONOR_MANAGE},
    UserRole.EDITOR: {Permission.ADMIN_READ, Permission.CONTENT_MANAGE},
    UserRole.OPERASYON: {Permission.ADMIN_READ, Permission.OPERATIONS_MANAGE},
    UserRole.READONLY: {Permission.ADMIN_READ},
}


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Get current authenticated user"""
    
    token = credentials.credentials
    payload = decode_token(token)
    
    if not payload or payload.get("type") != "access" or payload.get("scope") == "platform":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )
    
    result = await db.execute(
        select(User).options(selectinload(User.staff_role)).where(User.id == UUID(user_id))
    )
    user = result.scalar_one_or_none()
    
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    
    # Verify organization matches
    if hasattr(request.state, "organization_id"):
        if str(user.organization_id) != request.state.organization_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User does not belong to this organization",
            )
    
    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Get current active user"""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )
    return current_user


def effective_permissions(user: User) -> set[Permission]:
    """Built-in role matrix, replaced by the organization's custom role when assigned.

    The caller must have loaded `user.staff_role` (get_current_user does).
    """
    if user.role == UserRole.PLATFORM_ADMIN:
        return set(Permission)
    if user.staff_role_id:
        staff_role = user.__dict__.get("staff_role")
        if staff_role is None:
            # Not loaded: fail closed rather than fall back to the built-in role.
            return set()
        granted = set()
        for value in staff_role.permissions or []:
            try:
                granted.add(Permission(value))
            except ValueError:
                continue
        return granted
    return set(ROLE_PERMISSIONS.get(user.role, set()))


def has_permission(user: User, permission: Permission) -> bool:
    return permission in effective_permissions(user)


def require_role(*allowed_roles: UserRole):
    """Dependency to require specific user roles"""
    
    async def role_checker(
        current_user: User = Depends(get_current_active_user),
    ) -> User:
        if current_user.role not in allowed_roles and current_user.role != UserRole.PLATFORM_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required role: {', '.join(r.value for r in allowed_roles)}",
            )
        return current_user
    
    return role_checker


def require_permission(permission: Permission):
    """Central permission dependency used by every privileged mutation."""
    async def permission_checker(
        current_user: User = Depends(get_current_active_user),
    ) -> User:
        if not has_permission(current_user, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing permission: {permission.value}",
            )
        return current_user

    return permission_checker


async def require_admin_route_permission(
    request: Request,
    current_user: User = Depends(get_current_active_user),
) -> User:
    """Map privileged API paths to one centrally maintained permission matrix."""
    path = request.url.path
    if request.method == "GET":
        required = Permission.REPORT_READ if "/reports" in path else Permission.ADMIN_READ
    else:
        if "/tasks" in path:
            # Every staff member works on tasks; ownership is checked per task.
            required = Permission.ADMIN_READ
        elif any(part in path for part in ("/users", "/departments", "/staff-roles")):
            required = Permission.USER_MANAGE
        elif any(part in path for part in ("/finance", "/payments", "/reconciliation", "/bank-statements", "/zakat")):
            required = Permission.FINANCE_MANAGE
        elif any(part in path for part in ("/donations",)):
            required = Permission.FINANCE_MANAGE
        elif any(part in path for part in (
            "/campaigns", "/content-posts", "/banners", "/donation-categories", "/pages", "/menu", "/gallery",
        )):
            required = Permission.CONTENT_MANAGE
        elif any(part in path for part in ("/donors", "/sms", "/broadcast", "/volunteers", "/pledges")):
            required = Permission.DONOR_MANAGE
        elif any(part in path for part in (
            "/kurban", "/students", "/water-wells", "/orphans", "/beneficiaries",
            "/regions", "/money-boxes", "/aid-",
        )):
            required = Permission.OPERATIONS_MANAGE
        else:
            required = Permission.SETTINGS_MANAGE
    if not has_permission(current_user, required):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Missing permission: {required.value}",
        )
    return current_user


# Admin API path fragment -> module that must be part of the tenant's package.
ADMIN_ROUTE_FEATURES: tuple[tuple[str, Feature], ...] = (
    ("/kurban", Feature.KURBAN),
    ("/students", Feature.EDUCATION),
    ("/orphans", Feature.SPONSORSHIP),
    ("/water-wells", Feature.WATER_WELL),
    ("/subscriptions", Feature.RECURRING),
    ("/reconciliation", Feature.BANK_TRANSACTIONS),
    ("/bank-statements", Feature.BANK_TRANSACTIONS),
    ("/sms", Feature.SMS),
    ("/departments", Feature.ROLES),
    ("/content-posts", Feature.WEBSITE),
    ("/pages", Feature.WEBSITE),
    ("/menu", Feature.WEBSITE),
    ("/gallery", Feature.WEBSITE),
    ("/volunteers", Feature.WEBSITE),
    ("/donors", Feature.DONOR_CRM),
    ("/beneficiaries", Feature.SPONSORSHIP),
    ("/pledges", Feature.SPONSORSHIP),
    ("/money-boxes", Feature.MONEY_BOX),
    ("/aid-", Feature.FOOD_AID),
    ("/regions", Feature.MONEY_BOX),
    ("/tasks", Feature.TASKS),
    ("/staff-roles", Feature.ROLES),
)


def _feature_denied(feature: Feature) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "code": "feature_not_in_plan",
            "feature": feature.value,
            "message": f"{FEATURE_LABELS[feature]} modülü kurumunuzun paketinde yer almıyor",
        },
    )


def require_feature(feature: Feature):
    """Reject requests for modules outside the current tenant's package."""
    async def feature_checker(request: Request) -> None:
        organization = getattr(request.state, "organization", None)
        if organization is not None and not org_has_feature(organization, feature):
            raise _feature_denied(feature)

    return feature_checker


async def require_admin_route_feature(request: Request) -> None:
    organization = getattr(request.state, "organization", None)
    if organization is None:
        return
    path = request.url.path
    for fragment, feature in ADMIN_ROUTE_FEATURES:
        if fragment in path and not org_has_feature(organization, feature):
            raise _feature_denied(feature)


async def get_current_organization(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Organization:
    """Get current organization from request state"""
    
    if not hasattr(request.state, "organization_id"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization context not found",
        )
    
    result = await db.execute(
        select(Organization).where(Organization.id == UUID(request.state.organization_id))
    )
    organization = result.scalar_one_or_none()
    
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )
    
    return organization

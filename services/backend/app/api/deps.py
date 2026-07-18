from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
import enum
from uuid import UUID
from app.core.db import get_db
from app.core.security import decode_token
from app.models.user import User, UserRole
from app.models.organization import Organization

security = HTTPBearer()


class Permission(str, enum.Enum):
    ADMIN_READ = "admin_read"
    DONOR_MANAGE = "donor_manage"
    CONTENT_MANAGE = "content_manage"
    OPERATIONS_MANAGE = "operations_manage"
    FINANCE_MANAGE = "finance_manage"
    SETTINGS_MANAGE = "settings_manage"


ROLE_PERMISSIONS = {
    UserRole.PLATFORM_ADMIN: set(Permission),
    UserRole.STK_ADMIN: set(Permission),
    UserRole.MUHASEBE: {Permission.ADMIN_READ, Permission.FINANCE_MANAGE},
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
    
    if not payload or payload.get("type") != "access":
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
    
    result = await db.execute(select(User).where(User.id == UUID(user_id)))
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
        if permission not in ROLE_PERMISSIONS.get(current_user.role, set()):
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
    if request.method == "GET":
        required = Permission.ADMIN_READ
    else:
        path = request.url.path
        if any(part in path for part in ("/finance", "/payments", "/reconciliation", "/bank-statements", "/zakat")):
            required = Permission.FINANCE_MANAGE
        elif any(part in path for part in ("/campaigns", "/content-posts", "/banners", "/donation-categories")):
            required = Permission.CONTENT_MANAGE
        elif any(part in path for part in ("/donors", "/sms", "/broadcast")):
            required = Permission.DONOR_MANAGE
        elif any(part in path for part in ("/kurban", "/students", "/water-wells", "/orphans")):
            required = Permission.OPERATIONS_MANAGE
        else:
            required = Permission.SETTINGS_MANAGE
    if required not in ROLE_PERMISSIONS.get(current_user.role, set()):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Missing permission: {required.value}",
        )
    return current_user


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

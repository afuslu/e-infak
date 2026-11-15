from contextvars import ContextVar
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import Optional
import enum
from uuid import UUID
from app.core.db import get_db
from app.core.security import decode_token, password_fingerprint
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
    
    # Only staff session tokens: not platform, donor/parent portal or single-purpose (reset) tokens.
    if (not payload or payload.get("type") != "access" or payload.get("scope") == "platform"
            or payload.get("purpose") or payload.get("role") in ("donor", "parent")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Oturum geçersiz; lütfen yeniden giriş yapın",
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

    token_pwd = payload.get("pwd")
    if token_pwd and token_pwd != password_fingerprint(user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Şifreniz değiştirildiği için oturumunuz sonlandırıldı; lütfen yeniden giriş yapın",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Verify organization matches
    if hasattr(request.state, "organization_id"):
        if str(user.organization_id) != request.state.organization_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User does not belong to this organization",
            )

    from app.services.ip_rules import denial
    reason = await denial(db, user, request.client.host if request.client else None)
    if reason:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=reason)
    _viewer.set(user)
    return user


async def optional_staff(request: Request, db: AsyncSession) -> Optional[User]:
    """The signed-in staff member of this organisation, or None (public visitors, donors)."""
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    payload = decode_token(auth[7:].strip()) or {}
    if (payload.get("type") != "access" or payload.get("scope") == "platform" or payload.get("purpose")
            or payload.get("role") in ("donor", "parent") or not payload.get("sub")):
        return None
    try:
        user = await db.get(User, UUID(str(payload["sub"])))
    except ValueError:
        return None
    org_id = getattr(request.state, "organization_id", None)
    if not user or not user.is_active or (org_id and str(user.organization_id) != str(org_id)):
        return None
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
        from app.core import capabilities

        stored = list(staff_role.permissions or [])
        granted = set()
        for value in [*stored, *capabilities.permissions_of(set(stored))]:
            try:
                granted.add(Permission(value))
            except ValueError:
                continue
        return granted | ({Permission.ADMIN_READ} if granted else set())
    return set(ROLE_PERMISSIONS.get(user.role, set()))


def has_permission(user: User, permission: Permission) -> bool:
    return permission in effective_permissions(user)


def effective_capabilities(user: User) -> set[str]:
    """Fine-grained permissions (app.core.capabilities) of a staff member.

    Built-in roles get every capability of the modules their broad permissions open; a custom role
    gets exactly what was ticked (older roles that stored broad permissions get the whole module).
    """
    from app.core import capabilities

    if user.role in (UserRole.PLATFORM_ADMIN, UserRole.STK_ADMIN) and not user.staff_role_id:
        return set(capabilities.ALL)
    if user.staff_role_id:
        staff_role = user.__dict__.get("staff_role")
        return capabilities.expand(list(staff_role.permissions or [])) if staff_role is not None else set()
    return capabilities.expand([p.value for p in ROLE_PERMISSIONS.get(user.role, set())])


def has_capability(user: User, key: str) -> bool:
    return key in effective_capabilities(user)


def ensure_capability(user: User, key: str, message: str | None = None) -> None:
    if not has_capability(user, key):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=message or "Bu işlem için yetkiniz yok")


def require_capability(key: str):
    """Route dependency: the current staff member must have this capability."""
    async def checker(current_user: User = Depends(get_current_active_user)) -> User:
        ensure_capability(current_user, key)
        return current_user
    return checker


def can_see_donor(user: User, donor) -> bool:
    """donors.view_all, or the staff member represents this donor."""
    return donor.assigned_user_id == user.id or has_capability(user, "donors.view_all")


def ensure_donor_visible(user: User, donor) -> None:
    if not can_see_donor(user, donor):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bağışçı bulunamadı")


def can_see_receipt(user: User, donation) -> bool:
    """receipts.view_all, a receipt this staff member wrote, or one of a donor they represent."""
    if has_capability(user, "receipts.view_all") or donation.issued_by_id == user.id:
        return True
    donor = donation.__dict__.get("donor")
    return bool(donor is not None and donor.assigned_user_id == user.id)


def ensure_receipt_visible(user: User, donation) -> None:
    # Looks like it does not exist, as for donors.
    if not can_see_receipt(user, donation):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bağış bulunamadı")


# The staff member of the current request, so serializers deep in a module can mask phones without
# threading the user through every helper. Set by get_current_user (an async dependency, so it runs
# in the request's own context).
_viewer: ContextVar[Optional[User]] = ContextVar("einfak_viewer", default=None)


def masked(phone: str | None) -> str | None:
    """Donor phone as the current staff member may see it (unchanged outside a staff request)."""
    viewer = _viewer.get()
    return mask_phone(phone, viewer) if viewer is not None else phone


def require_any_capability(*keys: str):
    """Route dependency: at least one of these capabilities."""
    async def checker(current_user: User = Depends(get_current_active_user)) -> User:
        if not any(has_capability(current_user, key) for key in keys):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bu işlem için yetkiniz yok")
        return current_user
    return checker


def mask_phone(phone: str | None, user: User) -> str | None:
    """Phone as the staff member may see it: in full with donors.phone, else "0532 *** ** 12"."""
    if not phone or has_capability(user, "donors.phone"):
        return phone
    digits = "".join(ch for ch in str(phone) if ch.isdigit())
    if len(digits) < 7:
        return "*" * len(digits)
    head = digits[:-10] + digits[-10:-7] if len(digits) > 10 else digits[:-7]
    return f"{head[:-3] or ''}{head[-3:]} *** ** {digits[-2:]}".strip()


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


def module_groups(user: User, write: bool) -> set[str]:
    """Modules (capability groups) the staff member works in: those with at least one tick.

    The built-in read-only role reads every module except settings and staff management.
    """
    from app.core import capabilities

    groups = capabilities.groups_of(effective_capabilities(user))
    if not write and user.role == UserRole.READONLY and not user.staff_role_id:
        groups |= {g.key for g in capabilities.GROUPS} - capabilities.SENSITIVE
    return groups


def can_reach(user: User, path: str, write: bool) -> bool:
    from app.core import capabilities

    if user.role == UserRole.PLATFORM_ADMIN or (user.role == UserRole.STK_ADMIN and not user.staff_role_id):
        return True
    needed = capabilities.rule_for(path, write)
    return needed == capabilities.ANY or bool(module_groups(user, write) & needed)


def require_module(*groups: str, write: bool = True):
    """Route dependency for routers outside the central table: a tick in one of these modules."""
    async def checker(current_user: User = Depends(get_current_active_user)) -> User:
        if current_user.role == UserRole.PLATFORM_ADMIN or (
            current_user.role == UserRole.STK_ADMIN and not current_user.staff_role_id
        ):
            return current_user
        if not module_groups(current_user, write) & set(groups):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bu bölüm için yetkiniz yok")
        return current_user
    return checker


async def require_admin_route_permission(
    request: Request,
    current_user: User = Depends(get_current_active_user),
) -> User:
    """Central gate for admin paths: reads and writes both need the module (app.core.capabilities.ROUTE_RULES).

    Unknown paths need the settings module, so a new endpoint is closed until it is listed.
    """
    write = request.method not in ("GET", "HEAD", "OPTIONS")
    if not can_reach(current_user, request.url.path, write):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bu bölüm için yetkiniz yok")
    return current_user


# Admin API path fragment -> module that must be part of the tenant's package.
ADMIN_ROUTE_FEATURES: tuple[tuple[str, Feature | tuple[Feature, ...]], ...] = (
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
    ("/households", Feature.POVERTY_TRACKING),
    ("/receipt-books", Feature.RECEIPTS),
    ("/donations/import", Feature.RECEIPTS),
    ("/members", Feature.MEMBERSHIP),
    ("/member-dues", Feature.MEMBERSHIP),
    ("/admin-features/acc/", Feature.ACCOUNTING),
    # Regions are shared by money boxes, food aid and poverty tracking: any of them opens them.
    ("/regions", (Feature.MONEY_BOX, Feature.FOOD_AID, Feature.POVERTY_TRACKING)),
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
        options = feature if isinstance(feature, tuple) else (feature,)
        if fragment in path and not any(org_has_feature(organization, f) for f in options):
            raise _feature_denied(options[0])


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

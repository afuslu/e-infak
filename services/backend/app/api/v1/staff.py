"""Personel, birim, kuruma özel rol ve paket bilgisi.

Yetki yükseltmeyi önlemek için bir yönetici, kendisinde olmayan bir izni
başkasına veremez; kendi rolünü değiştiremez ve kendisinden daha yetkili
bir hesabı düzenleyemez.
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.capabilities import catalog as capability_catalog
from app.api.deps import (
    PERMISSION_LABELS,
    effective_capabilities,
    ROLE_PERMISSIONS,
    Permission,
    effective_permissions,
    get_current_user,
    require_admin_route_feature,
    require_admin_route_permission,
)
from app.core.db import get_db
from app.core.plans import (
    FEATURE_LABELS,
    PLAN_ADDONS,
    PLAN_FEATURES,
    PLAN_LABELS,
    PLAN_LIMITS,
    Feature,
    Plan,
    org_addons,
    org_bank_account_limit,
    org_features,
    org_plan,
    org_user_limit,
)
from app.core.security import get_password_hash
from app.models.audit_log import AuditLog
from app.models.automation import BankAccount
from app.models.organization import Organization
from app.models.staff import Department, StaffRole
from app.models.user import User, UserRole
from app.services import media as media_service, passwords

router = APIRouter(
    prefix="/admin-features",
    tags=["staff"],
    dependencies=[Depends(require_admin_route_permission), Depends(require_admin_route_feature)],
)

ROLE_LABELS = {
    UserRole.PLATFORM_ADMIN: "Sistem Yöneticisi",
    UserRole.STK_ADMIN: "Dernek Yöneticisi",
    UserRole.MUHASEBE: "Muhasebe / Sayman",
    UserRole.CRM: "CRM Temsilcisi",
    UserRole.EDITOR: "İçerik Editörü",
    UserRole.OPERASYON: "Saha Görevlisi",
    UserRole.READONLY: "Salt Okunur",
}


# --- Schemas ---------------------------------------------------------------

class DepartmentIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: Optional[str] = Field(default=None, max_length=500)


class DepartmentOut(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    user_count: int = 0


class StaffRoleIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: Optional[str] = Field(default=None, max_length=500)
    # Modules without ticks (reports-only roles etc.); with capabilities the modules follow from the ticks.
    permissions: List[Permission] = Field(default_factory=list)
    capabilities: List[str] = Field(default_factory=list)

    @field_validator("capabilities")
    @classmethod
    def known_capabilities(cls, value: List[str]) -> List[str]:
        from app.core.capabilities import ALL
        unknown = sorted(set(value) - ALL)
        if unknown:
            raise ValueError("Bilinmeyen yetki: " + ", ".join(unknown))
        return sorted(set(value))

    def stored(self) -> list[str]:
        """What StaffRole.permissions keeps: the ticks; a broad permission sent alone opens its whole module."""
        from app.core.capabilities import BY_PERMISSION, expand
        broad = [p.value for p in self.permissions if p.value not in BY_PERMISSION]
        return sorted(set(broad) | set(self.capabilities) | expand([p.value for p in self.permissions])
                      | {Permission.ADMIN_READ.value})

    @field_validator("permissions")
    @classmethod
    def unique_permissions(cls, value: List[Permission]) -> List[Permission]:
        # Every staff member needs read access to reach the panel at all.
        return sorted(set(value) | {Permission.ADMIN_READ}, key=lambda p: p.value)


class StaffRoleOut(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    permissions: List[str]
    capabilities: List[str] = []
    user_count: int = 0


class StaffUserCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=20)
    password: str = Field(min_length=10, max_length=128)
    role: UserRole = UserRole.READONLY
    department_id: Optional[UUID] = None
    staff_role_id: Optional[UUID] = None


class StaffUserUpdate(BaseModel):
    first_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    phone: Optional[str] = Field(default=None, max_length=20)
    role: Optional[UserRole] = None
    department_id: Optional[UUID] = None
    staff_role_id: Optional[UUID] = None
    clear_department: bool = False
    clear_staff_role: bool = False
    is_active: Optional[bool] = None


class PlanUpdate(BaseModel):
    plan: Plan
    enabled_addons: List[Feature] = []
    extra_user_seats: int = Field(default=0, ge=0, le=100)


# --- Helpers ---------------------------------------------------------------

def _org_id(request: Request) -> UUID:
    org_id = getattr(request.state, "organization_id", None)
    if not org_id:
        raise HTTPException(status_code=400, detail="Kurum bilgisi bulunamadı")
    return UUID(org_id)


async def _load_org(db: AsyncSession, org_id: UUID) -> Organization:
    org = (await db.execute(select(Organization).where(Organization.id == org_id))).scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Kurum bulunamadı")
    return org


def _ensure_grantable(actor: User, permissions: set[Permission]) -> None:
    missing = permissions - effective_permissions(actor)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sahip olmadığınız yetkileri veremezsiniz: " + ", ".join(sorted(p.value for p in missing)),
        )


def _ensure_role_assignable(actor: User, role: UserRole) -> None:
    if role == UserRole.PLATFORM_ADMIN and actor.role != UserRole.PLATFORM_ADMIN:
        raise HTTPException(status_code=403, detail="Sistem yöneticisi rolü atanamaz")
    _ensure_grantable(actor, ROLE_PERMISSIONS[role])


async def _active_seat_count(db: AsyncSession, org_id: UUID) -> int:
    return (await db.execute(
        select(func.count(User.id)).where(
            User.organization_id == org_id,
            User.is_active.is_(True),
            User.role != UserRole.PLATFORM_ADMIN,
        )
    )).scalar_one()


async def _ensure_seat_available(db: AsyncSession, org: Organization) -> None:
    limit = org_user_limit(org)
    if await _active_seat_count(db, org.id) >= limit:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "user_limit_reached",
                "limit": limit,
                "message": f"Paketinizdeki kullanıcı sınırına ({limit}) ulaşıldı. Ek kullanıcı tanımlatabilir veya paketinizi yükseltebilirsiniz.",
            },
        )


async def _get_department(db: AsyncSession, org_id: UUID, department_id: UUID) -> Department:
    dept = (await db.execute(
        select(Department).where(Department.id == department_id, Department.organization_id == org_id)
    )).scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Birim bulunamadı")
    return dept


async def _get_staff_role(db: AsyncSession, org_id: UUID, role_id: UUID) -> StaffRole:
    role = (await db.execute(
        select(StaffRole).where(StaffRole.id == role_id, StaffRole.organization_id == org_id)
    )).scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Rol bulunamadı")
    return role


def _role_permissions(role: StaffRole) -> set[Permission]:
    from app.core.capabilities import permissions_of
    granted = set()
    stored = list(role.permissions or [])
    for value in [*stored, *permissions_of(set(stored))]:
        try:
            granted.add(Permission(value))
        except ValueError:
            continue
    return granted


def _user_out(user: User) -> dict:
    return {
        "id": str(user.id),
        "first_name": user.first_name,
        "last_name": user.last_name,
        "email": user.email,
        "phone": user.phone,
        "role": user.role.value,
        "role_label": ROLE_LABELS.get(user.role, user.role.value),
        "department_id": str(user.department_id) if user.department_id else None,
        "department_name": user.department.name if user.department else None,
        "staff_role_id": str(user.staff_role_id) if user.staff_role_id else None,
        "staff_role_name": user.staff_role.name if user.staff_role else None,
        "permissions": sorted(p.value for p in effective_permissions(user)),
        "is_active": user.is_active,
        "last_login_at": user.last_login_at,
    }


def _audit(db: AsyncSession, org_id: UUID, actor: User, action: str, details: dict) -> None:
    db.add(AuditLog(organization_id=org_id, user_id=actor.id, action=action, details=details))


# --- Package / access ------------------------------------------------------

@router.get("/access")
async def get_access(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Paneli çizmek için: kurumun paketi, açık modüller, sınırlar ve kullanıcının izinleri."""
    org_id = _org_id(request)
    org = await _load_org(db, org_id)
    plan = org_plan(org)
    features = org_features(org)
    addons = org_addons(org)
    bank_count = (await db.execute(
        select(func.count(BankAccount.id)).where(
            BankAccount.organization_id == org_id,
            BankAccount.enabled.is_(True),
        )
    )).scalar_one()
    storage_info = await media_service.usage(db, org)
    return {
        "plan": plan.value,
        "plan_label": PLAN_LABELS[plan],
        "features": sorted(f.value for f in features),
        "addons": sorted(f.value for f in addons),
        "catalog": [
            {
                "key": f.value,
                "label": FEATURE_LABELS[f],
                "enabled": f in features,
                "in_plan": f in PLAN_FEATURES[plan],
                "addon_available": f in PLAN_ADDONS[plan],
            }
            for f in Feature
        ],
        "plans": [
            {
                "key": p.value,
                "label": PLAN_LABELS[p],
                "features": sorted(f.value for f in PLAN_FEATURES[p]),
                "addons": sorted(f.value for f in PLAN_ADDONS[p]),
                "users": PLAN_LIMITS[p]["users"],
                "bank_accounts": PLAN_LIMITS[p]["bank_accounts"],
                "storage_mb": PLAN_LIMITS[p]["storage_mb"],
            }
            for p in Plan
        ],
        "limits": {
            "users": org_user_limit(org),
            "extra_user_seats": org.extra_user_seats or 0,
            "bank_accounts": org_bank_account_limit(org),
            "storage_bytes": storage_info["quota_bytes"],
        },
        "usage": {
            "users": await _active_seat_count(db, org_id),
            "bank_accounts": bank_count,
            "storage_bytes": storage_info["used_bytes"],
            "media_count": storage_info["count"],
        },
        "me": {
            "id": str(current_user.id),
            "role": current_user.role.value,
            "is_platform_admin": current_user.role == UserRole.PLATFORM_ADMIN,
            "permissions": sorted(p.value for p in effective_permissions(current_user)),
            "capabilities": sorted(effective_capabilities(current_user)),
        },
        "permission_catalog": [{"key": p.value, "label": PERMISSION_LABELS[p]} for p in Permission],
        "capability_catalog": capability_catalog(),
        "builtin_roles": [
            {
                "key": r.value,
                "label": ROLE_LABELS[r],
                "permissions": sorted(p.value for p in ROLE_PERMISSIONS[r]),
            }
            for r in UserRole
            if r != UserRole.PLATFORM_ADMIN
        ],
    }


@router.put("/plan")
async def update_plan(
    request: Request,
    payload: PlanUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Paket değişikliği yalnız platform (E-İnfak) yöneticisi tarafından yapılır."""
    if current_user.role != UserRole.PLATFORM_ADMIN:
        raise HTTPException(status_code=403, detail="Paket değişikliği yalnız platform yöneticisi tarafından yapılabilir")
    org_id = _org_id(request)
    org = await _load_org(db, org_id)
    invalid = [f.value for f in payload.enabled_addons if f not in PLAN_ADDONS[payload.plan]]
    if invalid:
        raise HTTPException(status_code=422, detail=f"Bu pakette ek modül olarak açılamaz: {', '.join(invalid)}")
    old = {"plan": org.plan, "enabled_addons": org.enabled_addons, "extra_user_seats": org.extra_user_seats}
    org.plan = payload.plan.value
    org.enabled_addons = sorted({f.value for f in payload.enabled_addons})
    org.extra_user_seats = payload.extra_user_seats
    _audit(db, org_id, current_user, "paket_guncelle", {"old": old, "new": payload.model_dump(mode="json")})
    await db.commit()
    return {
        "plan": org.plan,
        "enabled_addons": org.enabled_addons,
        "extra_user_seats": org.extra_user_seats,
        "user_limit": org_user_limit(org),
    }


# --- Users -----------------------------------------------------------------

@router.get("/users")
async def list_staff_users(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    result = await db.execute(
        select(User)
        .options(selectinload(User.department), selectinload(User.staff_role))
        .where(User.organization_id == org_id)
        .order_by(User.first_name.asc())
    )
    return [_user_out(u) for u in result.scalars().all()]


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def create_staff_user(
    request: Request,
    payload: StaffUserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    org = await _load_org(db, org_id)
    _ensure_role_assignable(current_user, payload.role)
    staff_role = None
    if payload.staff_role_id:
        staff_role = await _get_staff_role(db, org_id, payload.staff_role_id)
        _ensure_grantable(current_user, _role_permissions(staff_role))
    if payload.department_id:
        await _get_department(db, org_id, payload.department_id)
    await _ensure_seat_available(db, org)

    email = payload.email.lower()
    if (await db.execute(select(User.id).where(func.lower(User.email) == email))).first():
        raise HTTPException(status_code=409, detail="Bu e-posta adresiyle kayıtlı bir hesap zaten var")

    user = User(
        organization_id=org_id,
        email=email,
        hashed_password=get_password_hash(payload.password),
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        phone=payload.phone,
        role=payload.role,
        department_id=payload.department_id,
        staff_role_id=payload.staff_role_id,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    _audit(db, org_id, current_user, "personel_olustur", {
        "target_user_id": str(user.id), "email": email, "role": payload.role.value,
        "staff_role_id": str(payload.staff_role_id) if payload.staff_role_id else None,
    })
    await db.commit()
    result = await db.execute(
        select(User).options(selectinload(User.department), selectinload(User.staff_role)).where(User.id == user.id)
    )
    return _user_out(result.scalar_one())


@router.put("/users/{user_id}")
async def update_staff_user(
    request: Request,
    user_id: UUID,
    payload: StaffUserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    result = await db.execute(
        select(User)
        .options(selectinload(User.department), selectinload(User.staff_role))
        .where(User.id == user_id, User.organization_id == org_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    if user.role == UserRole.PLATFORM_ADMIN and current_user.role != UserRole.PLATFORM_ADMIN:
        raise HTTPException(status_code=403, detail="Sistem yöneticisi hesabı düzenlenemez")
    # A manager may only edit accounts that are not more privileged than themselves.
    _ensure_grantable(current_user, effective_permissions(user))

    changes_access = (
        payload.role is not None or payload.staff_role_id is not None
        or payload.clear_staff_role or payload.is_active is False
    )
    if user.id == current_user.id and changes_access:
        raise HTTPException(status_code=403, detail="Kendi rolünüzü veya hesap durumunuzu değiştiremezsiniz")

    changes: dict = {}
    if payload.first_name is not None:
        user.first_name = payload.first_name.strip()
    if payload.last_name is not None:
        user.last_name = payload.last_name.strip()
    if payload.phone is not None:
        user.phone = payload.phone or None
    if payload.role is not None and payload.role != user.role:
        _ensure_role_assignable(current_user, payload.role)
        changes["role"] = {"old": user.role.value, "new": payload.role.value}
        user.role = payload.role
    if payload.clear_staff_role:
        if user.staff_role_id:
            changes["staff_role_id"] = {"old": str(user.staff_role_id), "new": None}
        user.staff_role_id = None
        user.staff_role = None
    elif payload.staff_role_id is not None and payload.staff_role_id != user.staff_role_id:
        staff_role = await _get_staff_role(db, org_id, payload.staff_role_id)
        _ensure_grantable(current_user, _role_permissions(staff_role))
        changes["staff_role_id"] = {"old": str(user.staff_role_id) if user.staff_role_id else None, "new": str(staff_role.id)}
        user.staff_role_id = staff_role.id
        user.staff_role = staff_role
    if payload.clear_department:
        user.department_id = None
        user.department = None
    elif payload.department_id is not None:
        user.department = await _get_department(db, org_id, payload.department_id)
        user.department_id = user.department.id
    if payload.is_active is not None and payload.is_active != user.is_active:
        if payload.is_active and user.role != UserRole.PLATFORM_ADMIN:
            await _ensure_seat_available(db, await _load_org(db, org_id))
        changes["is_active"] = {"old": user.is_active, "new": payload.is_active}
        user.is_active = payload.is_active

    _audit(db, org_id, current_user, "personel_guncelle", {"target_user_id": str(user.id), "email": user.email, **changes})
    await db.commit()
    return _user_out(user)


class StaffPasswordSet(BaseModel):
    password: str = Field(min_length=passwords.MIN_LENGTH, max_length=128)


@router.post("/users/{user_id}/password")
async def set_staff_password(
    request: Request,
    user_id: UUID,
    payload: StaffPasswordSet,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """A manager sets a staff member's password; that person is signed out everywhere."""
    org_id = _org_id(request)
    user = (await db.execute(
        select(User).options(selectinload(User.staff_role))
        .where(User.id == user_id, User.organization_id == org_id)
    )).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Kendi şifrenizi 'Şifremi değiştir' ekranından değiştirin")
    if user.role == UserRole.PLATFORM_ADMIN:
        raise HTTPException(status_code=403, detail="Sistem yöneticisi hesabı düzenlenemez")
    _ensure_grantable(current_user, effective_permissions(user))
    await passwords.set_password(db, user, payload.password)
    _audit(db, org_id, current_user, "personel_sifre_belirle", {"target_user_id": str(user.id), "email": user.email})
    await db.commit()
    return {"ok": True}


# --- Departments -----------------------------------------------------------

@router.get("/departments", response_model=List[DepartmentOut])
async def list_departments(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    counts = dict((await db.execute(
        select(User.department_id, func.count(User.id))
        .where(User.organization_id == org_id, User.department_id.is_not(None))
        .group_by(User.department_id)
    )).all())
    result = await db.execute(select(Department).where(Department.organization_id == org_id).order_by(Department.name))
    return [
        DepartmentOut(id=d.id, name=d.name, description=d.description, user_count=counts.get(d.id, 0))
        for d in result.scalars().all()
    ]


async def _ensure_unique_name(db: AsyncSession, model, org_id: UUID, name: str, exclude_id: UUID | None = None) -> None:
    query = select(model.id).where(model.organization_id == org_id, func.lower(model.name) == name.lower())
    if exclude_id:
        query = query.where(model.id != exclude_id)
    if (await db.execute(query)).first():
        raise HTTPException(status_code=409, detail="Bu isimde bir kayıt zaten var")


@router.post("/departments", response_model=DepartmentOut, status_code=status.HTTP_201_CREATED)
async def create_department(
    request: Request,
    payload: DepartmentIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    name = payload.name.strip()
    await _ensure_unique_name(db, Department, org_id, name)
    dept = Department(organization_id=org_id, name=name, description=payload.description)
    db.add(dept)
    await db.flush()
    _audit(db, org_id, current_user, "birim_olustur", {"department_id": str(dept.id), "name": name})
    await db.commit()
    return DepartmentOut(id=dept.id, name=dept.name, description=dept.description)


@router.put("/departments/{department_id}", response_model=DepartmentOut)
async def update_department(
    request: Request,
    department_id: UUID,
    payload: DepartmentIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    dept = await _get_department(db, org_id, department_id)
    name = payload.name.strip()
    await _ensure_unique_name(db, Department, org_id, name, exclude_id=dept.id)
    dept.name = name
    dept.description = payload.description
    _audit(db, org_id, current_user, "birim_guncelle", {"department_id": str(dept.id), "name": name})
    await db.commit()
    return DepartmentOut(id=dept.id, name=dept.name, description=dept.description)


@router.delete("/departments/{department_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_department(
    request: Request,
    department_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    dept = await _get_department(db, org_id, department_id)
    users = (await db.execute(select(User).where(User.department_id == dept.id))).scalars().all()
    for user in users:
        user.department_id = None
    _audit(db, org_id, current_user, "birim_sil", {"department_id": str(dept.id), "name": dept.name, "unassigned_users": len(users)})
    await db.delete(dept)
    await db.commit()


# --- Custom roles ----------------------------------------------------------

async def _role_user_counts(db: AsyncSession, org_id: UUID) -> dict:
    return dict((await db.execute(
        select(User.staff_role_id, func.count(User.id))
        .where(User.organization_id == org_id, User.staff_role_id.is_not(None))
        .group_by(User.staff_role_id)
    )).all())


def _role_out(role: StaffRole, user_count: int = 0) -> StaffRoleOut:
    from app.core.capabilities import expand, permissions_of
    stored = list(role.permissions or [])
    capabilities = expand(stored)
    broad = {v for v in stored if v in {p.value for p in Permission}} | permissions_of(capabilities)
    return StaffRoleOut(
        id=role.id, name=role.name, description=role.description,
        permissions=sorted(broad), capabilities=sorted(capabilities), user_count=user_count,
    )


def _ensure_capabilities_grantable(actor: User, wanted: set[str]) -> None:
    missing = wanted - effective_capabilities(actor)
    if missing:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Sahip olmadığınız yetkileri veremezsiniz: " + ", ".join(sorted(missing)))


@router.get("/staff-roles", response_model=List[StaffRoleOut])
async def list_staff_roles(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    counts = await _role_user_counts(db, org_id)
    result = await db.execute(select(StaffRole).where(StaffRole.organization_id == org_id).order_by(StaffRole.name))
    return [_role_out(r, counts.get(r.id, 0)) for r in result.scalars().all()]


@router.post("/staff-roles", response_model=StaffRoleOut, status_code=status.HTTP_201_CREATED)
async def create_staff_role(
    request: Request,
    payload: StaffRoleIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    from app.core.capabilities import permissions_of
    _ensure_grantable(current_user, set(payload.permissions) | {Permission(p) for p in permissions_of(set(payload.capabilities))})
    _ensure_capabilities_grantable(current_user, set(payload.capabilities))
    name = payload.name.strip()
    await _ensure_unique_name(db, StaffRole, org_id, name)
    role = StaffRole(
        organization_id=org_id, name=name, description=payload.description,
        permissions=payload.stored(),
    )
    db.add(role)
    await db.flush()
    _audit(db, org_id, current_user, "rol_olustur", {"staff_role_id": str(role.id), "name": name, "permissions": role.permissions})
    await db.commit()
    return _role_out(role)


@router.put("/staff-roles/{role_id}", response_model=StaffRoleOut)
async def update_staff_role(
    request: Request,
    role_id: UUID,
    payload: StaffRoleIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    role = await _get_staff_role(db, org_id, role_id)
    if current_user.staff_role_id == role.id and current_user.role != UserRole.PLATFORM_ADMIN:
        raise HTTPException(status_code=403, detail="Kendi rolünüzü düzenleyemezsiniz")
    from app.core.capabilities import expand, permissions_of
    _ensure_grantable(current_user, _role_permissions(role) | set(payload.permissions)
                      | {Permission(p) for p in permissions_of(set(payload.capabilities))})
    _ensure_capabilities_grantable(current_user, expand(list(role.permissions or [])) | set(payload.capabilities))
    name = payload.name.strip()
    await _ensure_unique_name(db, StaffRole, org_id, name, exclude_id=role.id)
    old_permissions = role.permissions
    role.name = name
    role.description = payload.description
    role.permissions = payload.stored()
    _audit(db, org_id, current_user, "rol_guncelle", {
        "staff_role_id": str(role.id), "name": name,
        "old_permissions": old_permissions, "new_permissions": role.permissions,
    })
    await db.commit()
    counts = await _role_user_counts(db, org_id)
    return _role_out(role, counts.get(role.id, 0))


@router.delete("/staff-roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_staff_role(
    request: Request,
    role_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    role = await _get_staff_role(db, org_id, role_id)
    _ensure_grantable(current_user, _role_permissions(role))
    # Removing an assigned role would silently fall back to each user's
    # built-in role, which may be broader; require explicit reassignment.
    assigned = (await _role_user_counts(db, org_id)).get(role.id, 0)
    if assigned:
        raise HTTPException(status_code=409, detail=f"Bu rol {assigned} personele atanmış. Önce personelin rolünü değiştirin.")
    _audit(db, org_id, current_user, "rol_sil", {"staff_role_id": str(role.id), "name": role.name})
    await db.delete(role)
    await db.commit()

"""Platform console API (e-infak.org/platform): organisations, plans, domains,
provider accounts and support sign-in. Only platform operators (PlatformUser,
tokens with scope="platform") can call it; organisation users never can."""
import secrets
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.api.v1.provider_accounts import _describe
from app.api.v1.site import site_url
from app.api.v1.staff import ROLE_LABELS
from app.core.config import settings
from app.core.db import get_db
from app.core.plans import FEATURE_LABELS, PLAN_ADDONS, PLAN_LABELS, Feature, Plan, org_user_limit
from app.core.rate_limit import rate_limit
from app.core.security import create_access_token, decode_token, get_password_hash, verify_password
from app.models.audit_log import AuditLog
from app.models.donation import Donation, DonationStatus
from app.models.organization import Organization, OrganizationDomain
from app.models.platform import DemoRequest, PlatformAuditLog, PlatformUser
from app.models.user import User, UserRole
from app.payments import PROVIDERS as PAYMENT_PROVIDERS, build_provider
from app.services import domains, passwords, platform_alerts
from app.services.site import DEFAULT_SECTIONS, TEMPLATES
from app.services.tenancy import RESERVED_SUBDOMAINS, forget_host, twin, valid_subdomain
from app.services.tenant_credentials import CredentialsUnavailable, get_credentials, save_credentials
from app.sms import PROVIDERS as SMS_PROVIDERS

router = APIRouter(prefix="/platform", tags=["platform"])
_bearer = HTTPBearer(auto_error=False)

PLATFORM_TOKEN_HOURS = 8
SUPPORT_TOKEN_MINUTES = 30


# --- Auth -----------------------------------------------------------------------

async def get_platform_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> PlatformUser:
    payload = decode_token(credentials.credentials) if credentials else None
    if not payload or payload.get("type") != "access" or payload.get("scope") != "platform":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Platform girişi gerekli",
                            headers={"WWW-Authenticate": "Bearer"})
    try:
        user = await db.get(PlatformUser, UUID(str(payload.get("sub"))))
    except ValueError:
        user = None
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Platform hesabı bulunamadı")
    return user


def _ip(request: Request) -> Optional[str]:
    return request.client.host if request.client else None


def _audit(db: AsyncSession, request: Request, operator: Optional[PlatformUser], action: str,
           organization_id: Optional[UUID] = None, **details) -> None:
    db.add(PlatformAuditLog(platform_user_id=operator.id if operator else None, organization_id=organization_id,
                            action=action, details=details, ip_address=_ip(request)))


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


@router.post("/auth/login", dependencies=[Depends(rate_limit("platform-login", limit=10, window_seconds=600))])
async def platform_login(payload: LoginIn, request: Request, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(
        select(PlatformUser).where(func.lower(PlatformUser.email) == str(payload.email).lower())
    )).scalar_one_or_none()
    if not user or not user.is_active or not verify_password(payload.password, user.hashed_password):
        _audit(db, request, None, "platform_giris_basarisiz", email=str(payload.email))
        await db.commit()
        raise HTTPException(status_code=401, detail="E-posta veya şifre hatalı")
    user.last_login_at = datetime.now(timezone.utc)
    _audit(db, request, user, "platform_giris")
    await db.commit()
    token = create_access_token({"sub": str(user.id), "scope": "platform"},
                                expires_delta=timedelta(hours=PLATFORM_TOKEN_HOURS))
    return {"access_token": token, "token_type": "bearer", "expires_in": PLATFORM_TOKEN_HOURS * 3600,
            "user": {"email": user.email, "full_name": user.full_name}}


@router.get("/me")
async def platform_me(operator: PlatformUser = Depends(get_platform_user)):
    return {"email": operator.email, "full_name": operator.full_name}


class PasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=12, max_length=200)


@router.post("/me/password")
async def change_password(payload: PasswordIn, request: Request, db: AsyncSession = Depends(get_db),
                          operator: PlatformUser = Depends(get_platform_user)):
    if not verify_password(payload.current_password, operator.hashed_password):
        raise HTTPException(status_code=400, detail="Mevcut şifre hatalı")
    operator.hashed_password = get_password_hash(payload.new_password)
    _audit(db, request, operator, "platform_sifre_degisti")
    await db.commit()
    return {"ok": True}


# --- Catalog --------------------------------------------------------------------

@router.get("/catalog")
async def catalog(_: PlatformUser = Depends(get_platform_user)):
    return {
        "plans": [{"key": p.value, "label": PLAN_LABELS[p],
                   "addons": sorted(f.value for f in PLAN_ADDONS[p])} for p in Plan],
        "features": {f.value: FEATURE_LABELS.get(f, f.value) for f in Feature},
        "templates": [{"key": k, "label": v} for k, v in TEMPLATES.items()],
        "base_domain": settings.PLATFORM_BASE_DOMAIN,
        "public_ip": settings.PLATFORM_PUBLIC_IP,
        "payment_providers": [{"key": k, "label": c.label} for k, c in PAYMENT_PROVIDERS.items()],
        "sms_providers": [{"key": k, "label": c.label} for k, c in SMS_PROVIDERS.items()],
        "roles": [{"key": r.value, "label": ROLE_LABELS[r]} for r in ASSIGNABLE_ROLES],
    }


# --- Organisations --------------------------------------------------------------

async def _org_or_404(db: AsyncSession, org_id: UUID) -> Organization:
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Kurum bulunamadı")
    return org


async def _org_out(db: AsyncSession, org: Organization, stats: Optional[dict] = None) -> dict:
    domain_rows = (await db.execute(
        select(OrganizationDomain).where(OrganizationDomain.organization_id == org.id).order_by(OrganizationDomain.domain)
    )).scalars().all()
    return {
        "id": str(org.id),
        "slug": org.slug,
        "name": org.name,
        "legal_name": org.legal_name,
        "email": org.email,
        "plan": org.plan,
        "plan_label": PLAN_LABELS.get(Plan(org.plan), org.plan) if org.plan in Plan._value2member_map_ else org.plan,
        "enabled_addons": org.enabled_addons or [],
        "extra_user_seats": org.extra_user_seats or 0,
        "user_limit": org_user_limit(org),
        "is_active": bool(org.is_active),
        "template": org.template,
        "subdomain": org.subdomain,
        "url": await site_url(db, org),
        "payment_provider": (org.settings or {}).get("payment_provider") or "ziraatpay",
        "sms_provider": (org.settings or {}).get("sms_provider") or "netgsm",
        "sms_platform_fallback": (org.settings or {}).get("sms_platform_fallback") is not False,
        "domains": [domains.domain_out(d) for d in domain_rows],
        "created_at": org.created_at.isoformat() if org.created_at else None,
        **(stats or {}),
    }


@router.get("/organizations")
async def list_organizations(db: AsyncSession = Depends(get_db), _: PlatformUser = Depends(get_platform_user)):
    orgs = (await db.execute(select(Organization).order_by(Organization.created_at.desc()))).scalars().all()
    users = dict((await db.execute(
        select(User.organization_id, func.count(User.id)).where(User.is_active.is_(True)).group_by(User.organization_id)
    )).all())
    donations = {row[0]: row for row in (await db.execute(
        select(Donation.organization_id, func.count(Donation.id), func.max(Donation.paid_at))
        .where(Donation.status == DonationStatus.CONFIRMED).group_by(Donation.organization_id)
    )).all()}
    out = []
    for org in orgs:
        _, count, last = donations.get(org.id, (None, 0, None))
        out.append(await _org_out(db, org, {
            "user_count": users.get(org.id, 0), "donation_count": count,
            "last_donation_at": last.isoformat() if last else None,
        }))
    return out


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    legal_name: Optional[str] = Field(default=None, max_length=200)
    subdomain: str = Field(min_length=2, max_length=63)
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=32)
    city: Optional[str] = Field(default=None, max_length=100)
    plan: Plan = Plan.BASLANGIC
    template: str = "sade"
    primary_color: str = Field(default="#059669", pattern=r"^#[0-9A-Fa-f]{6}$")
    accent_color: Optional[str] = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    admin_email: EmailStr
    admin_first_name: str = Field(min_length=1, max_length=100)
    admin_last_name: str = Field(default="", max_length=100)


@router.post("/organizations", status_code=201)
async def create_organization(payload: OrganizationCreate, request: Request, db: AsyncSession = Depends(get_db),
                              operator: PlatformUser = Depends(get_platform_user)):
    """New organisation with its site at <subdomain>.<base domain> and a first administrator.

    The administrator's temporary password is returned once and never stored in clear."""
    subdomain = payload.subdomain.strip().lower()
    if not valid_subdomain(subdomain) or subdomain in RESERVED_SUBDOMAINS:
        raise HTTPException(status_code=422, detail="Alt alan adı geçersiz veya ayrılmış")
    if payload.template not in TEMPLATES:
        raise HTTPException(status_code=422, detail="Bilinmeyen şablon")
    taken = (await db.execute(select(Organization.id).where(
        (Organization.slug == subdomain) | (Organization.subdomain == subdomain)
    ))).first()
    if taken:
        raise HTTPException(status_code=409, detail="Bu alt alan adı kullanılıyor")
    if (await db.execute(select(User.id).where(func.lower(User.email) == str(payload.admin_email).lower()))).first():
        raise HTTPException(status_code=409, detail="Bu yönetici e-postası başka bir kurumda kayıtlı")

    org = Organization(
        slug=subdomain, subdomain=subdomain, name=payload.name.strip(),
        legal_name=(payload.legal_name or payload.name).strip(), email=str(payload.email), phone=payload.phone,
        city=payload.city, primary_domain=f"{subdomain}.{settings.PLATFORM_BASE_DOMAIN}", plan=payload.plan.value,
        enabled_addons=[], extra_user_seats=0, is_active=True, template=payload.template,
        theme_primary_color=payload.primary_color.upper(),
        theme_accent_color=(payload.accent_color or payload.primary_color).upper(),
        site={"home_sections": list(DEFAULT_SECTIONS[payload.template]), "show_in_directory": True},
        settings={},
    )
    db.add(org)
    await db.flush()
    password = secrets.token_urlsafe(12)
    db.add(User(organization_id=org.id, email=str(payload.admin_email), hashed_password=get_password_hash(password),
                first_name=payload.admin_first_name.strip(), last_name=payload.admin_last_name.strip(),
                role=UserRole.STK_ADMIN, is_active=True, is_verified=True))
    _audit(db, request, operator, "kurum_olustur", org.id, subdomain=subdomain, plan=payload.plan.value,
           admin_email=str(payload.admin_email))
    await db.commit()
    await forget_host(f"{subdomain}.{settings.PLATFORM_BASE_DOMAIN}")
    domains.warm_certificates_soon([f"{subdomain}.{settings.PLATFORM_BASE_DOMAIN}"])
    return {
        "organization": await _org_out(db, org, {"user_count": 1, "donation_count": 0, "last_donation_at": None}),
        "admin": {"email": str(payload.admin_email), "temporary_password": password,
                  "login_url": f"{await site_url(db, org)}/giris"},
    }


@router.get("/organizations/{org_id}")
async def get_organization(org_id: UUID, db: AsyncSession = Depends(get_db),
                           _: PlatformUser = Depends(get_platform_user)):
    org = await _org_or_404(db, org_id)
    admins = (await db.execute(select(User).where(User.organization_id == org.id).order_by(User.created_at))).scalars().all()
    accounts = []
    try:
        for key in PAYMENT_PROVIDERS:
            stored = await get_credentials(db, org.id, key)
            accounts.append({**_describe(key, stored, build_provider(key, stored, tenant_slug=org.slug).configured),
                             "kind": "payment"})
        for key, cls in SMS_PROVIDERS.items():
            stored = await get_credentials(db, org.id, key)
            accounts.append({**_describe(key, stored, bool(stored) and cls(stored).configured), "kind": "sms"})
    except CredentialsUnavailable:
        accounts = []
    return {
        **await _org_out(db, org),
        "users": [{"id": str(u.id), "email": u.email, "name": u.full_name, "role": u.role.value if u.role else None,
                   "role_label": ROLE_LABELS.get(u.role, u.role.value) if u.role else None,
                   "is_active": u.is_active,
                   "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None} for u in admins],
        "provider_accounts": accounts,
    }


class OrganizationUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=200)
    plan: Optional[Plan] = None
    enabled_addons: Optional[List[Feature]] = None
    extra_user_seats: Optional[int] = Field(default=None, ge=0, le=100)
    is_active: Optional[bool] = None
    sms_platform_fallback: Optional[bool] = None
    payment_provider: Optional[str] = None
    sms_provider: Optional[str] = None


@router.patch("/organizations/{org_id}")
async def update_organization(org_id: UUID, payload: OrganizationUpdate, request: Request,
                              db: AsyncSession = Depends(get_db), operator: PlatformUser = Depends(get_platform_user)):
    org = await _org_or_404(db, org_id)
    changes = payload.model_dump(exclude_unset=True, mode="json")
    plan = payload.plan or Plan(org.plan)
    addons = payload.enabled_addons if payload.enabled_addons is not None else [
        Feature(a) for a in (org.enabled_addons or []) if a in Feature._value2member_map_]
    invalid = [f.value for f in addons if f not in PLAN_ADDONS[plan]]
    if invalid:
        raise HTTPException(status_code=422, detail=f"Bu pakette ek modül olarak açılamaz: {', '.join(invalid)}")
    if payload.name is not None:
        org.name = payload.name.strip()
    if payload.plan is not None or payload.enabled_addons is not None:
        org.plan = plan.value
        org.enabled_addons = sorted({f.value for f in addons})
    if payload.extra_user_seats is not None:
        org.extra_user_seats = payload.extra_user_seats
    if payload.is_active is not None:
        org.is_active = payload.is_active
    org_settings = dict(org.settings or {})
    if payload.sms_platform_fallback is not None:
        org_settings["sms_platform_fallback"] = payload.sms_platform_fallback
    if payload.payment_provider is not None:
        if payload.payment_provider not in PAYMENT_PROVIDERS:
            raise HTTPException(status_code=422, detail="Bilinmeyen ödeme sağlayıcısı")
        stored = await get_credentials(db, org.id, payload.payment_provider)
        if not build_provider(payload.payment_provider, stored, tenant_slug=org.slug).configured:
            raise HTTPException(status_code=422, detail="Önce bu sağlayıcının hesap bilgilerini kaydedin")
        org_settings["payment_provider"] = payload.payment_provider
    if payload.sms_provider is not None:
        if payload.sms_provider not in SMS_PROVIDERS:
            raise HTTPException(status_code=422, detail="Bilinmeyen SMS sağlayıcısı")
        org_settings["sms_provider"] = payload.sms_provider
    org.settings = org_settings
    flag_modified(org, "settings")
    action = "kurum_askiya_al" if payload.is_active is False else "kurum_aktif_et" if payload.is_active else "kurum_guncelle"
    _audit(db, request, operator, action, org.id, changes=changes)
    db.add(AuditLog(organization_id=org.id, user_id=None, action="platform_" + action,
                    details={"changes": changes, "by": operator.email}))
    await db.commit()
    # Suspension takes effect immediately on every host of the organisation.
    names = (await db.execute(select(OrganizationDomain.domain).where(OrganizationDomain.organization_id == org.id))).scalars().all()
    hosts = [f"{org.subdomain}.{settings.PLATFORM_BASE_DOMAIN}"] + [h for d in names for h in (d, twin(d))]
    await forget_host(*hosts)
    return await _org_out(db, org)


# --- Domains --------------------------------------------------------------------

class DomainIn(BaseModel):
    domain: str = Field(min_length=3, max_length=253)
    is_primary: bool = True


@router.post("/organizations/{org_id}/domains", status_code=201)
async def add_domain(org_id: UUID, payload: DomainIn, request: Request, db: AsyncSession = Depends(get_db),
                     operator: PlatformUser = Depends(get_platform_user)):
    org = await _org_or_404(db, org_id)
    try:
        row = await domains.add_domain(db, org.id, payload.domain)
    except domains.DomainError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    _audit(db, request, operator, "alan_adi_ekle", org.id, domain=row.domain)
    await db.commit()
    return domains.domain_out(row)


async def _domain_or_404(db: AsyncSession, org_id: UUID, domain_id: UUID) -> OrganizationDomain:
    row = await db.get(OrganizationDomain, domain_id)
    if not row or row.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Alan adı bulunamadı")
    return row


@router.post("/organizations/{org_id}/domains/{domain_id}/verify")
async def verify_domain(org_id: UUID, domain_id: UUID, request: Request, db: AsyncSession = Depends(get_db),
                        operator: PlatformUser = Depends(get_platform_user)):
    """Check the DNS records now; a pending domain goes live when they are right."""
    row = await _domain_or_404(db, org_id, domain_id)
    was_active = row.status == "active"
    result = await domains.verify(db, row)
    if result.ok and not was_active:
        _audit(db, request, operator, "alan_adi_dogrulandi", org_id, domain=row.domain)
        await db.commit()
        domains.warm_certificates_soon([row.domain, f"www.{row.domain}"])
    return domains.domain_out(row)


@router.post("/organizations/{org_id}/domains/{domain_id}/activate")
async def activate_domain(org_id: UUID, domain_id: UUID, request: Request, db: AsyncSession = Depends(get_db),
                          operator: PlatformUser = Depends(get_platform_user)):
    """Operator confirms the domain points here without the TXT record; it then serves
    the organisation's site and becomes eligible for a certificate."""
    row = await _domain_or_404(db, org_id, domain_id)
    await domains.activate(db, row)
    _audit(db, request, operator, "alan_adi_aktif", org_id, domain=row.domain)
    await db.commit()
    await forget_host(row.domain, twin(row.domain))
    domains.warm_certificates_soon([row.domain, f"www.{row.domain}"])
    return domains.domain_out(row)


@router.delete("/organizations/{org_id}/domains/{domain_id}")
async def remove_domain(org_id: UUID, domain_id: UUID, request: Request, db: AsyncSession = Depends(get_db),
                        operator: PlatformUser = Depends(get_platform_user)):
    row = await _domain_or_404(db, org_id, domain_id)
    domain = row.domain
    await db.delete(row)
    _audit(db, request, operator, "alan_adi_sil", org_id, domain=domain)
    await db.commit()
    await forget_host(domain, twin(domain))
    return {"ok": True}


# --- Provider accounts ----------------------------------------------------------

class CredentialsIn(BaseModel):
    values: dict[str, str] = Field(default_factory=dict)


@router.put("/organizations/{org_id}/provider-accounts/{provider}")
async def save_provider_account(org_id: UUID, provider: str, payload: CredentialsIn, request: Request,
                                db: AsyncSession = Depends(get_db), operator: PlatformUser = Depends(get_platform_user)):
    if provider not in PAYMENT_PROVIDERS and provider not in SMS_PROVIDERS:
        raise HTTPException(status_code=404, detail="Bilinmeyen sağlayıcı")
    org = await _org_or_404(db, org_id)
    try:
        stored = await save_credentials(db, org.id, provider, payload.values, actor=f"platform:{operator.email}")
    except CredentialsUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    _audit(db, request, operator, "entegrasyon_hesabi_guncelle", org.id, provider=provider, fields=sorted(stored))
    db.add(AuditLog(organization_id=org.id, user_id=None, action="platform_entegrasyon_hesabi_guncelle",
                    details={"provider": provider, "by": operator.email}))
    await db.commit()
    configured = (build_provider(provider, stored).configured if provider in PAYMENT_PROVIDERS
                  else SMS_PROVIDERS[provider](stored).configured)
    return _describe(provider, stored, configured)


# --- Support sign-in ------------------------------------------------------------

@router.get("/alerts")
async def list_alerts(org_id: Optional[UUID] = None, db: AsyncSession = Depends(get_db),
                      _: PlatformUser = Depends(get_platform_user)):
    return await platform_alerts.collect(db, org_id)


# --- Organisation users ----------------------------------------------------------

ASSIGNABLE_ROLES = [r for r in UserRole if r != UserRole.PLATFORM_ADMIN]


class OrgUserCreate(BaseModel):
    email: EmailStr
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(default="", max_length=100)
    role: UserRole = UserRole.EDITOR


class OrgUserUpdate(BaseModel):
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


def _check_role(role: Optional[UserRole]) -> None:
    if role == UserRole.PLATFORM_ADMIN:
        raise HTTPException(status_code=422, detail="Bu rol kurum kullanıcısına verilemez")


async def _org_user(db: AsyncSession, org: Organization, user_id: UUID) -> User:
    user = (await db.execute(select(User).where(User.id == user_id, User.organization_id == org.id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    return user


@router.post("/organizations/{org_id}/users", status_code=201)
async def create_org_user(org_id: UUID, payload: OrgUserCreate, request: Request, db: AsyncSession = Depends(get_db),
                          operator: PlatformUser = Depends(get_platform_user)):
    """Adds a staff account to the organisation within its package's user limit; the temporary
    password is returned once."""
    from app.api.v1.staff import _ensure_seat_available
    org = await _org_or_404(db, org_id)
    _check_role(payload.role)
    await _ensure_seat_available(db, org)
    email = str(payload.email).lower()
    if (await db.execute(select(User.id).where(func.lower(User.email) == email))).first():
        raise HTTPException(status_code=409, detail="Bu e-posta adresiyle kayıtlı bir hesap zaten var")
    password = passwords.temporary_password()
    user = User(organization_id=org.id, email=email, hashed_password=get_password_hash(password),
                first_name=payload.first_name.strip(), last_name=payload.last_name.strip(),
                role=payload.role, is_active=True, is_verified=True)
    db.add(user)
    await db.flush()
    _audit(db, request, operator, "kullanici_olustur", org.id, email=email, role=payload.role.value)
    db.add(AuditLog(organization_id=org.id, user_id=user.id, action="platform_personel_olustur",
                    details={"by": operator.email, "email": email, "role": payload.role.value}))
    await db.commit()
    return {"email": email, "temporary_password": password, "login_url": f"{await site_url(db, org)}/giris"}


@router.patch("/organizations/{org_id}/users/{user_id}")
async def update_org_user(org_id: UUID, user_id: UUID, payload: OrgUserUpdate, request: Request,
                          db: AsyncSession = Depends(get_db), operator: PlatformUser = Depends(get_platform_user)):
    from app.api.v1.staff import _ensure_seat_available
    org = await _org_or_404(db, org_id)
    user = await _org_user(db, org, user_id)
    _check_role(payload.role)
    if user.role == UserRole.PLATFORM_ADMIN:
        raise HTTPException(status_code=403, detail="Sistem yöneticisi hesabı buradan düzenlenemez")
    losing_admin = user.role == UserRole.STK_ADMIN and user.is_active and (
        payload.is_active is False or (payload.role is not None and payload.role != UserRole.STK_ADMIN))
    if losing_admin:
        others = (await db.execute(select(func.count(User.id)).where(
            User.organization_id == org.id, User.role == UserRole.STK_ADMIN, User.is_active.is_(True),
            User.id != user.id))).scalar_one()
        if not others:
            raise HTTPException(status_code=409, detail="Kurumun son aktif yöneticisi; önce başka bir yönetici atayın")
    changes: dict = {}
    if payload.role is not None and payload.role != user.role:
        changes["role"] = {"old": user.role.value, "new": payload.role.value}
        user.role = payload.role
    if payload.is_active is not None and payload.is_active != user.is_active:
        if payload.is_active:
            await _ensure_seat_available(db, org)
        changes["is_active"] = {"old": user.is_active, "new": payload.is_active}
        user.is_active = payload.is_active
        if not payload.is_active:
            await passwords.sign_out_everywhere(db, user)
    if changes:
        _audit(db, request, operator, "kullanici_guncelle", org.id, email=user.email, **changes)
        db.add(AuditLog(organization_id=org.id, user_id=user.id, action="platform_personel_guncelle",
                        details={"by": operator.email, "email": user.email, **changes}))
        await db.commit()
    return {"ok": True}


@router.post("/organizations/{org_id}/users/{user_id}/reset-password")
async def reset_user_password(org_id: UUID, user_id: UUID, request: Request, db: AsyncSession = Depends(get_db),
                              operator: PlatformUser = Depends(get_platform_user)):
    """New temporary password for one of the organisation's users, shown once and never stored in
    clear. The user is signed out everywhere; both audit logs record who did it."""
    org = await _org_or_404(db, org_id)
    user = (await db.execute(select(User).where(User.id == user_id, User.organization_id == org.id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    password = passwords.temporary_password()
    await passwords.set_password(db, user, password)
    _audit(db, request, operator, "kullanici_sifre_sifirla", org.id, email=user.email)
    db.add(AuditLog(organization_id=org.id, user_id=user.id, action="platform_sifre_sifirla",
                    details={"by": operator.email, "email": user.email}))
    await db.commit()
    return {"email": user.email, "temporary_password": password, "login_url": f"{await site_url(db, org)}/giris"}


@router.post("/organizations/{org_id}/support-session")
async def support_session(org_id: UUID, request: Request, db: AsyncSession = Depends(get_db),
                          operator: PlatformUser = Depends(get_platform_user)):
    """Short sign-in to the organisation's panel as its administrator, for support.

    Recorded in both the platform log and the organisation's own audit log."""
    org = await _org_or_404(db, org_id)
    if not org.is_active:
        raise HTTPException(status_code=409, detail="Askıdaki kurumun paneline girilemez")
    admin = (await db.execute(select(User).where(
        User.organization_id == org.id, User.role == UserRole.STK_ADMIN, User.is_active.is_(True),
    ).order_by(User.created_at).limit(1))).scalar_one_or_none()
    if not admin:
        raise HTTPException(status_code=409, detail="Kurumda aktif yönetici yok")
    token = create_access_token({"sub": str(admin.id), "imp": str(operator.id)},
                                expires_delta=timedelta(minutes=SUPPORT_TOKEN_MINUTES))
    _audit(db, request, operator, "destek_girisi", org.id, as_user=admin.email)
    db.add(AuditLog(organization_id=org.id, user_id=admin.id, action="platform_destek_girisi",
                    details={"by": operator.email, "minutes": SUPPORT_TOKEN_MINUTES}))
    await db.commit()
    # The token travels in the URL fragment: browsers never send it to a server or log it.
    return {"url": f"{await site_url(db, org)}/giris#destek={token}", "expires_in": SUPPORT_TOKEN_MINUTES * 60}


# --- Demo requests from the landing page ----------------------------------------

def _demo_row(r: DemoRequest) -> dict:
    return {"id": str(r.id), "name": r.name, "organization": r.organization, "phone": r.phone, "email": r.email,
            "plan": r.plan, "message": r.message, "status": r.status, "created_at": r.created_at.isoformat()}


@router.get("/demo-requests")
async def demo_requests(db: AsyncSession = Depends(get_db), _: PlatformUser = Depends(get_platform_user)):
    rows = (await db.execute(select(DemoRequest).order_by(DemoRequest.created_at.desc()).limit(300))).scalars().all()
    return [_demo_row(r) for r in rows]


class DemoStatusIn(BaseModel):
    status: str = Field(pattern="^(new|contacted|closed)$")


@router.patch("/demo-requests/{request_id}")
async def update_demo_request(request_id: UUID, payload: DemoStatusIn, db: AsyncSession = Depends(get_db),
                              _: PlatformUser = Depends(get_platform_user)):
    row = await db.get(DemoRequest, request_id)
    if not row:
        raise HTTPException(status_code=404, detail="Talep bulunamadı")
    row.status = payload.status
    await db.commit()
    return _demo_row(row)


# --- Audit ----------------------------------------------------------------------

@router.get("/audit")
async def audit_log(organization_id: Optional[UUID] = None, limit: int = 100, db: AsyncSession = Depends(get_db),
                    _: PlatformUser = Depends(get_platform_user)):
    query = select(PlatformAuditLog, PlatformUser.email, Organization.name).outerjoin(
        PlatformUser, PlatformUser.id == PlatformAuditLog.platform_user_id
    ).outerjoin(Organization, Organization.id == PlatformAuditLog.organization_id)
    if organization_id:
        query = query.where(PlatformAuditLog.organization_id == organization_id)
    rows = (await db.execute(query.order_by(PlatformAuditLog.created_at.desc()).limit(min(max(limit, 1), 500)))).all()
    return [{"id": str(log.id), "action": log.action, "operator": email, "organization": name,
             "details": log.details, "ip": log.ip_address, "created_at": log.created_at.isoformat()}
            for log, email, name in rows]

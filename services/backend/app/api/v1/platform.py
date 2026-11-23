"""Platform console API (e-infak.org/platform): organisations, plans, domains,
provider accounts and support sign-in. Only platform operators (PlatformUser,
tokens with scope="platform") can call it; organisation users never can."""
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import String, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.api.v1.provider_accounts import _describe
from app.api.v1.site import site_url
from app.api.v1.staff import ROLE_LABELS
from app.core.config import settings
from app.core.db import get_db
from app.core.plans import FEATURE_LABELS, PLAN_ADDONS, PLAN_LABELS, Feature, Plan, org_user_limit
from app.core.rate_limit import rate_limit
from app.core.security import create_access_token, decode_token, get_password_hash, password_fingerprint, verify_password
from app.models.audit_log import AuditLog
from app.models.campaign import Campaign, CampaignCategory, CampaignStatus
from app.models.donation import Donation, DonationStatus
from app.models.organization import Organization, OrganizationDomain
from app.models.platform import DemoRequest, PlatformAlertDismissal, PlatformAuditLog, PlatformBroadcast, PlatformPayment, PlatformUser, SupportTicket, SupportTicketMessage
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
# In-console simulation (same tab, platform host): longer, renewable from the banner.
SIMULATION_TOKEN_MINUTES = 60


# --- Auth -----------------------------------------------------------------------

PASSWORD_CHANGE_PATHS = ("/platform/me", "/platform/me/password")


def _ip(request: Request) -> Optional[str]:
    return request.client.host if request.client else None


def _check_platform_ip(request: Request) -> None:
    allowed = [ip.strip() for ip in (settings.PLATFORM_ALLOWED_IPS or "").split(",") if ip.strip()]
    if not allowed:
        return
    client_ip = _ip(request)
    if client_ip not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bu IP adresinden platform erişimi kısıtlı")


async def get_platform_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> PlatformUser:
    _check_platform_ip(request)
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
    token_pwd = payload.get("pwd")
    if token_pwd and token_pwd != password_fingerprint(user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Şifreniz değiştirildiği için platform oturumunuz sonlandırıldı; lütfen yeniden giriş yapın",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if user.must_change_password and not request.url.path.endswith(PASSWORD_CHANGE_PATHS):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="password_change_required")
    return user


def _audit(db: AsyncSession, request: Request, operator: Optional[PlatformUser], action: str,
           organization_id: Optional[UUID] = None, **details) -> None:
    db.add(PlatformAuditLog(platform_user_id=operator.id if operator else None, organization_id=organization_id,
                            action=action, details=details, ip_address=_ip(request)))


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)
    totp_code: Optional[str] = Field(default=None, max_length=12)


@router.post("/auth/login", dependencies=[Depends(rate_limit("platform-login", limit=10, window_seconds=600))])
async def platform_login(payload: LoginIn, request: Request, db: AsyncSession = Depends(get_db)):
    _check_platform_ip(request)
    user = (await db.execute(
        select(PlatformUser).where(func.lower(PlatformUser.email) == str(payload.email).lower())
    )).scalar_one_or_none()
    if not user or not user.is_active or not verify_password(payload.password, user.hashed_password):
        _audit(db, request, None, "platform_giris_basarisiz", email=str(payload.email))
        await db.commit()
        raise HTTPException(status_code=401, detail="E-posta veya şifre hatalı")
    if user.totp_enabled and user.totp_secret:
        if not payload.totp_code or not payload.totp_code.strip():
            raise HTTPException(status_code=401, detail="totp_required")
        from app.services.totp import verify_totp
        if not verify_totp(user.totp_secret, payload.totp_code.strip()):
            _audit(db, request, user, "platform_giris_basarisiz", email=user.email, reason="invalid_totp")
            await db.commit()
            raise HTTPException(status_code=401, detail="2FA doğrulama kodu geçersiz")
    user.last_login_at = datetime.now(timezone.utc)
    _audit(db, request, user, "platform_giris")
    await db.commit()
    token = create_access_token(
        {"sub": str(user.id), "scope": "platform", "pwd": password_fingerprint(user.hashed_password)},
        expires_delta=timedelta(hours=PLATFORM_TOKEN_HOURS),
    )
    return {"access_token": token, "token_type": "bearer", "expires_in": PLATFORM_TOKEN_HOURS * 3600,
            "user": {"email": user.email, "full_name": user.full_name,
                     "role": user.role or "admin",
                     "totp_enabled": bool(user.totp_enabled),
                     "must_change_password": user.must_change_password}}


@router.get("/me")
async def platform_me(operator: PlatformUser = Depends(get_platform_user)):
    return {"id": str(operator.id), "email": operator.email, "full_name": operator.full_name,
            "role": operator.role or "admin",
            "totp_enabled": bool(operator.totp_enabled),
            "must_change_password": operator.must_change_password}


class PlatformTotpCodeIn(BaseModel):
    code: str = Field(min_length=6, max_length=12)


@router.post("/me/2fa/setup")
async def platform_setup_2fa(db: AsyncSession = Depends(get_db), operator: PlatformUser = Depends(get_platform_user)):
    from app.services.totp import generate_secret, provisioning_uri

    secret = generate_secret()
    operator.totp_secret = secret
    operator.totp_enabled = False
    await db.commit()
    uri = provisioning_uri(secret, operator.email, issuer="E-Infak Platform")
    return {"secret": secret, "otpauth_uri": uri, "qr_svg": _qr_svg(uri), "enabled": False}


@router.post("/me/2fa/verify")
async def platform_verify_2fa(payload: PlatformTotpCodeIn, request: Request,
                              db: AsyncSession = Depends(get_db), operator: PlatformUser = Depends(get_platform_user)):
    from app.services.totp import verify_totp

    if not operator.totp_secret:
        raise HTTPException(status_code=400, detail="Önce 2FA kurulumunu başlatın")
    if not verify_totp(operator.totp_secret, payload.code.strip()):
        raise HTTPException(status_code=400, detail="Doğrulama kodu geçersiz")
    operator.totp_enabled = True
    _audit(db, request, operator, "platform_2fa_etkinlestirildi")
    await db.commit()
    return {"ok": True, "enabled": True}


@router.post("/me/2fa/disable")
async def platform_disable_2fa(payload: PlatformTotpCodeIn, request: Request,
                               db: AsyncSession = Depends(get_db), operator: PlatformUser = Depends(get_platform_user)):
    from app.services.totp import verify_totp

    if not operator.totp_enabled or not operator.totp_secret:
        return {"ok": True, "enabled": False}
    if not verify_totp(operator.totp_secret, payload.code.strip()):
        raise HTTPException(status_code=400, detail="Doğrulama kodu geçersiz")
    operator.totp_enabled = False
    operator.totp_secret = None
    _audit(db, request, operator, "platform_2fa_devre_disi")
    await db.commit()
    return {"ok": True, "enabled": False}


class PasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=passwords.MIN_LENGTH, max_length=200)


@router.post("/me/password")
async def change_password(payload: PasswordIn, request: Request, db: AsyncSession = Depends(get_db),
                          operator: PlatformUser = Depends(get_platform_user),
                          _: None = Depends(rate_limit("platform-password-change", limit=10, window_seconds=900))):
    if not verify_password(payload.current_password, operator.hashed_password):
        raise HTTPException(status_code=400, detail="Mevcut şifre hatalı")
    if payload.new_password == payload.current_password:
        raise HTTPException(status_code=400, detail="Yeni şifre eskisiyle aynı olamaz")
    operator.hashed_password = get_password_hash(payload.new_password)
    operator.must_change_password = False
    _audit(db, request, operator, "platform_sifre_degisti")
    await db.commit()
    new_token = create_access_token(
        {"sub": str(operator.id), "scope": "platform", "pwd": password_fingerprint(operator.hashed_password)},
        expires_delta=timedelta(hours=PLATFORM_TOKEN_HOURS),
    )
    return {"ok": True, "access_token": new_token}


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


async def _org_out(db: AsyncSession, org: Organization, stats: Optional[dict] = None,
                   domain_rows: Optional[list[OrganizationDomain]] = None) -> dict:
    if domain_rows is None:
        domain_rows = (await db.execute(
            select(OrganizationDomain).where(OrganizationDomain.organization_id == org.id).order_by(OrganizationDomain.domain)
        )).scalars().all()
    active_primary = next((d for d in domain_rows if d.status == "active" and d.is_primary), None) or next(
        (d for d in domain_rows if d.status == "active"), None
    )
    if active_primary:
        url = f"https://{active_primary.domain}"
    elif org.subdomain:
        url = f"https://{org.subdomain}.{settings.PLATFORM_BASE_DOMAIN}"
    else:
        url = await site_url(db, org)
    return {
        "id": str(org.id),
        "slug": org.slug,
        "name": org.name,
        "legal_name": org.legal_name,
        "email": org.email,
        "phone": org.phone,
        "city": org.city,
        "plan": org.plan,
        "plan_label": PLAN_LABELS.get(Plan(org.plan), org.plan) if org.plan in Plan._value2member_map_ else org.plan,
        "enabled_addons": org.enabled_addons or [],
        "extra_user_seats": org.extra_user_seats or 0,
        "user_limit": org_user_limit(org),
        "subscription_status": org.subscription_status or "active",
        "billing_cycle": org.billing_cycle or "monthly",
        "subscription_ends_at": org.subscription_ends_at.isoformat() if org.subscription_ends_at else None,
        "monthly_fee_cents": org.monthly_fee_cents or 0,
        "platform_notes": org.platform_notes,
        "is_active": bool(org.is_active),
        "template": org.template,
        "subdomain": org.subdomain,
        "url": url,
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
        select(User.organization_id, func.count(User.id))
        .where(User.is_active.is_(True), User.role != UserRole.PLATFORM_ADMIN)
        .group_by(User.organization_id)
    )).all())
    donations = {row[0]: row for row in (await db.execute(
        select(Donation.organization_id, func.count(Donation.id), func.max(Donation.paid_at))
        .where(Donation.status == DonationStatus.CONFIRMED).group_by(Donation.organization_id)
    )).all()}
    all_domains: dict[UUID, list[OrganizationDomain]] = {}
    for d in (await db.execute(select(OrganizationDomain).order_by(OrganizationDomain.domain))).scalars():
        all_domains.setdefault(d.organization_id, []).append(d)
    out = []
    for org in orgs:
        _, count, last = donations.get(org.id, (None, 0, None))
        out.append(await _org_out(db, org, {
            "user_count": users.get(org.id, 0), "donation_count": count,
            "last_donation_at": last.isoformat() if last else None,
        }, domain_rows=all_domains.get(org.id, [])))
    return out


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    legal_name: Optional[str] = Field(default=None, max_length=200)
    subdomain: str = Field(min_length=2, max_length=63)
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=20)
    city: Optional[str] = Field(default=None, max_length=100)
    plan: Plan = Plan.ILERI
    template: str = "sade"
    primary_color: str = Field(default="#059669", pattern=r"^#[0-9A-Fa-f]{6}$")
    accent_color: Optional[str] = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    admin_email: EmailStr
    admin_first_name: str = Field(min_length=1, max_length=100)
    admin_last_name: str = Field(default="", max_length=100)
    admin_password: Optional[str] = Field(default=None, min_length=6, max_length=128)
    admin_must_change_password: Optional[bool] = None
    tagline: Optional[str] = Field(default=None, max_length=200)
    seed_demo: bool = True
    demo_request_id: Optional[UUID] = None  # marks that landing-page request as converted


@router.post("/organizations", status_code=201)
async def create_organization(payload: OrganizationCreate, request: Request, db: AsyncSession = Depends(get_db),
                              operator: PlatformUser = Depends(get_platform_user)):
    """New organisation with its site at <subdomain>.<base domain> and a first administrator.

    The administrator's temporary password is returned once and never stored in clear."""
    _require_platform_admin(operator)
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
    admin_email = str(payload.admin_email).lower()
    if (await db.execute(select(User.id).where(func.lower(User.email) == admin_email))).first():
        raise HTTPException(status_code=409, detail="Bu yönetici e-postası başka bir kurumda kayıtlı")

    site_cfg: dict = {"home_sections": list(DEFAULT_SECTIONS[payload.template]), "show_in_directory": True}
    if payload.tagline and payload.tagline.strip():
        site_cfg["tagline"] = payload.tagline.strip()

    org = Organization(
        slug=subdomain, subdomain=subdomain, name=payload.name.strip(),
        legal_name=(payload.legal_name or payload.name).strip(), email=str(payload.email), phone=payload.phone,
        city=payload.city, primary_domain=f"{subdomain}.{settings.PLATFORM_BASE_DOMAIN}", plan=payload.plan.value,
        enabled_addons=[], extra_user_seats=0, is_active=True, template=payload.template,
        theme_primary_color=payload.primary_color.upper(),
        theme_accent_color=(payload.accent_color or payload.primary_color).upper(),
        site=site_cfg,
        settings={},
    )
    db.add(org)
    await db.flush()
    if payload.seed_demo:
        for slug, title, summary, cat, target, img, amounts in (
            ("acil-gida-kumanya", "Acil Gıda ve Kumanya Desteği",
             "İhtiyaç sahibi ailelerin bir aylık temel gıda ve mutfak ihtiyaçlarını karşılıyoruz.",
             CampaignCategory.GIDA, 25000000, "/demo/relief.webp", [25000, 50000, 100000, 250000]),
            ("temiz-su-kuyusu", "Temiz Su Kuyusu Projesi",
             "Susuzlukla mücadele eden bölgelerde kalıcı temiz su kuyuları açıyoruz.",
             CampaignCategory.SU, 50000000, "/demo/water.webp", [50000, 100000, 250000, 500000]),
            ("yetim-egitim-bursu", "Yetim Eğitim ve Kırtasiye Bursu",
             "Yetim öğrencilerimizin okul, kırtasiye ve aylık eğitim giderlerine destek oluyoruz.",
             CampaignCategory.YETIM, 18000000, "/demo/orphan.webp", [30000, 60000, 120000, 300000]),
        ):
            db.add(Campaign(
                organization_id=org.id, slug=slug, title=title, summary=summary,
                category=cat, status=CampaignStatus.ACTIVE, target_cents=target,
                currency="TRY", collected_cents=0, cover_image_url=img,
                suggested_amounts_cents=amounts,
            ))
    custom_pw = payload.admin_password.strip() if payload.admin_password else ""
    password = custom_pw or passwords.temporary_password()
    must_change = payload.admin_must_change_password if payload.admin_must_change_password is not None else (not bool(custom_pw))
    admin = User(organization_id=org.id, email=admin_email, hashed_password=get_password_hash(password),
                 first_name=payload.admin_first_name.strip(), last_name=payload.admin_last_name.strip(),
                 role=UserRole.STK_ADMIN, is_active=True, is_verified=True, must_change_password=must_change)
    db.add(admin)
    _audit(db, request, operator, "kurum_olustur", org.id, subdomain=subdomain, plan=payload.plan.value,
           admin_email=admin_email)
    if payload.demo_request_id:
        demo = await db.get(DemoRequest, payload.demo_request_id)
        if demo:
            demo.status = "converted"
    await db.commit()
    await forget_host(f"{subdomain}.{settings.PLATFORM_BASE_DOMAIN}")
    domains.warm_certificates_soon([f"{subdomain}.{settings.PLATFORM_BASE_DOMAIN}"])
    login_url = f"{await site_url(db, org)}/giris"
    email_sent = await passwords.send_credentials_email(admin, login_url, password, organization=org.name, welcome=True)
    return {
        "organization": await _org_out(db, org, {"user_count": 1, "donation_count": 0, "last_donation_at": None}),
        "admin": {"email": admin_email, "temporary_password": password, "login_url": login_url,
                  "email_sent": email_sent},
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
    legal_name: Optional[str] = Field(default=None, min_length=2, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, max_length=20)
    city: Optional[str] = Field(default=None, max_length=100)
    plan: Optional[Plan] = None
    enabled_addons: Optional[List[Feature]] = None
    extra_user_seats: Optional[int] = Field(default=None, ge=0, le=100)
    is_active: Optional[bool] = None
    sms_platform_fallback: Optional[bool] = None
    payment_provider: Optional[str] = None
    sms_provider: Optional[str] = None
    platform_notes: Optional[str] = Field(default=None, max_length=2000)


@router.patch("/organizations/{org_id}")
async def update_organization(org_id: UUID, payload: OrganizationUpdate, request: Request,
                              db: AsyncSession = Depends(get_db), operator: PlatformUser = Depends(get_platform_user)):
    _require_platform_admin(operator)
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
    if payload.legal_name is not None:
        org.legal_name = payload.legal_name.strip()
    if payload.email is not None:
        org.email = str(payload.email)
    if payload.phone is not None:
        org.phone = payload.phone.strip() or None
    if payload.city is not None:
        org.city = payload.city.strip() or None
    if payload.platform_notes is not None:
        org.platform_notes = payload.platform_notes.strip() or None
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
    _require_platform_admin(operator)
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
    _require_platform_admin(operator)
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
    _require_platform_admin(operator)
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
    _require_platform_admin(operator)
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
    configured = (build_provider(provider, stored, tenant_slug=org.slug).configured if provider in PAYMENT_PROVIDERS
                  else SMS_PROVIDERS[provider](stored).configured)
    return _describe(provider, stored, configured)


# --- Support sign-in ------------------------------------------------------------

@router.get("/alerts")
async def list_alerts(org_id: Optional[UUID] = None, db: AsyncSession = Depends(get_db),
                      _: PlatformUser = Depends(get_platform_user)):
    return await platform_alerts.collect(db, org_id)


# --- Organisation users ----------------------------------------------------------

ASSIGNABLE_ROLES = [r for r in UserRole if r != UserRole.PLATFORM_ADMIN]


def _qr_svg(data: str) -> str:
    """Render a self-contained SVG QR code using reportlab."""
    try:
        from reportlab.graphics import renderSVG
        from reportlab.graphics.barcode import qr
        from reportlab.graphics.shapes import Drawing

        widget = qr.QrCodeWidget(data)
        x0, y0, x1, y1 = widget.getBounds()
        w, h = max(x1 - x0, 1), max(y1 - y0, 1)
        size = 180
        d = Drawing(size, size, transform=[size / w, 0, 0, size / h, -x0 * size / w, -y0 * size / h])
        d.add(widget)
        return renderSVG.drawToString(d)
    except Exception:
        return ""


async def _send_setup_link_email(user: User, setup_url: str, org_name: str, expires_hours: int) -> bool:
    if not settings.SENDGRID_API_KEY:
        return False
    import asyncio
    from html import escape
    from app.tasks import send_email_task

    html = (
        f"<p>Merhaba {escape(user.first_name or user.email)},</p>"
        f"<p><b>{escape(org_name)}</b> E-İnfak yönetim paneli hesabınız için şifre belirleme bağlantınız hazırdır.</p>"
        f"<p><a href=\"{escape(setup_url)}\">Şifremi Belirle</a></p>"
        f"<p>Bu bağlantı {expires_hours} saat geçerlidir ve tek kullanımlıktır.</p>"
    )
    try:
        return bool(await asyncio.to_thread(send_email_task, user.email, f"{org_name} — E-İnfak Şifre Belirleme", html))
    except Exception:
        return False


async def _build_password_setup(db: AsyncSession, org: Organization, user: User, expires_hours: int = 24) -> dict:
    token = create_access_token(
        {"sub": str(user.id), "purpose": "password_reset", "fp": password_fingerprint(user.hashed_password)},
        expires_delta=timedelta(hours=expires_hours),
    )
    base = await site_url(db, org)
    setup_url = f"{base}/sifre-sifirla?token={token}"
    return {
        "setup_url": setup_url,
        "qr_svg": _qr_svg(setup_url),
        "expires_hours": expires_hours,
        "login_url": f"{base}/giris",
    }


class OrgUserCreate(BaseModel):
    email: EmailStr
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(default="", max_length=100)
    role: UserRole = UserRole.EDITOR
    password_mode: str = Field(default="temp", pattern="^(temp|custom|setup_link)$")
    custom_password: Optional[str] = Field(default=None, min_length=passwords.MIN_LENGTH, max_length=128)
    must_change_password: bool = True
    expires_hours: int = Field(default=24, ge=1, le=168)
    send_email: bool = True


class OrgUserUpdate(BaseModel):
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class OrgUserPasswordResetIn(BaseModel):
    mode: str = Field(default="temp", pattern="^(temp|custom|setup_link)$")
    custom_password: Optional[str] = Field(default=None, min_length=passwords.MIN_LENGTH, max_length=128)
    must_change_password: bool = True
    expires_hours: int = Field(default=24, ge=1, le=168)
    send_email: bool = True


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
    """Adds a staff account to the organisation within its package's user limit.
    Supports temporary password, custom password, or one-time QR/setup link."""
    from app.api.v1.staff import _ensure_seat_available
    org = await _org_or_404(db, org_id)
    _check_role(payload.role)
    await _ensure_seat_available(db, org)
    email = str(payload.email).lower()
    if (await db.execute(select(User.id).where(func.lower(User.email) == email))).first():
        raise HTTPException(status_code=409, detail="Bu e-posta adresiyle kayıtlı bir hesap zaten var")
    if payload.password_mode == "custom":
        if not payload.custom_password:
            raise HTTPException(status_code=422, detail="Özel şifre seçildiğinde şifre girilmelidir")
        raw_password = payload.custom_password
        must_change = payload.must_change_password
    else:
        raw_password = passwords.temporary_password()
        must_change = True
    user = User(organization_id=org.id, email=email, hashed_password=get_password_hash(raw_password),
                first_name=payload.first_name.strip(), last_name=payload.last_name.strip(),
                role=payload.role, is_active=True, is_verified=True, must_change_password=must_change)
    db.add(user)
    await db.flush()
    _audit(db, request, operator, "kullanici_olustur", org.id, email=email, role=payload.role.value, mode=payload.password_mode)
    db.add(AuditLog(organization_id=org.id, user_id=user.id, action="platform_personel_olustur",
                    details={"by": operator.email, "email": email, "role": payload.role.value, "mode": payload.password_mode}))
    await db.commit()
    setup = await _build_password_setup(db, org, user, payload.expires_hours)
    email_sent = False
    if payload.send_email:
        if payload.password_mode == "setup_link":
            email_sent = await _send_setup_link_email(user, setup["setup_url"], org.name, payload.expires_hours)
        else:
            email_sent = await passwords.send_credentials_email(user, setup["login_url"], raw_password, organization=org.name, welcome=True)
    return {
        "email": email,
        "mode": payload.password_mode,
        "temporary_password": None if payload.password_mode == "setup_link" else raw_password,
        "email_sent": email_sent,
        **setup,
    }


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
async def reset_user_password(org_id: UUID, user_id: UUID, request: Request,
                              body: Optional[OrgUserPasswordResetIn] = None,
                              db: AsyncSession = Depends(get_db),
                              operator: PlatformUser = Depends(get_platform_user)):
    """Reset or issue a password setup link/QR for one of the organisation's users.
    Supports `temp` (generated), `custom` (manual), and `setup_link` (QR + one-time link)."""
    body = body or OrgUserPasswordResetIn()
    org = await _org_or_404(db, org_id)
    user = await _org_user(db, org, user_id)
    if user.role == UserRole.PLATFORM_ADMIN:
        raise HTTPException(status_code=403, detail="Sistem yöneticisi şifresi buradan sıfırlanamaz")

    if body.mode == "setup_link":
        setup = await _build_password_setup(db, org, user, body.expires_hours)
        _audit(db, request, operator, "kullanici_sifre_sifirla", org.id, email=user.email, mode="setup_link")
        db.add(AuditLog(organization_id=org.id, user_id=user.id, action="platform_sifre_sifirla",
                        details={"by": operator.email, "email": user.email, "mode": "setup_link"}))
        await db.commit()
        email_sent = await _send_setup_link_email(user, setup["setup_url"], org.name, body.expires_hours) if body.send_email else False
        return {"email": user.email, "mode": "setup_link", "temporary_password": None, "email_sent": email_sent, **setup}

    if body.mode == "custom":
        if not body.custom_password:
            raise HTTPException(status_code=422, detail="Özel şifre girilmelidir")
        raw_password = body.custom_password
        must_change = body.must_change_password
    else:
        raw_password = passwords.temporary_password()
        must_change = True

    await passwords.set_password(db, user, raw_password)
    user.must_change_password = must_change
    _audit(db, request, operator, "kullanici_sifre_sifirla", org.id, email=user.email, mode=body.mode)
    db.add(AuditLog(organization_id=org.id, user_id=user.id, action="platform_sifre_sifirla",
                    details={"by": operator.email, "email": user.email, "mode": body.mode}))
    await db.commit()
    setup = await _build_password_setup(db, org, user, body.expires_hours)
    email_sent = (
        await passwords.send_credentials_email(user, setup["login_url"], raw_password, organization=org.name, welcome=False)
        if body.send_email else False
    )
    return {
        "email": user.email,
        "mode": body.mode,
        "temporary_password": raw_password,
        "email_sent": email_sent,
        **setup,
    }


class SupportSessionIn(BaseModel):
    # True: the console keeps the token and opens the panel in the same tab (simulation).
    inline: bool = False
    renew: bool = False


@router.post("/organizations/{org_id}/support-session")
async def support_session(org_id: UUID, request: Request, body: Optional[SupportSessionIn] = None,
                          db: AsyncSession = Depends(get_db),
                          operator: PlatformUser = Depends(get_platform_user)):
    """Short sign-in to the organisation's panel as its administrator, for support.

    `inline` returns the token itself so the platform console can simulate the
    organisation in place (E-Medrese style kurum seçici); otherwise a link that opens
    the panel on the organisation's own address. Recorded in both the platform log and
    the organisation's own audit log."""
    body = body or SupportSessionIn()
    org = await _org_or_404(db, org_id)
    if not org.is_active:
        raise HTTPException(status_code=409, detail="Askıdaki kurumun paneline girilemez")
    admin = (await db.execute(select(User).where(
        User.organization_id == org.id, User.role == UserRole.STK_ADMIN, User.is_active.is_(True),
    ).order_by(User.created_at).limit(1))).scalar_one_or_none()
    if not admin:
        raise HTTPException(status_code=409, detail="Kurumda aktif yönetici yok")
    minutes = SIMULATION_TOKEN_MINUTES if body.inline else SUPPORT_TOKEN_MINUTES
    token = create_access_token(
        {"sub": str(admin.id), "role": admin.role.value, "imp": str(operator.id), "org": str(org.id)},
        expires_delta=timedelta(minutes=minutes),
    )
    mode = "simulasyon" if body.inline else "yeni_sekme"
    _audit(db, request, operator, "destek_girisi", org.id, as_user=admin.email, mode=mode, renew=body.renew)
    if not body.renew:
        db.add(AuditLog(organization_id=org.id, user_id=admin.id, action="platform_destek_girisi",
                        details={"by": operator.email, "minutes": minutes, "mode": mode}))
    await db.commit()
    if body.inline:
        return {
            "token": token,
            "expires_in": minutes * 60,
            "organization": {"id": str(org.id), "name": org.name, "slug": org.slug},
            "as_user": {"email": admin.email, "name": admin.full_name},
        }
    # The token travels in the URL fragment: browsers never send it to a server or log it.
    return {"url": f"{await site_url(db, org)}/giris#destek={token}", "expires_in": minutes * 60}


# --- Demo requests from the landing page ----------------------------------------

def _demo_row(r: DemoRequest) -> dict:
    return {"id": str(r.id), "name": r.name, "organization": r.organization, "phone": r.phone, "email": r.email,
            "plan": r.plan, "message": r.message, "operator_notes": r.operator_notes,
            "status": r.status, "created_at": r.created_at.isoformat()}


@router.get("/demo-requests")
async def demo_requests(db: AsyncSession = Depends(get_db), _: PlatformUser = Depends(get_platform_user)):
    rows = (await db.execute(select(DemoRequest).order_by(DemoRequest.created_at.desc()).limit(300))).scalars().all()
    return [_demo_row(r) for r in rows]


class DemoStatusIn(BaseModel):
    status: Optional[str] = Field(default=None, pattern="^(new|contacted|converted|closed)$")
    operator_notes: Optional[str] = Field(default=None, max_length=1000)


@router.patch("/demo-requests/{request_id}")
async def update_demo_request(request_id: UUID, payload: DemoStatusIn, request: Request,
                              db: AsyncSession = Depends(get_db), operator: PlatformUser = Depends(get_platform_user)):
    row = await db.get(DemoRequest, request_id)
    if not row:
        raise HTTPException(status_code=404, detail="Talep bulunamadı")
    if payload.status is not None and row.status != payload.status:
        _audit(db, request, operator, "demo_talebi_durum", organization=row.organization,
               old=row.status, new=payload.status)
        row.status = payload.status
    if payload.operator_notes is not None:
        new_notes = payload.operator_notes.strip() or None
        if row.operator_notes != new_notes:
            row.operator_notes = new_notes
            _audit(db, request, operator, "demo_talebi_not", organization=row.organization)
    await db.commit()
    return _demo_row(row)


@router.delete("/demo-requests/{request_id}", status_code=204)
async def delete_demo_request(request_id: UUID, request: Request,
                              db: AsyncSession = Depends(get_db), operator: PlatformUser = Depends(get_platform_user)):
    _require_platform_admin(operator)
    row = await db.get(DemoRequest, request_id)
    if not row:
        raise HTTPException(status_code=404, detail="Talep bulunamadı")
    _audit(db, request, operator, "demo_talebi_silindi", organization=row.organization, phone=row.phone)
    await db.delete(row)
    await db.commit()


# --- Audit ----------------------------------------------------------------------

@router.get("/audit")
async def audit_log(organization_id: Optional[UUID] = None, action: Optional[str] = None, q: Optional[str] = None,
                    limit: int = 100, db: AsyncSession = Depends(get_db),
                    _: PlatformUser = Depends(get_platform_user)):
    query = select(PlatformAuditLog, PlatformUser.email, Organization.name).outerjoin(
        PlatformUser, PlatformUser.id == PlatformAuditLog.platform_user_id
    ).outerjoin(Organization, Organization.id == PlatformAuditLog.organization_id)
    if organization_id:
        query = query.where(PlatformAuditLog.organization_id == organization_id)
    if action:
        query = query.where(PlatformAuditLog.action == action)
    if q and q.strip():
        like = f"%{q.strip().lower()}%"
        query = query.where(func.lower(cast(PlatformAuditLog.details, String)).like(like)
                            | func.lower(func.coalesce(PlatformUser.email, "")).like(like))
    rows = (await db.execute(query.order_by(PlatformAuditLog.created_at.desc()).limit(min(max(limit, 1), 500)))).all()
    return [{"id": str(log.id), "action": log.action, "operator": email, "organization": name,
             "details": log.details, "ip": log.ip_address, "created_at": log.created_at.isoformat()}
            for log, email, name in rows]


# --- Subscriptions & SaaS Payments ----------------------------------------------

class SubscriptionIn(BaseModel):
    subscription_status: str = Field(pattern="^(trial|active|past_due|suspended)$")
    billing_cycle: str = Field(pattern="^(monthly|yearly)$")
    subscription_ends_at: Optional[datetime] = None
    monthly_fee_cents: int = Field(ge=0, le=100_000_000)


@router.patch("/organizations/{org_id}/subscription")
async def update_subscription(org_id: UUID, payload: SubscriptionIn, request: Request,
                              db: AsyncSession = Depends(get_db), operator: PlatformUser = Depends(get_platform_user)):
    _require_platform_admin(operator)
    org = await _org_or_404(db, org_id)
    org.subscription_status = payload.subscription_status
    org.billing_cycle = payload.billing_cycle
    org.subscription_ends_at = payload.subscription_ends_at
    org.monthly_fee_cents = payload.monthly_fee_cents
    _audit(db, request, operator, "abonelik_guncellendi", org.id,
           status=payload.subscription_status, cycle=payload.billing_cycle, fee_cents=payload.monthly_fee_cents)
    await db.commit()
    await db.refresh(org)
    return await _org_out(db, org)


class PaymentIn(BaseModel):
    amount_cents: int = Field(gt=0, le=100_000_000)
    period_label: str = Field(min_length=2, max_length=80)
    payment_method: str = Field(default="havale", pattern="^(havale|kart|nakit)$")
    notes: Optional[str] = Field(default=None, max_length=300)
    extend_days: int = Field(default=0, ge=0, le=366)


def _payment_out(p: PlatformPayment) -> dict:
    return {
        "id": str(p.id),
        "organization_id": str(p.organization_id),
        "amount_cents": p.amount_cents,
        "currency": p.currency,
        "period_label": p.period_label,
        "payment_method": p.payment_method,
        "status": p.status,
        "notes": p.notes,
        "paid_at": p.paid_at.isoformat() if p.paid_at else None,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


@router.get("/organizations/{org_id}/payments")
async def list_org_payments(org_id: UUID, db: AsyncSession = Depends(get_db),
                            _: PlatformUser = Depends(get_platform_user)):
    await _org_or_404(db, org_id)
    rows = (await db.execute(
        select(PlatformPayment).where(PlatformPayment.organization_id == org_id).order_by(PlatformPayment.paid_at.desc())
    )).scalars().all()
    return [_payment_out(p) for p in rows]


@router.post("/organizations/{org_id}/payments", status_code=201)
async def create_org_payment(org_id: UUID, payload: PaymentIn, request: Request,
                             db: AsyncSession = Depends(get_db), operator: PlatformUser = Depends(get_platform_user)):
    _require_platform_admin(operator)
    org = await _org_or_404(db, org_id)
    payment = PlatformPayment(
        organization_id=org.id,
        recorded_by_id=operator.id,
        amount_cents=payload.amount_cents,
        period_label=payload.period_label.strip(),
        payment_method=payload.payment_method,
        notes=payload.notes.strip() if payload.notes else None,
    )
    db.add(payment)
    if payload.extend_days > 0:
        base = org.subscription_ends_at if org.subscription_ends_at and org.subscription_ends_at > datetime.now(timezone.utc) else datetime.now(timezone.utc)
        org.subscription_ends_at = base + timedelta(days=payload.extend_days)
        org.subscription_status = "active"
    _audit(db, request, operator, "abonelik_tahsilati", org.id,
           amount_cents=payload.amount_cents, period=payload.period_label, extend_days=payload.extend_days)
    await db.commit()
    await db.refresh(payment)
    return _payment_out(payment)


class PaymentPatchIn(BaseModel):
    status: Optional[str] = Field(default=None, pattern="^(paid|pending|cancelled)$")
    notes: Optional[str] = Field(default=None, max_length=300)


@router.patch("/organizations/{org_id}/payments/{payment_id}")
async def update_org_payment(org_id: UUID, payment_id: UUID, payload: PaymentPatchIn, request: Request,
                             db: AsyncSession = Depends(get_db), operator: PlatformUser = Depends(get_platform_user)):
    _require_platform_admin(operator)
    await _org_or_404(db, org_id)
    p = (await db.execute(
        select(PlatformPayment).where(PlatformPayment.id == payment_id, PlatformPayment.organization_id == org_id)
    )).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Tahsilat kaydı bulunamadı")
    if payload.status is not None:
        p.status = payload.status
    if payload.notes is not None:
        p.notes = payload.notes.strip() or None
    _audit(db, request, operator, "abonelik_tahsilati_guncellendi", org_id,
           payment_id=str(p.id), status=p.status)
    await db.commit()
    await db.refresh(p)
    return _payment_out(p)


@router.delete("/organizations/{org_id}/payments/{payment_id}", status_code=204)
async def delete_org_payment(org_id: UUID, payment_id: UUID, request: Request,
                             db: AsyncSession = Depends(get_db), operator: PlatformUser = Depends(get_platform_user)):
    _require_platform_admin(operator)
    await _org_or_404(db, org_id)
    p = (await db.execute(
        select(PlatformPayment).where(PlatformPayment.id == payment_id, PlatformPayment.organization_id == org_id)
    )).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Tahsilat kaydı bulunamadı")
    _audit(db, request, operator, "abonelik_tahsilati_silindi", org_id,
           payment_id=str(p.id), amount_cents=p.amount_cents, period=p.period_label)
    await db.delete(p)
    await db.commit()


# --- Platform Operators ---------------------------------------------------------

def _require_platform_admin(operator: PlatformUser) -> None:
    if (operator.role or "admin") != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için tam yetkili platform yöneticisi olmalısınız")


def _operator_out(u: PlatformUser) -> dict:
    return {
        "id": str(u.id),
        "email": u.email,
        "full_name": u.full_name,
        "role": u.role or "admin",
        "is_active": bool(u.is_active),
        "must_change_password": bool(u.must_change_password),
        "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }


@router.get("/operators")
async def list_operators(db: AsyncSession = Depends(get_db), _: PlatformUser = Depends(get_platform_user)):
    rows = (await db.execute(select(PlatformUser).order_by(PlatformUser.created_at.asc()))).scalars().all()
    return [_operator_out(u) for u in rows]


class OperatorCreateIn(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=200)
    role: str = Field(default="support", pattern="^(admin|support)$")


@router.post("/operators", status_code=201)
async def create_operator(payload: OperatorCreateIn, request: Request,
                          db: AsyncSession = Depends(get_db), operator: PlatformUser = Depends(get_platform_user)):
    _require_platform_admin(operator)
    email = str(payload.email).strip().lower()
    exists = (await db.execute(select(PlatformUser.id).where(func.lower(PlatformUser.email) == email))).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="Bu e-posta ile kayıtlı bir platform operatörü zaten var")
    temp_password = passwords.temporary_password()
    user = PlatformUser(
        email=email,
        full_name=payload.full_name.strip(),
        role=payload.role,
        hashed_password=get_password_hash(temp_password),
        is_active=True,
        must_change_password=True,
    )
    db.add(user)
    _audit(db, request, operator, "operator_eklendi", email=email, role=payload.role)
    await db.commit()
    await db.refresh(user)
    return {"operator": _operator_out(user), "temporary_password": temp_password}


class OperatorPatchIn(BaseModel):
    is_active: Optional[bool] = None
    role: Optional[str] = Field(default=None, pattern="^(admin|support)$")


@router.patch("/operators/{user_id}")
async def update_operator(user_id: UUID, payload: OperatorPatchIn, request: Request,
                          db: AsyncSession = Depends(get_db), operator: PlatformUser = Depends(get_platform_user)):
    _require_platform_admin(operator)
    target = await db.get(PlatformUser, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Operatör bulunamadı")
    if target.id == operator.id and payload.is_active is False:
        raise HTTPException(status_code=400, detail="Kendi hesabınızı pasifleştiremezsiniz")
    if target.id == operator.id and payload.role is not None and payload.role != "admin":
        raise HTTPException(status_code=400, detail="Kendi yönetici yetkinizi kaldıramazsınız")
    losing_admin = (target.role or "admin") == "admin" and target.is_active and (
        payload.is_active is False or (payload.role is not None and payload.role != "admin")
    )
    if losing_admin:
        other_admins = (await db.execute(select(func.count(PlatformUser.id)).where(
            PlatformUser.is_active.is_(True),
            func.coalesce(PlatformUser.role, "admin") == "admin",
            PlatformUser.id != target.id,
        ))).scalar_one()
        if not other_admins:
            raise HTTPException(status_code=409, detail="Son aktif platform yöneticisi; önce başka bir yönetici atayın")
    if payload.is_active is not None:
        target.is_active = payload.is_active
    if payload.role is not None:
        target.role = payload.role
    _audit(db, request, operator, "operator_guncellendi", email=target.email, is_active=target.is_active, role=target.role)
    await db.commit()
    await db.refresh(target)
    return _operator_out(target)


@router.post("/operators/{user_id}/reset-password")
async def reset_operator_password(user_id: UUID, request: Request,
                                  db: AsyncSession = Depends(get_db), operator: PlatformUser = Depends(get_platform_user)):
    _require_platform_admin(operator)
    target = await db.get(PlatformUser, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Operatör bulunamadı")
    temp_password = passwords.temporary_password()
    target.hashed_password = get_password_hash(temp_password)
    target.must_change_password = True
    _audit(db, request, operator, "operator_sifre_sifirlandi", email=target.email)
    await db.commit()
    return {"email": target.email, "temporary_password": temp_password}


# --- Metrics & Telemetry --------------------------------------------------------

@router.get("/metrics")
async def platform_metrics(db: AsyncSession = Depends(get_db), _: PlatformUser = Depends(get_platform_user)):
    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    orgs = (await db.execute(select(Organization))).scalars().all()
    mrr_cents = sum(
        (o.monthly_fee_cents or 0)
        for o in orgs
        if o.is_active and (o.subscription_status or "active") == "active"
    )
    status_counts = {"active": 0, "trial": 0, "past_due": 0, "suspended": 0}
    for o in orgs:
        st = o.subscription_status or "active"
        if not o.is_active:
            st = "suspended"
        status_counts[st] = status_counts.get(st, 0) + 1

    paid_30d_row = (await db.execute(
        select(func.count(Donation.id), func.coalesce(func.sum(Donation.amount_cents), 0)).where(
            Donation.status == DonationStatus.CONFIRMED,
            Donation.paid_at >= thirty_days_ago,
            func.coalesce(Donation.currency, "TRY") == "TRY",
        )
    )).one()
    failed_30d = (await db.execute(
        select(func.count(Donation.id)).where(
            Donation.status == DonationStatus.FAILED,
            Donation.created_at >= thirty_days_ago,
        )
    )).scalar_one()

    saas_collected_month = (await db.execute(
        select(func.coalesce(func.sum(PlatformPayment.amount_cents), 0)).where(
            PlatformPayment.status == "paid",
            PlatformPayment.paid_at >= month_start,
        )
    )).scalar_one()

    # 6-month donation trend across all tenants (TRY)
    six_months_ago = (now - timedelta(days=180)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_expr = func.date_trunc("month", Donation.paid_at)
    trend_rows = (await db.execute(
        select(month_expr.label("m"), func.count(Donation.id), func.coalesce(func.sum(Donation.amount_cents), 0))
        .where(
            Donation.status == DonationStatus.CONFIRMED,
            Donation.paid_at.isnot(None),
            Donation.paid_at >= six_months_ago,
            func.coalesce(Donation.currency, "TRY") == "TRY",
        )
        .group_by(month_expr)
        .order_by(month_expr)
    )).all()
    trends = [
        {"month": row[0].strftime("%Y-%m"), "count": int(row[1]), "total_cents": int(row[2] or 0)}
        for row in trend_rows if row[0] is not None
    ]

    user_counts = dict((await db.execute(
        select(User.organization_id, func.count(User.id))
        .where(User.is_active.is_(True), User.role != UserRole.PLATFORM_ADMIN)
        .group_by(User.organization_id)
    )).all())
    org_30d = {
        oid: (int(cnt), int(tot or 0))
        for oid, cnt, tot in (await db.execute(
            select(Donation.organization_id, func.count(Donation.id), func.coalesce(func.sum(Donation.amount_cents), 0))
            .where(
                Donation.status == DonationStatus.CONFIRMED,
                Donation.paid_at >= thirty_days_ago,
                func.coalesce(Donation.currency, "TRY") == "TRY",
            )
            .group_by(Donation.organization_id)
        )).all()
    }
    org_usage = []
    for o in orgs:
        limit = org_user_limit(o)
        used = int(user_counts.get(o.id, 0))
        d30_cnt, d30_cents = org_30d.get(o.id, (0, 0))
        org_usage.append({
            "id": str(o.id),
            "name": o.name,
            "plan": o.plan,
            "subscription_status": o.subscription_status or "active",
            "subscription_ends_at": o.subscription_ends_at.isoformat() if o.subscription_ends_at else None,
            "monthly_fee_cents": o.monthly_fee_cents or 0,
            "users_used": used,
            "users_limit": limit,
            "quota_pct": round((used / limit) * 100) if limit > 0 else 0,
            "donations_30d_count": d30_cnt,
            "donations_30d_cents": d30_cents,
        })
    org_usage.sort(key=lambda x: (x["donations_30d_cents"], x["quota_pct"]), reverse=True)

    plan_counts = {"baslangic": 0, "orta": 0, "ileri": 0}
    total_extra_seats = 0
    for o in orgs:
        plan_counts[o.plan] = plan_counts.get(o.plan, 0) + 1
        total_extra_seats += int(o.extra_user_seats or 0)

    return {
        "total_orgs": len(orgs),
        "status_counts": status_counts,
        "plan_counts": plan_counts,
        "total_extra_seats": total_extra_seats,
        "mrr_cents": int(mrr_cents),
        "saas_collected_month_cents": int(saas_collected_month or 0),
        "donations_30d_count": int(paid_30d_row[0] or 0),
        "donations_30d_cents": int(paid_30d_row[1] or 0),
        "failed_donations_30d": int(failed_30d or 0),
        "trends": trends,
        "org_usage": org_usage,
    }


@router.get("/health")
async def platform_health(db: AsyncSession = Depends(get_db), _: PlatformUser = Depends(get_platform_user)):
    import time
    from sqlalchemy import text
    from app.models.sms_message import SmsMessage

    t0 = time.perf_counter()
    await db.execute(text("SELECT 1"))
    db_ms = round((time.perf_counter() - t0) * 1000, 1)

    redis_ok = False
    try:
        import redis.asyncio as aioredis
        client = aioredis.from_url(settings.REDIS_URL, socket_connect_timeout=1.5)
        redis_ok = bool(await client.ping())
        await client.aclose()
    except Exception:
        redis_ok = False

    since_24h = datetime.now(timezone.utc) - timedelta(hours=24)
    sms_failed_24h = (await db.execute(
        select(func.count(SmsMessage.id)).where(
            SmsMessage.status == "failed",
            SmsMessage.created_at >= since_24h,
        )
    )).scalar_one()

    db_size_bytes = (await db.execute(text("SELECT pg_database_size(current_database())"))).scalar_one()

    return {
        "db_ok": True,
        "db_ms": db_ms,
        "db_size_mb": round((db_size_bytes or 0) / (1024 * 1024), 1),
        "redis_ok": redis_ok,
        "sms_failed_24h": int(sms_failed_24h or 0),
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


# --- System Broadcasts / Maintenance Notices ------------------------------------

class BroadcastIn(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    message: str = Field(min_length=2, max_length=2000)
    level: str = Field(default="info", pattern="^(info|warning|danger)$")
    maintenance_mode: bool = False


def _broadcast_out(b: PlatformBroadcast) -> dict:
    return {
        "id": str(b.id),
        "title": b.title,
        "message": b.message,
        "level": b.level,
        "is_active": bool(b.is_active),
        "maintenance_mode": bool(b.maintenance_mode),
        "created_at": b.created_at.isoformat() if b.created_at else None,
    }


@router.get("/broadcasts")
async def list_broadcasts(db: AsyncSession = Depends(get_db), _: PlatformUser = Depends(get_platform_user)):
    rows = (await db.execute(select(PlatformBroadcast).order_by(PlatformBroadcast.created_at.desc()).limit(50))).scalars().all()
    return [_broadcast_out(b) for b in rows]


@router.post("/broadcasts", status_code=201)
async def create_broadcast(payload: BroadcastIn, request: Request,
                           db: AsyncSession = Depends(get_db), operator: PlatformUser = Depends(get_platform_user)):
    _require_platform_admin(operator)
    b = PlatformBroadcast(
        created_by_id=operator.id,
        title=payload.title.strip(),
        message=payload.message.strip(),
        level=payload.level,
        maintenance_mode=payload.maintenance_mode,
        is_active=True,
    )
    db.add(b)
    _audit(db, request, operator, "sistem_duyurusu_eklendi", title=b.title, level=b.level, maintenance=b.maintenance_mode)
    await db.commit()
    await db.refresh(b)
    return _broadcast_out(b)


class BroadcastPatchIn(BaseModel):
    is_active: bool


@router.patch("/broadcasts/{broadcast_id}")
async def toggle_broadcast(broadcast_id: UUID, payload: BroadcastPatchIn, request: Request,
                           db: AsyncSession = Depends(get_db), operator: PlatformUser = Depends(get_platform_user)):
    _require_platform_admin(operator)
    b = await db.get(PlatformBroadcast, broadcast_id)
    if not b:
        raise HTTPException(status_code=404, detail="Duyuru bulunamadı")
    b.is_active = payload.is_active
    _audit(db, request, operator, "sistem_duyurusu_guncellendi", title=b.title, is_active=b.is_active)
    await db.commit()
    await db.refresh(b)
    return _broadcast_out(b)


@router.delete("/broadcasts/{broadcast_id}", status_code=204)
async def delete_broadcast(broadcast_id: UUID, request: Request,
                           db: AsyncSession = Depends(get_db), operator: PlatformUser = Depends(get_platform_user)):
    _require_platform_admin(operator)
    b = await db.get(PlatformBroadcast, broadcast_id)
    if not b:
        raise HTTPException(status_code=404, detail="Duyuru bulunamadı")
    _audit(db, request, operator, "sistem_duyurusu_silindi", title=b.title)
    await db.delete(b)
    await db.commit()


# --- Alert Dismissals & Organization Deletion -----------------------------------

class AlertDismissIn(BaseModel):
    organization_id: Optional[UUID] = None
    kind: str = Field(min_length=2, max_length=64)


@router.post("/alerts/dismiss", status_code=201)
async def dismiss_alert(payload: AlertDismissIn, request: Request,
                        db: AsyncSession = Depends(get_db), operator: PlatformUser = Depends(get_platform_user)):
    if payload.organization_id is not None:
        await _org_or_404(db, payload.organization_id)
    existing = (await db.execute(
        select(PlatformAlertDismissal.id).where(
            PlatformAlertDismissal.organization_id == payload.organization_id,
            PlatformAlertDismissal.kind == payload.kind,
        )
    )).scalar_one_or_none()
    if not existing:
        db.add(PlatformAlertDismissal(
            organization_id=payload.organization_id,
            kind=payload.kind,
            dismissed_by_id=operator.id,
        ))
        _audit(db, request, operator, "uyari_gizlendi",
               organization_id=payload.organization_id, kind=payload.kind)
        await db.commit()
    return {"ok": True}


@router.delete("/alerts/dismiss", status_code=200)
async def restore_alerts(request: Request, db: AsyncSession = Depends(get_db),
                         operator: PlatformUser = Depends(get_platform_user)):
    from sqlalchemy import delete as sa_delete
    _require_platform_admin(operator)
    await db.execute(sa_delete(PlatformAlertDismissal))
    _audit(db, request, operator, "uyarilar_geri_yuklendi")
    await db.commit()
    return {"ok": True}


class OrgDeleteIn(BaseModel):
    confirm_name: str = Field(min_length=1, max_length=200)


@router.delete("/organizations/{org_id}", status_code=200)
async def delete_organization(org_id: UUID, payload: OrgDeleteIn, request: Request,
                              db: AsyncSession = Depends(get_db), operator: PlatformUser = Depends(get_platform_user)):
    from sqlalchemy import delete as sa_delete, text, update as sa_update
    import app.models  # noqa: F401
    import app.models.donation_category  # noqa: F401
    import app.models.organization_settings  # noqa: F401
    from app.core.db import Base

    _require_platform_admin(operator)
    org = await _org_or_404(db, org_id)
    if payload.confirm_name.strip() != org.name.strip():
        raise HTTPException(status_code=400, detail="Onay için kurum adını birebir aynı yazmalısınız")

    org_name, org_slug = org.name, org.slug
    domain_rows = (await db.execute(
        select(OrganizationDomain.domain).where(OrganizationDomain.organization_id == org.id)
    )).scalars().all()
    hosts_to_forget = []
    if org.subdomain:
        hosts_to_forget.append(f"{org.subdomain}.{settings.PLATFORM_BASE_DOMAIN}")
    for dom in domain_rows:
        hosts_to_forget.extend([dom, twin(dom)])
    if hosts_to_forget:
        await forget_host(*hosts_to_forget)

    org_user_ids = select(User.id).where(User.organization_id == org.id)
    from app.models.donor import Donor
    org_donor_ids = select(Donor.id).where(Donor.organization_id == org.id)
    student_table = Base.metadata.tables.get("students")
    org_student_ids = (
        select(student_table.c.id).where(student_table.c.organization_id == org.id)
        if student_table is not None and "organization_id" in student_table.c else None
    )

    # Clear self-references and child tables in reverse dependency order.
    for table in reversed(Base.metadata.sorted_tables):
        if table.name in ("organizations", "platform_audit_logs", "platform_users", "demo_requests", "fx_rates"):
            continue
        if "organization_id" in table.c:
            if "parent_id" in table.c:
                await db.execute(sa_update(table).where(table.c.organization_id == org.id).values(parent_id=None))
            if table.name == "audit_logs":
                has_trig = (await db.execute(text(
                    "SELECT 1 FROM pg_trigger WHERE tgname = 'audit_logs_append_only' AND NOT tgisinternal"
                ))).scalar_one_or_none()
                if has_trig:
                    await db.execute(text("ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_append_only"))
                try:
                    await db.execute(sa_delete(table).where(table.c.organization_id == org.id))
                finally:
                    if has_trig:
                        await db.execute(text("ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_append_only"))
            else:
                await db.execute(sa_delete(table).where(table.c.organization_id == org.id))
        elif "user_id" in table.c:
            await db.execute(sa_delete(table).where(table.c.user_id.in_(org_user_ids)))
        elif "donor_id" in table.c:
            await db.execute(sa_delete(table).where(table.c.donor_id.in_(org_donor_ids)))
        elif "student_id" in table.c and org_student_ids is not None:
            await db.execute(sa_delete(table).where(table.c.student_id.in_(org_student_ids)))

    await db.execute(
        sa_update(PlatformAuditLog).where(PlatformAuditLog.organization_id == org.id).values(organization_id=None)
    )
    await db.execute(
        sa_delete(Organization).where(Organization.id == org.id)
    )
    _audit(db, request, operator, "kurum_silindi", name=org_name, slug=org_slug)
    await db.commit()
    return {"ok": True, "deleted_name": org_name}


@router.post("/organizations/{org_id}/send-renewal-reminder")
async def send_renewal_reminder(org_id: UUID, request: Request,
                                db: AsyncSession = Depends(get_db), operator: PlatformUser = Depends(get_platform_user),
                                _: None = Depends(rate_limit("platform-renewal-reminder", limit=20, window_seconds=3600))):
    import asyncio
    from html import escape

    org = await _org_or_404(db, org_id)
    if not (settings.SENDGRID_API_KEY and org.email):
        raise HTTPException(status_code=400, detail="Sunucuda e-posta servisi (SendGrid) veya kurum e-postası tanımlı değil")

    from app.tasks import send_email_task

    ends_str = org.subscription_ends_at.strftime("%d.%m.%Y") if org.subscription_ends_at else "Belirtilmemiş"
    fee_str = f"{(org.monthly_fee_cents or 0) / 100:,.2f} TL"
    html = (
        f"<p>Merhaba {escape(org.name)} yetkilisi,</p>"
        f"<p>E-İnfak platform aboneliğinizin yenileme zamanı yaklaşmıştır (veya ödeme beklemektedir).</p>"
        f"<p><b>Paket:</b> {escape(org.plan)}<br>"
        f"<b>Bitiş Tarihi:</b> {escape(ends_str)}<br>"
        f"<b>Aylık Ücret:</b> {escape(fee_str)}</p>"
        f"<p>Kesintisiz hizmet için ödeme bilgilerinizi platform ekibimizle paylaşabilirsiniz.</p>"
    )
    try:
        ok = await asyncio.to_thread(send_email_task, org.email, f"{org.name} — E-İnfak Abonelik Hatırlatması", html)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"E-posta gönderilemedi: {exc}") from exc
    if not ok:
        raise HTTPException(status_code=502, detail="E-posta gönderilemedi")
    _audit(db, request, operator, "abonelik_hatirlatmasi", org.id, email=org.email)
    await db.commit()
    return {"ok": True, "email": org.email}


class TestSmsIn(BaseModel):
    phone: str = Field(min_length=10, max_length=24)


@router.post("/organizations/{org_id}/test-sms")
async def send_test_sms(org_id: UUID, payload: TestSmsIn, request: Request,
                        db: AsyncSession = Depends(get_db), operator: PlatformUser = Depends(get_platform_user),
                        _: None = Depends(rate_limit("platform-test-sms", limit=15, window_seconds=3600))):
    import asyncio
    from app.sms import SmsError, deliver
    from app.services.tenant_credentials import sms_account

    org = await _org_or_404(db, org_id)
    try:
        account = await sms_account(db, org.id)
    except CredentialsUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if not account:
        raise HTTPException(status_code=400, detail="Kurum için SMS sağlayıcı bilgisi veya platform yedeği tanımlı değil")
    try:
        result = await asyncio.to_thread(deliver, payload.phone.strip(), f"{org.name} E-Infak test SMS mesajidir.", account)
    except SmsError as exc:
        raise HTTPException(status_code=502, detail=str(exc) or "Test SMS gönderilemedi") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Test SMS gönderilemedi: {exc}") from exc
    _audit(db, request, operator, "test_sms_gonderildi", org.id, phone=payload.phone.strip(), provider=result.provider)
    await db.commit()
    return {"ok": True, "provider": result.provider, "reference": result.reference}


@router.get("/organizations/{org_id}/summary.pdf")
async def organization_summary_pdf(org_id: UUID, db: AsyncSession = Depends(get_db),
                                   _: PlatformUser = Depends(get_platform_user)):
    from fastapi.responses import Response
    from app.utils.report_pdf import build_report_pdf

    org = await _org_or_404(db, org_id)
    user_count = (await db.execute(
        select(func.count(User.id)).where(
            User.organization_id == org.id, User.is_active.is_(True), User.role != UserRole.PLATFORM_ADMIN
        )
    )).scalar_one()
    since_30d = datetime.now(timezone.utc) - timedelta(days=30)
    d30 = (await db.execute(
        select(func.count(Donation.id), func.coalesce(func.sum(Donation.amount_cents), 0))
        .where(
            Donation.organization_id == org.id,
            Donation.status == DonationStatus.CONFIRMED,
            Donation.paid_at >= since_30d,
            func.coalesce(Donation.currency, "TRY") == "TRY",
        )
    )).one()
    payments = (await db.execute(
        select(PlatformPayment).where(PlatformPayment.organization_id == org.id).order_by(PlatformPayment.paid_at.desc()).limit(20)
    )).scalars().all()

    rows = [
        [
            p.paid_at.strftime("%d.%m.%Y") if p.paid_at else "—",
            p.period_label,
            p.payment_method.upper(),
            f"{p.amount_cents / 100:,.2f} TL",
        ]
        for p in payments
    ] or [["—", "Henüz tahsilat kaydı yok", "—", "0,00 TL"]]

    pdf_bytes = build_report_pdf(
        title=f"{org.name} — Kurum Özet Raporu",
        subtitle=f"Paket: {org.plan} | Durum: {org.subscription_status or 'active'} | Aktif Kullanıcı: {user_count}/{org_user_limit(org)}",
        headers=["Tarih", "Dönem", "Yöntem", "Tutar"],
        rows=rows,
        org_name="E-İnfak Platform",
        organization=org,
        summary={
            "Son 30 Gün Bağış": f"{int(d30[0] or 0)} işlem / {int(d30[1] or 0) / 100:,.2f} TL",
            "Aylık SaaS Ücreti": f"{(org.monthly_fee_cents or 0) / 100:,.2f} TL",
        },
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{org.slug}-ozet.pdf"'},
    )


# --- Support Tickets (Platform Helpdesk) ----------------------------------------

@router.get("/tickets")
async def list_platform_tickets(status_filter: Optional[str] = None, db: AsyncSession = Depends(get_db),
                                _: PlatformUser = Depends(get_platform_user)):
    query = select(SupportTicket, Organization.name).join(Organization, Organization.id == SupportTicket.organization_id)
    if status_filter in ("open", "answered", "closed"):
        query = query.where(SupportTicket.status == status_filter)
    rows = (await db.execute(query.order_by(SupportTicket.updated_at.desc()).limit(200))).all()
    return [
        {
            "id": str(t.id),
            "organization_id": str(t.organization_id),
            "organization_name": org_name,
            "subject": t.subject,
            "category": t.category,
            "priority": t.priority,
            "status": t.status,
            "created_at": t.created_at.isoformat(),
            "updated_at": t.updated_at.isoformat(),
        }
        for t, org_name in rows
    ]


@router.get("/tickets/{ticket_id}")
async def get_platform_ticket(ticket_id: UUID, db: AsyncSession = Depends(get_db),
                              _: PlatformUser = Depends(get_platform_user)):
    row = (
        await db.execute(
            select(SupportTicket, Organization.name)
            .join(Organization, Organization.id == SupportTicket.organization_id)
            .where(SupportTicket.id == ticket_id)
        )
    ).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Talep bulunamadı")
    t, org_name = row
    msgs = (
        await db.execute(
            select(SupportTicketMessage)
            .where(SupportTicketMessage.ticket_id == t.id)
            .order_by(SupportTicketMessage.created_at.asc())
        )
    ).scalars().all()
    return {
        "id": str(t.id),
        "organization_id": str(t.organization_id),
        "organization_name": org_name,
        "subject": t.subject,
        "category": t.category,
        "priority": t.priority,
        "status": t.status,
        "created_at": t.created_at.isoformat(),
        "messages": [
            {
                "id": str(m.id),
                "sender_type": m.sender_type,
                "sender_name": m.sender_name,
                "body": m.body,
                "created_at": m.created_at.isoformat(),
            }
            for m in msgs
        ],
    }


class TicketReplyIn(BaseModel):
    body: str = Field(min_length=1, max_length=3000)


@router.post("/tickets/{ticket_id}/reply", status_code=201)
async def reply_platform_ticket(ticket_id: UUID, payload: TicketReplyIn, request: Request,
                                db: AsyncSession = Depends(get_db), operator: PlatformUser = Depends(get_platform_user)):
    t = await db.get(SupportTicket, ticket_id)
    if not t:
        raise HTTPException(status_code=404, detail="Talep bulunamadı")
    db.add(SupportTicketMessage(
        ticket_id=t.id,
        sender_type="platform",
        sender_name=operator.full_name or operator.email,
        body=payload.body.strip(),
    ))
    t.status = "answered"
    t.updated_at = datetime.now(timezone.utc)
    _audit(db, request, operator, "destek_talebi_yanitlandi", t.organization_id, subject=t.subject)
    await db.commit()
    return {"ok": True}


class TicketStatusIn(BaseModel):
    status: str = Field(pattern="^(open|answered|closed)$")


@router.patch("/tickets/{ticket_id}")
async def update_platform_ticket_status(ticket_id: UUID, payload: TicketStatusIn, request: Request,
                                        db: AsyncSession = Depends(get_db), operator: PlatformUser = Depends(get_platform_user)):
    t = await db.get(SupportTicket, ticket_id)
    if not t:
        raise HTTPException(status_code=404, detail="Talep bulunamadı")
    t.status = payload.status
    t.updated_at = datetime.now(timezone.utc)
    _audit(db, request, operator, "destek_talebi_durum", t.organization_id, subject=t.subject, status=payload.status)
    await db.commit()
    return {"ok": True, "status": t.status}


@router.get("/organizations/{org_id}/payments/{payment_id}/receipt.pdf")
async def platform_payment_receipt_pdf(org_id: UUID, payment_id: UUID, db: AsyncSession = Depends(get_db),
                                       _: PlatformUser = Depends(get_platform_user)):
    from fastapi.responses import Response
    from app.utils.report_pdf import build_report_pdf

    org = await _org_or_404(db, org_id)
    p = (await db.execute(
        select(PlatformPayment).where(PlatformPayment.id == payment_id, PlatformPayment.organization_id == org.id)
    )).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Tahsilat kaydı bulunamadı")

    status_label = {"paid": "Ödendi", "pending": "Beklemede", "cancelled": "İptal"}.get(p.status or "paid", p.status or "Ödendi")
    pdf_bytes = build_report_pdf(
        title="E-İnfak Platform SaaS Tahsilat Makbuzu",
        subtitle=f"Kurum: {org.name} ({org.legal_name})",
        headers=["Tarih", "Dönem", "Ödeme Yöntemi", "Tutar"],
        rows=[[
            p.paid_at.strftime("%d.%m.%Y") if p.paid_at else "—",
            p.period_label,
            p.payment_method.upper(),
            f"{p.amount_cents / 100:,.2f} {p.currency}",
        ]],
        org_name="E-İnfak Platform",
        organization=org,
        summary={"Makbuz No": str(p.id)[:8].upper(), "Durum": status_label},
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="saas-makbuz-{str(p.id)[:8]}.pdf"'},
    )

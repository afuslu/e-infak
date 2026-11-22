from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from datetime import datetime, timedelta, timezone
from uuid import UUID
from app.core.db import get_db
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
    password_fingerprint,
)
from app.core.config import settings
from app.models.audit_log import AuditLog
from app.models.user import User, UserRole, Session as UserSession
from app.services import passwords
from app.schemas.auth import (
    UserRegister,
    UserLogin,
    TokenResponse,
    RefreshTokenRequest,
    UserResponse,
)
from app.api.deps import get_current_user
from app.core.rate_limit import rate_limit
from app.core.impersonation import SIMULATION_FORBIDDEN, current_impersonator, is_impersonating

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    request: Request,
    user_in: UserRegister,
    db: AsyncSession = Depends(get_db),
):
    """Public staff registration is intentionally disabled."""
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Personel hesabı yalnız kurum yöneticisi davetiyle oluşturulabilir",
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    credentials: UserLogin,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit("staff-login", limit=10, window_seconds=300)),
):
    """Login user and return tokens"""
    
    # Safely get organization_id from request state (None for main portal domain)
    organization_id = getattr(request.state, "organization_id", None)
    
    # Find user by e-mail or phone number
    identifier = credentials.email.strip()
    if "@" in identifier:
        query = select(User).where(func.lower(User.email) == identifier.lower())
    else:
        from app.utils.phone import phone_key, phone_matches
        key = phone_key(identifier)
        if len(key) == 10:
            query = select(User).where(phone_matches(User.phone, key))
        else:
            query = select(User).where(func.lower(User.email) == identifier.lower())
    if organization_id:
        query = query.where(User.organization_id == organization_id)
    candidates = (await db.execute(query)).scalars().all()
    if not organization_id and len(candidates) > 1:
        # Platform address: the same e-mail may work in several organisations.
        platform = [u for u in candidates if u.role == UserRole.PLATFORM_ADMIN]
        if len(platform) != 1:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Bu e-posta birden fazla kurumda kayıtlı; lütfen kurumunuzun kendi adresinden giriş yapın",
            )
        candidates = platform
    user = candidates[0] if len(candidates) == 1 else None

    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-posta veya şifre hatalı",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hesabınız pasif; kurum yöneticinizle görüşün",
        )

    from app.services.ip_rules import denial
    reason = await denial(db, user, request.client.host if request.client else None)
    if reason:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=reason)

    if getattr(user, "totp_enabled", False) and getattr(user, "totp_secret", None):
        from app.services.totp import verify_totp
        if not credentials.totp_code:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="2FA doğrulama kodu gereklidir",
                headers={"X-2FA-Required": "totp"},
            )
        if not verify_totp(user.totp_secret, credentials.totp_code):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="2FA doğrulama kodu geçersiz",
                headers={"X-2FA-Required": "totp"},
            )
    
    # Create tokens
    pwd_fp = password_fingerprint(user.hashed_password)
    access_token = create_access_token({"sub": str(user.id), "pwd": pwd_fp})
    refresh_token = create_refresh_token({"sub": str(user.id), "pwd": pwd_fp})
    
    # Save session
    session = UserSession(
        user_id=user.id,
        refresh_token=refresh_token,
        access_token=access_token,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    
    db.add(session)
    
    # Update last login
    user.last_login_at = datetime.now(timezone.utc)
    
    await db.commit()
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    token_request: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    """Refresh access token"""
    
    # Verify refresh token
    payload = decode_token(token_request.refresh_token)
    
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Oturum yenilenemedi; lütfen yeniden giriş yapın",
        )
    
    # Find session
    result = await db.execute(
        select(UserSession).where(UserSession.refresh_token == token_request.refresh_token)
    )
    session = result.scalar_one_or_none()
    
    if not session or not session.is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Oturumunuzun süresi doldu; lütfen yeniden giriş yapın",
        )
    
    # Verify user is still active and password has not changed since token issuance
    user_id = payload.get("sub")
    user_obj = await db.get(User, UUID(str(user_id))) if user_id else None
    if not user_obj or not user_obj.is_active:
        session.revoked_at = datetime.now(timezone.utc)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Hesabınız aktif değil; lütfen yeniden giriş yapın",
        )
    current_pwd_fp = password_fingerprint(user_obj.hashed_password)
    if payload.get("pwd") and payload.get("pwd") != current_pwd_fp:
        session.revoked_at = datetime.now(timezone.utc)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Şifreniz değişti; lütfen yeniden giriş yapın",
        )
    pwd_fp = current_pwd_fp
    access_token = create_access_token({"sub": user_id, "pwd": pwd_fp})
    new_refresh_token = create_refresh_token({"sub": user_id, "pwd": pwd_fp})
    
    # Update session
    session.access_token = access_token
    session.refresh_token = new_refresh_token
    session.expires_at = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    
    await db.commit()
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/logout")
async def logout(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Logout user (revoke all sessions)"""
    # A platform simulation ends in the browser; the admin's own sessions stay intact.
    if is_impersonating():
        return {"message": "Simulation ended"}

    # Revoke all user sessions
    result = await db.execute(
        select(UserSession).where(
            UserSession.user_id == current_user.id,
            UserSession.revoked_at.is_(None),
        )
    )
    sessions = result.scalars().all()
    
    for session in sessions:
        session.revoked_at = datetime.now(timezone.utc)
    
    await db.commit()
    
    return {"message": "Successfully logged out"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Get current user profile; `impersonated_by` names the platform operator of a simulation."""
    data = UserResponse.model_validate(current_user)
    operator_id = current_impersonator.get()
    if operator_id:
        from app.models.platform import PlatformUser
        try:
            operator = await db.get(PlatformUser, UUID(operator_id))
        except ValueError:
            operator = None
        data.impersonated_by = {"id": operator_id, "email": operator.email if operator else None,
                                "name": getattr(operator, "full_name", None) if operator else None}
    return data


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=passwords.MIN_LENGTH, max_length=128)
    refresh_token: Optional[str] = Field(default=None, max_length=500)


@router.post("/me/password")
async def change_my_password(
    payload: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit("staff-password", limit=10, window_seconds=600)),
):
    """The signed-in user changes their own password; other devices are signed out."""
    if is_impersonating():
        raise HTTPException(status_code=403, detail=SIMULATION_FORBIDDEN)
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Mevcut şifre hatalı")
    if payload.new_password == payload.current_password:
        raise HTTPException(status_code=400, detail="Yeni şifre eskisiyle aynı olamaz")
    keep = await passwords.current_session_id(db, current_user, payload.refresh_token)
    await passwords.set_password(db, current_user, payload.new_password, keep_session=keep)
    db.add(AuditLog(organization_id=current_user.organization_id, user_id=current_user.id,
                    action="sifre_degisti", details={"by": "self"}))
    await db.commit()
    return {"ok": True}


# --- Forgotten password ---------------------------------------------------------------------------

class PasswordResetRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)


class PasswordResetConfirm(BaseModel):
    token: str = Field(min_length=20, max_length=2000)
    new_password: str = Field(min_length=passwords.MIN_LENGTH, max_length=128)


def _password_fingerprint(user: User) -> str:
    import hashlib

    # Changes with every password change, so a reset link works once and dies with the old password.
    return hashlib.sha256((user.hashed_password or "").encode()).hexdigest()[:16]


def _reset_base_url(request: Request) -> str:
    organization = getattr(request.state, "organization", None)
    if settings.ENVIRONMENT == "production" and getattr(organization, "primary_domain", None):
        return f"https://{organization.primary_domain}"
    return settings.PUBLIC_WEB_URL.rstrip("/")


async def _send_reset_link(db: AsyncSession, user: User, link: str) -> None:
    import asyncio
    import logging
    from html import escape

    log = logging.getLogger(__name__)
    if settings.SENDGRID_API_KEY and user.email:
        from app.tasks import send_email_task

        html = (
            f"<p>Merhaba {escape(user.first_name or '')},</p>"
            "<p>E-İnfak hesabınız için şifre sıfırlama istendi. Yeni şifre belirlemek için 30 dakika içinde "
            f'<a href="{escape(link)}">bu bağlantıya</a> tıklayın.</p>'
            "<p>Bu isteği siz yapmadıysanız bu e-postayı yok sayın; şifreniz değişmez.</p>"
        )
        try:
            await asyncio.to_thread(send_email_task, user.email, "Şifre sıfırlama", html)
            return
        except Exception as exc:  # pragma: no cover - provider outage
            log.warning("Şifre sıfırlama e-postası gönderilemedi: %s", exc)
    if user.phone:
        from app.services.sms_service import SmsError, enqueue_sms

        try:
            await enqueue_sms(db, user.organization_id, user.phone,
                              f"E-Infak sifre sifirlama baglantiniz (30 dk gecerli): {link}", source="system")
            await db.commit()
        except SmsError as exc:
            log.warning("Şifre sıfırlama SMS'i kuyruğa alınamadı: %s", exc)


@router.post("/password-reset/request")
async def request_password_reset(
    request: Request,
    payload: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit("staff-password-reset", limit=5, window_seconds=900)),
):
    """Always answers the same way, so it cannot be used to find out which e-mails have accounts."""
    organization_id = getattr(request.state, "organization_id", None)
    query = select(User).where(func.lower(User.email) == payload.email.strip().lower(), User.is_active.is_(True))
    if organization_id:
        query = query.where(User.organization_id == organization_id)
    users = (await db.execute(query)).scalars().all()
    if not organization_id and len(users) > 1:
        users = [u for u in users if u.role == UserRole.PLATFORM_ADMIN]
    if len(users) == 1:
        user = users[0]
        token = create_access_token(
            {"sub": str(user.id), "purpose": "password_reset", "fp": _password_fingerprint(user)},
            expires_delta=timedelta(minutes=30),
        )
        await _send_reset_link(db, user, f"{_reset_base_url(request)}/sifre-sifirla?token={token}")
        db.add(AuditLog(organization_id=user.organization_id, user_id=user.id, action="sifre_sifirlama_istendi",
                        details={"ip": request.client.host if request.client else None}))
        await db.commit()
    return {"ok": True, "message": "Bu e-posta kayıtlıysa şifre sıfırlama bağlantısı gönderildi."}


@router.post("/password-reset/confirm")
async def confirm_password_reset(
    request: Request,
    payload: PasswordResetConfirm,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit("staff-password-reset-confirm", limit=10, window_seconds=900)),
):
    from uuid import UUID as _UUID

    claims = decode_token(payload.token) or {}
    invalid = HTTPException(status_code=400, detail="Bağlantı geçersiz veya süresi dolmuş; yeniden isteyin")
    if claims.get("purpose") != "password_reset" or not claims.get("sub"):
        raise invalid
    user = await db.get(User, _UUID(claims["sub"]))
    if not user or not user.is_active or claims.get("fp") != _password_fingerprint(user):
        raise invalid
    organization_id = getattr(request.state, "organization_id", None)
    if organization_id and str(user.organization_id) != str(organization_id):
        raise invalid
    await passwords.set_password(db, user, payload.new_password)
    db.add(AuditLog(organization_id=user.organization_id, user_id=user.id, action="sifre_degisti", details={"by": "reset"}))
    await db.commit()
    return {"ok": True}


class TotpCodeIn(BaseModel):
    code: str = Field(min_length=6, max_length=12)


@router.post("/2fa/setup")
async def setup_2fa(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a new TOTP secret and otpauth URI for authenticator apps (Google Authenticator, Authy)."""
    if is_impersonating():
        raise HTTPException(status_code=403, detail=SIMULATION_FORBIDDEN)
    from app.services.totp import generate_secret, provisioning_uri

    secret = generate_secret()
    current_user.totp_secret = secret
    current_user.totp_enabled = False
    await db.commit()
    return {
        "secret": secret,
        "otpauth_uri": provisioning_uri(secret, current_user.email),
        "enabled": False,
    }


@router.post("/2fa/verify")
async def verify_2fa_setup(
    payload: TotpCodeIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify the first 6-digit TOTP code and enable 2FA for this account."""
    if is_impersonating():
        raise HTTPException(status_code=403, detail=SIMULATION_FORBIDDEN)
    from app.services.totp import verify_totp

    if not current_user.totp_secret:
        raise HTTPException(status_code=400, detail="Önce 2FA kurulumunu başlatın")
    if not verify_totp(current_user.totp_secret, payload.code):
        raise HTTPException(status_code=400, detail="Doğrulama kodu geçersiz")
    current_user.totp_enabled = True
    db.add(AuditLog(organization_id=current_user.organization_id, user_id=current_user.id, action="2fa_etkinlestirildi", details={}))
    await db.commit()
    return {"ok": True, "enabled": True}


@router.post("/2fa/disable")
async def disable_2fa(
    payload: TotpCodeIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Disable 2FA after verifying the current TOTP code."""
    if is_impersonating():
        raise HTTPException(status_code=403, detail=SIMULATION_FORBIDDEN)
    from app.services.totp import verify_totp

    if not current_user.totp_enabled or not current_user.totp_secret:
        return {"ok": True, "enabled": False}
    if not verify_totp(current_user.totp_secret, payload.code):
        raise HTTPException(status_code=400, detail="Doğrulama kodu geçersiz")
    current_user.totp_enabled = False
    current_user.totp_secret = None
    db.add(AuditLog(organization_id=current_user.organization_id, user_id=current_user.id, action="2fa_devre_disi", details={}))
    await db.commit()
    return {"ok": True, "enabled": False}

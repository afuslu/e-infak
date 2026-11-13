from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta, timezone
from app.core.db import get_db
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.core.config import settings
from app.models.audit_log import AuditLog
from app.models.user import User, Session as UserSession
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
    
    # Find user
    if organization_id:
        result = await db.execute(
            select(User).where(
                User.email == credentials.email,
                User.organization_id == organization_id,
            )
        )
    else:
        result = await db.execute(
            select(User).where(User.email == credentials.email)
        )
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account",
        )
    
    # Create tokens
    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})
    
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
            detail="Invalid refresh token",
        )
    
    # Find session
    result = await db.execute(
        select(UserSession).where(UserSession.refresh_token == token_request.refresh_token)
    )
    session = result.scalar_one_or_none()
    
    if not session or not session.is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
        )
    
    # Create new tokens
    user_id = payload.get("sub")
    access_token = create_access_token({"sub": user_id})
    new_refresh_token = create_refresh_token({"sub": user_id})
    
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
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user profile"""
    return current_user


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

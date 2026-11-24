"""Mobile sessions stay signed in; browser sessions keep the short lifetime."""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.api.v1 import auth
from app.core.security import decode_token
from app.models.user import Session as UserSession
from app.schemas.auth import RefreshTokenRequest, UserLogin
from tests.test_staff_notify import _request, _setup


async def _login(db, org, user, remember):
    return await auth.login(_request(org), UserLogin(email=user.email, password="Parola-123!", remember=remember), db=db, _=None)


async def _session(db, token):
    return (await db.execute(select(UserSession).where(UserSession.refresh_token == token))).scalar_one()


@pytest.fixture
async def account(db_session, monkeypatch):
    from app.services import ip_rules

    async def allow(*_):
        return None

    monkeypatch.setattr(ip_rules, "denial", allow)
    monkeypatch.setattr(auth, "verify_password", lambda plain, hashed: plain == "Parola-123!")
    org, admin, *_ = await _setup(db_session)
    return org, admin


@pytest.mark.asyncio
async def test_mobile_session_is_long_and_survives_lost_refresh_answers(db_session, account):
    org, admin = account
    tokens = await _login(db_session, org, admin, True)
    session = await _session(db_session, tokens.refresh_token)
    assert session.expires_at > datetime.now(timezone.utc) + timedelta(days=360)
    for _ in range(3):  # the same token keeps working
        again = await auth.refresh_token(RefreshTokenRequest(refresh_token=tokens.refresh_token), db=db_session)
        assert again.refresh_token == tokens.refresh_token
    session.expires_at = datetime.now(timezone.utc) + timedelta(days=100)
    renewed = await auth.refresh_token(RefreshTokenRequest(refresh_token=tokens.refresh_token), db=db_session)
    assert decode_token(renewed.refresh_token)["remember"] is True
    assert (await _session(db_session, renewed.refresh_token)).expires_at > datetime.now(timezone.utc) + timedelta(days=360)


@pytest.mark.asyncio
async def test_browser_session_stays_short_and_existing_phone_is_upgraded(db_session, account):
    org, admin = account
    web = await _login(db_session, org, admin, False)
    assert (await _session(db_session, web.refresh_token)).expires_at < datetime.now(timezone.utc) + timedelta(days=8)
    upgraded = await auth.refresh_token(RefreshTokenRequest(refresh_token=web.refresh_token, remember=True), db=db_session)
    assert decode_token(upgraded.refresh_token)["remember"] is True


@pytest.mark.asyncio
async def test_web_logout_keeps_phone_but_deactivation_and_password_change_end_it(db_session, account):
    org, admin = account
    phone = await _login(db_session, org, admin, True)
    web = await auth.login(_request(org), UserLogin(email=admin.email, password="Parola-123!"), db=db_session, _=None)
    await auth.logout(current_user=admin, db=db_session)
    assert (await _session(db_session, web.refresh_token)).revoked_at is not None
    assert (await auth.refresh_token(RefreshTokenRequest(refresh_token=phone.refresh_token), db=db_session)).access_token
    admin.hashed_password = "changed"
    await db_session.flush()
    with pytest.raises(HTTPException) as err:
        await auth.refresh_token(RefreshTokenRequest(refresh_token=phone.refresh_token), db=db_session)
    assert err.value.status_code == 401
    again = await _login(db_session, org, admin, True)
    admin.is_active = False
    await db_session.flush()
    with pytest.raises(HTTPException):
        await auth.refresh_token(RefreshTokenRequest(refresh_token=again.refresh_token), db=db_session)


@pytest.mark.asyncio
async def test_platform_refresh_ends_with_password_change(db_session):
    import uuid
    from app.api.v1 import platform
    from app.models.platform import PlatformUser
    from tests.test_staff_notify import _setup as setup

    org, *_ = await setup(db_session)
    op = PlatformUser(email=f"{uuid.uuid4().hex}@example.com", hashed_password="x", full_name="Op", role="admin")
    db_session.add(op)
    await db_session.flush()
    assert "refresh_token" not in platform._platform_tokens(op, False)
    token = platform._platform_tokens(op, True)["refresh_token"]
    body = platform.PlatformRefreshIn(refresh_token=token)
    assert (await platform.platform_refresh(body, _request(org), db=db_session))["access_token"]
    with pytest.raises(HTTPException):  # a tenant refresh token is not accepted
        from app.core.security import create_refresh_token
        await platform.platform_refresh(platform.PlatformRefreshIn(refresh_token=create_refresh_token({"sub": str(op.id)})), _request(org), db=db_session)
    op.hashed_password = "y"
    await db_session.flush()
    with pytest.raises(HTTPException):
        await platform.platform_refresh(body, _request(org), db=db_session)

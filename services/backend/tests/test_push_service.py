"""Expo rejections must be told apart from a phone that is not registered."""
import uuid

import httpx
import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.api.v1 import mobile
from app.models.device_token import DeviceToken
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.services import push_service


def _expo(monkeypatch, *tickets, status=200):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(status, json={"data": list(tickets)})

    real = httpx.AsyncClient
    monkeypatch.setattr(push_service.httpx, "AsyncClient",
                        lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    return calls


def _error(code):
    return {"status": "error", "message": "m", "details": {"error": code}}


async def _user(db, token="ExponentPushToken[x]"):
    slug = f"o-{uuid.uuid4().hex[:8]}"
    org = Organization(slug=slug, name="Test", legal_name=slug, email=f"{slug}@example.com",
                       primary_domain=f"{slug}.example.com", plan="ileri", enabled_addons=[], extra_user_seats=0)
    db.add(org)
    await db.flush()
    user = User(organization_id=org.id, email=f"a-{slug}@example.com", hashed_password="x", first_name="A",
                last_name="B", role=UserRole.STK_ADMIN, is_active=True)
    db.add(user)
    await db.flush()
    if token:
        db.add(DeviceToken(organization_id=org.id, user_id=user.id, token=token, platform="android"))
        await db.flush()
    return user


async def _tokens(db, user):
    return (await db.execute(select(DeviceToken.token).where(DeviceToken.user_id == user.id))).scalars().all()


@pytest.mark.asyncio
@pytest.mark.parametrize("ticket,status,expected,kept", [
    (_error("InvalidCredentials"), 200, 409, True),
    (_error("MessageRateExceeded"), 200, 409, True),
    ({}, 500, 409, True),
    (_error("DeviceNotRegistered"), 200, 404, False),
])
async def test_rejections_are_reported_as_what_they_are(db_session, monkeypatch, ticket, status, expected, kept):
    _expo(monkeypatch, ticket, status=status)
    user = await _user(db_session)
    with pytest.raises(HTTPException) as exc:
        await mobile.test_push_notification(db=db_session, current_user=user)
    assert exc.value.status_code == expected
    assert bool(await _tokens(db_session, user)) is kept


@pytest.mark.asyncio
async def test_accepted_push(db_session, monkeypatch):
    _expo(monkeypatch, {"status": "ok", "id": "1"})
    assert await mobile.test_push_notification(db=db_session, current_user=await _user(db_session)) == {"sent": 1}


@pytest.mark.asyncio
async def test_no_device(db_session, monkeypatch):
    calls = _expo(monkeypatch)
    with pytest.raises(HTTPException) as exc:
        await mobile.test_push_notification(db=db_session, current_user=await _user(db_session, token=None))
    assert exc.value.status_code == 404 and not calls


@pytest.mark.asyncio
async def test_empty_expo_answer_is_an_error(monkeypatch):
    _expo(monkeypatch)
    errors = []
    assert await push_service.push_messages(["ExponentPushToken[x]"], "t", "b", errors=errors) == (0, [])
    assert errors == ["Unknown"]

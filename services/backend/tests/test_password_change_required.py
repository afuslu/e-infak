"""Temporary passwords must be replaced at first sign-in; platform console edits, demo conversion
and audit filters."""
import uuid

import httpx
import pytest
from sqlalchemy import select

from app.core.security import get_password_hash
from app.models.platform import DemoRequest, PlatformUser
from app.models.user import User


@pytest.fixture
async def http(db_session, monkeypatch):
    from app.core.config import settings
    from app.core.db import engine
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", False)
    monkeypatch.setattr(settings, "SENDGRID_API_KEY", "")  # no mail provider: nothing leaves the test
    from app.main import app
    await engine.dispose()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://e-infak.org") as client:
        yield client


async def _operator(db, password="dogru-sifre-123456", must_change=False):
    op = PlatformUser(email=f"op-{uuid.uuid4().hex[:6]}@e-infak.org", full_name="Op",
                      hashed_password=get_password_hash(password), must_change_password=must_change)
    db.add(op)
    await db.commit()
    return op, password


async def _platform_auth(http, db):
    op, password = await _operator(db)
    token = (await http.post("/api/v1/platform/auth/login", json={"email": op.email, "password": password})).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _new_org(http, auth, **extra):
    sub = f"zor{uuid.uuid4().hex[:6]}"
    body = {"name": "Zorunlu Dernek", "subdomain": sub, "email": "info@zorunlu.org",
            "admin_email": f"Yonetici-{sub}@Zorunlu.org", "admin_first_name": "Ali", **extra}
    res = await http.post("/api/v1/platform/organizations", json=body, headers=auth)
    assert res.status_code == 201, res.text
    return sub, res.json()


async def test_new_admin_must_change_temporary_password(db_session, http):
    auth = await _platform_auth(http, db_session)
    sub, data = await _new_org(http, auth)
    host = {"Host": f"{sub}.e-infak.org"}
    admin = data["admin"]
    assert admin["email"] == admin["email"].lower()  # stored and returned lower-case
    assert admin["email_sent"] is False  # no mail provider in tests

    login = await http.post("/api/v1/auth/login", headers=host,
                            json={"email": admin["email"], "password": admin["temporary_password"]})
    assert login.status_code == 200
    staff = {**host, "Authorization": f"Bearer {login.json()['access_token']}"}

    me = await http.get("/api/v1/auth/me", headers=staff)
    assert me.status_code == 200 and me.json()["must_change_password"] is True
    blocked = await http.get("/api/v1/admin-features/site-appearance", headers=staff)
    assert blocked.status_code == 403 and blocked.json()["detail"] == "password_change_required"

    changed = await http.post("/api/v1/auth/me/password", headers=staff, json={
        "current_password": admin["temporary_password"], "new_password": "kendi-yeni-sifrem-42",
        "refresh_token": login.json()["refresh_token"]})
    assert changed.status_code == 200, changed.text

    again = await http.post("/api/v1/auth/login", headers=host,
                            json={"email": admin["email"], "password": "kendi-yeni-sifrem-42"})
    fresh = {**host, "Authorization": f"Bearer {again.json()['access_token']}"}
    assert (await http.get("/api/v1/auth/me", headers=fresh)).json()["must_change_password"] is False
    assert (await http.get("/api/v1/admin-features/site-appearance", headers=fresh)).status_code == 200


async def test_reset_password_requires_a_change_again(db_session, http):
    auth = await _platform_auth(http, db_session)
    sub, data = await _new_org(http, auth)
    org_id = data["organization"]["id"]
    user = (await db_session.execute(select(User).where(User.email == data["admin"]["email"]))).scalar_one()
    user.must_change_password = False
    await db_session.commit()

    res = await http.post(f"/api/v1/platform/organizations/{org_id}/users/{user.id}/reset-password", headers=auth)
    assert res.status_code == 200 and res.json()["email_sent"] is False
    await db_session.refresh(user)
    assert user.must_change_password is True


async def test_platform_operator_must_change_temporary_password(db_session, http):
    op, password = await _operator(db_session, must_change=True)
    login = await http.post("/api/v1/platform/auth/login", json={"email": op.email, "password": password})
    assert login.json()["user"]["must_change_password"] is True
    auth = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert (await http.get("/api/v1/platform/me", headers=auth)).json()["must_change_password"] is True
    blocked = await http.get("/api/v1/platform/organizations", headers=auth)
    assert blocked.status_code == 403 and blocked.json()["detail"] == "password_change_required"

    same = await http.post("/api/v1/platform/me/password", headers=auth,
                           json={"current_password": password, "new_password": password})
    assert same.status_code == 400
    changed = await http.post("/api/v1/platform/me/password", headers=auth,
                              json={"current_password": password, "new_password": "yeni-platform-sifresi-1"})
    assert changed.status_code == 200
    # The returned token keeps the operator signed in; the old one no longer works.
    new_auth = {"Authorization": f"Bearer {changed.json()['access_token']}"}
    assert (await http.get("/api/v1/platform/organizations", headers=new_auth)).status_code == 200
    assert (await http.get("/api/v1/platform/organizations", headers=auth)).status_code == 401


async def test_operator_edits_org_details_converts_demo_and_filters_audit(db_session, http):
    auth = await _platform_auth(http, db_session)
    demo = DemoRequest(name="Veli Kaya", organization="Talep Derneği", phone="05550000000", email="veli@talep.org")
    db_session.add(demo)
    await db_session.commit()

    sub, data = await _new_org(http, auth, demo_request_id=str(demo.id))
    org_id = data["organization"]["id"]
    await db_session.refresh(demo)
    assert demo.status == "converted"

    updated = await http.patch(f"/api/v1/platform/organizations/{org_id}", headers=auth, json={
        "legal_name": "Zorunlu Derneği Resmi", "email": "yeni@zorunlu.org", "phone": "02120000000", "city": "Bursa"})
    assert updated.status_code == 200, updated.text
    detail = (await http.get(f"/api/v1/platform/organizations/{org_id}", headers=auth)).json()
    assert (detail["legal_name"], detail["email"], detail["phone"], detail["city"]) == (
        "Zorunlu Derneği Resmi", "yeni@zorunlu.org", "02120000000", "Bursa")

    status = await http.patch(f"/api/v1/platform/demo-requests/{demo.id}", headers=auth, json={"status": "closed"})
    assert status.status_code == 200

    only_updates = (await http.get(f"/api/v1/platform/audit?organization_id={org_id}&action=kurum_guncelle",
                                   headers=auth)).json()
    assert only_updates and {r["action"] for r in only_updates} == {"kurum_guncelle"}
    searched = (await http.get("/api/v1/platform/audit?q=talep derneği", headers=auth)).json()
    assert any(r["action"] == "demo_talebi_durum" for r in searched)

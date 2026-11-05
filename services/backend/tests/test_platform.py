"""Platform console: separate operator accounts, organisation lifecycle, support sign-in."""
import uuid

import httpx
import pytest
from sqlalchemy import select

from app.core.security import create_access_token, get_password_hash
from app.models.audit_log import AuditLog
from app.models.organization import Organization
from app.models.platform import PlatformAuditLog, PlatformUser
from app.models.user import User, UserRole


@pytest.fixture
async def http(db_session):
    from app.core.db import engine
    from app.main import app
    await engine.dispose()  # pooled connections belong to an earlier test's event loop
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://e-infak.org") as client:
        yield client


async def _operator(db, password="dogru-sifre-123456"):
    op = PlatformUser(email=f"op-{uuid.uuid4().hex[:6]}@e-infak.org", full_name="Op",
                      hashed_password=get_password_hash(password))
    db.add(op)
    await db.commit()
    return op, password


async def test_platform_login_and_token_separation(db_session, http):
    op, password = await _operator(db_session)
    assert (await http.post("/api/v1/platform/auth/login", json={"email": op.email, "password": "yanlis"})).status_code == 401
    login = await http.post("/api/v1/platform/auth/login", json={"email": op.email.upper(), "password": password})
    assert login.status_code == 200
    token = login.json()["access_token"]
    auth = {"Authorization": f"Bearer {token}"}
    assert (await http.get("/api/v1/platform/organizations", headers=auth)).status_code == 200

    # An organisation administrator's token never opens the platform API …
    org = Organization(slug=f"o-{uuid.uuid4().hex[:6]}", name="O", legal_name="O", email="o@example.com",
                       primary_domain=f"{uuid.uuid4().hex[:6]}.example.com", plan="ileri", enabled_addons=[],
                       extra_user_seats=0)
    db_session.add(org)
    await db_session.flush()
    admin = User(organization_id=org.id, email=f"a-{org.slug}@example.com", hashed_password="x",
                 first_name="A", last_name="B", role=UserRole.STK_ADMIN)
    db_session.add(admin)
    await db_session.commit()
    org_token = create_access_token({"sub": str(admin.id)})
    assert (await http.get("/api/v1/platform/organizations",
                           headers={"Authorization": f"Bearer {org_token}"})).status_code == 401
    # … and a platform token never opens a tenant API (not even with the tenant chosen by host).
    tenant = await http.get("/api/v1/admin-features/site-appearance", headers={**auth, "Host": "x.example"})
    assert tenant.status_code in (401, 404)
    logs = (await db_session.execute(select(PlatformAuditLog.action).where(
        PlatformAuditLog.action.in_(["platform_giris", "platform_giris_basarisiz"])))).scalars().all()
    assert "platform_giris" in logs and "platform_giris_basarisiz" in logs


async def test_organisation_lifecycle(db_session, http):
    op, password = await _operator(db_session)
    token = (await http.post("/api/v1/platform/auth/login", json={"email": op.email, "password": password})).json()["access_token"]
    auth = {"Authorization": f"Bearer {token}"}
    sub = f"yeni{uuid.uuid4().hex[:6]}"
    body = {"name": "Yeni Dernek", "subdomain": sub, "email": "info@yeni.org", "plan": "orta", "template": "kategori",
            "primary_color": "#123456", "admin_email": f"yonetici-{sub}@yeni.org", "admin_first_name": "Ayşe"}
    created = await http.post("/api/v1/platform/organizations", json=body, headers=auth)
    assert created.status_code == 201, created.text
    data = created.json()
    org_id = data["organization"]["id"]
    assert data["organization"]["url"] == f"https://{sub}.e-infak.org"
    assert len(data["admin"]["temporary_password"]) >= 12
    assert (await http.post("/api/v1/platform/organizations", json=body, headers=auth)).status_code == 409
    assert (await http.post("/api/v1/platform/organizations", json={**body, "subdomain": "www"},
                            headers=auth)).status_code == 422

    # The new site answers on its subdomain with its own design
    site = await http.get("/api/v1/public/site", headers={"Host": f"{sub}.e-infak.org"})
    assert site.status_code == 200 and site.json()["name"] == "Yeni Dernek" and site.json()["template"] == "kategori"
    # The administrator can sign in with the one-time password
    login = await http.post("/api/v1/auth/login", headers={"Host": f"{sub}.e-infak.org"},
                            json={"email": body["admin_email"], "password": data["admin"]["temporary_password"]})
    assert login.status_code == 200

    # Plan rules are enforced; a valid change is applied
    bad = await http.patch(f"/api/v1/platform/organizations/{org_id}", json={"plan": "ileri", "enabled_addons": ["recurring"]}, headers=auth)
    assert bad.status_code == 422
    good = await http.patch(f"/api/v1/platform/organizations/{org_id}", json={"plan": "ileri", "extra_user_seats": 2}, headers=auth)
    assert good.json()["plan"] == "ileri" and good.json()["user_limit"] == 7

    # Custom domain: pending until the operator activates it
    added = await http.post(f"/api/v1/platform/organizations/{org_id}/domains", json={"domain": "WWW.YeniDernek.org"}, headers=auth)
    assert added.status_code == 201 and added.json()["domain"] == "yenidernek.org"
    assert (await http.get("/api/v1/public/site", headers={"Host": "yenidernek.org"})).status_code == 404
    await http.post(f"/api/v1/platform/organizations/{org_id}/domains/{added.json()['id']}/activate", headers=auth)
    assert (await http.get("/api/v1/public/site", headers={"Host": "www.yenidernek.org"})).json()["name"] == "Yeni Dernek"
    assert (await http.post(f"/api/v1/platform/organizations/{org_id}/domains", json={"domain": "x.e-infak.org"},
                            headers=auth)).status_code == 422

    # Support sign-in: short token for the organisation's admin, logged on both sides
    support = await http.post(f"/api/v1/platform/organizations/{org_id}/support-session", headers=auth)
    assert support.status_code == 200
    url = support.json()["url"]
    assert url.startswith(f"https://yenidernek.org/giris#destek=")
    support_token = url.split("#destek=", 1)[1]
    panel = await http.get("/api/v1/admin-features/site-appearance",
                           headers={"Host": f"{sub}.e-infak.org", "Authorization": f"Bearer {support_token}"})
    assert panel.status_code == 200
    # The operator's own platform token is refused by the same tenant endpoint
    refused = await http.get("/api/v1/admin-features/site-appearance",
                             headers={"Host": f"{sub}.e-infak.org", **auth})
    assert refused.status_code == 401
    org_logs = (await db_session.execute(select(AuditLog.action).where(AuditLog.organization_id == uuid.UUID(org_id)))).scalars().all()
    assert "platform_destek_girisi" in org_logs

    # Suspension closes the site at once and blocks support sign-in
    suspended = await http.patch(f"/api/v1/platform/organizations/{org_id}", json={"is_active": False}, headers=auth)
    assert suspended.json()["is_active"] is False
    assert (await http.get("/api/v1/public/site", headers={"Host": f"{sub}.e-infak.org"})).status_code == 404
    assert (await http.post(f"/api/v1/platform/organizations/{org_id}/support-session", headers=auth)).status_code == 409

    listing = (await http.get("/api/v1/platform/organizations", headers=auth)).json()
    assert any(o["id"] == org_id and o["is_active"] is False for o in listing)
    actions = {a["action"] for a in (await http.get(f"/api/v1/platform/audit?organization_id={org_id}", headers=auth)).json()}
    assert {"kurum_olustur", "kurum_guncelle", "alan_adi_ekle", "alan_adi_aktif", "destek_girisi", "kurum_askiya_al"} <= actions

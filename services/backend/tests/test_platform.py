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
async def http(db_session, monkeypatch):
    from app.core.config import settings
    from app.core.db import engine
    # The login rate limit lives in Redis and would carry over between test runs.
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", False)
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


async def test_operator_resets_organisation_user_password(db_session, http):
    from app.core.security import verify_password
    op, password = await _operator(db_session)
    token = (await http.post("/api/v1/platform/auth/login", json={"email": op.email, "password": password})).json()["access_token"]
    auth = {"Authorization": f"Bearer {token}"}
    org = Organization(slug=f"o-{uuid.uuid4().hex[:6]}", name="O", legal_name="O", email="o@example.com",
                       primary_domain=f"{uuid.uuid4().hex[:6]}.example.com", plan="ileri", enabled_addons=[],
                       extra_user_seats=0)
    db_session.add(org)
    await db_session.flush()
    admin = User(organization_id=org.id, email=f"a-{org.slug}@example.com", hashed_password="x",
                 first_name="A", last_name="B", role=UserRole.STK_ADMIN)
    db_session.add(admin)
    await db_session.commit()

    url = f"/api/v1/platform/organizations/{org.id}/users/{admin.id}/reset-password"
    assert (await http.post(url)).status_code == 401
    assert (await http.post(f"/api/v1/platform/organizations/{org.id}/users/{uuid.uuid4()}/reset-password",
                            headers=auth)).status_code == 404
    res = await http.post(url, headers=auth)
    assert res.status_code == 200, res.text
    temp = res.json()["temporary_password"]
    assert len(temp) >= 12 and res.json()["email"] == admin.email
    await db_session.refresh(admin)
    assert verify_password(temp, admin.hashed_password)
    actions = (await db_session.execute(select(AuditLog.action).where(AuditLog.organization_id == org.id))).scalars().all()
    assert "platform_sifre_sifirla" in actions


async def _login(http, db):
    op, password = await _operator(db)
    token = (await http.post("/api/v1/platform/auth/login", json={"email": op.email, "password": password})).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _small_org(db, plan="baslangic"):
    org = Organization(slug=f"o-{uuid.uuid4().hex[:6]}", name="Küçük", legal_name="Küçük", email="o@example.com",
                       primary_domain=f"{uuid.uuid4().hex[:6]}.example.com", plan=plan, enabled_addons=[],
                       extra_user_seats=0, is_active=True)
    db.add(org)
    await db.flush()
    admin = User(organization_id=org.id, email=f"a-{org.slug}@example.com", hashed_password="x",
                 first_name="A", last_name="B", role=UserRole.STK_ADMIN, is_active=True)
    db.add(admin)
    await db.commit()
    return org, admin


async def test_operator_manages_organisation_users(db_session, http):
    from app.core.security import verify_password
    auth = await _login(http, db_session)
    org, admin = await _small_org(db_session)
    base = f"/api/v1/platform/organizations/{org.id}/users"
    body = {"email": f"editor-{org.slug}@example.com", "first_name": "Edi", "role": "editor"}

    # Başlangıç has one seat, already taken by the administrator.
    full = await http.post(base, json=body, headers=auth)
    assert full.status_code == 409 and full.json()["detail"]["code"] == "user_limit_reached"
    assert (await http.patch(f"/api/v1/platform/organizations/{org.id}", json={"extra_user_seats": 1},
                             headers=auth)).status_code == 200
    assert (await http.post(base, json={**body, "role": "platform_admin"}, headers=auth)).status_code == 422
    created = await http.post(base, json=body, headers=auth)
    assert created.status_code == 201, created.text
    editor = (await db_session.execute(select(User).where(User.email == body["email"]))).scalar_one()
    assert editor.role == UserRole.EDITOR
    assert verify_password(created.json()["temporary_password"], editor.hashed_password)
    assert (await http.post(base, json=body, headers=auth)).status_code in (409,)

    # The last active administrator can neither be demoted nor deactivated …
    assert (await http.patch(f"{base}/{admin.id}", json={"role": "editor"}, headers=auth)).status_code == 409
    assert (await http.patch(f"{base}/{admin.id}", json={"is_active": False}, headers=auth)).status_code == 409
    # … but other users can.
    assert (await http.patch(f"{base}/{editor.id}", json={"role": "crm"}, headers=auth)).status_code == 200
    assert (await http.patch(f"{base}/{editor.id}", json={"is_active": False}, headers=auth)).status_code == 200
    await db_session.refresh(editor)
    assert editor.role == UserRole.CRM and editor.is_active is False

    detail = (await http.get(f"/api/v1/platform/organizations/{org.id}", headers=auth)).json()
    assert {u["role_label"] for u in detail["users"]} >= {"Dernek Yöneticisi"}
    catalog = (await http.get("/api/v1/platform/catalog", headers=auth)).json()
    assert "platform_admin" not in {r["key"] for r in catalog["roles"]}


async def test_alerts_flag_full_seats_and_data_outside_plan(db_session, http):
    from app.models.automation import BankAccount
    auth = await _login(http, db_session)
    org, _ = await _small_org(db_session)
    db_session.add(BankAccount(organization_id=org.id, bank_key="vakifkatilim", label="Ana hesap"))
    await db_session.commit()

    res = await http.get(f"/api/v1/platform/alerts?org_id={org.id}", headers=auth)
    assert res.status_code == 200, res.text
    kinds = {a["kind"]: a for a in res.json()}
    assert kinds["seats_full"]["level"] == "warning"
    assert kinds["data_outside_plan"]["level"] == "danger" and "banka hesabı" in kinds["data_outside_plan"]["message"]
    assert "payment_missing" in kinds
    assert [a["level"] for a in res.json()] == sorted([a["level"] for a in res.json()],
                                                      key={"danger": 0, "warning": 1, "info": 2}.get)

    await http.patch(f"/api/v1/platform/organizations/{org.id}", json={"plan": "ileri"}, headers=auth)
    kinds = {a["kind"] for a in (await http.get(f"/api/v1/platform/alerts?org_id={org.id}", headers=auth)).json()}
    assert "seats_full" not in kinds and "data_outside_plan" not in kinds
    assert (await http.get("/api/v1/platform/alerts")).status_code == 401

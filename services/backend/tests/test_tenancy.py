import uuid

import pytest
from pydantic import ValidationError
from starlette.requests import Request

from app.api.v1 import site as site_api
from app.models.organization import Organization, OrganizationDomain
from app.services import tenancy
from app.services.site import SiteAppearance, public_site


def test_host_normalisation_and_subdomains():
    assert tenancy.normalize_host("HICRET.e-infak.org:443") == "hicret.e-infak.org"
    assert tenancy.normalize_host("evil host") is None
    assert tenancy.normalize_host("[::1]:80") is None
    assert tenancy.platform_subdomain("hicret.e-infak.org") == "hicret"
    assert tenancy.platform_subdomain("www.e-infak.org") is None
    assert tenancy.platform_subdomain("a.b.e-infak.org") is None
    assert tenancy.platform_subdomain("hicret.e-infak.org.evil.test") is None
    assert tenancy.twin("www.x.org") == "x.org" and tenancy.twin("x.org") == "www.x.org"


async def _org(db, *, active=True, subdomain=None):
    slug = f"t-{uuid.uuid4().hex[:8]}"
    org = Organization(slug=slug, name=slug, legal_name=slug, email=f"{slug}@example.com",
                       primary_domain=f"{slug}.example.com", plan="ileri", enabled_addons=[], extra_user_seats=0,
                       subdomain=subdomain or slug, is_active=active)
    db.add(org)
    await db.flush()
    return org


async def test_resolution_uses_subdomains_and_active_domains_only(db_session):
    org = await _org(db_session)
    other = await _org(db_session)
    suffix = uuid.uuid4().hex[:6]
    db_session.add_all([
        OrganizationDomain(organization_id=org.id, domain=f"dernek{suffix}.org", status="active", verification_token="x"),
        OrganizationDomain(organization_id=other.id, domain=f"bekleyen{suffix}.org", status="pending", verification_token="y"),
    ])
    await db_session.flush()

    resolve = lambda host: tenancy.resolve_org_slug(db_session, host, use_cache=False)  # noqa: E731
    assert await resolve(f"dernek{suffix}.org") == org.slug
    assert await resolve(f"www.dernek{suffix}.org") == org.slug
    assert await resolve(f"{org.subdomain.upper()}.e-infak.org:443") == org.slug
    assert await resolve(f"dernek{suffix}.org.evil.test") is None
    assert await resolve(f"bekleyen{suffix}.org") is None  # not verified yet
    assert await resolve("www.e-infak.org") is None

    assert await tenancy.tls_allowed(db_session, f"www.dernek{suffix}.org")
    assert not await tenancy.tls_allowed(db_session, f"bekleyen{suffix}.org")
    assert not await tenancy.tls_allowed(db_session, "random.example.net")
    assert not await tenancy.tls_allowed(db_session, "e-infak.org")  # certbot on host nginx

    org.is_active = False
    await db_session.flush()
    assert await resolve(f"dernek{suffix}.org") is None
    assert not await tenancy.tls_allowed(db_session, f"dernek{suffix}.org")


def test_site_appearance_validation():
    with pytest.raises(ValidationError):
        SiteAppearance(primary_color="red")
    with pytest.raises(ValidationError):
        SiteAppearance(hero={"cta_url": "javascript:alert(1)"})
    with pytest.raises(ValidationError):
        SiteAppearance(social_links={"instagram": "http://insecure.example"})
    ok = SiteAppearance(
        template="kategori", primary_color="#c2181b", home_sections=["news", "bogus", "news", "stats"],
        hero={"title": "<b>Merhaba</b>", "image_url": "/api/v1/media/x/y.png"},
        translations={"en": {"hero_title": "Hello", "unknown": "x"}},
    )
    assert ok.primary_color == "#C2181B"
    assert ok.home_sections == ["news", "stats"]
    assert ok.hero.title == "Merhaba"
    assert ok.translations == {"en": {"hero_title": "Hello"}}


async def test_appearance_roundtrip_and_public_site(db_session):
    org = await _org(db_session)
    from app.services.site import apply_appearance
    apply_appearance(org, SiteAppearance(
        template="sade", tagline="Kısa", primary_color="#112233", hero={"title": "Başlık"},
        translations={"en": {"hero_title": "Title"}},
    ))
    await db_session.flush()
    tr = public_site(org, None, None)
    en = public_site(org, None, "en")
    from app.services.site import DEFAULT_SECTIONS
    assert tr["template"] == "sade" and tr["sections"] == DEFAULT_SECTIONS["sade"]
    assert tr["hero"]["slider"] is True and tr["testimonials"] == []
    assert tr["hero"]["title"] == "Başlık" and en["hero"]["title"] == "Title" and en["lang"] == "en"
    assert tr["primary_color"] == "#112233" and tr["languages"] == ["tr"]

    request = Request({"type": "http", "method": "GET", "path": "/", "headers": [], "query_string": b""})
    request.state.organization_id = str(org.id)
    data = await site_api.get_public_site(request, db_session)
    assert data["url"] == f"https://{org.subdomain}.e-infak.org"


def test_untouched_legacy_sections_get_new_defaults():
    from types import SimpleNamespace
    from app.services.site import DEFAULT_SECTIONS, appearance_of

    def org(sections, template="klasik", **hero):
        return SimpleNamespace(site={"home_sections": sections, "hero": hero}, template=template, tagline=None,
                               theme_primary_color=None, theme_accent_color=None, logo_url=None,
                               logo_dark_url=None, favicon_url=None)

    assert appearance_of(org(["stats", "campaigns", "zakat", "news", "trust"]))["home_sections"] == DEFAULT_SECTIONS["klasik"]
    assert appearance_of(org(["news", "stats", "gone"]))["home_sections"] == ["news", "stats"]
    assert appearance_of(org(None, "kategori"))["home_sections"] == DEFAULT_SECTIONS["kategori"]
    assert appearance_of(org(None, slider=False))["hero"]["slider"] is False


def test_testimonials_are_cleaned():
    ok = SiteAppearance(testimonials=[{"quote": "<i>Allah razı olsun</i>", "name": "  Ayşe  "}])
    assert ok.testimonials[0].quote == "Allah razı olsun" and ok.testimonials[0].name == "Ayşe"
    with pytest.raises(ValidationError):
        SiteAppearance(testimonials=[{"quote": "  "}])


async def test_image_upload_accepts_real_images_only(db_session, tmp_path, monkeypatch):
    import io
    from fastapi import HTTPException, UploadFile
    from PIL import Image
    from app.core.config import settings

    monkeypatch.setattr(settings, "MEDIA_ROOT", str(tmp_path))
    org = await _org(db_session)
    org_id = str(org.id)
    request = Request({"type": "http", "method": "POST", "path": "/", "headers": [], "query_string": b""})
    request.state.organization_id = org_id

    png = io.BytesIO()
    Image.new("RGB", (8, 8), "#C2181B").save(png, format="PNG")
    result = await site_api.upload_image(request, UploadFile(io.BytesIO(png.getvalue()), filename="logo.png"),
                                         db_session, None, None)
    # Stored in the media library and served as WebP
    assert result["url"].startswith(f"/api/v1/media/{org_id}/") and result["url"].endswith(".webp")
    served = await site_api.get_media(uuid.UUID(org_id), result["url"].rsplit("/", 1)[1])
    assert served.media_type == "image/webp"

    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    with pytest.raises(HTTPException) as exc:
        await site_api.upload_image(request, UploadFile(io.BytesIO(svg), filename="x.png"), db_session, None, None)
    assert exc.value.status_code == 422
    with pytest.raises(HTTPException):
        await site_api.get_media(uuid.UUID(org_id), "../../etc/passwd")


async def test_credentials_are_encrypted_and_used_per_organisation(db_session, monkeypatch):
    from cryptography.fernet import Fernet
    from sqlalchemy import select
    from app.core.config import settings
    from app.models.credentials import TenantCredential
    from app.services import tenant_credentials as tc

    old_key, new_key = Fernet.generate_key().decode(), Fernet.generate_key().decode()
    monkeypatch.setattr(settings, "CREDENTIALS_ENCRYPTION_KEY", old_key)
    org = await _org(db_session)
    await tc.save_credentials(db_session, org.id, "ziraatpay", {
        "merchant": "MERCHANT-1001", "merchant_user": "U1", "merchant_password": "secret-pass-xyz", "secret_key": "sk-123456",
    }, actor="test@example.com")
    row = (await db_session.execute(select(TenantCredential).where(TenantCredential.organization_id == org.id))).scalar_one()
    assert "secret-pass-xyz" not in row.ciphertext and "MERCHANT-1001" not in row.ciphertext

    # Empty secret fields keep the stored value; masked output never shows secrets
    saved = await tc.save_credentials(db_session, org.id, "ziraatpay", {"merchant": "M2", "merchant_user": "U1"}, actor="x")
    assert saved["merchant_password"] == "secret-pass-xyz"
    assert tc.masked("ziraatpay", saved)["merchant_password"] == "••••yz"

    from app.payments import provider_for
    provider = await provider_for(db_session, org)
    assert provider.key == "ziraatpay" and not provider.live
    assert (provider.client.merchant, provider.client.secret_key) == ("M2", "sk-123456")

    # Key rotation: new key first, old key still decrypts
    monkeypatch.setattr(settings, "CREDENTIALS_ENCRYPTION_KEY", f"{new_key},{old_key}")
    assert (await tc.get_credentials(db_session, org.id, "ziraatpay"))["merchant"] == "M2"

    monkeypatch.setattr(settings, "NETGSM_USERNAME", "platform")
    monkeypatch.setattr(settings, "NETGSM_PASSWORD", "p")
    assert (await tc.sms_account(db_session, org.id))["username"] == "platform"
    await tc.save_credentials(db_session, org.id, "netgsm", {"username": "kurum", "password": "x", "sender": "KURUM"}, actor="x")
    account = await tc.sms_account(db_session, org.id)
    assert (account["provider"], account["username"], account["sender"]) == ("netgsm", "kurum", "KURUM")

    # Another provider chosen without an account: platform fallback, unless the organisation turned it off
    await tc.save_credentials(db_session, org.id, "verimor", {"username": "908501234567", "password": "pw"}, actor="x")
    org.settings = {"sms_provider": "iletimerkezi"}
    assert (await tc.sms_account(db_session, org.id)).get("platform")
    org.settings = {"sms_provider": "iletimerkezi", "sms_platform_fallback": False}
    assert (await tc.sms_account(db_session, org.id)).get("disabled")
    org.settings = {"sms_provider": "verimor"}
    assert (await tc.sms_account(db_session, org.id))["provider"] == "verimor"

    monkeypatch.setattr(settings, "CREDENTIALS_ENCRYPTION_KEY", "")
    with pytest.raises(tc.CredentialsUnavailable):
        await tc.save_credentials(db_session, org.id, "netgsm", {"username": "a", "password": "b"}, actor="x")


async def test_platform_host_uses_signed_in_users_organisation(db_session, monkeypatch):
    import httpx
    from app.core.config import settings
    from app.core.security import create_access_token, create_refresh_token
    from app.main import app
    from app.models.user import User, UserRole

    org = await _org(db_session)
    other = await _org(db_session)
    user = User(organization_id=org.id, email=f"admin-{org.slug}@example.com", hashed_password="x",
                first_name="A", last_name="B", role=UserRole.STK_ADMIN)
    db_session.add(user)
    await db_session.commit()
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    access = create_access_token({"sub": str(user.id)})

    from app.core.db import engine
    await engine.dispose()  # pooled connections belong to an earlier test's event loop
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://e-infak.org") as http:
        site = await http.get("/api/v1/public/site", headers={"Authorization": f"Bearer {access}"})
        # A browser-chosen (unsigned) tenant header never wins over the user's own organisation
        forged = await http.get("/api/v1/public/site", headers={
            "Authorization": f"Bearer {access}", "x-organization-slug": other.slug})
        anonymous = await http.get("/api/v1/public/site")
        unsigned_only = await http.get("/api/v1/public/site", headers={"x-organization-slug": other.slug})
        refresh_as_access = await http.get("/api/v1/public/site", headers={
            "Authorization": f"Bearer {create_refresh_token({'sub': str(user.id)})}"})
        login = await http.post("/api/v1/auth/login", json={"email": "nobody@example.com", "password": "x"})
    assert site.status_code == 200 and site.json()["name"] == org.name
    assert forged.json()["name"] == org.name
    assert anonymous.status_code == 404 and unsigned_only.status_code == 404 and refresh_as_access.status_code == 404
    assert login.status_code != 404  # reaches the login handler (wrong password), not "organization not found"

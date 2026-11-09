"""Custom domain verification over DNS-over-HTTPS and the on-demand TLS gate."""
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import pytest

from app.core.config import settings
from app.core.security import create_access_token
from app.models.organization import Organization, OrganizationDomain
from app.models.user import User, UserRole
from app.services import domains, tenancy

SERVER_IP = "31.97.159.228"


@pytest.fixture(autouse=True)
def _public_ip(monkeypatch):
    monkeypatch.setattr(settings, "PLATFORM_PUBLIC_IP", SERVER_IP)
    monkeypatch.setattr(settings, "CERT_SERVICE_HOST", "")


def doh(records: dict, *, nxdomain=(), broken_endpoints=()):
    """Mock DoH JSON API. records: {(name, "A"|"TXT"): [values]}."""
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        if any(request.url.host in e for e in broken_endpoints):
            return httpx.Response(503)
        name, rtype = request.url.params["name"], request.url.params["type"]
        seen.append((request.url.host, name, rtype))
        assert request.headers["accept"] == "application/dns-json"
        if name in nxdomain:
            return httpx.Response(200, json={"Status": 3, "Answer": []})
        code = {"A": 1, "TXT": 16}[rtype]
        answer = [{"name": name, "type": 5, "data": "edge.example.net."}]  # CNAME hops are ignored
        answer += [{"name": name, "type": code, "data": f'"{v}"' if rtype == "TXT" else v}
                   for v in records.get((name, rtype), [])]
        return httpx.Response(200, json={"Status": 0, "Answer": answer})

    return httpx.AsyncClient(transport=httpx.MockTransport(handler)), seen


TOKEN = "a" * 32


async def test_dns_check_matrix():
    good = {("_einfak-verify.dernek.org", "TXT"): ["v=spf1 -all", TOKEN], ("dernek.org", "A"): [SERVER_IP],
            ("www.dernek.org", "A"): [SERVER_IP]}
    client, seen = doh(good)
    ok = await domains.check_dns("dernek.org", TOKEN, client)
    assert ok.ok and ok.error is None and ok.www_ok
    assert ("cloudflare-dns.com", "_einfak-verify.dernek.org", "TXT") in seen

    client, _ = doh({**good, ("_einfak-verify.dernek.org", "TXT"): ["baska-kod"]})
    wrong_txt = await domains.check_dns("dernek.org", TOKEN, client)
    assert not wrong_txt.ok and "TXT" in wrong_txt.error and "baska-kod" in wrong_txt.error

    client, _ = doh({**good, ("dernek.org", "A"): ["203.0.113.9"]})
    wrong_a = await domains.check_dns("dernek.org", TOKEN, client)
    assert not wrong_a.ok and "203.0.113.9" in wrong_a.error and "TXT" not in wrong_a.error

    client, _ = doh({}, nxdomain={"dernek.org", "_einfak-verify.dernek.org", "www.dernek.org"})
    missing = await domains.check_dns("dernek.org", TOKEN, client)
    assert not missing.ok and "NXDOMAIN" in missing.error and "kayıt yok" in missing.error

    # TXT split into several strings, and Cloudflare down → Google answers
    client, seen = doh({**good, ("_einfak-verify.dernek.org", "TXT"): [TOKEN[:16] + '" "' + TOKEN[16:]]},
                       broken_endpoints=("cloudflare-dns.com",))
    assert (await domains.check_dns("dernek.org", TOKEN, client)).ok
    assert {host for host, *_ in seen} == {"dns.google"}

    client, _ = doh(good, broken_endpoints=("cloudflare-dns.com", "dns.google"))
    down = await domains.check_dns("dernek.org", TOKEN, client)
    assert not down.ok and "sorgulanamadı" in down.error


async def test_dns_check_needs_server_ip(monkeypatch):
    monkeypatch.setattr(settings, "PLATFORM_PUBLIC_IP", "")
    client, seen = doh({})
    result = await domains.check_dns("dernek.org", TOKEN, client)
    assert not result.ok and "PLATFORM_PUBLIC_IP" in result.error and not seen


async def _org(db, *, active=True):
    slug = f"d-{uuid.uuid4().hex[:8]}"
    org = Organization(slug=slug, name=slug, legal_name=slug, email=f"{slug}@example.com",
                       primary_domain=f"{slug}.example.com", plan="ileri", enabled_addons=[], extra_user_seats=0,
                       subdomain=slug, is_active=active)
    db.add(org)
    await db.flush()
    return org


async def test_verify_activates_and_clears_cache(db_session, monkeypatch):
    forgotten = []

    async def forget(*hosts):
        forgotten.extend(hosts)
    monkeypatch.setattr(domains, "forget_host", forget)

    org = await _org(db_session)
    name = f"dernek{uuid.uuid4().hex[:6]}.org"
    old = OrganizationDomain(organization_id=org.id, domain=f"eski-{name}", status="active",
                             verification_token="x", is_primary=True)
    row = OrganizationDomain(organization_id=org.id, domain=name, status="pending", verification_token=TOKEN)
    db_session.add_all([old, row])
    await db_session.flush()

    client, _ = doh({(f"_einfak-verify.{name}", "TXT"): ["yanlis"], (name, "A"): [SERVER_IP]})
    failed = await domains.verify(db_session, row, client)
    assert not failed.ok and row.status == "pending" and "TXT" in row.last_check_error
    assert row.last_checked_at is not None and forgotten == []
    assert await tenancy.resolve_org_slug(db_session, name, use_cache=False) is None

    client, _ = doh({(f"_einfak-verify.{name}", "TXT"): [TOKEN], (name, "A"): [SERVER_IP]})
    passed = await domains.verify(db_session, row, client)
    assert passed.ok and row.status == "active" and row.is_primary and row.verified_at and row.last_check_error is None
    assert not old.is_primary
    assert forgotten == [name, f"www.{name}"]
    assert await tenancy.resolve_org_slug(db_session, f"www.{name}", use_cache=False) == org.slug


async def test_forget_host_drops_cached_answer(monkeypatch):
    class FakeRedis:
        def __init__(self):
            self.store = {"tenant-host:dernek.org": "", "tenant-host:www.dernek.org": "", "tenant-host:x.org": "x"}

        async def delete(self, *keys):
            for key in keys:
                self.store.pop(key, None)

    fake = FakeRedis()
    monkeypatch.setattr(tenancy, "_cache", lambda: fake)
    await tenancy.forget_host("dernek.org")
    assert fake.store == {"tenant-host:x.org": "x"}


async def test_pending_domains_are_rechecked_by_beat(db_session, monkeypatch):
    org = await _org(db_session)
    name = f"bekle{uuid.uuid4().hex[:6]}.org"
    fresh = OrganizationDomain(organization_id=org.id, domain=name, status="pending", verification_token=TOKEN)
    recent = OrganizationDomain(organization_id=org.id, domain=f"yeni-{name}", status="pending", verification_token=TOKEN,
                                last_checked_at=datetime.now(timezone.utc))
    db_session.add_all([fresh, recent])
    await db_session.flush()
    checked = []

    async def fake_verify(db, row, client=None):
        checked.append(row.domain)
        return domains.CheckResult(False, "yok")
    monkeypatch.setattr(domains, "verify", fake_verify)
    await domains.verify_pending(db_session)
    assert name in checked and f"yeni-{name}" not in checked


async def test_tls_allowed_matrix(db_session):
    active, suspended = await _org(db_session), await _org(db_session, active=False)
    tag = uuid.uuid4().hex[:6]
    db_session.add_all([
        OrganizationDomain(organization_id=active.id, domain=f"aktif{tag}.org", status="active", verification_token="x"),
        OrganizationDomain(organization_id=active.id, domain=f"bekleyen{tag}.org", status="pending", verification_token="y"),
        OrganizationDomain(organization_id=suspended.id, domain=f"askida{tag}.org", status="active", verification_token="z"),
    ])
    await db_session.flush()
    allowed = lambda host: tenancy.tls_allowed(db_session, host)  # noqa: E731

    assert await allowed(f"{active.subdomain}.e-infak.org")
    assert not await allowed(f"{suspended.subdomain}.e-infak.org")
    assert not await allowed(f"yok{tag}.e-infak.org")            # no such organisation
    assert not await allowed(f"www.{active.subdomain}.e-infak.org")  # deeper names never
    assert await allowed(f"aktif{tag}.org") and await allowed(f"www.aktif{tag}.org")
    assert not await allowed(f"bekleyen{tag}.org") and not await allowed(f"www.bekleyen{tag}.org")
    assert not await allowed(f"askida{tag}.org")
    assert not await allowed(f"random{tag}.example.net")
    assert not await allowed(f"aktif{tag}.org.evil.test")
    # Platform names keep their certbot certificate on host nginx
    for name in ("e-infak.org", "www.e-infak.org", "api.e-infak.org", "localhost", "127.0.0.1", "", "a b"):
        assert not await allowed(name), name


async def test_add_domain_rules(db_session):
    org, other = await _org(db_session), await _org(db_session)
    tag = uuid.uuid4().hex[:6]
    row = await domains.add_domain(db_session, org.id, f"WWW.Kurum{tag}.org")
    assert row.domain == f"kurum{tag}.org" and row.status == "pending" and len(row.verification_token) == 32
    for bad in ("x.e-infak.org", "e-infak.org", "localhost", "kurum", "bad name.org"):
        with pytest.raises(domains.DomainError) as exc:
            await domains.add_domain(db_session, org.id, bad)
        assert exc.value.status_code == 422, bad
    with pytest.raises(domains.DomainError) as exc:
        await domains.add_domain(db_session, other.id, f"kurum{tag}.org")
    assert exc.value.status_code == 409

    # An unverified claim older than a week no longer blocks the real owner
    row.created_at = datetime.now(timezone.utc) - timedelta(days=8)
    await db_session.flush()
    taken = await domains.add_domain(db_session, other.id, f"kurum{tag}.org")
    assert taken.organization_id == other.id

    for i in range(domains.MAX_DOMAINS_PER_ORG - 1):
        await domains.add_domain(db_session, other.id, f"ek{i}-{tag}.org")
    with pytest.raises(domains.DomainError) as exc:
        await domains.add_domain(db_session, other.id, f"fazla-{tag}.org")
    assert exc.value.status_code == 422


@pytest.fixture
async def http(db_session):
    from app.core.db import engine
    from app.main import app
    await engine.dispose()  # pooled connections belong to an earlier test's event loop
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://e-infak.org") as client:
        yield client


async def test_admin_domain_card_api(db_session, http, monkeypatch):
    org, other = await _org(db_session), await _org(db_session)
    admin = User(organization_id=org.id, email=f"admin-{org.slug}@example.com", hashed_password="x",
                 first_name="A", last_name="B", role=UserRole.STK_ADMIN, is_active=True, is_verified=True)
    foreign = OrganizationDomain(organization_id=other.id, domain=f"baska{org.slug}.org", status="pending",
                                 verification_token="q")
    db_session.add_all([admin, foreign])
    await db_session.commit()
    headers = {"Host": f"{org.subdomain}.e-infak.org", "Authorization": f"Bearer {create_access_token({'sub': str(admin.id)})}"}
    base = "/api/v1/admin-features/site-domains"

    added = await http.post(base, json={"domain": f"www.Site{org.slug}.org"}, headers=headers)
    assert added.status_code == 201, added.text
    body = added.json()
    assert body["status"] == "pending" and body["domain"] == f"site{org.slug}.org"
    records = {(r["type"], r["name"]): r["value"] for r in body["dns_records"]}
    assert records == {("A", "@"): SERVER_IP, ("A", "www"): SERVER_IP, ("TXT", "_einfak-verify"): body["verification_token"]}

    calls = []

    async def fake_check(domain, token, client=None):
        calls.append(domain)
        return domains.CheckResult(True, None, www_ok=True)
    monkeypatch.setattr(domains, "check_dns", fake_check)
    verified = await http.post(f"{base}/{body['id']}/verify", headers=headers)
    assert verified.status_code == 200 and verified.json()["status"] == "active" and calls == [body["domain"]]
    listing = (await http.get(base, headers=headers)).json()
    assert listing["url"] == f"https://{body['domain']}" and listing["public_ip"] == SERVER_IP

    # Another organisation's domain is invisible
    assert (await http.post(f"{base}/{foreign.id}/verify", headers=headers)).status_code == 404
    assert (await http.delete(f"{base}/{foreign.id}", headers=headers)).status_code == 404
    assert (await http.delete(f"{base}/{body['id']}", headers=headers)).json() == {"ok": True}
    assert (await http.get(base, headers=headers)).json()["domains"] == []


async def test_platform_verify_and_manual_activate(db_session, http, monkeypatch):
    from app.core.security import get_password_hash
    from app.models.platform import PlatformUser
    op = PlatformUser(email=f"op-{uuid.uuid4().hex[:6]}@e-infak.org", full_name="Op", hashed_password=get_password_hash("x"))
    db_session.add(op)
    org = await _org(db_session)
    await db_session.commit()
    auth = {"Authorization": f"Bearer {create_access_token({'sub': str(op.id), 'scope': 'platform'})}"}
    base = f"/api/v1/platform/organizations/{org.id}/domains"

    first = (await http.post(base, json={"domain": f"p1{org.slug}.org"}, headers=auth)).json()
    second = (await http.post(base, json={"domain": f"p2{org.slug}.org"}, headers=auth)).json()

    async def failing(domain, token, client=None):
        return domains.CheckResult(False, "TXT eşleşmiyor")
    monkeypatch.setattr(domains, "check_dns", failing)
    checked = (await http.post(f"{base}/{first['id']}/verify", headers=auth)).json()
    assert checked["status"] == "pending" and checked["last_check_error"] == "TXT eşleşmiyor"

    # The operator can still activate by hand (e.g. TXT cannot be added at the registrar)
    manual = (await http.post(f"{base}/{second['id']}/activate", headers=auth)).json()
    assert manual["status"] == "active" and manual["is_primary"]
    org_out = (await http.get(f"/api/v1/platform/organizations/{org.id}", headers=auth)).json()
    assert {d["domain"]: d["status"] for d in org_out["domains"]} == {first["domain"]: "pending", second["domain"]: "active"}

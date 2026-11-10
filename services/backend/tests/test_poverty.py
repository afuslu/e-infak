import uuid
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from starlette.requests import Request

from app.api.deps import require_admin_route_feature
from app.api.v1 import field_ops, poverty
from app.models.field_ops import AidDistribution, AidPackage, AidRecipient
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.services.poverty import degree_for, poverty_score


def _request(org, method="GET", path="/api/v1/admin-features/households"):
    request = Request({"type": "http", "method": method, "path": path, "headers": [], "query_string": b"", "client": ("1.2.3.4", 1)})
    request.state.organization_id = str(org.id)
    request.state.organization = org
    return request


async def _setup(db, plan="ileri"):
    slug = f"o-{uuid.uuid4().hex[:8]}"
    org = Organization(slug=slug, name="Test Derneği", legal_name=slug, email=f"{slug}@example.com",
                       primary_domain=f"{slug}.example.com", plan=plan, enabled_addons=[], extra_user_seats=0)
    db.add(org)
    await db.flush()
    admin = User(organization_id=org.id, email=f"{slug}@example.com", hashed_password="x",
                 first_name="Ayşe", last_name="Y", role=UserRole.STK_ADMIN)
    db.add(admin)
    await db.flush()
    return org, admin


async def _list(org, admin, db, **filters):
    params = dict(review=None, degree=None, region_id=None, city=None, district=None, neighborhood=None,
                  min_score=None, not_helped_days=None, q=None)
    return await poverty.list_households(_request(org), **{**params, **filters}, db=db, current_user=admin)


def _household(**kw):
    base = dict(household_size=None, monthly_income_cents=None, rent_cents=None, housing_status=None,
                heating_type=None, debt_cents=None, poverty_reasons=[])
    return SimpleNamespace(**{**base, **kw})


def _member(age=None, **kw):
    today = date(2026, 6, 1)
    base = dict(birth_date=date(today.year - age, 1, 1) if age is not None else None, is_disabled=False,
                has_chronic_illness=False, is_working=False, monthly_income_cents=None)
    return SimpleNamespace(**{**base, **kw})


def test_score_rewards_need_and_caps_at_100():
    today = date(2026, 6, 1)
    line = 1_000_000
    comfortable = _household(monthly_income_cents=8_000_000, housing_status="owner", heating_type="natural_gas")
    assert poverty_score(comfortable, [_member(40, is_working=True), _member(38, is_working=True)], line, today) == 0

    # 4 kişi, 10.000 TL gelir, 6.000 TL kira -> kişi başı net 1.000 TL (eşiğin %10'u)
    poor = _household(monthly_income_cents=1_000_000, rent_cents=600_000, housing_status="rent", heating_type="stove",
                      poverty_reasons=["unemployment", "illness"])
    family = [_member(45), _member(40, has_chronic_illness=True), _member(10), _member(7)]
    score = poverty_score(poor, family, line, today)
    # gelir 36 + bakmakla yükümlü 3*4=12 + çalışan yok 10 + kira 8 + soba 3 + sebepler 4 = 73
    assert score == 73
    assert degree_for(score) == "critical"

    worst = _household(monthly_income_cents=0, housing_status="rent", heating_type="none", debt_cents=10**9,
                       poverty_reasons=list(poverty.POVERTY_REASONS))
    assert poverty_score(worst, [_member(80, is_disabled=True)] * 6, line, today) == 100

    # Gelir bilinmiyorsa gelir bileşeni sayılmaz; aile bireylerinin geliri toplanır.
    assert poverty_score(_household(), [], line, today) == 0
    assert poverty_score(_household(), [_member(30, monthly_income_cents=0, is_working=True)], line, today) == 40


async def test_household_card_members_and_rescore(db_session):
    org, admin = await _setup(db_session)
    created = await poverty.create_household(_request(org, "POST"), poverty.HouseholdCreate(
        full_name="Hatice K.", city="İstanbul", district="Esenler", neighborhood="Turgut Reis",
        monthly_income_cents=1_000_000, rent_cents=600_000, housing_status="rent", heating_type="stove",
        poverty_reasons=["unemployment", "bogus"],
        members=[poverty.MemberIn(full_name="Hatice K.", relation="self", birth_date=date(1980, 1, 1)),
                 poverty.MemberIn(full_name="Ali K.", relation="child", birth_date=date(2016, 1, 1), shoe_size="32")],
    ), db_session, admin)
    assert created["household_size"] == 2
    assert created["poverty_reasons"] == ["unemployment"]
    first_score = created["poverty_score"]
    assert first_score > 0

    hid = uuid.UUID(created["id"])
    added = await poverty.add_member(_request(org, "POST"), hid, poverty.MemberIn(
        full_name="Veli K.", relation="child", birth_date=date(2019, 1, 1), is_disabled=True), db_session, admin)
    assert added["poverty_score"] > first_score

    detail = await poverty.get_household(_request(org), hid, db_session, admin)
    assert detail["household_size"] == 3 and len(detail["members"]) == 3
    assert detail["members"][1]["shoe_size"] == "32"

    await poverty.delete_member(_request(org, "DELETE"), hid, uuid.UUID(added["id"]), db_session, admin)
    assert (await poverty.get_household(_request(org), hid, db_session, admin))["poverty_score"] == first_score

    # Manuel derece puanı ezmez ama filtrede kullanılır.
    await poverty.update_household(_request(org, "PUT"), hid, poverty.HouseholdIn(
        full_name="Hatice K.", city="İstanbul", district="Esenler", degree_override="low"), db_session, admin)
    assert await _list(org, admin, db_session, degree="low")
    assert not await _list(org, admin, db_session, degree="critical")


async def test_web_application_review_flow_and_kumanya_visibility(db_session):
    org, admin = await _setup(db_session)
    with pytest.raises(ValidationError):
        poverty.HelpRequestIn(full_name="Ahmet Y", phone="05321112233", city="Van", district="İpekyolu",
                              address="Cumhuriyet Cad. 5", household_size=5, needs="Gıda ve kömür", kvkk_accepted=False)
    payload = poverty.HelpRequestIn(full_name="Ahmet Y", phone="05321112233", national_id="12345678901", city="Van",
                                    district="İpekyolu", address="Cumhuriyet Cad. 5", household_size=5,
                                    monthly_income_cents=0, needs="Gıda ve kömür", kvkk_accepted=True)
    request = _request(org, "POST", "/api/v1/public/help-requests")
    assert await poverty.create_help_request(request, payload, db_session, None) == {"status": "received"}
    # Aynı TC ile ikinci başvuru yeni kayıt açmaz.
    await poverty.create_help_request(request, payload, db_session, None)
    rows = (await db_session.execute(select(AidRecipient).where(AidRecipient.organization_id == org.id))).scalars().all()
    assert len(rows) == 1 and rows[0].review_status == "applied" and rows[0].source == "web"
    assert rows[0].poverty_score == 40  # gelir 0 -> tam gelir puanı

    open_queue = await _list(org, admin, db_session, review="open")
    assert [h["full_name"] for h in open_queue] == ["Ahmet Y"]
    # İncelenmemiş başvuru kumanyada görünmez ve planlanamaz.
    assert await field_ops.list_aid_recipients(_request(org), None, None, db_session, admin) == []
    package = AidPackage(organization_id=org.id, name="Gıda", unit_cost_cents=100_000, stock=10)
    db_session.add(package)
    await db_session.flush()
    with pytest.raises(HTTPException) as exc:
        await field_ops.plan_distributions(_request(org, "POST"), field_ops.DistributionPlan(
            package_id=package.id, recipient_ids=[rows[0].id]), db_session, admin)
    assert exc.value.status_code == 404

    reviewed = await poverty.review_household(_request(org, "POST"), rows[0].id, poverty.ReviewIn(
        status="approved", note="Ev ziyareti yapıldı"), db_session, admin)
    assert reviewed["review_status"] == "approved" and reviewed["inspected_at"]
    assert len(await field_ops.list_aid_recipients(_request(org), None, None, db_session, admin)) == 1


async def test_bulk_plan_prioritises_need_and_skips_recent(db_session):
    org, admin = await _setup(db_session)
    package = AidPackage(organization_id=org.id, name="Kömür", unit_cost_cents=250_000, stock=1)
    other = AidPackage(organization_id=org.id, name="Gıda", unit_cost_cents=100_000, stock=5)
    db_session.add_all([package, other])
    await db_session.flush()

    def hh(name, score, neighborhood="Merkez", review="approved"):
        return AidRecipient(organization_id=org.id, full_name=name, poverty_score=score, city="Van", district="Erciş",
                            neighborhood=neighborhood, review_status=review)
    critical, high, low, recent, pending, elsewhere, rejected = (
        hh("Kritik", 80), hh("Yüksek", 55), hh("Düşük", 10), hh("Yeni yardım", 90), hh("Bekleyen", 85),
        hh("Başka mahalle", 95, "Yalım"), hh("Ret", 99, review="rejected"))
    db_session.add_all([critical, high, low, recent, pending, elsewhere, rejected])
    await db_session.flush()
    now = datetime.now(timezone.utc)
    db_session.add_all([
        AidDistribution(organization_id=org.id, package_id=other.id, recipient_id=recent.id, status="delivered",
                        delivered_at=now - timedelta(days=5)),
        AidDistribution(organization_id=org.id, package_id=package.id, recipient_id=pending.id, status="planned"),
    ])
    await db_session.flush()

    body = dict(package_id=package.id, degrees=["critical", "high"], city="van", neighborhood="Merkez",
                exclude_helped_days=30)
    preview = await poverty.bulk_plan(_request(org, "POST"), poverty.BulkPlanIn(**body), db_session, admin)
    assert [h["full_name"] for h in preview["preview"]] == ["Kritik", "Yüksek"]
    assert preview["planned"] == 0 and preview["stock_short"] == 1 and preview["estimated_cost_cents"] == 500_000

    done = await poverty.bulk_plan(_request(org, "POST"), poverty.BulkPlanIn(**body, dry_run=False), db_session, admin)
    assert done["planned"] == 2
    # İkinci kez çalıştırınca bekleyen dağıtımı olanlar atlanır.
    again = await poverty.bulk_plan(_request(org, "POST"), poverty.BulkPlanIn(**body), db_session, admin)
    assert again["households"] == 0


async def test_stats_and_fairness_reports(db_session):
    org, admin = await _setup(db_session)
    package = AidPackage(organization_id=org.id, name="Gıda", unit_cost_cents=100_000, stock=0)
    a = AidRecipient(organization_id=org.id, full_name="A", poverty_score=90, city="Van", district="Erciş", neighborhood="Merkez")
    b = AidRecipient(organization_id=org.id, full_name="B", poverty_score=75, city="Van", district="Erciş", neighborhood="Merkez")
    c = AidRecipient(organization_id=org.id, full_name="C", poverty_score=5, city="Van", district="Tuşba", neighborhood="Şabaniye")
    db_session.add_all([package, a, b, c])
    await db_session.flush()
    now = datetime.now(timezone.utc)
    db_session.add_all([
        AidDistribution(organization_id=org.id, package_id=package.id, recipient_id=a.id, status="delivered", quantity=1, delivered_at=now),
        AidDistribution(organization_id=org.id, package_id=package.id, recipient_id=c.id, status="delivered", quantity=4, delivered_at=now),
    ])
    await db_session.flush()

    stats = await poverty.household_stats(_request(org), "neighborhood", None, db_session, admin)
    merkez = next(r for r in stats["rows"] if r["neighborhood"] == "Merkez")
    assert (merkez["households"], merkez["critical"], merkez["packages_12m"], merkez["helped_12m"]) == (2, 2, 1, 1)
    assert {d["degree"]: d["households"] for d in stats["degrees"]} == {"critical": 2, "high": 0, "medium": 0, "low": 1}

    fairness = await poverty.household_fairness(_request(org), 180, db_session, admin)
    by = {d["degree"]: d for d in fairness["degrees"]}
    assert (by["critical"]["helped"], by["critical"]["not_helped"]) == (1, 1)
    assert by["low"]["packages_per_household"] == 4.0
    assert [h["full_name"] for h in fairness["overlooked"]] == ["B"]
    assert fairness["most_helped"][0]["full_name"] == "C"


async def test_module_is_gated_to_ileri_package(db_session):
    org, _ = await _setup(db_session, plan="orta")
    with pytest.raises(HTTPException) as exc:
        await require_admin_route_feature(_request(org, path="/api/v1/admin-features/households-stats"))
    assert exc.value.detail["feature"] == "poverty_tracking"

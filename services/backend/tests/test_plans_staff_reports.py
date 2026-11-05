import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from starlette.requests import Request

from app.api.deps import (
    ROLE_PERMISSIONS,
    Permission,
    effective_permissions,
    require_admin_route_feature,
    require_admin_route_permission,
)
from app.api.v1 import reports, staff
from app.core.plans import Feature, Plan, org_features, org_user_limit
from app.models.campaign import Campaign
from app.models.donation import Donation, DonationStatus, Donor, PaymentMethod
from app.models.organization import Organization
from app.models.staff import StaffRole
from app.models.user import User, UserRole


def _request(org=None, method="GET", path="/api/v1/admin-features/x"):
    request = Request({"type": "http", "method": method, "path": path, "headers": []})
    if org is not None:
        request.state.organization_id = str(org.id)
        request.state.organization = org
    return request


# --- Packages ----------------------------------------------------------------

def test_plan_features_follow_package_table():
    start = SimpleNamespace(plan="baslangic", enabled_addons=[], extra_user_seats=0)
    middle = SimpleNamespace(plan="orta", enabled_addons=[], extra_user_seats=0)
    advanced = SimpleNamespace(plan="ileri", enabled_addons=[], extra_user_seats=0)
    assert Feature.KURBAN not in org_features(start)
    assert Feature.KURBAN in org_features(middle)
    assert Feature.RECURRING not in org_features(middle)
    assert Feature.CALL_CENTER not in org_features(middle)
    assert Feature.CALL_CENTER in org_features(advanced)
    assert [org_user_limit(o) for o in (start, middle, advanced)] == [1, 3, 5]


def test_addons_only_apply_when_offered_for_the_plan():
    org = SimpleNamespace(plan="baslangic", enabled_addons=["whatsapp", "kurban", "bogus"], extra_user_seats=2)
    features = org_features(org)
    assert Feature.WHATSAPP in features
    assert Feature.KURBAN not in features  # Kurban is not sold as a Başlangıç add-on
    assert org_user_limit(org) == 3


def test_unknown_plan_falls_back_to_default():
    assert Feature.KURBAN in org_features(SimpleNamespace(plan="nope", enabled_addons=None, extra_user_seats=None))


async def test_feature_gate_blocks_modules_outside_plan():
    org = SimpleNamespace(plan=Plan.BASLANGIC.value, enabled_addons=[], extra_user_seats=0, id=uuid.uuid4())
    with pytest.raises(HTTPException) as exc:
        await require_admin_route_feature(_request(org, path="/api/v1/admin-features/kurban/animals"))
    assert exc.value.status_code == 403
    assert exc.value.detail["feature"] == "kurban"
    # Donor CRM is in every plan
    await require_admin_route_feature(_request(org, path="/api/v1/admin-features/donors"))


# --- Permissions ---------------------------------------------------------------

def test_custom_role_replaces_builtin_matrix():
    role = StaffRole(permissions=["admin_read", "report_read", "not-a-permission"])
    user = User(role=UserRole.STK_ADMIN, staff_role_id=uuid.uuid4())
    user.staff_role = role
    assert effective_permissions(user) == {Permission.ADMIN_READ, Permission.REPORT_READ}


def test_unloaded_custom_role_fails_closed():
    user = User(role=UserRole.STK_ADMIN, staff_role_id=uuid.uuid4())
    assert effective_permissions(user) == set()


def test_platform_admin_always_has_everything():
    user = User(role=UserRole.PLATFORM_ADMIN, staff_role_id=uuid.uuid4())
    assert effective_permissions(user) == set(Permission)


async def test_user_management_and_reports_require_their_permissions():
    crm = User(role=UserRole.CRM)
    with pytest.raises(HTTPException):
        await require_admin_route_permission(_request(method="POST", path="/api/v1/admin-features/users"), crm)
    with pytest.raises(HTTPException):
        await require_admin_route_permission(_request(path="/api/v1/admin-features/reports/monthly"), crm)
    accountant = User(role=UserRole.MUHASEBE)
    assert await require_admin_route_permission(_request(path="/api/v1/admin-features/reports/monthly"), accountant)
    assert Permission.USER_MANAGE in ROLE_PERMISSIONS[UserRole.STK_ADMIN]


# --- Database-backed -----------------------------------------------------------

async def _org(db, plan="ileri"):
    slug = f"test-{uuid.uuid4().hex[:8]}"
    org = Organization(
        slug=slug, name=slug, legal_name=slug, email=f"{slug}@example.test",
        primary_domain=f"{slug}.example.test", plan=plan, enabled_addons=[], extra_user_seats=0,
    )
    db.add(org)
    await db.flush()
    return org


async def _user(db, org, role=UserRole.STK_ADMIN, staff_role=None):
    user = User(
        organization_id=org.id, email=f"{uuid.uuid4().hex[:10]}@example.test", hashed_password="x",
        first_name="Test", last_name="User", role=role,
        staff_role_id=staff_role.id if staff_role else None,
    )
    db.add(user)
    await db.flush()
    result = await db.execute(select(User).options(selectinload(User.staff_role)).where(User.id == user.id))
    return result.scalar_one()


async def test_user_limit_is_enforced(db_session):
    org = await _org(db_session, plan="baslangic")
    admin = await _user(db_session, org)
    payload = staff.StaffUserCreate(
        first_name="A", last_name="B", email=f"{uuid.uuid4().hex[:8]}@example.com",
        password="cok-gizli-parola", role=UserRole.READONLY,
    )
    with pytest.raises(HTTPException) as exc:
        await staff.create_staff_user(_request(org, "POST"), payload, db_session, admin)
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "user_limit_reached"


async def test_manager_cannot_grant_permissions_they_lack(db_session):
    org = await _org(db_session)
    limited = StaffRole(organization_id=org.id, name="İK", permissions=["admin_read", "user_manage"])
    db_session.add(limited)
    await db_session.flush()
    manager = await _user(db_session, org, role=UserRole.READONLY, staff_role=limited)

    payload = staff.StaffUserCreate(
        first_name="A", last_name="B", email=f"{uuid.uuid4().hex[:8]}@example.com",
        password="cok-gizli-parola", role=UserRole.STK_ADMIN,
    )
    with pytest.raises(HTTPException) as exc:
        await staff.create_staff_user(_request(org, "POST"), payload, db_session, manager)
    assert exc.value.status_code == 403

    with pytest.raises(HTTPException):
        await staff.create_staff_role(
            _request(org, "POST"),
            staff.StaffRoleIn(name="Finans", permissions=[Permission.FINANCE_MANAGE]),
            db_session, manager,
        )

    created = await staff.create_staff_user(
        _request(org, "POST"),
        payload.model_copy(update={"role": UserRole.READONLY}),
        db_session, manager,
    )
    assert created["permissions"] == ["admin_read"]


async def test_cannot_change_own_access_or_delete_assigned_role(db_session):
    org = await _org(db_session)
    role = StaffRole(organization_id=org.id, name="Yönetim", permissions=[p.value for p in Permission])
    db_session.add(role)
    await db_session.flush()
    admin = await _user(db_session, org, staff_role=role)
    with pytest.raises(HTTPException):
        await staff.update_staff_user(_request(org, "PUT"), admin.id, staff.StaffUserUpdate(is_active=False), db_session, admin)
    other_admin = await _user(db_session, org)
    with pytest.raises(HTTPException) as exc:
        await staff.delete_staff_role(_request(org, "DELETE"), role.id, db_session, other_admin)
    assert exc.value.status_code == 409


async def _donation(db, org, campaign, donor, amount, paid_at, issued_by=None, status=DonationStatus.CONFIRMED,
                    method=PaymentMethod.CREDIT_CARD):
    db.add(Donation(
        organization_id=org.id, campaign_id=campaign.id, donor_id=donor.id,
        receipt_number=f"R-{uuid.uuid4().hex[:12]}", amount_cents=amount, currency="TRY",
        payment_method=method, status=status, paid_at=paid_at, issued_by_id=issued_by,
    ))


async def test_reports_aggregate_real_confirmed_donations(db_session):
    org = await _org(db_session)
    clerk = await _user(db_session, org, role=UserRole.MUHASEBE)
    water = Campaign(organization_id=org.id, slug="su", title="Su Kuyusu", summary="s", target_cents=1_000_000, collected_cents=500_000)
    school = Campaign(organization_id=org.id, slug="okul", title="Okul", summary="s", target_cents=0)
    ali = Donor(organization_id=org.id, first_name="Ali", country="Türkiye", city="İstanbul")
    eve = Donor(organization_id=org.id, first_name="Eve", country="Almanya", city="Köln")
    db_session.add_all([water, school, ali, eve])
    await db_session.flush()

    year = reports.today_local().year
    utc = timezone.utc
    await _donation(db_session, org, water, ali, 10_000, datetime(year - 1, 3, 10, 12, tzinfo=utc))
    await _donation(db_session, org, water, ali, 20_000, datetime(year, 1, 5, 12, tzinfo=utc))
    await _donation(db_session, org, school, eve, 5_000, datetime(year, 1, 20, 12, tzinfo=utc),
                    issued_by=clerk.id, method=PaymentMethod.BANK_TRANSFER)
    # 31 Jan 22:30 UTC is 1 Feb in Istanbul
    await _donation(db_session, org, water, eve, 7_000, datetime(year, 1, 31, 22, 30, tzinfo=utc))
    # Not counted: refunded
    await _donation(db_session, org, water, eve, 99_999, datetime(year, 1, 6, 12, tzinfo=utc), status=DonationStatus.REFUNDED)
    await db_session.flush()

    request = _request(org)
    monthly = await reports.monthly_report(request, year, "TRY", db_session)
    assert monthly["months"][0]["total_cents"] == 25_000
    assert monthly["months"][0]["donor_count"] == 2
    assert monthly["months"][1]["total_cents"] == 7_000
    assert monthly["total_cents"] == 32_000
    assert {p["method"]: p["count"] for p in monthly["payment_methods"]} == {"credit_card": 2, "bank_transfer": 1}

    start, end = date(year, 1, 1), date(year, 2, 28)
    campaigns = await reports.campaign_report(request, start, end, "TRY", 10, db_session)
    assert [c["title"] for c in campaigns["campaigns"]] == ["Su Kuyusu", "Okul"]
    assert campaigns["campaigns"][0]["total_cents"] == 27_000
    assert campaigns["campaigns"][0]["progress_pct"] == 50.0
    assert campaigns["campaigns"][1]["progress_pct"] is None

    staff_rows = await reports.staff_receipt_report(request, start, end, "TRY", db_session)
    by_name = {r["name"]: r for r in staff_rows["staff"]}
    assert by_name["Online (otomatik)"]["count"] == 2
    assert by_name["Test User"]["total_cents"] == 5_000

    donors = await reports.donor_report(request, start, end, "TRY", db_session)
    assert donors["active_donors"] == 2
    assert donors["new_donors"] == 1  # Ali first gave last year
    assert donors["returning_donors"] == 1
    assert {c["label"] for c in donors["by_country"]} == {"Türkiye", "Almanya"}

    comparison = await reports.yearly_comparison(request, 5, "TRY", db_session)
    last_two = comparison["years"][-2:]
    assert last_two[0]["total_cents"] == 10_000
    assert last_two[1]["total_cents"] == 32_000
    assert last_two[1]["change_pct"] == 220.0

    daily = await reports.daily_report(request, date(year, 1, 30), date(year, 2, 1), "TRY", db_session)
    assert [d["total_cents"] for d in daily["days"]] == [0, 0, 7_000]

    with pytest.raises(HTTPException):
        await reports.daily_report(request, date(year - 2, 1, 1), date(year, 1, 1), "TRY", db_session)


async def test_dashboard_kpis_use_real_data(db_session):
    from datetime import timedelta
    from app.models.campaign import CampaignStatus

    org = await _org(db_session)
    campaign = Campaign(organization_id=org.id, slug="k", title="K", summary="s", target_cents=100, status=CampaignStatus.ACTIVE)
    donor = Donor(organization_id=org.id, first_name="D")
    db_session.add_all([campaign, donor])
    await db_session.flush()
    now = datetime.now(timezone.utc)
    await _donation(db_session, org, campaign, donor, 4_000, now)
    await _donation(db_session, org, campaign, donor, 1_000, now - timedelta(days=400))
    await db_session.flush()

    kpis = await reports.dashboard_kpis(db_session, org.id)
    assert kpis["today_cents"] == 4_000
    assert kpis["month_cents"] == 4_000
    assert kpis["donor_count"] == 1
    assert kpis["new_donors_this_month"] == 0
    assert kpis["active_campaigns"] == 1

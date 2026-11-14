"""IP allow/block lists, sign-in and activity records, exchange rates."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api.v1 import security
from app.models.audit_log import AuditLog
from app.models.organization import Organization
from app.models.user import Session as UserSession
from app.models.user import User, UserRole
from app.services.ip_rules import denial


def _request(org, ip="81.213.241.27", method="GET"):
    request = Request({"type": "http", "method": method, "path": "/api/v1/admin-features/ip-rules", "headers": [],
                       "query_string": b"", "client": (ip, 1)})
    request.state.organization_id = str(org.id)
    request.state.organization = org
    return request


async def _setup(db):
    slug = f"s-{uuid.uuid4().hex[:8]}"
    org = Organization(slug=slug, name=slug, legal_name=slug, email=f"{slug}@example.com", primary_domain=f"{slug}.example.com")
    db.add(org)
    await db.flush()
    admin = User(organization_id=org.id, email=f"a-{slug}@example.com", hashed_password="x", first_name="Ayşe",
                 last_name="Admin", role=UserRole.STK_ADMIN)
    clerk = User(organization_id=org.id, email=f"c-{slug}@example.com", hashed_password="x", first_name="Can",
                 last_name="Personel", role=UserRole.CRM)
    other = User(organization_id=org.id, email=f"o-{slug}@example.com", hashed_password="x", first_name="Oya",
                 last_name="Personel", role=UserRole.CRM)
    db.add_all([admin, clerk, other])
    await db.flush()
    return org, admin, clerk, other


async def test_allow_list_per_staff_and_block_list_for_everyone(db_session):
    org, admin, clerk, other = await _setup(db_session)
    office = "81.213.241.27"
    assert await denial(db_session, clerk, "5.46.73.106") is None  # no rules: no restriction

    await security.create_ip_rule(_request(org, office, "POST"), security.IpRuleIn(kind="allow", network="81.213.241.0/24", user_id=clerk.id),
                                  db_session, admin)
    assert await denial(db_session, clerk, office) is None
    assert "izniniz yok" in await denial(db_session, clerk, "5.46.73.106")
    assert await denial(db_session, other, "5.46.73.106") is None  # the rule names only the clerk

    await security.create_ip_rule(_request(org, office, "POST"), security.IpRuleIn(kind="allow", network="81.213.241.27"),
                                  db_session, admin)
    assert "izniniz yok" in await denial(db_session, other, "5.46.73.106")  # now everyone's rule
    assert await denial(db_session, admin, "5.46.73.106") is None  # admins are exempt from allow lists

    await security.create_ip_rule(_request(org, office, "POST"), security.IpRuleIn(kind="block", network="176.42.247.121"),
                                  db_session, admin)
    assert "engellendi" in await denial(db_session, admin, "176.42.247.121")  # blocks apply to admins too
    with pytest.raises(HTTPException) as exc:  # cannot block the address you are connected from
        await security.create_ip_rule(_request(org, office, "POST"), security.IpRuleIn(kind="block", network=office), db_session, admin)
    assert exc.value.status_code == 409
    with pytest.raises(HTTPException) as exc:
        await security.create_ip_rule(_request(org, office, "POST"), security.IpRuleIn(kind="allow", network="not-an-ip"), db_session, admin)
    assert exc.value.status_code == 422
    listed = await security.list_ip_rules(_request(org, office), "allow", db_session, admin)
    assert {i["network"] for i in listed["items"]} == {"81.213.241.0/24", "81.213.241.27/32"}
    with pytest.raises(HTTPException):  # a staff member without settings rights cannot read the lists
        await security.list_ip_rules(_request(org, office), "allow", db_session, clerk)


async def test_sign_in_records_activity_log_and_ending_sessions(db_session):
    org, admin, clerk, other = await _setup(db_session)
    now = datetime.now(timezone.utc)
    for user, ip in ((clerk, "81.213.241.27"), (clerk, "5.46.97.139"), (other, "81.213.241.27")):
        db_session.add(UserSession(user_id=user.id, refresh_token=uuid.uuid4().hex, ip_address=ip, user_agent="test",
                                   expires_at=now + timedelta(days=7)))
    db_session.add(AuditLog(organization_id=org.id, user_id=clerk.id, action="makbuz_elle_kes",
                            details={"donor_id": "d-1", "receipt_number": "R-1"}))
    await db_session.flush()

    logs = await security.login_logs(_request(org), db_session, admin, user_id=None, ip="5.46", date_from=None, date_to=None,
                                     page=1, page_size=50)
    assert logs["total"] == 1 and logs["items"][0]["name"] == "Can Personel" and logs["open_sessions"] == 3
    ended = await security.end_sessions(_request(org, method="POST"), user_id=clerk.id, db=db_session, current_user=admin)
    assert ended == {"ended": 2}

    activity = await security.activity_logs(_request(org), db_session, admin, user_id=None, action=None, q="R-1", donor_id=None,
                                            date_from=None, date_to=None, page=1, page_size=50)
    assert activity["items"][0]["label"] == "Makbuz kesildi" and activity["items"][0]["user"] == "Can Personel"
    assert any(a["key"] == "oturumlari_kapat" for a in activity["actions"])

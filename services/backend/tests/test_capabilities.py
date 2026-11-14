"""STK PRO style fine-grained permissions (app.core.capabilities)."""
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api.deps import Permission, effective_capabilities, effective_permissions, mask_phone
from app.api.v1 import crm, staff
from app.core import capabilities
from app.models.campaign import Campaign
from app.models.donation import Donor
from app.models.organization import Organization
from app.models.staff import StaffRole
from app.models.user import User, UserRole


def _request(org, method="GET"):
    request = Request({"type": "http", "method": method, "path": "/api/v1/admin-features/x", "headers": [],
                       "query_string": b"", "client": ("1.2.3.4", 1)})
    request.state.organization_id = str(org.id)
    request.state.organization = org
    return request


async def _setup(db, stored: list[str]):
    slug = f"c-{uuid.uuid4().hex[:8]}"
    org = Organization(slug=slug, name=slug, legal_name=slug, email=f"{slug}@example.com", primary_domain=f"{slug}.example.com")
    db.add(org)
    await db.flush()
    admin = User(organization_id=org.id, email=f"a-{slug}@example.com", hashed_password="x", first_name="Ayşe",
                 last_name="Admin", role=UserRole.STK_ADMIN)
    role = StaffRole(organization_id=org.id, name="Temsilci", permissions=stored)
    db.add_all([admin, role])
    await db.flush()
    clerk = User(organization_id=org.id, email=f"c-{slug}@example.com", hashed_password="x", first_name="Can",
                 last_name="Temsilci", role=UserRole.CRM, staff_role_id=role.id)
    campaign = Campaign(organization_id=org.id, slug="genel", title="Genel", summary="s", target_cents=100_000, collected_cents=0)
    db.add_all([clerk, campaign])
    await db.flush()
    clerk.staff_role = role
    mine = Donor(organization_id=org.id, first_name="Benim", phone="05321234567", assigned_user_id=clerk.id)
    other = Donor(organization_id=org.id, first_name="Başkası", phone="05339876543", assigned_user_id=admin.id)
    db.add_all([mine, other])
    await db.flush()
    return org, admin, clerk, campaign, mine, other


def test_old_roles_keep_whole_modules_and_ticks_open_their_module():
    assert capabilities.expand(["donor_manage"]) >= {"donors.view_all", "donors.phone", "sms.send"}
    assert capabilities.permissions_of({"receipts.create"}) == {"finance_manage"}
    assert all(c["capabilities"] for c in capabilities.catalog())


async def test_restricted_role_sees_own_donors_masked_and_cannot_backdate(db_session):
    org, admin, clerk, campaign, mine, other = await _setup(db_session, ["donors.create", "donors.update", "receipts.create", "sms.send"])
    assert Permission.DONOR_MANAGE in effective_permissions(clerk) and Permission.FINANCE_MANAGE in effective_permissions(clerk)
    assert "donors.view_all" not in effective_capabilities(clerk) and "donors.view_all" in effective_capabilities(admin)

    listed = await crm.list_donors(_request(org), q=None, assigned=None, region=None, donor_type=None, has_donation=None,
                                   tag=None, sort="name", page=1, page_size=50, db=db_session, current_user=clerk)
    assert [d["first_name"] for d in listed["items"]] == ["Benim"]
    assert listed["items"][0]["phone"] == "0532 *** ** 67"
    with pytest.raises(HTTPException) as exc:  # someone else's donor does not exist for this clerk
        await crm.get_donor_card(_request(org), other.id, db_session, clerk)
    assert exc.value.status_code == 404
    card = await crm.get_donor_card(_request(org), mine.id, db_session, clerk)
    assert card["notes"] == [] and "*" in card["phone"]
    full = await crm.get_donor_card(_request(org), other.id, db_session, admin)
    assert full["phone"] == "05339876543"

    with pytest.raises(HTTPException) as exc:  # cannot update a donor they do not represent
        await crm.update_donor(_request(org, "PUT"), other.id, crm.DonorUpdate(first_name="X"), db_session, clerk)
    assert exc.value.status_code == 403

    yesterday = (datetime.now(crm.TZ) - timedelta(days=1)).date()
    payload = crm.ManualDonationIn(idempotency_key=uuid.uuid4().hex, donor_id=mine.id, campaign_id=campaign.id,
                                   amount_cents=10_000, paid_on=yesterday)
    with pytest.raises(HTTPException) as exc:
        await crm.create_manual_donation(_request(org, "POST"), payload, db_session, clerk)
    assert exc.value.status_code == 403 and "geriye" in exc.value.detail
    row = await crm.create_manual_donation(_request(org, "POST"), payload.model_copy(update={"paid_on": None}), db_session, clerk)
    with pytest.raises(HTTPException):  # cancelling needs its own tick
        await crm.cancel_manual_donation(_request(org, "POST"), uuid.UUID(row["id"]), crm.CancelIn(reason="yanlış"), db_session, clerk)

    # the admin's own receipts are not in the clerk's list
    await crm.create_manual_donation(_request(org, "POST"), crm.ManualDonationIn(
        idempotency_key=uuid.uuid4().hex, donor_id=other.id, campaign_id=campaign.id, amount_cents=5_000), db_session, admin)
    seen = await crm.search_donations(_request(org), start=None, end=None, campaign_id=None, status_filter=None,
                                      payment_method=None, currency=None, min_amount_cents=None, max_amount_cents=None,
                                      issued_by=None, assigned=None, on_behalf=None, q=None, page=1, page_size=50,
                                      db=db_session, current_user=clerk)
    assert [i["id"] for i in seen["items"]] == [row["id"]]


async def test_role_api_stores_ticks_and_refuses_unknown_or_ungranted(db_session):
    org, admin, clerk, campaign, mine, other = await _setup(db_session, ["donors.create"])
    created = await staff.create_staff_role(_request(org, "POST"), staff.StaffRoleIn(
        name="Çağrı Merkezi", capabilities=["donors.create", "donors.phone", "sms.send"], permissions=[Permission.REPORT_READ]),
        db_session, admin)
    assert set(created.capabilities) >= {"donors.create", "donors.phone", "sms.send", "reports.view"}
    assert {"donor_manage", "report_read", "admin_read"} <= set(created.permissions)
    with pytest.raises(Exception):
        staff.StaffRoleIn(name="Hatalı", capabilities=["donors.fly"])
    with pytest.raises(HTTPException) as exc:  # the clerk cannot hand out what they do not have
        await staff.create_staff_role(_request(org, "POST"), staff.StaffRoleIn(name="Fazla", capabilities=["donors.phone"]),
                                      db_session, clerk)
    assert exc.value.status_code == 403


def test_mask_phone_formats():
    class Viewer:
        role = UserRole.CRM
        staff_role_id = uuid.uuid4()
        __dict__ = {"staff_role": type("R", (), {"permissions": []})()}
    assert mask_phone("05321234567", Viewer()) == "0532 *** ** 67"
    assert mask_phone(None, Viewer()) is None

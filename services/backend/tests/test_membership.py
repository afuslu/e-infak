import uuid
from datetime import date, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from starlette.requests import Request

from app.api.v1 import campaigns, crm, data_tools, donor_portal, membership, receipt_books
from app.models.campaign import HIDDEN_CAMPAIGN_TAG, Campaign
from app.models.donation import Donation, Donor
from app.models.membership import Member, MemberDue
from app.models.organization import Organization
from app.models.user import User, UserRole


def _request(org, method="GET"):
    request = Request({"type": "http", "method": method, "path": "/api/v1/x", "headers": [], "query_string": b"", "client": ("1.2.3.4", 1)})
    request.state.organization_id = str(org.id)
    request.state.organization = org
    return request


async def _setup(db, plan="orta"):
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


def _person(name, phone, **kw):
    return membership.MemberCreate(person=membership.PersonIn(first_name=name, last_name="Test", phone=phone), **kw)


async def _list(org, admin, db, **kw):
    params = dict(status_filter=None, member_type=None, overdue_only=False, q=None)
    return await membership.list_members(_request(org), **{**params, **kw}, db=db, current_user=admin)


async def test_members_dues_generation_payment_and_cancel(db_session):
    org, admin = await _setup(db_session)
    ali = await membership.create_member(_request(org, "POST"), _person("Ali", "05321112233"), db_session, admin)
    veli = await membership.create_member(_request(org, "POST"), _person("Veli", "05321112244", dues_cents=5_000), db_session, admin)
    yearly = await membership.create_member(_request(org, "POST"), _person("Yıl", "05321112255", dues_period="yearly"), db_session, admin)
    assert [ali["member_no"], veli["member_no"], yearly["member_no"]] == ["1", "2", "3"]
    with pytest.raises(HTTPException) as exc:  # aynı kişi (telefon) ikinci kez üye olamaz
        await membership.create_member(_request(org, "POST"), _person("Ali", "05321112233"), db_session, admin)
    assert exc.value.status_code == 409

    await membership.update_member_settings(_request(org, "PUT"), membership.DuesSettingsIn(
        member_dues_cents=10_000, member_dues_period="monthly"), db_session, admin)
    past = date.today() - timedelta(days=40)
    period = past.strftime("%Y-%m")
    body = dict(period=period, due_date=past)
    preview = await membership.generate_dues(_request(org, "POST"), membership.GenerateIn(**body, dry_run=True), db_session, admin)
    assert (preview["created"], preview["total_cents"], preview["other_period"]) == (2, 15_000, 1)
    await membership.generate_dues(_request(org, "POST"), membership.GenerateIn(**body), db_session, admin)
    again = await membership.generate_dues(_request(org, "POST"), membership.GenerateIn(**body), db_session, admin)
    assert (again["created"], again["already_had"]) == (0, 2)

    overdue = await membership.list_dues(_request(org), "overdue", None, db_session, admin)
    assert sorted(d["amount_cents"] for d in overdue) == [5_000, 10_000] and all(d["days_overdue"] >= 40 for d in overdue)
    flagged = await _list(org, admin, db_session, overdue_only=True)
    assert {m["member_no"] for m in flagged} == {"1", "2"}

    book = await receipt_books.create_book(_request(org, "POST"), receipt_books.BookIn(series="Ü", start_no=1, end_no=10), db_session, admin)
    ali_due = next(d for d in overdue if d["member_no"] == "1")
    paid = await membership.pay_dues(_request(org, "POST"), membership.DuesPaymentIn(
        due_ids=[ali_due["id"]], idempotency_key=uuid.uuid4().hex, receipt_book_id=book["id"], send_receipt=False), db_session, admin)
    assert paid["official_receipt_no"] == "Ü-1" and paid["amount_cents"] == 10_000
    donation = await db_session.get(Donation, uuid.UUID(paid["donation_id"]))
    campaign = await db_session.get(Campaign, donation.campaign_id)
    assert campaign.title == "Üye Aidatı" and HIDDEN_CAMPAIGN_TAG in campaign.tags
    due = await db_session.get(MemberDue, uuid.UUID(ali_due["id"]))
    assert due.status == "paid" and due.donation_id == donation.id
    with pytest.raises(HTTPException):  # ikinci kez tahsil edilemez
        await membership.pay_dues(_request(org, "POST"), membership.DuesPaymentIn(
            due_ids=[ali_due["id"]], idempotency_key=uuid.uuid4().hex), db_session, admin)

    summary = await membership.dues_summary(_request(org), None, db_session, admin)
    assert (summary["members"]["active"], summary["overdue_cents"], summary["overdue_members"], summary["collected_cents"]) == (3, 5_000, 1, 10_000)

    # Makbuz iptal edilirse aidat yeniden açılır.
    await crm.cancel_manual_donation(_request(org, "POST"), donation.id, crm.CancelIn(reason="Yanlış üye"), db_session, admin)
    await db_session.refresh(due)
    assert due.status == "open" and due.donation_id is None

    waived = await membership.waive_dues(_request(org, "POST"), membership.WaiveIn(
        due_ids=[due.id], reason="Yönetim kurulu kararı"), db_session, admin)
    assert waived["waived"] == 1

    # Aidat kalemi sitedeki kampanya listesinde görünmez.
    listed = await campaigns.list_campaigns(_request(org), 1, 25, None, None, None, None, db_session)
    assert all(c.title != "Üye Aidatı" for c in listed.items)

    # Bağışçı paneli üyelik ve aidatları gösterir.
    donor = await db_session.get(Donor, uuid.UUID(ali["donor_id"]))
    mine = await donor_portal.my_member_dues(donor, db_session)
    assert mine[0]["member_no"] == "1" and mine[0]["dues"][0]["status"] == "waived"


async def test_duplicate_members_after_donor_merge_and_vcard(db_session):
    org, admin = await _setup(db_session)
    first = await membership.create_member(_request(org, "POST"), _person("Hasan", "05551112233", dues_period="yearly"), db_session, admin)
    second = await membership.create_member(_request(org, "POST"), membership.MemberCreate(
        person=membership.PersonIn(first_name="Hasan", last_name="Test", email="h@example.com"), dues_period="yearly"),
        db_session, admin)
    for m in (first, second):
        await membership.generate_dues(_request(org, "POST"), membership.GenerateIn(
            period="2026", amount_cents=50_000, member_ids=[m["id"]]), db_session, admin)
    second_due = (await db_session.execute(select(MemberDue).where(MemberDue.member_id == uuid.UUID(second["id"])))).scalar_one()
    second_due.status = "paid"
    await db_session.flush()

    # İki ayrı bağışçı kartı birleşince aynı kişiye iki üyelik kalır -> çift üye.
    await data_tools.merge_donors(_request(org, "POST"), data_tools.MergeIn(
        target_id=uuid.UUID(first["donor_id"]), source_ids=[uuid.UUID(second["donor_id"])]), db_session, admin)
    groups = (await membership.duplicate_members(_request(org), db_session, admin))["groups"]
    assert len(groups) == 1 and groups[0]["reason"] == "Aynı kişi, Telefon"

    merged = await membership.merge_members(_request(org, "POST"), membership.MemberMergeIn(
        target_id=uuid.UUID(first["id"]), source_ids=[uuid.UUID(second["id"])]), db_session, admin)
    assert (merged["moved_dues"], merged["dropped_dues"]) == (1, 0)
    dues = (await db_session.execute(select(MemberDue).where(MemberDue.member_id == uuid.UUID(first["id"])))).scalars().all()
    assert [(d.period, d.status) for d in dues] == [("2026", "paid")]  # ödenmiş olan kaldı
    assert (await db_session.execute(select(Member).where(Member.id == uuid.UUID(second["id"])))).first() is None

    card = await membership.members_vcard(_request(org), None, db_session, admin)
    text = card.body.decode()
    assert text.count("BEGIN:VCARD") == 1 and "FN:Hasan Test" in text and "TEL;TYPE=CELL:05551112233" in text

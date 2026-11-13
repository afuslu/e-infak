import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from starlette.requests import Request

from app.api.v1 import crm, field_ops, kurban, sponsorship
from app.models.campaign import Campaign
from app.models.donation import Donation, DonationStatus, Donor
from app.models.fx import FxRate
from app.models.kurban import KurbanShare
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.services import fx
from app.services.donation_hooks import schedule_installments
from app.models.sponsorship import Pledge


def _request(org, method="GET"):
    request = Request({"type": "http", "method": method, "path": "/api/v1/x", "headers": [], "query_string": b"", "client": ("1.2.3.4", 1)})
    request.state.organization_id = str(org.id)
    request.state.organization = org
    return request


async def _setup(db, role=UserRole.STK_ADMIN):
    slug = f"o-{uuid.uuid4().hex[:8]}"
    org = Organization(slug=slug, name="Test Derneği", legal_name=slug, email=f"{slug}@example.com",
                       primary_domain=f"{slug}.example.com", plan="ileri", enabled_addons=[], extra_user_seats=0)
    db.add(org)
    await db.flush()
    admin = User(organization_id=org.id, email=f"{slug}@example.com", hashed_password="x",
                 first_name="Ayşe", last_name="Y", role=role)
    db.add(admin)
    await db.flush()
    return org, admin


def _manual(campaign_id, amount, **extra):
    base = dict(idempotency_key=uuid.uuid4().hex, campaign_id=campaign_id, amount_cents=amount, payment_method="cash")
    if "donor_id" not in extra:
        base["donor"] = crm.ManualDonor(first_name=extra.pop("first_name", "Ali"), phone=extra.pop("phone", None))
    return crm.ManualDonationIn(**base, **extra)


async def _queued_sms(db, org):
    from app.models.sms_message import SmsMessage
    return (await db.execute(select(SmsMessage).where(SmsMessage.organization_id == org.id))).scalars().all()


async def test_kurban_flow_shares_distribution_slaughter_and_papers(db_session):
    org, admin = await _setup(db_session)
    created = await kurban.create_campaign(_request(org, "POST"), kurban.KurbanCampaignIn(
        title="Çad Büyükbaş 2026", price_per_share_cents=500_000, country="Çad", season_year=2026,
        animal_prefix="CD", create_donation_campaign=True,
    ), db_session, admin)
    donation_campaign_id = uuid.UUID(created["donation_campaign_id"])
    campaign = await db_session.get(Campaign, donation_campaign_id)
    assert [f["key"] for f in campaign.checkout_fields_schema] == ["kurban_type", "kurban_names"]

    # 3 shares in one donation, 5 more from another, 1 below share price (no share)
    await crm.create_manual_donation(_request(org, "POST"), _manual(
        donation_campaign_id, 1_500_000, first_name="Hasan", phone="05321112233",
        metadata={"kurban_type": "Adak", "kurban_names": ["Hasan", "Fatma", "Ahmet"]}), db_session, admin)
    await crm.create_manual_donation(_request(org, "POST"), _manual(
        donation_campaign_id, 2_500_000, first_name="Zeynep", phone="05329998877"), db_session, admin)
    small = await crm.create_manual_donation(_request(org, "POST"), _manual(
        donation_campaign_id, 100_000, first_name="Küçük"), db_session, admin)
    shares = (await db_session.execute(select(KurbanShare).where(KurbanShare.organization_id == org.id))).scalars().all()
    assert len(shares) == 8
    assert sorted(s.on_behalf_of for s in shares if s.kurban_type == "adak") == ["Ahmet", "Fatma", "Hasan"]
    assert (await db_session.get(Donation, uuid.UUID(small["id"]))).payment_details["kurban_note"]

    kc_id = uuid.UUID(created["id"])
    result = await kurban.distribute_shares(_request(org, "POST"), kc_id, db_session, admin)
    assert result == {"assigned": 8, "new_animals": 2}
    animals = await kurban.list_animals(_request(org), kc_id, None, None, db_session, admin)
    assert [a["animal_number"] for a in animals] == ["CD-001", "CD-002"]
    # Each donation's shares stay together on one animal
    by_animal = {a["animal_number"]: {s["donor_name"] for s in a["shares"]} for a in animals}
    assert all(len(names) == 1 for names in by_animal.values())
    assert sorted(len(a["shares"]) for a in animals) == [3, 5]

    summary = await kurban.campaign_summary(_request(org), kc_id, db_session, admin)
    assert summary["shares"] == 8 and summary["unassigned_shares"] == 0 and summary["expected_animals"] == 2

    pdf = await kurban.campaign_papers(_request(org), kc_id, "waiting", db_session, admin)
    assert pdf.body.startswith(b"%PDF")

    first = uuid.UUID(animals[0]["id"])
    res = await kurban.slaughter_animals(_request(org, "POST"), kurban.SlaughterRequest(
        items=[kurban.SlaughterItem(animal_id=first, video_url="https://youtu.be/abc")]), db_session, admin)
    assert res["marked"] == 1 and res["sms_queued"] == 1  # one SMS per phone, not per share
    again = await kurban.slaughter_animals(_request(org, "POST"), kurban.SlaughterRequest(
        items=[kurban.SlaughterItem(animal_id=first)]), db_session, admin)
    assert again["sms_queued"] == 0
    queued = await _queued_sms(db_session, org)  # in the organisation's own SMS queue, once
    assert len(queued) == 1 and queued[0].source == "kurban" and queued[0].related_type == "kurban_share"
    assert "kesilmiştir" in queued[0].body and "{" not in queued[0].body

    # A receipt whose kurban was slaughtered cannot be cancelled
    slaughtered_share = (await db_session.execute(select(KurbanShare).where(KurbanShare.animal_id == first))).scalars().first()
    with pytest.raises(HTTPException) as exc:
        await crm.cancel_manual_donation(_request(org, "POST"), slaughtered_share.donation_id,
                                         crm.CancelIn(reason="deneme"), db_session, admin)
    assert exc.value.status_code == 409

    with pytest.raises(HTTPException):
        await kurban.update_share(_request(org, "PUT"), slaughtered_share.id, kurban.ShareUpdate(unassign=True), db_session, admin)


async def test_cancelling_unslaughtered_kurban_receipt_removes_shares(db_session):
    org, admin = await _setup(db_session)
    created = await kurban.create_campaign(_request(org, "POST"), kurban.KurbanCampaignIn(
        title="Küçükbaş", price_per_share_cents=300_000, animal_type="sheep", create_donation_campaign=True,
    ), db_session, admin)
    row = await crm.create_manual_donation(_request(org, "POST"), _manual(
        uuid.UUID(created["donation_campaign_id"]), 600_000), db_session, admin)
    await crm.cancel_manual_donation(_request(org, "POST"), uuid.UUID(row["id"]), crm.CancelIn(reason="hata"), db_session, admin)
    left = (await db_session.execute(select(KurbanShare).where(KurbanShare.organization_id == org.id))).scalars().all()
    assert left == []


def test_installment_schedule_clamps_month_end():
    pledge = Pledge(installment_amount_cents=1000, installment_count=3, start_date=date(2026, 1, 31))
    assert [i.due_date for i in schedule_installments(pledge)] == [date(2026, 1, 31), date(2026, 2, 28), date(2026, 3, 31)]


async def test_sponsorship_pledge_auto_payment_and_manual_match(db_session):
    org, admin = await _setup(db_session)
    campaign = Campaign(organization_id=org.id, slug="burs", title="Burs", summary="s", target_cents=0)
    donor = Donor(organization_id=org.id, first_name="Sponsor", phone="905550001122", total_donations=0, total_donated_cents=0)
    db_session.add_all([campaign, donor])
    await db_session.flush()
    b = await sponsorship.create_beneficiary(_request(org, "POST"), sponsorship.BeneficiaryIn(
        kind="hoca", first_name="Ömer", last_name="Hoca", monthly_need_cents=200_000), db_session, admin)
    start = date.today() - timedelta(days=40)
    pledge = await sponsorship.create_pledge(_request(org, "POST"), sponsorship.PledgeIn(
        donor_id=donor.id, beneficiary_id=uuid.UUID(b["id"]), campaign_id=campaign.id,
        installment_amount_cents=200_000, installment_count=3, start_date=start), db_session, admin)
    assert pledge["overdue_count"] == 2  # two months already due, unpaid

    # One donation of 2 installments' worth pays the two oldest
    await crm.create_manual_donation(_request(org, "POST"), _manual(campaign.id, 450_000, donor_id=donor.id), db_session, admin)
    after = await sponsorship.get_pledge(_request(org), uuid.UUID(pledge["id"]), db_session, admin)
    assert [i["status"] for i in after["installments"]] == ["paid", "paid", "pending"]

    # Manual match of the last installment to a separate donation
    extra = await crm.create_manual_donation(_request(org, "POST"), _manual(
        campaign.id, 100_000, donor_id=donor.id), db_session, admin)  # too small to auto-pay
    with pytest.raises(HTTPException):
        await sponsorship.match_installment(_request(org, "POST"), uuid.UUID(after["installments"][2]["id"]),
                                            sponsorship.InstallmentMatch(donation_id=uuid.UUID(extra["id"])), db_session, admin)
    big = await crm.create_manual_donation(_request(org, "POST"), _manual(
        campaign.id, 200_000, donor_id=donor.id, metadata={"pledge_installment_id": after["installments"][2]["id"]}),
        db_session, admin)
    done = await sponsorship.get_pledge(_request(org), uuid.UUID(pledge["id"]), db_session, admin)
    assert done["status"] == "completed"

    # Cancelling the receipt reopens the installment and the pledge
    await crm.cancel_manual_donation(_request(org, "POST"), uuid.UUID(big["id"]), crm.CancelIn(reason="iade"), db_session, admin)
    reopened = await sponsorship.get_pledge(_request(org), uuid.UUID(pledge["id"]), db_session, admin)
    assert reopened["status"] == "active" and reopened["installments"][2]["status"] == "pending"

    sponsored = await sponsorship.list_beneficiaries(_request(org), None, True, None, None, db_session, admin)
    assert [r["full_name"] for r in sponsored] == ["Ömer Hoca"]


async def test_hisseli_water_well_funding(db_session):
    org, admin = await _setup(db_session)
    with pytest.raises(ValueError):
        sponsorship.WaterWellIn(name="Kuyu", location_name="Nijer", funding_model="hisseli")
    well = await sponsorship.create_water_well(_request(org, "POST"), sponsorship.WaterWellIn(
        name="Hz. Ömer Kuyusu", location_name="Niamey", country="Nijer", funding_model="hisseli",
        share_count=10, share_price_cents=100_000, create_donation_campaign=True), db_session, admin)
    assert well["target_cents"] == 1_000_000
    await crm.create_manual_donation(_request(org, "POST"), _manual(
        uuid.UUID(well["donation_campaign_id"]), 300_000, on_behalf_of="Annem"), db_session, admin)
    wells = await sponsorship.list_water_wells(_request(org), None, None, db_session, admin)
    assert wells[0]["shares_sold"] == 3 and wells[0]["shares_left"] == 7 and wells[0]["progress_pct"] == 30.0
    shares = await sponsorship.list_well_shares(_request(org), uuid.UUID(well["id"]), db_session, admin)
    assert shares[0]["on_behalf_of"] == "Annem"


async def test_kumbara_collection_becomes_donation_and_report(db_session):
    org, admin = await _setup(db_session)
    campaign = Campaign(organization_id=org.id, slug="genel", title="Genel", summary="s", target_cents=0)
    db_session.add(campaign)
    await db_session.flush()
    region = await field_ops.create_region(_request(org, "POST"), field_ops.RegionIn(name="Fatih"), db_session, admin)
    box = await field_ops.create_money_box(_request(org, "POST"), field_ops.MoneyBoxIn(
        location_name="Yılmaz Bakkal", region_id=region["id"], campaign_id=campaign.id), db_session, admin)
    assert box["code"] == "KMB-0001"
    payload = field_ops.CollectionIn(idempotency_key=uuid.uuid4().hex, amount_cents=125_050)
    first = await field_ops.collect_money_box(_request(org, "POST"), uuid.UUID(box["id"]), payload, db_session, admin)
    dup = await field_ops.collect_money_box(_request(org, "POST"), uuid.UUID(box["id"]), payload, db_session, admin)
    assert dup["duplicate"]
    donation = await db_session.get(Donation, uuid.UUID(first["donation_id"]))
    assert donation.status == DonationStatus.CONFIRMED and donation.payment_provider == "money_box"
    await db_session.refresh(campaign)
    assert campaign.collected_cents == 125_050
    report = await field_ops.money_box_report(_request(org), None, None, db_session, admin)
    assert report["total_cents"] == 125_050 and report["by_region"][0]["label"] == "Fatih"
    # The collection can be cancelled like a manual receipt
    await crm.cancel_manual_donation(_request(org, "POST"), donation.id, crm.CancelIn(reason="yanlış tutar"), db_session, admin)
    report = await field_ops.money_box_report(_request(org), None, None, db_session, admin)
    assert report["total_cents"] == 0


async def test_aid_distribution_respects_stock(db_session):
    org, admin = await _setup(db_session)
    package = await field_ops.create_aid_package(_request(org, "POST"), field_ops.AidPackageIn(
        name="Ramazan Kolisi", unit_cost_cents=150_000, stock=1), db_session, admin)
    homes = [
        await field_ops.create_aid_recipient(_request(org, "POST"), field_ops.AidRecipientIn(full_name=f"Hane {i}"), db_session, admin)
        for i in range(2)
    ]
    await field_ops.plan_distributions(_request(org, "POST"), field_ops.DistributionPlan(
        package_id=uuid.UUID(package["id"]), recipient_ids=[uuid.UUID(h["id"]) for h in homes]), db_session, admin)
    rows = await field_ops.list_distributions(_request(org), "planned", None, None, db_session, admin)
    ids = [uuid.UUID(r["id"]) for r in rows]
    with pytest.raises(HTTPException) as exc:
        await field_ops.update_distributions(_request(org, "POST"), field_ops.DistributionUpdate(ids=ids, status="delivered"), db_session, admin)
    assert exc.value.status_code == 409
    await field_ops.update_distributions(_request(org, "POST"), field_ops.DistributionUpdate(ids=ids[:1], status="delivered"), db_session, admin)
    report = await field_ops.aid_report(_request(org), db_session, admin)
    assert report["packages"][0]["stock"] == 0 and report["packages"][0]["delivered"] == 1


async def test_task_permissions(db_session):
    org, admin = await _setup(db_session)
    worker = User(organization_id=org.id, email=f"{uuid.uuid4().hex[:8]}@example.com", hashed_password="x",
                  first_name="Saha", last_name="P", role=UserRole.READONLY)
    other = User(organization_id=org.id, email=f"{uuid.uuid4().hex[:8]}@example.com", hashed_password="x",
                 first_name="Diğer", last_name="P", role=UserRole.READONLY)
    db_session.add_all([worker, other])
    await db_session.flush()
    task = await field_ops.create_task(_request(org, "POST"), field_ops.TaskIn(
        title="Kumbaraları topla", priority="high", assigned_to_id=worker.id, due_date=date.today() - timedelta(days=1)),
        db_session, admin)
    assert task["overdue"] and task["assigned_to_name"] == "Saha P"
    mine = await field_ops.list_tasks(_request(org), "mine", None, None, None, None, None, None, db_session, worker)
    assert [t["title"] for t in mine] == ["Kumbaraları topla"]
    with pytest.raises(HTTPException):  # readonly staff cannot assign work to others
        await field_ops.create_task(_request(org, "POST"), field_ops.TaskIn(title="x", assigned_to_id=other.id), db_session, worker)
    with pytest.raises(HTTPException):  # unrelated staff cannot edit
        await field_ops.update_task(_request(org, "PUT"), uuid.UUID(task["id"]), field_ops.TaskIn(status="done"), db_session, other)
    done = await field_ops.update_task(_request(org, "PUT"), uuid.UUID(task["id"]), field_ops.TaskIn(status="done"), db_session, worker)
    assert done["status"] == "done" and done["completed_at"]
    visible = await field_ops.list_tasks(_request(org), "all", None, None, None, None, None, None, db_session, other)
    assert visible == []


async def test_currency_conversion_uses_fresh_rates_only(db_session):
    await db_session.execute(FxRate.__table__.delete())
    assert await fx.convert(db_session, 10_000, "USD", "TRY") == (None, "USD->TRY için güncel TCMB kuru yok")
    db_session.add(FxRate(currency="USD", rate_try=Decimal("40.000000"), fetched_at=datetime.now(timezone.utc)))
    db_session.add(FxRate(currency="EUR", rate_try=Decimal("45.000000"), fetched_at=datetime.now(timezone.utc) - timedelta(days=30)))
    await db_session.flush()
    converted, note = await fx.convert(db_session, 10_000, "USD", "TRY")
    assert converted == 400_000 and "40" in note
    assert (await fx.convert(db_session, 400_000, "TRY", "USD"))[0] == 10_000
    assert (await fx.convert(db_session, 100, "EUR", "TRY"))[0] is None  # stale EUR rate

    org, admin = await _setup(db_session)
    usd_campaign = Campaign(organization_id=org.id, slug="usd", title="Cami", summary="s", target_cents=5_000_000, currency="USD")
    db_session.add(usd_campaign)
    await db_session.flush()
    row = await crm.create_manual_donation(_request(org, "POST"), _manual(usd_campaign.id, 400_000), db_session, admin)
    await db_session.refresh(usd_campaign)
    assert usd_campaign.collected_cents == 10_000  # 4.000 TL = 100 USD
    await crm.cancel_manual_donation(_request(org, "POST"), uuid.UUID(row["id"]), crm.CancelIn(reason="test"), db_session, admin)
    await db_session.refresh(usd_campaign)
    assert usd_campaign.collected_cents == 0


async def test_paid_order_finalisation_creates_donation_and_outbox(db_session):
    """Regression: the donation id must exist before outbox events reference it."""
    from sqlalchemy.orm import selectinload
    from app.api.v1.checkout import _finalize_paid_order
    from app.models.automation import OutboxEvent
    from app.models.payment import PaymentAttempt, PaymentOrder, PaymentOrderItem, PaymentOrderStatus

    org, admin = await _setup(db_session)
    campaign = Campaign(organization_id=org.id, slug="g", title="Genel", summary="s", target_cents=0)
    donor = Donor(organization_id=org.id, first_name="Ali", last_name="V", total_donations=0, total_donated_cents=0)
    db_session.add_all([campaign, donor])
    await db_session.flush()
    order = PaymentOrder(organization_id=org.id, donor_id=donor.id, merchant_payment_id=f"T-{uuid.uuid4().hex}",
                         idempotency_key=uuid.uuid4().hex, payment_method="bank_transfer",
                         status=PaymentOrderStatus.AWAITING_TRANSFER, total_cents=5_000, currency="TRY")
    db_session.add(order)
    await db_session.flush()
    db_session.add(PaymentOrderItem(order_id=order.id, campaign_id=campaign.id, quantity=1, unit_amount_cents=5_000,
                                    total_amount_cents=5_000, metadata_json={"on_behalf_of": "Annem"}))
    attempt = PaymentAttempt(order_id=order.id, provider="bank_transfer", pg_tran_id="B-1", response_code="00")
    db_session.add(attempt)
    await db_session.flush()
    order = (await db_session.execute(
        select(PaymentOrder).options(
            selectinload(PaymentOrder.items).selectinload(PaymentOrderItem.campaign), selectinload(PaymentOrder.donor),
        ).where(PaymentOrder.id == order.id)
    )).scalar_one()
    ids = await _finalize_paid_order(db_session, order, attempt, commit=False, issued_by_id=admin.id)
    donation = await db_session.get(Donation, uuid.UUID(ids[0]))
    assert donation.on_behalf_of == "Annem" and donation.issued_by_id == admin.id
    events = (await db_session.execute(select(OutboxEvent).where(OutboxEvent.aggregate_id == donation.id))).scalars().all()
    assert {e.event_type for e in events} == {"receipt.send", "webhook.donation.paid"}
    await db_session.refresh(campaign)
    assert campaign.collected_cents == 5_000

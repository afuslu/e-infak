"""Kampanya bağış ayarları: sunucu denetimi, süreli talimat, adet çarpanı, bloklardan kopyalama."""
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select

from app.api.v1 import checkout
from app.api.v1.campaigns import create_campaign, update_campaign
from app.models.campaign import Campaign, CampaignStatus
from app.models.cms import SitePage
from app.models.donation import Donation
from app.models.fx import FxRate
from app.models.subscription import Subscription
from app.schemas.campaign import CampaignCreate, CampaignUpdate, DonationOptions
from app.schemas.checkout import CheckoutSessionCreate
from app.services import recurring
from app.services.donation_options import copy_from_blocks
from app.services.receipt_lines import receipt_print_data
from tests.test_orta_modules import _request, _setup


async def _campaign(db, org, options, price=100_000, **extra):
    data = {"title": f"K {uuid.uuid4().hex[:6]}", "summary": "", "target_cents": 0, "status": "active",
            "reference_amounts": {"TRY": price} if price else {}, "donation_options": options, **extra}
    return await create_campaign(_request(org, "POST"), CampaignCreate(**data), db, None)


async def _order(db, org, campaign, amount, meta=None, quantity=1, currency="TRY"):
    payload = CheckoutSessionCreate(
        items=[{"campaign_id": str(campaign.id), "unit_amount_cents": amount, "metadata": meta or {}, "quantity": quantity}],
        donor={"first_name": "Ayşe", "last_name": "Yılmaz", "phone": "05321112233"}, currency=currency,
        payment_method="bank_transfer", idempotency_key=uuid.uuid4().hex, kvkk_accepted=True, terms_accepted=True)
    order_id = (await checkout.create_checkout_session(_request(org, "POST"), payload, db, None)).checkout_id
    return await checkout._load_order(db, order_id)


async def _refused(*args, **kw):
    with pytest.raises(HTTPException) as err:
        await _order(*args, **kw)
    assert err.value.status_code == 400


async def _confirm(db, org, admin, order):
    await checkout.confirm_bank_transfer(_request(org, "POST"), order.id, uuid.uuid4().hex, db, admin)


DURATION = {"mode": "duration", "durations": [12, 1, 6], "duration_payment": "donor_choice"}


async def test_no_options_is_unrestricted(db_session):
    org, _ = await _setup(db_session)
    c = await _campaign(db_session, org, {}, price=None)
    await _order(db_session, org, c, 123_456, {"periyot": "aylik"}, quantity=7)


async def test_fixed_quantity_and_derived_columns(db_session):
    org, _ = await _setup(db_session)
    c = await _campaign(db_session, org, {"mode": "quantity", "min_qty": 2, "max_qty": 5}, price=500, min_donation_cents=1000)
    assert c.fixed_amount and not c.allow_custom_amount and c.suggested_amounts_cents == [500] and c.min_donation_cents == 500
    await _order(db_session, org, c, 500, quantity=3)
    await _refused(db_session, org, c, 500, quantity=1)
    await _refused(db_session, org, c, 500, quantity=6)
    await _refused(db_session, org, c, 600, quantity=3)
    await _refused(db_session, org, c, 500, {"periyot": "aylik"}, quantity=3)


async def test_free_mode_intents_and_recurring(db_session):
    org, _ = await _setup(db_session)
    c = await _campaign(db_session, org, {"mode": "free", "intents": ["Adak", "Şükür"], "allow_recurring": True}, price=None)
    await _order(db_session, org, c, 77_700, {"niyet": "Adak", "periyot": "aylik"})
    await _refused(db_session, org, c, 77_700, {"niyet": "Başka"})


async def test_packages(db_session):
    org, _ = await _setup(db_session)
    c = await _campaign(db_session, org, {"mode": "packages", "packages": [
        {"id": "a", "label": "1 koli", "amount_cents": 50_000}, {"id": "b", "label": "2 koli", "amount_cents": 90_000}]}, price=None)
    order = await _order(db_session, org, c, 90_000, {"paket_id": "b"})
    assert order.items[0].metadata_json["paket"] == "2 koli"
    assert (await _order(db_session, org, c, 50_000)).items[0].metadata_json["paket_id"] == "a"  # older app
    await _refused(db_session, org, c, 50_000, {"paket_id": "b"})
    await _refused(db_session, org, c, 60_000)


async def test_duration_amounts(db_session):
    org, _ = await _setup(db_session)
    c = await _campaign(db_session, org, DURATION)
    assert c.donation_options["durations"] == [1, 6, 12]
    order = await _order(db_session, org, c, 1_200_000, {"sure_ay": 12})
    assert "periyot" not in order.items[0].metadata_json
    assert (await _order(db_session, org, c, 100_000, {"sure_ay": 12, "periyot": "aylik"})).items[0].metadata_json["periyot"] == "aylik"
    assert (await _order(db_session, org, c, 600_000)).items[0].metadata_json["sure_ay"] == 6
    await _refused(db_session, org, c, 100_000, {"sure_ay": 12})
    await _refused(db_session, org, c, 300_000, {"sure_ay": 3})
    await _refused(db_session, org, c, 1_200_000, {"sure_ay": 12}, quantity=2)
    await _refused(db_session, org, c, 100_000, {"sure_ay": "x"})

    prepaid = await _campaign(db_session, org, {**DURATION, "duration_payment": "prepaid"})
    await _refused(db_session, org, prepaid, 100_000, {"sure_ay": 12, "periyot": "aylik"})
    monthly = await _campaign(db_session, org, {**DURATION, "duration_payment": "monthly"})
    await _order(db_session, org, monthly, 100_000, {"sure_ay": 6})
    await _refused(db_session, org, monthly, 600_000, {"sure_ay": 6})
    await _refused(db_session, org, monthly, 600_000)


async def test_prepaid_opens_no_instruction_and_monthly_ends(db_session):
    org, admin = await _setup(db_session)
    c = await _campaign(db_session, org, DURATION)

    async def subs():
        return (await db_session.execute(select(Subscription).where(Subscription.campaign_id == c.id))).scalars().all()

    for amount, meta in ((600_000, {"sure_ay": 6, "periyot": "tek_sefer"}), (100_000, {"sure_ay": 1, "periyot": "aylik"})):
        await _confirm(db_session, org, admin, await _order(db_session, org, c, amount, meta))
    assert await subs() == []
    await _confirm(db_session, org, admin, await _order(db_session, org, c, 100_000, {"sure_ay": 6, "periyot": "aylik"}))
    [sub] = await subs()
    assert (sub.total_charges, sub.charges_done, sub.status, sub.amount_cents) == (6, 1, "active", 100_000)
    await db_session.refresh(sub, ["donor", "campaign"])
    assert f"taksit={sub.manage_token}" in recurring.links(org, sub)["odeme_linki"]
    for _ in range(5):
        assert sub.status == "active"
        await recurring.remind(db_session, sub)
    assert (sub.charges_done, sub.status) == (6, "completed")

    # Paying one month from the reminder link does not open a second instruction.
    await _confirm(db_session, org, admin, await _order(db_session, org, c, 100_000, {"talimat": sub.manage_token, "periyot": "aylik", "sure_ay": 6}))
    assert len(await subs()) == 1
    await _refused(db_session, org, c, 100, {"talimat": sub.manage_token})
    await _refused(db_session, org, c, 100_000, {"talimat": "uydurma-anahtar"})


async def test_foreign_currency(db_session):
    org, _ = await _setup(db_session)
    org.settings = {**(org.settings or {}), "enabled_payment_currencies": ["TRY", "USD", "EUR"]}
    await db_session.execute(FxRate.__table__.delete())
    db_session.add(FxRate(currency="EUR", rate_try=Decimal("50"), fetched_at=datetime.now(timezone.utc)))
    await db_session.flush()
    c = await _campaign(db_session, org, {"mode": "fixed"}, reference_amounts={"TRY": 100_000, "USD": 2_500})
    await _order(db_session, org, c, 2_500, currency="USD")
    await _refused(db_session, org, c, 2_400, currency="USD")
    await _order(db_session, org, c, 2_050, currency="EUR")  # 2.000 at the rate, rounding allowed
    await _refused(db_session, org, c, 1_000, currency="EUR")


async def test_multiplier_reaches_receipt(db_session):
    org, admin = await _setup(db_session)
    c = await _campaign(db_session, org, {"mode": "quantity"}, quantity_multiplier=7)
    order = await _order(db_session, org, c, 100_000, quantity=2)
    await _confirm(db_session, org, admin, order)
    d = (await db_session.execute(select(Donation).where(Donation.payment_order_item_id == order.items[0].id))).scalar_one()
    assert d.payment_details["adet"] == 14 and (await receipt_print_data(db_session, d))["quantity"] == 14


async def test_schema_and_panel_rules(db_session):
    for bad in ({"mode": "duration"}, {"mode": "packages"}, {"mode": "quantity", "min_qty": 9, "max_qty": 2},
                {"mode": "x"}, {"mode": "duration", "durations": [0]}):
        with pytest.raises(ValidationError):
            DonationOptions(**bad)
    org, _ = await _setup(db_session)
    with pytest.raises(HTTPException):
        await _campaign(db_session, org, {"mode": "fixed"}, price=None)
    c = await _campaign(db_session, org, {"mode": "fixed"})
    c = await update_campaign(_request(org, "PATCH"), c.id, CampaignUpdate(donation_options={"mode": "free"}, allow_custom_amount=True), db_session, None)
    assert not c.fixed_amount and c.allow_custom_amount


async def test_copy_from_blocks(db_session):
    org, _ = await _setup(db_session)

    async def plain():
        return await _campaign(db_session, org, {}, price=None)

    a, b, done = await plain(), await plain(), await _campaign(db_session, org, {"mode": "fixed"})
    card = {"unit_amount": 1000, "durations": "12, 18"}
    db_session.add(SitePage(organization_id=org.id, slug="x", title="x", blocks=[{"type": "donation_cards", "props": {"cards": [
        {"campaign_id": str(a.id), **card}, {"campaign_id": str(done.id), **card},
        {"campaign_id": str(b.id), **card}, {"campaign_id": str(b.id), "unit_amount": 5, "quantity": "adet"}]}}]))
    await db_session.flush()
    report = "\n".join(await copy_from_blocks(db_session, org.id, False))
    assert "YAZILACAK" in report and "ATLANDI" in report and "ÇELİŞKİ" in report and not a.donation_options
    await copy_from_blocks(db_session, org.id, True)
    assert a.donation_options["durations"] == [12, 18] and a.reference_amounts["TRY"] == 100_000 and not b.donation_options

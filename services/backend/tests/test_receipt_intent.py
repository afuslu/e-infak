"""Kurban niyeti: site kartından / makbuz formundan hisseye ve basılan makbuza."""
import uuid

import pytest
from sqlalchemy import select

from app.api.v1 import checkout, crm, kurban, public_forms
from app.cli import repair_kurban_intents
from app.models.campaign import Campaign, CampaignStatus
from app.models.donation import Donation
from app.models.kurban import KurbanShare
from app.schemas.checkout import CheckoutSessionCreate
from app.services.donation_hooks import intent_label, normalize_kurban_type
from app.services.receipt_lines import donation_intents, receipt_print_data
from app.utils import receipt_pdf
from tests.test_orta_modules import _manual, _request, _setup


@pytest.mark.parametrize("value,key", [
    ("Adak", "adak"), ("Adak Kurban", "adak"), ("AKİKA KURBANI", "akika"), ("Şükür Kurban", "sukur"),
    ("Şifa", "sifa"), ("ŞİFA", "sifa"), ("sukur", "sukur"), (None, "vacip"), ("bilinmeyen", "vacip"),
])
def test_intention_names(value, key):
    assert normalize_kurban_type(value) == key


def test_own_wording_is_kept():
    assert intent_label("Hayır Niyeti") == "Hayır Niyeti"
    assert intent_label("Adak Kurban") == "Adak" and intent_label("") is None and intent_label(["x"]) is None


async def _kurban(db, org, admin):
    created = await kurban.create_campaign(_request(org, "POST"), kurban.KurbanCampaignIn(
        title="Keçi", price_per_share_cents=500_000, season_year=2026, animal_prefix="K",
        create_donation_campaign=True), db, admin)
    return uuid.UUID(created["donation_campaign_id"])


async def _order(db, org, campaign_id, metadata):
    payload = CheckoutSessionCreate(
        items=[{"campaign_id": str(campaign_id), "unit_amount_cents": 500_000, "metadata": metadata}],
        donor={"first_name": "Ayşe", "last_name": "Yılmaz", "phone": "05321112233"},
        payment_method="bank_transfer", idempotency_key=uuid.uuid4().hex, kvkk_accepted=True, terms_accepted=True)
    response = await checkout.create_checkout_session(_request(org, "POST"), payload, db, None)
    return response.checkout_id


async def test_site_card_intention_reaches_share_and_receipt(db_session):
    org, admin = await _setup(db_session)
    campaign_id = await _kurban(db_session, org, admin)
    # The card only sends "niyet"; the linked campaign requires "kurban_type".
    order_id = await _order(db_session, org, campaign_id, {"niyet": "Adak Kurban", "ad_soyad_adina": "Fatma Hanım"})
    await checkout.confirm_bank_transfer(_request(org, "POST"), order_id, uuid.uuid4().hex, db_session, admin)
    order = await checkout._load_order(db_session, order_id)
    d = (await db_session.execute(select(Donation).where(Donation.payment_order_item_id == order.items[0].id))).scalar_one()
    share = (await db_session.execute(select(KurbanShare).where(KurbanShare.donation_id == d.id))).scalar_one()
    assert share.kurban_type == "adak" and d.on_behalf_of == share.on_behalf_of == "Fatma Hanım"
    assert (await receipt_print_data(db_session, d))["intent"] == "Adak"
    assert order.items[0].metadata_json["kurban_type"] == "Adak Kurban"
    assert order.items[0].metadata_json["on_behalf_of"] == "Fatma Hanım"


async def _manual_kurban(db, org, admin, campaign_id, metadata, **extra):
    row = await crm.create_manual_donation(
        _request(org, "POST"), _manual(campaign_id, 500_000, metadata=metadata, **extra), db, admin)
    return await db.get(Donation, uuid.UUID(row["id"]))


async def test_manual_receipt_intention_and_staff_edit(db_session):
    org, admin = await _setup(db_session)
    campaign_id = await _kurban(db_session, org, admin)
    d = await _manual_kurban(db_session, org, admin, campaign_id, {"niyet": "Şükür Kurban"})
    share = (await db_session.execute(select(KurbanShare).where(KurbanShare.donation_id == d.id))).scalar_one()
    assert share.kurban_type == "sukur"
    assert await donation_intents(db_session, [d]) == {d.id: "Şükür"}
    await kurban.update_share(_request(org, "PATCH"), share.id, kurban.ShareUpdate(kurban_type="vacip"), db_session, admin)
    assert await donation_intents(db_session, [d]) == {d.id: "Vacip"}

    plain = await _manual_kurban(db_session, org, admin, campaign_id, {}, first_name="Veli")
    assert await donation_intents(db_session, [plain]) == {}  # nothing chosen: the default type is not printed

    pending = await _manual_kurban(db_session, org, admin, campaign_id, {"niyet": "Akika"}, first_name="Can", status="pending")
    assert await donation_intents(db_session, [pending]) == {pending.id: "Akika"}
    await crm.mark_manual_donation_paid(_request(org, "POST"), pending.id, db_session, admin)
    assert await donation_intents(db_session, [pending]) == {pending.id: "Akika"}


async def test_grouped_receipt_prints_every_item_and_keeps_a_valid_code(db_session, monkeypatch):
    org, admin = await _setup(db_session)
    campaign_id = await _kurban(db_session, org, admin)
    other = Campaign(organization_id=org.id, slug="su", title="Su Kuyusu", summary="s", target_cents=0, status=CampaignStatus.ACTIVE)
    db_session.add(other)
    await db_session.flush()
    row = await crm.create_manual_donation(_request(org, "POST"), crm.ManualDonationIn(
        idempotency_key=uuid.uuid4().hex, donor=crm.ManualDonor(first_name="Ali"),
        lines=[crm.ReceiptLine(campaign_id=campaign_id, amount_cents=500_000, metadata={"niyet": "Adak"}),
               crm.ReceiptLine(campaign_id=other.id, amount_cents=10_000)]), db_session, admin)
    d = await db_session.get(Donation, uuid.UUID(row["id"]))
    data = await receipt_print_data(db_session, d)
    assert [(x[0], x[4]) for x in data["lines"]] == [("Keçi", "Adak"), ("Su Kuyusu", None)]
    assert data["amount_cents"] == 510_000

    used = []
    real = receipt_pdf.verification_hash
    monkeypatch.setattr(receipt_pdf, "verification_hash", lambda n, a: used.append(a) or real(n, a))
    response = await public_forms.download_public_receipt_pdf(
        _request(org), d.receipt_number, real(d.receipt_number, d.amount_cents), db_session, None)
    assert response.body.startswith(b"%PDF") and set(used) == {500_000}


async def test_repair_lists_first_and_writes_only_with_apply(db_session):
    org, admin = await _setup(db_session)
    campaign_id = await _kurban(db_session, org, admin)
    order_id = await _order(db_session, org, campaign_id, {"niyet": "Adak"})
    order = await checkout._load_order(db_session, order_id)
    d = await _manual_kurban(db_session, org, admin, campaign_id, {})
    d.payment_order_item_id = order.items[0].id
    await db_session.commit()
    share = (await db_session.execute(select(KurbanShare).where(KurbanShare.donation_id == d.id))).scalar_one()
    # An old order's receipt is right even before the repair.
    assert await donation_intents(db_session, [d]) == {d.id: "Adak"}
    assert await repair_kurban_intents(org.slug, False, db_session) == 1 and share.kurban_type == "vacip"
    assert await repair_kurban_intents(org.slug, True, db_session) == 1 and share.kurban_type == "adak"
    assert await repair_kurban_intents(org.slug, True, db_session) == 0

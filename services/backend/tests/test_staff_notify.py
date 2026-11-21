"""Staff notifications: who hears about which money coming in, what the message says, and settings."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from starlette.requests import Request

from app.api.v1 import mobile as api
from app.models.automation import OutboxEvent
from app.models.campaign import Campaign, CampaignStatus
from app.models.device_token import DeviceToken
from app.models.donation import Donation, DonationStatus, Donor, PaymentMethod
from app.models.organization import Organization
from app.models.staff_notification import StaffNotification, StaffNotificationSetting
from app.models.user import User, UserRole
from app.services import staff_notify as svc


@pytest.fixture
def pushes(monkeypatch):
    """Capture pushes instead of calling Expo."""
    sent: list[dict] = []

    async def fake_push(tokens, title, body, data=None, *, badge=None, channel_id="default"):
        tokens = list(tokens)
        sent.append({"tokens": tokens, "title": title, "body": body, "data": data, "badge": badge})
        return len(tokens), []

    monkeypatch.setattr("app.services.push_service.push_messages", fake_push)
    monkeypatch.setattr(svc, "_quiet", lambda now=None: False)
    return sent


def _request(org):
    request = Request({"type": "http", "method": "GET", "path": "/api/v1/mobile/notifications", "headers": [],
                       "query_string": b"", "client": ("1.2.3.4", 1)})
    request.state.organization_id = str(org.id)
    request.state.organization = org
    return request


async def _setup(db):
    slug = f"o-{uuid.uuid4().hex[:8]}"
    org = Organization(slug=slug, name="Test Derneği", legal_name=slug, email=f"{slug}@example.com",
                       primary_domain=f"{slug}.example.com", plan="ileri", enabled_addons=[], extra_user_seats=0)
    db.add(org)
    await db.flush()
    admin = User(organization_id=org.id, email=f"admin-{slug}@example.com", hashed_password="x",
                 first_name="Ayşe", last_name="Yönetici", role=UserRole.STK_ADMIN, is_active=True)
    crm = User(organization_id=org.id, email=f"crm-{slug}@example.com", hashed_password="x",
               first_name="Can", last_name="Temsilci", role=UserRole.CRM, is_active=True)
    db.add_all([admin, crm])
    await db.flush()
    campaign = Campaign(organization_id=org.id, slug=f"su-{slug}", title="Su Kuyusu", summary="s", target_cents=0,
                        status=CampaignStatus.ACTIVE)
    donor = Donor(organization_id=org.id, first_name="Ali", last_name="Veli", phone="05321112233")
    db.add_all([campaign, donor])
    db.add(DeviceToken(organization_id=org.id, user_id=admin.id, token="ExponentPushToken[admin]", platform="ios"))
    db.add(DeviceToken(organization_id=org.id, user_id=crm.id, token="ExponentPushToken[crm]", platform="android"))
    await db.flush()
    return org, admin, crm, campaign, donor


def _donation(org, campaign, donor, *, cents=125000, provider="manual", method=PaymentMethod.CASH, details=None,
              issued_by=None, receipt=None):
    return Donation(
        id=uuid.uuid4(), organization_id=org.id, campaign_id=campaign.id, donor_id=donor.id,
        receipt_number=receipt or f"BG-{uuid.uuid4().hex[:10]}", amount_cents=cents, currency="TRY",
        payment_method=method, status=DonationStatus.CONFIRMED, payment_provider=provider,
        payment_details=details or {}, paid_at=datetime.now(timezone.utc), issued_by_id=issued_by,
    )


# --- Pure rules -----------------------------------------------------------------------------------

@pytest.mark.parametrize("provider,details,method,channel", [
    ("iyzico", {}, PaymentMethod.CREDIT_CARD, "online"),
    ("ziraatpay", {}, PaymentMethod.CREDIT_CARD, "online"),
    ("bank:ziraat", {"automatic": True}, PaymentMethod.BANK_TRANSFER, "transfer"),
    ("manual", {}, PaymentMethod.CASH, "cash"),
    ("manual", {}, PaymentMethod.CREDIT_CARD, "pos"),
    ("manual", {}, PaymentMethod.BANK_TRANSFER, "transfer"),
    ("manual", {"member_no": "12", "periods": ["2026-11"]}, PaymentMethod.CASH, "dues"),
    ("money_box", {"money_box_code": "KMB-1"}, PaymentMethod.CASH, "money_box"),
    ("sms_donation", {"operator": "Turkcell"}, PaymentMethod.CREDIT_CARD, "sms"),
    ("import", {}, PaymentMethod.CASH, "import"),
    ("stkpro", {}, PaymentMethod.BANK_TRANSFER, "import"),
    ("havale", {}, "bank_transfer", "online_transfer"),
])
def test_every_money_in_path_gets_a_channel(provider, details, method, channel):
    assert svc.channel_for(provider, details, method) == channel


@pytest.mark.parametrize("cents,currency,text", [
    (125000, "TRY", "₺1.250"), (125050, "TRY", "₺1.250,50"), (5, "TRY", "₺0,05"),
    (100000000, "TRY", "₺1.000.000"), (2500, "USD", "$25"), (900, "SAR", "9 SAR"),
])
def test_money_is_written_the_turkish_way(cents, currency, text):
    assert svc.money(cents, currency) == text


def test_settings_keep_only_known_values():
    values = svc.merged({"online": False, "min_amount_cents": 50000, "evil": True, "digest": "yes", "quiet_hours": True})
    assert values["online"] is False and values["min_amount_cents"] == 50000 and values["quiet_hours"] is True
    assert values["digest"] is True and "evil" not in values


# --- Who hears what ---------------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_bank_transfer_reaches_staff_who_see_all_receipts(db_session, pushes):
    org, admin, crm, campaign, donor = await _setup(db_session)
    donation = _donation(org, campaign, donor, provider="bank:ziraat", method=PaymentMethod.BANK_TRANSFER,
                         details={"automatic": True, "bank_account_label": "Ziraat TL", "sender": "ALİ VELİ"})
    db_session.add(donation)
    await db_session.flush()

    await svc._donation_paid(db_session, org.id, {"donation_id": str(donation.id)})

    notes = (await db_session.execute(select(StaffNotification).where(StaffNotification.organization_id == org.id))).scalars().all()
    assert [n.user_id for n in notes] == [admin.id]  # CRM staff cannot see receipts they did not write
    assert notes[0].title == "₺1.250 · Havale / EFT" and notes[0].channel == "transfer" and notes[0].pushed == 1
    assert "Ali Veli · Su Kuyusu" in notes[0].body and "otomatik eşleşti" in notes[0].body and "Ziraat TL" in notes[0].body
    assert pushes[0]["tokens"] == ["ExponentPushToken[admin]"] and pushes[0]["data"]["donation_id"] == str(donation.id)
    assert pushes[0]["badge"] == 1


@pytest.mark.asyncio
async def test_staff_member_hears_about_their_donors_but_not_their_own_receipt(db_session, pushes):
    org, admin, crm, campaign, donor = await _setup(db_session)
    donor.assigned_user_id = crm.id
    own = _donation(org, campaign, donor, issued_by=crm.id)
    db_session.add(own)
    await db_session.flush()
    await svc._donation_paid(db_session, org.id, {"donation_id": str(own.id)})
    users = {n.user_id for n in (await db_session.execute(select(StaffNotification).where(
        StaffNotification.organization_id == org.id))).scalars().all()}
    assert users == {admin.id}  # the person who wrote it is not told about it
    assert "kesen: Can Temsilci" in pushes[0]["body"]

    other = _donation(org, campaign, donor, provider="money_box", details={"money_box_code": "KMB-7"}, issued_by=admin.id)
    db_session.add(other)
    await db_session.flush()
    await svc._donation_paid(db_session, org.id, {"donation_id": str(other.id)})
    last = (await db_session.execute(select(StaffNotification).where(StaffNotification.user_id == crm.id))).scalars().all()
    assert len(last) == 1 and last[0].channel == "money_box" and "kumbara KMB-7" in last[0].body


@pytest.mark.asyncio
async def test_imports_never_notify(db_session, pushes):
    org, admin, crm, campaign, donor = await _setup(db_session)
    donation = _donation(org, campaign, donor, provider="stkpro")
    db_session.add(donation)
    await db_session.flush()
    await svc._donation_paid(db_session, org.id, {"donation_id": str(donation.id)})
    assert pushes == []
    assert not (await db_session.execute(select(StaffNotification).where(StaffNotification.organization_id == org.id))).scalars().all()


@pytest.mark.asyncio
async def test_a_receipt_with_several_lines_is_one_notification(db_session, pushes):
    org, admin, crm, campaign, donor = await _setup(db_session)
    lines = [_donation(org, campaign, donor, cents=c, details={"receipt_group": "g-1"}, receipt=f"BG-G1-{i}")
             for i, c in enumerate([10000, 25000])]
    db_session.add_all(lines)
    await db_session.flush()
    for line in reversed(lines):
        await svc._donation_paid(db_session, org.id, {"donation_id": str(line.id)})
    assert len(pushes) == 1
    assert pushes[0]["title"] == "₺350 · Elden nakit" and "(+1 kalem)" in pushes[0]["body"]


@pytest.mark.asyncio
async def test_settings_decide_the_push_but_the_inbox_keeps_everything(db_session, pushes):
    org, admin, crm, campaign, donor = await _setup(db_session)
    db_session.add(StaffNotificationSetting(user_id=admin.id, settings={"min_amount_cents": 500000}))
    small = _donation(org, campaign, donor, cents=10000)
    db_session.add(small)
    await db_session.flush()
    await svc._donation_paid(db_session, org.id, {"donation_id": str(small.id)})
    assert pushes == []
    note = (await db_session.execute(select(StaffNotification).where(StaffNotification.user_id == admin.id))).scalar_one()
    assert note.pushed == 0 and note.amount_cents == 10000

    row = await db_session.get(StaffNotificationSetting, admin.id)
    row.settings = {"offline": False}
    big = _donation(org, campaign, donor, cents=900000)
    db_session.add(big)
    await db_session.flush()
    await svc._donation_paid(db_session, org.id, {"donation_id": str(big.id)})
    assert pushes == []  # cash receipts switched off


@pytest.mark.asyncio
async def test_quiet_hours_keep_the_phone_silent(db_session, pushes, monkeypatch):
    org, admin, crm, campaign, donor = await _setup(db_session)
    db_session.add(StaffNotificationSetting(user_id=admin.id, settings={"quiet_hours": True}))
    monkeypatch.setattr(svc, "_quiet", lambda now=None: True)
    donation = _donation(org, campaign, donor)
    db_session.add(donation)
    await db_session.flush()
    await svc._donation_paid(db_session, org.id, {"donation_id": str(donation.id)})
    assert pushes == []


# --- Queueing ----------------------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_offline_confirmation_queues_one_push_event(db_session, pushes, push_kicks):
    from app.services.offline_donation import record_offline_donation

    org, admin, crm, campaign, donor = await _setup(db_session)
    donation, _effects = await record_offline_donation(
        db_session, organization_id=org.id, campaign=campaign, donor=donor, amount_cents=50000, currency="TRY",
        method=PaymentMethod.CASH, paid_at=datetime.now(timezone.utc), issued_by_id=crm.id, provider="manual",
        idempotency_key=f"t-{uuid.uuid4().hex}", send_receipt=False,
    )
    await db_session.commit()
    events = (await db_session.execute(select(OutboxEvent).where(
        OutboxEvent.aggregate_id == donation.id, OutboxEvent.event_type == "push.donation.paid"))).scalars().all()
    assert len(events) == 1 and events[0].payload == {"donation_id": str(donation.id)}
    assert [e.id for e in push_kicks] == [events[0].id]  # handed to the worker right after commit

    await svc.handle_event(db_session, events[0])
    assert pushes and pushes[0]["title"] == "₺500 · Elden nakit"


# --- Inbox API ---------------------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_inbox_lists_counts_and_marks_read(db_session, pushes):
    org, admin, crm, campaign, donor = await _setup(db_session)
    for cents in (1000, 2000, 3000):
        d = _donation(org, campaign, donor, cents=cents)
        db_session.add(d)
        await db_session.flush()
        await svc._donation_paid(db_session, org.id, {"donation_id": str(d.id)})
    page = await api.list_notifications(_request(org), kind=None, unread_only=False, page=1, page_size=2,
                                        db=db_session, current_user=admin)
    assert page["total"] == 3 and page["unread"] == 3 and len(page["items"]) == 2
    assert page["items"][0]["title"] == "₺30 · Elden nakit"  # newest first

    await api.mark_read(_request(org), api.ReadIn(ids=[page["items"][0]["id"]]), db=db_session, current_user=admin)
    assert (await api.list_notifications(_request(org), kind=None, unread_only=True, page=1, page_size=30,
                                         db=db_session, current_user=admin))["total"] == 2
    await api.mark_read(_request(org), api.ReadIn(all=True), db=db_session, current_user=admin)
    other = await api.list_notifications(_request(org), kind=None, unread_only=False, page=1, page_size=30,
                                         db=db_session, current_user=crm)
    assert other["total"] == 0  # nobody reads another person's inbox


@pytest.mark.asyncio
async def test_settings_api_shows_only_what_the_person_can_receive(db_session):
    org, admin, crm, campaign, donor = await _setup(db_session)
    saved = await api.put_notification_settings(api.SettingsIn(online=False, min_amount_cents=10000),
                                                db=db_session, current_user=admin)
    assert saved["settings"]["online"] is False and saved["settings"]["min_amount_cents"] == 10000
    assert saved["available"]["digest"] is True
    crm_view = await api.get_notification_settings(db=db_session, current_user=crm)
    assert crm_view["available"]["online"] is False and crm_view["available"]["offline"] is True


@pytest.mark.asyncio
async def test_inflow_groups_today_by_channel(db_session):
    org, admin, crm, campaign, donor = await _setup(db_session)
    db_session.add_all([
        _donation(org, campaign, donor, cents=10000, provider="iyzico", method=PaymentMethod.CREDIT_CARD),
        _donation(org, campaign, donor, cents=20000, provider="iyzico", method=PaymentMethod.CREDIT_CARD),
        _donation(org, campaign, donor, cents=5000, provider="bank:ziraat", method=PaymentMethod.BANK_TRANSFER),
        _donation(org, campaign, donor, cents=99900, provider="import"),
    ])
    await db_session.flush()
    out = await api.inflow_overview(_request(org), period="today", db=db_session, current_user=admin)
    assert out["total_cents"] == 35000 and out["count"] == 3
    assert [(c["key"], c["total_cents"]) for c in out["channels"]] == [("online", 30000), ("transfer", 5000)]
    assert sum(out["series"]) == 35000 and len(out["series"]) == 24
    assert all(r["channel"] != "import" for r in out["recent"])


@pytest.mark.asyncio
async def test_daily_digest_once_per_day(db_session, pushes):
    org, admin, crm, campaign, donor = await _setup(db_session)
    db_session.add(_donation(org, campaign, donor, cents=40000, provider="iyzico", method=PaymentMethod.CREDIT_CARD))
    await db_session.flush()
    assert await svc.send_daily_digest(db_session, org.id) == 1
    assert pushes[-1]["title"] == "Gün sonu: ₺400 · 1 bağış"
    assert await svc.send_daily_digest(db_session, org.id) == 0  # already sent today


@pytest.mark.asyncio
async def test_unmatched_transfers_reach_people_who_approve_them(db_session, pushes):
    from app.models.automation import BankTransaction, ReconciliationStatus

    org, admin, crm, campaign, donor = await _setup(db_session)
    rows = [BankTransaction(organization_id=org.id, source="api", external_id=f"x:{i}", booked_at=datetime.now(timezone.utc),
                            amount_cents=c, currency="TRY", sender_name=name, status=ReconciliationStatus.UNMATCHED)
            for i, (c, name) in enumerate([(50000, "ALİ VELİ"), (200000, "AYŞE KARA"), (-3000, "MASRAF")])]
    db_session.add_all(rows)
    await db_session.flush()
    await svc._transfers_waiting(db_session, org.id, {"transaction_ids": [str(r.id) for r in rows]})
    assert len(pushes) == 1 and pushes[0]["tokens"] == ["ExponentPushToken[admin]"]  # CRM cannot approve transfers
    assert pushes[0]["title"] == "2 havale eşleşme bekliyor · ₺2.500"
    assert pushes[0]["body"].startswith("En büyüğü: AYŞE KARA ₺2.000")
    assert pushes[0]["data"]["route"] == "transfers"


@pytest.mark.asyncio
async def test_bank_sync_queues_a_waiting_transfer_event(db_session, push_kicks, monkeypatch):
    from app.banking import sync
    from app.models.automation import BankAccount

    org, admin, crm, campaign, donor = await _setup(db_session)
    account = BankAccount(organization_id=org.id, bank_key="fake", label="Ziraat TL", currency="TRY")
    db_session.add(account)
    await db_session.flush()

    class Movement:
        def __init__(self, i, cents):
            self.external_id, self.amount_cents, self.currency = f"m{i}", cents, "TRY"
            self.booked_at, self.sender_name, self.description = datetime.now(timezone.utc), "BİLİNMEYEN KİŞİ", "bağış"
            self.sender_iban, self.raw = None, {}

    class Connector:
        min_interval = None

        def __init__(self, credentials):
            pass

        async def fetch(self, account, since, until):
            return [Movement(1, 77700)]

    monkeypatch.setitem(sync.CONNECTORS, "fake", Connector)

    async def no_credentials(*args, **kwargs):
        return {}

    monkeypatch.setattr("app.services.tenant_credentials.get_credentials", no_credentials)
    result = await sync.sync_account(db_session, account)
    assert result["new"] == 1
    events = (await db_session.execute(select(OutboxEvent).where(
        OutboxEvent.organization_id == org.id, OutboxEvent.event_type == "push.transfer.waiting"))).scalars().all()
    assert len(events) == 1 and len(events[0].payload["transaction_ids"]) == 1
    assert [e.id for e in push_kicks] == [events[0].id]


async def _order(db, org, campaign, donor, *, status, cents=50000, method="credit_card"):
    from app.models.payment import PaymentAttempt, PaymentOrder, PaymentOrderItem

    order = PaymentOrder(organization_id=org.id, donor_id=donor.id, merchant_payment_id=uuid.uuid4().hex,
                         idempotency_key=uuid.uuid4().hex, payment_method=method, status=status, total_cents=cents,
                         currency="TRY", failure_message="Yetersiz bakiye")
    db.add(order)
    await db.flush()
    item = PaymentOrderItem(order_id=order.id, campaign_id=campaign.id, quantity=1, unit_amount_cents=cents,
                            total_amount_cents=cents, donor_message="Annem için")
    attempt = PaymentAttempt(order_id=order.id, provider="iyzico", card_last_4="4242", card_brand="Visa")
    db.add_all([item, attempt])
    await db.flush()
    return order, item


@pytest.mark.asyncio
async def test_online_card_payment_message(db_session, pushes):
    from app.models.payment import PaymentOrderStatus

    org, admin, crm, campaign, donor = await _setup(db_session)
    order, item = await _order(db_session, org, campaign, donor, status=PaymentOrderStatus.PAID)
    donation = _donation(org, campaign, donor, cents=50000, provider="iyzico", method=PaymentMethod.CREDIT_CARD)
    donation.payment_order_item_id = item.id
    donation.donor_message = "Annem için"
    db_session.add(donation)
    await db_session.flush()
    await svc._payment_paid(db_session, org.id, {"order_id": str(order.id)})
    assert pushes[0]["title"] == "₺500 · Online bağış (sanal POS)"
    assert pushes[0]["body"] == "Ali Veli · Su Kuyusu\nVisa ••4242 · iyzico · “Annem için”"
    assert pushes[0]["data"]["donation_id"] == str(donation.id)


@pytest.mark.asyncio
async def test_declined_card_payment_is_reported(db_session, pushes):
    from app.models.payment import PaymentOrderStatus

    org, admin, crm, campaign, donor = await _setup(db_session)
    order, _item = await _order(db_session, org, campaign, donor, status=PaymentOrderStatus.FAILED, cents=30000)
    await svc._payment_failed(db_session, org.id, {"order_id": str(order.id)})
    assert pushes[0]["title"] == "Başarısız ödeme · ₺300" and "Yetersiz bakiye" in pushes[0]["body"]
    assert pushes[0]["tokens"] == ["ExponentPushToken[admin]"]

    order.status = PaymentOrderStatus.PAID  # paid by a later retry: no stale warning
    await svc._payment_failed(db_session, org.id, {"order_id": str(order.id)})
    assert len(pushes) == 1


@pytest.mark.asyncio
async def test_refund_is_reported(db_session, pushes):
    from app.models.payment import PaymentOrderStatus

    org, admin, crm, campaign, donor = await _setup(db_session)
    order, _item = await _order(db_session, org, campaign, donor, status=PaymentOrderStatus.REFUNDED, cents=80000)
    await svc._payment_refunded(db_session, org.id, {"order_id": str(order.id), "amount_cents": 20000})
    assert pushes[0]["title"] == "İade · ₺200" and "sipariş toplamı ₺800" in pushes[0]["body"]

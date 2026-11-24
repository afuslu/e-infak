"""Audit fixes: donor takeover via checkout, double crediting, exports, webhooks, OTP, receipt codes."""
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.api.v1 import checkout, public_forms
from app.models.campaign import Campaign
from app.models.donation import Donation, DonationStatus, Donor, PaymentMethod
from app.models.payment import PaymentOrder, PaymentOrderItem, PaymentOrderStatus
from app.schemas.checkout import CheckoutDonor
from app.utils.excel_export import csv_safe
from app.utils.net import UnsafeUrl, assert_public_url
from app.utils.phone import phone_key
from app.utils.receipt_pdf import code_matches, verification_hash
from tests.test_orta_modules import _request, _setup


async def test_checkout_never_rewrites_an_existing_donors_contact(db_session):
    org, _ = await _setup(db_session)
    victim = Donor(organization_id=org.id, first_name="Ayşe", last_name="Kara", email="ayse@example.com",
                   phone="05321112233", allow_sms=True)
    db_session.add(victim)
    await db_session.flush()
    attacker = CheckoutDonor(first_name="Kötü", last_name="Niyet", email="AYSE@example.com", phone="0 555 999 88 77")
    donor, payer = await checkout._get_or_create_donor(org.id, attacker, db_session)
    assert donor.id != victim.id  # another name opens its own card
    assert (victim.phone, victim.email, victim.first_name) == ("05321112233", "ayse@example.com", "Ayşe")
    assert victim.allow_sms is True

    # Same phone in another format finds the donor; blank fields are filled.
    victim.email = None
    donor, _ = await checkout._get_or_create_donor(
        org.id, CheckoutDonor(first_name="Ayşe", last_name="Kara", email="yeni@example.com", phone="+90 532 111 22 33"),
        db_session)
    assert donor.id == victim.id and donor.email == "yeni@example.com"


async def _transfer_order(db, org, status=PaymentOrderStatus.AWAITING_TRANSFER):
    campaign = Campaign(organization_id=org.id, slug=f"c-{uuid.uuid4().hex[:6]}", title="Genel", summary="s", target_cents=0)
    donor = Donor(organization_id=org.id, first_name="Ali", last_name="V", total_donations=0, total_donated_cents=0)
    db.add_all([campaign, donor])
    await db.flush()
    order = PaymentOrder(organization_id=org.id, donor_id=donor.id, merchant_payment_id=f"T-{uuid.uuid4().hex}",
                         idempotency_key=uuid.uuid4().hex * 4, payment_method="bank_transfer", status=status,
                         total_cents=5_000, currency="TRY")
    db.add(order)
    await db.flush()
    db.add(PaymentOrderItem(order_id=order.id, campaign_id=campaign.id, quantity=1, unit_amount_cents=5_000,
                            total_amount_cents=5_000, metadata_json={}))
    await db.flush()
    return order, campaign


async def test_transfer_confirmation_credits_once(db_session):
    org, admin = await _setup(db_session)
    order, campaign = await _transfer_order(db_session, org)
    request = _request(org, "POST")
    first = await checkout.confirm_bank_transfer(request, order.id, "BANK-1", db_session, admin)
    assert first["donation_count"] == 1
    again = await checkout.confirm_bank_transfer(request, order.id, "BANK-1", db_session, admin)
    assert again["status"] == "paid"
    donations = (await db_session.execute(select(Donation).where(Donation.campaign_id == campaign.id))).scalars().all()
    assert len(donations) == 1
    # A 128-character order key still fits the donation column.
    assert len(donations[0].idempotency_key) <= 100

    # The same bank movement cannot pay a second order.
    other, _ = await _transfer_order(db_session, org)
    with pytest.raises(HTTPException) as exc:
        await checkout.confirm_bank_transfer(request, other.id, "BANK-1", db_session, admin)
    assert exc.value.status_code == 409


async def test_cancelled_transfer_cannot_be_confirmed(db_session):
    org, admin = await _setup(db_session)
    order, _ = await _transfer_order(db_session, org, status=PaymentOrderStatus.CANCELLED)
    with pytest.raises(HTTPException) as exc:
        await checkout.confirm_bank_transfer(_request(org, "POST"), order.id, "BANK-9", db_session, admin)
    assert exc.value.status_code == 409


def test_spreadsheet_cells_cannot_run_formulas():
    assert csv_safe("=HYPERLINK(\"http://x\")") == "'=HYPERLINK(\"http://x\")"
    assert csv_safe("+90 532") == "'+90 532"
    assert csv_safe("@SUM(A1)") == "'@SUM(A1)"
    assert csv_safe("Ayşe") == "Ayşe" and csv_safe(-5) == -5


@pytest.mark.parametrize("url", [
    "http://127.0.0.1/hook", "https://localhost/x", "https://10.0.0.5/", "https://169.254.169.254/latest",
    "https://[::1]/", "ftp://example.com/", "https://user:pw@example.com/",
])
def test_webhook_targets_must_be_public(url):
    with pytest.raises(UnsafeUrl):
        assert_public_url(url)


def test_webhook_public_address_is_accepted(monkeypatch):
    import socket
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: [(None, None, None, "", ("93.184.216.34", 443))])
    assert assert_public_url("https://hooks.example.com/in") == "https://hooks.example.com/in"


def test_otp_codes_and_limits(monkeypatch):
    from app.services import otp

    monkeypatch.setattr(otp, "_redis", lambda: None)
    tenant = uuid.uuid4().hex
    code = otp.issue("donor", tenant, "0532 111 22 33", "1.1.1.1")
    assert len(code) == 6 and code.isdigit()
    with pytest.raises(HTTPException) as cooldown:
        otp.issue("donor", tenant, "+905321112233", "1.1.1.1")
    assert cooldown.value.status_code == 429
    with pytest.raises(HTTPException):
        otp.verify("donor", tenant, "05321112233", "000000" if code != "000000" else "111111")
    assert otp.verify("donor", tenant, "5321112233", code) == phone_key("05321112233")
    with pytest.raises(HTTPException):
        otp.verify("donor", tenant, "05321112233", code)  # single use
    with pytest.raises(HTTPException) as bad:
        otp.issue("donor", tenant, "123", "1.1.1.1")
    assert bad.value.status_code == 400


async def test_receipt_details_need_the_printed_code(db_session):
    org, _ = await _setup(db_session)
    donor = Donor(organization_id=org.id, first_name="Zeynep", last_name="Demir")
    campaign = Campaign(organization_id=org.id, slug=f"c-{uuid.uuid4().hex[:6]}", title="Genel", summary="s", target_cents=0)
    db_session.add_all([donor, campaign])
    await db_session.flush()
    donation = Donation(organization_id=org.id, donor_id=donor.id, campaign_id=campaign.id, receipt_number=f"R-{uuid.uuid4().hex[:8]}",
                        amount_cents=12_500, currency="TRY", payment_method=PaymentMethod.CASH,
                        status=DonationStatus.CONFIRMED)
    db_session.add(donation)
    await db_session.flush()
    code = verification_hash(donation.receipt_number, donation.amount_cents)
    assert code_matches(donation.receipt_number, 12_500, code.lower())
    assert not code_matches(donation.receipt_number, 12_600, code)
    request = _request(org)
    plain = await public_forms.verify_public_receipt(request, donation.receipt_number, None, db_session)
    assert plain["status"] == "valid" and plain["donor_name"] is None and not plain["code_verified"]
    full = await public_forms.verify_public_receipt(request, donation.receipt_number, code, db_session)
    assert full["donor_name"] == "Zeynep D." and full["code_verified"]
    with pytest.raises(HTTPException) as exc:
        await public_forms.download_public_receipt_pdf(request, donation.receipt_number, "WRONG", db_session)
    assert exc.value.status_code == 403


async def test_staff_login_is_case_insensitive_and_reset_link_works_once(db_session, monkeypatch):
    from app.api.v1 import auth
    from app.core.config import settings
    from app.core.security import get_password_hash, verify_password
    from app.schemas.auth import UserLogin
    from app.models.user import User, UserRole

    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", False)
    org, _ = await _setup(db_session)
    user = User(organization_id=org.id, email=f"Mixed.{org.slug}@Example.com", hashed_password=get_password_hash("eski-sifre-123"),
                first_name="Can", last_name="T", role=UserRole.CRM)
    db_session.add(user)
    await db_session.flush()
    request = _request(org, "POST")
    tokens = await auth.login(request, UserLogin(email=user.email.lower(), password="eski-sifre-123"), db_session)
    assert tokens.access_token

    sent = []

    async def capture(db, target, link):
        sent.append(link)

    monkeypatch.setattr(auth, "_send_reset_link", capture)
    reply = await auth.request_password_reset(request, auth.PasswordResetRequest(email=user.email.upper()), db_session)
    assert reply["ok"] and len(sent) == 1
    token = sent[0].split("token=")[1]
    # A reset link is not a session.
    from app.api import deps
    from fastapi.security import HTTPAuthorizationCredentials
    with pytest.raises(HTTPException):
        await deps.get_current_user(request, HTTPAuthorizationCredentials(scheme="Bearer", credentials=token), db_session)
    await auth.confirm_password_reset(request, auth.PasswordResetConfirm(token=token, new_password="yeni-sifre-456"), db_session)
    await db_session.refresh(user)
    assert verify_password("yeni-sifre-456", user.hashed_password)
    with pytest.raises(HTTPException):
        await auth.confirm_password_reset(request, auth.PasswordResetConfirm(token=token, new_password="baska-sifre-789"), db_session)
    # Unknown e-mail: same answer, nothing sent.
    await auth.request_password_reset(request, auth.PasswordResetRequest(email="yok@example.com"), db_session)
    assert len(sent) == 1


async def test_masked_phone_sent_back_keeps_the_number(db_session):
    from app.api.v1 import crm

    org, admin = await _setup(db_session)
    donor = Donor(organization_id=org.id, first_name="Ali", last_name="K", phone="05321112233", email="ali@example.com",
                  total_donations=0, total_donated_cents=0)
    db_session.add(donor)
    await db_session.flush()
    payload = crm.DonorUpdate(first_name="Ali Rıza", phone="0532 *** ** 33")
    await crm.update_donor(_request(org, "PUT"), donor.id, payload, db_session, admin)
    await db_session.refresh(donor)
    assert (donor.first_name, donor.phone, donor.email) == ("Ali Rıza", "05321112233", "ali@example.com")
    with pytest.raises(Exception):
        crm.ManualDonor(first_name="X", phone="0532 *** ** 33")


async def test_foreign_currency_donations_count_in_lira(db_session):
    from datetime import datetime, timezone
    from decimal import Decimal
    from app.models.fx import FxRate
    from app.services.fx import add_to_donor, remove_from_donor

    org, _ = await _setup(db_session)
    await db_session.merge(FxRate(currency="EUR", rate_try=Decimal("50"), fetched_at=datetime.now(timezone.utc)))
    donor = Donor(organization_id=org.id, first_name="Eva", total_donations=0, total_donated_cents=0)
    donation = Donation(organization_id=org.id, amount_cents=10_00, currency="EUR", payment_details={})
    await add_to_donor(db_session, donor, donation)
    assert donor.total_donated_cents == 500_00 and donor.total_donations == 1
    remove_from_donor(donor, donation)
    assert donor.total_donated_cents == 0 and donor.total_donations == 0


def test_rates_never_invent_a_gold_price(monkeypatch):
    from app.utils import tcmb

    monkeypatch.setattr(tcmb, "_cached_rates", None)

    def down(*a, **k):
        raise OSError("offline")

    monkeypatch.setattr(tcmb, "fetch_tcmb_currency_rates", down)
    rates = tcmb.fetch_tcmb_rates(force_refresh=True)
    assert rates["GOLD_GRAM"] is None and rates["stale"]

    monkeypatch.setattr(tcmb, "fetch_tcmb_currency_rates", lambda: {"USD": 40.0, "EUR": 45.0})
    monkeypatch.setattr(tcmb, "fetch_metal_usd", lambda symbol: 3110.35 if symbol == "XAU" else 31.1035)
    rates = tcmb.fetch_tcmb_rates(force_refresh=True)
    assert rates["GOLD_GRAM"] == 4000.0 and rates["SILVER_GRAM"] == 40.0 and rates["NISAP_LIRA"] == 340000.0
    monkeypatch.setattr(tcmb, "fetch_tcmb_currency_rates", down)
    stale = tcmb.fetch_tcmb_rates(force_refresh=True)
    assert stale["GOLD_GRAM"] == 4000.0 and stale["stale"]


async def test_campaign_delete_only_without_donations(db_session):
    from app.api.v1 import campaigns

    org, admin = await _setup(db_session)
    empty = Campaign(organization_id=org.id, slug=f"bos-{uuid.uuid4().hex[:6]}", title="Boş", summary="s", target_cents=0)
    used = Campaign(organization_id=org.id, slug=f"dolu-{uuid.uuid4().hex[:6]}", title="Dolu", summary="s", target_cents=0)
    donor = Donor(organization_id=org.id, first_name="A")
    db_session.add_all([empty, used, donor])
    await db_session.flush()
    db_session.add(Donation(organization_id=org.id, donor_id=donor.id, campaign_id=used.id, receipt_number=f"R-{uuid.uuid4().hex[:8]}",
                            amount_cents=100, currency="TRY", payment_method=PaymentMethod.CASH, status=DonationStatus.CONFIRMED))
    await db_session.flush()
    request = _request(org, "DELETE")
    with pytest.raises(HTTPException) as exc:
        await campaigns.delete_campaign(request, used.id, db_session, admin)
    assert exc.value.status_code == 409
    await campaigns.delete_campaign(request, empty.id, db_session, admin)
    assert await db_session.get(Campaign, empty.id) is None


async def test_public_campaign_list_hides_drafts(db_session):
    from app.api.v1 import campaigns
    from app.models.campaign import CampaignStatus

    org, _ = await _setup(db_session)
    db_session.add_all([
        Campaign(organization_id=org.id, slug=f"t-{uuid.uuid4().hex[:6]}", title="Taslak", summary="s", target_cents=0, status=CampaignStatus.DRAFT),
        Campaign(organization_id=org.id, slug=f"a-{uuid.uuid4().hex[:6]}", title="Aktif", summary="s", target_cents=0, status=CampaignStatus.ACTIVE),
    ])
    await db_session.flush()
    listed = await campaigns.list_campaigns(_request(org), db=db_session)
    assert [c.title for c in listed.items] == ["Aktif"]


async def test_builder_page_can_be_deleted_but_not_home(db_session):
    from app.api.v1 import site_builder
    from app.models.cms import SitePage

    org, admin = await _setup(db_session)
    page = SitePage(organization_id=org.id, kind="page", slug="eski", title="Eski", body="", translations={})
    db_session.add(page)
    await db_session.flush()
    with pytest.raises(HTTPException):
        await site_builder.delete_page("home", _request(org, "DELETE"), db_session, admin)
    await site_builder.delete_page(str(page.id), _request(org, "DELETE"), db_session, admin)
    assert await db_session.get(SitePage, page.id) is None

"""Vakıf Katılım Güvenli Ödeme Sayfası driver (bank PDFs v2.8; no network)."""
import base64
import hashlib
import uuid
from urllib.parse import urlencode
from xml.etree import ElementTree as ET

import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException
from sqlalchemy import select

from app.api.v1 import checkout
from app.core.config import settings
from app.models.campaign import Campaign, CampaignStatus
from app.models.organization import Organization
from app.models.payment import PaymentAttempt, PaymentOrderStatus
from app.payments import PROVIDERS, build_provider
from app.payments.base import PaymentProviderError
from app.payments.providers import vakifkatilim as vk
from app.schemas.checkout import CheckoutSessionCreate
from app.services.tenant_credentials import save_credentials
from tests.test_checkout_providers import _request
from tests.test_payment_providers import _ctx

CREDS = {"merchant_id": "1", "customer_id": "11111", "username": "hakderapı", "api_password": "Şifre123ı", "mode": "live"}

# Doc §3.3.2 sample response, verbatim structure (utf-16 declaration, a NUL reference the doc strips).
LOOKUP_SAMPLE = """<?xml version="1.0" encoding="utf-16"?>
<VPosTransactionResponseContract xmlns:xsd="http://www.w3.org/2001/XMLSchema"
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <VPosOrderData>
    <OrderContract>
       <OrderId>12743</OrderId>
       <MerchantOrderId>1995434716</MerchantOrderId>
       <MerchantId>1</MerchantId>
       <PosTerminalId>111111</PosTerminalId>
       <OrderStatus>1</OrderStatus>
       <OrderStatusDescription />
       <OrderType>1</OrderType>
       <OrderTypeDescription />
       <TransactionStatus>1</TransactionStatus>
       <TransactionStatusDescription>Basarili</TransactionStatusDescription>
       <LastOrderStatus>1</LastOrderStatus>
       <LastOrderStatusDescription />
      <EndOfDayStatus>1</EndOfDayStatus>
      <EndOfDayStatusDescription>Acik</EndOfDayStatusDescription>
      <FEC>0949</FEC>
      <FecDescription>TRY</FecDescription>
      <TransactionSecurity>1</TransactionSecurity>
      <TransactionSecurityDescription>3d'siz islem</TransactionSecurityDescription>
      <CardHolderName>Hasan Karacan&#x0;</CardHolderName>
      <CardType>MasterCard</CardType>
      <CardNumber>5353********7017</CardNumber>
      <OrderDate>2020-12-24T09:21:41.55</OrderDate>
      <FirstAmount>9.30</FirstAmount>
      <FECAmount>0.00</FECAmount>
      <CancelAmount>0.00</CancelAmount>
      <DrawbackAmount>0.00</DrawbackAmount>
      <ClosedAmount>0.00</ClosedAmount>
      <InstallmentCount>0</InstallmentCount>
      <ResponseCode>00</ResponseCode>
      <ResponseExplain>Provizyon alındı.</ResponseExplain>
      <ProvNumber>043290</ProvNumber>
      <RRN>035909014127</RRN>
      <Stan>014127</Stan>
      <MerchantUserName>USERNAME</MerchantUserName>
      <BatchId>69</BatchId>
    </OrderContract>
  </VPosOrderData>
  <ResponseCode>00</ResponseCode>
  <ResponseMessage />
</VPosTransactionResponseContract>"""

# Doc §3.3.1 sample: a failed and a successful order, one end tag with a space before '>'.
SELECT_ORDER_SAMPLE = """<?xml version="1.0" encoding="utf-16"?>
<VPosTransactionResponseContract xmlns:xsd="http://www.w3.org/2001/XMLSchema"
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <VPosOrderData>
    <OrderContract>
       <OrderId>12754</OrderId><MerchantOrderId>709834990</MerchantOrderId><OrderStatus>1</OrderStatus>
       <TransactionStatus>2</TransactionStatus><TransactionStatusDescription>Basarisiz</TransactionStatusDescription>
       <EndOfDayStatus>1</EndOfDayStatus><FEC>0949</FEC><CardNumber>5353********3233</CardNumber>
       <TranAmount>3.90</TranAmount ><FirstAmount>3.90</FirstAmount><CancelAmount>0.00</CancelAmount>
       <DrawbackAmount>0.00</DrawbackAmount><ResponseCode>05</ResponseCode><ResponseExplain>Hata Kodu5</ResponseExplain>
    </OrderContract>
    <OrderContract>
      <OrderId>12753</OrderId><MerchantOrderId>424636131</MerchantOrderId><OrderStatus>1</OrderStatus>
      <TransactionStatus>1</TransactionStatus><EndOfDayStatus>2</EndOfDayStatus><FEC>0949</FEC>
      <FirstAmount>2.70</FirstAmount><CancelAmount>0.00</CancelAmount><DrawbackAmount>0.00</DrawbackAmount>
      <ResponseCode>00</ResponseCode><ProvNumber>831168</ProvNumber>
    </OrderContract>
  </VPosOrderData>
  <ResponseCode>00</ResponseCode>
  <ResponseMessage />
</VPosTransactionResponseContract>"""


def _order_xml(moid: str, amount: str = "250.00", *, tx_status="1", code="00", end_of_day="1", order_id="5001",
               cancel="0.00", drawback="0.00") -> bytes:
    return f"""<?xml version="1.0" encoding="utf-16"?>
<VPosTransactionResponseContract xmlns:xsd="http://www.w3.org/2001/XMLSchema"
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><VPosOrderData><OrderContract>
<OrderId>{order_id}</OrderId><MerchantOrderId>{moid}</MerchantOrderId><OrderStatus>1</OrderStatus>
<TransactionStatus>{tx_status}</TransactionStatus><EndOfDayStatus>{end_of_day}</EndOfDayStatus><FEC>0949</FEC>
<CardType>Troy</CardType><CardNumber>9792********0016</CardNumber><OrderDate>2026-11-10T10:00:00</OrderDate>
<FirstAmount>{amount}</FirstAmount><CancelAmount>{cancel}</CancelAmount><DrawbackAmount>{drawback}</DrawbackAmount>
<ResponseCode>{code}</ResponseCode><ResponseExplain>Provizyon alındı.</ResponseExplain>
</OrderContract></VPosOrderData><ResponseCode>00</ResponseCode><ResponseMessage /></VPosTransactionResponseContract>
""".encode("utf-8")


EMPTY_XML = (b'<?xml version="1.0" encoding="utf-16"?><VPosTransactionResponseContract><VPosOrderData />'
             b"<ResponseCode>00</ResponseCode></VPosTransactionResponseContract>")


def _b64sha1(raw: bytes) -> str:
    return base64.b64encode(hashlib.sha1(raw).digest()).decode()


def _provider(**overrides) -> vk.VakifKatilimProvider:
    return vk.VakifKatilimProvider({**CREDS, **overrides}, live=True)


# --- hashes ------------------------------------------------------------------

def test_hash_password_uses_iso_8859_9_like_the_csharp_reference():
    # Hand-encoded ISO-8859-9 (Latin-5): Ş = 0xDE, ı = 0xFD, ğ = 0xF0, İ = 0xDD.
    assert vk.sha1_b64("Şifre123ı") == _b64sha1(b"\xdeifre123\xfd")
    assert vk.sha1_b64("Şifre123ı") != _b64sha1("Şifre123ı".encode("utf-8"))
    assert vk.sha1_b64("Ğİ") == _b64sha1(b"\xd0\xdd")
    assert vk.sha1_b64("€") == _b64sha1(b"?")  # .NET replaces unmappable characters with '?'
    assert _provider().hash_password == _b64sha1(b"\xdeifre123\xfd")


def test_hash_strings_follow_documented_field_order():
    assert vk.hash_string("1", "M1", 500, "ok", "fail", "u", "hp") == "1M1500okfailuhp"
    assert vk.hash_string("1", username="u", hash_password="hp") == "1uhp"  # zero amount is omitted, as in C#
    p = _provider()
    hp = p.hash_password
    assert p.api_hash() == _b64sha1(b"1hakderap\xfd" + hp.encode())
    assert p.api_hash("EINF1") == _b64sha1(b"1EINF1hakderap\xfd" + hp.encode())
    assert p.api_hash("EINF1", 150) == _b64sha1(b"1EINF1150hakderap\xfd" + hp.encode())
    expected = _b64sha1(b"1EINF1150" + b"https://a/ok" + b"https://a/fail" + b"hakderap\xfd" + hp.encode())
    assert p.payment_hash("EINF1", 150, "https://a/ok", "https://a/fail") == expected


async def test_start_builds_the_documented_form():
    assert PROVIDERS["vakifkatilim"] is vk.VakifKatilimProvider
    p = _provider()
    started = await p.start(_ctx())
    f = started.post_fields
    assert started.post_action == "https://boa.vakifkatilim.com.tr/VirtualPOS.Gateway/CommonPaymentPage/CommonPaymentPage"
    assert list(f) == ["UserName", "HashPassword", "MerchantId", "MerchantOrderId", "Amount", "FECCurrencyCode",
                       "OkUrl", "FailUrl", "PaymentType", "TransactionSecurity", "HashData"]
    assert f["Amount"] == "15050" and f["FECCurrencyCode"] == "0949"
    assert f["PaymentType"] == "1" and f["TransactionSecurity"] == "3"
    assert f["OkUrl"] == "https://api.example.org/api/v1/payments/x/return?r=ok"
    assert f["FailUrl"] == "https://api.example.org/api/v1/payments/x/return?r=fail" and f["OkUrl"] != f["FailUrl"]
    assert f["HashPassword"] == p.hash_password and "api_password" not in f and "Şifre123ı" not in f.values()
    assert f["HashData"] == p.payment_hash("EINFABC123DEF456", 15050, f["OkUrl"], f["FailUrl"])


async def test_start_refuses_test_mode_and_foreign_currency(monkeypatch):
    with pytest.raises(PaymentProviderError, match="test ortamı yok"):
        await vk.VakifKatilimProvider(CREDS, live=False).start(_ctx())
    with pytest.raises(PaymentProviderError):
        await _provider().start(_ctx(currency="USD"))
    monkeypatch.setattr(settings, "PAYMENTS_LIVE_ENABLED", False)
    assert not build_provider("vakifkatilim", CREDS).live
    assert not build_provider("vakifkatilim", {**CREDS, "api_password": ""}).configured


# --- XML ---------------------------------------------------------------------

def test_parses_the_documented_sample_responses():
    top, orders = vk.parse_response(LOOKUP_SAMPLE.encode("utf-8"))
    assert top["ResponseCode"] == "00" and len(orders) == 1
    order = orders[0]
    assert order["MerchantOrderId"] == "1995434716" and order["FirstAmount"] == "9.30"
    assert order["CardHolderName"] == "Hasan Karacan" and order["ResponseExplain"] == "Provizyon alındı."
    assert vk.order_succeeded(order)
    # The same document really encoded as UTF-16 (with BOM) parses too.
    assert vk.parse_response(LOOKUP_SAMPLE.encode("utf-16"))[1] == orders

    _, many = vk.parse_response(SELECT_ORDER_SAMPLE.encode("utf-8"))
    assert [o["OrderId"] for o in many] == ["12754", "12753"]
    assert [vk.order_succeeded(o) for o in many] == [False, True]
    assert many[0]["TranAmount"] == "3.90"
    assert vk.VakifKatilimProvider._pick(many)["OrderId"] == "12753"

    with pytest.raises(PaymentProviderError):
        vk.parse_response(b"<html>Access denied")


def test_cancelled_or_refunded_sale_is_not_success():
    _, [order] = vk.parse_response(_order_xml("M", cancel="250.00"))
    assert not vk.order_succeeded(order)
    _, [order] = vk.parse_response(_order_xml("M", drawback="10.00"))
    assert not vk.order_succeeded(order)


def test_request_message_is_well_formed_and_escaped():
    p = _provider(username="a&b<ı>")
    message = p._message([("MerchantOrderId", "X1")])
    assert message.startswith('<?xml version="1.0" encoding="utf-16"?><VPosMessageContract')
    root = ET.fromstring(vk.XML_DECLARATION.sub("", message))
    assert [c.tag for c in root] == ["HashData", "MerchantId", "SubMerchantId", "CustomerId", "UserName",
                                     "HashPassword", "MerchantOrderId"]
    assert root.findtext("UserName") == "a&b<ı>" and root.findtext("SubMerchantId") == "0"
    assert root.findtext("HashData") == p.api_hash("X1")
    reversal = ET.fromstring(vk.XML_DECLARATION.sub("", p._message([("MerchantOrderId", "X1"), ("Amount", 150)])))
    assert reversal.findtext("HashData") == p.api_hash("X1", 150)


# --- callback / query --------------------------------------------------------

def _fake_bank(monkeypatch, replies: list[bytes], sent: list | None = None):
    async def fake_post(self, endpoint, message):
        if sent is not None:
            sent.append((endpoint, message))
        return replies.pop(0) if len(replies) > 1 else replies[0]

    async def no_sleep(_):
        return None

    monkeypatch.setattr(vk.VakifKatilimProvider, "_post_xml", fake_post)
    monkeypatch.setattr(vk.asyncio, "sleep", no_sleep)


async def test_callback_is_decided_by_the_bank_not_the_browser(monkeypatch):
    p = _provider()
    sent = []
    _fake_bank(monkeypatch, [_order_xml("EINF1", "9.30")], sent)
    result = await p.parse_callback({"MerchantOrderId": "EINF1", "ResponseCode": "05"}, None)
    assert result.approved and result.amount_cents == 930 and result.currency == "TRY"
    assert result.provider_transaction_id == "5001" and result.card_last_4 == "0016" and result.card_brand == "Troy"
    assert result.safe_response["browser"]["ResponseCode"] == "05"
    assert sent[0][0] == "SelectOrderByMerchantOrderId" and "<MerchantOrderId>EINF1</MerchantOrderId>" in sent[0][1]


async def test_forged_success_callback_is_rejected(monkeypatch):
    p = _provider()
    forged = {"MerchantOrderId": "EINF1", "ResponseCode": "00", "ResponseMessage": "", "OrderId": "1", "HashData": "x"}
    # Bank says the sale failed: not approved, whatever the browser posted.
    _fake_bank(monkeypatch, [_order_xml("EINF1", tx_status="2", code="05")])
    result = await p.parse_callback(forged, None)
    assert not result.approved and result.code == "05"
    # Bank does not know the order at all (checked twice): refused, order left for the reconciler.
    sent = []
    _fake_bank(monkeypatch, [EMPTY_XML], sent)
    with pytest.raises(PaymentProviderError):
        await p.parse_callback(forged, None)
    assert len(sent) == 2
    # Another merchant order's record in the reply is ignored.
    _fake_bank(monkeypatch, [_order_xml("OTHER")])
    with pytest.raises(PaymentProviderError):
        await p.parse_callback(forged, None)
    # A failure return the bank has no record of is a plain failure.
    _fake_bank(monkeypatch, [EMPTY_XML])
    failed = await p.parse_callback({"MerchantOrderId": "EINF1", "ResponseCode": "51",
                                     "ResponseMessage": "Bakiye yetersiz"}, None)
    assert not failed.approved and failed.code == "51"


async def test_query_requires_matching_amount(monkeypatch):
    p = _provider()
    _fake_bank(monkeypatch, [_order_xml("EINF1", "250.00")])
    assert (await p.query("EINF1", 25_000, "TRY")).approved
    assert not (await p.query("EINF1", 30_000, "TRY")).approved
    _fake_bank(monkeypatch, [EMPTY_XML])
    assert not (await p.query("EINF1", 25_000, "TRY")).approved


# --- refund ------------------------------------------------------------------

REFUND_OK = (b'<?xml version="1.0" encoding="UTF-8"?><VPosTransactionResponseContract><ResponseCode>00</ResponseCode>'
             b"<ResponseMessage /><OrderId>7001</OrderId></VPosTransactionResponseContract>")


@pytest.mark.parametrize("end_of_day, amount, endpoint", [
    ("1", 25_000, "SaleReversal"), ("2", 25_000, "DrawBack"), ("2", 10_000, "PartialDrawBack"),
])
async def test_refund_picks_cancel_or_drawback(monkeypatch, end_of_day, amount, endpoint):
    sent = []
    _fake_bank(monkeypatch, [_order_xml("EINF1", end_of_day=end_of_day), REFUND_OK], sent)
    result = await _provider().refund(merchant_payment_id="EINF1", provider_transaction_id="5001",
                                      amount_cents=amount, currency="TRY")
    assert result.ok and result.provider_transaction_id == "7001"
    name, message = sent[1]
    assert name == endpoint
    root = ET.fromstring(vk.XML_DECLARATION.sub("", message))
    assert root.findtext("OrderId") == "5001" and root.findtext("MerchantOrderId") == "EINF1"
    if endpoint == "SaleReversal":
        assert root.findtext("Amount") == "25000" and root.findtext("PaymentType") == "1"
    if endpoint == "PartialDrawBack":
        assert root.findtext("Amount") == "10000" and root.findtext("DisplayAmount") == "10000"


async def test_refund_refusals(monkeypatch):
    sent = []
    _fake_bank(monkeypatch, [_order_xml("EINF1", end_of_day="1")], sent)
    partial_today = await _provider().refund(merchant_payment_id="EINF1", provider_transaction_id="5001",
                                             amount_cents=100, currency="TRY")
    assert not partial_today.ok and "gün sonu" in partial_today.message.lower() and len(sent) == 1
    _fake_bank(monkeypatch, [_order_xml("EINF1", end_of_day="2", drawback="200.00")])
    too_much = await _provider().refund(merchant_payment_id="EINF1", provider_transaction_id="5001",
                                        amount_cents=10_000, currency="TRY")
    assert not too_much.ok
    rejected = (b"<VPosTransactionResponseContract><ResponseCode>12</ResponseCode>"
                b"<ResponseMessage>Org islem bulunamadi</ResponseMessage></VPosTransactionResponseContract>")
    _fake_bank(monkeypatch, [_order_xml("EINF1", end_of_day="2"), rejected])
    refused = await _provider().refund(merchant_payment_id="EINF1", provider_transaction_id="5001",
                                       amount_cents=25_000, currency="TRY")
    assert not refused.ok and "Org islem" in refused.message


# --- end to end through checkout ---------------------------------------------

async def _org_with_order(db_session, monkeypatch, cents: int):
    monkeypatch.setattr(settings, "CREDENTIALS_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setattr(settings, "PAYMENT_CALLBACK_BASE_URL", "https://api.example.org")
    monkeypatch.setattr(settings, "PAYMENTS_LIVE_ENABLED", True)
    slug = f"vk-{uuid.uuid4().hex[:8]}"
    org = Organization(slug=slug, name="HAKDER", legal_name=slug, email=f"{slug}@example.com",
                       primary_domain=f"{slug}.example.com", plan="ileri", enabled_addons=[], extra_user_seats=0,
                       subdomain=slug, settings={"payment_provider": "vakifkatilim"})
    db_session.add(org)
    await db_session.flush()
    campaign = Campaign(organization_id=org.id, slug="su", title="Su Kuyusu", summary="s", target_cents=0,
                        status=CampaignStatus.ACTIVE)
    db_session.add(campaign)
    await save_credentials(db_session, org.id, "vakifkatilim", CREDS, actor="t")
    await db_session.commit()
    payload = CheckoutSessionCreate(
        items=[{"campaign_id": str(campaign.id), "unit_amount_cents": cents}],
        donor={"first_name": "Ayşe", "last_name": "Yılmaz", "email": "ayse@example.com", "phone": "05321112233"},
        idempotency_key=uuid.uuid4().hex, kvkk_accepted=True, terms_accepted=True,
    )
    response = await checkout.create_checkout_session(_request(org, "POST"), payload, db_session, None)
    order = await checkout._load_order(db_session, response.checkout_id)
    return org, response, order


async def test_checkout_launch_and_verified_return(db_session, monkeypatch):
    org, response, order = await _org_with_order(db_session, monkeypatch, 25_000)
    session_token = response.redirect_url.rsplit("/", 1)[1]
    page = await checkout.launch_payment(session_token, db_session)
    body = page.body.decode()
    assert 'action="https://boa.vakifkatilim.com.tr/VirtualPOS.Gateway/CommonPaymentPage/CommonPaymentPage"' in body
    assert "form-action https://boa.vakifkatilim.com.tr" in page.headers["content-security-policy"]
    assert f'value="{order.merchant_payment_id}"' in body and 'value="25000"' in body
    assert "/api/v1/payments/vakifkatilim/return?r=ok" in body

    # Forged success with no bank record: rejected, order untouched.
    _fake_bank(monkeypatch, [EMPTY_XML])
    forged = urlencode({"MerchantOrderId": order.merchant_payment_id, "ResponseCode": "00", "OrderId": "1"}).encode()
    with pytest.raises(HTTPException) as exc:
        await checkout.payment_return("vakifkatilim", _request(method="POST", body=forged), db_session)
    assert exc.value.status_code == 400
    db_session.expire_all()
    assert (await checkout._load_order(db_session, response.checkout_id)).status == PaymentOrderStatus.PENDING

    # Genuine return: the bank confirms, the order is paid.
    _fake_bank(monkeypatch, [_order_xml(order.merchant_payment_id, "250.00")])
    redirect = await checkout.payment_return("vakifkatilim", _request(method="POST", body=forged), db_session)
    assert "/bagis/basarili" in redirect.headers["location"]
    db_session.expire_all()
    paid = await checkout._load_order(db_session, response.checkout_id)
    assert paid.status == PaymentOrderStatus.PAID
    attempt = (await db_session.execute(select(PaymentAttempt).where(PaymentAttempt.order_id == paid.id))).scalar_one()
    assert attempt.pg_tran_id == "5001" and attempt.card_last_4 == "0016"


async def test_amount_mismatch_goes_to_review(db_session, monkeypatch):
    org, response, order = await _org_with_order(db_session, monkeypatch, 25_000)
    _fake_bank(monkeypatch, [_order_xml(order.merchant_payment_id, "2.50")])
    data = urlencode({"MerchantOrderId": order.merchant_payment_id, "ResponseCode": "00"}).encode()
    redirect = await checkout.payment_return("vakifkatilim", _request(method="POST", body=data), db_session)
    assert "/bagis/hata" in redirect.headers["location"]
    db_session.expire_all()
    assert (await checkout._load_order(db_session, response.checkout_id)).status == PaymentOrderStatus.REVIEW


# --- stored cards (CardSave + MailOrderSale) ---------------------------------

VALID_CARD = ("4508 0345 0803 4509", "12", "39", "000", "Seçkin Bozkurt")


def test_card_data_validation_and_no_leaks():
    card = vk.CardData(*VALID_CARD)
    assert card.valid() is None and card.last4 == "4509" and vk.card_brand(card.number) == "Visa"
    assert "4508" not in repr(card)
    assert vk.CardData("4508034508034500", "12", "39", "000", "Ali Veli").valid() == "Kart numarası geçersiz"
    assert vk.CardData("4508034508034509", "13", "39", "000", "Ali Veli").valid() == "Son kullanma tarihi geçersiz"
    assert vk.CardData("4508034508034509", "01", "20", "000", "Ali Veli").valid() == "Kartın süresi dolmuş"
    assert vk.CardData("4508034508034509", "12", "39", "0", "Ali Veli").valid().startswith("Güvenlik kodu")
    assert vk.card_brand("5353550000958906") == "MasterCard" and vk.card_brand("9792000000000016") == "Troy"


async def test_card_save_sends_card_data_contract_and_returns_guid(monkeypatch):
    sent: list = []
    reply = (b'<?xml version="1.0" encoding="utf-16"?><VPosTransactionResponseContract><ResponseCode>00</ResponseCode>'
             b'<ResponseMessage /><CardGuid>429675215AD44D38B05793911EAE1F9D</CardGuid></VPosTransactionResponseContract>')
    _fake_bank(monkeypatch, [reply], sent)
    p = _provider()
    ref = await p.save_card(vk.CardData(*VALID_CARD))
    assert ref == {"card_guid": "429675215AD44D38B05793911EAE1F9D"}
    endpoint, message = sent[0]
    root = ET.fromstring(vk.XML_DECLARATION.sub("", message))
    assert endpoint == "CardSave" and root.tag == "VPosCardDataContract"
    assert root.findtext("CardNumber") == "4508034508034509" and root.findtext("CardExpireDateMonth") == "12"
    assert root.findtext("CardExpireDateYear") == "39" and root.findtext("CardCVV2") == "000"
    assert root.findtext("HashData") == p.api_hash()  # no order or amount in the message


async def test_card_save_error_and_test_mode_refused(monkeypatch):
    _fake_bank(monkeypatch, [b"<VPosTransactionResponseContract><ResponseCode>CardError</ResponseCode>"
                             b"<ResponseMessage>Kart kaydedilemedi</ResponseMessage></VPosTransactionResponseContract>"])
    with pytest.raises(PaymentProviderError, match="Kart kaydedilemedi"):
        await _provider().save_card(vk.CardData(*VALID_CARD))
    with pytest.raises(PaymentProviderError, match="test ortamı"):
        await vk.VakifKatilimProvider(CREDS, live=False).save_card(vk.CardData(*VALID_CARD))


async def test_charge_stored_uses_mail_order_with_card_guid_and_trusts_the_lookup(monkeypatch):
    sent: list = []
    sale = (b"<VPosTransactionResponseContract><ResponseCode>00</ResponseCode><OrderId>5001</OrderId>"
            b"</VPosTransactionResponseContract>")
    _fake_bank(monkeypatch, [sale, _order_xml("EINF1", "150.00")], sent)
    p = _provider()
    result = await p.charge_stored(_ctx(merchant_payment_id="EINF1", total_cents=15000), {"card_guid": "G1"})
    assert result.approved and result.provider_transaction_id == "5001"
    endpoint, message = sent[0]
    root = ET.fromstring(vk.XML_DECLARATION.sub("", message))
    assert endpoint == "MailOrderSale" and root.findtext("CardGuid") == "G1"
    assert root.findtext("Amount") == "15000" and root.findtext("TransactionSecurity") == "1"
    assert root.find("Addresses/VPosAddressContract/Name") is not None
    assert root.findtext("HashData") == p.api_hash("EINF1", 15000)
    assert sent[1][0] == "SelectOrderByMerchantOrderId"

    # The bank's record wins: no order there means not paid, whatever the sale answer said.
    _fake_bank(monkeypatch, [sale, b"<VPosTransactionResponseContract><ResponseCode>00</ResponseCode>"
                                   b"<VPosOrderData /></VPosTransactionResponseContract>"])
    missing = await p.charge_stored(_ctx(merchant_payment_id="EINF2", total_cents=15000), {"card_guid": "G1"})
    assert not missing.approved


async def test_donor_saves_card_for_recurring_and_cancel_releases_it(db_session, monkeypatch):
    """Manage page → CardSave → instruction switches to card mode; the number is never stored."""
    from datetime import datetime, timedelta, timezone

    from cryptography.fernet import Fernet
    from sqlalchemy import text

    from app.api.v1 import donor_portal
    from app.core.config import settings
    from app.models.campaign import Campaign
    from app.models.donation import Donor
    from app.models.organization import Organization
    from app.models.subscription import Subscription
    from app.services.tenant_credentials import decrypt, save_credentials

    monkeypatch.setattr(settings, "CREDENTIALS_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setattr(settings, "PAYMENTS_LIVE_ENABLED", True)
    slug = f"vk-{uuid.uuid4().hex[:8]}"
    org = Organization(slug=slug, name="HAKDER", legal_name="HAKDER", email=f"{slug}@example.com",
                       primary_domain=f"{slug}.example.com", settings={"payment_provider": "vakifkatilim"})
    db_session.add(org)
    await db_session.flush()
    await save_credentials(db_session, org.id, "vakifkatilim", CREDS, actor="t")
    campaign = Campaign(organization_id=org.id, slug="su", title="Su", summary="s", target_cents=1, collected_cents=0)
    donor = Donor(organization_id=org.id, first_name="Seçkin", last_name="Bozkurt", phone="05456236712")
    db_session.add_all([campaign, donor])
    await db_session.flush()
    sub = Subscription(organization_id=org.id, donor_id=donor.id, campaign_id=campaign.id, amount_cents=10000,
                       status="active", mode="reminder", day_of_month=5, manage_token="t" * 32,
                       next_charge_date=datetime.now(timezone.utc) + timedelta(days=10))
    db_session.add(sub)
    await db_session.commit()

    saved, deleted = [], []

    async def fake_save(self, card):
        saved.append(card.last4)
        return {"card_guid": "GUID-1"}

    async def fake_delete(self, ref):
        deleted.append(ref["card_guid"])
        return True

    monkeypatch.setattr(vk.VakifKatilimProvider, "save_card", fake_save)
    monkeypatch.setattr(vk.VakifKatilimProvider, "delete_card", fake_delete)

    info = await donor_portal.get_recurring_by_token("t" * 32, db_session)
    assert info["can_save_card"] is True
    payload = donor_portal.SaveCardPayload(card_number="4508 0345 0803 4509", expire_month="12", expire_year="39",
                                           cvv="000", holder_name="Seçkin Bozkurt")
    assert "4508" not in repr(payload)
    out = await donor_portal.save_recurring_card("t" * 32, payload, db_session, None)
    assert out["mode"] == "card" and out["card_last4"] == "4509" and saved == ["4509"]
    await db_session.refresh(sub)
    assert sub.provider == "vakifkatilim" and decrypt(sub.card_ref) == {"card_guid": "GUID-1"}
    dump = (await db_session.execute(text("select row_to_json(s)::text from subscriptions s where id = :i"),
                                     {"i": sub.id})).scalar_one()
    assert "4508034508034509" not in dump and "4509" in dump  # only the last four digits

    bad = donor_portal.SaveCardPayload(card_number="4508034508034500", expire_month="12", expire_year="39",
                                       cvv="000", holder_name="Seçkin Bozkurt")
    with pytest.raises(Exception, match="Kart numarası geçersiz"):
        await donor_portal.save_recurring_card("t" * 32, bad, db_session, None)

    await donor_portal.act_on_recurring_by_token("t" * 32, donor_portal.SubscriptionActionPayload(action="cancel"),
                                                 db_session)
    await db_session.refresh(sub)
    assert sub.status == "cancelled" and sub.card_ref is None and deleted == ["GUID-1"]

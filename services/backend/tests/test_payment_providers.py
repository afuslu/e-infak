"""Payment and SMS drivers with mocked provider responses (no network)."""
import base64
import hashlib
import hmac
import json

import pytest

from app.payments import PROVIDERS, build_provider
from app.payments.base import CheckoutContext, CheckoutLine, PaymentProviderError
from app.payments.providers import iyzico, nestpay, paytr


def _ctx(**overrides):
    values = dict(
        merchant_payment_id="EINFABC123DEF456", total_cents=15050, currency="TRY", locale="tr",
        lines=[CheckoutLine("Su kuyusu", 1, 10050, "c1"), CheckoutLine("Kumanya", 2, 2500, "c2")],
        customer_id="d1", customer_first_name="Ayşe", customer_last_name="Yılmaz", customer_email="ayse@example.com",
        customer_phone="0532 111 22 33", customer_ip="203.0.113.5", user_agent="UA",
        return_url="https://api.example.org/api/v1/payments/x/return",
        notify_url="https://api.example.org/api/v1/payments/x/notify",
        success_url="https://kurum.example.org/bagis/basarili?checkout=1",
        fail_url="https://kurum.example.org/bagis/hata?checkout=1",
    )
    values.update(overrides)
    return CheckoutContext(**values)


def test_registry_and_live_mode(monkeypatch):
    from app.core.config import settings

    assert {"ziraatpay", "iyzico", "paytr", "nestpay"} <= set(PROVIDERS)
    monkeypatch.setattr(settings, "PAYMENTS_LIVE_ENABLED", False)
    assert not build_provider("iyzico", {"api_key": "a", "secret_key": "b", "mode": "live"}).live
    monkeypatch.setattr(settings, "PAYMENTS_LIVE_ENABLED", True)
    assert build_provider("iyzico", {"api_key": "a", "secret_key": "b", "mode": "live"}).live
    assert not build_provider("iyzico", {"api_key": "a", "secret_key": "b", "mode": "test"}).live
    with pytest.raises(PaymentProviderError):
        build_provider("unknown", {})


# --- iyzico -----------------------------------------------------------------

def test_iyzico_signature_matches_documented_vector():
    secret = "sandbox-qaIiLIxhjMgx3LSKIVvp6j17NunHOFtD"
    assert iyzico.signature(secret, "22416032", "TRY", "basketId", "conversationId", "10.5", "10.5") == (
        "836c3a6c8db86c81043f2ca74edb13518b54a813f454f8dd762f0dd658610173"
    )
    assert [iyzico.strip_zeros(v) for v in ("10.50", "10.0", "50.00", "10.5105", "5.20000000", "12")] == [
        "10.5", "10", "50", "10.5105", "5.2", "12"]


def test_iyzico_auth_header_format():
    header = iyzico.auth_header("key", "secret", "/payment/bin/check", '{"a":1}', "rnd")
    decoded = base64.b64decode(header.split(" ", 1)[1]).decode()
    expected = hmac.new(b"secret", b'rnd/payment/bin/check{"a":1}', hashlib.sha256).hexdigest()
    assert header.startswith("IYZWSv2 ") and decoded == f"apiKey:key&randomKey:rnd&signature:{expected}"


async def test_iyzico_flow_verifies_server_side_result(monkeypatch):
    provider = iyzico.IyzicoProvider({"api_key": "k", "secret_key": "s"}, live=False)
    calls = []

    async def fake_post(path, payload):
        calls.append((path, payload))
        if path.endswith("initialize/auth/ecom"):
            return {"status": "success", "token": "tok-1", "paymentPageUrl": "https://sandbox-cpp.iyzipay.com?token=tok-1",
                    "conversationId": payload["conversationId"],
                    "signature": iyzico.signature("s", payload["conversationId"], "tok-1")}
        detail = {"status": "success", "paymentStatus": "SUCCESS", "fraudStatus": 1, "paymentId": "991",
                  "currency": "TRY", "basketId": "EINFABC123DEF456", "conversationId": "EINFABC123DEF456",
                  "paidPrice": "150.50000000", "price": "150.5", "token": "tok-1", "lastFourDigits": "0016"}
        detail["signature"] = iyzico.signature("s", "SUCCESS", "991", "TRY", "EINFABC123DEF456", "EINFABC123DEF456",
                                               "150.5", "150.5", "tok-1")
        return detail

    monkeypatch.setattr(provider, "_post", fake_post)
    started = await provider.start(_ctx())
    sent = calls[0][1]
    assert started.redirect_url.startswith("https://sandbox-cpp.iyzipay.com") and started.session_token == "tok-1"
    assert sent["price"] == "150.50" and sum(float(i["price"]) for i in sent["basketItems"]) == 150.5
    assert sent["buyer"]["gsmNumber"] == "+905321112233"
    result = await provider.parse_callback({"token": "tok-1"}, "tok-1")
    assert result.approved and result.amount_cents == 15050 and result.provider_transaction_id == "991"
    with pytest.raises(PaymentProviderError):
        await provider.parse_callback({"token": "other"}, "tok-1")


async def test_iyzico_rejects_forged_detail(monkeypatch):
    provider = iyzico.IyzicoProvider({"api_key": "k", "secret_key": "s"}, live=False)

    async def fake_post(path, payload):
        return {"status": "success", "paymentStatus": "SUCCESS", "fraudStatus": 1, "paymentId": "1", "currency": "TRY",
                "basketId": "B", "conversationId": "B", "paidPrice": "1", "price": "1", "token": "t", "signature": "bad"}

    monkeypatch.setattr(provider, "_post", fake_post)
    with pytest.raises(PaymentProviderError):
        await provider.parse_callback({"token": "t"}, "t")


# --- PayTR ------------------------------------------------------------------

def _paytr_hash(key: str, text: str) -> str:
    return base64.b64encode(hmac.new(key.encode(), text.encode(), hashlib.sha256).digest()).decode()


async def test_paytr_token_request_and_notification(monkeypatch):
    creds = {"merchant_id": "123", "merchant_key": "KEY", "merchant_salt": "SALT"}
    provider = paytr.PaytrProvider(creds, live=False)
    sent = {}

    async def fake_post(url, data):
        sent.update(data)
        return {"status": "success", "token": "ptok"}

    monkeypatch.setattr(provider, "_post", fake_post)
    started = await provider.start(_ctx())
    assert started.iframe_url == "https://www.paytr.com/odeme/guvenli/ptok" and not started.redirect_url
    assert sent["payment_amount"] == "15050" and sent["test_mode"] == "1" and sent["currency"] == "TL"
    basket = json.loads(base64.b64decode(sent["user_basket"]))
    assert basket == [["Su kuyusu", "100.50", 1], ["Kumanya", "25.00", 2]]
    expected = _paytr_hash("KEY", "123" + "203.0.113.5" + "EINFABC123DEF456" + "ayse@example.com" + "15050"
                           + sent["user_basket"] + "1" + "0" + "TL" + "1" + "SALT")
    assert sent["paytr_token"] == expected
    assert sent["merchant_ok_url"].endswith("/bagis/basarili?checkout=1")

    note = {"merchant_oid": "EINFABC123DEF456", "status": "success", "total_amount": "15050",
            "payment_amount": "15050", "currency": "TL"}
    note["hash"] = _paytr_hash("KEY", "EINFABC123DEF456" + "SALT" + "success" + "15050")
    result = await provider.parse_callback(note, None)
    assert result.approved and result.amount_cents == 15050 and result.currency == "TRY"
    assert paytr.PaytrProvider.callback_reference(note) == ("EINFABC123DEF456", None)
    assert paytr.PaytrProvider.notification_reply(True).body == "OK"
    with pytest.raises(PaymentProviderError):
        await provider.parse_callback({**note, "total_amount": "1"}, None)


# --- NestPay ----------------------------------------------------------------

def test_nestpay_hash_escapes_and_sorts():
    fields = {"b": "x|y", "A": "back\\slash", "hash": "ignored", "encoding": "utf-8"}
    raw = "|".join(["back\\\\slash", "x\\|y", "KEY"])
    assert nestpay.ver3_hash(fields, "KEY") == base64.b64encode(hashlib.sha512(raw.encode()).digest()).decode()


async def test_nestpay_form_and_callback(monkeypatch):
    creds = {"bank": "akbank", "client_id": "100200", "store_key": "STOREKEY"}
    provider = nestpay.NestPayProvider(creds, live=False)
    started = await provider.start(_ctx())
    assert started.post_action == "https://entegrasyon.asseco-see.com.tr/fim/est3Dgate"
    form = started.post_fields
    assert form["storetype"] == "3d_pay_hosting" and form["amount"] == "150.50" and form["currency"] == "949"
    assert "pan" not in form and form["hash"] == nestpay.ver3_hash(form, "STOREKEY")
    assert nestpay.NestPayProvider(creds, live=True).host == "https://www.sanalakpos.com"

    callback = {"oid": "EINFABC123DEF456", "ProcReturnCode": "00", "mdStatus": "1", "amount": "150.50",
                "currency": "949", "TransId": "T1", "maskedCreditCard": "4355 08** **** 4358", "clientid": "100200"}
    callback["HASH"] = nestpay.ver3_hash(callback, "STOREKEY")
    result = await provider.parse_callback(callback, None)
    assert result.approved and result.amount_cents == 15050 and result.card_last_4 == "4358"
    with pytest.raises(PaymentProviderError):
        await provider.parse_callback({**callback, "amount": "1.00"}, None)
    half = {**callback, "mdStatus": "2"}
    half["HASH"] = nestpay.ver3_hash(half, "STOREKEY")
    assert not (await provider.parse_callback(half, None)).approved


# --- SMS --------------------------------------------------------------------

class _Resp:
    def __init__(self, status, text="", data=None):
        self.status_code, self.text, self._data = status, text, data

    def json(self):
        return self._data


def test_sms_drivers(monkeypatch):
    from app import sms

    assert sms.normalize_tr_phone("0532 111 22 33") == "905321112233"
    assert sms.normalize_tr_phone("+90 532 111 22 33") == "905321112233"
    seen = []

    def fake_request(method, url, **kwargs):
        seen.append((method, url, kwargs))
        if "netgsm" in url:
            return _Resp(200, "00 123456")
        if "verimor" in url:
            return _Resp(200, "20210")
        return _Resp(200, data={"response": {"status": {"code": 200, "message": "ok"}, "order": {"id": "312"}}})

    monkeypatch.setattr(sms.requests, "request", fake_request)
    assert sms.deliver("05321112233", "m", {"provider": "netgsm", "username": "u", "password": "p"}).reference == "123456"
    assert seen[-1][2]["params"]["gsmno"] == "5321112233"
    assert sms.deliver("05321112233", "m", {"provider": "verimor", "username": "u", "password": "p"}).reference == "20210"
    assert seen[-1][2]["json"]["messages"][0]["dest"] == "905321112233"
    result = sms.deliver("05321112233", "m", {"provider": "iletimerkezi", "api_key": "k", "api_hash": "h", "sender": "KURUM"})
    order = seen[-1][2]["json"]["request"]["order"]
    assert result.reference == "312" and order["iys"] == "0" and order["message"]["receipents"]["number"] == ["905321112233"]

    monkeypatch.setattr(sms.requests, "request", lambda *a, **k: _Resp(200, "30"))
    with pytest.raises(sms.SmsError):
        sms.deliver("05321112233", "m", {"provider": "netgsm", "username": "u", "password": "p"})
    monkeypatch.setattr(sms.requests, "request", lambda *a, **k: _Resp(400, "INSUFFICIENT_CREDITS"))
    with pytest.raises(sms.SmsError):
        sms.deliver("05321112233", "m", {"provider": "verimor", "username": "u", "password": "p"})
    with pytest.raises(sms.SmsError):
        sms.deliver("05321112233", "m", {"provider": "verimor", "username": "u"})

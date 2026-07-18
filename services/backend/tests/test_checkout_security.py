import hashlib

import pytest
from pydantic import ValidationError

from app.core.config import settings
from app.schemas.checkout import CheckoutSessionCreate
from app.utils.ziraatpay import ZiraatPayClient


def test_ziraatpay_callback_signature_uses_current_sd_sha512(monkeypatch):
    monkeypatch.setattr(settings, "ZIRAATPAY_MERCHANT", "merchant")
    monkeypatch.setattr(settings, "ZIRAATPAY_MERCHANT_USER", "user")
    monkeypatch.setattr(settings, "ZIRAATPAY_MERCHANT_PASSWORD", "password")
    monkeypatch.setattr(settings, "ZIRAATPAY_SECRET_KEY", "secret")
    data = {
        "merchantPaymentId": "payment-1",
        "customerId": "customer-1",
        "sessionToken": "session-1",
        "responseCode": "00",
        "random": "random-1",
    }
    raw = "payment-1|customer-1|session-1|00|random-1|secret"
    data["sdSha512"] = hashlib.sha512(raw.encode()).hexdigest()
    client = ZiraatPayClient()
    assert client.verify_callback(data)
    data["responseCode"] = "99"
    assert not client.verify_callback(data)


def test_safe_callback_drops_sensitive_fields():
    result = ZiraatPayClient().safe_callback({
        "merchantPaymentId": "payment-1",
        "panLast4": "4242",
        "pan": "4242424242424242",
        "cvv": "123",
    })
    assert result == {"merchantPaymentId": "payment-1", "panLast4": "4242"}


def test_checkout_requires_kvkk_and_contains_no_card_fields():
    payload = {
        "items": [{
            "campaign_id": "11111111-1111-1111-1111-111111111111",
            "quantity": 1,
            "unit_amount_cents": 10000,
        }],
        "donor": {
            "first_name": "Ahmet",
            "last_name": "Yılmaz",
            "email": "ahmet@example.com",
            "phone": "05555555555",
        },
        "payment_method": "credit_card",
        "idempotency_key": "1234567890abcdef",
        "kvkk_accepted": False,
    }
    with pytest.raises(ValidationError):
        CheckoutSessionCreate.model_validate(payload)
    payload["kvkk_accepted"] = True
    checkout = CheckoutSessionCreate.model_validate(payload)
    assert "card_number" not in checkout.model_dump()


def test_checkout_supports_locale_and_currency_without_card_data():
    payload = {
        "items": [{
            "campaign_id": "11111111-1111-1111-1111-111111111111",
            "quantity": 1,
            "unit_amount_cents": 10000,
        }],
        "donor": {
            "first_name": "Ahmet",
            "last_name": "Yılmaz",
            "email": "ahmet@example.com",
            "phone": "05555555555",
        },
        "payment_method": "credit_card",
        "currency": "EUR",
        "locale": "ar",
        "idempotency_key": "1234567890abcdef",
        "kvkk_accepted": True,
    }
    checkout = CheckoutSessionCreate.model_validate(payload)
    assert checkout.currency == "EUR"
    assert checkout.locale == "ar"
    assert "card_number" not in checkout.model_dump()

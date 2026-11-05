"""iyzico Checkout Form (hosted payment page).

Docs: docs.iyzico.com — CF initialize / retrieve, Refund V2, Retrieve Payment,
IYZWSv2 auth, response signature validation.
"""
import base64
import hashlib
import hmac
import json
import secrets
import string
from typing import Any, Optional

import httpx

from app.payments import register
from app.payments.base import (
    CheckoutContext, PaymentProvider, PaymentProviderError, PaymentResult, RefundResult, StartResult, money, to_cents,
)

LIVE_URL = "https://api.iyzipay.com"
SANDBOX_URL = "https://sandbox-api.iyzipay.com"
# iyzico requires a Turkish ID number for the buyer; donors are not asked for one.
PLACEHOLDER_IDENTITY = "11111111111"


def strip_zeros(value: Any) -> str:
    """Signature format for prices: 10.50 -> 10.5, 10.0 -> 10."""
    text = str(value)
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text


def signature(secret_key: str, *values: Any) -> str:
    raw = ":".join("" if v is None else str(v) for v in values)
    return hmac.new(secret_key.encode(), raw.encode(), hashlib.sha256).hexdigest()


def auth_header(api_key: str, secret_key: str, path: str, body: str, random_key: str) -> str:
    signed = hmac.new(secret_key.encode(), (random_key + path + body).encode("utf-8"), hashlib.sha256).hexdigest()
    auth = f"apiKey:{api_key}&randomKey:{random_key}&signature:{signed}"
    return "IYZWSv2 " + base64.b64encode(auth.encode()).decode()


@register
class IyzicoProvider(PaymentProvider):
    key = "iyzico"
    label = "iyzico"
    credential_fields = {"api_key": "API anahtarı", "secret_key": "Güvenlik anahtarı (secret key)"}
    secret_fields = {"secret_key"}
    currencies = {"TRY", "USD", "EUR", "GBP"}

    @property
    def base_url(self) -> str:
        return LIVE_URL if self.live else SANDBOX_URL

    async def _post(self, path: str, payload: dict) -> dict:
        self.require_configured()
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        random_key = "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(12))
        headers = {
            "Authorization": auth_header(self.credentials["api_key"], self.credentials["secret_key"], path, body, random_key),
            "x-iyzi-rnd": random_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(self.base_url + path, content=body.encode("utf-8"), headers=headers)
            return response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise PaymentProviderError("iyzico'ya ulaşılamadı") from exc

    def _verify(self, data: dict, *values: Any) -> bool:
        received = str(data.get("signature") or "")
        return bool(received) and hmac.compare_digest(received, signature(self.credentials["secret_key"], *values))

    async def start(self, ctx: CheckoutContext) -> StartResult:
        name = f"{ctx.customer_first_name} {ctx.customer_last_name}".strip()
        address = {"contactName": name or "Bağışçı", "city": "Türkiye", "country": "Türkiye", "address": "Online bağış"}
        phone = "".join(ch for ch in ctx.customer_phone if ch.isdigit())
        if len(phone) == 10:
            phone = "90" + phone
        elif len(phone) == 11 and phone.startswith("0"):
            phone = "9" + phone
        payload = {
            "locale": "en" if ctx.locale == "en" else "tr",
            "conversationId": ctx.merchant_payment_id,
            "price": money(ctx.total_cents),
            "paidPrice": money(ctx.total_cents),
            "currency": ctx.currency,
            "basketId": ctx.merchant_payment_id,
            "paymentGroup": "PRODUCT",
            "callbackUrl": ctx.return_url,
            "enabledInstallments": [1],
            "buyer": {
                "id": ctx.customer_id,
                "name": ctx.customer_first_name or "Bağışçı",
                "surname": ctx.customer_last_name or "-",
                "identityNumber": PLACEHOLDER_IDENTITY,
                "email": ctx.customer_email,
                "gsmNumber": f"+{phone}" if phone else "",
                "registrationAddress": address["address"],
                "city": address["city"],
                "country": address["country"],
                "ip": ctx.customer_ip,
            },
            "billingAddress": address,
            "basketItems": [
                {"id": f"{line.product_code}-{index}"[:64], "name": line.name[:128], "category1": "Bağış",
                 "itemType": "VIRTUAL", "price": money(line.unit_cents * line.quantity)}
                for index, line in enumerate(ctx.lines)
            ],
        }
        data = await self._post("/payment/iyzipos/checkoutform/initialize/auth/ecom", payload)
        if data.get("status") != "success" or not data.get("token") or not data.get("paymentPageUrl"):
            raise PaymentProviderError(data.get("errorMessage") or "iyzico ödeme sayfası açılamadı")
        if data.get("signature") and not self._verify(data, data.get("conversationId"), data.get("token")):
            raise PaymentProviderError("iyzico yanıt imzası doğrulanamadı")
        return StartResult(
            session_token=data["token"], redirect_url=data["paymentPageUrl"],
            safe_response={"status": data.get("status"), "token_expire_seconds": data.get("tokenExpireTime")},
        )

    @classmethod
    def callback_reference(cls, data: dict[str, Any]):
        return None, data.get("token")

    def _result(self, data: dict, merchant_payment_id: Optional[str]) -> PaymentResult:
        approved = (
            data.get("status") == "success" and data.get("paymentStatus") == "SUCCESS"
            and str(data.get("fraudStatus")) == "1"
        )
        return PaymentResult(
            approved=approved,
            merchant_payment_id=data.get("basketId") or merchant_payment_id,
            session_token=data.get("token"),
            provider_transaction_id=str(data["paymentId"]) if data.get("paymentId") else None,
            amount_cents=to_cents(data.get("paidPrice")) if data.get("paidPrice") is not None else None,
            currency=data.get("currency"),
            card_last_4=data.get("lastFourDigits"),
            card_brand=data.get("cardAssociation"),
            code=data.get("errorCode") or data.get("paymentStatus"),
            message=data.get("errorMessage"),
            safe_response={k: data.get(k) for k in (
                "status", "paymentStatus", "fraudStatus", "paymentId", "paidPrice", "currency", "installment",
                "cardAssociation", "cardFamily", "lastFourDigits", "authCode", "hostReference", "errorCode",
                "errorMessage", "basketId",
            ) if data.get(k) is not None},
        )

    async def parse_callback(self, data: dict[str, Any], expected_session_token: Optional[str]) -> PaymentResult:
        token = data.get("token")
        if not token or (expected_session_token and token != expected_session_token):
            raise PaymentProviderError("Ödeme oturumu eşleşmiyor")
        # The browser callback carries only the token; the result comes from our own server-side call.
        detail = await self._post("/payment/iyzipos/checkoutform/auth/ecom/detail", {"locale": "tr", "token": token})
        if detail.get("status") == "success" and not self._verify(
            detail, detail.get("paymentStatus"), detail.get("paymentId"), detail.get("currency"), detail.get("basketId"),
            detail.get("conversationId"), strip_zeros(detail.get("paidPrice")), strip_zeros(detail.get("price")),
            detail.get("token"),
        ):
            raise PaymentProviderError("iyzico yanıt imzası doğrulanamadı")
        return self._result(detail, None)

    async def query(self, merchant_payment_id: str, total_cents: int, currency: str) -> Optional[PaymentResult]:
        detail = await self._post("/payment/detail", {"locale": "tr", "paymentConversationId": merchant_payment_id})
        if detail.get("status") != "success":
            return PaymentResult(approved=False, merchant_payment_id=merchant_payment_id)
        if not self._verify(
            detail, detail.get("paymentId"), detail.get("currency"), detail.get("basketId"), detail.get("conversationId"),
            strip_zeros(detail.get("paidPrice")), strip_zeros(detail.get("price")),
        ):
            raise PaymentProviderError("iyzico yanıt imzası doğrulanamadı")
        result = self._result(detail, merchant_payment_id)
        if result.amount_cents != total_cents or result.currency != currency:
            result.approved = False
        return result

    async def refund(self, *, merchant_payment_id, provider_transaction_id, amount_cents, currency, customer_ip="127.0.0.1"):
        if not provider_transaction_id:
            raise PaymentProviderError("iyzico ödeme numarası bulunamadı")
        data = await self._post("/v2/payment/refund", {
            "locale": "tr", "conversationId": merchant_payment_id, "paymentId": provider_transaction_id,
            "price": money(amount_cents), "currency": currency, "ip": customer_ip,
        })
        if data.get("status") != "success":
            return RefundResult(ok=False, message=data.get("errorMessage") or "iyzico iadeyi reddetti")
        return RefundResult(ok=True, provider_transaction_id=data.get("refundHostReference") or data.get("hostReference"))

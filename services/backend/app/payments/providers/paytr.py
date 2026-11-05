"""PayTR iFrame API.

Docs: dev.paytr.com — iframe-api (step 1 & 2), iade-api, durum-sorgu.
The payment result arrives only via the server-to-server notification URL,
which the merchant sets once in the PayTR panel:
    <API>/api/v1/payments/paytr/notify
"""
import base64
import hashlib
import hmac
import json
from typing import Any, Optional

import httpx

from app.payments import register
from app.payments.base import (
    CallbackReply, CheckoutContext, PaymentProvider, PaymentProviderError, PaymentResult, RefundResult, StartResult,
    consteq, money, to_cents,
)

TOKEN_URL = "https://www.paytr.com/odeme/api/get-token"
REFUND_URL = "https://www.paytr.com/odeme/iade"
STATUS_URL = "https://www.paytr.com/odeme/durum-sorgu"
IFRAME_URL = "https://www.paytr.com/odeme/guvenli/"
CURRENCY = {"TRY": "TL", "USD": "USD", "EUR": "EUR", "GBP": "GBP"}
ASCII = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")


@register
class PaytrProvider(PaymentProvider):
    key = "paytr"
    label = "PayTR"
    credential_fields = {"merchant_id": "Mağaza no", "merchant_key": "Mağaza parola (merchant key)",
                         "merchant_salt": "Mağaza gizli anahtar (merchant salt)"}
    secret_fields = {"merchant_key", "merchant_salt"}
    currencies = set(CURRENCY)
    frame_hosts = ("https://www.paytr.com",)
    uses_notification = True

    def _token(self, text: str) -> str:
        digest = hmac.new(self.credentials["merchant_key"].encode(), text.encode("utf-8"), hashlib.sha256).digest()
        return base64.b64encode(digest).decode()

    async def _post(self, url: str, data: dict) -> dict:
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                return (await client.post(url, data=data)).json()
        except (httpx.HTTPError, ValueError) as exc:
            raise PaymentProviderError("PayTR'ye ulaşılamadı") from exc

    async def start(self, ctx: CheckoutContext) -> StartResult:
        self.require_configured()
        c = self.credentials
        basket = base64.b64encode(json.dumps(
            [[line.name[:100], money(line.unit_cents), line.quantity] for line in ctx.lines], ensure_ascii=False,
        ).encode()).decode()
        fields = {
            "merchant_id": c["merchant_id"],
            "user_ip": ctx.customer_ip[:39],
            "merchant_oid": ctx.merchant_payment_id,
            "email": ctx.customer_email.translate(ASCII)[:100],
            "payment_amount": str(ctx.total_cents),
            "user_basket": basket,
            "no_installment": "1",
            "max_installment": "0",
            "currency": CURRENCY.get(ctx.currency, "TL"),
            "test_mode": "0" if self.live else "1",
        }
        fields["paytr_token"] = self._token(
            "".join(fields[k] for k in ("merchant_id", "user_ip", "merchant_oid", "email", "payment_amount",
                                        "user_basket", "no_installment", "max_installment", "currency", "test_mode"))
            + c["merchant_salt"]
        )
        fields.update({
            "user_name": f"{ctx.customer_first_name} {ctx.customer_last_name}".strip()[:60] or "Bagisci",
            "user_address": "Online bagis",
            "user_phone": ctx.customer_phone[:20],
            "merchant_ok_url": ctx.success_url,
            "merchant_fail_url": ctx.fail_url,
            "debug_on": "0",
            "timeout_limit": "30",
            "lang": "en" if ctx.locale == "en" else "tr",
        })
        data = await self._post(TOKEN_URL, fields)
        if data.get("status") != "success" or not data.get("token"):
            raise PaymentProviderError(data.get("reason") or "PayTR ödeme sayfası açılamadı")
        return StartResult(session_token=data["token"][:64], iframe_url=IFRAME_URL + data["token"],
                           safe_response={"status": "token"})

    @classmethod
    def callback_reference(cls, data: dict[str, Any]):
        return data.get("merchant_oid"), None

    async def parse_callback(self, data: dict[str, Any], expected_session_token: Optional[str]) -> PaymentResult:
        self.require_configured()
        expected = self._token(
            str(data.get("merchant_oid") or "") + self.credentials["merchant_salt"]
            + str(data.get("status") or "") + str(data.get("total_amount") or "")
        )
        if not consteq(str(data.get("hash") or ""), expected):
            raise PaymentProviderError("Geçersiz PayTR bildirimi")
        approved = data.get("status") == "success"
        return PaymentResult(
            approved=approved,
            merchant_payment_id=data.get("merchant_oid"),
            provider_transaction_id=data.get("merchant_oid") if approved else None,
            # payment_amount is the original amount; total_amount may include an installment surcharge.
            amount_cents=int(data["payment_amount"]) if str(data.get("payment_amount") or "").isdigit() else None,
            currency={v: k for k, v in CURRENCY.items()}.get(data.get("currency") or "TL", data.get("currency")),
            code=data.get("failed_reason_code") or data.get("status"),
            message=data.get("failed_reason_msg"),
            safe_response={k: data[k] for k in (
                "merchant_oid", "status", "total_amount", "payment_amount", "payment_type", "currency", "test_mode",
                "failed_reason_code", "failed_reason_msg",
            ) if k in data},
        )

    @classmethod
    def notification_reply(cls, ok: bool) -> CallbackReply:
        return CallbackReply(body="OK")

    async def query(self, merchant_payment_id: str, total_cents: int, currency: str) -> Optional[PaymentResult]:
        self.require_configured()
        c = self.credentials
        data = await self._post(STATUS_URL, {
            "merchant_id": c["merchant_id"], "merchant_oid": merchant_payment_id,
            "paytr_token": self._token(c["merchant_id"] + merchant_payment_id + c["merchant_salt"]),
        })
        if data.get("status") != "success":
            return PaymentResult(approved=False, merchant_payment_id=merchant_payment_id, message=data.get("err_msg"))
        amount = to_cents(data.get("payment_amount"))
        paid_currency = {v: k for k, v in CURRENCY.items()}.get(data.get("currency") or "TL", data.get("currency"))
        return PaymentResult(
            approved=amount == total_cents and paid_currency == currency,
            merchant_payment_id=merchant_payment_id, provider_transaction_id=merchant_payment_id,
            amount_cents=amount, currency=paid_currency,
            card_last_4=(data.get("masked_pan") or "")[-4:] or None, card_brand=data.get("kart_marka"),
            safe_response={k: data.get(k) for k in ("payment_amount", "payment_total", "currency", "odeme_tipi",
                                                    "kart_marka", "taksit", "test_mode") if data.get(k) is not None},
        )

    async def refund(self, *, merchant_payment_id, provider_transaction_id, amount_cents, currency, customer_ip="127.0.0.1"):
        self.require_configured()
        c = self.credentials
        amount = money(amount_cents)
        data = await self._post(REFUND_URL, {
            "merchant_id": c["merchant_id"], "merchant_oid": merchant_payment_id, "return_amount": amount,
            "paytr_token": self._token(c["merchant_id"] + merchant_payment_id + amount + c["merchant_salt"]),
        })
        if data.get("status") != "success":
            return RefundResult(ok=False, message=data.get("err_msg") or "PayTR iadeyi reddetti")
        return RefundResult(ok=True, provider_transaction_id=data.get("reference_no"))

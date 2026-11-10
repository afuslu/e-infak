"""Vakıf Katılım virtual POS, "Güvenli Ödeme Sayfası" (CommonPaymentPage).

Sources (bank PDFs, not public): "Güvenli Ödeme Sayfası Entegrasyon Dokümanı" v2.8 and
"Sanal POS Api Entegrasyon Dokümanı" (SelectOrderByMerchantOrderId §3.3.2, SaleReversal §3.1.5,
DrawBack §3.1.6, PartialDrawBack §3.1.7, variable types §4.1, hash §4.4).

Flow
1. `start()` returns a form auto-posted to the bank's page, where the donor enters the card (3D Secure).
2. The bank form-posts the browser back to OkUrl or FailUrl (they must differ, so we add ?r=ok|fail
   to our return URL). That POST is never trusted: `parse_callback()` asks the bank's
   SelectOrderByMerchantOrderId API and only the bank's answer decides the outcome.
3. `query()` uses the same lookup, so the pending-payment reconciler recovers lost returns.
4. `refund()` cancels (SaleReversal) before the bank's end of day, refunds (DrawBack / PartialDrawBack)
   after it.

Hashes (doc §4.4, C# reference): HashPassword = Base64(SHA1(api_password)); HashData =
Base64(SHA1(concat(...))), text encoded as ISO-8859-9. The payment page hashes MerchantId,
MerchantOrderId, Amount, OkUrl, FailUrl, UserName, HashPassword; the API samples leave
MerchantOrderId/Amount/URLs empty, i.e. MerchantId + UserName + HashPassword.

Known risk: the payment-page form carries UserName and HashPassword, so they reach the donor's
browser. Anyone who reads them can sign API calls (order lookups, cancels, refunds) — but only from an
IP address the bank has whitelisted. Mitigations: a dedicated e-infak API user created only for this
integration, the bank's API IP whitelist (our server only), and server-side verification of every result.

There is no test environment: payments are real, test with a real card and cancel it the same day.
API calls only work from the whitelisted server IP.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import re
import secrets
from typing import Any, Optional
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape

import httpx

from app.payments import register
from app.payments.base import (
    CheckoutContext, PaymentProvider, PaymentProviderError, PaymentResult, RefundResult, StartResult, to_cents,
)

HOST = "https://boa.vakifkatilim.com.tr"
PAYMENT_PAGE_URL = f"{HOST}/VirtualPOS.Gateway/CommonPaymentPage/CommonPaymentPage"
API_BASE = f"{HOST}/VirtualPOS.Gateway/Home"
CURRENCY_CODES = {"TRY": "0949"}
CODE_CURRENCIES = {v: k for k, v in CURRENCY_CODES.items()}
CALLBACK_FIELDS = ("ResponseCode", "ResponseMessage", "ProvisionNumber", "MerchantOrderId", "OrderId", "RRN", "Stan")
ORDER_FIELDS = (
    "OrderId", "MerchantOrderId", "OrderStatus", "TransactionStatus", "LastOrderStatus", "EndOfDayStatus", "FEC",
    "FirstAmount", "CancelAmount", "DrawbackAmount", "InstallmentCount", "ResponseCode", "ResponseExplain",
    "ProvNumber", "RRN", "Stan", "OrderDate", "CardType",
)
XML_DECLARATION = re.compile(r"^\s*<\?xml[^>]*\?>")
CALLBACK_RECHECK_SECONDS = 2.0


def sha1_b64(text: str) -> str:
    """Doc §4.4 ComputeHash: SHA1 over ISO-8859-9 bytes, Base64. Unmappable characters become '?' as in .NET."""
    return base64.b64encode(hashlib.sha1(text.encode("iso-8859-9", errors="replace")).digest()).decode()


def hash_string(merchant_id: str, merchant_order_id: str = "", amount: int = 0, ok_url: str = "", fail_url: str = "",
                username: str = "", hash_password: str = "") -> str:
    """Doc §4.4 CreateHashString (a zero amount is left out, like default(int) in C#)."""
    return f"{merchant_id}{merchant_order_id}{amount or ''}{ok_url}{fail_url}{username}{hash_password}"


def fix_text(text: Optional[str]) -> Optional[str]:
    """UTF-8 Turkish text that the bank's page decoded as Latin-1 (doc's RemoveDiacritics)."""
    if not text:
        return text
    try:
        return text.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text.replace("Ä\u009f", "ğ").replace("Ä±", "ı")


def decode_response(raw: bytes) -> str:
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        text = raw.decode("utf-16")
    elif len(raw) > 1 and raw[1:2] == b"\x00":
        text = raw.decode("utf-16-le")
    else:
        try:
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = raw.decode("iso-8859-9")
    # As in the doc's samples: drop NUL character references and the (often wrong) utf-16 declaration.
    return XML_DECLARATION.sub("", text.replace("&#x0;", ""), count=1).strip()


def parse_response(raw: bytes) -> tuple[dict[str, Optional[str]], list[dict[str, Optional[str]]]]:
    """(top-level fields, order contracts) of a VPosTransactionResponseContract."""
    try:
        root = ET.fromstring(decode_response(raw))
    except ET.ParseError as exc:
        raise PaymentProviderError("Bankanın cevabı okunamadı") from exc
    top = {child.tag: (child.text or "").strip() for child in root if len(child) == 0}
    orders = [
        {child.tag: (child.text or "").strip() for child in contract}
        for contract in root.findall("./VPosOrderData/OrderContract")
    ]
    return top, orders


def order_succeeded(order: dict[str, Optional[str]]) -> bool:
    """A sale the bank approved and that has not been cancelled or refunded since."""
    return (
        order.get("ResponseCode") == "00"
        and order.get("TransactionStatus") == "1"
        and order.get("OrderStatus") == "1"
        and not (to_cents(order.get("CancelAmount") or 0) or 0)
        and not (to_cents(order.get("DrawbackAmount") or 0) or 0)
    )


@register
class VakifKatilimProvider(PaymentProvider):
    key = "vakifkatilim"
    label = "Vakıf Katılım (Güvenli Ödeme Sayfası)"
    credential_fields = {
        "merchant_id": "Üye işyeri no (MerchantId)",
        "customer_id": "Müşteri no (CustomerId)",
        "username": "API kullanıcı adı",
        "api_password": "API kullanıcı şifresi",
    }
    secret_fields = {"api_password"}
    currencies = set(CURRENCY_CODES)
    form_hosts = (HOST,)

    @property
    def _c(self) -> dict[str, str]:
        return {k: str(self.credentials.get(k) or "").strip() for k in self.credential_fields}

    @property
    def hash_password(self) -> str:
        return sha1_b64(self._c["api_password"])

    def payment_hash(self, merchant_order_id: str, amount: int, ok_url: str, fail_url: str) -> str:
        c = self._c
        return sha1_b64(hash_string(c["merchant_id"], merchant_order_id, amount, ok_url, fail_url, c["username"],
                                    self.hash_password))

    def api_hash(self) -> str:
        c = self._c
        return sha1_b64(hash_string(c["merchant_id"], username=c["username"], hash_password=self.hash_password))

    async def start(self, ctx: CheckoutContext) -> StartResult:
        self.require_configured()
        if not self.live:
            raise PaymentProviderError(
                "Vakıf Katılım'ın test ortamı yok; kart ödemesi için ortamı 'Canlı' seçin (platformda canlı ödeme açık olmalı)"
            )
        if ctx.currency not in CURRENCY_CODES:
            raise PaymentProviderError(f"{ctx.currency} Vakıf Katılım ödeme sayfasında desteklenmiyor")
        c = self._c
        separator = "&" if "?" in ctx.return_url else "?"
        ok_url, fail_url = f"{ctx.return_url}{separator}r=ok", f"{ctx.return_url}{separator}r=fail"
        fields = {
            "UserName": c["username"],
            "HashPassword": self.hash_password,
            "MerchantId": c["merchant_id"],
            "MerchantOrderId": ctx.merchant_payment_id,
            "Amount": str(ctx.total_cents),
            "FECCurrencyCode": CURRENCY_CODES[ctx.currency],
            "OkUrl": ok_url,
            "FailUrl": fail_url,
            "PaymentType": "1",
            "TransactionSecurity": "3",
        }
        fields["HashData"] = self.payment_hash(ctx.merchant_payment_id, ctx.total_cents, ok_url, fail_url)
        # The session token is ours only: the bank's return carries MerchantOrderId, not this value.
        return StartResult(session_token=secrets.token_urlsafe(24), post_action=PAYMENT_PAGE_URL, post_fields=fields)

    # --- API -----------------------------------------------------------------

    def _message(self, body: list[tuple[str, Any]]) -> str:
        c = self._c
        items = [
            ("HashData", self.api_hash()), ("MerchantId", c["merchant_id"]), ("SubMerchantId", "0"),
            ("CustomerId", c["customer_id"]), ("UserName", c["username"]), ("HashPassword", self.hash_password),
            *body,
        ]
        inner = "".join(f"<{tag}>{escape(str(value))}</{tag}>" for tag, value in items)
        return ('<?xml version="1.0" encoding="utf-16"?>'
                '<VPosMessageContract xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
                f'xmlns:xsd="http://www.w3.org/2001/XMLSchema">{inner}</VPosMessageContract>')

    async def _post_xml(self, endpoint: str, message: str) -> bytes:
        # Like the doc's DataPost: a utf-16 declaration, sent as UTF-8 bytes.
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(f"{API_BASE}/{endpoint}", content=message.encode("utf-8"),
                                             headers={"Content-Type": "application/xml"})
        except httpx.HTTPError as exc:
            raise PaymentProviderError("Vakıf Katılım'a ulaşılamadı") from exc
        if response.status_code >= 400:
            raise PaymentProviderError(f"Vakıf Katılım isteği reddetti (HTTP {response.status_code}); sunucu IP izni?")
        return response.content

    async def _api(self, endpoint: str, body: list[tuple[str, Any]]):
        self.require_configured()
        return parse_response(await self._post_xml(endpoint, self._message(body)))

    async def lookup(self, merchant_order_id: str) -> tuple[dict, list[dict]]:
        top, orders = await self._api("SelectOrderByMerchantOrderId", [("MerchantOrderId", merchant_order_id)])
        return top, [o for o in orders if o.get("MerchantOrderId") == merchant_order_id]

    @staticmethod
    def _pick(orders: list[dict]) -> Optional[dict]:
        """The successful sale if any (the donor may have retried on the bank page), else the latest attempt."""
        if not orders:
            return None
        return next((o for o in orders if order_succeeded(o)), None) or max(
            orders, key=lambda o: (o.get("OrderDate") or "", o.get("OrderId") or ""))

    def _result(self, merchant_order_id: str, top: dict, order: Optional[dict],
                browser: Optional[dict] = None) -> PaymentResult:
        safe: dict[str, Any] = {}
        if browser:
            safe["browser"] = {k: browser[k] for k in CALLBACK_FIELDS if browser.get(k)}
        if order is None:
            return PaymentResult(
                approved=False, merchant_payment_id=merchant_order_id,
                code=(browser or {}).get("ResponseCode") or top.get("ResponseCode") or "NOTFOUND",
                message=fix_text((browser or {}).get("ResponseMessage")) or "Banka bu siparişi bulamadı",
                safe_response={**safe, "bank": {"ResponseCode": top.get("ResponseCode")}},
            )
        approved = top.get("ResponseCode") == "00" and order_succeeded(order)
        card = order.get("CardNumber") or ""
        fec = (order.get("FEC") or "").zfill(4)
        return PaymentResult(
            approved=approved,
            merchant_payment_id=order.get("MerchantOrderId"),
            provider_transaction_id=order.get("OrderId") or None,
            amount_cents=to_cents(order.get("FirstAmount")) if order.get("FirstAmount") else None,
            currency=CODE_CURRENCIES.get(fec, fec or None),
            card_last_4=card[-4:] if card else None,
            card_brand=order.get("CardType") or None,
            code=order.get("ResponseCode") or None,
            message=order.get("ResponseExplain") or None,
            safe_response={**safe, "bank": {k: order[k] for k in ORDER_FIELDS if order.get(k)}},
        )

    # --- interface -----------------------------------------------------------

    @classmethod
    def callback_reference(cls, data: dict[str, Any]):
        return data.get("MerchantOrderId"), None

    async def parse_callback(self, data: dict[str, Any], expected_session_token: Optional[str]) -> PaymentResult:
        merchant_order_id = str(data.get("MerchantOrderId") or "").strip()
        if not merchant_order_id:
            raise PaymentProviderError("Sipariş numarası eksik")
        top, orders = await self.lookup(merchant_order_id)
        claims_success = str(data.get("ResponseCode") or "") == "00"
        if not orders and claims_success:
            # The return can arrive a moment before the order is queryable; ask once more.
            await asyncio.sleep(CALLBACK_RECHECK_SECONDS)
            top, orders = await self.lookup(merchant_order_id)
        order = self._pick(orders)
        if order is None and claims_success:
            # A success the bank does not know: leave the order pending for the reconciler.
            raise PaymentProviderError("Ödeme bankada doğrulanamadı")
        return self._result(merchant_order_id, top, order, browser=data)

    async def query(self, merchant_payment_id: str, total_cents: int, currency: str) -> Optional[PaymentResult]:
        top, orders = await self.lookup(merchant_payment_id)
        result = self._result(merchant_payment_id, top, self._pick(orders))
        result.approved = result.approved and result.amount_cents == total_cents and result.currency == currency
        return result

    async def refund(self, *, merchant_payment_id, provider_transaction_id, amount_cents, currency, customer_ip="127.0.0.1"):
        top, orders = await self.lookup(merchant_payment_id)
        order = next((o for o in orders if provider_transaction_id and o.get("OrderId") == str(provider_transaction_id)),
                     None) or next((o for o in orders if order_succeeded(o)), None)
        if order is None or not order.get("OrderId"):
            return RefundResult(ok=False, message="Bankada iade edilecek başarılı satış bulunamadı")
        first = to_cents(order.get("FirstAmount")) or 0
        already = (to_cents(order.get("CancelAmount") or 0) or 0) + (to_cents(order.get("DrawbackAmount") or 0) or 0)
        if amount_cents <= 0 or amount_cents > first - already:
            return RefundResult(ok=False, message="İade tutarı bankadaki kalan tutardan fazla")
        end_of_day = order.get("EndOfDayStatus")
        ids = [("OrderId", order["OrderId"]), ("MerchantOrderId", merchant_payment_id)]
        if end_of_day == "1":  # open batch: only a full cancel is possible
            if amount_cents != first or already:
                return RefundResult(ok=False, message=(
                    "Gün sonu alınmadan yalnızca tutarın tamamı iptal edilebilir; kısmi iade için gün sonunu bekleyin"))
            endpoint = "SaleReversal"
            body = [("MerchantOrderId", merchant_payment_id), ("Amount", first), ("OrderId", order["OrderId"]),
                    ("PaymentType", 1)]
        elif end_of_day == "2":  # closed batch: refund
            if amount_cents == first and not already:
                endpoint, body = "DrawBack", ids
            else:
                endpoint, body = "PartialDrawBack", [*ids, ("Amount", amount_cents), ("DisplayAmount", amount_cents)]
        else:
            return RefundResult(ok=False, message="Bankadaki gün sonu durumu okunamadı; iadeyi banka panelinden yapın")
        result_top, _ = await self._api(endpoint, body)
        if result_top.get("ResponseCode") != "00":
            return RefundResult(ok=False, message=fix_text(result_top.get("ResponseMessage"))
                                or f"Vakıf Katılım iadeyi reddetti ({result_top.get('ResponseCode') or '?'})")
        bank_id = result_top.get("OrderId")
        return RefundResult(ok=True, provider_transaction_id=bank_id if bank_id and bank_id != "0" else order["OrderId"])

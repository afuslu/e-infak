"""Bank virtual POS on the Asseco/EST "NestPay" platform, 3D Pay Hosting model.

The donor enters the card on the bank's page (storetype 3d_pay_hosting). Gateway
URLs, form fields and the ver3 hash follow the open-source mewebstudio/pos
implementation; each bank should be verified with its test account before going live.
"""
import base64
import hashlib
import secrets
from typing import Any, Optional
from xml.etree import ElementTree as ET

import httpx

from app.payments import register
from app.payments.base import (
    ISO_NUMERIC, CheckoutContext, PaymentProvider, PaymentProviderError, PaymentResult, RefundResult, StartResult,
    consteq, money, to_cents,
)

TEST_HOST = "https://entegrasyon.asseco-see.com.tr"
BANKS = {
    "akbank": ("Akbank", "https://www.sanalakpos.com"),
    "isbank": ("İş Bankası", "https://sanalpos.isbank.com.tr"),
    "halkbank": ("Halkbank", "https://sanalpos.halkbank.com.tr"),
    "teb": ("TEB", "https://sanalpos.teb.com.tr"),
    "sekerbank": ("Şekerbank", "https://sanalpos.sekerbank.com.tr"),
    "ziraat": ("Ziraat Bankası", "https://sanalpos2.ziraatbank.com.tr"),
    "finansbank": ("QNB Finansbank", "https://www.fbwebpos.com"),
}
EXCLUDED_FROM_HASH = {"hash", "encoding", "nationalidno"}


def ver3_hash(fields: dict[str, Any], store_key: str) -> str:
    items = sorted(((k, v) for k, v in fields.items() if k.lower() not in EXCLUDED_FROM_HASH), key=lambda kv: kv[0].lower())
    values = [str(v) for _, v in items] + [store_key]
    values = [v.replace("\\", "\\\\").replace("|", "\\|") for v in values]
    return base64.b64encode(hashlib.sha512("|".join(values).encode("utf-8")).digest()).decode()


@register
class NestPayProvider(PaymentProvider):
    key = "nestpay"
    label = "Banka sanal POS (NestPay)"
    credential_fields = {
        "bank": "Banka",
        "client_id": "Üye işyeri no (client id)",
        "store_key": "3D güvenlik anahtarı (store key)",
        "api_user": "API kullanıcısı (iade / sorgu)",
        "api_password": "API şifresi",
    }
    secret_fields = {"store_key", "api_password"}
    optional_fields = {"api_user", "api_password"}
    field_choices = {"bank": {key: label for key, (label, _) in BANKS.items()}}
    currencies = {"TRY", "USD", "EUR", "GBP"}

    @property
    def host(self) -> str:
        if not self.live:
            return TEST_HOST
        bank = BANKS.get(str(self.credentials.get("bank") or "").lower())
        if not bank:
            raise PaymentProviderError("Sanal POS bankası seçilmedi")
        return bank[1]

    @property
    def form_hosts(self) -> tuple[str, ...]:  # type: ignore[override]
        try:
            return (self.host,)
        except PaymentProviderError:
            return ()

    async def start(self, ctx: CheckoutContext) -> StartResult:
        self.require_configured()
        if ctx.currency not in ISO_NUMERIC:
            raise PaymentProviderError(f"{ctx.currency} sanal POS'ta desteklenmiyor")
        fields = {
            "hashAlgorithm": "ver3",
            "clientid": self.credentials["client_id"],
            "storetype": "3d_pay_hosting",
            "amount": money(ctx.total_cents),
            "oid": ctx.merchant_payment_id,
            "okUrl": ctx.return_url,
            "failUrl": ctx.return_url,
            "rnd": secrets.token_hex(12).upper(),
            "lang": "en" if ctx.locale == "en" else "tr",
            "currency": ISO_NUMERIC[ctx.currency],
            "taksit": "",
            "TranType": "Auth",
        }
        fields["hash"] = ver3_hash(fields, self.credentials["store_key"])
        return StartResult(session_token=secrets.token_urlsafe(24), post_action=f"{self.host}/fim/est3Dgate",
                           post_fields=fields)

    @classmethod
    def callback_reference(cls, data: dict[str, Any]):
        return data.get("oid") or data.get("ReturnOid"), None

    async def parse_callback(self, data: dict[str, Any], expected_session_token: Optional[str]) -> PaymentResult:
        self.require_configured()
        received = str(data.get("HASH") or data.get("hash") or "")
        if not consteq(received, ver3_hash(data, self.credentials["store_key"])):
            raise PaymentProviderError("Geçersiz banka imzası")
        approved = data.get("ProcReturnCode") == "00" and str(data.get("mdStatus")) == "1"
        masked = str(data.get("maskedCreditCard") or "")
        return PaymentResult(
            approved=approved,
            merchant_payment_id=data.get("oid"),
            provider_transaction_id=data.get("TransId") if approved else None,
            amount_cents=to_cents(data.get("amount")) if data.get("amount") else None,
            currency={v: k for k, v in ISO_NUMERIC.items()}.get(str(data.get("currency") or "")),
            card_last_4=masked[-4:] if masked else None,
            code=data.get("ProcReturnCode") or data.get("mdStatus"),
            message=data.get("ErrMsg") or data.get("mdErrorMsg"),
            safe_response={k: data[k] for k in (
                "oid", "ProcReturnCode", "mdStatus", "ErrMsg", "mdErrorMsg", "AuthCode", "TransId", "HostRefNum",
                "maskedCreditCard", "amount", "currency", "EXTRA.TRXDATE", "EXTRA_TRXDATE",
            ) if k in data},
        )

    async def _api(self, body: dict[str, Any]) -> ET.Element:
        if not (self.credentials.get("api_user") and self.credentials.get("api_password")):
            raise PaymentProviderError("Sanal POS API kullanıcısı girilmedi (iade ve sorgu için gerekli)")
        root = ET.Element("CC5Request")
        for key, value in {"Name": self.credentials["api_user"], "Password": self.credentials["api_password"],
                           "ClientId": self.credentials["client_id"], **body}.items():
            node = ET.SubElement(root, key)
            if isinstance(value, dict):
                for sub_key, sub_value in value.items():
                    ET.SubElement(node, sub_key).text = str(sub_value)
            else:
                node.text = str(value)
        payload = b'<?xml version="1.0" encoding="UTF-8"?>' + ET.tostring(root, encoding="utf-8")
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(f"{self.host}/fim/api", content=payload,
                                             headers={"Content-Type": "application/xml; charset=utf-8"})
            return ET.fromstring(response.content)
        except (httpx.HTTPError, ET.ParseError) as exc:
            raise PaymentProviderError("Bankaya ulaşılamadı") from exc

    async def query(self, merchant_payment_id: str, total_cents: int, currency: str) -> Optional[PaymentResult]:
        root = await self._api({"OrderId": merchant_payment_id, "Extra": {"ORDERSTATUS": "QUERY"}})
        extra = root.find("Extra")
        get = (lambda tag: (extra.findtext(tag) if extra is not None else None))
        captured = to_cents(get("CAPTURE_AMT")) if get("CAPTURE_AMT") else None
        # The capture amount may be reported in minor units; accept either form.
        raw = get("CAPTURE_AMT") or ""
        matches = captured == total_cents or (raw.isdigit() and int(raw) == total_cents)
        approved = root.findtext("ProcReturnCode") == "00" and get("ORIG_TRANS_AMT") == raw and matches
        pan = get("PAN") or ""
        return PaymentResult(
            approved=approved, merchant_payment_id=merchant_payment_id,
            provider_transaction_id=root.findtext("TransId"), amount_cents=total_cents if approved else None,
            currency=currency, card_last_4=pan[-4:] or None, code=root.findtext("ProcReturnCode"),
            message=root.findtext("ErrMsg"), safe_response={"TRANS_STAT": get("TRANS_STAT"), "AUTH_CODE": get("AUTH_CODE")},
        )

    async def refund(self, *, merchant_payment_id, provider_transaction_id, amount_cents, currency, customer_ip="127.0.0.1"):
        root = await self._api({"Type": "Credit", "OrderId": merchant_payment_id, "Total": money(amount_cents),
                                "Currency": ISO_NUMERIC.get(currency, "949")})
        if root.findtext("ProcReturnCode") != "00":
            return RefundResult(ok=False, message=root.findtext("ErrMsg") or "Banka iadeyi reddetti")
        return RefundResult(ok=True, provider_transaction_id=root.findtext("TransId"))

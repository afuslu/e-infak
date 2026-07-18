import hashlib
import hmac
import json
from typing import Any

import httpx

from app.core.config import settings


SAFE_CALLBACK_FIELDS = {
    "merchantPaymentId",
    "customerId",
    "sessionToken",
    "responseCode",
    "responseMsg",
    "random",
    "sdSha512",
    "pgTranId",
    "pgTranRefId",
    "pgOrderId",
    "transactionStatus",
    "amount",
    "currency",
    "paymentSystem",
    "paymentSystemType",
    "panLast4",
}


class ZiraatPayError(RuntimeError):
    pass


class ZiraatPayClient:
    def __init__(self, tenant_slug: str | None = None) -> None:
        self.api_url = settings.ZIRAATPAY_API_URL.rstrip("/")
        self.hpp_url = settings.ZIRAATPAY_HPP_URL.rstrip("/")
        credentials = {}
        if settings.ZIRAATPAY_TENANT_CREDENTIALS and tenant_slug:
            try:
                credentials = json.loads(settings.ZIRAATPAY_TENANT_CREDENTIALS).get(tenant_slug, {})
            except (TypeError, ValueError):
                credentials = {}
        self.merchant = credentials.get("merchant") or settings.ZIRAATPAY_MERCHANT
        self.merchant_user = credentials.get("merchant_user") or settings.ZIRAATPAY_MERCHANT_USER
        self.merchant_password = credentials.get("merchant_password") or settings.ZIRAATPAY_MERCHANT_PASSWORD
        self.secret_key = credentials.get("secret_key") or settings.ZIRAATPAY_SECRET_KEY

    @property
    def configured(self) -> bool:
        return bool(
            self.merchant and self.merchant_user and self.merchant_password and self.secret_key
        )

    def _auth(self) -> dict[str, str]:
        if not self.configured:
            raise ZiraatPayError("Ziraat Pay üye işyeri bilgileri henüz yapılandırılmadı")
        return {
            "MERCHANT": self.merchant,
            "MERCHANTUSER": self.merchant_user,
            "MERCHANTPASSWORD": self.merchant_password,
        }

    async def create_payment_session(
        self,
        *,
        merchant_payment_id: str,
        amount: str,
        currency: str,
        customer_id: str,
        customer_name: str,
        customer_email: str,
        customer_phone: str,
        customer_ip: str,
        user_agent: str,
        return_url: str,
        order_items: str,
    ) -> dict[str, Any]:
        payload = {
            **self._auth(),
            "ACTION": "SESSIONTOKEN",
            "SESSIONTYPE": "PAYMENTSESSION",
            "MERCHANTPAYMENTID": merchant_payment_id,
            "AMOUNT": amount,
            "CURRENCY": currency,
            "RETURNURL": return_url,
            "CUSTOMER": customer_id,
            "CUSTOMERNAME": customer_name,
            "CUSTOMEREMAIL": customer_email,
            "CUSTOMERPHONE": customer_phone,
            "CUSTOMERIP": customer_ip,
            "CUSTOMERUSERAGENT": user_agent[:512],
            "ORDERITEMS": order_items,
            "SESSIONEXPIRY": "30m",
        }
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(self.api_url, data=payload)
            response.raise_for_status()
            data = response.json()
        if data.get("responseCode") != "00" or not data.get("sessionToken"):
            raise ZiraatPayError(data.get("responseMsg") or data.get("errorMsg") or "Ödeme oturumu açılamadı")
        return data

    def payment_url(self, session_token: str) -> str:
        return f"{self.hpp_url}/{session_token}"

    def verify_callback(self, data: dict[str, Any]) -> bool:
        received = str(data.get("sdSha512") or "")
        random_key = str(data.get("random") or "")
        raw = "|".join(
            [
                str(data.get("merchantPaymentId") or ""),
                str(data.get("customerId") or ""),
                str(data.get("sessionToken") or ""),
                str(data.get("responseCode") or ""),
                random_key,
                self.secret_key,
            ]
        )
        expected = hashlib.sha512(raw.encode("utf-8")).hexdigest()
        return bool(received) and hmac.compare_digest(received.lower(), expected.lower())

    def safe_callback(self, data: dict[str, Any]) -> dict[str, Any]:
        return {key: data[key] for key in SAFE_CALLBACK_FIELDS if key in data}

    async def query_transaction(self, merchant_payment_id: str) -> dict[str, Any]:
        payload = {
            **self._auth(),
            "ACTION": "QUERYTRANSACTION",
            "MERCHANTPAYMENTID": merchant_payment_id,
        }
        async with httpx.AsyncClient(timeout=95) as client:
            response = await client.post(self.api_url, data=payload)
            response.raise_for_status()
            return response.json()

    async def refund(self, pg_tran_id: str, amount: str, currency: str = "TRY") -> dict[str, Any]:
        payload = {
            **self._auth(),
            "ACTION": "REFUND",
            "PGTRANID": pg_tran_id,
            "AMOUNT": amount,
            "CURRENCY": currency,
            "REFLECTCOMMISSION": "NO",
        }
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(self.api_url, data=payload)
            response.raise_for_status()
            return response.json()

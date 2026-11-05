"""Ziraat Pay (API v2, hosted payment page)."""
from typing import Any, Optional

from app.core.config import settings
from app.payments.base import (
    CheckoutContext, PaymentProvider, PaymentProviderError, PaymentResult, RefundResult, StartResult, money, to_cents,
)
from app.utils.ziraatpay import ZiraatPayClient, ZiraatPayError


class ZiraatPayProvider(PaymentProvider):
    key = "ziraatpay"
    label = "Ziraat Pay"
    credential_fields = {
        "merchant": "Üye işyeri no", "merchant_user": "API kullanıcısı",
        "merchant_password": "API şifresi", "secret_key": "Gizli anahtar (secret key)",
    }
    secret_fields = {"merchant_password", "secret_key"}
    currencies = {"TRY", "USD", "EUR"}

    def __init__(self, credentials: dict, live: bool, tenant_slug: Optional[str] = None) -> None:
        super().__init__(credentials, live)
        # Legacy env credentials (ZIRAATPAY_TENANT_CREDENTIALS) remain a fallback.
        self.client = ZiraatPayClient(tenant_slug, credentials=credentials or None)

    @property
    def configured(self) -> bool:
        return self.client.configured

    async def start(self, ctx: CheckoutContext) -> StartResult:
        import json

        items = json.dumps([
            {"productCode": line.product_code, "name": line.name[:128], "quantity": line.quantity,
             "amount": money(line.unit_cents)}
            for line in ctx.lines
        ], ensure_ascii=False)
        try:
            session = await self.client.create_payment_session(
                merchant_payment_id=ctx.merchant_payment_id, amount=money(ctx.total_cents), currency=ctx.currency,
                customer_id=ctx.customer_id, customer_name=f"{ctx.customer_first_name} {ctx.customer_last_name}".strip(),
                customer_email=ctx.customer_email, customer_phone=ctx.customer_phone, customer_ip=ctx.customer_ip,
                user_agent=ctx.user_agent, return_url=ctx.return_url, order_items=items,
            )
        except ZiraatPayError as exc:
            raise PaymentProviderError(str(exc)) from exc
        token = session["sessionToken"]
        return StartResult(
            session_token=token, redirect_url=self.client.payment_url(token), expires_at=session.get("expiryDate"),
            safe_response={"responseCode": session.get("responseCode"), "responseMsg": session.get("responseMsg")},
        )

    @classmethod
    def callback_reference(cls, data: dict[str, Any]):
        return data.get("merchantPaymentId"), data.get("sessionToken")

    async def parse_callback(self, data: dict[str, Any], expected_session_token: Optional[str]) -> PaymentResult:
        if not self.client.verify_callback(data):
            raise PaymentProviderError("Geçersiz ödeme imzası")
        if expected_session_token and data.get("sessionToken") != expected_session_token:
            raise PaymentProviderError("Ödeme oturumu eşleşmiyor")
        return PaymentResult(
            approved=data.get("responseCode") == "00",
            merchant_payment_id=data.get("merchantPaymentId"),
            session_token=data.get("sessionToken"),
            provider_transaction_id=data.get("pgTranId"),
            amount_cents=to_cents(data.get("amount")) if data.get("amount") else None,
            currency=data.get("currency"),
            card_last_4=data.get("panLast4"),
            card_brand=data.get("paymentSystemType"),
            code=data.get("responseCode"),
            message=data.get("responseMsg"),
            safe_response=self.client.safe_callback(data),
        )

    async def query(self, merchant_payment_id: str, total_cents: int, currency: str) -> Optional[PaymentResult]:
        try:
            response = await self.client.query_transaction(merchant_payment_id)
        except ZiraatPayError as exc:
            raise PaymentProviderError(str(exc)) from exc
        approved = next(
            (tx for tx in response.get("transactionList") or []
             if tx.get("transactionStatus") == "AP" and to_cents(tx.get("amount")) == total_cents
             and tx.get("currency") == currency),
            None,
        )
        if not approved:
            return PaymentResult(approved=False, merchant_payment_id=merchant_payment_id)
        return PaymentResult(
            approved=True, merchant_payment_id=merchant_payment_id, provider_transaction_id=approved.get("pgTranId"),
            amount_cents=total_cents, currency=currency, card_last_4=approved.get("panLast4"),
            card_brand=approved.get("paymentSystemType"), code=approved.get("pgTranReturnCode"),
            safe_response=self.client.safe_callback(approved),
        )

    async def refund(self, *, merchant_payment_id, provider_transaction_id, amount_cents, currency, customer_ip="127.0.0.1"):
        if not provider_transaction_id:
            raise PaymentProviderError("Banka işlem numarası bulunamadı")
        response = await self.client.refund(provider_transaction_id, money(amount_cents), currency)
        if response.get("responseCode") != "00":
            return RefundResult(ok=False, message=response.get("responseMsg") or "Banka iadeyi reddetti")
        return RefundResult(ok=True, provider_transaction_id=response.get("pgTranId"))

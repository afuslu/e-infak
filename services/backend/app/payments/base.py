"""Payment provider interface.

Every provider is a hosted / 3D flow: the donor enters card details on the
bank's or payment institution's page, never on ours. A provider:

1. `start()` opens a payment for an order and returns either a URL to redirect
   to or a form that must be auto-submitted to the provider;
2. `parse_callback()` verifies what the provider sends back (browser return or
   server-to-server notification) and reports the outcome;
3. `query()` asks the provider for an order's state (recovers lost callbacks);
4. `refund()` returns money for a captured payment.
"""
from __future__ import annotations

import hashlib
import hmac
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Optional


class PaymentProviderError(RuntimeError):
    """Provider refused or could not be reached; the message is safe to show staff."""


@dataclass
class CheckoutLine:
    name: str
    quantity: int
    unit_cents: int
    product_code: str


@dataclass
class CheckoutContext:
    merchant_payment_id: str
    total_cents: int
    currency: str
    locale: str
    lines: list[CheckoutLine]
    customer_id: str
    customer_first_name: str
    customer_last_name: str
    customer_email: str
    customer_phone: str
    customer_ip: str
    user_agent: str
    return_url: str  # provider → browser return (POST or GET) handled by our API
    notify_url: str  # server-to-server notification URL (providers that use one)
    success_url: str  # website page shown after a successful payment
    fail_url: str  # website page shown after a failed payment


@dataclass
class StartResult:
    session_token: str  # our handle for this attempt (provider token or our own random value)
    redirect_url: Optional[str] = None
    post_action: Optional[str] = None  # auto-submitted form target
    post_fields: dict[str, str] = field(default_factory=dict)
    iframe_url: Optional[str] = None  # provider page shown inside our launch page
    expires_at: Optional[str] = None
    safe_response: dict[str, Any] = field(default_factory=dict)


@dataclass
class PaymentResult:
    approved: bool
    merchant_payment_id: Optional[str]
    session_token: Optional[str] = None
    provider_transaction_id: Optional[str] = None
    amount_cents: Optional[int] = None
    currency: Optional[str] = None
    card_last_4: Optional[str] = None
    card_brand: Optional[str] = None
    code: Optional[str] = None
    message: Optional[str] = None
    safe_response: dict[str, Any] = field(default_factory=dict)


@dataclass
class RefundResult:
    ok: bool
    provider_transaction_id: Optional[str] = None
    message: Optional[str] = None


@dataclass
class CallbackReply:
    """What to answer a server-to-server notification with (e.g. PayTR expects plain 'OK')."""
    body: str = "OK"
    media_type: str = "text/plain"


ISO_NUMERIC = {"TRY": "949", "USD": "840", "EUR": "978", "GBP": "826"}


def money(cents: int, places: int = 2) -> str:
    return f"{Decimal(cents) / 100:.{places}f}"


def to_cents(value: Any) -> Optional[int]:
    try:
        return int((Decimal(str(value).replace(",", ".")) * 100).quantize(Decimal(1)))
    except Exception:
        return None


def consteq(a: str, b: str) -> bool:
    return bool(a) and bool(b) and hmac.compare_digest(a.encode(), b.encode())


def sha512_hex(text: str) -> str:
    return hashlib.sha512(text.encode("utf-8")).hexdigest()


class PaymentProvider(ABC):
    key: str = ""
    label: str = ""
    # Credential form: field -> label; secret fields are never shown back to the panel.
    credential_fields: dict[str, str] = {}
    secret_fields: set[str] = set()
    optional_fields: set[str] = set()
    field_choices: dict[str, dict[str, str]] = {}  # field -> {value: label} (rendered as a select)
    currencies: set[str] = {"TRY"}
    # Hosts a payment form may be posted to (Content-Security-Policy form-action).
    form_hosts: tuple[str, ...] = ()
    frame_hosts: tuple[str, ...] = ()  # hosts our launch page may embed (Content-Security-Policy frame-src)
    uses_notification: bool = False

    def __init__(self, credentials: dict, live: bool) -> None:
        self.credentials = credentials or {}
        self.live = live

    @property
    def configured(self) -> bool:
        required = set(self.credential_fields) - self.optional_fields
        return all(self.credentials.get(f) for f in required)

    def require_configured(self) -> None:
        if not self.configured:
            raise PaymentProviderError(f"{self.label} hesap bilgileri henüz girilmedi")

    @abstractmethod
    async def start(self, ctx: CheckoutContext) -> StartResult: ...

    @classmethod
    @abstractmethod
    def callback_reference(cls, data: dict[str, Any]) -> tuple[Optional[str], Optional[str]]:
        """(merchant_payment_id, session_token) found in a callback, to locate the order."""

    @abstractmethod
    async def parse_callback(self, data: dict[str, Any], expected_session_token: Optional[str]) -> PaymentResult: ...

    async def query(self, merchant_payment_id: str, total_cents: int, currency: str) -> Optional[PaymentResult]:
        """Provider-side state of an order; None when the provider has no inquiry API."""
        return None

    @abstractmethod
    async def refund(self, *, merchant_payment_id: str, provider_transaction_id: Optional[str],
                     amount_cents: int, currency: str, customer_ip: str = "127.0.0.1") -> RefundResult: ...

    @classmethod
    def notification_reply(cls, ok: bool) -> CallbackReply:
        return CallbackReply()

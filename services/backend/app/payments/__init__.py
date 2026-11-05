"""Payment providers available to organisations.

An organisation picks one provider for card payments (Organization.settings
["payment_provider"], default Ziraat Pay) and stores its credentials encrypted
(see app/services/tenant_credentials.py). Test vs live endpoints: live only when
the platform allows live payments AND the organisation marked its account live.
"""
from typing import Optional

from app.core.config import settings
from app.payments.base import PaymentProvider, PaymentProviderError
from app.payments.ziraatpay import ZiraatPayProvider

PROVIDERS: dict[str, type[PaymentProvider]] = {
    ZiraatPayProvider.key: ZiraatPayProvider,
}

DEFAULT_PROVIDER = ZiraatPayProvider.key


def register(cls: type[PaymentProvider]) -> type[PaymentProvider]:
    PROVIDERS[cls.key] = cls
    return cls


def provider_key_for(organization) -> str:
    key = (getattr(organization, "settings", None) or {}).get("payment_provider") or DEFAULT_PROVIDER
    return key if key in PROVIDERS else DEFAULT_PROVIDER


def build_provider(key: str, credentials: Optional[dict], tenant_slug: Optional[str] = None) -> PaymentProvider:
    cls = PROVIDERS.get(key)
    if not cls:
        raise PaymentProviderError(f"Bilinmeyen ödeme sağlayıcısı: {key}")
    credentials = credentials or {}
    live = bool(settings.PAYMENTS_LIVE_ENABLED) and credentials.get("mode") == "live"
    if cls is ZiraatPayProvider:
        return ZiraatPayProvider(credentials, live, tenant_slug=tenant_slug)
    return cls(credentials, live)


async def provider_for(db, organization, key: Optional[str] = None) -> PaymentProvider:
    from app.services.tenant_credentials import get_credentials

    key = key or provider_key_for(organization)
    credentials = await get_credentials(db, organization.id, key)
    return build_provider(key, credentials, tenant_slug=organization.slug)


# Additional drivers register themselves on import.
from app.payments import providers  # noqa: E402,F401

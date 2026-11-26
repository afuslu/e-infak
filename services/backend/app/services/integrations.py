"""Per-organisation integrations that are not payment, SMS or bank providers.

WhatsApp Business (Meta Cloud API), NetGSM Netsantral (call center) and operator SMS donations
keep their account details in the encrypted tenant credential store like the other providers.

Incoming webhooks reach the platform host, not the organisation's site, so their URL carries
`<organisation id>.<secret>`: the id finds the organisation, the secret (stored with the other
credentials, compared in constant time) proves the caller got the URL from the organisation.
"""
from __future__ import annotations

import hmac
import re
import secrets
from typing import Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

HOOK_SECRET = "hook_secret"

INTEGRATIONS: dict[str, dict] = {
    "whatsapp": {
        "label": "WhatsApp Business (Meta Cloud API)",
        "fields": {
            "phone_number_id": "Telefon numarası kimliği (Phone number ID)",
            "access_token": "Kalıcı erişim anahtarı (System user access token)",
            "business_account_id": "WhatsApp Business hesap kimliği (WABA ID)",
            "default_language": "Şablon dili (ör. tr)",
            "app_secret": "Uygulama gizli anahtarı (App secret, webhook imzası için)",
            HOOK_SECRET: "Webhook doğrulama anahtarı",
        },
        "secret_fields": {"access_token", "app_secret"},
        "optional_fields": {"business_account_id", "default_language", "app_secret", HOOK_SECRET},
    },
    "netsantral": {
        "label": "NetGSM Netsantral (Bulut Santral)",
        "fields": {
            "pbx_number": "Santral numarası (850…, başında 0 olmadan)",
            "username": "API kullanıcı adı (santral / abone numarası)",
            "password": "API yetkili alt kullanıcı şifresi",
            "trunk": "Arayan numara (trunk; boşsa santral numarası)",
            HOOK_SECRET: "Webhook anahtarı",
        },
        "secret_fields": {"password"},
        "optional_fields": {"trunk", HOOK_SECRET},
    },
    "sms_donation": {
        "label": "Operatör SMS Bağışları",
        "fields": {HOOK_SECRET: "Webhook anahtarı"},
        "secret_fields": set(),
        "optional_fields": {HOOK_SECRET},
    },
}


def integration_spec(key: str) -> Optional[dict]:
    spec = INTEGRATIONS.get(key)
    if not spec:
        return None
    return {"label": spec["label"], "fields": dict(spec["fields"]), "secret_fields": set(spec["secret_fields"]),
            "optional_fields": set(spec["optional_fields"])}


def new_hook_secret() -> str:
    return secrets.token_urlsafe(24)


def hook_token(organization_id: UUID, secret: str) -> str:
    return f"{organization_id}.{secret}"


def hook_url(kind: str, organization_id: UUID, secret: Optional[str]) -> Optional[str]:
    if not secret:
        return None
    base = (settings.PAYMENT_CALLBACK_BASE_URL or "").rstrip("/") or "https://e-infak.org"
    return f"{base}/api/v1/hooks/{kind}/{hook_token(organization_id, secret)}"


async def resolve_hook(db: AsyncSession, provider: str, token: str) -> Optional[tuple[UUID, dict]]:
    """(organisation id, credentials) for a webhook token, or None when it does not check out."""
    from app.services.tenant_credentials import CredentialsUnavailable, get_credentials

    org_part, _, secret = (token or "").partition(".")
    try:
        org_id = UUID(org_part)
    except ValueError:
        return None
    try:
        creds = await get_credentials(db, org_id, provider)
    except CredentialsUnavailable:
        return None
    stored = (creds or {}).get(HOOK_SECRET) or ""
    if not stored or not secret or not hmac.compare_digest(stored.encode(), secret.encode()):
        return None
    return org_id, creds


async def ensure_hook_secret(db: AsyncSession, organization_id: UUID, provider: str, actor: str) -> dict:
    """Credentials of the integration, with a webhook secret created on first use."""
    from app.services.tenant_credentials import get_credentials, save_credentials

    creds = await get_credentials(db, organization_id, provider) or {}
    if not creds.get(HOOK_SECRET):
        creds = await save_credentials(db, organization_id, provider, {**creds, HOOK_SECRET: new_hook_secret()},
                                       actor=actor)
    return creds


# --- phone matching -----------------------------------------------------------------------------

def phone_key(phone: Optional[str]) -> str:
    """Last ten digits: 0532…, 90532…, +90 532… all become 532…."""
    digits = re.sub(r"\D", "", str(phone or ""))
    return digits[-10:] if len(digits) >= 10 else digits


def display_phone(phone: Optional[str]) -> str:
    key = phone_key(phone)
    return f"0{key}" if len(key) == 10 else (phone or "")


async def find_donor_by_phone(db: AsyncSession, organization_id: UUID, phone: Optional[str]):
    """The organisation's donor with this phone number (most recently updated one when several)."""
    from app.models.donation import Donor

    key = phone_key(phone)
    if len(key) < 7:
        return None
    digits = func.regexp_replace(Donor.phone, r"\D", "", "g")
    rows = (await db.execute(
        select(Donor).where(Donor.organization_id == organization_id, Donor.phone.isnot(None),
                            func.right(digits, 10) == key)
        .order_by(func.coalesce(Donor.updated_at, Donor.created_at).desc())
        .limit(1)
    )).scalars().first()
    return rows

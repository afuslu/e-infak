"""Per-organisation provider credentials, encrypted with Fernet.

`CREDENTIALS_ENCRYPTION_KEY` holds one or more Fernet keys (comma separated,
newest first) so keys can be rotated: new values are written with the first
key, old values remain readable with the others.
"""
import json
from typing import Optional
from uuid import UUID

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.credentials import TenantCredential

MODE_FIELD = "mode"  # payment providers: "test" or "live"


def provider_spec(provider: str) -> dict:
    """Credential form of a provider: label, fields, secret and optional fields."""
    from app.sms import PROVIDERS as SMS_PROVIDERS
    from app.payments import PROVIDERS

    if provider in SMS_PROVIDERS:
        sms = SMS_PROVIDERS[provider]
        return {"label": sms.label, "fields": dict(sms.credential_fields),
                "secret_fields": set(sms.secret_fields), "optional_fields": set(sms.optional_fields)}

    if provider.startswith("bank:"):
        from app.banking import CONNECTORS
        bank = CONNECTORS.get(provider.split(":", 1)[1])
        if not bank:
            raise KeyError(provider)
        return {"label": bank.label, "fields": dict(bank.credential_fields),
                "secret_fields": set(bank.secret_fields), "optional_fields": set(bank.optional_fields)}

    cls = PROVIDERS.get(provider)
    if not cls:
        raise KeyError(provider)
    return {
        "label": cls.label,
        "fields": {**cls.credential_fields, MODE_FIELD: "Ortam (test / live)"},
        "secret_fields": set(cls.secret_fields),
        "optional_fields": set(cls.optional_fields) | {MODE_FIELD},
        "choices": {**cls.field_choices, MODE_FIELD: {"test": "Test", "live": "Canlı"}},
    }


def known_providers() -> list[str]:
    from app.payments import PROVIDERS
    from app.sms import PROVIDERS as SMS_PROVIDERS
    from app.banking import CONNECTORS, credential_key
    return [*PROVIDERS.keys(), *SMS_PROVIDERS.keys(), *(credential_key(k) for k in CONNECTORS)]


class CredentialsUnavailable(RuntimeError):
    pass


def _fernet() -> MultiFernet:
    keys = [k.strip() for k in (settings.CREDENTIALS_ENCRYPTION_KEY or "").split(",") if k.strip()]
    if not keys:
        raise CredentialsUnavailable("CREDENTIALS_ENCRYPTION_KEY tanımlı değil; kurum hesap bilgileri kaydedilemez")
    try:
        return MultiFernet([Fernet(k.encode()) for k in keys])
    except (ValueError, TypeError) as exc:
        raise CredentialsUnavailable("CREDENTIALS_ENCRYPTION_KEY geçersiz") from exc


def encrypt(payload: dict) -> str:
    return _fernet().encrypt(json.dumps(payload, ensure_ascii=False).encode()).decode()


def decrypt(token: str) -> dict:
    try:
        return json.loads(_fernet().decrypt(token.encode()))
    except InvalidToken as exc:
        raise CredentialsUnavailable("Kayıtlı hesap bilgisi çözülemedi (anahtar değişmiş olabilir)") from exc


def clean_payload(provider: str, values: dict, previous: Optional[dict] = None) -> dict:
    """Keep known fields; an empty secret field keeps the stored value (forms never echo secrets)."""
    spec = provider_spec(provider)
    previous = previous or {}
    result = {}
    for field in spec["fields"]:
        value = str(values.get(field) or "").strip()
        if not value and field in spec["secret_fields"]:
            value = previous.get(field, "")
        if field == MODE_FIELD:
            value = "live" if value == "live" else "test"
        choices = spec.get("choices", {}).get(field)
        if choices and value not in choices:
            value = ""
        if value:
            result[field] = value[:500]
    return result


def masked(provider: str, payload: dict) -> dict:
    spec = provider_spec(provider)
    out = {}
    for field in spec["fields"]:
        value = payload.get(field)
        if not value:
            out[field] = None
        elif field in spec["secret_fields"]:
            out[field] = "••••" + value[-2:] if len(value) > 4 else "••••"
        else:
            out[field] = value
    return out


async def get_credentials(db: AsyncSession, organization_id: UUID, provider: str) -> Optional[dict]:
    row = (await db.execute(
        select(TenantCredential).where(
            TenantCredential.organization_id == organization_id, TenantCredential.provider == provider,
        )
    )).scalar_one_or_none()
    if not row:
        return None
    return decrypt(row.ciphertext)


async def save_credentials(db: AsyncSession, organization_id: UUID, provider: str, values: dict, actor: str) -> dict:
    row = (await db.execute(
        select(TenantCredential).where(
            TenantCredential.organization_id == organization_id, TenantCredential.provider == provider,
        )
    )).scalar_one_or_none()
    previous = decrypt(row.ciphertext) if row else None
    payload = clean_payload(provider, values, previous)
    token = encrypt(payload)
    if row:
        row.ciphertext, row.updated_by = token, actor
    else:
        db.add(TenantCredential(organization_id=organization_id, provider=provider, ciphertext=token, updated_by=actor))
    await db.flush()
    return payload


async def delete_credentials(db: AsyncSession, organization_id: UUID, provider: str) -> bool:
    row = (await db.execute(
        select(TenantCredential).where(
            TenantCredential.organization_id == organization_id, TenantCredential.provider == provider,
        )
    )).scalar_one_or_none()
    if not row:
        return False
    await db.delete(row)
    await db.flush()
    return True


def platform_sms() -> dict:
    return {"provider": "netgsm", "username": settings.NETGSM_USERNAME, "password": settings.NETGSM_PASSWORD,
            "sender": settings.NETGSM_SENDER, "platform": True}


async def sms_account(db: AsyncSession, organization_id: Optional[UUID]) -> dict:
    """The organisation's own SMS account (its provider and header), else the platform account.

    An organisation with settings["sms_platform_fallback"] = False never uses the platform account.
    """
    from app.models.organization import Organization
    from app.sms import DEFAULT_PROVIDER, PROVIDERS as SMS_PROVIDERS

    if not organization_id:
        return platform_sms()
    organization = await db.get(Organization, UUID(str(organization_id)))
    org_settings = (organization.settings if organization else None) or {}
    provider = org_settings.get("sms_provider") or DEFAULT_PROVIDER
    if provider in SMS_PROVIDERS:
        try:
            stored = await get_credentials(db, UUID(str(organization_id)), provider)
        except CredentialsUnavailable:
            stored = None
        if stored and SMS_PROVIDERS[provider](stored).configured:
            if provider == "netgsm" and not stored.get("sender"):
                stored["sender"] = settings.NETGSM_SENDER
            return {**stored, "provider": provider}
    if org_settings.get("sms_platform_fallback") is False:
        return {"provider": provider, "disabled": True}
    return platform_sms()

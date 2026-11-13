import asyncio
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


async def _record(organization_id, phone: str, log_text: str, ok: bool, source: str, error: str | None = None) -> None:
    """Keep a trace of a directly sent SMS in the organisation's SMS log (never the secret text)."""
    from uuid import UUID
    from app.core.db import AsyncSessionLocal
    from app.services.sms_service import enqueue_sms
    try:
        async with AsyncSessionLocal() as session:
            row = await enqueue_sms(session, UUID(str(organization_id)), phone, log_text, source=source,
                                    status="sent" if ok else "failed")
            row.error = error
            await session.commit()
    except Exception:  # noqa: BLE001 - logging must never block a login code
        logger.exception("SMS kaydı yazılamadı")


async def send_sms(phone: str, message: str, organization_id=None, log_text: str | None = None,
                   source: str = "otp") -> bool:
    """Send an SMS right away with the organisation's own provider account (platform account as fallback).

    Used for login codes, which cannot wait in a queue. With `log_text` (the message with the
    code masked) the send is recorded in the organisation's SMS log.
    Without any configured account the message is only logged outside production.
    """
    ok, error = await _send_now(phone, message, organization_id)
    if log_text and organization_id:
        await _record(organization_id, phone, log_text, ok, source, error)
    return ok


async def _send_now(phone: str, message: str, organization_id) -> tuple[bool, str | None]:
    from app.core.db import AsyncSessionLocal
    from app.services.tenant_credentials import sms_account
    from app.sms import PROVIDERS, SmsError, deliver

    async with AsyncSessionLocal() as session:
        account = await sms_account(session, organization_id)
    provider = PROVIDERS.get(account.get("provider") or "")
    if provider and not account.get("disabled") and provider(account).configured:
        try:
            await asyncio.to_thread(deliver, phone, message, account)
            return True, None
        except SmsError as exc:
            logger.error("SMS gönderilemedi: %s", exc)
            return False, str(exc)
    if settings.ENVIRONMENT == "production":
        logger.error("SMS hesabı yapılandırılmadı; mesaj gönderilmedi")
        return False, "SMS hesabı yapılandırılmadı"
    logger.info("[dev] SMS %s: %s", phone, message)
    return True, None

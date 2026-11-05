import asyncio
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


async def send_sms(phone: str, message: str, organization_id=None) -> bool:
    """Send an SMS with the organisation's own provider account (platform account as fallback).

    Without any configured account the message is only logged outside production.
    """
    from app.core.db import AsyncSessionLocal
    from app.services.tenant_credentials import sms_account
    from app.sms import PROVIDERS, SmsError, deliver

    async with AsyncSessionLocal() as session:
        account = await sms_account(session, organization_id)
    provider = PROVIDERS.get(account.get("provider") or "")
    if provider and not account.get("disabled") and provider(account).configured:
        try:
            await asyncio.to_thread(deliver, phone, message, account)
            return True
        except SmsError as exc:
            logger.error("SMS gönderilemedi: %s", exc)
            return False
    if settings.ENVIRONMENT == "production":
        logger.error("SMS hesabı yapılandırılmadı; mesaj gönderilmedi")
        return False
    logger.info("[dev] SMS %s: %s", phone, message)
    return True

"""Expo Push Notification sender helper."""
import logging
from typing import Iterable, Optional
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device_token import DeviceToken

logger = logging.getLogger(__name__)
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def send_expo_push(
    tokens: Iterable[str],
    title: str,
    body: str,
    data: Optional[dict] = None,
) -> int:
    valid = [t for t in tokens if t and (t.startswith("ExponentPushToken[") or t.startswith("ExpoPushToken["))]
    if not valid:
        return 0
    messages = [
        {"to": token, "sound": "default", "title": title, "body": body, "data": data or {}}
        for token in valid
    ]
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(EXPO_PUSH_URL, json=messages)
            if resp.status_code >= 400:
                logger.warning("Expo push HTTP %s: %s", resp.status_code, resp.text[:300])
                return 0
        return len(messages)
    except Exception as exc:
        logger.warning("Expo push failed: %s", exc)
        return 0


async def notify_user_push(
    db: AsyncSession,
    user_id: UUID,
    title: str,
    body: str,
    data: Optional[dict] = None,
) -> int:
    rows = (await db.execute(select(DeviceToken.token).where(DeviceToken.user_id == user_id))).scalars().all()
    return await send_expo_push(rows, title, body, data)

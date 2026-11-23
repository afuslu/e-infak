"""Expo Push Notification sender helper."""
import logging
from typing import Iterable, Optional
from uuid import UUID

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device_token import DeviceToken

logger = logging.getLogger(__name__)
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
CHUNK = 100  # Expo accepts at most 100 messages per request


def _is_expo_token(token: Optional[str]) -> bool:
    return bool(token) and (token.startswith("ExponentPushToken[") or token.startswith("ExpoPushToken["))


async def _post(messages: list[dict], errors: Optional[list[str]] = None) -> tuple[int, list[str]]:
    """Send one chunk. Returns (accepted, tokens Expo says no longer exist).

    Every other rejection is logged and its code appended to `errors`: a refused push is not a missing device.
    """
    dead: list[str] = []
    errors = [] if errors is None else errors
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(EXPO_PUSH_URL, json=messages)
        if resp.status_code >= 400:
            logger.warning("Expo push HTTP %s: %s", resp.status_code, resp.text[:300])
            errors.append(f"HTTP {resp.status_code}")
            return 0, dead
        tickets = (resp.json() or {}).get("data") or []
    except Exception as exc:  # noqa: BLE001 - a push must never break the caller
        logger.warning("Expo push failed: %s", exc)
        errors.append("Unreachable")
        return 0, dead
    accepted = 0
    for message, ticket in zip(messages, tickets if isinstance(tickets, list) else []):
        if ticket.get("status") == "ok":
            accepted += 1
        elif (ticket.get("details") or {}).get("error") == "DeviceNotRegistered":
            dead.append(message["to"])
        else:
            code = (ticket.get("details") or {}).get("error") or "Unknown"
            errors.append(code)
            logger.error("Expo push rejected (%s): %s", code, ticket.get("message"))
    if accepted + len(dead) < len(messages) and not errors:
        logger.error("Expo push returned an unexpected response: %s", resp.text[:300])
        errors.append("Unknown")
    return accepted, dead


async def push_messages(tokens: Iterable[str], title: str, body: str, data: Optional[dict] = None,
                        *, badge: Optional[int] = None, channel_id: str = "default",
                        category_id: Optional[str] = None,
                        errors: Optional[list[str]] = None) -> tuple[int, list[str]]:
    valid = list(dict.fromkeys(t for t in tokens if _is_expo_token(t)))
    messages = []
    for token in valid:
        message = {"to": token, "sound": "default", "title": title, "body": body, "data": data or {},
                   "channelId": channel_id, "priority": "high"}
        if badge is not None:
            message["badge"] = badge
        if category_id:
            message["categoryId"] = category_id
        messages.append(message)
    accepted, dead = 0, []
    for start in range(0, len(messages), CHUNK):
        ok, gone = await _post(messages[start:start + CHUNK], errors)
        accepted += ok
        dead.extend(gone)
    return accepted, dead


async def send_expo_push(tokens: Iterable[str], title: str, body: str, data: Optional[dict] = None) -> int:
    accepted, _dead = await push_messages(tokens, title, body, data)
    return accepted


async def forget_tokens(db: AsyncSession, tokens: list[str]) -> None:
    """Remove device tokens Expo reported as uninstalled / logged out."""
    if tokens:
        await db.execute(delete(DeviceToken).where(DeviceToken.token.in_(tokens)))


async def user_tokens(db: AsyncSession, user_id: UUID, organization_id: Optional[UUID] = None) -> list[str]:
    query = select(DeviceToken.token).where(DeviceToken.user_id == user_id)
    if organization_id:
        query = query.where((DeviceToken.organization_id == organization_id) | DeviceToken.organization_id.is_(None))
    return list((await db.execute(query)).scalars().all())


async def notify_user_push(
    db: AsyncSession,
    user_id: UUID,
    title: str,
    body: str,
    data: Optional[dict] = None,
) -> int:
    accepted, dead = await push_messages(await user_tokens(db, user_id), title, body, data)
    await forget_tokens(db, dead)
    return accepted

"""Small Redis-backed fixed-window rate limiting dependencies.

The limiter intentionally fails open when Redis is unavailable: availability of
donations is preferable to an outage, while the error is logged for alerting.
"""
from __future__ import annotations

import logging
from typing import Callable

import redis.asyncio as redis
from fastapi import HTTPException, Request, Response

from app.core.config import settings

logger = logging.getLogger(__name__)
_redis: redis.Redis | None = None


def _client() -> redis.Redis:
    global _redis
    if _redis is None:
        _redis = redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


def rate_limit(scope: str, *, limit: int, window_seconds: int | None = None) -> Callable:
    """Return a FastAPI dependency limiting requests by tenant, IP and scope."""
    window = window_seconds or settings.RATE_LIMIT_DEFAULT_WINDOW_SECONDS

    async def enforce(request: Request, response: Response) -> None:
        if not settings.RATE_LIMIT_ENABLED:
            return
        tenant = getattr(request.state, "organization_id", "global")
        client_ip = request.client.host if request.client else "unknown"
        key = f"rate-limit:{scope}:{tenant}:{client_ip}"
        try:
            client = _client()
            count = await client.incr(key)
            if count == 1:
                await client.expire(key, window)
            ttl = max(await client.ttl(key), 1)
        except Exception as exc:  # pragma: no cover - depends on infrastructure
            logger.warning("Rate limiter unavailable for %s: %s", scope, exc)
            return
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(max(limit - count, 0))
        if count > limit:
            raise HTTPException(
                status_code=429,
                detail="Çok fazla istek gönderildi. Lütfen kısa süre sonra tekrar deneyin.",
                headers={
                    "Retry-After": str(ttl),
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                },
            )

    return enforce

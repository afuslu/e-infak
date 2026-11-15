"""One-time SMS login codes for the donor and parent portals.

Redis holds codes and counters; when it is down an in-process store keeps the same limits, so an
outage never means unlimited SMS (SMS pumping) or unlimited guesses.
"""
from __future__ import annotations

import logging
import secrets
import threading
import time

import redis
from fastapi import HTTPException

from app.core.config import settings
from app.core.rate_limit import memory_hit
from app.utils.phone import phone_key

logger = logging.getLogger(__name__)

CODE_TTL = 180
COOLDOWN = 60
MAX_ATTEMPTS = 5
PER_PHONE_PER_DAY = 8
PER_IP_PER_HOUR = 20
PER_TENANT_PER_HOUR = 300

_codes: dict[str, tuple[str, float]] = {}
_lock = threading.Lock()


def _redis():
    try:
        client = redis.from_url(settings.REDIS_URL, decode_responses=True, socket_connect_timeout=1, socket_timeout=1)
        client.ping()
        return client
    except Exception as exc:
        logger.warning("OTP Redis unavailable, using memory: %s", exc)
        return None


def _hit(client, key: str, window: int) -> int:
    if client is not None:
        try:
            count = client.incr(key)
            if count == 1:
                client.expire(key, window)
            return int(count)
        except Exception:
            pass
    return memory_hit(key, window)[0]


def normalized(phone: str) -> str:
    key = phone_key(phone)
    if len(key) != 10:
        raise HTTPException(status_code=400, detail="Geçerli bir telefon numarası girin.")
    return key


def issue(scope: str, tenant: str, phone: str, client_ip: str) -> str:
    """Create a code for (scope, tenant, phone) after enforcing every sending limit."""
    key = normalized(phone)
    base = f"otp:{scope}:{tenant}:{key}"
    client = _redis()
    if _hit(client, f"otp-ip:{scope}:{tenant}:{client_ip}", 3600) > PER_IP_PER_HOUR:
        raise HTTPException(status_code=429, detail="Bu bağlantıdan çok fazla kod istendi.")
    if _hit(client, f"otp-tenant:{scope}:{tenant}", 3600) > PER_TENANT_PER_HOUR:
        raise HTTPException(status_code=429, detail="Şu an çok fazla kod isteniyor, lütfen biraz sonra deneyin.")
    if _hit(client, f"otp-day:{base}", 86400) > PER_PHONE_PER_DAY:
        raise HTTPException(status_code=429, detail="Bu numara için bugün çok fazla kod istendi.")
    if _hit(client, f"otp-cooldown:{base}", COOLDOWN) > 1:
        raise HTTPException(status_code=429, detail="Yeni kod istemeden önce 60 saniye bekleyin.")
    code = f"{secrets.randbelow(900000) + 100000}"
    stored = False
    if client is not None:
        try:
            client.setex(base, CODE_TTL, code)
            client.delete(f"otp-attempts:{base}")
            stored = True
        except Exception:
            pass
    if not stored:
        with _lock:
            _codes[base] = (code, time.monotonic() + CODE_TTL)
    return code


def verify(scope: str, tenant: str, phone: str, code: str) -> str:
    """Check a code; returns the normalized phone key on success, raises otherwise."""
    key = normalized(phone)
    code = (code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="Doğrulama kodu gereklidir.")
    base = f"otp:{scope}:{tenant}:{key}"
    client = _redis()
    if _hit(client, f"otp-attempts:{base}", CODE_TTL) > MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Çok fazla hatalı deneme. Yeni kod isteyin.")
    saved = None
    if client is not None:
        try:
            saved = client.get(base)
        except Exception:
            saved = None
    if saved is None:
        with _lock:
            entry = _codes.get(base)
            if entry and entry[1] > time.monotonic():
                saved = entry[0]
    if not saved or not secrets.compare_digest(str(saved), code):
        raise HTTPException(status_code=400, detail="Geçersiz veya süresi dolmuş kod.")
    if client is not None:
        try:
            client.delete(base, f"otp-attempts:{base}")
        except Exception:
            pass
    with _lock:
        _codes.pop(base, None)
    return key

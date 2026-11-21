"""Pure-Python RFC 6238 TOTP (2FA) helper — zero external dependencies."""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote


def generate_secret(length_bytes: int = 20) -> str:
    return base64.b32encode(secrets.token_bytes(length_bytes)).decode("ascii").rstrip("=")


def _totp_at(secret: str, counter: int, digits: int = 6) -> str:
    padded = secret.upper().strip() + "=" * ((8 - len(secret.strip()) % 8) % 8)
    key = base64.b32decode(padded, casefold=True)
    msg = struct.pack(">Q", counter)
    digest = hmac.new(key, msg, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code_int = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(code_int % (10**digits)).zfill(digits)


def verify_totp(secret: str, code: str, *, step: int = 30, window: int = 1, now: float | None = None) -> bool:
    clean = "".join(ch for ch in (code or "") if ch.isdigit())
    if len(clean) != 6 or not secret:
        return False
    ts = int((now if now is not None else time.time()) // step)
    for delta in range(-window, window + 1):
        try:
            expected = _totp_at(secret, ts + delta)
        except Exception:
            return False
        if hmac.compare_digest(expected, clean):
            return True
    return False


def provisioning_uri(secret: str, account_email: str, issuer: str = "e-İnfak") -> str:
    label = quote(f"{issuer}:{account_email}")
    return f"otpauth://totp/{label}?secret={secret}&issuer={quote(issuer)}&algorithm=SHA1&digits=6&period=30"

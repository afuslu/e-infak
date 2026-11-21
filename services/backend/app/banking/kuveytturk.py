"""Kuveyt Türk API Portal (OAuth2) hesap hareketleri bağlayıcısı.

Dokümantasyon: https://developer.kuveytturk.com.tr/
- OAuth2 Client Credentials token: POST {token_url} (varsayılan https://idgateway.kuveytturk.com.tr/connect/token)
- Hesap hareketleri: GET {api_base_url}/v2/accounts/{suffix}/transactions?beginDate=...&endDate=...
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx

from app.banking import register
from app.banking.base import BankConnector, BankMovement

DEFAULT_TOKEN_URL = "https://idgateway.kuveytturk.com.tr/connect/token"
DEFAULT_API_BASE = "https://gateway.kuveytturk.com.tr/v2"


def _parse_amount_cents(raw: Any) -> int:
    if raw is None:
        return 0
    try:
        val = Decimal(str(raw).replace(",", ".").strip())
        return int(round(val * 100))
    except (InvalidOperation, ValueError):
        return 0


def _parse_dt(raw: Any) -> datetime:
    if not raw:
        return datetime.now(timezone.utc)
    text = str(raw).strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S.%f%z", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(text, fmt)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return datetime.now(timezone.utc)


@register
class KuveytTurk(BankConnector):
    """Kuveyt Türk API Portal (OAuth2 client credentials) canlı hesap hareketi bağlayıcısı."""

    key = "kuveytturk"
    label = "Kuveyt Türk"
    ready = True
    credential_fields = {
        "client_id": "Client ID",
        "client_secret": "Client secret",
        "customer_no": "Müşteri no",
        "account_suffix": "Hesap eki (ör. 1)",
        "api_base_url": "API taban adresi (opsiyonel)",
        "token_url": "Token adresi (opsiyonel)",
    }
    secret_fields = ("client_secret",)

    async def fetch(self, account, since: datetime, until: datetime) -> list[BankMovement]:
        creds = dict(getattr(account, "credentials", None) or {})
        client_id = str(creds.get("client_id") or "").strip()
        client_secret = str(creds.get("client_secret") or "").strip()
        suffix = str(creds.get("account_suffix") or "1").strip()
        token_url = str(creds.get("token_url") or DEFAULT_TOKEN_URL).strip()
        api_base = str(creds.get("api_base_url") or DEFAULT_API_BASE).strip().rstrip("/")
        if not client_id or not client_secret:
            raise ValueError("Kuveyt Türk için Client ID ve Client Secret gereklidir")

        async with httpx.AsyncClient(timeout=30.0) as client:
            tok_resp = await client.post(
                token_url,
                data={
                    "grant_type": "client_credentials",
                    "scope": "accounts",
                    "client_id": client_id,
                    "client_secret": client_secret,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            tok_resp.raise_for_status()
            access_token = tok_resp.json().get("access_token")
            if not access_token:
                raise RuntimeError("Kuveyt Türk OAuth2 access_token alınamadı")

            tx_resp = await client.get(
                f"{api_base}/accounts/{suffix}/transactions",
                params={
                    "beginDate": since.astimezone(timezone.utc).strftime("%Y-%m-%d"),
                    "endDate": until.astimezone(timezone.utc).strftime("%Y-%m-%d"),
                },
                headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
            )
            tx_resp.raise_for_status()
            payload = tx_resp.json()

        raw_items = (
            payload.get("value", {}).get("accountTransactions")
            if isinstance(payload, dict) and isinstance(payload.get("value"), dict)
            else payload.get("items", []) if isinstance(payload, dict) else payload
        ) or []

        movements: list[BankMovement] = []
        for row in raw_items:
            if not isinstance(row, dict):
                continue
            amount_cents = _parse_amount_cents(row.get("amount") or row.get("transactionAmount"))
            if amount_cents <= 0:
                continue  # Sadece gelen (alacak) hareketler
            occurred = _parse_dt(row.get("date") or row.get("transactionDate"))
            desc = str(row.get("description") or row.get("explanation") or "").strip()
            sender = str(row.get("senderName") or row.get("counterpartyName") or "").strip() or None
            sender_iban = str(row.get("senderIban") or row.get("counterpartyIban") or "").strip() or None
            ext_id = str(row.get("referenceNumber") or row.get("transactionId") or "").strip()
            if not ext_id:
                digest = hashlib.sha256(f"{occurred.isoformat()}|{amount_cents}|{desc}".encode()).hexdigest()[:24]
                ext_id = f"kt-{digest}"
            movements.append(
                BankMovement(
                    external_id=ext_id,
                    occurred_at=occurred,
                    amount_cents=amount_cents,
                    currency=str(row.get("currencyCode") or getattr(account, "currency", None) or "TRY").upper(),
                    description=desc,
                    sender_name=sender,
                    sender_iban=sender_iban,
                    raw=row,
                )
            )
        return movements

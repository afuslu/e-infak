"""Meta WhatsApp Business Cloud API client for template and text messages."""
from dataclasses import dataclass
from typing import Optional

import httpx

GRAPH_API_BASE = "https://graph.facebook.com/v21.0"


@dataclass
class WhatsAppResult:
    ok: bool
    message_id: Optional[str] = None
    error: Optional[str] = None


def normalize_phone(phone: str) -> str:
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    if digits.startswith("00"):
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = "90" + digits[1:]
    elif len(digits) == 10 and digits.startswith("5"):
        digits = "90" + digits
    return digits


def send_template_message(
    *,
    phone_number_id: str,
    access_token: str,
    to_phone: str,
    template_name: str,
    language_code: str = "tr",
    body_params: Optional[list[str]] = None,
) -> WhatsAppResult:
    """Send an approved WhatsApp Cloud API template message."""
    to = normalize_phone(to_phone)
    if not (phone_number_id and access_token and to and template_name):
        return WhatsAppResult(ok=False, error="WhatsApp yapılandırması veya telefon numarası eksik")

    payload: dict = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language_code},
        },
    }
    if body_params:
        payload["template"]["components"] = [
            {"type": "body", "parameters": [{"type": "text", "text": str(p)} for p in body_params]}
        ]

    try:
        res = httpx.post(
            f"{GRAPH_API_BASE}/{phone_number_id}/messages",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json=payload,
            timeout=10.0,
        )
        data = res.json() if res.content else {}
        if res.is_success:
            msg_id = ((data.get("messages") or [{}])[0]).get("id")
            return WhatsAppResult(ok=True, message_id=msg_id)
        err = (data.get("error") or {}).get("message") or f"HTTP {res.status_code}"
        return WhatsAppResult(ok=False, error=err)
    except Exception as exc:
        return WhatsAppResult(ok=False, error=str(exc))

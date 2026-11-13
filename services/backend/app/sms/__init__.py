"""SMS providers an organisation can send through with its own account.

Organization.settings["sms_provider"] picks the provider; its credentials are
stored encrypted (services/tenant_credentials.py). Without an own account the
platform's NetGSM account is used, unless settings["sms_platform_fallback"] is
False. Drivers are synchronous (Celery tasks call them directly).
"""
from dataclasses import dataclass
from typing import Optional

import requests


class SmsError(RuntimeError):
    """The provider refused the message; the text is safe to show staff."""


class SmsUnreachable(SmsError):
    """The provider could not be reached; sending again later may work."""


@dataclass
class SmsResult:
    provider: str
    reference: Optional[str] = None


def normalize_tr_phone(phone: str) -> str:
    """905XXXXXXXXX for Turkish mobiles; other numbers are returned as digits."""
    digits = "".join(ch for ch in str(phone or "") if ch.isdigit())
    if len(digits) == 10 and digits.startswith("5"):
        return "90" + digits
    if len(digits) == 11 and digits.startswith("05"):
        return "9" + digits
    return digits


class SmsProvider:
    key = ""
    label = ""
    credential_fields: dict[str, str] = {}
    secret_fields: set[str] = set()
    optional_fields: set[str] = set()

    def __init__(self, credentials: dict) -> None:
        self.credentials = credentials or {}

    @property
    def configured(self) -> bool:
        return all(self.credentials.get(f) for f in set(self.credential_fields) - self.optional_fields)

    def send(self, phone: str, message: str, commercial: bool = False) -> SmsResult:
        """`commercial`: a promotional message to a consumer, checked against İYS by the provider."""
        raise NotImplementedError

    # How many references one reports() call may carry, and how many calls a polling round may make
    # (providers limit report queries per minute).
    report_chunk = 1
    report_calls = 5

    def reports(self, references: list[str]) -> dict[str, tuple[str, Optional[str]]]:
        """Delivery outcome per reference: ("delivered", None) or ("failed", reason).
        References still on their way (or unknown to the provider) are left out."""
        return {}

    def balance(self) -> Optional[dict]:
        """{"text": "92,15 TL", "amount": 92.15, "unit": "TL" | "SMS"} or None when not available."""
        return None

    def _http(self, method: str, url: str, **kwargs) -> requests.Response:
        try:
            return requests.request(method, url, timeout=15, **kwargs)
        except requests.RequestException as exc:
            raise SmsUnreachable(f"{self.label} sunucusuna ulaşılamadı") from exc


NETGSM_ERRORS = {
    "20": "mesaj metni hatalı veya çok uzun",
    "30": "abone numarası/şifre hatalı, API izni yok ya da sunucu IP'si NetGSM'de izinli değil",
    "40": "SMS başlığı (gönderici adı) NetGSM'de tanımlı değil",
    "50": "hesap İYS kontrollü gönderime uygun değil",
    "51": "hesaba tanımlı İYS marka bilgisi yok",
    "70": "parametre hatalı veya eksik",
    "80": "gönderim sınırı aşıldı",
    "85": "aynı numaraya 1 dakikada çok fazla gönderim",
}


# REST v2 report row status (official SDK, SmsStatus). 0 = still pending, 1 = delivered.
NETGSM_REPORT_FAILURES = {
    2: "zaman aşımı (telefon kapalı veya kapsama dışı)", 3: "hatalı veya kısıtlı numara",
    4: "operatöre gönderilemedi", 11: "operatör kabul etmedi", 12: "gönderim hatası", 13: "mükerrer gönderim",
    14: "yetersiz bakiye", 15: "numara kara listede", 16: "İYS izni yok", 17: "İYS hatası",
}


def _decimal(value) -> Optional[float]:
    try:
        return float(str(value).replace(".", "").replace(",", ".")) if "," in str(value) else float(value)
    except (TypeError, ValueError):
        return None


class NetgsmProvider(SmsProvider):
    """https://www.netgsm.com.tr/dokuman/#sms-gonderimi — REST v2 with HTTP Basic auth
    (subscriber number + password of a sub-user of type "API Kullanıcısı"). The old
    GET endpoint no longer accepts SMS sends."""
    key = "netgsm"
    label = "NetGSM"
    credential_fields = {"username": "Abone numarası (850…)", "password": "API alt kullanıcı şifresi",
                         "sender": "SMS başlığı"}
    secret_fields = {"password"}
    optional_fields = {"sender"}

    def send(self, phone: str, message: str, commercial: bool = False) -> SmsResult:
        number = normalize_tr_phone(phone)
        # NetGSM wants 5XXXXXXXXX for Turkish numbers and 00-prefixed international ones.
        number = number[2:] if number.startswith("90") else (number if number.startswith("00") else "00" + number)
        response = self._http(
            "POST", "https://api.netgsm.com.tr/sms/rest/v2/send",
            auth=(self.credentials["username"], self.credentials["password"]),
            json={
                "msgheader": self.credentials.get("sender") or "",
                "messages": [{"msg": message, "no": number}],
                "encoding": "TR",
                # "0": informational (receipts, codes, reminders); "11": commercial to consumers (İYS checked)
                "iysfilter": "11" if commercial else "0",
                "appname": "e-infak",
            },
        )
        try:
            data = response.json() or {}
        except ValueError:
            data = {}
        code = str(data.get("code") or "")
        if response.status_code != 200 or code != "00":
            reason = NETGSM_ERRORS.get(code) or data.get("description") or f"HTTP {response.status_code}"
            raise SmsError(f"NetGSM gönderimi reddetti (kod {code or '-'}: {reason})")
        return SmsResult(self.key, str(data.get("jobid") or "") or None)

    report_chunk = 50
    report_calls = 4  # NetGSM allows 10 report queries a minute

    def reports(self, references: list[str]) -> dict[str, tuple[str, Optional[str]]]:
        response = self._http(
            "POST", "https://api.netgsm.com.tr/sms/rest/v2/report",
            auth=(self.credentials["username"], self.credentials["password"]),
            json={"jobids": references, "appname": "e-infak"},
        )
        try:
            data = response.json() or {}
        except ValueError:
            return {}
        out: dict[str, tuple[str, Optional[str]]] = {}
        for job in data.get("jobs") or []:
            try:
                status = int(job.get("status"))
            except (TypeError, ValueError):
                continue
            reference = str(job.get("jobid") or "")
            if status == 1:
                out[reference] = ("delivered", None)
            elif status in NETGSM_REPORT_FAILURES:
                out[reference] = ("failed", f"İletilemedi: {NETGSM_REPORT_FAILURES[status]}")
        return out

    def balance(self) -> Optional[dict]:
        response = self._http("POST", "https://api.netgsm.com.tr/balance", json={
            "usercode": self.credentials["username"], "password": self.credentials["password"], "stip": 2,
        })
        try:
            data = response.json() or {}
        except ValueError:
            return None
        if str(data.get("code")) != "00" or isinstance(data.get("balance"), (list, type(None))):
            return None
        raw = str(data["balance"]).strip()
        unit = "SMS" if "sms" in str(data.get("type") or "").lower() else "TL"
        return {"text": f"{raw} {unit}", "amount": _decimal(raw), "unit": unit}


class VerimorProvider(SmsProvider):
    """https://github.com/verimor/SMS-API/blob/master/user_guide.md — the sending
    server's IP must be allowed in the Verimor panel."""
    key = "verimor"
    label = "Verimor"
    credential_fields = {"username": "Hesap numarası (90850…)", "password": "API şifresi", "sender": "SMS başlığı"}
    secret_fields = {"password"}
    optional_fields = {"sender"}

    def send(self, phone: str, message: str, commercial: bool = False) -> SmsResult:
        payload = {
            "username": self.credentials["username"], "password": self.credentials["password"],
            "messages": [{"msg": message, "dest": normalize_tr_phone(phone)}],
        }
        if self.credentials.get("sender"):
            payload["source_addr"] = self.credentials["sender"]
        if commercial:
            payload.update(is_commercial=True, iys_recipient_type="BIREYSEL")
        response = self._http("POST", "https://sms.verimor.com.tr/v2/send.json", json=payload)
        body = response.text.strip()
        if response.status_code != 200:
            raise SmsError(f"Verimor gönderimi reddetti ({body[:80] or response.status_code})")
        return SmsResult(self.key, body[:64] or None)

    VERIMOR_PENDING = {"SENDING", "WAITING", "SENT"}
    report_calls = 8  # Verimor allows 20 status queries a minute

    def reports(self, references: list[str]) -> dict[str, tuple[str, Optional[str]]]:
        out: dict[str, tuple[str, Optional[str]]] = {}
        for reference in references:
            response = self._http("GET", "https://sms.verimor.com.tr/v2/status", params={
                "username": self.credentials["username"], "password": self.credentials["password"], "id": reference})
            try:
                rows = response.json() if response.status_code == 200 else []
            except ValueError:
                rows = []
            status = str(rows[0].get("status") or "") if rows and isinstance(rows, list) else ""
            if status == "DELIVERED":
                out[reference] = ("delivered", None)
            elif status and status not in self.VERIMOR_PENDING:
                out[reference] = ("failed", f"İletilemedi: {status}")
        return out

    def balance(self) -> Optional[dict]:
        response = self._http("GET", "https://sms.verimor.com.tr/v2/balance", params={
            "username": self.credentials["username"], "password": self.credentials["password"]})
        amount = _decimal(response.text.strip()) if response.status_code == 200 else None
        return None if amount is None else {"text": f"{amount:g} kredi", "amount": amount, "unit": "SMS"}


class IletiMerkeziProvider(SmsProvider):
    """https://www.iletimerkezi.com/docs/api/send-sms — "API kullanımına izin ver"
    must be on in the panel; key and hash are copied from the panel."""
    key = "iletimerkezi"
    label = "İleti Merkezi"
    credential_fields = {"api_key": "API anahtarı (key)", "api_hash": "API hash", "sender": "SMS başlığı"}
    secret_fields = {"api_hash"}

    def send(self, phone: str, message: str, commercial: bool = False) -> SmsResult:
        order = {"iys": "1", "iysList": "BIREYSEL"} if commercial else {"iys": "0"}
        response = self._http("POST", "https://api.iletimerkezi.com/v1/send-sms/json", json={"request": {
            "authentication": {"key": self.credentials["api_key"], "hash": self.credentials["api_hash"]},
            # iys "0": informational (receipts, codes, reminders); "1": marketing, checked against İYS
            "order": {"sender": self.credentials["sender"], **order,
                      "message": {"text": message, "receipents": {"number": [normalize_tr_phone(phone)]}}},
        }})
        try:
            data = response.json().get("response", {})
        except ValueError as exc:
            raise SmsError("İleti Merkezi yanıtı okunamadı") from exc
        status = data.get("status") or {}
        if status.get("code") != 200:
            raise SmsError(f"İleti Merkezi gönderimi reddetti ({status.get('code')}: {status.get('message')})")
        return SmsResult(self.key, str((data.get("order") or {}).get("id") or "") or None)

    report_calls = 10

    def _call(self, path: str, body: dict) -> dict:
        response = self._http("POST", f"https://api.iletimerkezi.com/v1/{path}/json", json={"request": {
            "authentication": {"key": self.credentials["api_key"], "hash": self.credentials["api_hash"]}, **body}})
        try:
            return response.json().get("response", {}) or {}
        except ValueError:
            return {}

    def reports(self, references: list[str]) -> dict[str, tuple[str, Optional[str]]]:
        out: dict[str, tuple[str, Optional[str]]] = {}
        for reference in references:
            order = self._call("get-report", {"order": {"id": reference}}).get("order") or {}
            # One number per order: the order's own counters tell the outcome.
            if int(order.get("delivered") or 0) > 0:
                out[reference] = ("delivered", None)
            elif int(order.get("undelivered") or 0) > 0 or str(order.get("status")) == "115":
                out[reference] = ("failed", "İletilemedi")
        return out

    def balance(self) -> Optional[dict]:
        data = self._call("get-balance", {}).get("balance") or {}
        if data.get("sms") is None and data.get("amount") is None:
            return None
        return {"text": f"{data.get('amount')} TL (yaklaşık {data.get('sms')} SMS)", "amount": _decimal(data.get("amount")),
                "unit": "TL"}


PROVIDERS: dict[str, type[SmsProvider]] = {
    cls.key: cls for cls in (NetgsmProvider, VerimorProvider, IletiMerkeziProvider)
}
DEFAULT_PROVIDER = NetgsmProvider.key


def deliver(phone: str, message: str, account: dict, commercial: bool = False) -> SmsResult:
    """Send with an account from services.tenant_credentials.sms_account()."""
    cls = PROVIDERS.get(account.get("provider") or DEFAULT_PROVIDER)
    if not cls:
        raise SmsError("Bilinmeyen SMS sağlayıcısı")
    provider = cls(account)
    if not provider.configured:
        raise SmsError("SMS hesabı yapılandırılmadı")
    return provider.send(phone, message, commercial)

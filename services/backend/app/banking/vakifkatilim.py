"""Vakıf Katılım "Müşteri İşlemleri Servisi" (API Bankacılığı, doc v1.1, 26/04/2018).

A SOAP (WCF) service with three methods: GetAccountBalance, GetCustomerTransactions and
GetCustomerTransactionDetails. Authentication is the customer's IP (the bank whitelists our server,
31.97.159.228) plus ExtUName / ExtUPassword and the customer number. Rules from the doc:
- one query covers at most 31 days (error 279437), begin must not be after end (279436);
- the methods should not be called more often than every 15 minutes.

The PDF names the request contracts and fields but not the XML namespaces or SOAP actions, so they are
read from the service's own WSDL (``?singleWsdl``) the first time and cached; the defaults below are the
usual WCF ones. WCF's DataContractSerializer expects the request members in alphabetical order.
"""
from __future__ import annotations

import re
import time
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Optional
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape
from zoneinfo import ZoneInfo

import httpx

from app.banking import register
from app.banking.base import BankConnector, BankConnectorError, BankMovement
from app.banking.parsers import parse_description

TZ = ZoneInfo("Europe/Istanbul")
PROD_URL = ("https://boa.vakifkatilim.com.tr/BOA.Integration.WCFService/"
            "BOA.Integration.CustomerTransaction/CustomerTransactionService.svc")
TEST_URL = ("https://boatest.vakifkatilim.com.tr/BOA.Integration.WCFServiceTest/"
            "BOA.Integration.CustomerTransaction/CustomerTransactionService.svc")
MAX_DAYS = 31
TIMEOUT = 60
WSDL_CACHE_SECONDS = 6 * 3600

SOAP11 = "http://schemas.xmlsoap.org/soap/envelope/"
SOAP12 = "http://www.w3.org/2003/05/soap-envelope"
DEFAULT_SERVICE_NS = "http://tempuri.org/"
DEFAULT_CONTRACT = "ICustomerTransactionService"

# Doc §3.1
ERRORS = {
    "279438": "Bu müşteri numarasıyla sorgulama yetkiniz yok; Müşteri no alanını kontrol edin",
    "279436": "Başlangıç tarihi bitiş tarihinden büyük olamaz",
    "279437": "Bir sorguda en fazla 31 günlük hareket alınabilir",
    "70009": "Vakıf Katılım kullanıcıyı doğrulayamadı: web servis şifresi yanlış",
    "NotAuthorized": ("Vakıf Katılım bu işleme yetki vermedi: web servis kullanıcı adı yanlış ya da sunucu IP'si "
                      "(31.97.159.228) bankada tanımlı değil"),
}
# Doc §3.2
TRANSACTION_TYPES = {
    1: "Gelen EFT", 2: "Muhabirden Gelen EFT", 3: "Gelen Swift", 4: "Havale", 5: "Nakit Yatırma",
    6: "Gelen PTT Havaleleri", 7: "Bağış Tahsilatı", 8: "Giden EFT", 9: "Para Çekme", 10: "Giden Swift",
    11: "Muhabire Gönderilen EFT",
}
CHANNELS = {0: "Batch", 1: "Şube", 2: "İnternet", 3: "ATM", 5: "Mobil Şube", 6: "Çağrı Merkezi", 8: "EOD",
            10: "Sigorta Platformu", 22: "API Bankacılığı"}
CURRENCY_NAMES = {"TL": "TRY", "TRL": "TRY", "TRY": "TRY", "USD": "USD", "EUR": "EUR", "GBP": "GBP", "CHF": "CHF",
                  "SAR": "SAR", "ALT": "XAU"}
IBAN = re.compile(r"^TR\d{24}$")

_wsdl_cache: dict[str, tuple[float, dict]] = {}


def local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def namespace(tag: str) -> str:
    return tag[1:].split("}", 1)[0] if tag.startswith("{") else ""


def fmt_dt(value: datetime | date) -> str:
    if isinstance(value, datetime):
        if value.tzinfo:
            value = value.astimezone(TZ).replace(tzinfo=None)
        return value.replace(microsecond=0).isoformat()
    return f"{value.isoformat()}T00:00:00"


def parse_dt(text: Optional[str]) -> Optional[datetime]:
    if not text:
        return None
    text = text.strip()
    match = re.match(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})?$", text)
    if not match:
        return None
    parsed = datetime.fromisoformat(match.group(1) + (match.group(2) or "")[:7])
    zone = match.group(3)
    if zone == "Z":
        return parsed.replace(tzinfo=timezone.utc)
    if zone:
        return datetime.fromisoformat(match.group(1) + zone).astimezone(timezone.utc)
    return parsed.replace(tzinfo=TZ).astimezone(timezone.utc)


def to_cents(text: Optional[str]) -> Optional[int]:
    try:
        return int((Decimal(str(text).strip().replace(",", ".")) * 100).to_integral_value())
    except (InvalidOperation, ValueError, TypeError):
        return None


def currency_of(fec: Optional[str], fec_name: Optional[str]) -> str:
    name = (fec_name or "").strip().upper()
    if name in CURRENCY_NAMES:
        return CURRENCY_NAMES[name]
    if (fec or "").strip() in ("", "0"):
        return "TRY"
    return name[:3] or "TRY"


def windows(since: datetime, until: datetime, days: int = MAX_DAYS) -> list[tuple[datetime, datetime]]:
    """Split [since, until] into pieces the bank accepts (at most ``days`` days each)."""
    if since > until:
        return []
    parts, start = [], since
    step = timedelta(days=days) - timedelta(seconds=1)
    while start <= until:
        end = min(start + step, until)
        parts.append((start, end))
        start = end + timedelta(seconds=1)
    return parts


def parse_wsdl(raw: bytes) -> dict:
    """Service namespace, request contract namespaces, SOAP actions and SOAP version from a WCF singleWsdl."""
    root = ET.fromstring(raw)
    info: dict = {"service_ns": root.get("targetNamespace") or DEFAULT_SERVICE_NS, "contract_ns": {}, "actions": {},
                  "soap12": False}
    for schema in root.iter():
        if local(schema.tag) != "schema":
            continue
        target = schema.get("targetNamespace") or ""
        for child in schema:
            if local(child.tag) == "complexType" and child.get("name") in ("AccountBalanceRequest", "CustomerTransactionRequest"):
                info["contract_ns"][child.get("name")] = target
    for element in root.iter():
        if local(element.tag) == "operation" and element.get("soapAction"):
            info["actions"].setdefault(element.get("soapAction").rsplit("/", 1)[-1], element.get("soapAction"))
            if namespace(element.tag).endswith("/soap12/"):
                info["soap12"] = True
    return info


def _text(element: ET.Element) -> Optional[str]:
    if element.get("{http://www.w3.org/2001/XMLSchema-instance}nil") == "true":
        return None
    return (element.text or "").strip()


def _record(element: ET.Element) -> dict:
    return {local(child.tag): _text(child) for child in element if len(child) == 0}


def parse_soap(raw: bytes) -> ET.Element:
    """The SOAP body's payload; raises BankConnectorError for faults and the bank's error codes."""
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as exc:
        raise BankConnectorError("Vakıf Katılım'ın cevabı okunamadı") from exc
    fault = next((e for e in root.iter() if local(e.tag) == "Fault"), None)
    if fault is not None:
        raise BankConnectorError(error_message(" ".join(t.strip() for t in fault.itertext() if t.strip())))
    # Contracts that report errors inside a normal response (ErrorCode / ResultCode / Success fields).
    for element in root.iter():
        name = local(element.tag)
        value = (element.text or "").strip()
        if name in ("ErrorCode", "ResultCode", "ResponseCode") and value.lower() not in ("", "0", "00", "success", "ok"):
            parent_text = " ".join(t.strip() for t in root.itertext() if t.strip())
            raise BankConnectorError(error_message(f"{value} {parent_text}"))
        if name in ("Success", "IsSuccess") and (element.text or "").strip().lower() == "false":
            raise BankConnectorError(error_message(" ".join(t.strip() for t in root.itertext() if t.strip())))
    return root


def error_message(text: str) -> str:
    for code, message in ERRORS.items():
        if code.lower() in text.lower():
            return message
    if re.search(r"do[ğg]rulanamad|could not be verified", text, re.I):
        return ERRORS["70009"]
    if re.search(r"yetkiniz yok|not authorized", text, re.I):
        return ERRORS["NotAuthorized"]
    return f"Vakıf Katılım hata döndürdü: {text[:300]}" if text else "Vakıf Katılım hata döndürdü"


def records(root: ET.Element, marker: str) -> list[dict]:
    """Every element that has a ``marker`` child (one per movement / account), as a flat dict."""
    found = []
    for element in root.iter():
        if any(local(child.tag) == marker for child in element):
            found.append(_record(element))
    return found


def movement_from(row: dict) -> Optional[BankMovement]:
    key = (row.get("BusinessKey") or "").strip()
    amount = to_cents(row.get("Amount"))
    booked = parse_dt(row.get("SystemDate")) or parse_dt(row.get("TranDate"))
    if not key or amount is None or booked is None:
        return None
    if key.endswith(".0") or re.fullmatch(r"\d+\.0+", key):
        key = key.split(".", 1)[0]
    description = (row.get("Comment") or "").strip()
    sender = (row.get("SenderName") or "").strip() or parse_description(description).sender
    sender_account = (row.get("SenderAccountNumber") or "").replace(" ", "").upper()
    try:
        tran_type = int(row.get("TransactionType") or "")
    except ValueError:
        tran_type = None
    try:
        channel = int(row.get("ChannelId") or "")
    except ValueError:
        channel = None
    raw = {k: v for k, v in row.items() if v not in (None, "")}
    if tran_type in TRANSACTION_TYPES and not raw.get("TransactionTypeDescription"):
        raw["TransactionTypeDescription"] = TRANSACTION_TYPES[tran_type]
    if channel in CHANNELS:
        raw["ChannelName"] = CHANNELS[channel]
    return BankMovement(
        external_id=key, booked_at=booked, amount_cents=abs(amount),
        currency=currency_of(row.get("FEC"), row.get("FECName")),
        sender_name=sender or None, sender_iban=sender_account if IBAN.match(sender_account) else None,
        description=description, raw=raw,
    )


@register
class VakifKatilim(BankConnector):
    """Vakıf Katılım Müşteri İşlemleri Servisi (hesap bakiyesi ve hareketleri)."""
    key = "vakifkatilim"
    label = "Vakıf Katılım"
    credential_fields = {
        "customer_no": "Müşteri no",
        "username": "Web servis kullanıcı adı",
        "password": "Web servis şifresi",
        "service_url": "Servis adresi (boş bırakın: canlı)",
    }
    secret_fields = ("password",)
    optional_fields = ("service_url",)
    ready = True
    min_interval = timedelta(minutes=15)
    account_no_label = "Hesap ek no (AccountSuffix)"

    @property
    def url(self) -> str:
        url = str(self.credentials.get("service_url") or "").strip()
        if url.lower() == "test":
            return TEST_URL
        if url and not url.startswith("https://"):
            raise BankConnectorError("Servis adresi https:// ile başlamalı")
        return url or PROD_URL

    def _auth(self, account) -> list[tuple[str, str]]:
        customer = str(self.credentials.get("customer_no") or "").strip()
        username = str(self.credentials.get("username") or "").strip()
        password = str(self.credentials.get("password") or "")
        if not (customer and username and password):
            raise BankConnectorError("Vakıf Katılım web servis bilgileri eksik: müşteri no, kullanıcı adı ve şifre girin")
        if not customer.isdigit():
            raise BankConnectorError("Müşteri no yalnızca rakam olmalı")
        suffix = str(getattr(account, "account_no", "") or "").strip()
        if not suffix.isdigit():
            raise BankConnectorError(f"'{account.label}' hesabı için Hesap ek no (AccountSuffix) girin; yalnızca rakam")
        return [("AccountNumber", customer), ("AccountSuffix", str(int(suffix))), ("ExtUName", username),
                ("ExtUPassword", password)]

    async def _wsdl(self, client: httpx.AsyncClient) -> dict:
        cached = _wsdl_cache.get(self.url)
        if cached and time.monotonic() - cached[0] < WSDL_CACHE_SECONDS:
            return cached[1]
        info = {"service_ns": DEFAULT_SERVICE_NS, "contract_ns": {}, "actions": {}, "soap12": False}
        try:
            response = await client.get(f"{self.url}?singleWsdl")
            if response.status_code == 200 and b"definitions" in response.content[:2000]:
                info = parse_wsdl(response.content)
                _wsdl_cache[self.url] = (time.monotonic(), info)
        except (httpx.HTTPError, ET.ParseError):
            pass  # fall back to the WCF defaults
        return info

    def envelope(self, info: dict, method: str, contract: str, fields: list[tuple[str, str]]) -> tuple[bytes, dict]:
        service_ns = info.get("service_ns") or DEFAULT_SERVICE_NS
        contract_ns = info.get("contract_ns", {}).get(contract) or service_ns
        members = "".join(f"<c:{tag}>{escape(value)}</c:{tag}>" for tag, value in sorted(fields))
        soap_ns = SOAP12 if info.get("soap12") else SOAP11
        body = (f'<s:Envelope xmlns:s="{soap_ns}"><s:Body><m:{method} xmlns:m="{service_ns}">'
                f'<m:request xmlns:c="{contract_ns}">{members}</m:request></m:{method}></s:Body></s:Envelope>')
        action = info.get("actions", {}).get(method) or f"{service_ns.rstrip('/')}/{DEFAULT_CONTRACT}/{method}"
        if info.get("soap12"):
            headers = {"Content-Type": f'application/soap+xml; charset=utf-8; action="{action}"'}
        else:
            headers = {"Content-Type": "text/xml; charset=utf-8", "SOAPAction": f'"{action}"'}
        return body.encode("utf-8"), headers

    async def _call(self, client: httpx.AsyncClient, method: str, contract: str,
                    fields: list[tuple[str, str]]) -> ET.Element:
        info = await self._wsdl(client)
        body, headers = self.envelope(info, method, contract, fields)
        try:
            response = await client.post(self.url, content=body, headers=headers)
        except httpx.HTTPError as exc:
            raise BankConnectorError(f"Vakıf Katılım servisine ulaşılamadı ({type(exc).__name__}); sunucu IP'si "
                                     "bankada tanımlı mı?") from exc
        if response.status_code in (401, 403):
            raise BankConnectorError(ERRORS["NotAuthorized"])
        if response.status_code >= 400 and b"Fault" not in response.content:
            raise BankConnectorError(f"Vakıf Katılım servisi HTTP {response.status_code} döndürdü")
        return parse_soap(response.content)

    async def fetch(self, account, since: datetime, until: datetime) -> list[BankMovement]:
        auth = self._auth(account)
        movements: dict[str, BankMovement] = {}
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            for begin, end in windows(since, until):
                root = await self._call(client, "GetCustomerTransactionDetails", "CustomerTransactionRequest", [
                    *auth, ("BeginDate", fmt_dt(begin)), ("EndDate", fmt_dt(end)), ("DebitCreditCode", "Credit"),
                ])
                for row in records(root, "BusinessKey"):
                    movement = movement_from(row)
                    if movement:
                        movements.setdefault(movement.external_id, movement)
        return sorted(movements.values(), key=lambda m: m.booked_at)

    async def balance(self, account) -> dict:
        auth = self._auth(account)
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            root = await self._call(client, "GetAccountBalance", "AccountBalanceRequest", [
                *auth, ("BalanceDate", fmt_dt(datetime.now(TZ).date())),
            ])
        rows = records(root, "Balance")
        if not rows:
            raise BankConnectorError("Vakıf Katılım bakiye bilgisi döndürmedi; müşteri no ve hesap ek no'yu kontrol edin")
        row = rows[0]
        return {
            "iban": (row.get("IBAN") or "").replace(" ", "").upper() or None,
            "balance_cents": to_cents(row.get("Balance")),
            "blocked_cents": to_cents(row.get("WithHoldingAmount")),
            "currency": currency_of(row.get("FEC"), row.get("FECName")),
            "branch": row.get("BranchName") or None,
            "alias": row.get("AccountAlias") or None,
            "account_type": row.get("AccountType") or None,
            "active": (row.get("IsActive") or "1") == "1",
        }

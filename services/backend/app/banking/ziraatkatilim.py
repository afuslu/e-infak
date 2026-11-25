"""Ziraat Katılım "Hesap Hareketleri" service (Kullanıcı Kılavuzu + Sıkça Sorulan Sorular).

REST: POST JSON {associationCode, startDate, endDate} with HTTP Basic authentication. Rules from the documents:
- one query covers at most 7 days;
- the answer holds every account defined for the association (no per-account filter), so we pick ours from it;
- XML is converted to JSON by the gateway: one record comes as an object, several as an array, none as "" or nil;
- DekontNo (branch + date + reference) identifies a movement, but the legs of one slip share it, so the
  account, time and amount are part of our key;
- do not ask for a compressed answer (FAQ 11).
Not stated in the documents: whether the time part of the dates counts. Whole days are sent (00:00:00 - 23:59:59),
which is right either way.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Optional
from zoneinfo import ZoneInfo

import httpx

from app.banking import register
from app.banking.base import BankConnector, BankConnectorError, BankMovement
from app.banking.parsers import parse_description

TZ = ZoneInfo("Europe/Istanbul")
URL = "https://zkapigw.ziraatkatilim.com.tr:8443/api/accountService"
MAX_DAYS = 7
TIMEOUT = 60
CURRENCIES = {"TL": "TRY", "TRL": "TRY", "": "TRY"}


def as_list(value) -> list[dict]:
    """Object, array or empty/nil -> list of records."""
    items = value if isinstance(value, list) else [value]
    return [i for i in items if isinstance(i, dict) and any(isinstance(v, (dict, list)) or k[:1] != "@" and
                                                            k.split(":")[-1].lower() not in ("nil", "nill")
                                                            for k, v in i.items())]


def field(row: dict, name: str) -> str:
    value = row.get(name)
    return "" if value is None or isinstance(value, (dict, list)) else str(value).strip()


def to_cents(text: str) -> int:
    value = text.replace(" ", "")
    if "," in value and "." in value:  # thousands separators: the last mark is the decimal one
        value = value.replace("," if value.rfind(".") > value.rfind(",") else ".", "")
    try:
        return int((Decimal(value.replace(",", ".")) * 100).to_integral_value())
    except InvalidOperation as exc:
        raise BankConnectorError(f"Ziraat Katılım'ın gönderdiği tutar okunamadı: {text[:40]!r}") from exc


def parse_booked(day: str, clock: str) -> datetime:
    clock = clock if re.fullmatch(r"\d{1,2}:\d{2}:\d{2}", clock) else "00:00:00"
    try:
        parsed = datetime.strptime(f"{day} {clock}", "%d/%m/%Y %H:%M:%S")
    except ValueError as exc:
        raise BankConnectorError(f"Ziraat Katılım'ın gönderdiği tarih okunamadı: {day[:40]!r}") from exc
    return parsed.replace(tzinfo=TZ).astimezone(timezone.utc)


def day_windows(since: datetime, until: datetime) -> list[tuple[date, date]]:
    """Istanbul days covering [since, until], at most 7 days per piece, both ends inclusive."""
    start, last = since.astimezone(TZ).date(), until.astimezone(TZ).date()
    parts = []
    while start <= last:
        end = min(start + timedelta(days=MAX_DAYS - 1), last)
        parts.append((start, end))
        start = end + timedelta(days=1)
    return parts


def parse_accounts(payload) -> list[dict]:
    """[{HesapTanimi fields..., "_movements": [...]}]; raises for the bank's error codes."""
    node = payload
    for key in ("AccountReportV2Response", "AccountReportV2Result", "AccountDetail", "BankaHesaplariClassDetail"):
        node = node.get(key) if isinstance(node, dict) else None
    if not isinstance(node, dict):
        raise BankConnectorError(error_message(str(payload)))
    code, text = field(node, "HataKodu"), field(node, "HataAciklama")
    if code.strip("0"):
        raise BankConnectorError(error_message(f"{code} {text}"))
    holder = node.get("BankaHesaplari")
    details = as_list(holder.get("HesapBilgisiDetail")) if isinstance(holder, dict) else []
    if not details and text:
        raise BankConnectorError(error_message(text))
    accounts = []
    for detail in details:
        info = detail.get("HesapTanimi")
        if not isinstance(info, dict):
            continue  # a passive account comes as nil (FAQ 7)
        moves = detail.get("HesapHareketleri")
        rows = as_list(moves.get("HesapHareketiDetail")) if isinstance(moves, dict) else []
        accounts.append({**info, "_movements": rows})
    return accounts


def error_message(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if re.search(r"sorgulama yetkiniz", text, re.I):
        return ("Ziraat Katılım: bu kurum kodu için sorgulama yetkisi yok; kurum kodu ile kullanıcı adının "
                "eşleştiğini kontrol edin, doğruysa bankaya bildirin (Data Gönderim Formatı: Detaylı Format olmalı)")
    return f"Ziraat Katılım hata döndürdü: {text[:300]}" if text else "Ziraat Katılım boş cevap döndürdü"


def currency_of(info: dict) -> str:
    name = field(info, "HesapCinsi").upper()
    return CURRENCIES.get(name, name)


def number_parts(value: str) -> list[str]:
    return [p.lstrip("0") or "0" for p in re.findall(r"\d+", value)]


def pick_account(accounts: list[dict], account) -> dict:
    """The answer's account for ours: by account no ("ek no", "müşteri-ek no" or "şube-müşteri-ek no"), else the
    only one in the account's currency."""
    wanted = number_parts(str(getattr(account, "account_no", "") or ""))
    currency = getattr(account, "currency", None) or "TRY"
    found = [a for a in accounts if currency == "*" or currency_of(a) == currency]
    if wanted:
        found = [a for a in found if number_parts(field(a, "HesapNumarasi"))[-len(wanted):] == wanted]
    if len(found) == 1:
        return found[0]
    names = ", ".join(f"{field(a, 'HesapNumarasi')} ({currency_of(a)})" for a in accounts) or "hiç hesap yok"
    reason = "birden fazla hesap uyuyor" if found else "hesap bulunamadı"
    raise BankConnectorError(f"Ziraat Katılım cevabında '{account.label}' için {reason}; "
                             f"Hesap no alanını kontrol edin. Bankadaki hesaplar: {names}")


def movement_from(row: dict, info: dict) -> Optional[BankMovement]:
    amount = to_cents(field(row, "HareketTutari"))
    if amount <= 0:
        return None  # incoming only
    day, clock, slip = field(row, "Tarih"), field(row, "Saat"), field(row, "DekontNo")
    booked = parse_booked(day, clock)
    description = field(row, "Aciklamalar")
    number = "-".join(number_parts(field(info, "HesapNumarasi")))
    return BankMovement(
        external_id=f"{number}:{slip or field(row, 'ReferansNo')}:{booked:%Y%m%d%H%M%S}:{amount}",
        booked_at=booked, amount_cents=amount, currency=currency_of(info),
        sender_name=parse_description(description).sender, description=description,
        raw={k: v for k, v in row.items() if v not in (None, "") and not isinstance(v, (dict, list))},
    )


@register
class ZiraatKatilim(BankConnector):
    key = "ziraatkatilim"
    label = "Ziraat Katılım"
    credential_fields = {"association_code": "Kurum kodu (AssociationCode)", "username": "Web servis kullanıcı adı",
                         "password": "Web servis şifresi"}
    secret_fields = ("password",)
    ready = True
    account_no_label = "Hesap no (müşteri no-ek no ya da yalnızca ek no)"

    async def _query(self, client: httpx.AsyncClient, start: date, end: date) -> list[dict]:
        code = str(self.credentials.get("association_code") or "").strip()
        username = str(self.credentials.get("username") or "").strip()
        password = str(self.credentials.get("password") or "")
        if not (code and username and password):
            raise BankConnectorError("Ziraat Katılım web servis bilgileri eksik: kurum kodu, kullanıcı adı ve şifre girin")
        try:
            response = await client.post(
                URL, auth=httpx.BasicAuth(username.encode(), password.encode()),
                headers={"Accept": "application/json", "Accept-Encoding": "identity"},
                json={"associationCode": code, "startDate": f"{start}T00:00:00", "endDate": f"{end}T23:59:59"})
        except httpx.HTTPError as exc:
            raise BankConnectorError(f"Ziraat Katılım servisine ulaşılamadı ({type(exc).__name__}); sunucu IP'si "
                                     "(31.97.159.228) bankada tanımlı mı?") from exc
        if response.status_code == 401:
            raise BankConnectorError("Ziraat Katılım kullanıcı adı ya da şifre hatalı (401)")
        if response.status_code == 403:
            raise BankConnectorError("Ziraat Katılım erişimi reddetti (403); sunucu IP'si bankada tanımlı mı?")
        try:
            payload = response.json()
        except ValueError:
            payload = None
        if response.status_code >= 400:
            detail = re.sub(r"<[^>]+>", " ", response.text)
            raise BankConnectorError(error_message(f"HTTP {response.status_code} {detail}"))
        if payload is None:
            raise BankConnectorError("Ziraat Katılım'ın cevabı okunamadı (JSON değil)")
        return parse_accounts(payload)

    async def fetch(self, account, since: datetime, until: datetime) -> list[BankMovement]:
        movements: dict[str, BankMovement] = {}
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            for start, end in day_windows(since, until):
                info = pick_account(await self._query(client, start, end), account)
                for row in info["_movements"]:
                    movement = movement_from(row, info)
                    if movement:
                        movements.setdefault(movement.external_id, movement)
        return sorted(movements.values(), key=lambda m: m.booked_at)

    async def _today(self) -> list[dict]:
        today = datetime.now(TZ).date()
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            return await self._query(client, today, today)

    async def balance(self, account) -> dict:
        info = pick_account(await self._today(), account)
        return {
            "iban": None,  # the service does not return it
            "balance_cents": to_cents(field(info, "Bakiye") or "0"),
            "blocked_cents": to_cents(field(info, "BlokeMeblag") or "0"),
            "currency": currency_of(info), "branch": field(info, "SubeAdi") or None, "alias": None,
            "account_type": field(info, "HesapTuru") or None, "customer_name": field(info, "HesapAdi") or None,
            "active": True,
        }

    async def accounts(self) -> list[dict]:
        return [{"suffix": field(a, "HesapNumarasi"), "iban": None, "alias": field(a, "HesapAdi") or None,
                 "currency": currency_of(a), "balance_cents": to_cents(field(a, "Bakiye") or "0")}
                for a in await self._today()]

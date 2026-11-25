"""Ziraat Katılım Hesap Hareketleri connector, with the bank mocked (samples follow the bank's guide)."""
import base64
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import httpx
import pytest

from app.banking import CONNECTORS, BankConnectorError
from app.banking import ziraatkatilim as zk

CREDS = {"association_code": "1_KURUM", "username": "kullanıcı", "password": "şif:re"}
NOW = datetime(2026, 11, 25, 9, 0, tzinfo=timezone.utc)
ACCOUNT = SimpleNamespace(label="ZK", account_no="2-1", currency="TRY")


def move(amount, slip="12020052771", clock="11:36:57", text="Gelen FAST Gönderen-ALİ VELİ TÜRKİYE EMLAK KATILIM BANKASI A.Ş. zekat"):
    return {"ReferansNo": "7", "Saat": clock, "DekontNo": slip, "Tarih": "27/05/2020", "Aciklamalar": text,
            "HareketTutari": amount, "EkBilgi1": "", "SiraNo": "1", "KarsiHesapVKNo": "0"}


def detail(moves, number="1-2-1", currency="TRY"):
    return {"HesapTanimi": {"HesapNumarasi": number, "HesapCinsi": currency, "Bakiye": "58462549.34",
                            "BlokeMeblag": "0.00", "HesapAdi": "TEST", "SubeAdi": "EMİNÖNÜ", "HesapTuru": "CARIHSP"},
            "HesapHareketleri": moves}


def answer(details, code="", text=""):
    return {"AccountReportV2Response": {"AccountReportV2Result": {"AccountDetail": {"BankaHesaplariClassDetail": {
        "BankaHesaplari": {"HesapBilgisiDetail": details} if details else "", "HataKodu": code, "HataAciklama": text}}}}}


@pytest.fixture
def bank(monkeypatch):
    state = SimpleNamespace(requests=[], reply=lambda: httpx.Response(200, json=answer(detail(""))))

    def handler(request):
        state.requests.append(request)
        return state.reply()

    real = httpx.AsyncClient
    monkeypatch.setattr(zk.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    return state


def connector():
    return CONNECTORS["ziraatkatilim"](CREDS)


async def test_single_object_request_and_movement(bank):
    bank.reply = lambda: httpx.Response(200, json=answer(detail({"HesapHareketiDetail": move("1035.07")})))
    [m] = await connector().fetch(ACCOUNT, NOW - timedelta(days=2), NOW)
    [request] = bank.requests
    assert request.method == "POST" and str(request.url) == zk.URL
    assert base64.b64decode(request.headers["authorization"].split()[1]).decode() == "kullanıcı:şif:re"
    assert request.headers["accept-encoding"] == "identity"
    assert json.loads(request.content) == {"associationCode": "1_KURUM", "startDate": "2026-11-23T00:00:00",
                                           "endDate": "2026-11-25T23:59:59"}
    assert m.amount_cents == 103507 and m.currency == "TRY" and m.sender_name == "ALİ VELİ"
    assert m.booked_at == datetime(2020, 5, 27, 8, 36, 57, tzinfo=timezone.utc)


async def test_arrays_several_accounts_outgoing_and_repeats(bank):
    rows = [move("-35.00"), move("35.00"), move("35.00"), move("10.00", clock="11:36:58")]
    bank.reply = lambda: httpx.Response(200, json=answer([
        detail({"HesapHareketiDetail": rows}), detail("", "1-2-5", "EUR"), {"HesapTanimi": {"nil": "true"}},
        detail({"HesapHareketiDetail": move("99.00")}, "1-2-11")]))
    got = await connector().fetch(ACCOUNT, NOW, NOW)
    assert [m.amount_cents for m in got] == [3500, 1000]
    assert (await connector().balance(ACCOUNT))["balance_cents"] == 5846254934
    assert "1-2-11" in [a["suffix"] for a in await connector().accounts()]
    with pytest.raises(BankConnectorError, match="birden fazla"):
        await connector().fetch(SimpleNamespace(label="ZK", account_no="", currency="TRY"), NOW, NOW)
    with pytest.raises(BankConnectorError, match="bulunamadı.*1-2-1 "):
        await connector().fetch(SimpleNamespace(label="ZK", account_no="77", currency="TRY"), NOW, NOW)


@pytest.mark.parametrize("empty", ["", None, {"nil": "true"}, {"HesapHareketiDetail": {"@nil": "true"}},
                                   {"HesapHareketiDetail": ""}])
async def test_no_movements(bank, empty):
    bank.reply = lambda: httpx.Response(200, json=answer(detail(empty)))
    assert await connector().fetch(ACCOUNT, NOW, NOW) == []


def test_windows_cover_every_day_at_most_seven():
    parts = zk.day_windows(NOW - timedelta(days=20), NOW)
    assert [(e - s).days + 1 for s, e in parts] == [7, 7, 7]
    assert all(b[0] - a[1] == timedelta(days=1) for a, b in zip(parts, parts[1:]))


@pytest.mark.parametrize("reply,expected", [
    (httpx.Response(401), "401"), (httpx.Response(403), "IP"),
    (httpx.Response(400, text="Bad Request"), "HTTP 400"), (httpx.Response(200, text="<html>"), "JSON"),
    (httpx.Response(200, json=answer(None, "5", "X kurumu için sorgulama yetkiniz bulunmamaktadır")), "Detaylı Format"),
    (httpx.Response(200, json={"hata": "beklenmeyen"}), "beklenmeyen"),
    (httpx.Response(200, json=answer(detail({"HesapHareketiDetail": move("abc")}))), "tutar"),
])
async def test_errors(bank, reply, expected):
    bank.reply = lambda: reply
    with pytest.raises(BankConnectorError, match=expected):
        await connector().fetch(ACCOUNT, NOW, NOW)


async def test_missing_credentials():
    with pytest.raises(BankConnectorError, match="eksik"):
        await CONNECTORS["ziraatkatilim"]({}).fetch(ACCOUNT, NOW, NOW)

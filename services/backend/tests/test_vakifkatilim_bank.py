"""Vakıf Katılım Müşteri İşlemleri Servisi connector (bank movements), with the bank mocked."""
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import httpx
import pytest
from sqlalchemy import select

from app.banking import CONNECTORS, BankConnectorError
from app.banking import vakifkatilim as vk
from app.banking.sync import sync_account, sync_all, too_soon
from app.models.automation import BankAccount, BankTransaction
from app.models.organization import Organization

CREDS = {"customer_no": "44444444", "username": "kullanici", "password": "s<cr&t"}
WSDL = b"""<?xml version="1.0"?>
<wsdl:definitions targetNamespace="http://boa.example/integration" xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" xmlns:xs="http://www.w3.org/2001/XMLSchema">
 <wsdl:types>
  <xs:schema targetNamespace="http://schemas.datacontract.org/2004/07/BOA.Types.CustomerTransaction">
   <xs:complexType name="CustomerTransactionRequest"/><xs:complexType name="AccountBalanceRequest"/>
  </xs:schema>
  <xs:schema targetNamespace="http://schemas.datacontract.org/2004/07/BOA.Integration.Base">
   <xs:complexType name="RequestModelBase"/>
  </xs:schema>
 </wsdl:types>
 <wsdl:service name="S"><wsdl:port name="p" binding="b">
  <soap:address location="https://internal.host/X/CustomerTransactionService.svc/Basic"/></wsdl:port></wsdl:service>
 <wsdl:binding name="b">
  <wsdl:operation name="GetCustomerTransactionDetails">
   <soap:operation soapAction="http://boa.example/integration/ICustomerTransactionService/GetCustomerTransactionDetails"/>
  </wsdl:operation>
  <wsdl:operation name="GetAccountBalance">
   <soap:operation soapAction="http://boa.example/integration/ICustomerTransactionService/GetAccountBalance"/>
  </wsdl:operation>
 </wsdl:binding>
</wsdl:definitions>"""


def details_response(*rows: dict) -> bytes:
    items = "".join(
        "<a:CustomerTransactionDetailContract>" + "".join(
            f'<a:{k} i:nil="true"/>' if v is None else f"<a:{k}>{v}</a:{k}>" for k, v in row.items()
        ) + "</a:CustomerTransactionDetailContract>" for row in rows)
    return (
        '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>'
        '<GetCustomerTransactionDetailsResponse xmlns="http://boa.example/integration">'
        '<GetCustomerTransactionDetailsResult xmlns:a="http://schemas.datacontract.org/2004/07/X" '
        'xmlns:i="http://www.w3.org/2001/XMLSchema-instance">'
        f"<a:Value>{items}</a:Value></GetCustomerTransactionDetailsResult>"
        "</GetCustomerTransactionDetailsResponse></s:Body></s:Envelope>"
    ).encode()


def fault(text: str) -> bytes:
    return ('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault>'
            f"<faultcode>s:Client</faultcode><faultstring>{text}</faultstring></s:Fault></s:Body></s:Envelope>").encode()


ROW = {
    "BusinessKey": "1234567890.0", "TranDate": "2026-11-19T00:00:00", "Amount": "150.50", "Comment":
    "Amir= ALİ GÜNDEM Aciklama= gazze", "ChannelId": "2", "FEC": "0", "FECName": "TL", "TranBranchId": "1",
    "TranBranchName": "Merkez", "SystemDate": "2026-11-19T14:05:30.123", "SenderTaxNumber": "11111111111",
    "SenderName": None, "SenderAccountNumber": "TR330006100519786457841326", "SenderPhoneNumber": None,
    "SenderBankCode": "0210", "SenderBranchCode": "1", "TransactionTypeDescription": None, "TransactionType": "1",
}


class Bank:
    """httpx mock: serves the WSDL and records SOAP calls."""

    def __init__(self, *responses: bytes, wsdl: bytes = WSDL):
        self.responses = list(responses)
        self.wsdl = wsdl
        self.calls: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return httpx.Response(200, content=self.wsdl) if self.wsdl else httpx.Response(404)
        self.calls.append(request)
        body = self.responses.pop(0) if len(self.responses) > 1 else self.responses[0]
        return httpx.Response(500 if b"Fault" in body else 200, content=body)


@pytest.fixture
def bank(monkeypatch):
    vk._wsdl_cache.clear()
    holder = {}

    def install(*responses, **kwargs):
        mock = Bank(*responses, **kwargs)
        transport = httpx.MockTransport(mock)
        real = httpx.AsyncClient

        def client(*args, **kw):
            kw.pop("transport", None)
            return real(*args, transport=transport, **kw)

        monkeypatch.setattr(vk.httpx, "AsyncClient", client)
        holder["bank"] = mock
        return mock

    yield install
    vk._wsdl_cache.clear()


def account(**kw):
    return SimpleNamespace(label="Ana hesap", account_no="1", iban=None, **kw)


def test_windows_split_into_31_days():
    since = datetime(2026, 1, 1, tzinfo=timezone.utc)
    parts = vk.windows(since, since + timedelta(days=70))
    assert len(parts) == 3
    assert all(end - start < timedelta(days=31) for start, end in parts)
    assert parts[0][0] == since and parts[-1][1] == since + timedelta(days=70)
    assert vk.windows(since, since - timedelta(days=1)) == []


def test_movement_mapping_and_istanbul_time():
    movement = vk.movement_from(ROW)
    assert movement.external_id == "1234567890"
    assert movement.amount_cents == 15050 and movement.currency == "TRY"
    assert movement.booked_at == datetime(2026, 11, 19, 11, 5, 30, 123000, tzinfo=timezone.utc)
    assert movement.sender_name == "ALİ GÜNDEM"  # from the "Amir=" description when SenderName is empty
    assert movement.sender_iban == "TR330006100519786457841326"
    assert movement.raw["TransactionTypeDescription"] == "Gelen EFT" and movement.raw["ChannelName"] == "İnternet"
    assert "SenderName" not in movement.raw
    named = vk.movement_from({**ROW, "SenderName": "VELİ KARA", "SenderAccountNumber": "12345", "Amount": "-20"})
    assert named.sender_name == "VELİ KARA" and named.sender_iban is None and named.amount_cents == 2000
    assert vk.movement_from({**ROW, "BusinessKey": ""}) is None


async def test_fetch_builds_request_from_wsdl_and_reads_movements(bank):
    mock = bank(details_response(ROW, {**ROW, "BusinessKey": "2", "Amount": "10", "SenderName": "VELİ KARA"}))
    since = datetime(2026, 11, 1, tzinfo=timezone.utc)
    movements = await CONNECTORS["vakifkatilim"](CREDS).fetch(account(), since, since + timedelta(days=5))
    assert {m.external_id for m in movements} == {"1234567890", "2"}
    call = mock.calls[0]
    assert str(call.url) == vk.PROD_URL + "/Basic"  # the WSDL's soap:address path, on our host
    assert call.headers["SOAPAction"] == '"http://boa.example/integration/ICustomerTransactionService/GetCustomerTransactionDetails"'
    body = call.content.decode()
    assert 'xmlns:c="http://schemas.datacontract.org/2004/07/BOA.Types.CustomerTransaction"' in body
    assert 'xmlns:b="http://schemas.datacontract.org/2004/07/BOA.Integration.Base"' in body
    assert "<b:ExtUPassword>s&lt;cr&amp;t</b:ExtUPassword>" in body
    assert "<c:DebitCreditCode>Credit</c:DebitCreditCode>" in body
    assert "<c:BeginDate>2026-11-01T03:00:00</c:BeginDate>" in body  # Istanbul local time
    # WCF order: base-class members first, then the request's own members, each alphabetical
    tags = ["b:ExtUName", "b:ExtUPassword", "c:AccountNumber", "c:AccountSuffix", "c:BeginDate", "c:DebitCreditCode",
            "c:EndDate"]
    assert [body.index(f"<{t}>") for t in tags] == sorted(body.index(f"<{t}>") for t in tags)


async def test_fetch_splits_long_ranges_and_dedupes(bank):
    mock = bank(details_response(ROW))
    since = datetime(2026, 9, 1, tzinfo=timezone.utc)
    movements = await CONNECTORS["vakifkatilim"](CREDS).fetch(account(), since, since + timedelta(days=45))
    assert len(mock.calls) == 2 and len(movements) == 1


async def test_without_wsdl_uses_wcf_defaults(bank):
    mock = bank(details_response(ROW), wsdl=b"")
    connector = CONNECTORS["vakifkatilim"]({**CREDS, "service_url": "test"})
    await connector.fetch(account(), datetime(2026, 11, 1, tzinfo=timezone.utc), datetime(2026, 11, 2, tzinfo=timezone.utc))
    assert str(mock.calls[0].url) == vk.TEST_URL + "/Basic"
    assert mock.calls[0].headers["SOAPAction"] == (
        '"http://boa.net/BOA.Integration.CustomerTransaction/CustomerTransactionService/ICustomerTransactionService/'
        'GetCustomerTransactionDetails"')


@pytest.mark.parametrize("text, expected", [
    ("70009 Kullanıcı Doğrulanamadı.", "şifresi yanlış"),
    ("NotAuthorized: Bu İşlemi Gerçekleştirmeye Yetkiniz Yok.", "31.97.159.228"),
    ("279438 44444444 nolu müşteri bilgilerini sorgulama yetkiniz bulunmamaktadır", "Müşteri no"),
    ("279437", "31 günlük"),
])
async def test_bank_errors_become_turkish_messages(bank, text, expected):
    bank(fault(text))
    with pytest.raises(BankConnectorError, match=expected):
        await CONNECTORS["vakifkatilim"](CREDS).fetch(account(), datetime(2026, 11, 1, tzinfo=timezone.utc),
                                                      datetime(2026, 11, 2, tzinfo=timezone.utc))


async def test_missing_credentials_and_suffix():
    connector = CONNECTORS["vakifkatilim"]
    with pytest.raises(BankConnectorError, match="eksik"):
        await connector({}).fetch(account(), datetime.now(timezone.utc), datetime.now(timezone.utc))
    with pytest.raises(BankConnectorError, match="Hesap ek no"):
        await connector(CREDS).fetch(SimpleNamespace(label="X", account_no=None), datetime.now(timezone.utc),
                                     datetime.now(timezone.utc))


async def test_balance(bank):
    bank(b'<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><R xmlns:a="x">'
         b"<a:AccountNumber>44444444</a:AccountNumber><a:AccountSuffix>1</a:AccountSuffix>"
         b"<a:BranchName>Eski\xc5\x9fehir</a:BranchName><a:Balance>1234.56</a:Balance><a:WithHoldingAmount>0</a:WithHoldingAmount>"
         b"<a:FEC>0</a:FEC><a:FECName>TL</a:FECName><a:IBAN>TR33 0006 1005 1978 6457 8413 26</a:IBAN>"
         b"<a:IsActive>1</a:IsActive></R></s:Body></s:Envelope>")
    info = await CONNECTORS["vakifkatilim"](CREDS).balance(account())
    assert info["iban"] == "TR330006100519786457841326" and info["balance_cents"] == 123456
    assert info["branch"] == "Eskişehir" and info["active"] is True


async def _org(db):
    slug = f"o-{uuid.uuid4().hex[:8]}"
    org = Organization(slug=slug, name="Test", legal_name=slug, email=f"{slug}@example.com",
                       primary_domain=f"{slug}.example.com", plan="ileri", enabled_addons=[], extra_user_seats=0)
    db.add(org)
    await db.flush()
    return org


async def test_sync_respects_15_minutes_and_stores_once(db_session, bank, monkeypatch):
    from app.services import tenant_credentials

    async def creds(db, org_id, key):
        return CREDS

    monkeypatch.setattr(tenant_credentials, "get_credentials", creds)
    bank(details_response(ROW))
    org = await _org(db_session)
    acc = BankAccount(organization_id=org.id, bank_key="vakifkatilim", label="VK", account_no="1", currency="TRY")
    db_session.add(acc)
    await db_session.flush()
    now = datetime(2026, 11, 19, 12, 0, tzinfo=timezone.utc)
    result = await sync_account(db_session, acc, until=now)
    assert result.get("new") == 1, result
    assert too_soon(acc, now + timedelta(minutes=5)) is not None
    assert too_soon(acc, now + timedelta(minutes=16)) is None
    again = await sync_account(db_session, acc, until=now + timedelta(minutes=20))
    assert again["new"] == 0
    rows = (await db_session.execute(select(BankTransaction).where(BankTransaction.organization_id == org.id))).scalars().all()
    assert [r.external_id for r in rows] == ["vakifkatilim:1234567890"]
    assert rows[0].sender_name == "ALİ GÜNDEM" and rows[0].raw_data["sender_iban"] == "TR330006100519786457841326"


async def test_sync_all_skips_recently_synced(db_session, bank, monkeypatch):
    mock = bank(details_response(ROW))
    org = await _org(db_session)
    acc = BankAccount(organization_id=org.id, bank_key="vakifkatilim", label="VK", account_no="1", currency="TRY",
                      last_synced_at=datetime.now(timezone.utc) - timedelta(minutes=3))
    db_session.add(acc)
    await db_session.flush()
    results = await sync_all(db_session)
    assert str(acc.id) not in {r["account_id"] for r in results}
    assert mock.calls == []


def test_masked_secret_echo_keeps_stored_password():
    from app.services.tenant_credentials import clean_payload, masked

    stored = {**CREDS}
    echo = masked("bank:vakifkatilim", stored)
    assert echo["password"].startswith("••••")
    saved = clean_payload("bank:vakifkatilim", {**echo, "username": "yeni"}, previous=stored)
    assert saved["password"] == CREDS["password"] and saved["username"] == "yeni"


# Verbatim shape of the production answer to an unknown user (2026-11-19, from 31.97.159.228).
NOT_AUTHORIZED = (
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><GetAccountListResponse '
    'xmlns="http://boa.net/BOA.Integration.CustomerTransaction/CustomerTransactionService"><GetAccountListResult '
    'xmlns:a="http://schemas.datacontract.org/2004/07/BOA.Integration.Base" '
    'xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><a:Results><a:Result><a:ErrorCode>NotAuthorized</a:ErrorCode>'
    '<a:ErrorMessage>Bu \u0130\u015flemi Ger\u00e7ekle\u015ftirmeye Yetkiniz Yok.</a:ErrorMessage><a:IsFriendly>true'
    '</a:IsFriendly></a:Result></a:Results><a:ErrorCode i:nil="true"/><a:ErrorMessage i:nil="true"/>'
    '</GetAccountListResult></GetAccountListResponse></s:Body></s:Envelope>'
).encode()


async def test_real_not_authorized_answer_without_success_field(bank):
    bank(NOT_AUTHORIZED)
    with pytest.raises(BankConnectorError, match="31.97.159.228"):
        await CONNECTORS["vakifkatilim"](CREDS).accounts()


async def test_success_with_information_result_is_not_an_error(bank):
    bank(details_response(ROW).replace(
        b"<a:Value>", b"<a:Results><a:Result><a:ErrorCode>I1</a:ErrorCode><a:Severity>Information</a:Severity>"
                      b"</a:Result></a:Results><a:Success>true</a:Success><a:Value>"))
    movements = await CONNECTORS["vakifkatilim"](CREDS).fetch(
        account(), datetime(2026, 11, 1, tzinfo=timezone.utc), datetime(2026, 11, 2, tzinfo=timezone.utc))
    assert len(movements) == 1


async def test_account_list(bank):
    mock = bank(
        b'<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><GetAccountListResponse><GetAccountListResult'
        b' xmlns:a="x" xmlns:b="y"><a:Success>true</a:Success><a:Value>'
        b"<b:AccountListResponseModel><b:AccountAlias>Ba\xc4\x9f\xc4\xb1\xc5\x9f</b:AccountAlias><b:AccountNumber>44444444</b:AccountNumber>"
        b"<b:AccountSuffix>1</b:AccountSuffix><b:Balance>10.00</b:Balance><b:FEC>0</b:FEC><b:FECName>TL</b:FECName>"
        b"<b:IBAN>TR330006100519786457841326</b:IBAN><b:IsActive>1</b:IsActive></b:AccountListResponseModel>"
        b"<b:AccountListResponseModel><b:AccountSuffix>2</b:AccountSuffix><b:Balance>0</b:Balance><b:FECName>USD</b:FECName>"
        b"<b:IBAN>TR330006100519786457841327</b:IBAN></b:AccountListResponseModel>"
        b"</a:Value></GetAccountListResult></GetAccountListResponse></s:Body></s:Envelope>")
    accounts = await CONNECTORS["vakifkatilim"](CREDS).accounts()
    assert [(a["suffix"], a["iban"], a["currency"]) for a in accounts] == [
        ("1", "TR330006100519786457841326", "TRY"), ("2", "TR330006100519786457841327", "USD")]
    assert "AccountSuffix" not in mock.calls[0].content.decode()

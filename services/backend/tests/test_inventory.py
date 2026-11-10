import uuid
from datetime import date
from decimal import Decimal

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from starlette.requests import Request

from app.api.v1 import accounting as acc
from app.api.v1 import inventory as inv
from app.models.donation import Donor
from app.models.organization import Organization
from app.models.user import User, UserRole


def _request(org, method="GET"):
    request = Request({"type": "http", "method": method, "path": "/api/v1/admin-features/acc/x", "headers": [], "query_string": b"",
                       "client": ("1.2.3.4", 1)})
    request.state.organization_id = str(org.id)
    request.state.organization = org
    return request


async def _setup(db):
    slug = f"o-{uuid.uuid4().hex[:8]}"
    org = Organization(slug=slug, name="Test Derneği", legal_name=slug, email=f"{slug}@example.com",
                       primary_domain=f"{slug}.example.com", plan="ileri", enabled_addons=[], extra_user_seats=0)
    db.add(org)
    await db.flush()
    admin = User(organization_id=org.id, email=f"{slug}@example.com", hashed_password="x",
                 first_name="Ayşe", last_name="Y", role=UserRole.STK_ADMIN)
    db.add(admin)
    await db.flush()
    return org, admin


async def _qty(org, admin, db, name):
    return next(i for i in await inv.list_items(_request(org), db, admin) if i["name"] == name)


async def test_stock_in_kind_aid_transfer_and_guards(db_session):
    org, admin = await _setup(db_session)
    r = _request(org, "POST")
    merkez = await inv.create_warehouse(r, inv.WarehouseIn(name="Merkez Depo"), db_session, admin)
    sube = await inv.create_warehouse(r, inv.WarehouseIn(name="Şube Depo"), db_session, admin)
    un = await inv.create_item(r, inv.ItemIn(name="Un 5 kg", unit="paket", min_qty=Decimal(10), unit_value_cents=15_000), db_session, admin)
    donor = Donor(organization_id=org.id, first_name="Hayırsever", last_name="Ahmet")
    db_session.add(donor)
    await db_session.flush()

    with pytest.raises(ValidationError):  # ayni bağış bağışçısız olamaz
        inv.MoveIn(item_id=un["id"], warehouse_id=merkez["id"], direction="in", qty=Decimal(5), kind="in_kind")
    await inv.create_move(r, inv.MoveIn(item_id=un["id"], warehouse_id=merkez["id"], direction="in", qty=Decimal(40),
                                        kind="in_kind", donor_id=donor.id), db_session, admin)
    with pytest.raises(HTTPException) as exc:  # stok eksiye düşmez
        await inv.create_move(r, inv.MoveIn(item_id=un["id"], warehouse_id=merkez["id"], direction="out", qty=Decimal(41),
                                            kind="aid_out"), db_session, admin)
    assert exc.value.status_code == 409
    await inv.transfer_stock(r, inv.TransferIn(item_id=un["id"], from_warehouse_id=merkez["id"], to_warehouse_id=sube["id"],
                                               qty=Decimal(15)), db_session, admin)
    out = await inv.create_move(r, inv.MoveIn(item_id=un["id"], warehouse_id=sube["id"], direction="out", qty=Decimal("14.5"),
                                              kind="aid_out", note="Ramazan kolisi"), db_session, admin)
    item = await _qty(org, admin, db_session, "Un 5 kg")
    assert item["qty"] == 25.5 and not item["low"]
    assert {w["warehouse"]: w["qty"] for w in item["by_warehouse"]} == {"Merkez Depo": 25.0, "Şube Depo": 0.5}
    assert item["value_cents"] == 382_500

    report = await inv.in_kind_report(_request(org), None, None, db_session, admin)
    assert report["total_value_cents"] == 600_000 and report["by_donor"][0]["donor"] == "Hayırsever Ahmet"

    await inv.delete_move(r, uuid.UUID(out["id"]), db_session, admin)
    assert (await _qty(org, admin, db_session, "Un 5 kg"))["qty"] == 40


async def test_invoices_stock_payment_and_counterparty_ledger(db_session):
    org, admin = await _setup(db_session)
    r = _request(org, "POST")
    depo = await inv.create_warehouse(r, inv.WarehouseIn(name="Depo"), db_session, admin)
    battaniye = await inv.create_item(r, inv.ItemIn(name="Battaniye", min_qty=Decimal(50)), db_session, admin)
    banka = await acc.create_account(r, acc.AccountIn(name="Banka", kind="bank", opening_balance_cents=10_000_000), db_session, admin)
    toptanci = await acc.create_counterparty(r, acc.CounterpartyIn(name="Toptancı AŞ"), db_session, admin)

    with pytest.raises(HTTPException):  # stoklu satır depo ister
        await inv.create_invoice(r, inv.InvoiceIn(number="A-1", counterparty_id=toptanci["id"], lines=[
            inv.LineIn(description="Battaniye", item_id=battaniye["id"], qty=Decimal(10), unit_price_cents=20_000)]), db_session, admin)
    invoice = await inv.create_invoice(r, inv.InvoiceIn(number="A-1", counterparty_id=toptanci["id"], warehouse_id=depo["id"], lines=[
        inv.LineIn(description="Battaniye", item_id=battaniye["id"], qty=Decimal(30), unit_price_cents=20_000, vat_rate=20),
        inv.LineIn(description="Nakliye", unit_price_cents=50_000, vat_rate=20),
    ]), db_session, admin)
    assert (invoice["subtotal_cents"], invoice["vat_cents"], invoice["total_cents"]) == (650_000, 130_000, 780_000)
    item = await _qty(org, admin, db_session, "Battaniye")
    assert item["qty"] == 30 and item["low"]
    with pytest.raises(HTTPException):  # aynı numara ikinci kez girilemez
        await inv.create_invoice(r, inv.InvoiceIn(number="A-1", counterparty_id=toptanci["id"], lines=[
            inv.LineIn(description="x", unit_price_cents=1)]), db_session, admin)

    iid = uuid.UUID(invoice["id"])
    await inv.pay_invoice(r, iid, inv.InvoicePayIn(account_id=banka["id"], amount_cents=300_000), db_session, admin)
    partial = await inv.get_invoice(_request(org), iid, db_session, admin)
    assert (partial["payment_status"], partial["remaining_cents"]) == ("partial", 480_000)
    with pytest.raises(HTTPException):  # kalandan fazla ödenemez
        await inv.pay_invoice(r, iid, inv.InvoicePayIn(account_id=banka["id"], amount_cents=500_000), db_session, admin)
    with pytest.raises(HTTPException):  # ödemesi olan fatura iptal edilemez
        await inv.cancel_invoice(r, iid, db_session, admin)

    # Cari defter: fatura 7.800 alacak, 3.000 ödeme -> kurum 4.800 borçlu; gider + ciro edilen çek de işlenir.
    card = await acc.create_card(r, acc.CardIn(name="Kırtasiye"), db_session, admin)
    await acc.create_expense(r, acc.ExpenseIn(expense_card_id=card["id"], amount_cents=20_000, counterparty_id=toptanci["id"]),
                             db_session, admin)
    bagisci = await acc.create_counterparty(r, acc.CounterpartyIn(name="Firma Bağışçı", kind="customer"), db_session, admin)
    cheque = await acc.create_cheque(r, acc.ChequeIn(number="C-9", counterparty_id=bagisci["id"], amount_cents=100_000,
                                                     due_date=date(2030, 1, 1)), db_session, admin)
    await acc.change_cheque_status(r, uuid.UUID(cheque["id"]), acc.ChequeStatusIn(status="endorsed", counterparty_id=toptanci["id"]),
                                   db_session, admin)
    book = await inv.counterparty_ledger(_request(org), uuid.UUID(toptanci["id"]), "TRY", db_session, admin)
    assert book["balance_cents"] == 780_000 + 20_000 - 300_000 - 100_000 and book["status"] == "Kurum borçlu"
    assert [row["type"] for row in book["rows"]].count("Ciro edilen çek") == 1

    # Ödemesi olmayan satış faturası iptal edilince stok geri gelir.
    musteri = await acc.create_counterparty(r, acc.CounterpartyIn(name="Müşteri", kind="customer"), db_session, admin)
    sale = await inv.create_invoice(r, inv.InvoiceIn(kind="sales", number="S-1", counterparty_id=musteri["id"], warehouse_id=depo["id"],
                                                     lines=[inv.LineIn(description="Battaniye", item_id=battaniye["id"],
                                                                       qty=Decimal(5), unit_price_cents=25_000, vat_rate=0)]),
                                     db_session, admin)
    assert (await _qty(org, admin, db_session, "Battaniye"))["qty"] == 25
    assert (await inv.counterparty_ledger(_request(org), uuid.UUID(musteri["id"]), "TRY", db_session, admin))["balance_cents"] == -125_000
    await inv.cancel_invoice(r, uuid.UUID(sale["id"]), db_session, admin)
    assert (await _qty(org, admin, db_session, "Battaniye"))["qty"] == 30
    unpaid = await inv.list_invoices(_request(org), None, None, True, db_session, admin)
    assert [i["number"] for i in unpaid] == ["A-1"]

import uuid
from datetime import date, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from starlette.requests import Request

from app.api.deps import require_admin_route_feature
from app.api.v1 import accounting as acc
from app.api.v1 import crm
from app.models.accounting import LedgerEntry, SalaryAdvance
from app.models.campaign import Campaign
from app.models.organization import Organization
from app.models.user import User, UserRole


def _request(org, method="GET", path="/api/v1/admin-features/acc/x"):
    request = Request({"type": "http", "method": method, "path": path, "headers": [], "query_string": b"", "client": ("1.2.3.4", 1)})
    request.state.organization_id = str(org.id)
    request.state.organization = org
    return request


async def _setup(db, plan="ileri"):
    slug = f"o-{uuid.uuid4().hex[:8]}"
    org = Organization(slug=slug, name="Test Derneği", legal_name=slug, email=f"{slug}@example.com",
                       primary_domain=f"{slug}.example.com", plan=plan, enabled_addons=[], extra_user_seats=0)
    db.add(org)
    await db.flush()
    admin = User(organization_id=org.id, email=f"{slug}@example.com", hashed_password="x",
                 first_name="Ayşe", last_name="Y", role=UserRole.STK_ADMIN)
    campaign = Campaign(organization_id=org.id, slug="genel", title="Genel", summary="s", target_cents=0)
    db.add_all([admin, campaign])
    await db.flush()
    return org, admin, campaign


async def _balances(org, admin, db):
    return {a["name"]: a["balance_cents"] for a in await acc.list_accounts(_request(org), db, admin)}


async def test_accounts_donations_expenses_transfers_and_statement(db_session):
    org, admin, campaign = await _setup(db_session)
    r = _request(org, "POST")
    kasa = await acc.create_account(r, acc.AccountIn(name="Merkez Kasa", kind="cash", opening_balance_cents=50_000,
                                                     default_for="cash"), db_session, admin)
    banka = await acc.create_account(r, acc.AccountIn(name="Ziraat TL", kind="bank", default_for="bank_transfer"), db_session, admin)
    await acc.create_account(r, acc.AccountIn(name="Euro Hesap", kind="bank", currency="EUR"), db_session, admin)

    # Nakit bağış kasaya, havale bankaya otomatik işlenir; iptalde geri alınır.
    cash = await crm.create_manual_donation(r, crm.ManualDonationIn(
        idempotency_key=uuid.uuid4().hex, campaign_id=campaign.id, amount_cents=20_000, payment_method="cash",
        donor=crm.ManualDonor(first_name="Ali"), send_receipt=False), db_session, admin)
    await crm.create_manual_donation(r, crm.ManualDonationIn(
        idempotency_key=uuid.uuid4().hex, campaign_id=campaign.id, amount_cents=100_000, payment_method="bank_transfer",
        donor=crm.ManualDonor(first_name="Veli"), send_receipt=False), db_session, admin)
    assert await _balances(org, admin, db_session) == {"Merkez Kasa": 70_000, "Ziraat TL": 100_000, "Euro Hesap": 0}
    await crm.cancel_manual_donation(r, uuid.UUID(cash["id"]), crm.CancelIn(reason="Hatalı"), db_session, admin)
    assert (await _balances(org, admin, db_session))["Merkez Kasa"] == 50_000

    card = await acc.create_card(r, acc.CardIn(name="Kira", group="Genel yönetim"), db_session, admin)
    supplier = await acc.create_counterparty(r, acc.CounterpartyIn(name="Ev Sahibi Ahmet", kind="supplier"), db_session, admin)
    paid = await acc.create_expense(r, acc.ExpenseIn(expense_card_id=card["id"], amount_cents=30_000, account_id=banka["id"],
                                                     counterparty_id=supplier["id"], document_no="F-1"), db_session, admin)
    unpaid = await acc.create_expense(r, acc.ExpenseIn(expense_card_id=card["id"], amount_cents=30_000,
                                                       counterparty_id=supplier["id"]), db_session, admin)
    assert paid["paid"] and not unpaid["paid"]
    with pytest.raises(HTTPException) as exc:  # para birimi uyuşmazlığı
        await acc.create_expense(r, acc.ExpenseIn(expense_card_id=card["id"], amount_cents=1, currency="EUR",
                                                  account_id=banka["id"]), db_session, admin)
    assert exc.value.status_code == 422
    statement = await acc.counterparty_statement(_request(org), uuid.UUID(supplier["id"]), db_session, admin)
    assert statement["unpaid_cents"] == 30_000 and len(statement["movements"]) == 1
    await acc.pay_expense(r, uuid.UUID(unpaid["id"]), acc.PayIn(account_id=kasa["id"]), db_session, admin)

    await acc.create_transfer(r, acc.TransferIn(from_account_id=banka["id"], to_account_id=kasa["id"], amount_cents=10_000),
                              db_session, admin)
    assert await _balances(org, admin, db_session) == {"Merkez Kasa": 30_000, "Ziraat TL": 60_000, "Euro Hesap": 0}

    st = await acc.account_statement(_request(org), uuid.UUID(kasa["id"]), date.today().replace(day=1), date.today(), db_session, admin)
    assert st["opening_cents"] == 50_000 and st["closing_cents"] == 30_000
    assert [e["category"] for e in st["entries"]] == ["Kira", "Virman"]

    # Gider silinince hareketi de silinir; bağış hareketi elle silinemez.
    await acc.delete_expense(r, uuid.UUID(paid["id"]), db_session, admin)
    assert (await _balances(org, admin, db_session))["Ziraat TL"] == 90_000
    donation_entry = (await db_session.execute(select(LedgerEntry).where(
        LedgerEntry.organization_id == org.id, LedgerEntry.source_type == "donation"))).scalar_one()
    with pytest.raises(HTTPException):
        await acc.delete_entry(r, donation_entry.id, db_session, admin)

    summary = await acc.accounting_summary(_request(org), None, None, db_session, admin)
    assert summary["income_cents"] == 100_000 and summary["expense_cents"] == 30_000
    assert summary["totals_by_currency"] == {"EUR": 0, "TRY": 120_000}


async def test_cheque_lifecycle(db_session):
    org, admin, _ = await _setup(db_session)
    r = _request(org, "POST")
    banka = await acc.create_account(r, acc.AccountIn(name="Banka", kind="bank"), db_session, admin)
    due = date.today() + timedelta(days=10)
    received = await acc.create_cheque(r, acc.ChequeIn(number="123456", bank_name="Ziraat", drawer="Mehmet Bey",
                                                       amount_cents=500_000, due_date=due), db_session, admin)
    cid = uuid.UUID(received["id"])
    upcoming = await acc.list_cheques(_request(org), None, "open", 30, db_session, admin)
    assert [c["days_to_due"] for c in upcoming] == [10]

    await acc.change_cheque_status(r, cid, acc.ChequeStatusIn(status="deposited", account_id=banka["id"]), db_session, admin)
    with pytest.raises(HTTPException):  # tahsil edilmiş gibi ödenemez
        await acc.change_cheque_status(r, cid, acc.ChequeStatusIn(status="paid"), db_session, admin)
    await acc.change_cheque_status(r, cid, acc.ChequeStatusIn(status="collected"), db_session, admin)
    assert (await _balances(org, admin, db_session))["Banka"] == 500_000
    bounced = await acc.change_cheque_status(r, cid, acc.ChequeStatusIn(status="bounced", note="Karşılıksız"), db_session, admin)
    assert bounced["status"] == "bounced" and len(bounced["history"]) == 4
    assert (await _balances(org, admin, db_session))["Banka"] == 0

    issued = await acc.create_cheque(r, acc.ChequeIn(direction="issued", kind="note", number="S-1", amount_cents=200_000,
                                                     due_date=due), db_session, admin)
    with pytest.raises(HTTPException):  # hesap seçilmeden ödenemez
        await acc.change_cheque_status(r, uuid.UUID(issued["id"]), acc.ChequeStatusIn(status="paid"), db_session, admin)
    await acc.change_cheque_status(r, uuid.UUID(issued["id"]), acc.ChequeStatusIn(status="paid", account_id=banka["id"]), db_session, admin)
    assert (await _balances(org, admin, db_session))["Banka"] == -200_000


async def test_payroll_with_advance_deduction(db_session):
    org, admin, _ = await _setup(db_session)
    r = _request(org, "POST")
    kasa = await acc.create_account(r, acc.AccountIn(name="Kasa", opening_balance_cents=10_000_000), db_session, admin)
    hoca = await acc.create_employee(r, acc.EmployeeIn(full_name="Ahmet Hoca", monthly_salary_cents=2_500_000), db_session, admin)
    await acc.create_employee(r, acc.EmployeeIn(full_name="Ayrılan", monthly_salary_cents=1_000_000, is_active=False), db_session, admin)
    await acc.give_advance(r, acc.AdvanceIn(employee_id=hoca["id"], amount_cents=300_000, account_id=kasa["id"]), db_session, admin)
    assert (await acc.list_employees(_request(org), db_session, admin))[0]["open_advance_cents"] == 300_000

    period = date.today().strftime("%Y-%m")
    gen = await acc.generate_payroll(r, acc.PayrollGenerateIn(period=period), db_session, admin)
    assert gen["created"] == 1
    assert (await acc.generate_payroll(r, acc.PayrollGenerateIn(period=period), db_session, admin))["created"] == 0
    sheet = await acc.list_payroll(_request(org), period, db_session, admin)
    item = sheet["items"][0]
    assert (item["salary_cents"], item["advance_cents"], item["net_cents"]) == (2_500_000, 300_000, 2_200_000)

    updated = await acc.update_payroll_item(r, uuid.UUID(item["id"]), acc.PayrollItemIn(
        salary_cents=2_500_000, overtime_cents=100_000, deduction_cents=50_000), db_session, admin)
    assert updated["net_cents"] == 2_250_000
    with pytest.raises(HTTPException):
        await acc.update_payroll_item(r, uuid.UUID(item["id"]), acc.PayrollItemIn(salary_cents=0, deduction_cents=1), db_session, admin)

    await acc.pay_payroll(r, acc.PayrollPayIn(item_ids=[item["id"]], account_id=kasa["id"]), db_session, admin)
    assert (await _balances(org, admin, db_session))["Kasa"] == 10_000_000 - 300_000 - 2_250_000
    with pytest.raises(HTTPException):
        await acc.delete_payroll_item(r, uuid.UUID(item["id"]), db_session, admin)
    advance = (await db_session.execute(select(SalaryAdvance).where(SalaryAdvance.organization_id == org.id))).scalar_one()
    assert str(advance.payroll_item_id) == item["id"]


async def test_accounting_is_ileri_only(db_session):
    org, _, _ = await _setup(db_session, plan="orta")
    with pytest.raises(HTTPException) as exc:
        await require_admin_route_feature(_request(org, path="/api/v1/admin-features/acc/accounts"))
    assert exc.value.detail["feature"] == "accounting"
    # Eski basit gider ekranı her pakette çalışmaya devam eder.
    await require_admin_route_feature(_request(org, path="/api/v1/finance/expenses"))

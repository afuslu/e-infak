"""Muhasebe çekirdeği: kasa / banka / POS hesapları ve hareket defteri, gider kartları, cari kartlar,
çek-senet, personel maaş ve avansları.

Her para hareketi tek bir LedgerEntry'dir; hesap bakiyesi = açılış bakiyesi + girişler − çıkışlar.
Kaynak kayıt (bağış, gider, çek, maaş, avans, virman) source_type / source_id ile bağlanır.
"""
import uuid

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app.core.db import Base

ACCOUNT_KINDS = {"cash": "Kasa", "bank": "Banka", "pos": "POS / sanal POS"}
COUNTERPARTY_KINDS = {"supplier": "Tedarikçi", "customer": "Müşteri", "staff": "Personel", "partner": "Ortak kurum", "other": "Diğer"}
CHEQUE_STATUSES = {
    "portfolio": "Portföyde", "deposited": "Bankaya verildi", "collected": "Tahsil edildi", "endorsed": "Ciro edildi",
    "bounced": "Karşılıksız", "paid": "Ödendi", "cancelled": "İptal",
}


class FinanceAccount(Base):
    __tablename__ = "finance_accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    kind = Column(String(8), nullable=False, default="cash")  # cash | bank | pos
    currency = Column(String(3), nullable=False, default="TRY")
    bank_name = Column(String(120))
    iban = Column(String(40))
    opening_balance_cents = Column(Integer, nullable=False, default=0)
    opening_date = Column(Date)
    # Bu ödeme yöntemiyle gelen bağışlar otomatik bu hesaba işlenir: cash | bank_transfer | credit_card
    default_for = Column(String(16))
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Counterparty(Base):
    """Cari kart: tedarikçi, personel, ortak kurum..."""
    __tablename__ = "counterparties"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    kind = Column(String(16), nullable=False, default="supplier")
    tax_no = Column(String(20))
    tax_office = Column(String(100))
    phone = Column(String(32))
    email = Column(String(255))
    iban = Column(String(40))
    address = Column(Text)
    note = Column(Text)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ExpenseCard(Base):
    """Gider kartı (gider kalemi): kira, elektrik, yardım malzemesi..."""
    __tablename__ = "expense_cards"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    code = Column(String(20))
    group = Column(String(60))  # rapor grubu: Genel yönetim, Yardım, Personel...
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("organization_id", "name", name="uq_expense_card_org_name"),)


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    account_id = Column(UUID(as_uuid=True), ForeignKey("finance_accounts.id"), nullable=False, index=True)
    entry_date = Column(Date, nullable=False, index=True)
    direction = Column(String(3), nullable=False)  # in | out
    amount_cents = Column(Integer, nullable=False)
    category = Column(String(60), nullable=False, default="Diğer")
    description = Column(String(500))
    # donation | expense | transfer | cheque | payroll | advance | manual
    source_type = Column(String(16), nullable=False, default="manual")
    source_id = Column(UUID(as_uuid=True))
    counterparty_id = Column(UUID(as_uuid=True), ForeignKey("counterparties.id", ondelete="SET NULL"), index=True)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (Index("ix_ledger_source", "source_type", "source_id"),)


class Cheque(Base):
    """Çek / senet. received = alınan (portföy), issued = verilen (borç)."""
    __tablename__ = "cheques"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    kind = Column(String(8), nullable=False, default="cheque")  # cheque | note (senet)
    direction = Column(String(8), nullable=False, default="received")  # received | issued
    number = Column(String(40), nullable=False)
    bank_name = Column(String(120))
    drawer = Column(String(200))  # keşideci / borçlu
    counterparty_id = Column(UUID(as_uuid=True), ForeignKey("counterparties.id", ondelete="SET NULL"), index=True)
    amount_cents = Column(Integer, nullable=False)
    currency = Column(String(3), nullable=False, default="TRY")
    issue_date = Column(Date)
    due_date = Column(Date, nullable=False, index=True)
    status = Column(String(12), nullable=False, default="portfolio", index=True)
    account_id = Column(UUID(as_uuid=True), ForeignKey("finance_accounts.id", ondelete="SET NULL"))
    # Alınan çek bir cariye ciro edildiyse: o cariye yapılmış ödeme sayılır
    endorsed_to_id = Column(UUID(as_uuid=True), ForeignKey("counterparties.id", ondelete="SET NULL"))
    note = Column(Text)
    history = Column(JSONB, nullable=False, default=list, server_default="[]")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Employee(Base):
    __tablename__ = "employees"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    full_name = Column(String(200), nullable=False)
    title = Column(String(120))
    national_id = Column(String(11))
    iban = Column(String(40))
    phone = Column(String(32))
    monthly_salary_cents = Column(Integer, nullable=False, default=0)  # net aylık maaş
    start_date = Column(Date)
    end_date = Column(Date)
    is_active = Column(Boolean, nullable=False, default=True)
    note = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class SalaryAdvance(Base):
    __tablename__ = "salary_advances"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    amount_cents = Column(Integer, nullable=False)
    given_on = Column(Date, nullable=False)
    account_id = Column(UUID(as_uuid=True), ForeignKey("finance_accounts.id", ondelete="SET NULL"))
    # Maaştan düşüldüğü bordro satırı; boşsa açık avans
    payroll_item_id = Column(UUID(as_uuid=True), ForeignKey("payroll_items.id", ondelete="SET NULL"))
    note = Column(String(300))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class PayrollItem(Base):
    """Bir personelin bir aylık bordro satırı."""
    __tablename__ = "payroll_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    period = Column(String(7), nullable=False)  # 2026-11
    salary_cents = Column(Integer, nullable=False, default=0)
    overtime_cents = Column(Integer, nullable=False, default=0)
    bonus_cents = Column(Integer, nullable=False, default=0)
    deduction_cents = Column(Integer, nullable=False, default=0)  # diğer kesintiler
    advance_cents = Column(Integer, nullable=False, default=0)  # mahsup edilen avans
    status = Column(String(8), nullable=False, default="draft")  # draft | paid
    paid_on = Column(Date)
    account_id = Column(UUID(as_uuid=True), ForeignKey("finance_accounts.id", ondelete="SET NULL"))
    note = Column(String(300))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("employee_id", "period", name="uq_payroll_employee_period"),)

    @property
    def net_cents(self) -> int:
        return self.salary_cents + self.overtime_cents + self.bonus_cents - self.deduction_cents - self.advance_cents


STOCK_UNITS = {"adet": "Adet", "kg": "Kg", "lt": "Litre", "koli": "Koli", "paket": "Paket", "metre": "Metre"}
STOCK_MOVE_KINDS = {
    "purchase": "Alış", "in_kind": "Ayni bağış", "aid_out": "Yardım çıkışı", "transfer": "Depolar arası transfer",
    "adjust": "Sayım düzeltmesi", "invoice": "Fatura", "use": "Kurum içi kullanım",
}


class Warehouse(Base):
    __tablename__ = "warehouses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    address = Column(String(500))
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class StockItem(Base):
    """Stok kartı: un, yağ, battaniye, okul çantası..."""
    __tablename__ = "stock_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    code = Column(String(40))
    unit = Column(String(8), nullable=False, default="adet")
    category = Column(String(60))
    min_qty = Column(Numeric(14, 3), nullable=False, default=0)  # kritik stok seviyesi
    unit_value_cents = Column(Integer, nullable=False, default=0)  # tahmini birim değer (raporlama)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("organization_id", "name", name="uq_stock_item_org_name"),)


class StockMove(Base):
    __tablename__ = "stock_moves"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    item_id = Column(UUID(as_uuid=True), ForeignKey("stock_items.id"), nullable=False, index=True)
    warehouse_id = Column(UUID(as_uuid=True), ForeignKey("warehouses.id"), nullable=False, index=True)
    move_date = Column(Date, nullable=False, index=True)
    direction = Column(String(3), nullable=False)  # in | out
    qty = Column(Numeric(14, 3), nullable=False)
    kind = Column(String(12), nullable=False, default="adjust")
    unit_value_cents = Column(Integer, nullable=False, default=0)
    counterparty_id = Column(UUID(as_uuid=True), ForeignKey("counterparties.id", ondelete="SET NULL"), index=True)
    donor_id = Column(UUID(as_uuid=True), ForeignKey("donors.id", ondelete="SET NULL"), index=True)
    aid_recipient_id = Column(UUID(as_uuid=True), ForeignKey("aid_recipients.id", ondelete="SET NULL"), index=True)
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), index=True)
    group_id = Column(UUID(as_uuid=True), index=True)  # transferin iki bacağı
    note = Column(String(500))
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Invoice(Base):
    """Alış (purchase) / satış (sales) faturası. Ödemeler hareket defterine source_type=invoice ile yazılır."""
    __tablename__ = "invoices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    kind = Column(String(8), nullable=False, default="purchase")
    number = Column(String(40), nullable=False)
    counterparty_id = Column(UUID(as_uuid=True), ForeignKey("counterparties.id"), nullable=False, index=True)
    issue_date = Column(Date, nullable=False, index=True)
    due_date = Column(Date)
    currency = Column(String(3), nullable=False, default="TRY")
    warehouse_id = Column(UUID(as_uuid=True), ForeignKey("warehouses.id", ondelete="SET NULL"))
    subtotal_cents = Column(Integer, nullable=False, default=0)
    vat_cents = Column(Integer, nullable=False, default=0)
    total_cents = Column(Integer, nullable=False, default=0)
    status = Column(String(10), nullable=False, default="open")  # open | cancelled
    note = Column(Text)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("organization_id", "kind", "counterparty_id", "number", name="uq_invoice_number"),)


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    description = Column(String(300), nullable=False)
    item_id = Column(UUID(as_uuid=True), ForeignKey("stock_items.id", ondelete="SET NULL"))
    qty = Column(Numeric(14, 3), nullable=False, default=1)
    unit_price_cents = Column(Integer, nullable=False)
    vat_rate = Column(Integer, nullable=False, default=20)  # yüzde
    line_total_cents = Column(Integer, nullable=False)  # KDV hariç

"""Everything an organisation owns, as Excel files and a full ZIP backup.

Tables are grouped into datasets. Each row is scoped to the organisation through `organization_id` or, for child
tables, through the foreign key of its parent. Passwords, tokens and provider credentials are never written.
tests/test_data_export.py fails when a new table is neither in a dataset nor in EXCLUDED_TABLES.
"""
import asyncio
import enum
import hashlib
import json
import os
import re
import shutil
import tempfile
import zipfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import AsyncIterator, Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from openpyxl import Workbook
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from sqlalchemy import Table, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import Base
from app.services.media import org_dir
from app.services.videos import video_dir
from app.utils.excel_export import csv_safe

TZ = ZoneInfo("Europe/Istanbul")
KEEP_DAYS = 7
MAX_ROWS = 1_000_000
CELL_LIMIT = 32_000
DISK_RESERVE = 2 * 1024 ** 3

DATASETS: dict[str, tuple[str, dict[str, str]]] = {
    "bagiscilar": ("Bağışçılar", {
        "donors": "Bağışçılar", "consent_records": "İzinler", "donor_reminders": "Hatırlatıcılar",
        "recipient_lists": "Listeler", "recipient_list_members": "Liste üyeleri"}),
    "gorusme-notlari": ("Görüşme notları", {"donor_notes": "Görüşme notları"}),
    "bagislar": ("Bağışlar ve makbuzlar", {
        "donations": "Bağışlar", "receipt_books": "Makbuz koçanları", "campaigns": "Kampanyalar",
        "campaign_tabs": "Kampanya sekmeleri", "donation_categories": "Bağış kalemleri"}),
    "online-odemeler": ("Online ödemeler", {
        "payment_orders": "Siparişler", "payment_order_items": "Sipariş kalemleri", "payment_attempts": "Denemeler",
        "payment_refunds": "İadeler"}),
    "banka-hareketleri": ("Banka hareketleri", {
        "bank_transactions": "Hareketler", "bank_accounts": "Hesaplar", "bank_match_rules": "Eşleştirme kuralları",
        "bank_statement_imports": "Yüklenen ekstreler"}),
    "duzenli-bagislar": ("Düzenli bağışlar", {"subscriptions": "Talimatlar"}),
    "uyeler-ve-aidatlar": ("Üyeler ve aidatlar", {"members": "Üyeler", "member_dues": "Aidatlar"}),
    "kurban": ("Kurban", {"kurban_campaigns": "Kampanyalar", "kurban_animals": "Hayvanlar", "kurban_shares": "Hisseler"}),
    "kumbara": ("Kumbara", {"money_boxes": "Kumbaralar", "money_box_collections": "Toplamalar", "regions": "Bölgeler"}),
    "sponsorluk-ve-ogrenci": ("Sponsorluk ve öğrenciler", {
        "beneficiaries": "Yararlanıcılar", "pledges": "Taahhütler", "pledge_installments": "Taksitler",
        "orphans": "Yetimler", "orphan_sponsorships": "Yetim sponsorlukları", "students": "Öğrenciler",
        "student_sponsorships": "Öğrenci sponsorlukları", "student_progress": "Öğrenci gelişimi",
        "student_preregistrations": "Ön kayıtlar"}),
    "su-kuyulari": ("Su kuyuları", {"water_wells": "Kuyular", "water_well_shares": "Hisseler"}),
    "yardim": ("Yardım ve yoksul takip", {
        "aid_recipients": "Haneler", "household_members": "Hane üyeleri", "aid_packages": "Paketler",
        "aid_distributions": "Dağıtımlar"}),
    "muhasebe": ("Muhasebe ve stok", {
        "finance_accounts": "Kasa ve hesaplar", "ledger_entries": "Hareketler", "expenses": "Giderler",
        "expense_cards": "Gider kartları", "counterparties": "Cariler", "cheques": "Çek ve senet",
        "invoices": "Faturalar", "invoice_lines": "Fatura satırları", "employees": "Çalışanlar",
        "salary_advances": "Avanslar", "payroll_items": "Bordro", "warehouses": "Depolar",
        "stock_items": "Stok kartları", "stock_moves": "Stok hareketleri"}),
    "mesajlar": ("SMS, WhatsApp ve e-posta", {
        "sms_messages": "SMS", "sms_batches": "Toplu SMS", "sms_templates": "SMS şablonları",
        "sms_donation_records": "SMS bağışları", "whatsapp_messages": "WhatsApp", "mail_messages": "E-postalar",
        "mail_batches": "Toplu e-posta", "mail_templates": "E-posta şablonları", "call_logs": "Çağrılar"}),
    "web-sitesi": ("Web sitesi ve formlar", {
        "site_pages": "Sayfalar", "site_page_revisions": "Sayfa geçmişi", "site_menu_items": "Menü",
        "content_posts": "İçerikler", "gallery_items": "Galeri", "banners": "Duyuru bandı", "site_forms": "Formlar",
        "site_form_submissions": "Form yanıtları", "contact_messages": "İletişim mesajları",
        "volunteer_applications": "Gönüllüler", "organization_settings": "Kurum bilgileri",
        "organization_domains": "Alan adları", "zakat_settings": "Zekat ayarları"}),
    "personel-ve-gorevler": ("Personel, roller ve görevler", {
        "users": "Personel", "departments": "Birimler", "staff_roles": "Roller", "tasks": "Görevler",
        "task_templates": "Görev şablonları", "support_tickets": "Destek talepleri",
        "support_ticket_messages": "Destek mesajları"}),
    "islem-kayitlari": ("İşlem kayıtları", {"audit_logs": "İşlemler", "org_ip_rules": "IP kuralları"}),
    "ortam-kutuphanesi": ("Ortam kütüphanesi (liste)", {
        "media_assets": "Görseller", "media_folders": "Klasörler", "donation_videos": "Videolar", "video_views": "İzlenmeler"}),
}
# Secrets, sessions, queues and the platform's own records.
EXCLUDED_TABLES = {
    "organizations", "demo_requests", "fx_rates", "platform_users", "platform_audit_logs", "platform_broadcasts",
    "platform_payments", "platform_alert_dismissals", "api_keys", "tenant_credentials", "webhook_settings",
    "sessions", "device_tokens", "outbox_events", "staff_notifications", "staff_notification_settings",
    "data_exports", "organization_offboardings",
}
SECRET_COLUMN = re.compile(r"password|secret|token|key_hash|cipher|card_ref|safe_response|raw_data|^raw$|track_code|idempotency")
LABELS = {
    "id": "Kayıt no", "external_ref": "Eski sistem no", "donor_id": "Bağışçı no", "campaign_id": "Kampanya no",
    "first_name": "Ad", "last_name": "Soyad", "full_name": "Ad soyad", "company_name": "Kurum adı", "name": "Ad",
    "title": "Başlık", "phone": "Telefon", "phone2": "Diğer telefon", "email": "E-posta", "address": "Adres",
    "city": "İl", "district": "İlçe", "neighbourhood": "Mahalle", "country": "Ülke", "tc_no": "T.C. kimlik",
    "tax_number": "Vergi no", "donor_type": "Üyelik türü", "membership_type": "Üyelik tipi", "referral_source": "Referans",
    "notes": "Açıklama", "note": "Not", "content": "İçerik", "description": "Açıklama", "status": "Durum",
    "currency": "Para birimi", "amount_cents": "Tutar", "total_cents": "Toplam", "paid_at": "Ödeme tarihi",
    "receipt_number": "Makbuz no", "receipt_seq": "Makbuz sırası", "official_receipt_no": "Resmî makbuz no",
    "payment_method": "Ödeme yöntemi", "payment_provider": "Kaynak", "on_behalf_of": "Kimin adına",
    "donor_message": "Bağışçı mesajı", "booked_at": "İşlem tarihi", "sender_name": "Gönderen", "created_at": "Kayıt tarihi",
    "updated_at": "Güncelleme", "body": "Metin", "tags": "Etiketler", "allow_sms": "SMS izni", "allow_email": "E-posta izni",
    "birth_date": "Doğum tarihi", "failure_message": "Hata nedeni", "user_id": "Kullanıcı no", "author_id": "Yazan no",
    "total_donated_cents": "Toplam bağış", "total_donations": "Bağış sayısı", "action": "İşlem", "details": "Ayrıntı",
}


def tables() -> dict[str, Table]:
    import app.main  # noqa: F401  (registers every model)
    return Base.metadata.tables


def scope(table: Table, org_id: UUID, _seen: frozenset = frozenset()):
    """Condition selecting the organisation's rows, or None when the table has no link to an organisation."""
    if table.name == "organizations":
        return table.c.id == org_id
    if "organization_id" in table.c:
        return table.c.organization_id == org_id
    for fk in sorted(table.foreign_keys, key=lambda f: (f.parent.nullable, f.parent.name)):
        parent = fk.column.table
        if parent.name in _seen or parent.name == table.name:
            continue
        condition = scope(parent, org_id, _seen | {table.name})
        if condition is not None:
            return fk.parent.in_(select(fk.column).where(condition))
    return None


def columns(table: Table) -> list:
    return [c for c in table.c if not SECRET_COLUMN.search(c.name)]


def _plain(value, column: str):
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.astimezone(TZ).replace(tzinfo=None) if value.tzinfo else value
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, default=str)
    if isinstance(value, bytes):
        return None
    if column.endswith("_cents") and isinstance(value, int):
        return value / 100
    return value


def _cell(value, column: str):
    value = _plain(value, column)
    if isinstance(value, str):
        value = csv_safe(ILLEGAL_CHARACTERS_RE.sub("", value))
        if len(value) > CELL_LIMIT:
            value = value[:CELL_LIMIT] + " … (tamamı yedekteki json klasöründe)"
    elif value is not None and not isinstance(value, (int, float, bool, date, datetime)):
        value = str(value)
    return value


async def _rows(db: AsyncSession, table: Table, org_id: UUID) -> AsyncIterator:
    order = [table.c.created_at] if "created_at" in table.c else []
    query = select(*columns(table)).where(scope(table, org_id)).order_by(*order, *table.primary_key.columns)
    result = await db.stream(query.execution_options(yield_per=1000))
    async for row in result:
        yield row


async def _names(db: AsyncSession, org_id: UUID) -> dict[str, dict]:
    """Readable names next to the links: donor, campaign and staff member."""
    t = tables()
    donors, campaigns, users = t["donors"], t["campaigns"], t["users"]
    out = {}
    out["donor_id"] = {r[0]: (r[3] or f"{r[1] or ''} {r[2] or ''}".strip()) for r in (await db.execute(
        select(donors.c.id, donors.c.first_name, donors.c.last_name, donors.c.company_name)
        .where(donors.c.organization_id == org_id))).all()}
    out["campaign_id"] = dict((await db.execute(
        select(campaigns.c.id, campaigns.c.title).where(campaigns.c.organization_id == org_id))).all())
    people = {r[0]: f"{r[1]} {r[2] or ''}".strip() for r in (await db.execute(
        select(users.c.id, users.c.first_name, users.c.last_name).where(users.c.organization_id == org_id))).all()}
    for key in ("user_id", "author_id", "created_by", "created_by_id", "issued_by_id", "assigned_user_id", "staff_user_id",
                "assigned_to_id"):
        out[key] = people
    return out


NAME_LABELS = {"donor_id": "Bağışçı", "campaign_id": "Kampanya", "user_id": "Kullanıcı", "author_id": "Yazan",
               "created_by": "Ekleyen", "created_by_id": "Ekleyen", "issued_by_id": "Makbuzu kesen",
               "assigned_user_id": "Temsilci", "staff_user_id": "Personel", "assigned_to_id": "Sorumlu"}


async def write_dataset(db: AsyncSession, org_id: UUID, key: str, path: Path, jsonl_dir: Optional[Path] = None,
                        names: Optional[dict] = None) -> dict[str, int]:
    """One Excel file with a sheet per table; with jsonl_dir also one complete JSON-lines file per table."""
    names = names or await _names(db, org_id)
    book = Workbook(write_only=True)
    counts: dict[str, int] = {}
    for table_name, label in DATASETS[key][1].items():
        table = tables()[table_name]
        cols = [c.name for c in columns(table)]
        # kurban_shares.campaign_id and friends point at other tables than campaigns.
        targets = {fk.parent.name: fk.column.table.name for fk in table.foreign_keys}
        named = [c for c in cols if c in names and targets.get(c) in ("donors", "campaigns", "users")]
        header = [LABELS.get(c, c) for c in cols] + [NAME_LABELS[c] for c in named]
        sheet = book.create_sheet(label[:31])
        sheet.append(header)
        counts[table_name] = in_sheet = 0
        part = 1
        out = open(jsonl_dir / f"{table_name}.jsonl", "w", encoding="utf-8") if jsonl_dir else None
        try:
            async for row in _rows(db, table, org_id):
                if in_sheet >= MAX_ROWS:
                    part, in_sheet = part + 1, 0
                    sheet = book.create_sheet(f"{label[:26]} {part}")
                    sheet.append(header)
                sheet.append([_cell(v, c) for c, v in zip(cols, row)]
                             + [_cell(names[c].get(getattr(row, c)), c) for c in named])
                if out:
                    record = {c: (v.value if isinstance(v, enum.Enum) else v) for c, v in zip(cols, row) if not isinstance(v, bytes)}
                    out.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")
                counts[table_name] += 1
                in_sheet += 1
        finally:
            if out:
                out.close()
    await asyncio.to_thread(book.save, path)
    return counts


async def summary(db: AsyncSession, org_id: UUID) -> list[dict]:
    out = []
    for key, (label, members) in DATASETS.items():
        counts = []
        for table_name, table_label in members.items():
            table = tables()[table_name]
            n = (await db.execute(select(func.count()).select_from(table).where(scope(table, org_id)))).scalar_one()
            counts.append({"label": table_label, "count": int(n)})
        out.append({"key": key, "label": label, "count": counts[0]["count"], "tables": counts})
    return out


def media_files(org_id: UUID) -> list[tuple[Path, str]]:
    """Uploaded files to keep: originals where they exist, plus videos. Generated sizes are left out."""
    found: list[tuple[Path, str]] = []
    folder = org_dir(org_id)
    if folder.is_dir():
        files = [f for f in folder.iterdir() if f.is_file() and not f.is_symlink()]
        originals = {f.name.split(".")[0] for f in files if ".orig." in f.name}
        for f in files:
            token = re.split(r"[.-]", f.name)[0]
            if ".orig." in f.name or token not in originals and not re.search(r"-\d{2,4}\.", f.name):
                found.append((f, f"gorseller/{f.name}"))
    videos = video_dir(org_id)
    if videos.is_dir():
        found += [(f, f"videolar/{f.name}") for f in videos.iterdir() if f.is_file() and not f.is_symlink()]
    return found


def media_size(org_id: UUID) -> int:
    return sum(f.stat().st_size for f, _ in media_files(org_id))


def export_dir(org_id: UUID) -> Path:
    # Public media names are 24 hex characters, so nothing under "_exports" is ever served.
    return Path(settings.MEDIA_ROOT) / "_exports" / str(org_id)


def export_path(export) -> Path:
    return export_dir(export.organization_id) / f"{export.id}.zip"


README = """{name} — tam veri yedeği
Hazırlanma: {when}

excel/  Veri türlerine göre Excel dosyaları. Tutarlar TL/döviz birimindedir.
json/   Aynı kayıtların eksiksiz JSON satır dosyaları (başka sisteme aktarmak için; *_cents alanları kuruştur).
gorseller/, videolar/  Yüklediğiniz özgün dosyalar.
ozet.json  Kayıt sayıları.

Şifreler, oturumlar, API anahtarları ile SMS/POS/banka bağlantı bilgileri güvenlik nedeniyle yedekte yer almaz.
Bu dosya kişisel veri içerir; KVKK kapsamında güvenli bir yerde saklayın.
"""


def _zip(work: Path, target: Path, media: list[tuple[Path, str]], password: Optional[str] = None) -> str:
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_suffix(".part")
    try:
        if password:
            import pyzipper
            opened = pyzipper.AESZipFile(partial, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True,
                                         encryption=pyzipper.WZ_AES)
            opened.setpassword(password.encode("utf-8"))
        else:
            opened = zipfile.ZipFile(partial, "w", zipfile.ZIP_DEFLATED, allowZip64=True)
        with opened as archive:
            for f in sorted(work.rglob("*")):
                if f.is_file():
                    archive.write(f, f.relative_to(work).as_posix())
            for f, name in media:
                if f.is_file():
                    archive.write(f, name, compress_type=zipfile.ZIP_STORED)
        digest = hashlib.sha256()
        with open(partial, "rb") as fh:
            while block := fh.read(1024 * 1024):
                digest.update(block)
        os.chmod(partial, 0o600)
        os.replace(partial, target)
        return digest.hexdigest()
    finally:
        partial.unlink(missing_ok=True)


async def build(db: AsyncSession, export) -> None:
    """Fill in a queued export. The caller commits."""
    from app.models.organization import Organization

    org = await db.get(Organization, export.organization_id)
    password = None
    if export.encrypted:
        from app.services.tenant_credentials import decrypt
        password = decrypt(export.password_enc)["password"]
    root = export_dir(org.id)
    root.mkdir(parents=True, exist_ok=True)
    media = media_files(org.id) if export.include_media else []
    needed = sum(f.stat().st_size for f, _ in media) + DISK_RESERVE
    if shutil.disk_usage(root).free < needed:
        raise RuntimeError("Sunucuda yedek için yeterli boş alan yok; görselleri dahil etmeden deneyin veya destekle görüşün")
    with tempfile.TemporaryDirectory(dir=root) as tmp:
        work = Path(tmp)
        (work / "excel").mkdir()
        (work / "json").mkdir()
        names = await _names(db, org.id)
        counts: dict[str, int] = {}
        for key in DATASETS:
            counts |= await write_dataset(db, org.id, key, work / "excel" / f"{key}.xlsx", work / "json", names)
        now = datetime.now(TZ)
        (work / "OKUBENI.txt").write_text(README.format(name=org.name, when=now.strftime("%d.%m.%Y %H:%M")), encoding="utf-8")
        (work / "ozet.json").write_text(json.dumps(
            {"kurum": org.name, "tarih": now.isoformat(), "kayitlar": counts, "dosya_sayisi": len(media)},
            ensure_ascii=False, indent=2), encoding="utf-8")
        target = export_path(export)
        export.sha256 = await asyncio.to_thread(_zip, work, target, media, password)
    export.size_bytes = target.stat().st_size
    export.counts = {**counts, "dosyalar": len(media)}
    export.finished_at = datetime.now(timezone.utc)
    export.expires_at = export.finished_at + timedelta(days=KEEP_DAYS)
    export.status = "ready"
    export.password_enc = None


def remove_organization_files(org_id: UUID) -> None:
    """Uploaded files and backups. Database dumps on the server age out by themselves (dagit.sh)."""
    for folder in (org_dir(org_id), video_dir(org_id), export_dir(org_id)):
        shutil.rmtree(folder, ignore_errors=True)

#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import html
import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

# Sunucunun veya testlerin bulunduğu backend klasörünü python yoluna ekle
script_dir = Path(__file__).resolve().parent
if str(script_dir) not in sys.path:
    sys.path.insert(0, str(script_dir))

from vpos_client import VakifKatilimVPOS

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
DATA = ROOT / "data"
DB_PATH = Path(os.environ.get("EINFAK_DB_PATH", DATA / "einfak.sqlite3"))

DEMOS = [
    ("hicret-dernegi", "Hicret Derneği", "hicretdernegi.org,hicretdernegi.org.tr", "hicretdernegi", "#065f46", "#0284c7", "Ankara", "İslami Eğitim Kurumu ve İlim Medresesi"),
    ("kardeslik-payi", "Kardeşlik Payı Derneği", "kardeslikpayi.org", "kardeslikpayi", "#0f766e", "#f59e0b", "İstanbul", "Paylaşmak Kardeşliktir, Bağış ve Sosyal Yardımlaşma Platformu"),
]

CAMPAIGNS = [
    ("acil-yardim", "Acil Yardım", "acil", "Deprem, sel, savaş ve afet bölgelerine hızlı destek.", 2_500_000, [250, 500, 1000, 2500]),
    ("gazze-yardim", "Gazze Acil Yardım", "gazze", "Gıda, sağlık, barınma ve hijyen paketleri.", 3_500_000, [500, 1000, 2500, 5000]),
    ("afrika-yardim", "Afrika Yardımları", "afrika", "Su, gıda, eğitim ve sağlık destekleri.", 2_750_000, [250, 500, 1000, 2500]),
    ("afganistan-yardim", "Afganistan Yardımları", "afganistan", "Kışlık, gıda ve yetim aile destekleri.", 2_100_000, [250, 500, 1000, 2500]),
    ("kurban", "Kurban Bağışı", "kurban", "Vacip, adak, akika ve şükür kurbanları.", 4_200_000, [4500, 7500, 12500, 24500]),
    ("zekat", "Zekat", "zekat", "Zekat emanetlerinizi ihtiyaç sahiplerine ulaştırıyoruz.", 1_800_000, [1000, 2500, 5000, 10000]),
    ("fitre-fidye", "Fitre ve Fidye", "fitre", "Ramazan fitre, fidye ve kumanya destekleri.", 1_250_000, [130, 260, 500, 1000]),
    ("sadaka", "Sadaka", "sadaka", "Günlük sadaka ve genel hayır destekleri.", 900_000, [100, 250, 500, 1000]),
    ("yetim", "Yetim Sponsorluğu", "sponsorluk", "Yetim çocuklar için aylık destek sistemi.", 2_400_000, [750, 1250, 2500, 5000]),
    ("hafizlik", "Hafızlık ve Eğitim", "sponsorluk", "Hafız, talebe ve medrese destekleri.", 1_950_000, [750, 1500, 3000, 5000]),
    ("su-kuyusu", "Su Kuyusu", "su-kuyusu", "Afrika ve Asya'da su kuyusu projeleri.", 3_000_000, [1000, 2500, 5000, 10000]),
    ("gida", "Gıda Kolisi", "gida", "Ailelere temel gıda ve hijyen paketleri.", 1_400_000, [500, 1000, 2000, 4000]),
    ("saglik", "Sağlık Desteği", "saglik", "Ameliyat, ilaç ve tıbbi malzeme destekleri.", 1_600_000, [500, 1000, 2500, 5000]),
    ("katarakt", "Katarakt Göz Ameliyatı", "saglik", "Karanlığa göz, umuda ışık oluyoruz. Bir ameliyat bedeli 3,500 TL.", 1_500_000, [3500, 7000, 10500, 14000]),
    ("mescit-camii", "Mescit ve Cami İnşası", "afrika", "İbadethane ve ilim yuvası kalıcı eserler inşa ediyoruz.", 5_000_000, [1000, 2500, 5000, 10000]),
    ("sut-kecisi", "Süt Keçisi Dağıtımı", "afrika", "Yoksul ailelere sürdürülebilir geçim kaynağı sağlıyoruz.", 1_200_000, [2500, 5000, 7500, 10000]),
    ("kuran-hediye", "Kur'an-ı Kerim Hediyesi", "sponsorluk", "Talebelere ve ihtiyaç duyan Müslümanlara Mushaf hediye ediyoruz.", 800_000, [150, 300, 600, 1200]),
]

SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, domain TEXT NOT NULL,
  theme TEXT NOT NULL, primary_color TEXT NOT NULL, accent_color TEXT NOT NULL, city TEXT NOT NULL,
  tagline TEXT NOT NULL, description TEXT NOT NULL, iban TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL,
  address TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL,
  vpos_provider TEXT NOT NULL DEFAULT 'mock', vpos_client_id TEXT, vpos_store_key TEXT,
  vpos_username TEXT, vpos_password TEXT, vpos_test_mode INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT, organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug TEXT NOT NULL, title TEXT NOT NULL, category TEXT NOT NULL, summary TEXT NOT NULL, story TEXT NOT NULL,
  target_cents INTEGER NOT NULL, collected_cents INTEGER NOT NULL DEFAULT 0, suggested_amounts TEXT NOT NULL,
  visual TEXT NOT NULL, featured INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(organization_id, slug)
);
CREATE TABLE IF NOT EXISTS donors (
  id INTEGER PRIMARY KEY AUTOINCREMENT, organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL, email TEXT, phone TEXT, city TEXT, donor_type TEXT NOT NULL DEFAULT 'bireysel',
  kvkk INTEGER NOT NULL DEFAULT 0, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS donations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  donor_id INTEGER REFERENCES donors(id), campaign_id INTEGER REFERENCES campaigns(id), amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TRY', payment_method TEXT NOT NULL DEFAULT 'card', payment_status TEXT NOT NULL DEFAULT 'confirmed',
  receipt_no TEXT UNIQUE NOT NULL, note TEXT, dedicatee TEXT, recurring INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
  bank_auth_code TEXT, bank_transaction_id TEXT,
  certificate_recipient TEXT, certificate_message TEXT
);
CREATE TABLE IF NOT EXISTS kurban_animals (
  id INTEGER PRIMARY KEY AUTOINCREMENT, organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL, animal_type TEXT NOT NULL DEFAULT 'buyukbas', region TEXT NOT NULL, country TEXT NOT NULL,
  total_shares INTEGER NOT NULL DEFAULT 7, share_price_cents INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'open',
  video_url TEXT, slaughter_date TEXT, note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(organization_id, code)
);
CREATE TABLE IF NOT EXISTS kurban_shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT, organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  animal_id INTEGER NOT NULL REFERENCES kurban_animals(id) ON DELETE CASCADE, share_no INTEGER NOT NULL,
  donor_id INTEGER REFERENCES donors(id), donation_id INTEGER REFERENCES donations(id), receipt_no TEXT,
  dedicatee TEXT, intention_type TEXT NOT NULL DEFAULT 'vacip', status TEXT NOT NULL DEFAULT 'assigned',
  video_url TEXT, slaughtered_at TEXT, notified_at TEXT, note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(animal_id, share_no), UNIQUE(organization_id, donation_id)
);
CREATE TABLE IF NOT EXISTS recurring_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT, organization_id INTEGER NOT NULL, donor_id INTEGER, campaign_id INTEGER,
  amount_cents INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'TRY', interval TEXT NOT NULL DEFAULT 'monthly',
  status TEXT NOT NULL DEFAULT 'active', next_run_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pledges (
  id INTEGER PRIMARY KEY AUTOINCREMENT, organization_id INTEGER NOT NULL, donor_id INTEGER, campaign_id INTEGER,
  pledged_cents INTEGER NOT NULL, paid_cents INTEGER NOT NULL DEFAULT 0, due_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bank_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT, organization_id INTEGER NOT NULL, bank_name TEXT NOT NULL, account_no TEXT NOT NULL,
  amount_cents INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'TRY', sender_name TEXT NOT NULL, description TEXT,
  matched_donation_id INTEGER, status TEXT NOT NULL DEFAULT 'unmatched', happened_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS message_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT, organization_id INTEGER NOT NULL, title TEXT NOT NULL, channel TEXT NOT NULL,
  body TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS message_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, organization_id INTEGER NOT NULL, donor_id INTEGER, channel TEXT NOT NULL,
  target TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, organization_id INTEGER NOT NULL, title TEXT NOT NULL, owner TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal', status TEXT NOT NULL DEFAULT 'open', due_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, organization_id INTEGER NOT NULL, full_name TEXT NOT NULL, email TEXT NOT NULL,
  role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS company_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT, organization_name TEXT NOT NULL, full_name TEXT NOT NULL, phone TEXT NOT NULL,
  email TEXT, employee_range TEXT, monthly_volume TEXT, selected_demo TEXT, note TEXT, status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orphans (
  id INTEGER PRIMARY KEY AUTOINCREMENT, organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL, country TEXT NOT NULL, age INTEGER NOT NULL, photo_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available', sponsor_donor_id INTEGER REFERENCES donors(id),
  school_report TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_campaigns_org ON campaigns(organization_id);
CREATE INDEX IF NOT EXISTS idx_donations_org ON donations(organization_id);
CREATE INDEX IF NOT EXISTS idx_donors_org ON donors(organization_id);
CREATE INDEX IF NOT EXISTS idx_kurban_org ON kurban_shares(organization_id);
CREATE INDEX IF NOT EXISTS idx_orphans_org ON orphans(organization_id);
"""


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def now_iso() -> str:
    return utc_now().isoformat().replace("+00:00", "Z")


def cents(value: Any) -> int:
    if isinstance(value, int):
        return max(0, value)
    text = str(value or "").replace("₺", "").replace("TL", "").replace(".", "").replace(",", ".").strip()
    try:
        return max(0, int(round(float(text) * 100)))
    except ValueError:
        return 0


def amount(value: int) -> float:
    return round((value or 0) / 100, 2)


def slugify(value: str) -> str:
    table = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")
    slug = re.sub(r"[^a-z0-9]+", "-", value.translate(table).lower()).strip("-")
    return slug or "kurum"


def visual(category: str) -> str:
    urls = {
        "acil": "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=600&q=80",
        "gazze": "https://images.unsplash.com/photo-1541818274-c748d7092928?auto=format&fit=crop&w=600&q=80",
        "afrika": "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=600&q=80",
        "afganistan": "https://images.unsplash.com/photo-1524069290683-0457abfe42c3?auto=format&fit=crop&w=600&q=80",
        "kurban": "https://images.unsplash.com/photo-1588614660467-f076c8c4a090?auto=format&fit=crop&w=600&q=80",
        "zekat": "https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?auto=format&fit=crop&w=600&q=80",
        "fitre": "https://images.unsplash.com/photo-1593113598332-cd288d649433?auto=format&fit=crop&w=600&q=80",
        "sadaka": "https://images.unsplash.com/photo-1469571486040-7ba987e04710?auto=format&fit=crop&w=600&q=80",
        "sponsorluk": "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=600&q=80",
        "su-kuyusu": "https://images.unsplash.com/photo-1482731215275-a1f151646268?auto=format&fit=crop&w=600&q=80",
        "gida": "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=600&q=80",
        "saglik": "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=600&q=80"
    }
    return urls.get(category, "https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?auto=format&fit=crop&w=600&q=80")


def db() -> sqlite3.Connection:
    DATA.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with db() as conn:
        # Check if tables exist
        org_exists = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='organizations'").fetchone()
        don_exists = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='donations'").fetchone()

        if org_exists:
            # Check and migrate organizations columns
            try:
                conn.execute("SELECT vpos_provider FROM organizations LIMIT 1")
            except sqlite3.OperationalError:
                conn.execute("ALTER TABLE organizations ADD COLUMN vpos_provider TEXT NOT NULL DEFAULT 'mock'")
                conn.execute("ALTER TABLE organizations ADD COLUMN vpos_client_id TEXT")
                conn.execute("ALTER TABLE organizations ADD COLUMN vpos_store_key TEXT")
                conn.execute("ALTER TABLE organizations ADD COLUMN vpos_username TEXT")
                conn.execute("ALTER TABLE organizations ADD COLUMN vpos_password TEXT")
                conn.execute("ALTER TABLE organizations ADD COLUMN vpos_test_mode INTEGER NOT NULL DEFAULT 1")
        
        if don_exists:
            # Check and migrate donations columns
            try:
                conn.execute("SELECT bank_auth_code FROM donations LIMIT 1")
            except sqlite3.OperationalError:
                conn.execute("ALTER TABLE donations ADD COLUMN bank_auth_code TEXT")
                conn.execute("ALTER TABLE donations ADD COLUMN bank_transaction_id TEXT")

            try:
                conn.execute("SELECT certificate_recipient FROM donations LIMIT 1")
            except sqlite3.OperationalError:
                conn.execute("ALTER TABLE donations ADD COLUMN certificate_recipient TEXT")
                conn.execute("ALTER TABLE donations ADD COLUMN certificate_message TEXT")

        conn.executescript(SCHEMA)

        # Clean up organizations that are not in the allowed DEMOS list
        allowed_slugs = [demo[0] for demo in DEMOS]
        placeholders = ",".join("?" for _ in allowed_slugs)
        conn.execute(f"DELETE FROM organizations WHERE slug NOT IN ({placeholders})", allowed_slugs)

        if conn.execute("SELECT COUNT(*) FROM organizations").fetchone()[0] == 0:
            for index, demo in enumerate(DEMOS, start=1):
                org_id = insert_org(conn, demo)
                seed_org(conn, org_id, index)
        
        # Ensure all campaigns in CAMPAIGNS exist for all organizations
        org_rows = conn.execute("SELECT id FROM organizations").fetchall()
        for org in org_rows:
            org_id = org[0]
            for sort_order, (slug, title, category, summary, target, suggestions) in enumerate(CAMPAIGNS, start=1):
                exists = conn.execute("SELECT 1 FROM campaigns WHERE organization_id=? AND slug=?", (org_id, slug)).fetchone()
                if not exists:
                    conn.execute(
                        """
                        INSERT INTO campaigns
                        (organization_id,slug,title,category,summary,story,target_cents,collected_cents,suggested_amounts,visual,featured,active,sort_order,created_at,updated_at)
                        VALUES (?,?,?,?,?,?,?,0,?,?,?,1,?,?,?)
                        """,
                        (org_id, slug, title, category, summary,
                         f"{title} kampanyası, bağışların makbuzlandığı ve operasyon sürecine otomatik işlendiği E-İnfak altyapısı ile yönetilir.",
                         target * 100, json.dumps(suggestions), visual(category), 0, sort_order, now_iso(), now_iso())
                    )
        
        refresh_seed_texts(conn)


def insert_org(conn: sqlite3.Connection, demo: tuple[str, ...]) -> int:
    slug, name, domain, theme, primary, accent, city, tagline = demo
    created = now_iso()
    cur = conn.execute(
        """
        INSERT INTO organizations
        (slug,name,domain,theme,primary_color,accent_color,city,tagline,description,iban,phone,email,address,status,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?)
        """,
        (slug, name, domain, theme, primary, accent, city, tagline,
         f"{name}, online bağış sitesi ve E-İnfak otomasyon paneli ile tüm bağış süreçlerini tek merkezden yönetir.",
         "TR00 0000 0000 0000 0000 0000 00", "+90 212 000 00 00", f"iletisim@{domain}", f"{city} merkez ofis", created),
    )
    return int(cur.lastrowid)


def seed_org(conn: sqlite3.Connection, org_id: int, org_index: int) -> None:
    created = now_iso()
    for sort_order, (slug, title, category, summary, target, suggestions) in enumerate(CAMPAIGNS, start=1):
        # Kampanyaları sıfırdan başlatalım, bağışlar eklendikçe dinamik biriksin
        conn.execute(
            """
            INSERT OR IGNORE INTO campaigns
            (organization_id,slug,title,category,summary,story,target_cents,collected_cents,suggested_amounts,visual,featured,active,sort_order,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,0,?,?,?,?,?,?,?)
            """,
            (org_id, slug, title, category, summary,
             f"{title} kampanyası, bağışların makbuzlandığı ve operasyon sürecine otomatik işlendiği E-İnfak altyapısı ile yönetilir.",
             target * 100, json.dumps(suggestions), visual(category), 1 if sort_order <= 5 else 0, 1, sort_order, created, created),
        )
    for i, country in enumerate(["Nijer", "Türkiye", "Somali"], start=1):
        conn.execute(
            """
            INSERT OR IGNORE INTO kurban_animals
            (organization_id,code,animal_type,region,country,total_shares,share_price_cents,status,video_url,slaughter_date,note,created_at,updated_at)
            VALUES (?,?,?,?,?,7,?,'open','','','Demo kurban operasyon kaydı',?,?)
            """,
            (org_id, f"KRB-{org_id:02d}-{i:03d}", "buyukbas", country, country, 7_500_00, created, created),
        )
    for title, owner, priority, days in [
        ("Yeni bağış videosu yükle", "Muhasebe", "high", 1),
        ("Banka hareketlerini eşleştir", "Bağışçı Temsilcisi", "normal", 2),
        ("Kurban SMS listesini kontrol et", "Operasyon", "normal", 3),
    ]:
        conn.execute(
            "INSERT INTO tasks (organization_id,title,owner,priority,status,due_at,created_at) VALUES (?,?,?,?,?,?,?)",
            (org_id, title, owner, priority, "open", (utc_now() + timedelta(days=days)).date().isoformat(), created),
        )
    conn.execute("INSERT INTO users (organization_id,full_name,email,role,active,created_at) VALUES (?,?,?,?,1,?)",
                 (org_id, "Demo Yönetici", "admin@e-infak.org", "yonetici", created))
    conn.execute("INSERT INTO message_templates (organization_id,title,channel,body,created_at) VALUES (?,?,?,?,?)",
                 (org_id, "Kurban kesildi bildirimi", "sms", "Sayın {ad}, kurban emanetiniz kesilmiştir. Video: {video}", created))
    
    # 1. Zenginleştirilmiş Banka Hesap Hareketleri
    bank_data = [
        ("Katılım Bankası", "TR00 **** 0001", 5_000_00, "Ahmet Yılmaz", "Gazze yardımı havale", "unmatched", created),
        ("Kuveyt Türk", "TR99 **** 0002", 7_500_00, "Ayşe Demir", "Kurban hisse bedeli", "unmatched", created),
        ("Vakıf Katılım", "TR88 **** 0003", 2_500_00, "Mehmet Kaya", "Zekat bağışı", "unmatched", created),
        ("Ziraat Katılım", "TR77 **** 0004", 1_000_00, "Fatma Çelik", "Yetim sponsorluğu", "unmatched", created),
        ("Türkiye Finans", "TR66 **** 0005", 500_00, "Ali Arslan", "Genel sadaka ödemesi", "unmatched", created),
    ]
    for bank_name, acc, amt, sender, desc, status, date in bank_data:
        conn.execute(
            "INSERT INTO bank_movements (organization_id, bank_name, account_no, amount_cents, sender_name, description, status, happened_at) VALUES (?,?,?,?,?,?,?,?)",
            (org_id, bank_name, acc, amt, sender, desc, status, date)
        )

    # 2. Zenginleştirilmiş CRM Bağışçı Listesi
    donors_data = [
        ("Ahmet Yılmaz", "ahmet@gmail.com", "0532 111 2233", "İstanbul", "bireysel"),
        ("Ayşe Demir", "ayse@hotmail.com", "0542 222 3344", "Ankara", "bireysel"),
        ("Mehmet Kaya", "mehmet@yahoo.com", "0505 333 4455", "Bursa", "bireysel"),
        ("Fatma Çelik", "fatma@outlook.com", "0553 444 5566", "Konya", "bireysel"),
        ("Mustafa Şahin", "mustafa@gmail.com", "0533 555 6677", "İzmir", "bireysel"),
        ("Emine Öztürk", "emine@gmail.com", "0544 666 7788", "Trabzon", "bireysel"),
        ("Ali Arslan", "ali@yandex.com", "0506 777 8899", "Antalya", "bireysel"),
        ("Hatice Yıldız", "hatice@gmail.com", "0555 888 9900", "Gaziantep", "bireysel"),
    ]
    donor_ids = []
    for name, email, phone, city, dtype in donors_data:
        cur = conn.execute(
            "INSERT INTO donors (organization_id, full_name, email, phone, city, donor_type, kvkk, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,1,'Seed donor',?,?)",
            (org_id, name, email, phone, city, dtype, created, created)
        )
        donor_ids.append(cur.lastrowid)

    # 3. Zenginleştirilmiş Bağış Verileri (Grafikler için tarihsel dağılımlı)
    campaign_rows = conn.execute("SELECT id, title, target_cents, slug, category FROM campaigns WHERE organization_id=?", (org_id,)).fetchall()
    
    # Son 6 aydan bağışlar üret
    import random
    random.seed(42 + org_id)
    
    for i in range(1, 41): # Her STK için 40 bağış kaydı
        donor_id_val = random.choice(donor_ids)
        camp = random.choice(campaign_rows)
        
        # Kampanya kurallarına uygun tutarlar
        if camp["category"] == "kurban":
            amount_val = 7_500_00
        elif camp["category"] == "zekat":
            amount_val = random.choice([1_000_00, 2_500_00, 5_000_00])
        else:
            amount_val = random.choice([250_00, 500_00, 1_000_00, 2_000_00])
            
        days_offset = random.randint(1, 180)
        date_val = (utc_now() - timedelta(days=days_offset)).isoformat().replace("+00:00", "Z")
        receipt_val = f"EIF-SEED-{org_id:02d}-{i:06d}"
        
        # Bağış kaydı ekle
        cur = conn.execute(
            """
            INSERT INTO donations 
            (organization_id, donor_id, campaign_id, amount_cents, currency, payment_method, payment_status, receipt_no, note, dedicatee, recurring, created_at)
            VALUES (?,?,?,?,'TRY','card','confirmed',?, 'Seed bağışı', '', 0, ?)
            """,
            (org_id, donor_id_val, camp["id"], amount_val, receipt_val, date_val)
        )
        
        # Kampanya toplamını güncelle
        conn.execute("UPDATE campaigns SET collected_cents = collected_cents + ?, updated_at = ? WHERE id = ?", 
                     (amount_val, date_val, camp["id"]))
        
        # Kurban ise hisse ata
        if camp["category"] == "kurban" or "kurban" in camp["slug"]:
            assign_kurban(conn, org_id, cur.lastrowid, donor_id_val, receipt_val, {})
            
        # SMS Logu ekle
        if i % 3 == 0:
            conn.execute(
                "INSERT INTO message_logs (organization_id, donor_id, channel, target, body, status, created_at) VALUES (?,?,'sms','0532******','Teşekkür ederiz. Bağışınız alınmıştır.','sent',?)",
                (org_id, donor_id_val, date_val)
            )

    # 4. Yetim (Orphans) Seed Verileri
    orphans_data = [
        ("Fatuma Ali", "Somali", 8, "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=250&q=80", "Eğitimine devam ediyor, resim dersinde çok yetenekli. Matematik notu: Pekiyi."),
        ("Bilal Mansur", "Filistin", 9, "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=250&q=80", "Kur'an ezberine devam ediyor, fen bilgisine ilgisi yüksek. Genel ders ortalaması: 94/100."),
        ("Zeynep Demir", "Türkiye", 7, "https://images.unsplash.com/photo-1503919545889-aef636e10ad4?auto=format&fit=crop&w=250&q=80", "İlkokul 1. sınıfa başladı. Okuma yazmayı söktü, oldukça neşeli ve arkadaş canlısı."),
        ("Abdoulaye Kojo", "Nijer", 10, "https://images.unsplash.com/photo-1482731215275-a1f151646268?auto=format&fit=crop&w=250&q=80", "Türkçe öğrenmeye başladı. Matematik ve bilim derslerinde sınıf birincisi. Sağlığı yerinde.")
    ]
    for idx, (name, country, age, photo, report) in enumerate(orphans_data):
        sponsor_id = donor_ids[0] if idx == 0 else None
        status = "sponsored" if idx == 0 else "available"
        conn.execute(
            """
            INSERT INTO orphans (organization_id, full_name, country, age, photo_url, status, sponsor_donor_id, school_report, created_at)
            VALUES (?,?,?,?,?,?,?,?,?)
            """,
            (org_id, name, country, age, photo, status, sponsor_id, report, created)
        )


def refresh_seed_texts(conn: sqlite3.Connection) -> None:
    for demo in DEMOS:
        slug, name, domain, theme, primary, accent, city, tagline = demo
        # Hicret ve Kardeşlik Payı için özel iletişim bilgileri
        phone = "+90 312 444 01 01" if slug == "hicret-dernegi" else "+90 212 555 44 33" if slug == "kardeslik-payi" else "+90 212 000 00 00"
        address = "Hacı Bayram Mah. Anafartalar Cad. No: 45, Altındağ, Ankara" if slug == "hicret-dernegi" else "İskenderpaşa Mah. Sofular Cad. No: 12, Fatih, İstanbul" if slug == "kardeslik-payi" else f"{city} merkez ofis"
        iban = "TR12 0001 0009 0000 1234 5678 90" if slug == "hicret-dernegi" else "TR98 0006 2000 0000 9876 5432 10" if slug == "kardeslik-payi" else "TR00 0000 0000 0000 0000 0000 00"
        
        conn.execute(
            "UPDATE organizations SET name=?,domain=?,theme=?,primary_color=?,accent_color=?,city=?,tagline=?,description=?,phone=?,address=?,iban=?,email=? WHERE slug=?",
            (name, domain, theme, primary, accent, city, tagline,
             f"{name}, online bağış sitesi ve E-İnfak otomasyon paneli ile tüm bağış süreçlerini tek merkezden yönetir.",
             phone, address, iban, f"iletisim@{domain}", slug),
        )
    
    # Bütün organizasyonları çekelim
    org_rows = conn.execute("SELECT id, slug FROM organizations").fetchall()
    for org_id, org_slug in org_rows:
        for slug, title, category, summary, _target, _suggest in CAMPAIGNS:
            img_url = visual(category)
            
            # Özel görsel atamaları
            if org_slug == "hicret-dernegi":
                if category == "su-kuyusu" or slug == "su-kuyusu":
                    img_url = "/images/hicret/talebe 4.png"
                elif category == "hafizlik" or slug == "hafizlik":
                    img_url = "/images/hicret/talebe 1.png"
                elif category == "zekat" or slug == "zekat":
                    img_url = "/images/hicret/talebe 2.png"
                elif category == "sadaka" or slug == "sadaka":
                    img_url = "/images/hicret/talebe 3.png"
                else:
                    img_url = "/images/hicret/talebe 5.jpeg"
            elif org_slug == "kardeslik-payi":
                if slug == "su-kuyusu":
                    img_url = "/images/kardeslik/mahmud-ustaosmanoglu-hazretleri-ks-su-kuyusu-projesi.png"
                elif slug == "yetim":
                    img_url = "/images/kardeslik/yetim-sponsorlugu.jpg"
                elif slug == "zekat":
                    img_url = "/images/kardeslik/genel-bagislar.png"
                elif slug == "gida":
                    img_url = "/images/kardeslik/gida-yardimi.jpg"
                elif slug == "kurban":
                    img_url = "/images/kardeslik/kurban-bagisi.jpg"
                elif slug == "hafizlik":
                    img_url = "/images/kardeslik/kiz-medresesi-insaati.jpg"
                elif slug == "fitre-fidye":
                    img_url = "/images/kardeslik/egitim-bursu.jpg"
                elif slug == "mescit-camii":
                    img_url = "/images/kardeslik/haci-ali-elcin-camii-insaati.png"
                elif slug == "su-kuyusu" or category == "su-kuyusu":
                    img_url = "/images/kardeslik/su-kuyusu.jpg"

            conn.execute(
                "UPDATE campaigns SET title=?,category=?,summary=?,story=?,visual=?,updated_at=? WHERE organization_id=? AND slug=?",
                (title, category, summary,
                 f"{title} kampanyası, bağışların makbuzlandığı ve operasyon sürecine otomatik işlendiği E-İnfak altyapısı ile yönetilir.",
                 img_url, now_iso(), org_id, slug),
            )


def row(row: sqlite3.Row) -> dict[str, Any]:
    return {key: row[key] for key in row.keys()}


def camel(data: dict[str, Any]) -> dict[str, Any]:
    def key(name: str) -> str:
        parts = name.split("_")
        return parts[0] + "".join(part.title() for part in parts[1:])
    return {key(k): v for k, v in data.items()}


def org_out(r: sqlite3.Row) -> dict[str, Any]:
    d = camel(row(r))
    d["primaryColor"] = d.pop("primaryColor")
    return d


def money_out(r: sqlite3.Row, *money_fields: str) -> dict[str, Any]:
    d = row(r)
    for field in money_fields:
        if field in d:
            d[field.removesuffix("_cents")] = amount(d.pop(field))
    return camel(d)


def campaign_out(r: sqlite3.Row) -> dict[str, Any]:
    d = money_out(r, "target_cents", "collected_cents")
    raw_suggested = d.pop("suggestedAmounts") or "[]"
    try:
        d["suggestedAmounts"] = json.loads(raw_suggested)
    except Exception:
        try:
            d["suggestedAmounts"] = [int(x.strip()) for x in raw_suggested.split(",") if x.strip()]
        except Exception:
            d["suggestedAmounts"] = []
    d["featured"] = bool(d["featured"])
    d["active"] = bool(d["active"])
    return d


def bootstrap(conn: sqlite3.Connection, demo_slug: str | None = None, host: str | None = None) -> dict[str, Any]:
    organizations = [org_out(r) for r in conn.execute("SELECT * FROM organizations ORDER BY id")]
    
    # Try finding by host domain first, then by slug, then default to first org
    selected = None
    if host:
        # Virgülle ayrılmış domain listelerini de kapsayacak şekilde kontrol et
        selected = next((o for o in organizations if host in [d.strip().lower() for d in o["domain"].split(",")]), None)
    if not selected and demo_slug:
        selected = next((o for o in organizations if o["slug"] == demo_slug), None)
    if not selected:
        selected = organizations[0]

    campaigns = [campaign_out(r) for r in conn.execute("SELECT * FROM campaigns ORDER BY organization_id, sort_order")]
    donors = [camel(row(r)) for r in conn.execute("SELECT * FROM donors ORDER BY id DESC LIMIT 500")]
    donations = [money_out(r, "amount_cents") for r in conn.execute("SELECT * FROM donations ORDER BY id DESC LIMIT 500")]
    animals = [money_out(r, "share_price_cents") for r in conn.execute("SELECT * FROM kurban_animals ORDER BY id DESC")]
    shares = [camel(row(r)) for r in conn.execute("SELECT * FROM kurban_shares ORDER BY id DESC")]
    bank = [money_out(r, "amount_cents") for r in conn.execute("SELECT * FROM bank_movements ORDER BY id DESC")]
    recurring = [money_out(r, "amount_cents") for r in conn.execute("SELECT * FROM recurring_plans ORDER BY id DESC")]
    pledges = [money_out(r, "pledged_cents", "paid_cents") for r in conn.execute("SELECT * FROM pledges ORDER BY id DESC")]
    orphans = [camel(row(r)) for r in conn.execute("SELECT * FROM orphans ORDER BY id DESC")]
    return {
        "company": {
            "name": "E-İnfak",
            "domain": "e-infak.org",
            "headline": "STK'lar için online bağış sitesi ve güçlü otomasyon altyapısı",
            "subtitle": "Bağış sitesi, bağışçı CRM, makbuz, kurban, sponsorluk, banka hareketleri, SMS/mail ve raporlama tek panelde.",
        },
        "selectedOrganization": selected,
        "organizations": organizations,
        "campaigns": campaigns,
        "donors": donors,
        "donations": donations,
        "kurbanAnimals": animals,
        "kurbanShares": shares,
        "bankMovements": bank,
        "recurringPlans": recurring,
        "pledges": pledges,
        "orphans": orphans,
        "messageLogs": [camel(row(r)) for r in conn.execute("SELECT * FROM message_logs ORDER BY id DESC LIMIT 200")],
        "messageTemplates": [camel(row(r)) for r in conn.execute("SELECT * FROM message_templates ORDER BY id DESC")],
        "tasks": [camel(row(r)) for r in conn.execute("SELECT * FROM tasks ORDER BY id DESC")],
        "users": [camel(row(r)) for r in conn.execute("SELECT * FROM users ORDER BY id DESC")],
        "companyLeads": [camel(row(r)) for r in conn.execute("SELECT * FROM company_leads ORDER BY id DESC")],
        "stats": stats(organizations, campaigns, donors, donations, animals, shares, bank),
    }


def stats(orgs: list[dict[str, Any]], campaigns: list[dict[str, Any]], donors: list[dict[str, Any]],
          donations: list[dict[str, Any]], animals: list[dict[str, Any]], shares: list[dict[str, Any]],
          bank: list[dict[str, Any]]) -> dict[str, Any]:
    assigned = [s for s in shares if s.get("status") not in ("cancelled", "empty")]
    capacity = sum(int(a.get("totalShares") or 0) for a in animals)
    return {
        "tenantCount": len(orgs),
        "campaignCount": len(campaigns),
        "donorCount": len(donors),
        "donationCount": len(donations),
        "totalCollected": amount(sum(int(round(d.get("amount", 0) * 100)) for d in donations)),
        "kurbanAnimalCount": len(animals),
        "kurbanAssignedShareCount": len(assigned),
        "kurbanOpenShareCount": max(0, capacity - len(assigned)),
        "unmatchedBankCount": len([b for b in bank if b.get("status") == "unmatched"]),
    }


def find_org(conn: sqlite3.Connection, slug: str | None) -> sqlite3.Row:
    if slug:
        found = conn.execute("SELECT * FROM organizations WHERE slug=?", (slug,)).fetchone()
        if found:
            return found
    found = conn.execute("SELECT * FROM organizations ORDER BY id LIMIT 1").fetchone()
    if not found:
        raise ValueError("Kurum bulunamadı")
    return found


def donor_id(conn: sqlite3.Connection, org_id: int, payload: dict[str, Any]) -> int:
    name = str(payload.get("fullName") or "").strip()
    if len(name) < 3:
        raise ValueError("Ad soyad zorunlu")
    email = str(payload.get("email") or "").strip().lower()
    phone = str(payload.get("phone") or "").strip()
    existing = None
    if email:
        existing = conn.execute("SELECT id FROM donors WHERE organization_id=? AND lower(email)=?", (org_id, email)).fetchone()
    if not existing and phone:
        existing = conn.execute("SELECT id FROM donors WHERE organization_id=? AND phone=?", (org_id, phone)).fetchone()
    stamp = now_iso()
    if existing:
        conn.execute("UPDATE donors SET full_name=?,email=?,phone=?,city=?,kvkk=?,updated_at=? WHERE id=?",
                     (name, email, phone, payload.get("city", ""), 1 if payload.get("kvkk") else 0, stamp, existing["id"]))
        return int(existing["id"])
    cur = conn.execute(
        "INSERT INTO donors (organization_id,full_name,email,phone,city,donor_type,kvkk,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (org_id, name, email, phone, payload.get("city", ""), payload.get("donorType", "bireysel"),
         1 if payload.get("kvkk") else 0, payload.get("notes", ""), stamp, stamp),
    )
    return int(cur.lastrowid)


def create_donation(conn: sqlite3.Connection, payload: dict[str, Any], host: str) -> dict[str, Any]:
    org = find_org(conn, payload.get("orgSlug"))
    campaign = conn.execute("SELECT * FROM campaigns WHERE organization_id=? AND slug=?", (org["id"], payload.get("campaignSlug"))).fetchone()
    if not campaign:
        raise ValueError("Kampanya bulunamadı")
    value = cents(payload.get("amount"))
    if value < 100:
        raise ValueError("Bağış tutarı geçersiz")
    
    # Kredi kartı bilgileri girilmişse 3D Secure akışını başlat
    if payload.get("paymentMethod") == "card" and payload.get("ccNumber"):
        did = donor_id(conn, int(org["id"]), payload)
        receipt = f"EIF-{utc_now().strftime('%Y%m%d')}-{org['id']:02d}-{conn.execute('SELECT COUNT(*) FROM donations').fetchone()[0] + 1:06d}"
        stamp = now_iso()
        
        # Geçici bağış kaydını 'pending_3d' durumunda oluştur
        cur = conn.execute(
            """
            INSERT INTO donations
            (organization_id,donor_id,campaign_id,amount_cents,currency,payment_method,payment_status,receipt_no,note,dedicatee,recurring,created_at,certificate_recipient,certificate_message)
            VALUES (?,?,?,?,?,?,'pending_3d',?,?,?,?,?,?,?)
            """,
            (org["id"], did, campaign["id"], value, payload.get("currency", "TRY"), "card",
             receipt, payload.get("note", ""), payload.get("dedicatee", ""), 1 if payload.get("recurring") else 0, stamp,
             payload.get("certificateRecipient", ""), payload.get("certificateMessage", "")),
        )
        
        # 3D Secure dönüş adresleri
        proto = "http"
        success_url = f"{proto}://{host}/api/payment/callback"
        fail_url = f"{proto}://{host}/api/payment/callback"
        
        # Banka yönlendirme parametrelerini hazırla
        form_data = VakifKatilimVPOS.prepare_3d_form_data(
            org=org,
            order_id=receipt,
            amount=value / 100.0,
            card_name=payload.get("ccName", ""),
            pan=payload.get("ccNumber", ""),
            expiry=payload.get("ccExpiry", ""),
            cv2=payload.get("ccCvc", ""),
            success_url=success_url,
            fail_url=fail_url
        )
        
        return {
            "vposRedirect": True,
            "gatewayUrl": form_data["gatewayUrl"],
            "inputs": form_data["inputs"]
        }
        
    # Havale veya kart bilgisi girilmeden doğrudan onaylanan bağış akışı (mock)
    did = donor_id(conn, int(org["id"]), payload)
    receipt = f"EIF-{utc_now().strftime('%Y%m%d')}-{org['id']:02d}-{conn.execute('SELECT COUNT(*) FROM donations').fetchone()[0] + 1:06d}"
    stamp = now_iso()
    cur = conn.execute(
        """
        INSERT INTO donations
        (organization_id,donor_id,campaign_id,amount_cents,currency,payment_method,payment_status,receipt_no,note,dedicatee,recurring,created_at,certificate_recipient,certificate_message)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (org["id"], did, campaign["id"], value, payload.get("currency", "TRY"), payload.get("paymentMethod", "card"),
         "confirmed", receipt, payload.get("note", ""), payload.get("dedicatee", ""), 1 if payload.get("recurring") else 0, stamp,
         payload.get("certificateRecipient", ""), payload.get("certificateMessage", "")),
    )
    conn.execute("UPDATE campaigns SET collected_cents=collected_cents+?, updated_at=? WHERE id=?", (value, stamp, campaign["id"]))
    if campaign["category"] == "kurban" or "kurban" in campaign["slug"]:
        assign_kurban(conn, int(org["id"]), int(cur.lastrowid), did, receipt, payload)
    if payload.get("recurring"):
        conn.execute("INSERT INTO recurring_plans (organization_id,donor_id,campaign_id,amount_cents,next_run_at,created_at) VALUES (?,?,?,?,?,?)",
                     (org["id"], did, campaign["id"], value, (utc_now() + timedelta(days=30)).date().isoformat(), stamp))
    return {"receiptNo": receipt, "donationId": int(cur.lastrowid)}


def assign_kurban(conn: sqlite3.Connection, org_id: int, donation_id: int, did: int, receipt: str, payload: dict[str, Any]) -> int:
    # 1. Determine intention type
    note = str(payload.get("note") or "").lower()
    intention = payload.get("intentionType") or ("adak" if "adak" in note else "akika" if "akika" in note else "vacip")
    
    animals = conn.execute("SELECT * FROM kurban_animals WHERE organization_id=? AND status IN ('open','planned') ORDER BY id", (org_id,)).fetchall()
    
    # 2. Try to find a matching animal (same intention or empty)
    for animal in animals:
        shares = conn.execute("SELECT intention_type, share_no FROM kurban_shares WHERE animal_id=?", (animal["id"],)).fetchall()
        used = {r["share_no"] for r in shares}
        
        # If animal is already full, skip
        if len(used) >= int(animal["total_shares"]):
            continue
            
        # Animal is eligible if it has no shares yet, or if its shares match the new intention
        is_empty = len(used) == 0
        has_same_intention = any(r["intention_type"] == intention for r in shares)
        
        if is_empty or has_same_intention:
            for share_no in range(1, int(animal["total_shares"]) + 1):
                if share_no not in used:
                    return insert_share(conn, org_id, int(animal["id"]), share_no, donation_id, did, receipt, payload, intention)
                    
    # 3. Fallback: Create a new animal
    stamp = now_iso()
    code = f"KRB-{org_id:02d}-{conn.execute('SELECT COUNT(*) FROM kurban_animals WHERE organization_id=?', (org_id,)).fetchone()[0] + 1:03d}"
    cur = conn.execute(
        "INSERT INTO kurban_animals (organization_id,code,animal_type,region,country,total_shares,share_price_cents,status,created_at,updated_at) VALUES (?,?,?,?,?,7,?,'open',?,?)",
        (org_id, code, "buyukbas", payload.get("region", "Yurt dışı"), payload.get("country", "Afrika"), cents(payload.get("amount")), stamp, stamp),
    )
    return insert_share(conn, org_id, int(cur.lastrowid), 1, donation_id, did, receipt, payload, intention)


def insert_share(conn: sqlite3.Connection, org_id: int, animal_id: int, share_no: int, donation_id: int,
                 did: int, receipt: str, payload: dict[str, Any], intention: str) -> int:
    stamp = now_iso()
    cur = conn.execute(
        """
        INSERT INTO kurban_shares
        (organization_id,animal_id,share_no,donor_id,donation_id,receipt_no,dedicatee,intention_type,status,video_url,slaughtered_at,notified_at,note,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,'','','',?,?,?)
        """,
        (org_id, animal_id, share_no, did, donation_id, receipt, payload.get("dedicatee", ""), intention,
         "assigned", payload.get("note", ""), stamp, stamp),
    )
    used = conn.execute("SELECT COUNT(*) FROM kurban_shares WHERE animal_id=?", (animal_id,)).fetchone()[0]
    total = conn.execute("SELECT total_shares FROM kurban_animals WHERE id=?", (animal_id,)).fetchone()["total_shares"]
    if used >= total:
        conn.execute("UPDATE kurban_animals SET status='full', updated_at=? WHERE id=?", (stamp, animal_id))
    return int(cur.lastrowid)


def create_tenant(conn: sqlite3.Connection, payload: dict[str, Any]) -> str:
    name = str(payload.get("organizationName") or "").strip()
    domain = str(payload.get("domain") or "").strip().lower()
    if len(name) < 3 or "." not in domain:
        raise ValueError("Kurum adı ve geçerli alan adı zorunlu")
    base = next((d for d in DEMOS if d[0] == payload.get("templateSlug")), DEMOS[0])
    slug = slugify(payload.get("slug") or domain.split(".")[0] or name)
    existing = conn.execute("SELECT id FROM organizations WHERE slug=? OR domain=?", (slug, domain)).fetchone()
    if existing:
        raise ValueError("Bu slug veya domain zaten kayıtlı")
    demo = (slug, name, domain, base[3], base[4], base[5], payload.get("city", "İstanbul"), payload.get("tagline", base[7]))
    org_id = insert_org(conn, demo)
    seed_org(conn, org_id, 1)
    return slug


def generate_callback_hash(oid: str, authcode: str, response: str, md_status: str, conn: sqlite3.Connection) -> tuple[str, str]:
    try:
        parts = oid.split("-")
        org_id = int(parts[2])
        org = conn.execute("SELECT * FROM organizations WHERE id=?", (org_id,)).fetchone()
        store_key = org["vpos_store_key"] if org and org["vpos_store_key"] else "MOCK_STORE_KEY"
        client_id = org["vpos_client_id"] if org and org["vpos_client_id"] else "MOCK_MERCHANT"
    except Exception:
        store_key = "MOCK_STORE_KEY"
        client_id = "MOCK_MERCHANT"
        
    hash_params = "clientid;oid;authcode;response;mdStatus"
    hash_params_val = f"{client_id}{oid}{authcode}{response}{md_status}"
    
    calculated_hash = VakifKatilimVPOS.calculate_hash(hash_params_val, store_key)
    return calculated_hash, hash_params


class Handler(SimpleHTTPRequestHandler):
    server_version = "EInfak/2.0"

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        super().end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            return self.json({"ok": True, "time": now_iso()})
        if parsed.path == "/api/bootstrap":
            demo = parse_qs(parsed.query).get("demo", [None])[0]
            host_header = self.headers.get("Host", "").split(":")[0]
            with db() as conn:
                return self.json(bootstrap(conn, demo, host_header))
        if parsed.path == "/api/export/donations":
            return self.export_donations()
        if parsed.path.startswith("/makbuz/"):
            return self.receipt(unquote(parsed.path.rsplit("/", 1)[-1]))
        return self.static(parsed.path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        
        # Form urlencoded POST isteklerini handle et (Banka / Mock 3D callback'leri)
        if parsed.path == "/api/mock-vpos-gate":
            length = int(self.headers.get("content-length", "0") or 0)
            body_bytes = self.rfile.read(length) if length else b""
            params = {k: v[0] for k, v in parse_qs(body_bytes.decode("utf-8")).items()}
            return self.render_mock_gateway(params)
            
        if parsed.path == "/api/payment/callback":
            length = int(self.headers.get("content-length", "0") or 0)
            body_bytes = self.rfile.read(length) if length else b""
            params = {k: v[0] for k, v in parse_qs(body_bytes.decode("utf-8")).items()}
            return self.process_payment_callback(params)

        try:
            payload = self.body()
            with db() as conn:
                if parsed.path == "/api/donations":
                    host = self.headers.get("Host", "127.0.0.1:8010")
                    result = create_donation(conn, payload, host)
                    conn.commit()
                    return self.json({"ok": True, **result, "data": bootstrap(conn, payload.get("orgSlug"))}, HTTPStatus.CREATED)
                if parsed.path == "/api/sponsorships":
                    org = find_org(conn, payload.get("orgSlug"))
                    orphan_id = int(payload.get("orphanId"))
                    orphan = conn.execute("SELECT * FROM orphans WHERE id=? AND organization_id=?", (orphan_id, org["id"])).fetchone()
                    if not orphan:
                        raise ValueError("Yetim kaydı bulunamadı")
                    
                    did = donor_id(conn, int(org["id"]), payload)
                    stamp = now_iso()
                    
                    conn.execute("UPDATE orphans SET sponsor_donor_id=?, status='sponsored' WHERE id=?", (did, orphan_id))
                    
                    campaign = conn.execute("SELECT id FROM campaigns WHERE organization_id=? AND (slug LIKE '%yardim%' OR category='acil') LIMIT 1", (org["id"],)).fetchone()
                    campaign_id = campaign["id"] if campaign else 1
                    
                    value = cents(payload.get("amount", 500))
                    receipt = f"EIF-SPN-{utc_now().strftime('%Y%m%d')}-{org['id']:02d}-{conn.execute('SELECT COUNT(*) FROM donations').fetchone()[0] + 1:06d}"
                    
                    conn.execute(
                        """
                        INSERT INTO donations
                        (organization_id, donor_id, campaign_id, amount_cents, currency, payment_method, payment_status, receipt_no, note, recurring, created_at)
                        VALUES (?, ?, ?, ?, 'TRY', 'card', 'confirmed', ?, 'Yetim Sponsorluğu İlk Ödeme', 1, ?)
                        """,
                        (org["id"], did, campaign_id, value, receipt, stamp)
                    )
                    
                    conn.execute(
                        """
                        INSERT INTO recurring_plans (organization_id, donor_id, campaign_id, amount_cents, next_run_at, created_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (org["id"], did, campaign_id, value, (utc_now() + timedelta(days=30)).date().isoformat(), stamp)
                    )
                    
                    conn.commit()
                    return self.json({"ok": True, "receiptNo": receipt, "data": bootstrap(conn, payload.get("orgSlug"))}, HTTPStatus.CREATED)
                if parsed.path == "/api/company-leads":
                    conn.execute(
                        "INSERT INTO company_leads (organization_name,full_name,phone,email,employee_range,monthly_volume,selected_demo,note,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                        (payload.get("organizationName", ""), payload.get("fullName", ""), payload.get("phone", ""),
                         payload.get("email", ""), payload.get("employeeRange", ""), payload.get("monthlyVolume", ""),
                         payload.get("selectedDemo", ""), payload.get("note", ""), "new", now_iso()),
                    )
                    conn.commit()
                    return self.json({"ok": True, "data": bootstrap(conn)}, HTTPStatus.CREATED)
                if parsed.path == "/api/campaigns":
                    import random
                    org = find_org(conn, payload.get("orgSlug"))
                    title = str(payload.get("title") or "").strip()
                    category = str(payload.get("category") or "sadaka").strip()
                    summary = str(payload.get("summary") or "").strip()
                    story = str(payload.get("story") or "").strip()
                    target_cents = cents(payload.get("target"))
                    suggested = payload.get("suggestedAmounts") or [100, 250, 500, 1000]
                    visual_url = str(payload.get("visual") or "").strip() or visual(category)
                    
                    if len(title) < 3:
                        raise ValueError("Kampanya başlığı en az 3 karakter olmalıdır")
                        
                    slug = slugify(title)
                    existing = conn.execute("SELECT 1 FROM campaigns WHERE organization_id=? AND slug=?", (org["id"], slug)).fetchone()
                    if existing:
                        slug = f"{slug}-{random.randint(100, 999)}"
                        
                    stamp = now_iso()
                    conn.execute(
                        """
                        INSERT INTO campaigns
                        (organization_id, slug, title, category, summary, story, target_cents, collected_cents, suggested_amounts, visual, featured, active, sort_order, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, 1, 99, ?, ?)
                        """,
                        (org["id"], slug, title, category, summary, story, target_cents, json.dumps(suggested), visual_url, stamp, stamp)
                    )
                    conn.commit()
                    return self.json({"ok": True, "data": bootstrap(conn, payload.get("orgSlug"))}, HTTPStatus.CREATED)
                if parsed.path == "/api/tenants":
                    slug = create_tenant(conn, payload)
                    conn.commit()
                    return self.json({"ok": True, "slug": slug, "data": bootstrap(conn, slug)}, HTTPStatus.CREATED)
                if parsed.path == "/api/kurban/animals":
                    org = find_org(conn, payload.get("orgSlug"))
                    stamp = now_iso()
                    conn.execute(
                        "INSERT INTO kurban_animals (organization_id,code,animal_type,region,country,total_shares,share_price_cents,status,video_url,slaughter_date,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        (org["id"], payload.get("code") or f"KRB-{org['id']:02d}-YENI", payload.get("animalType", "buyukbas"),
                         payload.get("region", "Yurt dışı"), payload.get("country", "Afrika"), int(payload.get("totalShares") or 7),
                         cents(payload.get("sharePrice")), payload.get("status", "open"), payload.get("videoUrl", ""),
                         payload.get("slaughterDate", ""), payload.get("note", ""), stamp, stamp),
                    )
                    conn.commit()
                    return self.json({"ok": True, "data": bootstrap(conn, payload.get("orgSlug"))}, HTTPStatus.CREATED)
                if parsed.path == "/api/kurban/auto-assign":
                    conn.commit()
                    return self.json({"ok": True, "assigned": 0, "data": bootstrap(conn, payload.get("orgSlug"))})
                if parsed.path == "/api/messages/send":
                    org = find_org(conn, payload.get("orgSlug"))
                    conn.execute("INSERT INTO message_logs (organization_id,donor_id,channel,target,body,status,created_at) VALUES (?,?,?,?,?,?,?)",
                                 (org["id"], payload.get("donorId"), payload.get("channel", "sms"), payload.get("target", ""), payload.get("body", ""), "queued", now_iso()))
                    conn.commit()
                    return self.json({"ok": True, "data": bootstrap(conn, payload.get("orgSlug"))}, HTTPStatus.CREATED)
                if parsed.path == "/api/bank/match":
                    bank_id = int(payload.get("bankMovementId"))
                    did = int(payload.get("donorId"))
                    camp_id = int(payload.get("campaignId"))
                    org_slug = payload.get("orgSlug")
                    
                    bank_mov = conn.execute("SELECT * FROM bank_movements WHERE id=?", (bank_id,)).fetchone()
                    if not bank_mov:
                        raise ValueError("Banka hareketi bulunamadı")
                    if bank_mov["status"] == "matched":
                        raise ValueError("Bu hareket zaten eşleştirilmiş")
                        
                    donor = conn.execute("SELECT * FROM donors WHERE id=?", (did,)).fetchone()
                    if not donor:
                        raise ValueError("Bağışçı bulunamadı")
                        
                    camp = conn.execute("SELECT * FROM campaigns WHERE id=?", (camp_id,)).fetchone()
                    if not camp:
                        raise ValueError("Kampanya bulunamadı")
                        
                    stamp = now_iso()
                    receipt = f"EIF-BANK-{bank_mov['organization_id']:02d}-{conn.execute('SELECT COUNT(*) FROM donations').fetchone()[0] + 1:06d}"
                    
                    conn.execute(
                        """
                        INSERT INTO donations
                        (organization_id, donor_id, campaign_id, amount_cents, currency, payment_method, payment_status, receipt_no, note, dedicatee, recurring, created_at)
                        VALUES (?,?,?,?,'TRY','bank','confirmed',?,?, '', 0, ?)
                        """,
                        (bank_mov["organization_id"], did, camp_id, bank_mov["amount_cents"], receipt, f"Banka Havalesi Eşleştirme: {bank_mov['description']}", stamp)
                    )
                    
                    conn.execute("UPDATE campaigns SET collected_cents=collected_cents+?, updated_at=? WHERE id=?", 
                                 (bank_mov["amount_cents"], stamp, camp_id))
                                 
                    if camp["category"] == "kurban" or "kurban" in camp["slug"]:
                        assign_kurban(conn, bank_mov["organization_id"], conn.execute("SELECT last_insert_rowid()").fetchone()[0], did, receipt, {})
                        
                    conn.execute("UPDATE bank_movements SET status='matched', matched_donation_id=last_insert_rowid() WHERE id=?", (bank_id,))
                    
                    conn.commit()
                    return self.json({"ok": True, "data": bootstrap(conn, org_slug)})
        except Exception as exc:
            return self.json({"ok": False, "error": str(exc)}, HTTPStatus.BAD_REQUEST)
        return self.json({"ok": False, "error": "Endpoint bulunamadı"}, HTTPStatus.NOT_FOUND)

    def render_mock_gateway(self, params: dict[str, str]) -> None:
        oid = params.get("oid", "")
        amount_val = params.get("amount", "")
        ok_url = params.get("okUrl", "")
        fail_url = params.get("failUrl", "")
        client_id = params.get("clientid", "")
        rnd = params.get("rnd", "")
        
        with db() as conn:
            success_hash, hash_params = generate_callback_hash(oid, "AUTH-9923", "Approved", "1", conn)
            fail_hash, _ = generate_callback_hash(oid, "", "Declined", "0", conn)
            
        body = f"""<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <title>Vakıf Katılım 3D Secure Simülasyonu</title>
  <style>
    body {{ font-family: Arial,sans-serif; background: #f0f4f2; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; color: #2e4a3f; }}
    .box {{ width: 100%; max-width: 440px; background: white; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.1); overflow: hidden; }}
    .header {{ background: #005c3d; color: #f5b92b; padding: 20px; text-align: center; font-weight: bold; font-size: 18px; border-bottom: 4px solid #f5b92b; }}
    .content {{ padding: 24px; }}
    .row {{ display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 8px; }}
    .row span:first-child {{ color: #718096; }}
    .row span:last-child {{ font-weight: bold; }}
    .otp-input {{ width: 100%; box-sizing: border-box; text-align: center; font-size: 20px; letter-spacing: 6px; padding: 12px; margin: 20px 0; border: 2px solid #cbd5e0; border-radius: 8px; outline: none; }}
    .otp-input:focus {{ border-color: #005c3d; }}
    .actions {{ display: flex; gap: 12px; margin-top: 10px; }}
    .btn {{ flex: 1; padding: 14px; border: none; border-radius: 8px; font-weight: bold; font-size: 15px; cursor: pointer; text-align: center; text-decoration: none; }}
    .btn-success {{ background: #005c3d; color: white; }}
    .btn-success:hover {{ background: #00462e; }}
    .btn-danger {{ background: #e53e3e; color: white; }}
    .btn-danger:hover {{ background: #c53030; }}
  </style>
</head>
<body>
  <div class="box">
    <div class="header">VAKIF KATILIM 3D SECURE</div>
    <div class="content">
      <div class="row"><span>İşyeri / STK</span><span>E-İnfak Bağış Sistemi</span></div>
      <div class="row"><span>Sipariş No (Oid)</span><span>{html.escape(oid)}</span></div>
      <div class="row"><span>Tutar</span><span>{html.escape(amount_val)} TL</span></div>
      
      <p style="font-size:13px; text-align:center; color:#4a5568; margin-top:20px;">Lütfen telefonunuza gelen 6 haneli şifreyi giriniz.<br><b>(Test için herhangi bir şifre girip Doğrula butonuna basın)</b></p>
      
      <input type="text" class="otp-input" value="123456" maxlength="6">
      
      <div class="actions">
        <form method="POST" action="{html.escape(ok_url)}" style="flex:1;">
          <input type="hidden" name="clientid" value="{html.escape(client_id)}">
          <input type="hidden" name="oid" value="{html.escape(oid)}">
          <input type="hidden" name="authcode" value="AUTH-9923">
          <input type="hidden" name="response" value="Approved">
          <input type="hidden" name="mdStatus" value="1">
          <input type="hidden" name="transId" value="VK-TX-{rnd}">
          <input type="hidden" name="HASHPARAMS" value="{html.escape(hash_params)}">
          <input type="hidden" name="HASHPARAMSVAL" value="{html.escape(client_id + oid + 'AUTH-9923' + 'Approved' + '1')}">
          <input type="hidden" name="HASH" value="{html.escape(success_hash)}">
          <button class="btn btn-success" type="submit">Doğrula</button>
        </form>
        
        <form method="POST" action="{html.escape(fail_url)}" style="flex:1;">
          <input type="hidden" name="clientid" value="{html.escape(client_id)}">
          <input type="hidden" name="oid" value="{html.escape(oid)}">
          <input type="hidden" name="authcode" value="">
          <input type="hidden" name="response" value="Declined">
          <input type="hidden" name="mdStatus" value="0">
          <input type="hidden" name="err" value="Kullanici islemi iptal etti.">
          <input type="hidden" name="HASHPARAMS" value="{html.escape(hash_params)}">
          <input type="hidden" name="HASHPARAMSVAL" value="{html.escape(client_id + oid + '' + 'Declined' + '0')}">
          <input type="hidden" name="HASH" value="{html.escape(fail_hash)}">
          <button class="btn btn-danger" type="submit">İptal Et</button>
        </form>
      </div>
    </div>
  </div>
</body>
</html>"""
        data = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def process_payment_callback(self, params: dict[str, str]) -> None:
        oid = params.get("oid", "")
        authcode = params.get("authcode", "")
        response = params.get("response", "")
        md_status = params.get("mdStatus", "")
        err_msg = params.get("err", "") or params.get("ErrMsg", "Ödeme onaylanmadı.")

        org_slug = "rahmet-eli"
        try:
            parts = oid.split("-")
            org_id = int(parts[2])
            with db() as conn:
                org = conn.execute("SELECT * FROM organizations WHERE id=?", (org_id,)).fetchone()
                if org:
                    org_slug = org["slug"]
                    store_key = org["vpos_store_key"] or "MOCK_STORE_KEY"
                else:
                    store_key = "MOCK_STORE_KEY"
        except Exception:
            store_key = "MOCK_STORE_KEY"

        is_valid = VakifKatilimVPOS.verify_callback_signature(params, store_key)
        success = is_valid and response == "Approved" and md_status in ("1", "2", "3", "4")
        
        if success:
            with db() as conn:
                donation = conn.execute("SELECT * FROM donations WHERE receipt_no=?", (oid,)).fetchone()
                if donation and donation["payment_status"] == "pending_3d":
                    conn.execute("UPDATE donations SET payment_status='confirmed', bank_auth_code=?, bank_transaction_id=? WHERE id=?",
                                 (authcode, params.get("transId", "TRANS-1234"), donation["id"]))
                    conn.execute("UPDATE campaigns SET collected_cents=collected_cents+?, updated_at=? WHERE id=?", 
                                 (donation["amount_cents"], now_iso(), donation["campaign_id"]))
                    
                    campaign = conn.execute("SELECT * FROM campaigns WHERE id=?", (donation["campaign_id"],)).fetchone()
                    if campaign and (campaign["category"] == "kurban" or "kurban" in campaign["slug"]):
                        assign_kurban(conn, donation["organization_id"], donation["id"], donation["donor_id"], oid, {})
                    
                    if donation["recurring"]:
                        conn.execute("INSERT INTO recurring_plans (organization_id,donor_id,campaign_id,amount_cents,next_run_at,created_at) VALUES (?,?,?,?,?,?)",
                                     (donation["organization_id"], donation["donor_id"], donation["campaign_id"], donation["amount_cents"], 
                                      (utc_now() + timedelta(days=30)).date().isoformat(), now_iso()))
                    conn.commit()
            
            self.send_response(HTTPStatus.SEE_OTHER.value)
            self.send_header("Location", f"/makbuz/{oid}")
            self.end_headers()
        else:
            with db() as conn:
                conn.execute("UPDATE donations SET payment_status='failed' WHERE receipt_no=?", (oid,))
                conn.commit()
                
            body = f"""<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <title>Ödeme Başarısız</title>
  <style>
    body {{ font-family: Arial,sans-serif; background: #f7fafc; padding: 40px; text-align: center; color: #2d3748; }}
    .box {{ max-width: 500px; margin: 80px auto; background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.08); }}
    h1 {{ color: #e53e3e; font-size: 24px; margin-bottom: 16px; }}
    p {{ font-size: 16px; line-height: 1.5; color: #4a5568; margin-bottom: 24px; }}
    .btn {{ display: inline-block; padding: 12px 28px; background: #3182ce; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; transition: background 0.2s; }}
    .btn:hover {{ background: #2b6cb0; }}
  </style>
</head>
<body>
  <div class="box">
    <h1>Ödeme Başarısız</h1>
    <p>{html.escape(err_msg)}</p>
    <a href="/#/demo/{html.escape(org_slug)}" class="btn">Bağış Sayfasına Dön</a>
  </div>
</body>
</html>"""
            data = body.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    def do_PATCH(self) -> None:
        parsed = urlparse(self.path)
        try:
            payload = self.body()
            with db() as conn:
                if parsed.path.startswith("/api/tenants/") and parsed.path.endswith("/vpos"):
                    slug = parsed.path.split("/")[-2]
                    conn.execute(
                        """
                        UPDATE organizations 
                        SET vpos_provider=?, vpos_client_id=?, vpos_store_key=?, vpos_username=?, vpos_password=?, vpos_test_mode=? 
                        WHERE slug=?
                        """,
                        (payload.get("vposProvider", "mock"), payload.get("vposClientId", ""),
                         payload.get("vposStoreKey", ""), payload.get("vposUsername", ""),
                         payload.get("vposPassword", ""), 1 if payload.get("vposTestMode") else 0, slug)
                    )
                    conn.commit()
                    return self.json({"ok": True, "data": bootstrap(conn, slug)})
                if parsed.path.startswith("/api/kurban/shares/"):
                    share_id = int(parsed.path.rsplit("/", 1)[-1])
                    status = payload.get("status", "assigned")
                    stamp = now_iso()
                    conn.execute("UPDATE kurban_shares SET status=?, updated_at=?, slaughtered_at=CASE WHEN ? IN ('slaughtered','video-ready','completed') THEN COALESCE(NULLIF(slaughtered_at,''),?) ELSE slaughtered_at END, notified_at=CASE WHEN ?='completed' THEN COALESCE(NULLIF(notified_at,''),?) ELSE notified_at END WHERE id=?",
                                 (status, stamp, status, stamp, status, stamp, share_id))
                    conn.commit()
                    return self.json({"ok": True, "data": bootstrap(conn, payload.get("orgSlug"))})
                if parsed.path.startswith("/api/kurban/animals/"):
                    animal_id = int(parsed.path.rsplit("/", 1)[-1])
                    status = payload.get("status", "open")
                    conn.execute("UPDATE kurban_animals SET status=?, updated_at=? WHERE id=?", (status, now_iso(), animal_id))
                    conn.commit()
                    return self.json({"ok": True, "data": bootstrap(conn, payload.get("orgSlug"))})
                if parsed.path.startswith("/api/campaigns/"):
                    camp_id = int(parsed.path.rsplit("/", 1)[-1])
                    title = str(payload.get("title") or "").strip()
                    category = str(payload.get("category") or "").strip()
                    summary = str(payload.get("summary") or "").strip()
                    story = str(payload.get("story") or "").strip()
                    target_cents = cents(payload.get("target"))
                    suggested = payload.get("suggestedAmounts") or [100, 250, 500, 1000]
                    visual_url = str(payload.get("visual") or "").strip()
                    active = 1 if payload.get("active") else 0
                    
                    conn.execute(
                        """
                        UPDATE campaigns 
                        SET title=?, category=?, summary=?, story=?, target_cents=?, suggested_amounts=?, visual=?, active=?, updated_at=?
                        WHERE id=?
                        """,
                        (title, category, summary, story, target_cents, json.dumps(suggested), visual_url, active, now_iso(), camp_id)
                    )
                    conn.commit()
                    return self.json({"ok": True, "data": bootstrap(conn, payload.get("orgSlug"))})
        except Exception as exc:
            return self.json({"ok": False, "error": str(exc)}, HTTPStatus.BAD_REQUEST)
        return self.json({"ok": False, "error": "Endpoint bulunamadı"}, HTTPStatus.NOT_FOUND)

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        try:
            params = {k: v[0] for k, v in parse_qs(parsed.query).items()}
            org_slug = params.get("orgSlug")
            with db() as conn:
                if parsed.path.startswith("/api/campaigns/"):
                    camp_id = int(parsed.path.rsplit("/", 1)[-1])
                    conn.execute("DELETE FROM campaigns WHERE id=?", (camp_id,))
                    conn.commit()
                    return self.json({"ok": True, "data": bootstrap(conn, org_slug)})
        except Exception as exc:
            return self.json({"ok": False, "error": str(exc)}, HTTPStatus.BAD_REQUEST)
        return self.json({"ok": False, "error": "Endpoint bulunamadı"}, HTTPStatus.NOT_FOUND)

    def body(self) -> dict[str, Any]:
        length = int(self.headers.get("content-length", "0") or 0)
        return json.loads(self.rfile.read(length).decode("utf-8")) if length else {}

    def json(self, payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status.value)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def static(self, path: str) -> None:
        target = PUBLIC / ("index.html" if path in ("", "/") else path.lstrip("/"))
        if not target.exists() or target.is_dir() or not str(target.resolve()).startswith(str(PUBLIC.resolve())):
            target = PUBLIC / "index.html"
        types = {".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8"}
        data = target.read_bytes()
        self.send_response(HTTPStatus.OK.value)
        self.send_header("Content-Type", types.get(target.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def export_donations(self) -> None:
        with db() as conn:
            rows = conn.execute(
                "SELECT o.name kurum,d.receipt_no makbuz,don.full_name bagisci,c.title kampanya,d.amount_cents/100.0 tutar,d.currency para_birimi,d.payment_method odeme,d.created_at tarih FROM donations d LEFT JOIN organizations o ON o.id=d.organization_id LEFT JOIN donors don ON don.id=d.donor_id LEFT JOIN campaigns c ON c.id=d.campaign_id ORDER BY d.id DESC"
            ).fetchall()
        import io
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["Kurum", "Makbuz", "Bağışçı", "Kampanya", "Tutar", "Para Birimi", "Ödeme", "Tarih"])
        for r in rows:
            writer.writerow([r[k] for k in r.keys()])
        data = buf.getvalue().encode("utf-8-sig")
        self.send_response(HTTPStatus.OK.value)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Content-Disposition", "attachment; filename=bagislar.csv")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def receipt(self, receipt_no: str) -> None:
        with db() as conn:
            r = conn.execute(
                "SELECT d.*,o.name org_name,don.full_name donor_name,c.title campaign_title FROM donations d LEFT JOIN organizations o ON o.id=d.organization_id LEFT JOIN donors don ON don.id=d.donor_id LEFT JOIN campaigns c ON c.id=d.campaign_id WHERE d.receipt_no=?",
                (receipt_no,),
            ).fetchone()
        if not r:
            self.send_error(404)
            return

        cert_html = ""
        if r['certificate_recipient']:
            msg_html = f"<div style='background: rgba(212,175,55,0.06); border: 1px dashed #d4af37; border-radius: 6px; padding: 16px; font-size: 14px; color: #451a03; font-style: italic; max-width: 500px; margin: 0 auto 30px;'>\"{html.escape(r['certificate_message'] or '')}\"</div>" if r['certificate_message'] else ""
            cert_html = f"""
            <div class='cert-container' style='margin-top: 30px; border: 8px double #d4af37; padding: 40px; background: #fffdf9; position: relative; text-align: center; font-family: "Georgia", serif; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); box-sizing: border-box;'>
                <div style='font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #a16207; font-weight: bold; margin-bottom: 20px;'>E-İnfak Sertifika Hizmetleri</div>
                <h1 style='font-size: 2.2rem; color: #1e293b; margin: 0 0 10px 0; font-weight: normal; font-family: "Georgia", serif;'>BAĞIŞ SERTİFİKASI</h1>
                <div style='width: 60px; height: 2px; background: #d4af37; margin: 0 auto 30px;'></div>
                
                <p style='font-style: italic; font-size: 16px; color: #475569; margin-bottom: 8px;'>Bu sertifika sayın</p>
                <h2 style='font-size: 1.8rem; color: #854d0e; margin: 0 0 20px 0; font-family: "Georgia", serif;'>{html.escape(r['certificate_recipient'] or '')}</h2>
                
                <p style='font-size: 15px; color: #334155; line-height: 1.7; max-width: 580px; margin: 0 auto 20px;'>
                    adına, <strong>{html.escape(r['donor_name'] or '')}</strong> tarafından gerçekleştirilen 
                    <strong>{amount(r['amount_cents'])} {html.escape(r['currency'])}</strong> tutarındaki bağış vesilesiyle, 
                    <strong>{html.escape(r['org_name'] or '')}</strong> bünyesindeki <em>"{html.escape(r['campaign_title'] or '')}"</em> projesine 
                    katkıda bulunulduğunu belgelemek amacıyla düzenlenmiştir.
                </p>
                
                {msg_html}
                
                <div style='display: flex; justify-content: space-between; align-items: flex-end; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 20px;'>
                    <div style='text-align: left; font-size: 12px; color: #64748b;'>
                        <strong>Tarih:</strong> {html.escape(r['created_at'].split('T')[0])}<br>
                        <strong>Sertifika No:</strong> CERT-{html.escape(receipt_no)}
                    </div>
                    <div style='text-align: right; position: relative;'>
                        <div style='width: 70px; height: 70px; border-radius: 50%; border: 3px double #d4af37; display: flex; align-items: center; justify-content: center; color: #d4af37; font-weight: bold; font-size: 11px; transform: rotate(-15deg); margin-left: auto;'>RESMİ MÜHÜR</div>
                        <span style='font-size: 12px; color: #475569; display: block; margin-top: 6px;'>{html.escape(r['org_name'] or '')} Yönetimi</span>
                    </div>
                </div>
            </div>
            
            <div style='text-align: center; margin-top: 24px;' class='no-print'>
                <button onclick='window.print()' style='padding: 10px 20px; font-size: 13px; font-weight: bold; background: #1e293b; color: #fff; border: 0; border-radius: 6px; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.1);'>Sertifikayı Yazdır / İndir</button>
            </div>
            """

        body = f"""<!doctype html>
<html lang='tr'>
<head>
  <meta charset='utf-8'>
  <title>Makbuz {html.escape(receipt_no)}</title>
  <style>
    body {{ font-family: 'Inter', Arial, sans-serif; background: #f8fafc; padding: 40px 20px; color: #1e293b; margin: 0; }}
    .box {{ max-width: 720px; margin: auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.04); border: 1px solid #e2e8f0; }}
    .receipt-header {{ display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f766e; padding-bottom: 20px; margin-bottom: 30px; }}
    .receipt-title {{ text-align: right; }}
    .receipt-title h1 {{ margin: 0; font-size: 1.6rem; color: #0f766e; font-weight: 800; }}
    .receipt-title p {{ margin: 4px 0 0; font-size: 12px; color: #64748b; font-weight: 600; }}
    .logo-box {{ display: flex; align-items: center; gap: 10px; }}
    .logo-icon {{ width: 36px; height: 36px; background: #0f766e; color: #fff; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 15px; }}
    .logo-text {{ font-size: 1.15rem; font-weight: 800; color: #1e293b; }}
    
    .receipt-table {{ width: 100%; border-collapse: collapse; margin-bottom: 30px; }}
    .receipt-table th {{ text-align: left; padding: 12px; background: #f8fafc; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #e2e8f0; }}
    .receipt-table td {{ padding: 14px 12px; font-size: 13.5px; border-bottom: 1px solid #f1f5f9; color: #334155; }}
    .receipt-table tr:last-child td {{ border-bottom: 2px solid #e2e8f0; }}
    .label-col {{ font-weight: bold; color: #475569; width: 30%; }}
    
    .receipt-footer {{ display: flex; justify-content: space-between; align-items: flex-end; margin-top: 40px; border-top: 1px solid #f1f5f9; padding-top: 20px; font-size: 12px; color: #64748b; }}
    .seal-box {{ text-align: center; transform: rotate(-10deg); border: 3px double #0f766e; color: #0f766e; padding: 8px 16px; border-radius: 8px; font-weight: 900; font-size: 11px; display: inline-block; }}
    
    @media print {{
      body {{ background: none; padding: 0; color: #000; }}
      .no-print {{ display: none !important; }}
      .box {{ box-shadow: none; padding: 0; border: 0; max-width: 100%; }}
      .receipt-header {{ border-bottom-color: #000; }}
      .logo-icon {{ border: 1px solid #000; background: #000 !important; color: #fff !important; }}
      .receipt-table th {{ background: #f0f0f0; border-bottom-color: #000; }}
      .receipt-table td {{ border-bottom-color: #e0e0e0; }}
      .seal-box {{ border-color: #000; color: #000; }}
      .cert-container {{ border: 4px double #000 !important; box-shadow: none !important; margin-top: 40px !important; page-break-before: always; }}
    }}
  </style>
</head>
<body>
<div class='box'>
  <div class='receipt-header'>
    <div class='logo-box'>
      <div class='logo-icon'>E</div>
      <div class='logo-text'>{html.escape(r['org_name'] or '')}</div>
    </div>
    <div class='receipt-title'>
      <h1>BAĞIŞ MAKBUZU</h1>
      <p>Makbuz No: {html.escape(receipt_no)}</p>
    </div>
  </div>
  
  <table class='receipt-table'>
    <tr>
      <td class='label-col'>Bağışçı</td>
      <td>{html.escape(r['donor_name'] or '')}</td>
    </tr>
    <tr>
      <td class='label-col'>Kampanya / Proje</td>
      <td>{html.escape(r['campaign_title'] or '')}</td>
    </tr>
    <tr>
      <td class='label-col'>Bağış Tutarı</td>
      <td style='font-size: 16px; font-weight: 900; color: #0f766e;'>{amount(r['amount_cents'])} {html.escape(r['currency'])}</td>
    </tr>
    <tr>
      <td class='label-col'>Ödeme Yöntemi</td>
      <td>{statuses.get(r['payment_method'], r['payment_method'])} ({statuses.get(r['payment_status'], r['payment_status'])})</td>
    </tr>
    <tr>
      <td class='label-col'>İşlem Tarihi</td>
      <td>{html.escape(r['created_at'].replace('T', ' ').split('.')[0])}</td>
    </tr>
    {f"<tr><td class='label-col'>Banka Onay Kodu</td><td>{html.escape(r['bank_auth_code'])}</td></tr>" if r['bank_auth_code'] else ""}
  </table>
  
  <p style='font-size: 11px; color: #94a3b8; text-align: center; margin: 20px 0;'>
    Bu makbuz E-İnfak Online Bağış ve STK Otomasyonu altyapısı ile dijital olarak oluşturulmuştur.<br>
    Zekat, sadaka ve kurban bağışlarınız fıkhi denetime tabi olarak ilgili projeye aktarılmıştır.
  </p>
  
  <div class='receipt-footer'>
    <div>
      <strong>{html.escape(r['org_name'] or '')}</strong><br>
      E-Posta: iletisim@{html.escape(r['org_name'].lower().replace(' ', ''))}.org
    </div>
    <div style='text-align: right;'>
      <div class='seal-box'>E-İNFAK ONAYLI</div>
    </div>
  </div>
  
  <div style='text-align: center; margin-top: 30px;' class='no-print'>
    <button onclick='window.print()' style='padding: 12px 24px; font-size: 14px; font-weight: bold; background: #0f766e; color: #fff; border: 0; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 12px rgba(15,118,110,0.25); display: inline-flex; align-items: center; gap: 8px;'>
      <span>🖨️</span> Makbuzu Yazdır / PDF Kaydet
    </button>
    <a href='/#/' style='padding: 12px 24px; font-size: 14px; font-weight: bold; background: #f1f5f9; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 8px; text-decoration: none; margin-left: 10px; display: inline-flex; align-items: center;'>Geri Dön</a>
  </div>
</div>
"""
        data = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8010")))
    args = parser.parse_args()
    init_db()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"E-İnfak running at http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nKapatılıyor")


if __name__ == "__main__":
    main()

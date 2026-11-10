#!/usr/bin/env python3
"""Second look for HAKDER's site: same content, a layout of its own.

One-off tool like import_hakder.py (not shipped). It reads the organisation's published
header, footer, home and bank-accounts page and rebuilds them with the newer blocks:
single-row sticky header with a gold donate button, marquee, donation cards first,
animated counters, work-area cards, Kurban countdown, verse, copyable IBAN cards and a
darker footer with a call band. Texts, slides, menus, campaigns, testimonials, numbers
and IBANs are taken from what is already there; nothing about the association is invented.

    docker compose exec -T backend python /hakder/redesign_hakder.py --org hakder            # drafts only
    docker compose exec -T backend python /hakder/redesign_hakder.py --org hakder --publish  # live

Every published page keeps its previous version in Sürümler, so the old look can be restored.
"""
from __future__ import annotations

import argparse
import asyncio
import copy
import re
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

sys.path.insert(0, "/app")

from sqlalchemy import select  # noqa: E402

import app.models  # noqa: E402,F401
from app.core.db import AsyncSessionLocal  # noqa: E402
from app.models.cms import SitePage, SitePageRevision  # noqa: E402
from app.models.organization import Organization  # noqa: E402
from app.services.blocks import validate_blocks  # noqa: E402
from app.services.site import design_of  # noqa: E402
from app.services.templates import fresh_ids  # noqa: E402

GREEN, DEEP, GOLD, MIST = "#136938", "#0A2A17", "#C8922B", "#F3F7F2"
DESIGN = {"body_font": "inter", "heading_font": "playfair", "radius": "large", "container": "wide",
          "page_color": "#FBFAF6", "text_color": "#10231A", "heading_weight": "700", "heading_case": "normal"}
BY = "tasarım-v2"
_n = [0]


def B(block_type: str, style: Optional[dict] = None, mobile: Optional[dict] = None, advanced: Optional[dict] = None,
      children: Optional[list] = None, p: Optional[dict] = None, **props) -> dict:
    _n[0] += 1
    block: dict[str, Any] = {"id": f"v2-{block_type.replace('_', '-')[:10]}-{_n[0]}", "type": block_type, "props": {**props, **(p or {})}}
    if style or mobile:
        block["style"] = {**({"desktop": style} if style else {}), **({"mobile": mobile} if mobile else {})}
    if advanced:
        block["advanced"] = advanced
    if children is not None:
        block["children"] = children
    return block


def find(blocks: list, block_type: str, where=lambda b: True) -> Optional[dict]:
    """First block of a type anywhere in a tree (a copy, so the source stays untouched)."""
    for block in blocks or []:
        if block["type"] == block_type and where(block):
            return copy.deepcopy(block)
        inner = find(block.get("children") or [], block_type, where)
        if inner:
            return inner
    return None


def find_all(blocks: list, block_type: str) -> list:
    out = []
    for block in blocks or []:
        if block["type"] == block_type:
            out.append(copy.deepcopy(block))
        out += find_all(block.get("children") or [], block_type)
    return out


def section(children: list, bg: Optional[str] = None, top: int = 72, bottom: int = 72, color: Optional[str] = None) -> dict:
    style = {"padding_top": top, "padding_bottom": bottom}
    if bg:
        style["bg_color"] = bg
    if color:
        style["text_color"] = color
    return B("section", style=style, mobile={"padding_top": 44, "padding_bottom": 44}, children=[c for c in children if c])


def heading(text: str, kicker: str, subtitle: Optional[str] = None) -> dict:
    props = {"text": text, "kicker": kicker, "level": "h2"}
    if subtitle:
        props["subtitle"] = subtitle
    return B("heading", style={"text_align": "center"}, **props)


def restyle(block: Optional[dict], desktop: Optional[dict] = None, **props) -> Optional[dict]:
    if block is None:
        return None
    block["props"] = {**block.get("props", {}), **props}
    if desktop is not None:
        block["style"] = {"desktop": desktop}
    return block


# --- Header -------------------------------------------------------------------------------

def build_header(old: list) -> list:
    bar = restyle(find(old, "announcement_bar"), tone="dark")
    logo = find(old, "logo") or B("logo")
    menu = restyle(find(old, "nav_menu"), desktop={"font_size": 15}, align="center")
    account = restyle(find(old, "account_links") or B("account_links"), show_portal=True, show_verify=False, layout="inline")
    account["advanced"] = {"hide_tablet": True, "hide_mobile": True}
    account["style"] = {"desktop": {"font_size": 14}}
    row = B("header_row", tone="light", height=88, sticky=True, shrink=True, border=True, center_align="center", children=[
        B("header_slot", children=[logo]),
        B("header_slot", children=[menu] if menu else []),
        B("header_slot", children=[
            account,
            find(old, "cart_button") or B("cart_button"),
            B("donate_button", label="Bağış Yap", url="/bagis", size="md", heart=True, p={"style": "accent"},
              advanced={"hide_tablet": True, "hide_mobile": True}),
        ]),
    ])
    return [b for b in (bar, row) if b]


# --- Home ---------------------------------------------------------------------------------

AREAS = [  # HAKDER's own pages and donation tabs; descriptions stay general on purpose
    ("💧", "Su kuyusu", "Susuz bölgelerde kalıcı su kuyuları.", "/su-kuyusu-projeleri"),
    ("🕊️", "Gazze", "Gazze'ye gıda ve acil yardım.", "/gazze-yardimlari"),
    ("🐑", "Kurban", "Adak, akika, şükür ve vacip kurban.", "/bagis?tab=kurban"),
    ("📦", "Erzak kolisi", "İhtiyaç sahibi ailelere gıda kolisi.", "/bagis"),
    ("🌙", "Zekat", "Zekatınızı hesaplayın, emanet edin.", "/zekat-hesapla"),
    ("🚗", "Bağışımı gel al", "Ayni bağışlarınızı adresinizden alalım.", "/bagisimi-gel-al"),
]
COUNTER_ICONS = ["📣", "🤝", "📦", "🙋"]


def build_home(old: list) -> list:
    slider = find(old, "slider")
    cards = find(old, "donation_cards")
    stats = find(old, "stats")
    testimonials = find(old, "testimonials")
    news = find(old, "news")
    contact = restyle(find(old, "contact_form"), desktop={"padding_top": 72, "padding_bottom": 72})
    edevlet = restyle(find(old, "announcement_bar"), tone="brand")

    counters = None
    if stats:
        items = []
        for i, item in enumerate(stats["props"].get("items") or []):
            digits = re.sub(r"\D", "", str(item.get("value") or ""))
            if digits:
                items.append({"icon": COUNTER_ICONS[i % 4], "value": int(digits), "label": item.get("label") or ""})
        if items:
            counters = B("counters", look="band", items=items)

    return [b for b in [
        slider,
        B("marquee", tone="dark", speed="normal", separator="✦",
          items=[{"text": t} for t in ("Zekat", "Fitre", "Kurban", "Su kuyusu", "Gazze", "Erzak kolisi", "Sadaka", "Bir kapı aç, bir hayat değiştir")]),
        section([heading("Bağış yapabilirsiniz", "HAKDER", "Tutarı girin, sepete ekleyin; makbuzunuz e-postanıza gelsin."), cards], top=64, bottom=64) if cards else None,
        counters,
        section([B("features", kicker="NELER YAPIYORUZ", title="İyiliğin kapıları", columns=3, look="card",
                   items=[{"icon": icon, "title": title, "text": text, "url": url} for icon, title, text, url in AREAS])], bg=MIST),
        B("countdown", kicker="KURBAN 2027", title="Kurban Bayramı'na kalan süre", text="Vekaletinizi şimdiden verin; kesim videonuz size ulaşsın.",
          target="2027-05-16T06:00:00+03:00", button_label="Kurban bağışla", button_url="/bagis?tab=kurban",
          done_text="Kurban Bayramınız mübarek olsun.", tone="dark"),
        section([B("quote", text="Sevdiğiniz şeylerden Allah yolunda harcamadıkça iyiliğe asla erişemezsiniz.", source="Âl-i İmrân, 92", look="centered")], top=56, bottom=56),
        section([testimonials], bg=MIST, top=48, bottom=48) if testimonials else None,
        section([news], top=48, bottom=56) if news else None,
        contact,
        edevlet,
    ] if b]


# --- Footer -------------------------------------------------------------------------------

def build_footer(old: list) -> list:
    menus = find_all(old, "nav_menu")
    vertical = [m for m in menus if m["props"].get("layout") == "vertical"]
    legal = next((m for m in menus if m["props"].get("layout") == "horizontal"), None)
    contacts = find_all(old, "contact_info")
    address = next((c for c in contacts if c["props"].get("show_address")), None) or B("contact_info", layout="stacked", show_address=True)
    call = next((c for c in contacts if c["props"].get("title")), None)
    if call:
        call["style"] = {"desktop": {"radius": 18, "bg_color": GREEN, "font_size": 22, "font_weight": "700",
                                     "padding_top": 24, "padding_left": 24, "padding_right": 24, "padding_bottom": 24}}
    motto = find(old, "richtext")
    social = find(old, "social_icons") or B("social_icons", p={"style": "round"})
    copyright_ = restyle(find(old, "copyright") or B("copyright", show_powered=False), desktop={"text_align": "left"})
    if legal:
        legal["props"]["align"] = "right"
        legal["style"] = {"desktop": {"font_size": 14}}

    call_band = B("section", style={"bg_color": GREEN, "text_color": "#FFFFFF", "padding_top": 44, "padding_bottom": 44, "margin_top": 0}, children=[
        B("columns", ratio="2-1", gap=32, valign="center", children=[
            B("column", children=[B("heading", text="Bir kapı aç, bir hayat değiştir", level="h3", subtitle="Küçük bir bağış, bir ailenin sofrasına umut olur.")]),
            B("column", children=[B("buttons", align="right", items=[
                {"label": "Bağış Yap", "url": "/bagis", "style": "light"}, {"label": "Hesap Numaralarımız", "url": "/hesap-numaralarimiz", "style": "outline"}])]),
        ])])
    main = B("section", style={"bg_color": DEEP, "text_color": "#E8F1EA", "padding_top": 64, "padding_bottom": 24}, mobile={"padding_top": 40, "padding_bottom": 24}, children=[
        B("columns", ratio="1-1-1-1", gap=40, valign="start", children=[
            B("column", children=[b for b in (find(old, "logo"), motto, social) if b]),
            B("column", children=vertical[:1]),
            B("column", children=vertical[1:]),
            B("column", children=[b for b in (call, address) if b]),
        ]),
        B("spacer", height=28),
        B("columns", ratio="1-2", gap=32, valign="center", children=[
            B("column", children=[copyright_]),
            B("column", children=[legal] if legal else []),
        ]),
    ])
    return [call_band, main] + find_all(old, "mobile_tab_bar")[:1]


# --- Bank accounts page -------------------------------------------------------------------

CURRENCIES = (("Türk Lirası", "TRY"), ("ABD Doları", "USD"), ("Euro", "EUR"))


def build_bank_page(old: list) -> Optional[list]:
    faq = find(old, "faq")
    if not faq:
        return None
    accounts = []
    for item in faq["props"].get("items") or []:
        answer = str(item.get("answer") or "")
        bank = re.sub(r"\s*Hesap Numaralar[ıi]m[ıi]z\s*$", "", str(item.get("question") or "")).strip()
        holder = (re.search(r"Hesap adı:\**\s*(.+)", answer) or [None, ""])[1].strip()
        branch = (re.search(r"Şube:\**\s*(.+)", answer) or [None, ""])[1].strip()
        for label, code in CURRENCIES:
            part = answer.split(f"**{label}**", 1)
            iban = re.search(r"IBAN:\s*(TR[0-9 ]+)", part[1]) if len(part) == 2 else None
            if iban:
                accounts.append({"bank": bank, "branch": branch, "holder": holder, "iban": iban[1].strip(), "currency": code})
    if not accounts:
        return None
    note = find(old, "richtext")
    return [b for b in [
        find(old, "banner"),
        section([B("bank_accounts", kicker="HAVALE / EFT", title="Hesap numaralarımız", items=accounts,
                   note=re.sub(r"\*\*|\n+Banka hesap numaralarımız;?\s*$", "", (note or {}).get("props", {}).get("text", "")).strip() or None)], top=56, bottom=72),
    ] if b]


# --- Apply --------------------------------------------------------------------------------

async def run(org_slug: str, publish: bool) -> None:
    async with AsyncSessionLocal() as db:
        org = (await db.execute(select(Organization).where(Organization.slug == org_slug))).scalar_one()
        pages = (await db.execute(select(SitePage).where(SitePage.organization_id == org.id))).scalars().all()
        by_kind = {p.kind: p for p in pages if p.kind in ("home", "header", "footer")}
        bank = next((p for p in pages if p.kind == "page" and p.slug == "hesap-numaralarimiz"), None)
        missing = [k for k in ("home", "header", "footer") if k not in by_kind or not by_kind[k].blocks]
        if missing:
            sys.exit(f"Yayınlanmış {', '.join(missing)} yok; önce import_hakder.py çalıştırılmalı.")

        plan = [(by_kind["header"], build_header(by_kind["header"].blocks)),
                (by_kind["footer"], build_footer(by_kind["footer"].blocks)),
                (by_kind["home"], build_home(by_kind["home"].blocks))]
        if bank and bank.blocks:
            rebuilt = build_bank_page(bank.blocks)
            if rebuilt:
                plan.append((bank, rebuilt))

        now = datetime.now(timezone.utc)
        for page, blocks in plan:
            cleaned = validate_blocks(fresh_ids(blocks), page.kind)
            page.version += 1
            if publish:
                # Keep the look being replaced as a version of its own, so it can always be restored.
                db.add(SitePageRevision(page_id=page.id, organization_id=org.id, blocks=page.blocks, created_by=BY,
                                        note="Tasarım v2 öncesi", created_at=now - timedelta(seconds=5)))
                page.blocks, page.draft_blocks, page.is_published = cleaned, None, True
                page.published_at, page.published_by = now, BY
                db.add(SitePageRevision(page_id=page.id, organization_id=org.id, blocks=cleaned, created_by=BY, note="Tasarım v2"))
            else:
                page.draft_blocks, page.draft_updated_at, page.draft_updated_by = cleaned, now, BY
            print(f"{'yayınlandı' if publish else 'taslak'}: {page.kind} {page.slug} ({len(cleaned)} üst blok)")
        if publish:
            # Colours and fonts are site-wide, so they only change together with the published pages.
            org.theme_primary_color, org.theme_accent_color = GREEN, GOLD
            org.site = {**(org.site or {}), "design": design_of({"design": DESIGN})}
            print("tema: yeşil + altın, Playfair Display / Inter")
        else:
            print("tema değişmedi (renk ve yazı tipi yalnız --publish ile uygulanır)")
        await db.commit()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--org", default="hakder")
    parser.add_argument("--publish", action="store_true", help="taslak bırakmak yerine yayına al")
    args = parser.parse_args()
    asyncio.run(run(args.org, args.publish))

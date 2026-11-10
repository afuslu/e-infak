#!/usr/bin/env python3
"""Loads the hakder.org harvest (harvest.py → out/hakder.json + out/images) into an e-infak organisation.

One-off migration tool, not shipped. Runs with the backend's code and database, e.g.:

    docker run --rm --network <compose-net> -e DATABASE_URL=… -e MEDIA_ROOT=/media \\
      -v $PWD/services/backend:/app -v $PWD/scripts/hakder:/hakder -v <media>:/media \\
      e-infak-backend python /hakder/import_hakder.py --org hakder [--domain hakder.org] [--replace]

What it does (idempotent; --replace rebuilds pages, posts and campaigns it created before):
- organisation `hakder` (created if missing), "hakder" theme kit, logo/favicon, contact, WhatsApp, TL/USD/EUR
- every harvested image → media library (WebP variants), all content points at the library copies
- 30 campaigns with tab tags, fixed prices, niyet / hisse / months / share settings on the cards
- pages at their old addresses, news posts at their old slugs, the 301 table for addresses that changed
- header, footer and home from the "Hayır Kapısı" demo filled with HAKDER's content, published
Content fixes: wrong association names (KVKK "Ufka Doğru Derneği", "İnsani Yardım Derneği"), broken
menu links, no "STK PRO altyapısı" credit; adds mesafeli bağış sözleşmesi, iade/iptal and çerez pages.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, "/app")

from sqlalchemy import delete, select  # noqa: E402

from app.core.db import AsyncSessionLocal  # noqa: E402
import app.models  # noqa: E402,F401
from app.models.campaign import Campaign, CampaignCategory, CampaignStatus  # noqa: E402
from app.models.cms import SitePage  # noqa: E402
from app.models.content_post import ContentPost  # noqa: E402
from app.models.media import MediaAsset  # noqa: E402
from app.models.organization import Organization, OrganizationDomain  # noqa: E402
from app.models.organization_settings import OrganizationSettings  # noqa: E402
from app.services.blocks import validate_blocks  # noqa: E402
from app.services.media import create_asset  # noqa: E402
from app.services.redirects import clean_redirects  # noqa: E402
from app.services.site import THEME_KITS, design_of  # noqa: E402
from app.services import template_hakder as hk  # noqa: E402
from app.services.templates import fresh_ids  # noqa: E402
from app.utils.cms import slugify  # noqa: E402

HERE = Path(__file__).resolve().parent


def _tr_lower(text: str) -> str:
    return text.replace("İ", "i").replace("I", "ı").lower()


def tr_title(text: str) -> str:
    """'ESKİŞEHİR KIZ MEDRESE İNŞAATI (KÜLLİYE)' -> 'Eskişehir Kız Medrese İnşaatı (Külliye)' (str.title breaks İ/I)."""
    def word(w: str) -> str:
        lead = len(w) - len(w.lstrip("(\"'"))
        head, rest = w[lead:lead + 1], w[lead + 1:]
        head = {"i": "İ", "ı": "I"}.get(head, head.upper())
        return w[:lead] + head + _tr_lower(rest)
    return " ".join(word(w) for w in _tr_lower(text).split(" "))
LEGAL_NAME = "Hayıra Açılan Kapı Derneği"
MAPS = "https://www.google.com/maps/dir/?api=1&destination=39.775261,30.518211"  # Arifiye Mh., Odunpazarı (bagisimi-gel-al map)

TAB_CATEGORY = {"genel": "genel", "egitim": "egitim", "su-kuyusu": "su", "gazze": "gida", "insani-projeler": "gida",
                "ummet-sofralari": "gida", "kurban": "kurban", "yemen": "gida", None: "genel"}
TITLE_CATEGORY = [(r"zekat", "zekat"), (r"sadaka", "sadaka"), (r"fitre", "fitre"), (r"inşaat|medrese inşa", "insaat"), (r"kurban", "kurban")]

# Wrong names left over from STK PRO's sample content, and other small text fixes.
TEXT_FIXES = [
    ("Ufka Doğru Derneği", f"{LEGAL_NAME} (HAKDER)"),
    ("veri sorumlusu olarak Hakder Derneği", f"veri sorumlusu olarak {LEGAL_NAME} (HAKDER)"),
    ("İnsani Yardım Derneği'nde", "HAKDER'de"),
    ("İnsani Yardım Derneği’nde", "HAKDER’de"),
    ("İnsani Yardım Derneği", "HAKDER"),
    ("numaralı telefondan STK'ya ulaşabilirsiniz", "numaralı telefondan bize ulaşabilirsiniz"),
    ("Gönüllerimizle", "Gönüllülerimizle"),
]


def fix(text: str | None) -> str:
    text = text or ""
    for wrong, right in TEXT_FIXES:
        text = text.replace(wrong, right)
    return text


def first_paragraph(text: str, limit: int = 300) -> str:
    for chunk in (text or "").split("\n\n"):
        plain = re.sub(r"[#*\[\]]|\(/[^)]*\)|\(https?:[^)]*\)", "", chunk).strip()
        if len(plain) > 40 and not plain.startswith("-"):
            return plain[:limit].rsplit(" ", 1)[0] + ("…" if len(plain) > limit else "")
    return ""


class Importer:
    def __init__(self, db, data: dict, images_dir: Path, org_slug: str, domain: str | None, replace: bool):
        self.db, self.data, self.images_dir = db, data, images_dir
        self.org_slug, self.domain, self.replace = org_slug, domain, replace
        self.media: dict[str, str] = {}
        self.campaigns: dict[str, Campaign] = {}  # harvested source_id -> campaign
        self.report: dict[str, list] = {"fixes": [], "redirects": [], "warnings": []}

    # --- organisation ---------------------------------------------------------------------
    async def org(self) -> Organization:
        home = self.data["home"]
        org = (await self.db.execute(select(Organization).where(Organization.slug == self.org_slug))).scalar_one_or_none()
        if not org:
            org = Organization(slug=self.org_slug, subdomain=self.org_slug, name="HAKDER", legal_name=LEGAL_NAME,
                               email=home["contact"]["email"] or "info@hakder.org", primary_domain=f"{self.org_slug}.e-infak.org",
                               plan="ileri", enabled_addons=[], extra_user_seats=0, site={})
            self.db.add(org)
            await self.db.flush()
        org.name, org.legal_name = "HAKDER", LEGAL_NAME
        org.phone = (home["contact"]["phones"] or [None])[0]
        org.address, org.city = home["contact"]["address"], "Eskişehir"
        org.template = "kategori"  # centred section titles, like hakder.org
        org.tagline = home["header"]["slogan"][:120]
        kit = next(k for k in THEME_KITS if k["key"] == "hakder")
        org.theme_primary_color, org.theme_accent_color = kit["primary_color"], kit["accent_color"]
        org.settings = {**(org.settings or {}), "enabled_payment_currencies": ["TRY", "USD", "EUR"]}
        if self.domain:
            exists = (await self.db.execute(select(OrganizationDomain).where(OrganizationDomain.domain == self.domain))).scalar_one_or_none()
            if not exists:
                self.db.add(OrganizationDomain(organization_id=org.id, domain=self.domain, status="pending", verification_token="hakder-migration", is_primary=False))
        settings_row = (await self.db.execute(select(OrganizationSettings).where(OrganizationSettings.organization_id == org.id))).scalar_one_or_none()
        if not settings_row:
            settings_row = OrganizationSettings(organization_id=org.id)
            self.db.add(settings_row)
        c = home["contact"]
        settings_row.contact_phone = "0222 233 30 30" if c["phones"] else None
        settings_row.contact_email = c["email"]
        settings_row.contact_address = c["address"]
        settings_row.whatsapp_number = c["whatsapp"] or None
        settings_row.whatsapp_message = "Merhaba, web siteniz aracılığıyla iletişime geçiyorum."
        settings_row.seo_title = "HAKDER — Hayıra Açılan Kapı Derneği"
        settings_row.seo_description = "Kurban, su kuyusu, Gazze, Yemen, eğitim ve iftar bağışlarınızı HAKDER güvencesiyle ihtiyaç sahiplerine ulaştırıyoruz."
        banks = self.data["pages"]["hesap-numaralarimiz"].get("banks") or []
        for index, bank in enumerate(banks[:2], start=1):
            tl = next((a for a in bank["accounts"] if "Türk" in a["currency"]), None)
            if tl:
                setattr(settings_row, f"bank{index}_name", bank["name"].replace(" Hesap Numaralarımız", ""))
                setattr(settings_row, f"bank{index}_iban", tl["iban"])
        self.settings_row = settings_row
        await self.db.flush()
        return org

    # --- media ------------------------------------------------------------------------------
    async def upload_images(self, org: Organization) -> None:
        existing = {a.original_name: a.url for a in (await self.db.execute(select(MediaAsset).where(MediaAsset.organization_id == org.id))).scalars()}
        for source, name in sorted(self.data.get("images", {}).items()):
            label = f"hakder:{Path(source).name}"[:255]
            if label in existing:
                self.media[source] = existing[label]
                continue
            path = self.images_dir / name
            if not path.exists():
                self.report["warnings"].append(f"görsel yok: {source}")
                continue
            try:
                asset = await create_asset(self.db, org, path.read_bytes(), label)
            except Exception as exc:  # oversize or unsupported: keep going, report it
                self.report["warnings"].append(f"görsel yüklenemedi ({getattr(exc, 'detail', exc)}): {source}")
                continue
            self.media[source] = asset.url
        await self.db.flush()

    def img(self, url: str | None) -> str | None:
        if not url:
            return None
        return self.media.get(url.split("?", 1)[0])

    # --- campaigns --------------------------------------------------------------------------
    async def import_campaigns(self, org: Organization) -> None:
        cards = self.data["campaigns"]["cards"]
        page_slugs = set(self.data["pages"])
        existing = {c.slug: c for c in (await self.db.execute(select(Campaign).where(Campaign.organization_id == org.id))).scalars()}
        for order, card in enumerate(cards):
            slug = card["slug"] if card["slug"] and card["slug"] not in page_slugs else slugify(card["title"])
            story = fix(card.get("story") or "").strip()
            if story in ("/.row\n\n/.container", "/.row", "/.container"):
                story = ""
            category = TAB_CATEGORY.get(card["tab"], "genel")
            for pattern, value in TITLE_CATEGORY:
                if re.search(pattern, card["title"], re.I):
                    category = value
                    break
            unit = card.get("price_try")
            shares = card.get("shares")
            tags = [t for t in [card["tab"], *card.get("extra_tabs", [])] if t]
            campaign = existing.get(slug)
            if not campaign:
                campaign = Campaign(organization_id=org.id, slug=slug, translations={}, checkout_fields_schema=[], gallery_urls=[])
                self.db.add(campaign)
            title = card["title"] if not card["title"].isupper() else tr_title(card["title"])
            campaign.title = title
            campaign.summary = first_paragraph(story) or f"{title} için bağışınızı güvenle yapabilirsiniz."
            campaign.story = story or None
            campaign.category = CampaignCategory(category)
            campaign.status = CampaignStatus.ACTIVE
            campaign.currency = "TRY"
            campaign.target_cents = (shares["total"] * unit * 100) if shares and unit else 0
            campaign.cover_image_url = self.img(card.get("image_url"))
            campaign.suggested_amounts_cents = [unit * 100] if unit else []
            campaign.allow_custom_amount = not unit
            campaign.min_donation_cents = 100
            campaign.is_featured = card["source_id"] in self.data["home"]["donate_section"]["campaign_ids"]
            campaign.display_order = order
            campaign.show_collected = bool(shares)
            campaign.tags = tags
            if card.get("niyet_options"):
                campaign.checkout_fields_schema = [{"key": "niyet", "label": "Niyet", "type": "select", "required": True, "options": card["niyet_options"]}]
            self.campaigns[card["source_id"]] = campaign
            if card["slug"] and card["slug"] != slug:
                self.report["warnings"].append(f"{card['title']}: eski bağlantı /{card['slug']} bir sayfa; kampanya adresi /kampanyalar/{slug}")
        await self.db.flush()

    def card_settings(self, source_ids: list[str] | None = None) -> list[dict]:
        out = []
        for card in self.data["campaigns"]["cards"]:
            if source_ids is not None and card["source_id"] not in source_ids:
                continue
            campaign = self.campaigns.get(card["source_id"])
            if not campaign:
                continue
            setting: dict = {"campaign_id": str(campaign.id)}
            variants = [v[0] for v in card.get("variant_selects") or [] if len(v) == 1]
            if variants:
                setting["note"] = " · ".join(variants)
            quantity = card.get("quantity_label", "").lower()
            if quantity in ("adet", "hisse"):
                setting["quantity"] = quantity
                setting["max_quantity"] = card.get("max_share") if quantity == "hisse" and card.get("max_share", 0) > 1 else 21
            if card.get("niyet_options"):
                setting["niyet"] = ", ".join(card["niyet_options"])
            if card.get("durations"):
                setting["durations"] = ", ".join(str(m) for m in card["durations"])
            if card.get("shares"):
                setting["shares_total"] = card["shares"]["total"]
                setting["shares_taken"] = card["shares"]["taken"]  # carried over from STK PRO
            if card.get("button_label") and card["button_label"] != "Bağış Yap":
                setting["button_label"] = card["button_label"]
            out.append(setting)  # also keeps the old site's card order
        return out

    # --- content for the demo blocks --------------------------------------------------------
    def menu(self) -> list[dict]:
        fixes = {"Eğitim Çalışmaları": "/bagis?tab=egitim", "Gazze Acil Yardım": "/gazze-yardimlari"}
        items = []
        for item in self.data["home"]["menu"]:
            children = item.get("children") or []
            if any(c.get("children") for c in children):  # Faaliyetlerimiz: two levels → mega menu columns
                links = []
                for child in children:
                    group = child["label"]
                    subs = child.get("children") or [child]
                    for sub in subs:
                        url = fixes.get(sub["label"], sub["url"]) or "/tum-faaliyetlerimiz"
                        if fixes.get(sub["label"]) and fixes[sub["label"]] != sub["url"]:
                            self.report["fixes"].append(f"menü › {sub['label']}: {sub['href'] or '(boş)'} → {url}")
                        links.append({"label": sub["label"], "url": url, "group": group})
                links.append({"label": "Tüm Faaliyetlerimiz", "url": "/tum-faaliyetlerimiz", "group": "Tümü"})
                items.append({"label": item["label"], "url": item["url"] or "/tum-faaliyetlerimiz", "mega": True, "children": links})
            elif children:
                items.append({"label": item["label"], "children": [{"label": c["label"], "url": c["url"]} for c in children]})
            else:
                items.append({"label": item["label"], "url": item["url"]})
        return items

    def footer_menus(self) -> list:
        groups = []
        for widget in self.data["home"]["footer"]["widgets"][1:]:
            if not widget["title"] or widget["title"] == "Çağrı Merkezi":
                continue
            links = [{"label": fix(l["label"]), "url": l["url"].replace("/zekat-hesaplama", "/zekat-hesapla")} for l in widget["links"] if l["url"].startswith("/")]
            if widget["title"] == "Formlar":
                links.append({"label": "Gönüllü Ol", "url": "/gonullu"})
            groups.append((widget["title"], links))
        return groups

    def testimonials(self) -> list[dict]:
        out = []
        for item in self.data["home"]["testimonials"]["items"]:
            quote, name, role = fix(item["quote"]), item["name"], item["role"]
            if not name:  # "… Erol Ç." / "… Zümrüt E. Bağışçı": the name is at the end of the text
                match = re.match(r"^(.*?)\s+([A-ZÇĞİÖŞÜ][a-zçğıöşü]+ [A-ZÇĞİÖŞÜ][.*]+)\s*(Bağışçı)?\.?$", quote)
                if match:
                    quote, name, role = match.group(1), match.group(2), match.group(3) or role
            out.append({k: v for k, v in {"quote": quote[:400], "name": name, "role": role}.items() if v})
        return out

    def content(self) -> dict:
        home = self.data["home"]
        fixes_bottom = {"İletişim": "/iletisim", "Gönüllü Ol": "/gonullu"}
        bottom = []
        for link in home["footer"]["bottom_links"]:
            url = fixes_bottom.get(link["label"], link["url"])
            if url != link["url"]:
                self.report["fixes"].append(f"footer › {link['label']}: {link['href'] or '(boş)'} → {url}")
            bottom.append({"label": link["label"], "url": url})
        bottom += [{"label": "Mesafeli Bağış Sözleşmesi", "url": "/mesafeli-bagis-sozlesmesi"},
                   {"label": "İade ve İptal", "url": "/iade-ve-iptal-kosullari"}, {"label": "Çerez Politikası", "url": "/cerez-politikasi"},
                   {"label": "KVKK", "url": "/gizlilik-politikasi"}]
        slides = []
        for slide in home["slides"]:
            if not self.img(slide["image_url"]):
                continue
            links = [b["url"] for b in slide["buttons"] if b["url"]]
            slides.append({"image_url": self.img(slide["image_url"]), "mobile_image_url": self.img(slide.get("mobile_image_url")),
                           "button_url": links[0] if links else "/bagis", "poster": True,
                           "button2_url": slide["link"] if slide["link"] and slide["link"] != (links[0] if links else "") else (links[1] if len(links) > 1 else None)})
        home_ids = home["donate_section"]["campaign_ids"]
        tabs = [{"label": t["label"], "tag": t["key"]} for t in self.data["campaigns"]["tabs"]]
        support = home["support_form"]
        return {
            "announcement": home["announcement"],
            "slogan": home["header"]["slogan"],
            "menu": self.menu(),
            "header_buttons": [b for b in home["header_buttons"] if b["url"].startswith("/")],
            "slides": slides,
            "edevlet": {"text": home["edevlet"]["text"], "url": home["edevlet"]["url"]},
            "counters": [{"value": c["value"], "label": c["label"], **({"icon_url": self.img(c["icon_url"])} if self.img(c["icon_url"]) else {})} for c in home["counters"]],
            "donate": {"kicker": home["donate_section"]["kicker"], "title": home["donate_section"]["title"],
                       "campaign_ids": [str(self.campaigns[i].id) for i in home_ids if i in self.campaigns],
                       "cards": self.card_settings(home_ids)},
            "testimonials": {"kicker": home["testimonials"]["kicker"], "title": home["testimonials"]["title"], "items": self.testimonials()},
            "support_form": {"kicker": support["kicker"], "title": support["title"], "image_url": self.img(support["image_url"]),
                             "badge_value": support["badge_value"], "badge_text": support["badge_text"], "button_label": support["button_label"]},
            "news": {"kicker": home["news_section"]["kicker"], "title": home["news_section"]["title"], "all_label": home["news_section"]["all_label"],
                     "all_url": "/tum-faaliyetlerimiz", "links": "root"},
            "footer_menus": self.footer_menus(),
            "bottom_links": bottom,
            "copyright": "© {yıl} HAKDER — Hayıra Açılan Kapı Derneği. Tüm hakları saklıdır.",
            "banner_url": self.img(self.data["pages"]["hakkimizda"]["banner_url"]) or "/demo/pattern.svg",
            "tabs": tabs,
            "bagis_cards": self.card_settings(),
        }

    # --- pages ------------------------------------------------------------------------------
    def pages(self, c: dict, org: Organization) -> dict[str, tuple[str, list]]:
        P = self.data["pages"]
        B, section, cols, heading = hk.B, hk._section, hk._cols, hk._heading
        out: dict[str, tuple[str, list]] = {}
        kurumsal = {"hakkimizda", "gizlilik-politikasi", "insan-kaynaklari", "sss"}

        def body_of(slug: str) -> str:
            text = fix(P[slug].get("body") or "")
            return re.sub(r"\]\(/zekat-hesaplama\)", "](/zekat-hesapla)", text)

        def images(slug: str) -> list:
            return [B("image", image_url=self.img(u), aspect="auto") for u in P[slug].get("images", []) if self.img(u)]

        for slug in ("hakkimizda", "gizlilik-politikasi", "insan-kaynaklari"):
            body = body_of(slug)
            if slug == "gizlilik-politikasi" and "Ufka Doğru" in (P[slug].get("body") or ""):
                self.report["fixes"].append("KVKK metni: \"Ufka Doğru Derneği\" → \"Hayıra Açılan Kapı Derneği (HAKDER)\"")
            out[slug] = (P[slug]["title"], hk.text_page(P[slug]["title"], body, c, sidebar=True, extra=images(slug)))

        # SSS: one accordion per tab
        groups = P["sss"].get("groups") or []
        faq = []
        for group in groups:
            if group["items"]:
                faq.append(B("faq", title=group["label"], items=[{"question": fix(q["question"])[:200], "answer": fix(q["answer"])[:3000]} for q in group["items"]]))
        out["sss"] = (P["sss"]["title"], [hk.page_title(P["sss"]["title"], c), section([cols("1-2", [hk.kurumsal_sidebar(c)], faq, gap=40)], top=48, bottom=72)])

        # Hesap numaraları: intro + one accordion item per bank
        bank_items = []
        for bank in P["hesap-numaralarimiz"].get("banks") or []:
            lines = [f"**{k}:** {v}" for k, v in bank["facts"].items()]
            for account in bank["accounts"]:
                lines.append(f"\n**{account['currency']}**\nHesap No: {account['account_no']}\nIBAN: {account['iban']}")
            bank_items.append({"question": bank["name"], "answer": "\n".join(lines).replace("\n\n", "\n\n")})
        intro = fix(P["hesap-numaralarimiz"].get("intro") or "")
        out["hesap-numaralarimiz"] = (P["hesap-numaralarimiz"]["title"], [
            hk.page_title(P["hesap-numaralarimiz"]["title"], c),
            section([B("section", style={"width": "narrow"}, children=[B("richtext", text=intro), B("faq", items=bank_items)])], top=48, bottom=72),
        ])

        # Projects with their donation cards
        for slug, tag in (("su-kuyusu-projeleri", "su-kuyusu"), ("gazze-yardimlari", "gazze")):
            cards = B("donation_cards", source="tabs", tabs=[{"label": P[slug]["title"], "tag": tag}], layout="grid", columns=3,
                      cards=c["bagis_cards"], button_label="Bağış Yap")
            out[slug] = (P[slug]["title"], [
                hk.page_title(P[slug]["title"], c),
                section([cols("2-1", [B("richtext", text=body_of(slug))], images(slug), gap=40)], top=48, bottom=32),
                section([heading("Bağış Yapabilirsiniz", "Hakder"), cards], bg=hk.CREAM, top=48, bottom=72),
            ])

        # Bağışımı gel al: text, phone, WhatsApp and directions
        contact = self.data["home"]["contact"]
        out["bagisimi-gel-al"] = (P["bagisimi-gel-al"]["title"], [
            hk.page_title(P["bagisimi-gel-al"]["title"], c),
            section([B("section", style={"width": "narrow"}, children=[
                B("richtext", text=body_of("bagisimi-gel-al").split("\n\nAdres")[0]),
                B("contact_info", title="İletişim", layout="stacked", show_address=True, show_phone=True, show_email=False,
                  style={"bg_color": "#F8F8F8", "radius": 16, "padding_top": 24, "padding_bottom": 24, "padding_left": 24, "padding_right": 24}),
                B("buttons", align="left", items=[
                    {"label": "WhatsApp'tan Yaz", "url": f"https://wa.me/{contact['whatsapp']}", "style": "primary", "new_tab": True},
                    {"label": "Yol Tarifi Al", "url": MAPS, "style": "outline", "new_tab": True}]),
            ])], top=48, bottom=72),
        ])

        # İletişim: info card + message form, then the volunteer band (its button pointed nowhere)
        info = P["iletisim"]
        volunteer = info.get("volunteer_cta") or {}
        self.report["fixes"].append("İletişim haritası Erzurum'u gösteriyordu (40.54, 41.99); \"Yol Tarifi\" Eskişehir adresine bağlandı")
        if volunteer and not volunteer.get("href"):
            self.report["fixes"].append("İletişim › Gönüllü Ol butonu boş bağlantı → /gonullu")
        out["iletisim"] = (info["title"], [
            hk.page_title(info["title"], c),
            section([cols("1-2", [
                B("heading", text=info.get("org_legal_name") or LEGAL_NAME.upper(), level="h4"),
                B("richtext", text=f"“{c['slogan']}”"),
                B("contact_info", layout="stacked", show_address=True, show_phone=True, show_email=True),
                B("buttons", align="left", items=[{"label": "Yol Tarifi Al", "url": MAPS, "style": "outline", "new_tab": True}]),
            ], [B("contact_form", title="Bize yazın", button_label="Gönder", ask_email=True)], gap=40)], top=48, bottom=48),
            B("banner", layout="image", image_url=self.img(volunteer.get("image_url")) or c["banner_url"], title=volunteer.get("title"),
              text=volunteer.get("text"), button_label=volunteer.get("button") or "Gönüllü Ol", button_url="/gonullu"),
        ])

        out["tum-faaliyetlerimiz"] = ("Tüm Faaliyetlerimiz", [
            hk.page_title("Tüm Faaliyetlerimiz", c),
            section([B("news", title="Derneğimizin Gerçekleştirdiği Faaliyetler", kicker="FAALİYETLER", limit=12, layout="grid", links="root",
                       all_label="Haber arşivi", all_url="/haberler")], top=24, bottom=48),
        ])

        demo = hk.hayir_kapisi(c, org={"name": "HAKDER", "legal_name": LEGAL_NAME, "address": org.address, "phone": "0222 233 30 30",
                                       "email": org.email, "site": "www.hakder.org"})
        out.update(demo["pages"])  # bagis (tabs) + mesafeli bağış sözleşmesi, iade/iptal, çerez
        self.demo = demo
        return out

    async def publish_page(self, org: Organization, slug: str, title: str, blocks: list, kind: str = "page") -> None:
        now = datetime.now(timezone.utc)
        cleaned = validate_blocks(fresh_ids(blocks), kind)
        if kind == "page":
            page = (await self.db.execute(select(SitePage).where(SitePage.organization_id == org.id, SitePage.slug == slug))).scalar_one_or_none()
        else:
            page = (await self.db.execute(select(SitePage).where(SitePage.organization_id == org.id, SitePage.kind == kind))).scalar_one_or_none()
        if page and kind == "page" and page.draft_updated_by not in (None, "hakder-import") and not self.replace:
            self.report["warnings"].append(f"/{slug} elle düzenlenmiş; atlandı (--replace ile üzerine yazılır)")
            return
        if not page:
            page = SitePage(organization_id=org.id, kind=kind, slug=slug if kind == "page" else f"__{kind}__", title=title, body="", translations={})
            self.db.add(page)
        page.title, page.blocks, page.draft_blocks = title, cleaned, None
        page.is_published, page.published_at, page.published_by = True, now, "hakder-import"
        page.draft_updated_by, page.version = "hakder-import", (page.version or 0) + 1
        page.cover_image_url = None

    async def import_posts(self, org: Organization) -> None:
        if self.replace:
            await self.db.execute(delete(ContentPost).where(ContentPost.organization_id == org.id, ContentPost.slug.in_([p["slug"] for p in self.data["posts"]])))
        existing = {p.slug for p in (await self.db.execute(select(ContentPost).where(ContentPost.organization_id == org.id))).scalars()}
        for order, post in enumerate(self.data["posts"]):
            if post["slug"] in existing:
                continue
            body = fix(post["body"])
            if body.startswith("## " + post["title"].rstrip("!")):  # the post repeats its title as the first heading
                body = body.split("\n\n", 1)[-1]
            try:
                published = datetime.strptime(post["date"], "%d/%m/%Y").replace(tzinfo=timezone.utc)
            except ValueError:
                published = datetime.now(timezone.utc)
            self.db.add(ContentPost(organization_id=org.id, title=fix(post["title"])[:300], kind="faaliyet", slug=post["slug"][:160],
                                    summary=fix(post["summary"])[:500], body=body, image_url=self.img(post["image_url"]),
                                    gallery_urls=[u for u in (self.img(i) for i in post.get("images", [])) if u],
                                    translations={}, published_at=published, display_order=order, is_active=True))

    def redirects(self, page_slugs: set[str]) -> list[dict]:
        table = [{"from": "/zekat-hesaplama", "to": "/zekat-hesapla"}, {"from": "/login/giris", "to": "/portal"},
                 {"from": "/login", "to": "/portal"}, {"from": "/gonullu-ol", "to": "/gonullu"}]
        for card in self.data["campaigns"]["cards"]:
            campaign = self.campaigns.get(card["source_id"])
            if campaign and card["slug"] and card["slug"] not in page_slugs:
                table.append({"from": f"/{card['slug']}", "to": f"/kampanyalar/{campaign.slug}"})
        seen, out = set(), []
        for row in table:
            if row["from"] not in seen:
                seen.add(row["from"])
                out.append(row)
        return clean_redirects(out)

    async def run(self) -> dict:
        org = await self.org()
        await self.upload_images(org)
        org.logo_url = self.img(self.data["home"]["logo_url"])
        org.favicon_url = self.img(self.data["home"]["favicon_url"])
        await self.import_campaigns(org)
        c = self.content()
        pages = self.pages(c, org)
        for slug, (title, blocks) in pages.items():
            await self.publish_page(org, slug, title, blocks)
        for kind in ("home", "header", "footer"):
            await self.publish_page(org, kind, {"home": "Ana sayfa", "header": "Üst bölüm (header)", "footer": "Alt bölüm (footer)"}[kind], self.demo[kind], kind)
        await self.import_posts(org)
        table = self.redirects(set(pages))
        kit = next(k for k in THEME_KITS if k["key"] == "hakder")
        org.site = {**(org.site or {}),
                    "design": design_of({"design": kit["design"]}),
                    "hero": {"slider": False},
                    "testimonials": c["testimonials"]["items"],
                    "footer_text": f"“{c['slogan']}”",
                    "social_links": {"instagram": self.data["home"]["contact"]["instagram"]} if self.data["home"]["contact"]["instagram"] else {},
                    "redirects": table}
        self.report["redirects"] = table
        self.report["fixes"] += ["\"STK PRO altyapısı\" yazısı kaldırıldı (copyright satırında altyapı yazısı yok)",
                                 "Mesafeli bağış sözleşmesi, iade/iptal ve çerez sayfaları eklendi (/mesafeli-bagis-sozlesmesi, /iade-ve-iptal-kosullari, /cerez-politikasi)",
                                 "Haber ve yorum metinlerindeki \"İnsani Yardım Derneği\" → \"HAKDER\""]
        vk = next((b for b in self.data["pages"]["hesap-numaralarimiz"].get("banks", []) if "Vakıf" in b["name"]), None)
        if vk and any("4444" in a["iban"] for a in vk["accounts"]):
            self.report["warnings"].append("Vakıf Katılım IBAN'ları örnek değer gibi görünüyor (…4444 4444…, Swift TRC^6587): HAKDER'den doğrusunu alın")
        await self.db.commit()
        return {"org": org.slug, "org_id": str(org.id), "campaigns": len(self.campaigns), "pages": sorted(pages),
                "posts": len(self.data["posts"]), "images": len(self.media), **self.report}


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--org", default="hakder")
    parser.add_argument("--json", default=str(HERE / "out" / "hakder.json"))
    parser.add_argument("--domain", help="also register this domain (pending verification); DNS is not touched")
    parser.add_argument("--replace", action="store_true", help="overwrite pages/posts edited after a previous import")
    args = parser.parse_args()
    data = json.loads(Path(args.json).read_text(encoding="utf-8"))
    async with AsyncSessionLocal() as db:
        result = await Importer(db, data, Path(args.json).parent / "images", args.org, args.domain, args.replace).run()
    (Path(args.json).parent / "import_report.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())

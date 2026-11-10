#!/usr/bin/env python3
"""One-off content harvester for hakder.org (HAKDER leaves STK PRO for e-infak).

Not shipped with the product. It reads HAKDER's own public content — page texts,
news posts, menu, campaign cards with prices, su kuyusu share progress,
testimonials, counters, bank accounts, FAQ — and the images on cdn.hakder.org,
and writes them to `out/hakder.json` + `out/images/`. `import_hakder.py` then
loads that into an e-infak organisation (media library, campaigns, CMS, blocks).

Nothing of STK PRO's own (CSS, JS, its logo, the "altyapı" credit) is collected.

Usage (needs `pip install beautifulsoup4 requests`; `playwright` only for --browser):
    python scripts/hakder/harvest.py                 # HTML only
    python scripts/hakder/harvest.py --browser       # also read TL/USD/EUR prices from the live DOM
    python scripts/hakder/harvest.py --no-images     # skip image downloads
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup, Comment, NavigableString, Tag

BASE = "https://www.hakder.org"
CDN_HOST = "cdn.hakder.org"
OUT = Path(__file__).resolve().parent / "out"
UA = "Mozilla/5.0 (compatible; e-infak-migration/1.0)"

# Pages that keep their address on e-infak.
PAGE_SLUGS = [
    "hakkimizda", "iletisim", "hesap-numaralarimiz", "gizlilik-politikasi", "sss", "insan-kaynaklari",
    "su-kuyusu-projeleri", "gazze-yardimlari", "zekat-hesaplama", "bagisimi-gel-al", "tum-faaliyetlerimiz",
]

session = requests.Session()
session.headers["User-Agent"] = UA


def fetch(path_or_url: str) -> BeautifulSoup:
    url = path_or_url if path_or_url.startswith("http") else f"{BASE}/{path_or_url.lstrip('/')}"
    for attempt in range(3):
        try:
            res = session.get(url, timeout=30)
            res.raise_for_status()
            time.sleep(0.3)  # be gentle with their server
            return BeautifulSoup(res.text, "html.parser")
        except requests.RequestException:
            if attempt == 2:
                raise
            time.sleep(2)
    raise RuntimeError(url)


def clean(text: str | None) -> str:
    return " ".join((text or "").replace("ㅤ", " ").split())


def path_of(href: str | None) -> str:
    """Absolute/relative hakder link -> site path ("/hakkimizda", "/bagis?tab=x"); "" when empty."""
    if not href or href.strip() in ("#", ""):
        return ""
    href = href.strip()
    if href.startswith(("tel:", "mailto:", "https://wa.me")):
        return href
    parsed = urlparse(urljoin(BASE + "/", href))
    if parsed.netloc and parsed.netloc.replace("www.", "") != "hakder.org":
        return href
    return (parsed.path or "/") + (f"?{parsed.query}" if parsed.query else "")


def cf_email(hex_string: str) -> str:
    """Cloudflare e-mail obfuscation (/cdn-cgi/l/email-protection#<hex>) -> address."""
    data = bytes.fromhex(hex_string)
    return "".join(chr(b ^ data[0]) for b in data[1:])


def decode_emails(soup: BeautifulSoup) -> None:
    for node in soup.select("[data-cfemail]"):
        node.replace_with(cf_email(node["data-cfemail"]))
    for a in soup.select('a[href*="email-protection#"]'):
        address = cf_email(a["href"].split("#", 1)[1])
        a["href"] = f"mailto:{address}"
        if "[email" in a.get_text():
            a.string = address


def img_src(url: str | None) -> str:
    """Image URL without the resize query (?w=640): the import resizes on its own."""
    if not url:
        return ""
    url = urljoin(BASE + "/", url.strip())
    return url.split("?", 1)[0]


def bg_url(style: str | None) -> str:
    match = re.search(r"url\(['\"]?([^'\")]+)", style or "")
    if not match or "{{" in match.group(1):  # unrendered STK PRO template variable
        return ""
    return img_src(match.group(1))


# --- HTML -> e-infak block text ("## " headings, "- " lists, **bold**, [a](b)) -------------

def to_text(root: Tag) -> str:
    out: list[str] = []

    def inline(node) -> str:
        if isinstance(node, Comment):
            return ""
        if isinstance(node, NavigableString):
            return str(node)
        if not isinstance(node, Tag):
            return ""
        if node.name == "br":
            return "\n"
        inner = "".join(inline(c) for c in node.children)
        if node.name in ("strong", "b") and inner.strip():
            lead, core, tail = re.match(r"^(\s*)(.*?)(\s*)$", inner, re.S).groups()
            return f"{lead}**{core}**{tail}" if "\n" not in core else inner
        if node.name == "a" and node.get("href") and inner.strip():
            href = path_of(node["href"])
            if href.startswith(("/", "http")):
                return f"[{clean(inner)}]({href})"
        return inner

    def block(node) -> None:
        if isinstance(node, Comment):
            return
        if isinstance(node, NavigableString):
            if clean(node):
                out.append(clean(node))
            return
        if not isinstance(node, Tag) or node.name in ("script", "style", "select", "input", "button", "iframe", "form"):
            return
        if node.name in ("h1", "h2", "h3", "h4", "h5"):
            title = clean(node.get_text(" "))
            if title:
                out.append(("## " if node.name in ("h1", "h2", "h3") else "### ") + title)
        elif node.name in ("ul", "ol"):
            items = [clean(inline(li)) for li in node.find_all("li", recursive=False)]
            items = [i for i in items if i]
            if items:
                prefix = (lambda n: f"{n}. ") if node.name == "ol" else (lambda n: "- ")
                out.append("\n".join(prefix(n + 1) + i for n, i in enumerate(items)))
        elif node.name == "p" or (node.name == "div" and not node.find(["p", "div", "ul", "ol", "h2", "h3", "h4", "table"])):
            text = inline(node)
            lines = [clean(line) for line in text.split("\n")]
            lines = [line for line in lines if line]
            if not lines:
                return
            # "* item" lines (HAKDER writes lists as starred lines) become a list
            if all(re.match(r"^[*•-] ", line) for line in lines):
                out.append("\n".join("- " + line[2:].strip() for line in lines))
            else:
                out.append("\n".join(lines))
        elif node.name == "table":
            for tr in node.select("tr"):
                cells = [clean(td.get_text(" ")) for td in tr.select("td,th")]
                if any(cells):
                    out.append(" · ".join(c for c in cells if c))
        else:
            for child in node.children:
                block(child)

    for child in root.children:
        block(child)
    text = "\n\n".join(out)
    return re.sub(r"\*\*\s*\*\*", "", text).strip()


# --- Site-wide pieces ---------------------------------------------------------------------

def menu_tree(ul: Tag) -> list[dict]:
    items = []
    for li in ul.find_all("li", recursive=False):
        a = li.find("a")
        if not a:
            continue
        item = {"label": clean(a.get_text()), "href": a.get("href", ""), "url": path_of(a.get("href"))}
        sub = li.find("ul")
        if sub:
            item["children"] = menu_tree(sub)
        items.append(item)
    return items


def harvest_home() -> dict:
    soup = fetch("/")
    decode_emails(soup)
    data: dict = {}
    bar = soup.select_one("#duyuruBar")
    if bar:
        a = bar.select_one("a")
        data["announcement"] = {"text": clean(bar.select_one(".duyuru-text").get_text()), "url": path_of(a.get("href") if a else "")}
    top = soup.select_one(".header-top")
    data["header"] = {
        "email": next((a["href"][7:] for a in top.select('a[href^="mailto:"]')), ""),
        "slogan": clean(top.select_one(".pull-right").get_text()).strip("“”\" "),
        "links": [{"title": a.get("title") or clean(a.get_text()), "url": path_of(a.get("href"))} for a in top.select(".pull-right a")],
    }
    logo = soup.select_one(".main-header .logo img") or soup.select_one(".logo img")
    data["logo_url"] = img_src(logo.get("src")) if logo else ""
    icon = soup.select_one('link[rel*="icon"]')
    data["favicon_url"] = img_src(icon.get("href")) if icon else ""
    data["header_buttons"] = [{"label": clean(a.get_text()), "url": path_of(a.get("href"))}
                              for a in soup.select(".header-lower .outer-box a, .header-lower .btn-box a") if clean(a.get_text())]
    nav = soup.select_one(".header-lower .main-menu .navigation") or soup.select_one(".header-lower ul")
    data["menu"] = menu_tree(nav)

    data["slides"] = []
    for slide in soup.select(".main-slider-carousel .slide"):
        links = [path_of(a.get("href")) for a in slide.select("a")]
        buttons = [{"label": clean(a.get_text()), "url": path_of(a.get("href"))} for a in slide.select(".button-box a")]
        layer = slide.select_one(".image-layer")
        mobile = slide.select_one(".d-md-none img, .mobile-image img")
        data["slides"].append({
            "image_url": bg_url(layer.get("style") if layer else ""),
            "mobile_image_url": img_src(mobile.get("src")) if mobile else "",
            "link": next((l for l in links if l), ""),
            "title": clean(slide.select_one("h1").get_text()) if slide.select_one("h1") else "",
            "buttons": [b for b in buttons if b["label"]],
        })

    band = soup.select_one("#eDevlet")
    if band:
        a = band.select_one("a")
        data["edevlet"] = {"text": clean(band.get_text()), "url": a.get("href") if a else ""}

    data["counters"] = [{"icon_url": img_src(item.select_one("img").get("src")), "value": clean(item.select_one(".counter").get_text()),
                         "label": clean(item.select_one("p").get_text())} for item in soup.select("#counter_area .counter_item")]

    causes = soup.select_one(".causes-section")
    data["donate_cards"] = [card_of(b, None) for b in causes.select(".cause-block-two")]
    data["donate_section"] = {
        "kicker": clean(causes.select_one(".sec-title .title").get_text()),
        "title": clean(causes.select_one(".sec-title h2").get_text()),
        "campaign_ids": [b.select_one(".kampanyaID")["value"] for b in causes.select(".cause-block-two") if b.select_one(".kampanyaID")],
    }

    ts = soup.select_one(".testimonial-section")
    data["testimonials"] = {
        "kicker": clean(ts.select_one(".sec-title .title").get_text()),
        "title": clean(ts.select_one(".sec-title h2").get_text()),
        "items": [],
    }
    for block in ts.select(".testimonial-block"):
        strong = block.select_one("strong")
        name = clean(strong.get_text()) if strong else ""
        if strong:
            strong.extract()
        role = block.select_one(".designation, .author-info span")
        data["testimonials"]["items"].append({"quote": clean(block.select_one(".text").get_text(" ")), "name": name,
                                              "role": clean(role.get_text()) if role else ""})

    quote = soup.select_one(".quote-section")
    count = quote.select_one(".count-text")
    data["support_form"] = {
        "image_url": img_src(quote.select_one(".image-column img").get("src")),
        "badge_value": f"{count.get('data-stop', '')}{clean(quote.select_one('.count-outer').get_text()).lstrip('0').strip()}" if count else "",
        "badge_text": clean(quote.select_one(".counter-box .text").get_text()),
        "kicker": clean(quote.select_one(".form-column .sec-title .title, .form-column .title").get_text()),
        "title": clean(quote.select_one(".form-column h2").get_text()),
        "button_label": clean(quote.select_one(".form-column button").get_text()) if quote.select_one(".form-column button") else "Gönder",
    }

    news = soup.select_one(".causes-section-two")
    data["news_section"] = {
        "kicker": clean(news.select_one(".sec-title .title").get_text()),
        "title": clean(news.select_one(".sec-title h2").get_text()),
        "all_label": clean(news.select_one(".button-box a").get_text()),
    }

    footer = soup.select_one("footer.main-footer")
    widgets = []
    for widget in footer.select(".footer-widget, .widgets-section .column"):
        title = widget.select_one("h4, h5, .widget-title")
        links = [{"label": clean(a.get_text()), "href": a.get("href", ""), "url": path_of(a.get("href"))} for a in widget.select("a")]
        widgets.append({"title": clean(title.get_text()) if title else "", "text": clean(widget.get_text(" ")), "links": links})
    data["footer"] = {
        "widgets": widgets,
        "bottom_links": [{"label": clean(a.get_text()), "href": a.get("href", ""), "url": path_of(a.get("href"))}
                         for a in footer.select(".footer-bottom a") if clean(a.get_text())],
        "address": next((clean(li.get_text()) for li in footer.select("li, p") if "Eskişehir" in li.get_text()), ""),
    }
    phones = sorted({a["href"][4:] for a in soup.select('a[href^="tel:"]')})
    whatsapp = next((a["href"] for a in soup.select('a[href*="wa.me"]')), "")
    data["contact"] = {
        "phones": phones, "email": data["header"]["email"], "address": data["footer"]["address"],
        "whatsapp": re.sub(r"\D", "", whatsapp.split("?")[0]) if whatsapp else "",
        "instagram": next((a["href"] for a in soup.select('a[href*="instagram.com"]')), ""),
    }
    data["mobile_bar"] = [{"label": clean(a.get_text()), "url": path_of(a.get("href"))} for a in soup.select("#mobilSepetDiv a")]
    return data


# --- Campaign cards (/bagis) --------------------------------------------------------------

def _hidden(block: Tag, cls: str) -> str:
    node = block.select_one(f"input.{cls}")
    return (node.get("value") or "").strip() if node else ""


def card_of(block: Tag, tab: str | None) -> dict:
    title = clean(block.select_one("h3").get_text())
    link = block.select_one("a.cgLink, a.kurbanBagisLinkV2") or next((a for a in block.select("a[href]") if path_of(a["href"]).startswith("/")), None)
    img = block.select_one(".image img")
    text = clean(block.select_one(".lower-content").get_text(" "))
    price = _hidden(block, "fiyatvar_orj")
    selects = block.select("select")
    niyet_select = next((x for x in selects if "Niyet" in x.get_text()), None)
    niyet = [clean(o.get_text()) for o in niyet_select.select("option") if "Seçiniz" not in o.get_text()] if niyet_select else []
    month_select = next((x for x in selects if re.search(r"\d+\s*Ay", x.get_text())), None)
    months = [int(m) for m in re.findall(r"(\d+)\s*Ay", month_select.get_text())] if month_select else []
    fixed_selects = [[clean(o.get_text()) for o in x.select("option")] for x in selects if x not in (niyet_select, month_select)]
    shares = re.search(r"(\d+)\s*Alınan Hisse\s*(\d+)\s*Toplam Hisse", text)
    quantity = "Hisse" if re.search(r"\bHisse\b", text.replace("Alınan Hisse", "").replace("Toplam Hisse", "")) else ("Adet" if re.search(r"\bAdet\b", text) else "")
    button = block.select_one(".addBasket .txt")
    return {
        "source_id": _hidden(block, "kampanyaID"),
        "type_id": _hidden(block, "inputturID"),
        "kurban_kind_id": _hidden(block, "inputKurbanCinsID"),
        "internal_name": clean(_hidden(block, "kampanyaAdi")),
        "title": title,
        "slug": path_of(link.get("href")).strip("/") if link else "",
        "image_url": img_src(img.get("src")) if img else "",
        "tab": tab,
        "price_try": int(float(price)) if price and price.replace(".", "", 1).isdigit() and float(price) > 0 else None,
        "max_share": int(_hidden(block, "kurbanhissesayisi")) if _hidden(block, "kurbanhissesayisi").isdigit() else None,
        "quantity_label": quantity,
        "niyet_options": [n.replace(" Kurban", "") for n in niyet],
        "durations": months,
        "variant_selects": fixed_selects,  # e.g. kurban: [["Keçi"], ["Afrika"]] (animal, region)
        "shares": {"taken": int(shares.group(1)), "total": int(shares.group(2))} if shares else None,
        "button_label": clean(button.get_text()) if button else "Bağış Yap",
    }


def fx_rates(soup: BeautifulSoup) -> dict:
    js = "\n".join(s.get_text() for s in soup.select("script"))
    rates = {}
    for key, code in (("DOLAR_KURU", "USD"), ("EURO_KURU", "EUR")):
        values = [float(v) for v in re.findall(rf"var {key}\s*=\s*([\d.]+)", js)]
        if values and values[-1] > 0:
            rates[code] = values[-1]
    return rates


def harvest_campaigns() -> dict:
    soup = fetch("/bagis")
    tabs = [{"key": a["href"].lstrip("#"), "label": clean(a.get_text())} for a in soup.select(".nav-tabs a, a.nav-link[href^='#']") if a.get("href", "").startswith("#")]
    seen: dict[str, dict] = {}
    for pane in soup.select(".tab-pane"):
        for block in pane.select(".cause-block-two"):
            card = card_of(block, pane.get("id"))
            if card["source_id"] in seen:  # a card shown under several tabs
                seen[card["source_id"]].setdefault("extra_tabs", []).append(pane.get("id"))
                continue
            seen[card["source_id"]] = card
    rates = fx_rates(soup)
    for card in seen.values():
        if card["price_try"] and rates:
            card["price"] = {"TRY": card["price_try"], **{c: round(card["price_try"] / r, 2) for c, r in rates.items()}}
    return {"tabs": tabs, "cards": list(seen.values()), "fx_rates_try": rates}


def harvest_campaign_details(cards: list[dict]) -> None:
    for card in cards:
        if not card["slug"] or card["slug"] in PAGE_SLUGS:
            continue
        try:
            soup = fetch("/" + card["slug"])
        except requests.RequestException as exc:
            card["detail_error"] = str(exc)
            continue
        decode_emails(soup)
        body = soup.select_one("#pageDetail .news-sidebar__content") or soup.select_one("#pageDetail")
        banner = soup.select_one("section.page-title")
        card["story"] = to_text(body) if body else ""
        card["banner_url"] = bg_url(banner.get("style")) if banner else ""
        card["gallery"] = [img_src(i.get("src")) for i in (body.select("img") if body else []) if CDN_HOST in (i.get("src") or "")]


# --- Pages and news -----------------------------------------------------------------------

def harvest_page(slug: str) -> dict:
    soup = fetch("/" + slug)
    decode_emails(soup)
    title = clean(soup.select_one("section.page-title h1").get_text())
    banner = bg_url(soup.select_one("section.page-title").get("style"))
    detail = soup.select_one("#pageDetail") or soup.select_one("section.contact-one")
    content = detail.select_one(".news-sidebar__content") or detail
    sidebar = [{"label": clean(a.get_text()), "url": path_of(a.get("href"))} for a in detail.select(".menuSidebarBilesen a")]
    page = {"slug": slug, "title": title, "banner_url": banner, "sidebar": sidebar,
            "images": [img_src(i.get("src")) for i in content.select("img") if CDN_HOST in (i.get("src") or "")],
            "iframes": [i.get("src") for i in soup.select("main iframe, section iframe")]}
    if slug == "iletisim":
        page["info"] = {clean(h.get_text()): clean(h.find_next(["p", "a", "span"]).get_text(" ")) for h in content.select("h4, h5, h6")}
        page["org_legal_name"] = clean(content.select_one("h2, h3").get_text()) if content.select_one("h2, h3") else ""
        page["form_fields"] = [i.get("placeholder") for i in content.select("form input[placeholder], form textarea")]
        cta = soup.select_one("section.cta-section-three")
        if cta:
            page["volunteer_cta"] = {"title": clean(cta.select_one("h2").get_text()), "text": clean(cta.select_one(".text").get_text()),
                                     "button": clean(cta.select_one(".button-box a").get_text()), "href": cta.select_one(".button-box a").get("href", ""),
                                     "image_url": bg_url(cta.get("style"))}
        page["body"] = ""
    elif slug == "hesap-numaralarimiz":
        page["intro"] = to_text(BeautifulSoup("".join(str(p) for p in content.find_all("p", recursive=False)), "html.parser"))
        page["banks"] = []
        for item in content.select(".accordion-item"):
            logo = item.select_one(".card-header img")
            name = clean(item.select_one(".card-header span").get_text()) if item.select_one(".card-header span") else ""
            facts = {clean(b.get_text()).rstrip(":"): clean(li.get_text()).split(":", 1)[-1].strip() for li in item.select("li") for b in li.select("b")}
            accounts = []
            for h5 in item.select("h5"):
                row = h5.find_parent(class_="row")
                values = [clean(s.get_text()) for s in row.select(".kopyala")]
                accounts.append({"currency": clean(h5.get_text()), "account_no": values[0] if values else "", "iban": values[1] if len(values) > 1 else ""})
            page["banks"].append({"name": name, "logo_url": img_src(logo.get("src")) if logo else "", "facts": facts, "accounts": accounts})
    elif slug == "sss":
        page["groups"] = []
        for pane in content.select(".tab-pane") or [content]:
            pid = pane.get("id")
            label = next((clean(a.get_text()) for a in soup.select(f'[href="#{pid}"], [data-bs-target="#{pid}"], [aria-controls="{pid}"]')), "")
            qa = []
            for item in pane.select(".accordion-block, .accordion-item, .faq-item"):
                q = item.select_one(".accordion-block-title, .accordion-button, h5, h4")
                a = item.select_one(".accordion-text, .accordion-body, .collapse")
                if q and a and clean(q.get_text()):
                    qa.append({"question": clean(q.get_text()), "answer": to_text(a)})
            if not qa:  # plain markup: question in <strong>/<h>, answer in the following <p>
                for q in pane.select("h3, h4, h5, strong"):
                    answer = q.find_next("p")
                    if answer and clean(q.get_text()).endswith("?"):
                        qa.append({"question": clean(q.get_text()), "answer": clean(answer.get_text(" "))})
            page["groups"].append({"label": label, "items": qa})
        page["body"] = to_text(content)
    elif slug == "tum-faaliyetlerimiz":
        page["post_links"] = [path_of(a["href"]).strip("/") for a in content.select(".news-block-two h4 a")]
        nxt = soup.select_one(".pagination a[rel=next], .styled-pagination a.next")
        page["has_more_pages"] = bool(nxt)
    else:
        page["body"] = to_text(content)
    return page


def harvest_post(slug: str, listing: dict) -> dict:
    soup = fetch("/" + slug)
    decode_emails(soup)
    detail = soup.select_one("#pageDetail") or soup.select_one("section.sidebar-page-container")
    content = detail.select_one(".news-sidebar__content") or detail.select_one(".col-xl-8") or detail
    side_card = detail.select_one(".sidebar .bagisKutusu")
    return {
        "slug": slug,
        "title": clean(soup.select_one("section.page-title h1").get_text()),
        "summary": listing.get("summary", ""),
        "date": listing.get("date", ""),
        "image_url": listing.get("image_url", ""),
        "body": to_text(content),
        "images": [img_src(i.get("src")) for i in content.select("img") if CDN_HOST in (i.get("src") or "")],
        "campaign_source_id": _hidden(side_card, "kampanyaID") if side_card else "",
        "campaign_name": clean(_hidden(side_card, "kampanyaAdi")) if side_card else "",
        "campaign_price_try": _hidden(side_card, "fiyatvar_orj") if side_card else "",
    }


def harvest_news() -> list[dict]:
    posts, page_no, seen = [], 1, set()
    while page_no < 20:
        soup = fetch("/tum-faaliyetlerimiz" + (f"?sayfa={page_no}" if page_no > 1 else ""))
        listing = []
        for block in soup.select(".news-block-two .inner-box"):
            a = block.select_one("h4 a")
            slug = path_of(a["href"]).strip("/")
            if slug in seen:
                continue
            seen.add(slug)
            date = clean(block.select_one(".post-meta").get_text()) if block.select_one(".post-meta") else ""
            listing.append({"slug": slug, "date": date, "summary": clean(block.select_one(".ozet").get_text()) if block.select_one(".ozet") else "",
                            "image_url": img_src(block.select_one(".image img").get("src")) if block.select_one(".image img") else ""})
        if not listing:
            break
        for item in listing:
            posts.append(harvest_post(item["slug"], item))
        if not soup.select_one(".pagination, .styled-pagination"):
            break
        page_no += 1
    return posts


# --- Live prices (JS-rendered) -------------------------------------------------------------

def browser_prices(cards: list[dict]) -> dict:
    """Open /bagis in headless Chromium, switch TL/USD/EUR and read every card's price from the DOM."""
    from playwright.sync_api import sync_playwright

    import os
    executable = os.environ.get("CHROMIUM_PATH") or None
    result: dict[str, dict[str, str]] = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=executable)
        page = browser.new_page(user_agent=UA)
        page.goto(f"{BASE}/bagis", wait_until="networkidle")
        rates = page.evaluate("() => ({USD: window.DOLAR_KURU || null, EUR: window.EURO_KURU || null, session: window.APP_CONFIG && window.APP_CONFIG.sessionParaBirimi})")
        # The page's own TL / Dolar / Euro dropdown (.btnParaBirimi) re-renders the card prices.
        for currency, button in (("TRY", ".butonTL"), ("USD", ".butonDolar"), ("EUR", ".butonEuro")):
            if page.locator(".btnParaBirimi").count():
                page.locator(".btnParaBirimi").first.click()
                page.locator(button).first.click()
                page.wait_for_load_state("networkidle")
                page.wait_for_timeout(800)
            values = page.evaluate("""() => [...document.querySelectorAll('.cause-block-two')].map(b => ({
                id: b.querySelector('.kampanyaID')?.value,
                price: b.querySelector('.inputkamp')?.value || b.querySelector('.inputkamp')?.placeholder,
                symbol: b.querySelector('.spanParaBirimi')?.textContent.trim()}))""")
            for v in values:
                if v["id"]:
                    result.setdefault(v["id"], {})[currency] = f'{v["price"]} {v["symbol"] or ""}'.strip()
        browser.close()
    for card in cards:
        if card["source_id"] in result:
            card["dom_prices"] = result[card["source_id"]]
    return {"window_rates": rates}


# --- Images -------------------------------------------------------------------------------

def collect_image_urls(obj, found: set[str], key: str = "") -> None:
    if isinstance(obj, dict):
        for k, value in obj.items():
            collect_image_urls(value, found, k)
    elif isinstance(obj, list):
        for value in obj:
            collect_image_urls(value, found, key)
    elif isinstance(obj, str) and CDN_HOST in obj and (
            re.search(r"\.(png|jpe?g|webp|gif|ico|svg)$", obj, re.I) or key.endswith(("image_url", "icon_url", "images", "gallery"))):
        found.add(obj)  # some STK PRO images have no extension (e.g. /video/keçi): the content type decides


def download_images(data: dict) -> dict[str, str]:
    urls: set[str] = set()
    collect_image_urls(data, urls)
    folder = OUT / "images"
    folder.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for url in sorted(urls):
        suffix = Path(urlparse(url).path).suffix.lower()
        known = suffix in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".svg")
        name = hashlib.sha1(url.encode()).hexdigest()[:16] + (suffix if known else "")
        existing = next(folder.glob(name + "*"), None) if not known else None
        target = existing or folder / name
        if not target.exists():
            try:
                res = session.get(url + "?w=1920" if "/upload/images/" in url else url, timeout=60)
                if res.status_code != 200 or not res.headers.get("content-type", "").startswith("image/"):
                    res = session.get(url, timeout=60)
                res.raise_for_status()
                if not known:
                    kind = res.headers.get("content-type", "").split(";")[0].split("/")[-1].replace("jpeg", "jpg").replace("svg+xml", "svg")
                    if kind not in ("png", "jpg", "webp", "gif", "svg"):
                        print(f"  ! {url}: not an image ({kind})", file=sys.stderr)
                        continue
                    target = folder / f"{name}.{kind}"
                target.write_bytes(res.content)
            except requests.RequestException as exc:
                print(f"  ! {url}: {exc}", file=sys.stderr)
                continue
        manifest[url] = target.name
    return manifest


def rasterize_svgs(manifest: dict[str, str]) -> None:
    """The media library stores raster images only: render each SVG (the logo) to a 3x PNG next to it."""
    import base64
    import os
    from playwright.sync_api import sync_playwright

    svgs = {url: name for url, name in manifest.items() if name.endswith(".svg")}
    if not svgs:
        return
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or None)
        page = browser.new_page(device_scale_factor=3)
        for url, name in svgs.items():
            data = base64.b64encode((OUT / "images" / name).read_bytes()).decode()
            page.set_content(f'<html><body style="margin:0;background:transparent"><img id="i" src="data:image/svg+xml;base64,{data}" style="height:160px"></body></html>')
            page.wait_for_timeout(200)
            png = name[:-4] + ".png"
            page.locator("#i").screenshot(path=str(OUT / "images" / png), omit_background=True)
            manifest[url] = png
        browser.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--browser", action="store_true", help="read JS-rendered prices with headless Chromium (playwright)")
    parser.add_argument("--no-images", action="store_true")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    print("home…")
    data = {"source": BASE, "harvested_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "home": harvest_home()}
    print("campaigns…")
    data["campaigns"] = harvest_campaigns()
    known = {c["source_id"] for c in data["campaigns"]["cards"]}
    for card in data["home"].pop("donate_cards"):  # shown on the home page but in no /bagis tab
        if card["source_id"] not in known:
            data["campaigns"]["cards"].append({**card, "home_only": True})
    harvest_campaign_details(data["campaigns"]["cards"])
    if args.browser:
        print("live prices…")
        data["campaigns"]["browser"] = browser_prices(data["campaigns"]["cards"])
    print("pages…")
    data["pages"] = {slug: harvest_page(slug) for slug in PAGE_SLUGS}
    print("news…")
    data["posts"] = harvest_news()
    if not args.no_images:
        print("images…")
        data["images"] = download_images(data)
        if args.browser:
            rasterize_svgs(data["images"])
    (OUT / "hakder.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    cards = data["campaigns"]["cards"]
    print(f"done: {len(cards)} campaign cards in {len(data['campaigns']['tabs'])} tabs, {len(data['pages'])} pages, "
          f"{len(data['posts'])} posts, {len(data.get('images', {}))} images -> {OUT / 'hakder.json'}")


if __name__ == "__main__":
    main()

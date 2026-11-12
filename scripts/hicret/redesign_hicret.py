#!/usr/bin/env python3
"""Full Hicret Derneği migration, theme, content and campaigns setup in e-infak.

Brings authentic content from hicretdernegi.org (71 Evler Külliyesi, 8 Eskişehir
branches, 4 educational divisions, announcements, donation campaigns and social
links) into e-infak under the Zümrüt & Antik Altın foundation theme.

Usage:
    docker exec -i einfak-backend python - --org hicret-dernegi < scripts/hicret/redesign_hicret.py
    docker exec -i einfak-backend python - --org hicret-dernegi --publish < scripts/hicret/redesign_hicret.py
"""
from __future__ import annotations

import argparse
import asyncio
import copy
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

sys.path.insert(0, "/app")

from sqlalchemy import select  # noqa: E402

import app.models  # noqa: E402,F401
from app.core.db import AsyncSessionLocal  # noqa: E402
from app.models.campaign import Campaign, CampaignCategory, CampaignStatus  # noqa: E402
from app.models.cms import SitePage, SitePageRevision  # noqa: E402
from app.models.content_post import ContentPost  # noqa: E402
from app.models.organization import Organization  # noqa: E402
from app.models.organization_settings import OrganizationSettings  # noqa: E402
from app.services.blocks import validate_blocks  # noqa: E402
from app.services.site import design_of  # noqa: E402
from app.services.templates import PAGE_BY_KEY, fresh_ids  # noqa: E402

BRAND, DEEP, GOLD, SAGE, INK, PAPER = "#0E7A5F", "#07261E", "#B47B1E", "#EEF4F0", "#162923", "#FBFAF6"
DESIGN = {
    "body_font": "inter",
    "heading_font": "lora",
    "radius": "large",
    "container": "wide",
    "page_color": PAPER,
    "text_color": INK,
    "heading_weight": "700",
    "heading_case": "normal",
}
BY = "tasarım-hicret-v3"
_n = [0]

DEMO_REMAP = {
    "/demo/mosque.svg": "/images/hicret/hicret-hero.png",
    "/demo/mosque.webp": "/images/hicret/hicret-hero.png",
    "/demo/education.svg": "/images/hicret/h-ibtida.png",
    "/demo/education.webp": "/images/hicret/h-ibtida.png",
    "/demo/quran.svg": "/images/hicret/h-hafizlik.png",
    "/demo/quran.webp": "/images/hicret/h-hafizlik.png",
    "/demo/water.svg": "/images/hicret/h-su.png",
    "/demo/water.webp": "/images/hicret/h-su.png",
    "/demo/kurban.svg": "/images/hicret/h-kurban.png",
    "/demo/kurban.webp": "/images/hicret/h-kurban.png",
    "/demo/orphan.svg": "/images/hicret/h-sibyan.png",
    "/demo/orphan.webp": "/images/hicret/h-sibyan.png",
    "/demo/food.svg": "/images/hicret/h-arapca.png",
    "/demo/food.webp": "/images/hicret/h-arapca.png",
    "/demo/community.svg": "/images/hicret/h-arapca.png",
    "/demo/community.webp": "/images/hicret/h-arapca.png",
    "/demo/hands.svg": "/images/hicret/h-hafizlik.png",
    "/demo/hands.webp": "/images/hicret/h-hafizlik.png",
    "/demo/relief.svg": "/images/hicret/h-kurban.png",
    "/demo/relief.webp": "/images/hicret/h-kurban.png",
    "/demo/winter.svg": "/images/hicret/h-sibyan.png",
    "/demo/winter.webp": "/images/hicret/h-sibyan.png",
    "/demo/ramadan.svg": "/images/hicret/hicret-hero.png",
    "/demo/ramadan.webp": "/images/hicret/hicret-hero.png",
}

SOCIAL_LINKS = {
    "facebook": "https://www.facebook.com/hicretdernegi26",
    "instagram": "https://www.instagram.com/hicretdernegi26/",
    "x": "https://x.com/hicretdernegi26",
    "youtube": "https://www.youtube.com/@hicretdernegi26",
}

PROGRAMS = [
    {
        "label": "Sıbyan (4-7 Yaş)",
        "title": "Sıbyan Mektebi — Değerler ve Kur'an Temeli",
        "text": "Küçük yaş grubundaki yavrularımız için oyun, adap ve sevgi temelli eğitim programı.\n\n"
                "- **Yaş Grubu:** 4-7 yaş · Hafta içi 09:00 - 12:00\n"
                "- **İçerik:** Elif-ba, temel İslami bilgiler, ahlak ve adap eğitimi, sosyal gelişim etkinlikleri",
        "image_url": "/images/hicret/h-sibyan.png",
        "button_label": "Eğitime Destek Ol",
        "button_url": "/kampanyalar/ibtida-ve-sibyan",
    },
    {
        "label": "İbtida (8-12 Yaş)",
        "title": "İbtida Programı — Temel İslami İlimler",
        "text": "İlköğretim çağındaki öğrencilerimiz için kapsamlı Kur'an ve temel dini ilimler eğitimi.\n\n"
                "- **Yaş Grubu:** 8-12 yaş · Pazartesi - Cuma 09:00 - 15:00\n"
                "- **İçerik:** Talim ve tecvid, temel Arapça, fıkıh, akaid, Siyer-i Nebi ve hadis dersleri",
        "image_url": "/images/hicret/h-ibtida.png",
        "button_label": "Talebeye Burs Ver",
        "button_url": "/kampanyalar/ibtida-ve-sibyan",
    },
    {
        "label": "Hafızlık (7+ Yaş)",
        "title": "Hafızlık Bölümü — Kur'an'ın Muhafızları",
        "text": "Kur'an-ı Kerim'i ezberlemek isteyen talebelerimiz için birebir takip ve kıraat programı.\n\n"
                "- **Süre:** 3-4 yıl · Pazartesi - Cumartesi 08:00 - 17:00\n"
                "- **İçerik:** Kur'an-ı Kerim ezberi, tecvid, kıraat dersleri, yatılı barınma ve iaşe desteği",
        "image_url": "/images/hicret/h-hafizlik.png",
        "button_label": "Hafız Yetiştir",
        "button_url": "/kampanyalar/hafiz-yetistiriyorum",
    },
    {
        "label": "Arapça (10+ Yaş)",
        "title": "Arapça Dil Eğitimi & İhtisas",
        "text": "İslami ilimlerin anahtarı olan Arapça dilini klasik medrese usulüyle öğreten program.\n\n"
                "- **Süre:** 2-3 yıl · Haftalık yoğun ders programı\n"
                "- **İçerik:** Sarf, nahiv, kelime hazinesi, metin çözümleme ve klasik İslami literatür okumaları",
        "image_url": "/images/hicret/h-arapca.png",
        "button_label": "Arapça Talebesini Destekle",
        "button_url": "/kampanyalar/arapca-ilmi-programi",
    },
]

BRANCHES = [
    ("🕌", "71 Evler Külliyesi (Merkez)", "71 Evler Mh. Esenyazı Sk. No:41 Odunpazarı · Tel: +90 542 641 26 26"),
    ("🏫", "Emek Şubesi", "Dilek Cd. No:36/A Odunpazarı · Cuma Sohbetleri · Tel: 0555 098 08 79"),
    ("🏫", "Çamlıca Şubesi", "Çamlıca Mh. Tombakzade Cd. No:123/A Tepebaşı · Salı · Tel: 0501 004 12 00"),
    ("🏫", "Gündoğdu Şubesi", "Gündoğdu Mh. Bayramören Sk. No:2 Odunpazarı · Perşembe · Tel: 0501 004 08 00"),
    ("🎓", "Hicret Gençlik (Bağlar)", "Üniversite Cd. 49A1 Tepebaşı · Cuma Sohbetleri · Tel: 0542 641 26 23"),
    ("🏫", "Zafer Şubesi", "Zafer Mh. Derman Cd. No:144/C Tepebaşı · Pazartesi · Tel: 0501 004 00 12"),
    ("🏫", "Şirintepe Şubesi", "Şirintepe Mh. Paşasoylu Sk. No:17 Tepebaşı · Pazartesi · Tel: 0501 004 13 00"),
    ("🏡", "Çifteler & Sivrihisar", "Çifteler (Adalar Mh. Telli Sk. No:23) & Sivrihisar (Hızır Bey Mh. Güvenlik Sk. No:22/A)"),
]

CAMPAIGNS_SEED = [
    {
        "slug": "hafiz-yetistiriyorum",
        "title": "Hafız Yetiştiriyorum (Talebe Bursu)",
        "summary": "Kur'an-ı Kerim ezberi yapan talebelerimizin eğitim, barınma ve iaşe giderlerine destek olun.",
        "story": "<p>Allah'ın kelamı olan Kur'an-ı Kerim'i ezberleyerek hafızlık yapan talebelerimizin barınma, beslenme, kırtasiye ve eğitim materyali ihtiyaçlarını hayırsever bağışçılarımızın desteğiyle karşılıyoruz.</p>",
        "category": CampaignCategory.EGITIM,
        "target_cents": 35000000,
        "collected_cents": 14200000,
        "suggested_amounts_cents": [60000, 120000, 240000, 600000],
        "cover_image_url": "/images/hicret/h-hafizlik.png",
        "is_featured": True,
        "display_order": 1,
    },
    {
        "slug": "ibtida-ve-sibyan",
        "title": "Sıbyan ve İbtida Eğitimi Desteği",
        "summary": "4-12 yaş arası talebelerimizin Kur'an, ahlak, adap ve temel İslami ilimler derslerine katkı sağlayın.",
        "story": "<p>Sıbyan Mektebi (4-7 yaş) ve İbtida (8-12 yaş) sınıflarımızda eğitim gören yavrularımızın kitap, materyal ve sınıf ihtiyaçlarını birlikte karşılıyoruz.</p>",
        "category": CampaignCategory.EGITIM,
        "target_cents": 25000000,
        "collected_cents": 9800000,
        "suggested_amounts_cents": [30000, 60000, 120000, 300000],
        "cover_image_url": "/images/hicret/h-ibtida.png",
        "is_featured": True,
        "display_order": 2,
    },
    {
        "slug": "arapca-ilmi-programi",
        "title": "Arapça ve İslami İlimler Programı",
        "summary": "Sarf, nahiv, fıkıh ve tefsir halkalarında yetişen ilim talebelerimizin yolculuğuna ortak olun.",
        "story": "<p>Klasik medrese usulüyle Arapça grameri, metin çözümleme ve İslami ilimler okuyan talebelerimizin burs ve kitap ihtiyaçlarına destek olabilirsiniz.</p>",
        "category": CampaignCategory.EGITIM,
        "target_cents": 30000000,
        "collected_cents": 11500000,
        "suggested_amounts_cents": [50000, 100000, 250000, 500000],
        "cover_image_url": "/images/hicret/h-arapca.png",
        "is_featured": True,
        "display_order": 3,
    },
    {
        "slug": "su-kuyusu",
        "title": "Su Kuyusu Projesi",
        "summary": "Temiz suya erişimi olmayan bölgelerde kalıcı su kuyuları açarak binlerce kişiye hayat oluyoruz.",
        "story": "<p>Kurak bölgelerde yaklaşık 1.000 kişinin temiz içme suyuna kavuşmasını sağlayan kalıcı su kuyusu projelerimize hisse veya tam kuyu olarak katkıda bulunabilirsiniz.</p>",
        "category": CampaignCategory.SU,
        "target_cents": 15000000,
        "collected_cents": 6850000,
        "suggested_amounts_cents": [50000, 150000, 500000, 1500000],
        "cover_image_url": "/images/hicret/h-su.png",
        "is_featured": True,
        "display_order": 4,
    },
    {
        "slug": "medrese-sofrasi",
        "title": "Medrese Sofrası ve İftar Desteği",
        "summary": "Medreselerimizde ilim tahsil eden talebelerimizin günlük yemek ve iftar sofralarını bereketlendirin.",
        "story": "<p>Yatılı ve gündüzlü talebelerimizin üç öğün sıcak yemek, Ramazan iftarları ve iaşe giderleri hayırseverlerimizin katkılarıyla hazırlanmaktadır.</p>",
        "category": CampaignCategory.GIDA,
        "target_cents": 20000000,
        "collected_cents": 8400000,
        "suggested_amounts_cents": [25000, 50000, 150000, 300000],
        "cover_image_url": "/images/hicret/hicret-hero.png",
        "is_featured": True,
        "display_order": 5,
    },
    {
        "slug": "vekalet-kurban",
        "title": "Vekalet Kurban (Adak · Akika · Şükür)",
        "summary": "Adak, akika, şükür ve vacip kurbanlarınızı İslami usullere uygun kesip ihtiyaç sahiplerine ulaştırıyoruz.",
        "story": "<p>Vekalet yoluyla emanet ettiğiniz büyükbaş hisse ve küçükbaş kurbanlarınız kesilerek talebe sofralarına ve ihtiyaç sahibi ailelere ulaştırılır.</p>",
        "category": CampaignCategory.KURBAN,
        "target_cents": 60000000,
        "collected_cents": 26400000,
        "suggested_amounts_cents": [350000, 1200000, 2400000],
        "cover_image_url": "/images/hicret/h-kurban.png",
        "is_featured": True,
        "display_order": 6,
    },
    {
        "slug": "rahle-bagisi",
        "title": "Rahle ve Eğitim Materyali Bağışı",
        "summary": "Kur'an-ı Kerim eğitiminde kullanılan ahşap rahle ve ders kitaplarının teminine katkı sağlayın.",
        "story": "<p>Yeni açılan sınıflarımız ve büyüyen talebe kadromuz için dayanıklı ahşap rahle, Mushaf ve temel ilmihal setleri temin ediyoruz.</p>",
        "category": CampaignCategory.EGITIM,
        "target_cents": 12000000,
        "collected_cents": 4650000,
        "suggested_amounts_cents": [25000, 50000, 100000, 250000],
        "cover_image_url": "/images/hicret/h-sibyan.png",
        "is_featured": False,
        "display_order": 7,
    },
    {
        "slug": "yetim-hamiligi",
        "title": "Yetim Eğitim ve İaşe Desteği",
        "summary": "Yetim ve ihtiyaç sahibi yavrularımızın eğitim, kırtasiye, giyim ve barınma giderlerini üstlenin.",
        "story": "<p>Yetim evlatlarımızın sıcak bir eğitim yuvasında güvenle büyümesi ve eğitim hayatlarını sürdürebilmesi için düzenli destek sağlıyoruz.</p>",
        "category": CampaignCategory.YETIM,
        "target_cents": 30000000,
        "collected_cents": 12500000,
        "suggested_amounts_cents": [50000, 100000, 250000, 500000],
        "cover_image_url": "/images/hicret/h-hafizlik.png",
        "is_featured": False,
        "display_order": 8,
    },
]

POSTS_SEED = [
    {
        "slug": "yaz-donemi-hafizlik-programi-basvurulari",
        "title": "Yaz Dönemi Hafızlık Programı Başvuruları Başladı",
        "kind": "haber",
        "summary": "Yaz tatilini verimli değerlendirmek isteyen öğrencilerimiz için yoğunlaştırılmış Kur'an ve hafızlık hazırlık programı kayıtları açıldı.",
        "body": "71 Evler Mahallemizdeki merkez külliyemiz ve Eskişehir genelindeki şubelerimizde yaz dönemi eğitim kayıtlarımız başlamıştır.\n\n## Program İçeriği\nÖğrencilerimiz yaş gruplarına göre Sıbyan, İbtida ve Hafızlık hazırlık sınıflarında temel dini bilgiler, talim, tecvid ve ahlak dersleri almaktadır.\n\nBaşvuru ve ayrıntılı bilgi için +90 542 641 26 26 numaralı hattımızdan idaremize ulaşabilirsiniz.",
        "image_url": "/images/hicret/h-hafizlik.png",
        "days_ago": 4,
    },
    {
        "slug": "arapca-bolumu-mezuniyet-ve-icazet-programi",
        "title": "Arapça Bölümü İcazet ve Mezuniyet Programı Gerçekleştirildi",
        "kind": "faaliyet",
        "summary": "Sarf, nahiv ve klasik İslami ilimler müfredatını tamamlayan talebelerimiz ailelerinin huzurunda belgelerini aldı.",
        "body": "Hicret İslami İlimler Medresemizde yıllar süren gayretli tahsilin ardından mezun olan talebelerimiz için duygu dolu bir program tertip edildi.\n\n## Köklü Medrese Geleneği\nProgram kapsamında Kur'an-ı Kerim tilaveti, ilmi sunumlar ve dualarla yeni dönemde hizmete atılacak mezunlarımız tebrik edildi.",
        "image_url": "/images/hicret/h-arapca.png",
        "days_ago": 12,
    },
    {
        "slug": "yeni-donem-sibyan-ve-ibtida-kayitlari",
        "title": "Yeni Eğitim Dönemi Sıbyan ve İbtida Kayıtları Hakkında",
        "kind": "haber",
        "summary": "4-7 yaş Sıbyan ve 8-12 yaş İbtida sınıflarımız için Eskişehir merkez ve ilçe şubelerimizde kayıt takvimi açıklandı.",
        "body": "Geleceğimizin teminatı yavrularımıza erken yaşta manevi değerler, adap ve Kur'an sevgisi kazandırmak amacıyla yeni dönem sınıflarımız hazırlanmaktadır.\n\n## Şubelerimiz\nOdunpazarı, Tepebaşı, Emek, Çamlıca, Gündoğdu, Zafer, Şirintepe, Çifteler ve Sivrihisar şubelerimizde ön görüşmeler sürmektedir.",
        "image_url": "/images/hicret/h-sibyan.png",
        "days_ago": 19,
    },
    {
        "slug": "eskisehir-subelerimizde-haftalik-ilim-ve-sohbet-halkalari",
        "title": "Eskişehir Şubelerimizde Haftalık İlim ve Sohbet Halkaları",
        "kind": "faaliyet",
        "summary": "Eskişehir'in 8 farklı noktasındaki şubelerimizde haftanın belirli günlerinde tefsir, hadis ve ilmihal sohbetleri devam ediyor.",
        "body": "Mahallelerimizin manevi hayatına katkı sunmak amacıyla Emek, Çamlıca, Gündoğdu, Bağlar, Zafer, Şirintepe, Çifteler ve Sivrihisar şubelerimizde haftalık sohbetler düzenlenmektedir.\n\nTüm hemşehrilerimiz aileleriyle birlikte sohbet meclislerimize davetlidir.",
        "image_url": "/images/hicret/hicret-hero.png",
        "days_ago": 27,
    },
    {
        "slug": "medrese-talebelerimizle-bereketli-sofralar",
        "title": "Medrese Talebelerimizle Paylaşmanın Bereketi: Medrese Sofrası",
        "kind": "faaliyet",
        "summary": "Hayırsever bağışçılarımızın destekleriyle yatılı ve gündüzlü talebelerimizin günlük sıcak yemek ve iaşe sofraları kuruluyor.",
        "body": "İlmiyle meşgul olan yüzlerce talebemizin günlük yemek ihtiyaçları aşhanemizde özenle hazırlanmaktadır.\n\nSiz de Medrese Sofrası kampanyamıza katkı sunarak bir talebemizin öğününe veya bir günün sofrasına vesile olabilirsiniz.",
        "image_url": "/images/hicret/h-ibtida.png",
        "days_ago": 35,
    },
    {
        "slug": "su-kuyusu-ve-vekalet-kurban-emanetleri-yerine-ulasti",
        "title": "Su Kuyusu ve Vekalet Kurban Emanetleri İhtiyaç Sahiplerine Ulaştı",
        "kind": "haber",
        "summary": "Bağışçılarımızın vekaletleriyle açılan su kuyuları ve kesilen kurbanların teslimat bilgilendirmeleri tamamlandı.",
        "body": "Yurt içi ve yurt dışı yardım çalışmalarımız kapsamında hayırseverlerimizin emanet ettiği su kuyusu hisseleri ve adak, akika, şükür kurbanları şeffaf biçimde ihtiyaç sahiplerine ulaştırıldı.\n\nDestek veren tüm bağışçılarımıza teşekkür ederiz.",
        "image_url": "/images/hicret/h-su.png",
        "days_ago": 44,
    },
]


def B(
    block_type: str,
    style: Optional[dict] = None,
    mobile: Optional[dict] = None,
    advanced: Optional[dict] = None,
    children: Optional[list] = None,
    p: Optional[dict] = None,
    **props,
) -> dict:
    _n[0] += 1
    block: dict[str, Any] = {
        "id": f"hc-{block_type.replace('_', '-')[:10]}-{_n[0]}",
        "type": block_type,
        "props": {**props, **(p or {})},
    }
    if style or mobile:
        block["style"] = {**({"desktop": style} if style else {}), **({"mobile": mobile} if mobile else {})}
    if advanced:
        block["advanced"] = advanced
    if children is not None:
        block["children"] = children
    return block


def find(blocks: list, block_type: str, where=lambda b: True) -> Optional[dict]:
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


def remap_assets(obj: Any) -> tuple[Any, bool]:
    changed = False
    if isinstance(obj, str):
        mapped = DEMO_REMAP.get(obj)
        return (mapped, True) if mapped else (obj, False)
    if isinstance(obj, list):
        out = []
        for item in obj:
            val, c = remap_assets(item)
            changed = changed or c
            out.append(val)
        return out, changed
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            val, c = remap_assets(v)
            changed = changed or c
            out[k] = val
        return out, changed
    return obj, False


def section(children: list, bg: Optional[str] = None, top: int = 72, bottom: int = 72, color: Optional[str] = None, **extra) -> dict:
    style: dict[str, Any] = {"padding_top": top, "padding_bottom": bottom, **extra}
    if bg:
        style["bg_color"] = bg
    if color:
        style["text_color"] = color
    return B("section", style=style, mobile={"padding_top": 44, "padding_bottom": 44}, children=[c for c in children if c])


def heading(text: str, kicker: Optional[str] = None, subtitle: Optional[str] = None, align: str = "center", level: str = "h2") -> dict:
    props: dict[str, Any] = {"text": text, "level": level}
    if kicker:
        props["kicker"] = kicker
    if subtitle:
        props["subtitle"] = subtitle
    return B("heading", style={"text_align": align}, **props)


CARD = {"bg_color": "#FFFFFF", "radius": 16, "shadow": "md", "padding_top": 40, "padding_bottom": 40, "padding_left": 40, "padding_right": 40}
CARD_MOBILE = {"padding_top": 28, "padding_bottom": 28, "padding_left": 24, "padding_right": 24}


def story(image: str, alt: str, kicker: str, title: str, text: str, label: str, url: str, image_side: str = "left") -> dict:
    picture = B("column", children=[B("image", style={"padding_top": 0, "padding_bottom": 0}, image_url=image, alt=alt, aspect="4/3")])
    card = B("column", style=CARD, mobile=CARD_MOBILE, children=[
        heading(title, kicker=kicker, align="left", level="h3"),
        B("richtext", style={"margin_top": 12}, text=text),
        B("buttons", style={"margin_top": 20}, align="left", items=[{"label": label, "url": url, "style": "primary"}]),
    ])
    return B("columns", ratio="1-1", gap=48, valign="center", children=[picture, card] if image_side == "left" else [card, picture])


def tile(image: str, alt: str, kicker: str, title: str, text: str, label: str, url: str) -> dict:
    return B("column", style={"bg_color": "#FFFFFF", "radius": 16, "shadow": "md", "padding_bottom": 32, "hover_shadow": "xl"}, children=[
        B("image", image_url=image, alt=alt, aspect="16/9", link=url),
        B("heading", style={"text_align": "center", "padding_left": 24, "padding_right": 24, "margin_top": 16}, text=title, kicker=kicker, level="h3"),
        B("richtext", style={"text_align": "center", "padding_left": 28, "padding_right": 28, "margin_top": 8, "font_size": 15}, text=text),
        B("buttons", style={"margin_top": 18}, align="center", items=[{"label": label, "url": url, "style": "outline"}]),
    ])


# --- Header -------------------------------------------------------------------------------

def build_header(old: list) -> list:
    logo = find(old, "logo") or B("logo")
    logo["props"].update({"light": False, "show_name": True, "show_tagline": True, "size": 46})
    menu = find(old, "nav_menu") or B("nav_menu", source="header", mobile="drawer", drawer_donate=True)
    menu["props"].update({"align": "center", "mobile": "drawer", "drawer_donate": True})
    menu["style"] = {"desktop": {"font_size": 14, "font_weight": "600"}}
    account = find(old, "account_links") or B("account_links", layout="inline", show_portal=True, show_verify=True)
    account["advanced"] = {"hide_mobile": True}

    strip = B("header_row", style={"font_size": 13, "bg_color": DEEP, "text_color": "#E5EFEA"}, tone="dark", height=40, border=False, children=[
        B("header_slot", children=[B("contact_info", layout="inline", show_phone=True, show_email=True)]),
        B("header_slot", children=[]),
        B("header_slot", children=[
            account,
            B("social_icons", p={"style": "text"}, advanced={"hide_mobile": True}),
        ]),
    ])
    cart = find(old, "cart_button") or B("cart_button", label="Sepetim", show_label=False)
    cart["advanced"] = {**cart.get("advanced", {}), "hide_mobile": True}
    right_items = [
        find(old, "language_switcher"),
        cart,
        B("donate_button", style={"radius": 999}, label="Bağış Yap", url="/kampanyalar", size="md", heart=True, p={"style": "accent"},
          advanced={"hide_mobile": True}),
    ]
    main = B("header_row", tone="light", height=88, sticky=True, shrink=True, border=True, center_align="center", children=[
        B("header_slot", children=[logo]),
        B("header_slot", children=[menu]),
        B("header_slot", children=[b for b in right_items if b]),
    ])
    return [strip, main]


# --- Home ---------------------------------------------------------------------------------

HICRET_SLIDES = [
    {
        "image_url": "/images/hicret/hicret-hero.png",
        "badge": "HİCRET DERNEĞİ · ESKİŞEHİR",
        "title": "İlimle yetişen nesiller, iyilikle büyüyen yarınlar",
        "text": "Sıbyan, İbtida, Hafızlık ve Arapça bölümlerimizle asırlık medrese geleneğini Eskişehir'de yaşatıyoruz.",
        "button_label": "Talebeye Destek Ol",
        "button_url": "/kampanyalar/hafiz-yetistiriyorum",
        "button2_label": "Bölümlerimiz",
        "button2_url": "/sayfa/faaliyetlerimiz",
        "align": "left",
        "overlay": 42,
    },
    {
        "image_url": "/images/hicret/h-hafizlik.png",
        "badge": "HAFIZLIK & İLİM MECLİSİ",
        "title": "Bir hafızın ilim yolculuğuna ortak olun",
        "text": "71 Evler Külliyemiz ve Eskişehir'deki 8 şubemizde eğitim gören yüzlerce talebemizin iaşe ve eğitim giderlerini birlikte karşılıyoruz.",
        "button_label": "Projeleri İncele",
        "button_url": "/kampanyalar",
        "button2_label": "Gönüllü Ol",
        "button2_url": "/sayfa/gonullu-ol",
        "align": "left",
        "overlay": 44,
    },
    {
        "image_url": "/images/hicret/h-su.png",
        "badge": "SU KUYUSU & VEKALET KURBAN",
        "title": "Emanetleriniz sınırları aşsın, hayra dönüşsün",
        "text": "Kalıcı su kuyuları ve adak, akika, şükür kurbanı organizasyonlarımızla mazlum gönüllere umut ulaştırıyoruz.",
        "button_label": "Su Kuyusu & Kurban",
        "button_url": "/kampanyalar/su-kuyusu",
        "button2_label": "Hesap Numaraları",
        "button2_url": "/sayfa/hesap-numaralari",
        "align": "left",
        "overlay": 44,
    },
]

WORK_AREAS = [
    ("📖", "Hafızlık Eğitimi (7+ Yaş)", "Kur'an-ı Kerim ezberi, tecvid ve kıraat dersleriyle birebir takip eşliğinde hafızlar yetiştiriyoruz.", "/sayfa/faaliyetlerimiz"),
    ("🕌", "Arapça & İslami İlimler", "Klasik medrese usulüyle sarf, nahiv, fıkıh ve hadis halkalarında düzenli eğitim sunuyoruz.", "/sayfa/faaliyetlerimiz"),
    ("🎓", "Sıbyan & İbtida (4-12 Yaş)", "Küçük yaşta değerler eğitimi, adap, elif-ba ve temel dini bilgilerle yetişen nesillere rehberlik ediyoruz.", "/sayfa/faaliyetlerimiz"),
    ("💧", "Su Kuyusu Projeleri", "Temiz suya erişimi kısıtlı bölgelerde yaklaşık 1.000 kişiye hayat veren kalıcı su kuyuları açıyoruz.", "/kampanyalar/su-kuyusu"),
    ("🐑", "Vekalet Kurban", "Adak, akika, şükür ve vacip kurbanlarınızı kesim görüntüsü ve bilgilendirmeyle ihtiyaç sahiplerine ulaştırıyoruz.", "/sayfa/kurban"),
    ("🍽️", "Medrese Sofrası & Yetim", "Talebe iaşe sofraları, Ramazan iftarları ve yetim eğitim hamiliği ile hayırseverleri buluşturuyoruz.", "/kampanyalar/medrese-sofrasi"),
]


def build_home(old: list) -> list:
    slider = B("slider", slides=HICRET_SLIDES, layout="card", nav="thumbs", autoplay=True, interval=6, effect="fade", arrows=True, dots=True)
    counters = B("counters", look="cards", items=[
        {"icon": "🕌", "value": 30, "suffix": "yıl", "label": "Eğitim & Hizmet Tecrübesi"},
        {"icon": "📍", "value": 8, "label": "Eskişehir Şubemiz"},
        {"icon": "📖", "value": 450, "suffix": "+", "label": "Yetişen Hafız & Talebe"},
        {"icon": "🤲", "value": 12500, "suffix": "+", "label": "Hayırsever Destekçimiz"},
    ])
    cards = B("donation_cards", source="featured", limit=6, columns=3, layout="grid", button_label="Bağış Yap")
    testimonials = B("testimonials", kicker="VELİ VE BAĞIŞÇI GÖRÜŞLERİ", title="Gönülden gelen teşekkürler", items=[
        {"quote": "Arapça bölümündeki eğitim disiplini ve hocalarımızın ilgisi bizleri çok memnun ediyor. Evladımız severek devam ediyor.", "name": "Ahmet Y.", "role": "Odunpazarı · Veli"},
        {"quote": "Yıllardır talebe bursu ve medrese sofrasına destek veriyoruz; her kuruşun yerinde kullanıldığını görmek güven veriyor.", "name": "Mustafa E.", "role": "Tepebaşı · Bağışçı"},
        {"quote": "Vekalet kurban bilgilendirmemiz aynı gün ulaştı. Eskişehir'imizdeki bu güzel hizmeti desteklemeye devam edeceğiz.", "name": "Mehmet K.", "role": "Eskişehir · Bağışçı"},
    ])

    return [b for b in [
        slider,
        section([counters], top=28, bottom=44),
        B("marquee", tone="dark", speed="normal", separator="✦", items=[
            {"text": t} for t in (
                "Sıbyan Mektebi (4-7 Yaş)", "İbtida Sınıfları (8-12 Yaş)", "Hafızlık Bölümü",
                "Arapça Medresesi", "Medrese Sofrası", "Su Kuyusu",
                "Vekalet Kurban", "Eskişehir · 8 Şube",
            )
        ]),
        section([
            B("features", kicker="HİZMET ALANLARIMIZ", title="İlim ve iyilik yolunda çalışmalarımız",
              text="Eskişehir 71 Evler Külliyesi başta olmak üzere 8 şubemizde eğitim ve insani yardım hizmetlerimizi emanet bilinciyle sürdürüyoruz.",
              columns=3, look="card",
              items=[{"icon": icon, "title": title, "text": text, "url": url} for icon, title, text, url in WORK_AREAS])
        ], bg=SAGE),
        section([
            heading("Aktif bağış projelerimiz", "BAĞIŞ KAMPANYALARI", "Destek olmak istediğiniz projeye tutarınızı yazıp sepete ekleyin; bağış makbuzunuz güvenle oluşturulsun."),
            B("spacer", height=20),
            cards,
            B("buttons", style={"margin_top": 28}, align="center", items=[
                {"label": "Tüm Kampanyaları Gör (8 Proje)", "url": "/kampanyalar", "style": "outline"},
            ]),
        ]),
        section([
            heading("Eğitim bölümlerimiz", "MEDRESE PROGRAMLARIMIZ", "Yaş gruplarına göre yapılandırılmış dört temel ilim halkamız."),
            B("spacer", height=20),
            B("tabs", look="tabs", items=PROGRAMS),
        ], bg=SAGE),
        section([
            story(
                "/images/hicret/h-ibtida.png",
                "Medrese sınıfında eğitim gören talebeler ve hoca efendi",
                "EĞİTİM FAALİYETLERİMİZ",
                "Asırlık medrese geleneğiyle ilim yolculuğu",
                "İbtida seviyesinden hafızlık ve ihtisas halkalarına kadar talebelerimizin eğitim, kırtasiye ve barınma süreçlerini birebir takip ediyoruz.",
                "Faaliyetlerimizi incele",
                "/sayfa/faaliyetlerimiz",
                image_side="right",
            )
        ]),
        section([
            B("columns", ratio="1-1", gap=32, valign="stretch", children=[
                tile(
                    "/images/hicret/h-kurban.png",
                    "Kurban bağış organizasyonu",
                    "KURBAN",
                    "Vekalet kurban organizasyonu",
                    "Adak, akika, şükür ve vacip kurbanlarınızı İslami usullere uygun kestirip ihtiyaç sahiplerine ulaştırıyoruz.",
                    "Kurban sayfasına git",
                    "/sayfa/kurban",
                ),
                tile(
                    "/images/hicret/h-arapca.png",
                    "Eskişehir şubeleri ve kurumsal yapı",
                    "8 ŞUBE · ESKİŞEHİR",
                    "Şubelerimiz ve kurumsal tarihçemiz",
                    "Odunpazarı'ndan Tepebaşı'na, Çifteler'den Sivrihisar'a uzanan eğitim noktalarımızı ve hikâyemizi tanıyın.",
                    "Hakkımızda & Şubeler",
                    "/sayfa/hakkimizda-sayfasi",
                ),
            ])
        ], bg=SAGE),
        section([
            B("quote", text="De ki: Hiç bilenlerle bilmeyenler bir olur mu?", source="Zümer Suresi, 9", look="centered")
        ], top=56, bottom=56),
        section([
            story(
                "/images/hicret/h-sibyan.png",
                "Sıbyan ve değerler eğitimi sınıfı",
                "GÖNÜLLÜLÜK & BURS",
                "İyiliğe ve eğitime gönüllümüz olun",
                "Zamanınızı, bilginizi veya emeğinizi ilim talebelerimizin yetişmesine ve mahalle sohbetlerimize katabilirsiniz.",
                "Gönüllü başvurusu",
                "/sayfa/gonullu-ol",
                image_side="left",
            ),
            B("spacer", height=48),
            story(
                "/images/hicret/h-hafizlik.png",
                "Hafızlık meclisi ve emanet paylaşımı",
                "ŞEFFAFLIK",
                "Şeffaflık ve faaliyet raporları",
                "Bağışlarınızın hangi kalemlere ve ne şekilde ulaştığını açık raporlarla sizlerle paylaşıyoruz.",
                "Raporları gör",
                "/sayfa/seffaflik",
                image_side="right",
            ),
        ], bg=SAGE),
        section([
            B("news", kicker="DUYURULAR & FAALİYETLER", title="Medresemizden gelişmeler", limit=3, layout="grid",
              all_label="Tüm duyuruları gör", all_url="/haberler")
        ]),
        section([testimonials], bg=SAGE, top=56, bottom=56),
        section([
            heading("71 Evler Külliyesi ve şubelerimiz için bize ulaşın", "İLETİŞİM VE DESTEK",
                    "Sorularınız, kayıt görüşmeleri veya havale/EFT bilgilendirmeleri için +90 542 641 26 26 hattımızdan bize ulaşabilirsiniz."),
            B("buttons", style={"margin_top": 24}, align="center", items=[
                {"label": "İletişim & Şubeler", "url": "/sayfa/bize-ulasin", "style": "light"},
                {"label": "Hesap Numaraları", "url": "/sayfa/hesap-numaralari", "style": "outline"},
            ]),
        ], bg=DEEP, color="#FFFFFF", top=64, bottom=64),
    ] if b]


# --- Enriched Internal Pages --------------------------------------------------------------

def build_activities_page() -> list:
    return [
        B("banner", layout="image", image_url="/images/hicret/hicret-hero.png", kicker="EĞİTİM & HİZMETLERİMİZ",
          title="Faaliyetlerimiz ve Bölümlerimiz",
          subtitle="Sıbyan, İbtida, Hafızlık, Arapça ve insani yardım çalışmalarımız.", align="center",
          style={"desktop": {"min_height": 340}}),
        section([
            heading("Dört temel eğitim bölümümüz", "EĞİTİM BÖLÜMLERİMİZ", "Öğrencilerimizin yaş ve seviyesine göre yapılandırılmış medrese müfredatı."),
            B("spacer", height=20),
            B("tabs", look="tabs", items=PROGRAMS),
        ], bg=SAGE),
        section([
            B("features", kicker="ÖZEL PROGRAMLAR & İNSANİ YARDIM", title="Yıl boyunca süren çalışmalarımız", columns=3, look="card", items=[
                {"icon": icon, "title": title, "text": text, "url": url} for icon, title, text, url in WORK_AREAS
            ])
        ]),
        section([
            B("news", kicker="DUYURULAR", title="Son haberler ve etkinlikler", limit=6, layout="grid", all_label="Tümünü gör", all_url="/haberler")
        ], bg=SAGE),
    ]


def build_about_page() -> list:
    return [
        B("banner", layout="image", image_url="/images/hicret/h-arapca.png", kicker="KURUMSAL",
          title="Hakkımızda", subtitle="Köklü medrese geleneğini modern eğitim anlayışıyla Eskişehir'de yaşatıyoruz.", align="center",
          style={"desktop": {"min_height": 340}}),
        section([
            story(
                "/images/hicret/hicret-hero.png",
                "Hicret İslami İlimler Medresesi",
                "BİZ KİMİZ",
                "1995'ten bu yana ilim ve hizmet yolunda",
                "Hicret Eğitim ve Yardımlaşma Derneği olarak 71 Evler Külliyemiz ve Eskişehir genelindeki şubelerimizde hafızlık, Arapça ve temel İslami ilimler eğitimi verirken; yurt içi ve yurt dışında su kuyusu, kurban ve yetim destekleri yürütüyoruz.",
                "Tarihçemizi İncele",
                "/sayfa/tarihce",
                image_side="left",
            )
        ]),
        section([
            B("features", kicker="TEMEL DEĞERLERİMİZ", title="Eğitim ve hizmet anlayışımız", columns=4, look="card", items=[
                {"icon": "🕌", "title": "Köklü Gelenek", "text": "Asırlık medrese usulünü güncel eğitim yöntemleriyle harmanlıyoruz."},
                {"icon": "🤲", "title": "Bireysel İlgi", "text": "Her talebemize seviyesine ve kabiliyetine göre özel rehberlik sunuyoruz."},
                {"icon": "📜", "title": "Güvenilir Eğitim", "text": "Deneyimli hoca kadromuz ve düzenli takip sistemimizle ilmi sağlamlaştırıyoruz."},
                {"icon": "⭐", "title": "Manevi Gelişim", "text": "Bilginin yanında ahlak, adap ve kardeşlik bilinciyle nesiller yetiştiriyoruz."},
            ])
        ], bg=SAGE),
        section([
            B("features", kicker="ESKİŞEHİR ŞUBELERİMİZ", title="8 şubemizle şehrin dört bir yanındayız",
              text="Odunpazarı, Tepebaşı, Çifteler ve Sivrihisar'da sohbet, Kur'an halkaları ve öğrenci kayıtları devam etmektedir.",
              columns=4, look="bordered", align="left",
              items=[{"icon": icon, "title": title, "text": text, "url": "/sayfa/bize-ulasin"} for icon, title, text in BRANCHES])
        ]),
        B("cta_band", kicker="İYİLİKTE BULUŞALIM", title="Eğitime ve iyiliğe ortak olun",
          text="Bir talebemizin bursuna destek verebilir veya şubelerimizi ziyaret edebilirsiniz.",
          button_label="Kampanyaları Gör", button_url="/kampanyalar"),
    ]


def build_contact_page(old: list) -> list:
    faq = find(old, "faq")
    return [b for b in [
        B("banner", layout="image", image_url="/demo/pattern.svg", kicker="İLETİŞİM",
          title="Bize Ulaşın", subtitle="71 Evler Külliyesi merkez adresimiz, telefon hattımız ve Eskişehir şubelerimiz.", align="center",
          style={"desktop": {"min_height": 300}}),
        section([
            B("columns", ratio="1-1-1", gap=24, valign="stretch", children=[
                B("column", style=CARD, mobile=CARD_MOBILE, children=[
                    B("contact_info", title="Merkez İletişim", layout="stacked", show_phone=True, show_email=True, show_address=True),
                ]),
                B("column", style=CARD, mobile=CARD_MOBILE, children=[
                    heading("Çalışma Saatlerimiz", align="left", level="h3"),
                    B("richtext", style={"margin_top": 12}, text="- **Pazartesi – Cuma:** 08:00 - 17:00\n- **Cumartesi:** 09:00 - 14:00\n- **Pazar:** Kapalı\n\nMerkezimiz 71 Evler Mh. Esenyazı Sk. No:41 (Mahmud Efendi Külliyesi) adresindedir."),
                ]),
                B("column", style=CARD, mobile=CARD_MOBILE, children=[
                    heading("Hızlı İşlemler", align="left", level="h3"),
                    B("richtext", style={"margin_top": 12}, text="Havale/EFT dekont bilgilendirmesi veya bağış makbuzu doğrulaması için çevrimiçi sayfalarımızı kullanabilirsiniz."),
                    B("buttons", style={"margin_top": 18}, align="left", items=[
                        {"label": "Hesap Numaraları", "url": "/sayfa/hesap-numaralari", "style": "primary"},
                        {"label": "Makbuz Doğrula", "url": "/verify", "style": "outline"},
                    ]),
                ]),
            ])
        ], bg=SAGE),
        section([
            B("features", kicker="ŞUBELERİMİZ", title="Eskişehir şube rehberi", columns=4, look="card", align="left", items=[
                {"icon": icon, "title": title, "text": text} for icon, title, text in BRANCHES
            ])
        ]),
        section([B("contact_form", kicker="MESAJ GÖNDERİN", title="Bize yazın", text="Kayıt, bağış veya gönüllülük sorularınızı iletin; ekibimiz en kısa sürede dönüş yapsın.", button_label="Mesajı Gönder")]) ,
        section([faq], bg=SAGE) if faq else None,
    ] if b]


# --- Footer -------------------------------------------------------------------------------

def build_footer(old: list) -> list:
    small = {"font_size": 14}
    logo = find(old, "logo") or B("logo", show_about=True)
    logo["props"].update({"light": True, "show_about": True, "show_name": True, "show_tagline": True, "size": 44})

    main = B(
        "section",
        style={"bg_color": DEEP, "text_color": "#E5EFEA", "padding_top": 60, "padding_bottom": 44},
        mobile={"padding_top": 40, "padding_bottom": 32},
        children=[
            B("columns", ratio="1-1-1-1", gap=40, valign="start", children=[
                B("column", children=[
                    logo,
                    B("social_icons", style={"margin_top": 18}, p={"style": "round"}),
                ]),
                B("column", children=[B("nav_menu", style=small, title="Hızlı Menü", source="header", layout="vertical", mobile="inline")]),
                B("column", children=[B("nav_menu", style=small, title="Bilgi Panosu", source="footer", layout="vertical", mobile="inline")]),
                B("column", children=[
                    B("contact_info", style=small, title="İletişim", layout="stacked", show_phone=True, show_email=True, show_address=True),
                    B("donate_button", style={"margin_top": 18, "radius": 999}, label="Bağış Yap", url="/kampanyalar", size="md", heart=True, p={"style": "accent"}),
                ]),
            ]),
        ],
    )
    bar = B(
        "section",
        style={"bg_color": "#041913", "text_color": "#9DBAB0", "padding_top": 14, "padding_bottom": 14, "font_size": 13},
        children=[find(old, "copyright") or B("copyright", show_powered=True)],
    )
    bar["children"][0]["style"] = {"desktop": {"text_align": "left"}}
    tab_bar = find(old, "mobile_tab_bar")
    return [b for b in (main, bar, tab_bar) if b]


# --- Data Seed Helpers --------------------------------------------------------------------

async def sync_hicret_org(db, org: Organization) -> None:
    org.theme_primary_color, org.theme_accent_color = BRAND, GOLD
    org.logo_url = "/images/hicret/logo.png"
    org.favicon_url = "/images/hicret/logo.png"
    org.phone = "+90 542 641 26 26"
    org.email = "hicretdernegi26@gmail.com"
    org.address = "71 Evler Mh. Esenyazı Sk. No:41, Odunpazarı / Eskişehir"
    org.city = "Eskişehir"
    org.tagline = "İlimle yetişen nesiller"
    org.site = {
        **(org.site or {}),
        "contact": {
            "phone": "+90 542 641 26 26",
            "email": "hicretdernegi26@gmail.com",
            "address": "71 Evler Mh. Esenyazı Sk. No:41, Odunpazarı / Eskişehir",
        },
        "social_links": SOCIAL_LINKS,
        "footer_text": "Hicret Eğitim ve Yardımlaşma Derneği — 1995'ten beri Eskişehir'de ilim ve hayır hizmetleri.",
        "design": design_of({"design": DESIGN}),
    }
    settings = (await db.execute(select(OrganizationSettings).where(OrganizationSettings.organization_id == org.id))).scalar_one_or_none()
    if settings is None:
        settings = OrganizationSettings(organization_id=org.id)
        db.add(settings)
    settings.contact_phone = "+90 542 641 26 26"
    settings.contact_email = "hicretdernegi26@gmail.com"
    settings.contact_address = "71 Evler Mh. Esenyazı Sk. No:41, Odunpazarı / Eskişehir"
    settings.about_text = (
        "Hicret Eğitim ve Yardımlaşma Derneği, Eskişehir 71 Evler Külliyesi ve 8 şubesinde "
        "Sıbyan (4-7 yaş), İbtida (8-12 yaş), Hafızlık ve Arapça bölümleriyle eğitim; "
        "yurt içi ve yurt dışında ise su kuyusu, kurban ve yetim yardımları yürütür."
    )
    settings.mission_text = "Asırlık medrese geleneğiyle ahlaklı, ilimli ve ümmete faydalı nesiller yetiştirmek; ihtiyaç sahiplerine şeffaf ve güvenli köprüler kurmak."
    settings.vision_text = "Eğitim halkalarımız ve insani yardım faaliyetlerimizle Eskişehir'den gönüllere uzanan kalıcı iyilik eserleri inşa etmek."


async def upsert_hicret_campaigns(db, org: Organization) -> tuple[int, int]:
    existing = {
        c.slug: c
        for c in (await db.execute(select(Campaign).where(Campaign.organization_id == org.id))).scalars().all()
    }
    created, updated = 0, 0
    for spec in CAMPAIGNS_SEED:
        camp = existing.get(spec["slug"])
        if camp is None:
            db.add(Campaign(organization_id=org.id, status=CampaignStatus.ACTIVE, currency="TRY", **spec))
            created += 1
        else:
            if not camp.cover_image_url or camp.cover_image_url.startswith("/demo/"):
                camp.cover_image_url = spec["cover_image_url"]
            camp.title = spec["title"]
            camp.summary = spec["summary"]
            camp.story = spec["story"]
            camp.category = spec["category"]
            camp.suggested_amounts_cents = spec["suggested_amounts_cents"]
            camp.is_featured = spec["is_featured"]
            camp.display_order = spec["display_order"]
            updated += 1
    return created, updated


async def upsert_hicret_posts(db, org: Organization, now: datetime) -> int:
    existing_slugs = {
        p.slug
        for p in (await db.execute(select(ContentPost).where(ContentPost.organization_id == org.id))).scalars().all()
        if p.slug
    }
    created = 0
    for idx, spec in enumerate(POSTS_SEED):
        if spec["slug"] in existing_slugs:
            continue
        db.add(ContentPost(
            organization_id=org.id,
            slug=spec["slug"],
            title=spec["title"],
            kind=spec["kind"],
            summary=spec["summary"],
            body=spec["body"],
            image_url=spec["image_url"],
            display_order=idx + 1,
            is_active=True,
            published_at=now - timedelta(days=spec["days_ago"]),
        ))
        created += 1
    return created


# --- Apply --------------------------------------------------------------------------------

COMPANION_TEMPLATE_KEYS = ("kurban", "bank", "history", "volunteer", "transparency")


async def run(org_slug: str, publish: bool) -> None:
    async with AsyncSessionLocal() as db:
        org = (await db.execute(select(Organization).where(Organization.slug == org_slug))).scalar_one()
        pages = list((await db.execute(select(SitePage).where(SitePage.organization_id == org.id))).scalars().all())
        by_kind = {p.kind: p for p in pages if p.kind in ("home", "header", "footer")}
        by_slug = {p.slug: p for p in pages if p.kind == "page"}

        def get_or_create_page(kind: str, slug: str, title: str) -> SitePage:
            existing = by_kind.get(kind) if kind in ("home", "header", "footer") else by_slug.get(slug)
            if existing is not None:
                return existing
            created = SitePage(organization_id=org.id, kind=kind, slug=slug, title=title, body="", version=0)
            db.add(created)
            pages.append(created)
            if kind in ("home", "header", "footer"):
                by_kind[kind] = created
            else:
                by_slug[slug] = created
            return created

        header_page = get_or_create_page("header", "__header__", "Üst bölüm (header)")
        footer_page = get_or_create_page("footer", "__footer__", "Alt bölüm (footer)")
        home_page = get_or_create_page("home", "__home__", "Ana sayfa")
        activities_page = get_or_create_page("page", "faaliyetlerimiz", "Faaliyetlerimiz")
        about_page = get_or_create_page("page", "hakkimizda-sayfasi", "Hakkımızda")
        contact_page = get_or_create_page("page", "bize-ulasin", "İletişim")

        plan: list[tuple[SitePage, list]] = [
            (header_page, build_header(header_page.blocks or [])),
            (footer_page, build_footer(footer_page.blocks or [])),
            (home_page, build_home(home_page.blocks or [])),
            (activities_page, build_activities_page()),
            (about_page, build_about_page()),
            (contact_page, build_contact_page(contact_page.blocks or [])),
        ]

        for tpl_key in COMPANION_TEMPLATE_KEYS:
            tpl = PAGE_BY_KEY.get(tpl_key)
            if tpl and tpl["slug"] not in by_slug:
                p = get_or_create_page("page", tpl["slug"], tpl["label"])
                remapped, _ = remap_assets(copy.deepcopy(tpl["blocks"]))
                plan.append((p, remapped))

        handled = {p.slug for p, _ in plan}
        for page in pages:
            if page.kind == "page" and page.slug not in handled and page.blocks:
                remapped, changed = remap_assets(copy.deepcopy(page.blocks))
                if changed:
                    plan.append((page, remapped))

        await db.flush()
        now = datetime.now(timezone.utc)
        for page, blocks in plan:
            cleaned = validate_blocks(fresh_ids(blocks), page.kind)
            page.version = (page.version or 0) + 1
            if publish:
                if page.blocks:
                    db.add(SitePageRevision(
                        page_id=page.id,
                        organization_id=org.id,
                        blocks=page.blocks,
                        created_by=BY,
                        note="Hicret v3 içerik aktarımı öncesi",
                        created_at=now - timedelta(seconds=5),
                    ))
                page.blocks, page.draft_blocks, page.is_published = cleaned, None, True
                page.published_at, page.published_by = now, BY
                db.add(SitePageRevision(
                    page_id=page.id,
                    organization_id=org.id,
                    blocks=cleaned,
                    created_by=BY,
                    note="Hicret v3 içerik aktarımı",
                ))
            else:
                page.draft_blocks, page.draft_updated_at, page.draft_updated_by = cleaned, now, BY
            print(f"{'yayınlandı' if publish else 'taslak'}: {page.kind} {page.slug} ({len(cleaned)} üst blok)")

        if publish:
            await sync_hicret_org(db, org)
            c_new, c_upd = await upsert_hicret_campaigns(db, org)
            p_new = await upsert_hicret_posts(db, org, now)
            print(f"kampanyalar: +{c_new} yeni, {c_upd} güncellendi; duyuru/haberler: +{p_new} yeni")
        else:
            print("taslak modu: kurum bilgisi, kampanyalar ve duyurular yalnız --publish ile yazılır")
        await db.commit()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--org", default="hicret-dernegi")
    parser.add_argument("--publish", action="store_true", help="taslak bırakmak yerine yayına al")
    args = parser.parse_args()
    asyncio.run(run(args.org, args.publish))

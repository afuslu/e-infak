"""Campaign donation options: what a donor may choose, checked again when the order is created.

`campaign.donation_options` empty = no rules (campaigns from before this existed).
Unit price comes from `reference_amounts`; a duration campaign's unit price is per month.
"""
from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

PRICED_MODES = ("fixed", "quantity", "share", "duration")
# The browser rounds converted prices; TL prices must match exactly.
FX_TOLERANCE = 0.03


def needs_unit_price(options: Optional[dict]) -> bool:
    return (options or {}).get("mode") in PRICED_MODES


def apply_to_campaign(campaign) -> None:
    """Keep the older columns in step, so clients that only know those still show the right price."""
    options = campaign.donation_options or {}
    mode = options.get("mode")
    if not mode:
        return
    base = int((campaign.reference_amounts or {}).get("TRY") or 0)
    campaign.fixed_amount = mode in PRICED_MODES
    if mode in PRICED_MODES and base:
        campaign.allow_custom_amount = False
        campaign.suggested_amounts_cents = [base]
        campaign.min_donation_cents = min(campaign.min_donation_cents or base, base)
    elif mode == "packages":
        amounts = [int(p["amount_cents"]) for p in options.get("packages") or []]
        campaign.allow_custom_amount = False
        campaign.suggested_amounts_cents = amounts
        campaign.min_donation_cents = min([campaign.min_donation_cents or 100, *amounts])


async def _price(db: AsyncSession, campaign, cents: int, currency: str, use_refs: bool) -> int:
    """`cents` is a TL price; returns it in the order's currency (the campaign's own price there, else the rate)."""
    if currency == "TRY":
        return cents
    ref = (campaign.reference_amounts or {}).get(currency) if use_refs else None
    if ref:
        return int(ref)
    from app.services.fx import convert

    converted, _ = await convert(db, cents, "TRY", currency)
    if not converted:
        raise HTTPException(status_code=400, detail=f"{campaign.title} şu an {currency} ile bağışlanamıyor")
    return converted


def _same(paid: int, expected: int, currency: str, exact: bool) -> bool:
    if exact or currency == "TRY":
        return paid == expected
    return abs(paid - expected) <= max(100, round(expected * FX_TOLERANCE))


async def check_item(db: AsyncSession, campaign, item, currency: str) -> None:
    """Raise 400 when the order line is not something the campaign offers; normalises item.metadata."""
    options = campaign.donation_options or {}
    mode = options.get("mode")
    if not mode:
        return
    meta: dict[str, Any] = dict(item.metadata)
    title = campaign.title

    def fail(text: str):
        raise HTTPException(status_code=400, detail=f"{title}: {text}")

    if meta.get("talimat"):
        if await _is_installment(db, campaign, item, currency):
            # Paying one month of a running instruction must not open another one.
            item.metadata = {k: v for k, v in meta.items() if k not in ("periyot", "sure_ay")}
            return
        fail("taksit bağlantısı geçerli değil")
    meta.pop("talimat", None)

    intents = options.get("intents") or []
    if intents and meta.get("niyet") and meta["niyet"] not in intents:
        fail("seçilen niyet bu kampanyada yok")

    if mode in ("quantity", "share"):
        low, high = options.get("min_qty") or 1, options.get("max_qty") or 100
        if not low <= item.quantity <= high:
            fail(f"adet {low} ile {high} arasında olmalı")
    elif item.quantity != 1 and mode == "duration":
        fail("süreli bağışta adet seçilemez")

    monthly = str(meta.get("periyot", "")).lower() in ("aylik", "monthly")
    base = int((campaign.reference_amounts or {}).get("TRY") or 0)
    has_ref = bool((campaign.reference_amounts or {}).get(currency))
    paid = item.unit_amount_cents
    if mode == "duration":
        unit = await _price(db, campaign, base, currency, True)
        durations = options.get("durations") or [1]
        payment = options.get("duration_payment") or "prepaid"
        months = meta.get("sure_ay")
        if months is None:
            # Older app versions do not send the duration; accept a total that matches one.
            months = next((m for m in durations if _same(paid, unit * m, currency, has_ref)), None)
            monthly = False
            if months is None or payment == "monthly" and months != 1:
                fail("lütfen süre seçin (uygulamanızı güncelleyin)")
        try:
            months = int(months)
        except (TypeError, ValueError):
            fail("süre geçersiz")
        if months not in durations:
            fail("seçilen süre bu kampanyada yok")
        if months == 1 or payment == "prepaid":
            monthly = False
        elif payment == "monthly":
            monthly = True
        expected = unit if monthly else unit * months
        if not _same(paid, expected, currency, has_ref):
            fail("tutar seçilen süreyle uyuşmuyor")
        meta["sure_ay"] = months
        meta.pop("periyot", None)
        if monthly:
            meta["periyot"] = "aylik"
    else:
        meta.pop("sure_ay", None)
        if monthly and not options.get("allow_recurring"):
            fail("bu kampanyada düzenli bağış kapalı")
        if mode in PRICED_MODES:
            unit = await _price(db, campaign, base, currency, True)
            if not _same(paid, unit, currency, has_ref):
                fail("tutar kampanyanın bağış tutarıyla uyuşmuyor")
        elif mode == "packages":
            packages = options.get("packages") or []
            wanted = meta.get("paket_id")
            for package in packages:
                if wanted and package["id"] != wanted:
                    continue
                if _same(paid, await _price(db, campaign, int(package["amount_cents"]), currency, False), currency, False):
                    meta["paket_id"], meta["paket"] = package["id"], package["label"]
                    break
            else:
                fail("lütfen listedeki paketlerden birini seçin")
    item.metadata = meta


async def _is_installment(db: AsyncSession, campaign, item, currency: str) -> bool:
    from app.models.subscription import Subscription

    sub = (await db.execute(select(Subscription).where(
        Subscription.manage_token == str(item.metadata["talimat"])[:64],
        Subscription.organization_id == campaign.organization_id, Subscription.campaign_id == campaign.id,
    ))).scalar_one_or_none()
    return bool(sub and sub.total_charges and sub.status != "cancelled" and item.quantity == 1
                and sub.amount_cents == item.unit_amount_cents and sub.currency == currency)


def record_quantity(donation, campaign, quantity: int) -> None:
    """Real count on the receipt and in reports: purchases × "Adet Çarpanı" (kurban shares are counted apart)."""
    multiplier = (getattr(campaign, "quantity_multiplier", None) or 1) if campaign is not None else 1
    if donation.payment_provider == "stkpro":  # imported rows already carry the final count
        multiplier = 1
    count = max(1, quantity or 1) * multiplier
    if count > 1:
        donation.payment_details = {**(donation.payment_details or {}), "adet": count}


# --- Copying old site block settings onto campaigns -------------------------

def _csv(value) -> list[str]:
    return [v.strip() for v in str(value or "").split(",") if v.strip()]


def from_card(card: dict, campaign) -> tuple[dict, Optional[int]]:
    """(donation_options, unit price in kuruş) for a "Bağış kartı" block card; ({}, None) when it sets nothing."""
    unit = round(float(card["unit_amount"]) * 100) if card.get("unit_amount") else None
    refs = campaign.reference_amounts or {}
    if unit is None and not campaign.allow_custom_amount and campaign.suggested_amounts_cents:
        unit = int(campaign.suggested_amounts_cents[0])
    unit = unit or refs.get("TRY")
    durations = sorted({int(m) for m in _csv(card.get("durations")) if m.isdigit() and 1 <= int(m) <= 120})
    intents = _csv(card.get("niyet"))[:20]
    quantity = card.get("quantity") or ""
    if not (durations or intents or quantity or card.get("unit_amount")):
        return {}, None
    options: dict = {"mode": "fixed" if unit else "free"}
    if durations and unit:
        options = {"mode": "duration", "durations": durations[:12], "duration_payment": "prepaid"}
    elif quantity in ("adet", "hisse") and unit:
        options = {"mode": "quantity" if quantity == "adet" else "share", "min_qty": 1,
                   "max_qty": int(card.get("max_quantity") or 21), "unit_label": quantity}
    elif (durations or quantity) and not unit:
        return {}, None  # cannot be priced: staff has to enter the unit price
    if intents:
        options["intents"] = intents
    return options, unit


async def copy_from_blocks(db: AsyncSession, organization_id: UUID, apply: bool) -> list[str]:
    from app.models.campaign import Campaign
    from app.models.cms import SitePage
    from app.schemas.campaign import DonationOptions

    cards: dict[str, list[dict]] = {}

    def walk(node):
        if isinstance(node, dict):
            for card in node.get("cards") or [] if isinstance(node.get("cards"), list) else []:
                if isinstance(card, dict) and card.get("campaign_id"):
                    cards.setdefault(str(card["campaign_id"]), []).append(card)
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    for blocks in (await db.execute(select(SitePage.blocks).where(
        SitePage.organization_id == organization_id, SitePage.blocks.is_not(None),
    ))).scalars():
        walk(blocks)
    report = []
    for campaign in (await db.execute(select(Campaign).where(
        Campaign.organization_id == organization_id).order_by(Campaign.title))).scalars():
        if str(campaign.id) not in cards:
            continue
        if campaign.donation_options:
            report.append(f"ATLANDI  {campaign.title}: ayarı zaten var")
            continue
        found = [from_card(card, campaign) for card in cards[str(campaign.id)]]
        found = [f for f in found if f[0]]
        if not found:
            continue
        if any(f != found[0] for f in found[1:]):
            report.append(f"ÇELİŞKİ  {campaign.title}: sayfalarda farklı ayarlar var, elle seçin")
            continue
        if (campaign.currency or "TRY") != "TRY":
            report.append(f"ELLE     {campaign.title}: para birimi {campaign.currency}")
            continue
        options, unit = found[0]
        options = DonationOptions(**options).model_dump(exclude_none=True)
        report.append(f"{'YAZILDI ' if apply else 'YAZILACAK'} {campaign.title}: {options} birim={unit}")
        if apply:
            campaign.donation_options = options
            if unit:
                campaign.reference_amounts = {**(campaign.reference_amounts or {}), "TRY": int(unit)}
            apply_to_campaign(campaign)
    if apply:
        await db.commit()
    return report

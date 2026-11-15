import logging
import time
import xml.etree.ElementTree as ET
import requests

logger = logging.getLogger(__name__)

TCMB_URL = "https://www.tcmb.gov.tr/kurlar/today.xml"
_CACHE_TTL_SECONDS = 900
_cached_rates: dict | None = None
_cached_at: float = 0.0


GOLD_API_URL = "https://api.gold-api.com/price/{symbol}"
TROY_OUNCE_GRAMS = 31.1035
NISAB_GOLD_GRAMS = 85.0
NISAB_SILVER_GRAMS = 595.0


def fetch_metal_usd(symbol: str) -> float:
    """Spot price in USD per troy ounce (XAU gold, XAG silver). Raises on any failure."""
    res = requests.get(GOLD_API_URL.format(symbol=symbol), timeout=10, headers={"User-Agent": "e-infak-rates/1.0"})
    res.raise_for_status()
    price = float(res.json()["price"])
    if price <= 0:
        raise ValueError(f"{symbol} price missing")
    return price


def fetch_tcmb_rates(force_refresh: bool = False) -> dict:
    """USD/EUR (TCMB forex selling) and gram gold/silver in TRY (spot USD/ounce x TCMB USD).

    Never invents numbers: a value that cannot be fetched is None. After a failure the last
    successful result is returned with "stale": True, so callers can say it is not current.
    Cached for 15 minutes.
    """
    global _cached_rates, _cached_at
    now = time.monotonic()
    if not force_refresh and _cached_rates is not None and (now - _cached_at) < _CACHE_TTL_SECONDS:
        return _cached_rates
    try:
        fx = fetch_tcmb_currency_rates()
        gold_usd = fetch_metal_usd("XAU")
        try:
            silver_usd = fetch_metal_usd("XAG")
        except Exception:  # silver is informative only
            silver_usd = None
        gold_gram = round(gold_usd * fx["USD"] / TROY_OUNCE_GRAMS, 2)
        silver_gram = round(silver_usd * fx["USD"] / TROY_OUNCE_GRAMS, 2) if silver_usd else None
        data = {
            "USD": fx["USD"],
            "EUR": fx["EUR"],
            "GOLD_GRAM": gold_gram,
            "SILVER_GRAM": silver_gram,
            "NISAP_LIRA": round(NISAB_GOLD_GRAMS * gold_gram, 2),
            "SILVER_NISAP_LIRA": round(NISAB_SILVER_GRAMS * silver_gram, 2) if silver_gram else None,
            "source": "TCMB + gold-api.com (spot)",
            "stale": False,
        }
        _cached_rates, _cached_at = data, now
        return data
    except Exception as e:
        logger.error(f"Failed to fetch exchange/gold rates: {e}")
        if _cached_rates is not None:
            return {**_cached_rates, "stale": True}
        return {"USD": None, "EUR": None, "GOLD_GRAM": None, "SILVER_GRAM": None, "NISAP_LIRA": None,
                "SILVER_NISAP_LIRA": None, "source": None, "stale": True}


def fetch_tcmb_currency_rates() -> dict:
    """USD/EUR forex selling rates in TRY. Raises on any failure (no fallback values)."""
    res = requests.get(TCMB_URL, timeout=10)
    res.raise_for_status()
    root = ET.fromstring(res.content)
    rates = {}
    for currency in root.findall("Currency"):
        code = currency.get("CurrencyCode")
        if code in ("USD", "EUR"):
            node = currency.find("ForexSelling")
            if node is not None and node.text:
                rates[code] = float(node.text.replace(",", "."))
    if set(rates) != {"USD", "EUR"} or any(v <= 0 for v in rates.values()):
        raise ValueError(f"TCMB response missing rates: {rates}")
    return rates

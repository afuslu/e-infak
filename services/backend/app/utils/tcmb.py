import logging
import xml.etree.ElementTree as ET
import requests

logger = logging.getLogger(__name__)

TCMB_URL = "https://www.tcmb.gov.tr/kurlar/today.xml"

def fetch_tcmb_rates() -> dict:
    """
    Fetches USD, EUR rates and calculates estimated gold price per gram in TRY from TCMB XML.
    Returns dict: {"USD": float, "EUR": float, "GOLD_GRAM": float, "NISAP_LIRA": float}
    """
    try:
        res = requests.get(TCMB_URL, timeout=10)
        res.raise_for_status()
        root = ET.fromstring(res.content)
        
        rates = {}
        for currency in root.findall('Currency'):
            code = currency.get('CurrencyCode')
            if code in ('USD', 'EUR'):
                forex_selling = currency.find('ForexSelling')
                if forex_selling is not None and forex_selling.text:
                    rates[code] = float(forex_selling.text.replace(',', '.'))
        
        usd_rate = rates.get('USD', 33.0)
        eur_rate = rates.get('EUR', 36.0)
        
        # Gram Gold = (Ounce Gold * USD) / 31.1035
        gold_gram_try = round((2400.0 * usd_rate) / 31.1035, 2)
        if gold_gram_try < 2000:
            gold_gram_try = 3000.0
            
        # 85 grams of gold nisap amount
        nisap_lira = round(85.0 * gold_gram_try, 2)
        
        return {
            "USD": usd_rate,
            "EUR": eur_rate,
            "GOLD_GRAM": gold_gram_try,
            "NISAP_LIRA": nisap_lira
        }
    except Exception as e:
        logger.error(f"Failed to fetch TCMB rates: {e}")
        return {
            "USD": 33.0,
            "EUR": 36.0,
            "GOLD_GRAM": 3000.0,
            "NISAP_LIRA": 255000.0
        }


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

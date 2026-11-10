"""Reading Turkish bank transfer descriptions.

Formats seen in HAKDER's statements:
    Ziraat Katılım: "Gelen FAST Gönderen-TALHA TÜRKMEN TÜRKİYE EMLAK KATILIM BANKASI A.Ş. kurban bağışı"
    Vakıf Katılım:  "Amir= MUSTAFA CENGİZ CENGİZ ECZANESİ Aciklama= gazze"
"""
import re
import unicodedata
from dataclasses import dataclass
from typing import Optional

# Words that start the sender's bank in "Gönderen-AD SOYAD <BANKA> A.Ş." descriptions.
BANK_WORDS = (
    "TÜRKİYE", "T.C.", "TC ", "KUVEYT", "ALBARAKA", "AKBANK", "ZİRAAT", "VAKIF", "VAKIFLAR", "HALK", "GARANTİ",
    "YAPI VE KREDİ", "YAPI KREDİ", "İŞ BANKASI", "QNB", "DENİZBANK", "DENIZBANK", "ENPARA", "ING ", "TEB ",
    "ŞEKERBANK", "ODEABANK", "FİBABANKA", "ANADOLUBANK", "HSBC", "EMLAK", "BURGAN", "ALTERNATİF", "PAPARA",
    "AKTİF YATIRIM", "DÜNYA KATILIM", "HAYAT FİNANS", "ZİRAAT DİNAMİK", "COLENDİ", "TOM BANK", "N KOLAY",
)
_SENDER_ZK = re.compile(r"G[ÖO]NDEREN\s*[-:=]\s*(.+)", re.I)
_SENDER_VK = re.compile(
    r"AM[İI]R\s*[=:-]\s*(.*?)\s*(?:G[ÖO]ND\.?\s*BANK\.?\s*KODU\s*[=:-]\s*\d*\s*)?(?:A[CÇ]IKLAMA\s*[=:-]\s*(.*))?$",
    re.I | re.S)
_PHONE = re.compile(r"(?<!\d)(?:\+?90|0)?\s?(5\d{2})[\s.-]?(\d{3})[\s.-]?(\d{2})[\s.-]?(\d{2})(?!\d)")
_COMPANY_END = re.compile(r"\bA\.?\s?Ş\.?|\bAŞ\b|\bLTD\b|\bŞTİ\b", re.I)


def fold(value) -> str:
    """Lower case, no accents, single spaces: 'İSMAİL  Çırak' -> 'ismail cirak'."""
    text = str(value or "").replace("İ", "i").replace("I", "ı").casefold().replace("ı", "i")
    text = "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))
    text = re.sub(r"[^\w\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _upper_tr(value: str) -> str:
    return value.replace("i", "İ").replace("ı", "I").upper()


@dataclass
class ParsedDescription:
    sender: Optional[str]
    note: str  # the free text the sender wrote


def parse_description(description: Optional[str], sender_name: Optional[str] = None) -> ParsedDescription:
    text = re.sub(r"\s+", " ", str(description or "")).strip()
    match = _SENDER_VK.search(text)
    if match and re.match(r"\s*AM[İI]R\s*[=:-]", text, re.I):
        sender = re.split(r"\s+-\s+|\s+LEHDAR\s*[=:-]", (match.group(1) or "").strip(), flags=re.I)[0].strip()
        return ParsedDescription(sender=sender or sender_name, note=(match.group(2) or "").strip())
    match = _SENDER_ZK.search(text)
    if match:
        rest = match.group(1).strip()
        upper = _upper_tr(rest)
        cut = None
        for word in BANK_WORDS:
            index = upper.find(word)
            if index > 0 and (cut is None or index < cut):
                cut = index
        if cut is None:  # "Gönderen: YASEMİN KARA Adak Kurban Bağışı": the name is the upper-case lead
            words = rest.split()
            lead = []
            for word in words:
                if word != _upper_tr(word) or not re.search(r"[A-ZÇĞİÖŞÜ]", word):
                    break
                lead.append(word)
            if len(lead) >= 2:
                return ParsedDescription(sender=" ".join(lead), note=" ".join(words[len(lead):]))
            return ParsedDescription(sender=sender_name or rest, note="")
        sender = rest[:cut].strip(" -")
        after = rest[cut:]
        end = _COMPANY_END.search(after)
        note = after[end.end():].strip(" .-") if end else ""
        return ParsedDescription(sender=sender or sender_name, note=note)
    return ParsedDescription(sender=(sender_name or "").strip() or None, note=text)


def phones_in(text: Optional[str]) -> list[str]:
    """Mobile numbers in the description, as 0532... (the format donors are stored in)."""
    return list(dict.fromkeys("0" + "".join(m.groups()) for m in _PHONE.finditer(str(text or ""))))


# Built-in words -> campaign category (CampaignCategory values); organisations add their own rules.
CATEGORY_WORDS = {
    "kurban": ("kurban", "hisse", "buyukbas", "kucukbas", "koyun", "keci", "koc", "dana"),
    "adak": ("adak",),
    "akika": ("akika", "akik"),
    "zekat": ("zekat",),
    "fitre": ("fitre",),
    "fidye": ("fidye",),
    "su": ("su kuyusu", "kuyu", "temiz su", "su tankeri"),
    "egitim": ("hafiz", "medrese", "kulliye", "egitim", "burs", "kuran"),
    "gida": ("kumanya", "erzak", "yemek", "iftar", "ekmek", "gida"),
    "sadaka": ("sadaka",),
}
KURBAN_INTENTS = {"adak": "adak", "akika": "akika", "sukur": "sukur", "nafile": "nafile", "sadaka": "sadaka",
                  "vacip": "vacip", "sifa": "sifa"}


def categories_in(text: Optional[str]) -> list[str]:
    folded = f" {fold(text)} "
    return [cat for cat, words in CATEGORY_WORDS.items() if any(f" {w}" in folded for w in words)]


def kurban_intent(text: Optional[str]) -> Optional[str]:
    folded = fold(text).split()
    return next((KURBAN_INTENTS[w] for w in folded if w in KURBAN_INTENTS), None)


_POS_SETTLEMENT = re.compile(r"(I[SŞ]YER[İI]\s*NO|TERMINAL\s*NO).*POS\s*SAT[İI][SŞ]", re.I)


def is_pos_settlement(description: Optional[str]) -> bool:
    """Daily card settlement credited by the bank: card donations are already recorded one by one."""
    return bool(_POS_SETTLEMENT.search(str(description or "")))

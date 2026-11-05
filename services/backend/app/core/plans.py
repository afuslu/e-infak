"""Paket (abonelik) tanımları ve kurum bazında özellik bayrakları.

Her kurum bir pakete bağlıdır. Paket hangi modüllerin açık olduğunu ve kaç
personel hesabı açılabileceğini belirler. Ek modüller (add-on) paketten
bağımsız olarak kuruma ayrıca açılabilir.
"""
import enum


class Plan(str, enum.Enum):
    BASLANGIC = "baslangic"
    ORTA = "orta"
    ILERI = "ileri"


class Feature(str, enum.Enum):
    # Başlangıç
    DONOR_CRM = "donor_crm"
    RECEIPTS = "receipts"
    WEBSITE = "website"
    ONLINE_DONATION = "online_donation"
    SMS = "sms"
    ROLES = "roles"
    REPORTS_BASIC = "reports_basic"
    # Orta
    MULTI_LANGUAGE = "multi_language"
    MULTI_CURRENCY = "multi_currency"
    SITEMAP = "sitemap"
    DONOR_PORTAL_ADVANCED = "donor_portal_advanced"
    KURBAN = "kurban"
    SPONSORSHIP = "sponsorship"
    EDUCATION = "education"
    WATER_WELL = "water_well"
    PROJECT_FUNDING = "project_funding"
    TASKS = "tasks"
    MONEY_BOX = "money_box"
    FOOD_AID = "food_aid"
    BANK_TRANSACTIONS = "bank_transactions"
    REPORTS_ADVANCED = "reports_advanced"
    # Orta paket için ek modül, İleri pakette dahil
    RECURRING = "recurring"
    DONATION_VIDEO = "donation_video"
    # Yalnız İleri
    CALL_CENTER = "call_center"
    # Her pakette ek modül
    WHATSAPP = "whatsapp"
    SMS_DONATION = "sms_donation"


FEATURE_LABELS = {
    Feature.DONOR_CRM: "Bağışçı Yönetimi",
    Feature.RECEIPTS: "Makbuz / Bağış",
    Feature.WEBSITE: "Web Sitesi",
    Feature.ONLINE_DONATION: "Online Bağış Sistemi",
    Feature.SMS: "SMS Entegrasyonu",
    Feature.ROLES: "Roller / Yetkilendirme",
    Feature.REPORTS_BASIC: "Aylık Bağış Raporu",
    Feature.MULTI_LANGUAGE: "Çoklu Dil",
    Feature.MULTI_CURRENCY: "Çoklu Para Birimi",
    Feature.SITEMAP: "Sitemap",
    Feature.DONOR_PORTAL_ADVANCED: "Gelişmiş Bağışçı Paneli",
    Feature.KURBAN: "Kurban Organizasyonu",
    Feature.SPONSORSHIP: "Sponsorluk Yönetimi",
    Feature.EDUCATION: "Eğitim / Öğrenci Organizasyonu",
    Feature.WATER_WELL: "Su Kuyusu Yönetimi",
    Feature.PROJECT_FUNDING: "Proje / Fonlama",
    Feature.TASKS: "Takvim / Görevlendirme",
    Feature.MONEY_BOX: "Kumbara Organizasyonu",
    Feature.FOOD_AID: "Kumanya Dağıtım",
    Feature.BANK_TRANSACTIONS: "Banka Hesap Hareketleri",
    Feature.REPORTS_ADVANCED: "Gelişmiş Raporlar",
    Feature.RECURRING: "Otomatik Talimatlar",
    Feature.DONATION_VIDEO: "Bağış Video & SMS Sistemi",
    Feature.CALL_CENTER: "Çağrı Merkezi Entegrasyonu",
    Feature.WHATSAPP: "WhatsApp Business Entegrasyonu",
    Feature.SMS_DONATION: "SMS Bağışları Entegrasyonu",
}

PLAN_LABELS = {
    Plan.BASLANGIC: "Başlangıç",
    Plan.ORTA: "Orta",
    Plan.ILERI: "İleri",
}

_BASLANGIC = {
    Feature.DONOR_CRM,
    Feature.RECEIPTS,
    Feature.WEBSITE,
    Feature.ONLINE_DONATION,
    Feature.SMS,
    Feature.ROLES,
    Feature.REPORTS_BASIC,
}
_ORTA = _BASLANGIC | {
    Feature.MULTI_LANGUAGE,
    Feature.MULTI_CURRENCY,
    Feature.SITEMAP,
    Feature.DONOR_PORTAL_ADVANCED,
    Feature.KURBAN,
    Feature.SPONSORSHIP,
    Feature.EDUCATION,
    Feature.WATER_WELL,
    Feature.PROJECT_FUNDING,
    Feature.TASKS,
    Feature.MONEY_BOX,
    Feature.FOOD_AID,
    Feature.BANK_TRANSACTIONS,
    Feature.REPORTS_ADVANCED,
}
_ILERI = _ORTA | {
    Feature.RECURRING,
    Feature.DONATION_VIDEO,
    Feature.CALL_CENTER,
}

PLAN_FEATURES: dict[Plan, frozenset[Feature]] = {
    Plan.BASLANGIC: frozenset(_BASLANGIC),
    Plan.ORTA: frozenset(_ORTA),
    Plan.ILERI: frozenset(_ILERI),
}

# Pakete dahil olmayan ama ayrıca satın alınarak açılabilen modüller.
PLAN_ADDONS: dict[Plan, frozenset[Feature]] = {
    Plan.BASLANGIC: frozenset({Feature.WHATSAPP, Feature.SMS_DONATION, Feature.RECURRING}),
    Plan.ORTA: frozenset({Feature.WHATSAPP, Feature.SMS_DONATION, Feature.RECURRING, Feature.DONATION_VIDEO}),
    Plan.ILERI: frozenset({Feature.WHATSAPP, Feature.SMS_DONATION}),
}

PLAN_LIMITS: dict[Plan, dict[str, int]] = {
    Plan.BASLANGIC: {"users": 1, "bank_accounts": 0},
    Plan.ORTA: {"users": 3, "bank_accounts": 1},
    Plan.ILERI: {"users": 5, "bank_accounts": 3},
}

DEFAULT_PLAN = Plan.ILERI


def org_plan(organization) -> Plan:
    try:
        return Plan(getattr(organization, "plan", None) or DEFAULT_PLAN)
    except ValueError:
        return DEFAULT_PLAN


def org_addons(organization) -> set[Feature]:
    plan = org_plan(organization)
    addons = set()
    for value in getattr(organization, "enabled_addons", None) or []:
        try:
            feature = Feature(value)
        except ValueError:
            continue
        if feature in PLAN_ADDONS[plan]:
            addons.add(feature)
    return addons


def org_features(organization) -> set[Feature]:
    return set(PLAN_FEATURES[org_plan(organization)]) | org_addons(organization)


def org_has_feature(organization, feature: Feature) -> bool:
    return feature in org_features(organization)


def org_user_limit(organization) -> int:
    extra = getattr(organization, "extra_user_seats", None) or 0
    return PLAN_LIMITS[org_plan(organization)]["users"] + max(0, int(extra))


def org_bank_account_limit(organization) -> int:
    return PLAN_LIMITS[org_plan(organization)]["bank_accounts"]

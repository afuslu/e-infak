"""Fine-grained staff permissions ("yetenekler"), grouped by module like STK PRO's role screen.

A module card's switch is the module's broad permission (app.api.deps.Permission); the ticks inside
are capabilities. Custom roles store both in StaffRole.permissions (a JSON list of strings):
- a capability key ("donors.phone") grants that capability and its module;
- a broad permission value ("donor_manage") stored by older roles grants every capability of the
  modules it covers, so roles written before capabilities existed keep working unchanged.
Only rules that the API enforces are listed here.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Capability:
    key: str
    label: str
    rule: bool = False  # widens what the staff member sees beyond their own records (shown in red)


@dataclass(frozen=True)
class CapabilityGroup:
    key: str
    label: str
    permission: str  # app.api.deps.Permission value the module needs
    capabilities: tuple[Capability, ...]


GROUPS: tuple[CapabilityGroup, ...] = (
    CapabilityGroup("donors", "Bağışçılar", "donor_manage", (
        Capability("donors.create", "Bağışçı ekleyebilsin"),
        Capability("donors.update", "Bağışçı güncelleyebilsin"),
        Capability("donors.delete", "Bağışçıları silebilsin (bağışı ve üyeliği olmayanları)"),
        Capability("donors.view_all", "Tüm bağışçıların kartına erişsin (kapalıysa yalnız temsilcisi olduğu bağışçılar)", rule=True),
        Capability("donors.update_all", "Tüm bağışçıları güncelleyebilsin (kapalıysa yalnız temsilcisi olduğu bağışçılar)", rule=True),
        Capability("donors.phone", "Cep telefonunu yıldızsız görsün"),
        Capability("donors.merge", "Mükerrer bağışçıları birleştirebilsin"),
        Capability("donors.export", "Bağışçıları Excel olarak aktarabilsin"),
        Capability("donors.import", "Bağışçıları toplu olarak yükleyebilsin"),
        Capability("donors.notes_view", "Görüşme notlarını görebilsin"),
        Capability("donors.notes_write", "Görüşme notu yazabilsin"),
    )),
    CapabilityGroup("receipts", "Makbuzlar", "finance_manage", (
        Capability("receipts.create", "Makbuz kesebilsin"),
        Capability("receipts.cancel", "Makbuz iptal edebilsin"),
        Capability("receipts.mark_paid", "Bekleyen makbuzu ödendi yapabilsin"),
        Capability("receipts.backdate", "Makbuz tarihini geriye dönük girebilsin"),
        Capability("receipts.view_all", "Tüm personelin bağış ve makbuzlarını görsün (kapalıysa yalnız kendi kestikleri)", rule=True),
        Capability("receipts.for_others", "Başka personel adına makbuz kesebilsin"),
        Capability("receipts.export", "Bağış ve makbuzları Excel olarak aktarabilsin"),
    )),
    CapabilityGroup("bank", "Banka Hareketleri", "finance_manage", (
        Capability("bank.approve", "Havaleyi bağışa dönüştürebilsin"),
        Capability("bank.unmatch", "Eşleştirmeyi kaldırabilsin"),
        Capability("bank.ignore", "Hareketi yok sayabilsin"),
        Capability("bank.totals", "Toplam tutarları görsün"),
        Capability("bank.upload", "Ekstre yükleyebilsin"),
    )),
    CapabilityGroup("kurban", "Kurban", "operations_manage", (
        Capability("kurban.manage", "Kurban ekleyebilsin ve düzenleyebilsin"),
        Capability("kurban.delete", "Kurban silebilsin"),
        Capability("kurban.slaughter", "Kesildi işaretleyip SMS gönderebilsin"),
        Capability("kurban.pdf", "Kurban PDF raporu alabilsin"),
    )),
    CapabilityGroup("sms", "SMS", "donor_manage", (
        Capability("sms.send", "Bağışçıya SMS gönderebilsin"),
        Capability("sms.bulk", "Toplu SMS gönderebilsin"),
        Capability("sms.templates", "SMS şablonlarını düzenleyebilsin"),
    )),
    CapabilityGroup("members", "Üyelik ve aidat", "donor_manage", (
        Capability("members.manage", "Üye ekleyip düzenleyebilsin"),
    )),
    CapabilityGroup("operations", "Saha (sponsorluk, su kuyusu, öğrenci, kumbara)", "operations_manage", (
        Capability("operations.manage", "Kayıt ekleyip düzenleyebilsin"),
    )),
    CapabilityGroup("finance", "Kasa ve muhasebe", "finance_manage", (
        Capability("finance.manage", "Kasa, gider ve muhasebe kaydı girebilsin"),
    )),
    CapabilityGroup("site", "Web sitesi ve kampanyalar", "content_manage", (
        Capability("site.manage", "Siteyi, kampanyaları ve içerikleri düzenleyebilsin"),
    )),
    CapabilityGroup("reports", "Raporlar", "report_read", (
        Capability("reports.view", "Raporları görebilsin"),
    )),
    CapabilityGroup("settings", "Kurum ayarları", "settings_manage", (
        Capability("settings.manage", "Ödeme, SMS ve kurum ayarlarını değiştirebilsin"),
    )),
    CapabilityGroup("users", "Personel ve roller", "user_manage", (
        Capability("users.manage", "Personel ve rolleri yönetebilsin"),
    )),
)

ALL: frozenset[str] = frozenset(c.key for g in GROUPS for c in g.capabilities)
BY_PERMISSION: dict[str, frozenset[str]] = {}
for _group in GROUPS:
    BY_PERMISSION[_group.permission] = BY_PERMISSION.get(_group.permission, frozenset()) | {c.key for c in _group.capabilities}
PERMISSION_OF: dict[str, str] = {c.key: g.permission for g in GROUPS for c in g.capabilities}


def expand(stored: list[str] | set[str]) -> set[str]:
    """Capabilities a stored role list grants: explicit keys plus everything under stored broad permissions."""
    granted = {value for value in stored if value in ALL}
    for value in stored:
        granted |= BY_PERMISSION.get(value, frozenset())
    return granted


def permissions_of(capabilities: set[str]) -> set[str]:
    """Broad permissions implied by capabilities (a module is reachable when any of its ticks is on)."""
    return {PERMISSION_OF[key] for key in capabilities if key in PERMISSION_OF}


def catalog() -> list[dict]:
    return [{"key": g.key, "label": g.label, "permission": g.permission,
             "capabilities": [{"key": c.key, "label": c.label, "rule": c.rule} for c in g.capabilities]} for g in GROUPS]

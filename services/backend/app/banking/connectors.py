"""Statement web services of the banks HAKDER and similar organisations use.

Each bank needs a signed application (account owner, server IP 31.97.159.228,
authorised person) before it opens its web service and sends the technical
specification. Until then ``ready`` is False and statements are uploaded as
Excel/CSV files, which go through the same matcher.
"""
from datetime import datetime

from app.banking import register
from app.banking.base import BankConnector, BankConnectorNotReady, BankMovement


class _PendingSpec(BankConnector):
    async def fetch(self, account, since: datetime, until: datetime) -> list[BankMovement]:
        raise BankConnectorNotReady(
            f"{self.label} hesap hareketleri web servisi henüz bağlanmadı; ekstreyi Excel olarak yükleyin"
        )


@register
class VakifKatilim(_PendingSpec):
    """Vakıf Katılım 'Hesap Ekstresi Web Servis Entegrasyonu' (form FRM.BİBÜGM.0063.02)."""
    key = "vakifkatilim"
    label = "Vakıf Katılım"
    credential_fields = {"customer_no": "Müşteri no", "username": "Web servis kullanıcı adı",
                         "password": "Web servis şifresi"}
    secret_fields = ("password",)


@register
class ZiraatKatilim(_PendingSpec):
    key = "ziraatkatilim"
    label = "Ziraat Katılım"
    credential_fields = {"customer_no": "Müşteri no", "username": "Web servis kullanıcı adı",
                         "password": "Web servis şifresi"}
    secret_fields = ("password",)


@register
class KuveytTurk(_PendingSpec):
    """Kuveyt Türk API Portal (OAuth2 client credentials)."""
    key = "kuveytturk"
    label = "Kuveyt Türk"
    credential_fields = {"client_id": "Client ID", "client_secret": "Client secret", "customer_no": "Müşteri no"}
    secret_fields = ("client_secret",)

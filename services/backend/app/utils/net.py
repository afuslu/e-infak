"""Outbound requests to addresses an organisation typed in (webhooks): never into our own network."""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

from app.core.config import settings


class UnsafeUrl(ValueError):
    pass


def _blocked(ip: ipaddress._BaseAddress) -> bool:
    return (
        ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast
        or ip.is_reserved or ip.is_unspecified or getattr(ip, "is_site_local", False)
        or (isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None and _blocked(ip.ipv4_mapped))
    )


def assert_public_url(url: str) -> str:
    """Raise UnsafeUrl unless url is http(s) to a host that resolves only to public addresses."""
    parsed = urlparse((url or "").strip())
    if parsed.scheme not in ("https", "http"):
        raise UnsafeUrl("Adres https:// ile başlamalıdır")
    if parsed.scheme == "http" and settings.ENVIRONMENT == "production":
        raise UnsafeUrl("Güvenlik için yalnız https:// adresleri kabul edilir")
    if parsed.username or parsed.password:
        raise UnsafeUrl("Adreste kullanıcı adı/şifre bulunamaz")
    host = parsed.hostname
    if not host:
        raise UnsafeUrl("Geçerli bir adres girin")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise UnsafeUrl("Adres çözümlenemedi") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split("%")[0])
        if _blocked(ip):
            raise UnsafeUrl("İç ağ veya yerel adreslere istek gönderilemez")
    return url.strip()

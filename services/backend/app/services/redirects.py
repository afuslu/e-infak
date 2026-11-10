"""Per-site permanent redirects (old address -> new address), e.g. after moving from another platform.

Stored on `Organization.site["redirects"]` as [{"from": "/eski", "to": "/yeni"}] and applied
by the web middleware with a 301. Only paths are matched (the query string is ignored).
"""
from __future__ import annotations

import re
from typing import Any

from app.utils.cms import validate_link

MAX_REDIRECTS = 500
# The app's own areas never redirect away.
RESERVED = ("/api", "/_next", "/admin", "/platform", "/site-yapici-cerceve", "/portal", "/giris", "/kampanyalar")
_PATH = re.compile(r"^/[a-z0-9._~%!$&'()*+,;=:@/-]{1,299}$")


class RedirectError(ValueError):
    """A redirect table that cannot be stored; the message is safe to show."""


def normalize_path(value: str) -> str:
    path = str(value or "").strip().split("?", 1)[0].split("#", 1)[0]
    if path.startswith(("http://", "https://")):
        raise RedirectError(f"{value}: eski adres site içi bir yol olmalı (ör. /eski-sayfa)")
    path = "/" + path.lstrip("/")
    if len(path) > 1:
        path = path.rstrip("/")
    return path.lower()


def clean_redirects(raw: Any) -> list[dict]:
    if not isinstance(raw, list):
        raise RedirectError("Yönlendirmeler bir liste olmalı")
    if len(raw) > MAX_REDIRECTS:
        raise RedirectError(f"En fazla {MAX_REDIRECTS} yönlendirme tanımlanabilir")
    out, seen = [], set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        source = normalize_path(item.get("from", ""))
        if source == "/" or not _PATH.fullmatch(source):
            raise RedirectError(f"{item.get('from')}: geçersiz eski adres")
        if any(source == r or source.startswith(r + "/") for r in RESERVED):
            raise RedirectError(f"{source}: bu adres yönlendirilemez")
        try:
            target = validate_link(str(item.get("to", "")))[:500]
        except ValueError as exc:
            raise RedirectError(f"{source}: {exc}") from exc
        if target.startswith("/") and normalize_path(target) == source:
            raise RedirectError(f"{source}: kendisine yönlendirilemez")
        if source in seen:
            raise RedirectError(f"{source}: iki kez tanımlanmış")
        seen.add(source)
        out.append({"from": source, "to": target})
    targets = {r["from"]: r["to"] for r in out}
    for r in out:  # no loops: following a chain must end
        hops, current = 0, r["to"]
        while current.startswith("/") and normalize_path(current) in targets:
            current, hops = targets[normalize_path(current)], hops + 1
            if hops > 5:
                raise RedirectError(f"{r['from']}: yönlendirme döngüsü")
    return out


def redirects_of(org) -> list[dict]:
    stored = (org.site or {}).get("redirects")
    return stored if isinstance(stored, list) else []


def redirect_map(org) -> dict[str, str]:
    return {r["from"]: r["to"] for r in redirects_of(org) if r.get("from") and r.get("to")}

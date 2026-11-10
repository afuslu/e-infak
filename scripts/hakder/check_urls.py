#!/usr/bin/env python3
"""Checks that every hakder.org address still answers on the new site: 200, or 301 to a page that answers 200.

    python scripts/hakder/check_urls.py                                   # local dev: http://localhost:3005 (?org=hakder)
    python scripts/hakder/check_urls.py --base https://www.hakder.org     # after the move

The list comes from out/hakder.json (menu, footer, pages, news, campaign cards, slider and
header links) plus the fixed addresses of the old site. Exit code 1 when any address fails.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib.parse import urlencode, urlparse, parse_qsl

import requests

HERE = Path(__file__).resolve().parent
FIXED = ["/", "/bagis", "/bagis/sepetim", "/hakkimizda", "/iletisim", "/hesap-numaralarimiz", "/gizlilik-politikasi", "/sss",
         "/insan-kaynaklari", "/tum-faaliyetlerimiz", "/su-kuyusu-projeleri", "/gazze-yardimlari", "/zekat-hesaplama",
         "/bagisimi-gel-al", "/login/giris"]


def old_urls(data: dict) -> list[str]:
    urls: set[str] = set(FIXED)

    def add(url: str | None) -> None:
        if url and url.startswith("/") and not url.startswith("//"):
            urls.add(url)

    def walk(items: list) -> None:
        for item in items:
            add(item.get("url"))
            walk(item.get("children") or [])

    home = data["home"]
    walk(home["menu"])
    for widget in home["footer"]["widgets"]:
        for link in widget["links"]:
            add(link["url"])
    for link in home["footer"]["bottom_links"] + home["header_buttons"] + home["mobile_bar"] + home["header"]["links"]:
        add(link["url"])
    add(home["announcement"]["url"])
    for slide in home["slides"]:
        add(slide["link"])
        for button in slide["buttons"]:
            add(button["url"])
    for tab in data["campaigns"]["tabs"]:
        add(f"/bagis?tab={tab['key']}")
    for card in data["campaigns"]["cards"]:
        add(f"/{card['slug']}" if card["slug"] else None)
    for slug in data["pages"]:
        add(f"/{slug}")
    for post in data["posts"]:
        add(f"/{post['slug']}")
    return sorted(urls)


def with_org(url: str, org: str | None) -> str:
    if not org:
        return url
    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query))
    query.setdefault("org", org)
    return parsed._replace(query=urlencode(query)).geturl()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://localhost:3005")
    parser.add_argument("--org", default=None, help="local dev tenant (?org=); default hakder on localhost")
    parser.add_argument("--json", default=str(HERE / "out" / "hakder.json"))
    parser.add_argument("--timeout", type=float, default=120)
    args = parser.parse_args()
    org = args.org or ("hakder" if urlparse(args.base).hostname in ("localhost", "127.0.0.1") else None)
    data = json.loads(Path(args.json).read_text(encoding="utf-8"))
    session = requests.Session()
    session.headers["User-Agent"] = "hakder-url-check/1.0"
    failures, rows = 0, []
    for path in old_urls(data):
        url = with_org(args.base.rstrip("/") + path, org)
        try:
            res = session.get(url, allow_redirects=False, timeout=args.timeout)
            status, target, final = res.status_code, res.headers.get("location", ""), None
            if status == 301 and target:
                follow = session.get(with_org(requests.compat.urljoin(url, target), org), timeout=args.timeout)
                final = follow.status_code
            ok = status == 200 or (status == 301 and final == 200)
        except requests.RequestException as exc:
            status, target, final, ok = "ERR", str(exc)[:60], None, False
        failures += not ok
        shown_target = urlparse(target)._replace(query="").geturl() if target else ""
        rows.append((("OK " if ok else "FAIL"), str(status), path, f"→ {shown_target} ({final})" if target else ""))
    width = max(len(r[2]) for r in rows)
    for mark, status, path, note in rows:
        print(f"{mark} {status:>4}  {path:<{width}}  {note}")
    print(f"\n{len(rows) - failures}/{len(rows)} addresses answer 200 or 301→200 on {args.base}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())

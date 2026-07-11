#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import py_compile
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    py_compile.compile(str(ROOT / "backend" / "server.py"), doraise=True)
    app = ROOT / "public" / "app.js"
    css = ROOT / "public" / "styles.css"
    html = ROOT / "public" / "index.html"
    for path in [app, css, html]:
        if not path.exists() or path.stat().st_size < 100:
            raise SystemExit(f"Eksik veya boş dosya: {path}")
    text = app.read_text(encoding="utf-8")
    for required in ["#/demos", "data-form=\"tenant\"", "/api/donations", "/api/tenants", "Bağışçı Paneli"]:
        if required not in text:
            raise SystemExit(f"Frontend eksik işaret: {required}")
    with tempfile.TemporaryDirectory() as tmp:
        os.environ["EINFAK_DB_PATH"] = str(Path(tmp) / "check.sqlite3")
        import importlib.util

        spec = importlib.util.spec_from_file_location("einfak_server", ROOT / "backend" / "server.py")
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.init_db()
        with module.db() as conn:
            data = module.bootstrap(conn, "rahmet-eli")
        assert data["stats"]["tenantCount"] >= 10
        assert any(c["slug"] == "kurban" for c in data["campaigns"])
    print(json.dumps({"ok": True, "checked": ["backend", "frontend", "seed"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Check Pantry Chef setup — run this anytime to verify dependencies, knowledge base, and AI settings.

    .venv/bin/python scripts/selfcheck.py
"""

from __future__ import annotations

import importlib
import os
import site
import socket
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

_VENV_SP = ROOT / ".venv" / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "site-packages"
if _VENV_SP.is_dir() and str(_VENV_SP) not in sys.path:
    site.addsitedir(str(_VENV_SP))

OK, BAD, WARN = "✅", "❌", "⚠️ "


def line(status: str, text: str, fix: str = "") -> None:
    print(f"{status} {text}")
    if fix:
        print(f"      → {fix}")


def main() -> int:
    problems = 0
    print("\nPantry Chef — setup & culinary engine check\n" + "-" * 44)

    v = sys.version_info
    if v >= (3, 10):
        line(OK, f"Python {v.major}.{v.minor}.{v.micro}")
    else:
        problems += 1
        line(BAD, f"Python {v.major}.{v.minor} is too old (need 3.10+)")

    missing = []
    for mod in ("fastapi", "uvicorn", "httpx", "PIL", "pydantic", "multipart"):
        try:
            importlib.import_module(mod)
        except ImportError:
            missing.append(mod)
    if missing:
        problems += 1
        line(BAD, f"Missing packages: {', '.join(missing)}", "Run: .venv/bin/pip install -r requirements.txt")
    else:
        line(OK, "All required Python packages installed")

    try:
        from pantry_chef import __version__
        from pantry_chef.config import config_path, load_settings
        from pantry_chef.knowledge import find_substitution, rank_and_synthesize_recipes, validate

        line(OK, f"Pantry Chef package loads (version {__version__})")
    except Exception as exc:  # noqa: BLE001
        problems += 1
        line(BAD, f"Failed to import pantry_chef: {exc}")
        return 1

    errs = validate()
    if errs:
        problems += 1
        line(BAD, f"Knowledge validation errors: {errs}")
    else:
        ranked = rank_and_synthesize_recipes([{"id": "spinach", "urgency": "urgent"}, {"id": "eggs", "urgency": "soon"}])
        sub = find_substitution("buttermilk", {"milk", "lemon"})
        assert ranked and sub and sub["in_pantry"]
        line(OK, f"Recipe Alchemist ({len(ranked)} recipes) & Chemistry Substitution Engine verified")

    s = load_settings()
    line(OK, f"Settings file: {config_path()} (provider: {s.provider}, model: {s.effective_model()})")

    port = int(os.environ.get("PANTRY_PORT", "8095"))
    with socket.socket() as sock:
        busy = sock.connect_ex(("127.0.0.1", port)) == 0
    line(WARN if busy else OK, f"Port {port} is currently in use" if busy else f"Default port {port} is available")

    print("-" * 44)
    if problems:
        print(f"{problems} issue(s) need attention.\n")
        return 1
    print("Everything looks great! Start Pantry Chef with:  ./run.sh  or  .venv/bin/python server.py\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())

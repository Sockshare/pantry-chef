#!/usr/bin/env python3
"""Start Pantry Chef (`pantry-chef`).

    python app.py              -> serves on http://127.0.0.1:8095 (and 0.0.0.0:8095)
    python app.py --port 9000  -> use a different port
    python app.py --no-browser -> don't open the browser automatically
"""

from __future__ import annotations

import argparse
import logging
import os
import site
import socket
import sys
import threading
import webbrowser

_VENV_SP = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    ".venv",
    "lib",
    f"python{sys.version_info.major}.{sys.version_info.minor}",
    "site-packages",
)
if os.path.isdir(_VENV_SP) and _VENV_SP not in sys.path:
    site.addsitedir(_VENV_SP)

MIN_PY = (3, 10)


def _check_python() -> None:
    if sys.version_info < MIN_PY:
        print(f"Pantry Chef needs Python {MIN_PY[0]}.{MIN_PY[1]} or newer. You have {sys.version.split()[0]}.")
        sys.exit(1)


def _check_deps() -> None:
    missing = []
    for mod in ("fastapi", "uvicorn", "httpx", "PIL", "pydantic", "multipart"):
        try:
            __import__(mod)
        except ImportError:
            missing.append(mod)
    if missing:
        print("Some required packages are not installed yet.")
        print("Run these two commands, then try again:\n")
        print("    source .venv/bin/activate")
        print("    pip install -r requirements.txt\n")
        print(f"(missing: {', '.join(missing)})")
        sys.exit(1)


def _port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) != 0


def main() -> None:
    _check_python()
    _check_deps()

    default_port = int(os.environ.get("PANTRY_PORT", "8095"))
    parser = argparse.ArgumentParser(
        description="Pantry Chef — Visual 'What's in My Fridge?' Recipe Alchemist, Substitution Engine & Multi-Timer Kitchen Studio."
    )
    parser.add_argument("--port", type=int, default=default_port, help=f"port to listen on (default {default_port})")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="host to bind (default 0.0.0.0)")
    parser.add_argument("--no-browser", action="store_true", help="don't open the browser automatically")
    parser.add_argument("--verbose", action="store_true", help="print detailed logs")
    args = parser.parse_args()

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)

    port = args.port
    if not _port_free(port):
        for candidate in range(port + 1, port + 20):
            if _port_free(candidate):
                print(f"Port {port} is busy, using {candidate} instead.")
                port = candidate
                break
        else:
            print(f"Port {port} and the next 20 are all busy. Try: python app.py --port 9000")
            sys.exit(1)

    import uvicorn

    url = f"http://localhost:{port}"
    print("\n  🥘 Pantry Chef is starting...")
    print(f"  🍳 Open in your browser:  {url}")
    print("  Press Ctrl+C here to stop.\n")

    if not args.no_browser:
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()

    uvicorn.run("pantry_chef.server:app", host=args.host, port=port, log_level="warning")


if __name__ == "__main__":
    main()

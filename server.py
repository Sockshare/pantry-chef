#!/usr/bin/env python3
"""Run Nexus & Standalone Entrypoint for Pantry Chef (port 8095).

Auto-injects `.venv/lib/pythonX.Y/site-packages` so `python3 server.py` works
even when invoked by system python from Run Nexus.
"""

from __future__ import annotations

import argparse
import os
import site
import sys

_VENV_SP = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    ".venv",
    "lib",
    f"python{sys.version_info.major}.{sys.version_info.minor}",
    "site-packages",
)
if os.path.isdir(_VENV_SP) and _VENV_SP not in sys.path:
    site.addsitedir(_VENV_SP)

import uvicorn  # noqa: E402
from pantry_chef.server import app  # noqa: E402,F401


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Pantry Chef — Visual 'What's in My Fridge?' Recipe Alchemist, Substitution Engine & Multi-Timer Kitchen Studio"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("PANTRY_PORT", "8095")),
        help="Port to serve on (default: 8095)",
    )
    parser.add_argument(
        "--host",
        type=str,
        default=os.environ.get("PANTRY_HOST", "0.0.0.0"),
        help="Host interface to bind (default: 0.0.0.0)",
    )
    args = parser.parse_args()
    uvicorn.run("pantry_chef.server:app", host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()

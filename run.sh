#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

PORT="${PANTRY_PORT:-8095}"
if [ -x ".venv/bin/python" ]; then
  exec .venv/bin/python server.py --port "$PORT" "$@"
else
  exec python3 server.py --port "$PORT" "$@"
fi

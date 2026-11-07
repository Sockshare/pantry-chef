# Pantry Chef — Quality & Verification Report (`QUALITY.md`)

## 1. Architecture & Engineering Gates
- **Default Port**: `8095` (`PANTRY_PORT`), served via `server.py` (with `_VENV_SP` site-packages auto-injection), `app.py`, and `./run.sh`.
- **Health Endpoint**: `GET /api/health` returns `200 OK` with live telemetry (`app: "pantry-chef"`, `version: "1.0.0"`).
- **Zero-Config Offline + Optional Vision AI**: Works 100% deterministically out-of-the-box with its Culinary Alchemist engine and Pillow RGB shelf-zone heuristic, while supporting Local Ollama Vision (`moondream` / `llava`), OpenAI Vision, and Google Gemini Vision.

## 2. Automated Test Suite Summary
- **Unit Tests (`tests/unit/test_knowledge.py`)**:
  - Verifies catalog integrity across 6 categories, 5 presets, 9 dietary/equipment/time filters, 48+ ingredients, and 10 culinary chemistry substitution families.
  - Verifies `format_quantity()` and `scale_amount()` Unicode fraction formatting (`½`, `¼`, `¾`, `1 ¼`).
  - Verifies `extract_timers_from_steps()` regex extraction of durations in seconds/minutes.
  - Verifies `rank_and_synthesize_recipes()` Waste-Saver Score prioritization and `build_grocery_list()` supermarket aisle grouping.
- **API Smoke Tests (`tests/smoke/test_api_smoke.py`)**:
  - Exercises `/api/health`, `/api/catalog`, `/api/alchemist/rank`, `/api/substitutions/lookup`, `/api/fridge/scan`, `/api/fridge/scan-sample`, `/api/grocery-list`, and `/api/settings`.
- **Real-Browser Playwright UI Tests (`tests/ui/test_ui_playwright.py`)**:
  - Launches headless Chromium (`playwright==1.49.1`), verifies `0` console errors and `0` uncaught page errors across all 5 studio views + Fridge Photo Scanner modal, verifies `0` horizontal overflow at both `1440px` desktop and `390px` mobile viewports, and captures 6 high-resolution screenshots into `docs/screenshots/`.

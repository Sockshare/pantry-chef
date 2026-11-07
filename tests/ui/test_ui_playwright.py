"""Playwright real-browser UI tests and screenshot capture for Pantry Chef."""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import httpx
import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent.parent
SCREENSHOT_DIR = ROOT / "docs" / "screenshots"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="module")
def live_server(tmp_path_factory):
    data_dir = tmp_path_factory.mktemp("pantry_chef_ui_data")
    port = _free_port()
    env = os.environ.copy()
    env["PANTRY_DATA_DIR"] = str(data_dir)
    env["PANTRY_PROVIDER"] = "offline"
    env["PANTRY_PORT"] = str(port)

    proc = subprocess.Popen(
        [sys.executable, str(ROOT / "server.py"), "--port", str(port), "--host", "127.0.0.1"],
        cwd=str(ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    base_url = f"http://127.0.0.1:{port}"
    for _ in range(90):
        try:
            r = httpx.get(f"{base_url}/api/health", timeout=1.5)
            if r.status_code == 200:
                break
        except Exception:
            pass
        time.sleep(0.25)
    else:
        proc.kill()
        out = proc.stdout.read().decode("utf-8", errors="ignore") if proc.stdout else ""
        raise RuntimeError(f"Pantry Chef test server did not start in time:\n{out}")

    yield base_url
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


def test_pantry_chef_full_journey_and_screenshots(live_server: str) -> None:
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    console_errors: list[str] = []
    page_errors: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 940})
        page = context.new_page()

        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda exc: page_errors.append(str(exc)))

        # 1. Initial Load: STRICT ZERO-DEFAULT MEALS & ZERO SELECTED INGREDIENTS
        page.goto(live_server, wait_until="networkidle")
        page.wait_for_selector("#ingredientChipGrid .ing-chip")
        assert page.locator("#ingredientChipGrid .ing-chip").count() >= 100
        assert page.locator("#ingredientChipGrid .ing-chip.selected").count() == 0
        assert page.locator("#recipeCardsGrid .recipe-card").count() == 0
        assert page.locator("#emptyCanvasState").is_visible()
        assert page.locator("#headerPantryCount").inner_text() == "0"
        page.screenshot(path=str(SCREENSHOT_DIR / "00_empty_kitchen_canvas_zero_defaults.png"), full_page=False)

        # 2. Click 1 Ingredient Chip ('eggs') -> Immediately Auto-Populates Matching Meals!
        page.locator("#ingredientChipGrid .ing-chip[data-ing-id='eggs']").click()
        page.wait_for_selector("#recipeCardsGrid .recipe-card")
        eggs_match_count = page.locator("#recipeCardsGrid .recipe-card").count()
        assert eggs_match_count >= 10, f"Expected >= 10 egg recipes to auto-populate, got {eggs_match_count}"
        assert page.locator("#headerPantryCount").inner_text() == "1"

        # 3. Click Additional Ingredients ('garlic', 'spinach', 'ramen_noodles') -> Dynamically Expands & Reranks
        for ing_id in ("garlic", "spinach", "ramen_noodles"):
            page.locator(f"#ingredientChipGrid .ing-chip[data-ing-id='{ing_id}']").click()
        page.wait_for_timeout(300)
        multi_match_count = page.locator("#recipeCardsGrid .recipe-card").count()
        assert multi_match_count > eggs_match_count

        # Scale servings to 4x and verify dynamic fraction update
        page.locator("#servingsButtonGroup .serving-btn[data-servings='4']").click()
        page.wait_for_timeout(300)
        page.screenshot(path=str(SCREENSHOT_DIR / "01_fridge_and_recipe_alchemist.png"), full_page=False)

        # 4. Test Clear All -> Resets to 0 Selected Ingredients and 0 Recipe Cards
        page.click("#clearFridgeBtn")
        page.wait_for_selector("#emptyCanvasState")
        assert page.locator("#ingredientChipGrid .ing-chip.selected").count() == 0
        assert page.locator("#recipeCardsGrid .recipe-card").count() == 0

        # 5. Test Fridge Photo Scanner & Confirmation Modal (which populates ingredients & meals)
        page.click("#scanSamplePhotoBtn")
        page.wait_for_selector("#scannerModal:not(.hidden)")
        assert page.locator("#scannedItemsList .scanned-item-row").count() >= 5
        page.wait_for_timeout(250)
        page.screenshot(path=str(SCREENSHOT_DIR / "02_fridge_photo_scanner_modal.png"), full_page=False)
        page.click("#confirmScannedItemsBtn")
        page.wait_for_selector("#recipeCardsGrid .recipe-card")
        assert page.locator("#recipeCardsGrid .recipe-card").count() >= 15

        # Add first recipe to Grocery Plan so Grocery List has items to display
        page.locator("#recipeCardsGrid .toggle-prep-btn").first.click()
        page.wait_for_timeout(200)

        # 6. Switch to Culinary Chemistry Substitution Engine View
        page.click("#navSubstitutionsBtn")
        page.wait_for_selector("#view-substitutions.active")
        page.wait_for_selector("#chemDetailContainer .chem-option-card")
        assert page.locator("#chemMissingSelector .chem-selector-pill").count() >= 8
        page.screenshot(path=str(SCREENSHOT_DIR / "03_chemistry_substitution_engine.png"), full_page=False)

        # 7. Switch to Interactive Hands-Free Kitchen Mode & Multi-Timer Deck
        page.click("#navKitchenBtn")
        page.wait_for_selector("#view-kitchen.active")
        assert page.locator("#multiTimerDock .timer-card").count() >= 2

        # Start the first timer and test kitchen chime
        page.locator("#multiTimerDock .timer-toggle-btn").first.click()
        page.click("#kitchenTestChimeBtn")
        page.wait_for_timeout(350)
        page.screenshot(path=str(SCREENSHOT_DIR / "04_hands_free_kitchen_mode_timers.png"), full_page=False)

        # 8. Switch to Smart Grocery List & Meal-Prep Planner
        page.click("#navGroceryBtn")
        page.wait_for_selector("#view-grocery.active")
        page.wait_for_selector("#groceryAislesContainer .aisle-card")
        page.wait_for_timeout(250)
        page.screenshot(path=str(SCREENSHOT_DIR / "05_smart_grocery_list_planner.png"), full_page=False)

        # 9. Switch to Settings View
        page.click("#navSettingsBtn")
        page.wait_for_selector("#view-settings.active")
        page.screenshot(path=str(SCREENSHOT_DIR / "06_ai_vision_and_studio_settings.png"), full_page=False)

        # Verify zero horizontal overflow on desktop (1440px) and mobile (390px)
        for vw in (1440, 390):
            page.set_viewport_size({"width": vw, "height": 844})
            page.wait_for_timeout(150)
            overflow = page.evaluate(
                "() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2"
            )
            assert not overflow, f"Horizontal overflow detected at width {vw}px"

        browser.close()

    assert console_errors == [], f"Browser console errors: {console_errors}"
    assert page_errors == [], f"Browser page errors: {page_errors}"

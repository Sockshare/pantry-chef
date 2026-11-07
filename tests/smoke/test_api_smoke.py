"""FastAPI HTTP smoke tests for Pantry Chef endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient

from pantry_chef.llm import generate_sample_fridge_photo
from pantry_chef.server import app

client = TestClient(app)


def test_health_and_catalog() -> None:
    r = client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["app"] == "pantry-chef"

    cat = client.get("/api/catalog")
    assert cat.status_code == 200
    cdata = cat.json()
    assert len(cdata["categories"]) == 8
    assert len(cdata["ingredients"]) >= 100
    assert len(cdata["presets"]) == 5
    assert len(cdata["filters"]) >= 9


def test_empty_pantry_returns_zero_recipes() -> None:
    r1 = client.post("/api/alchemist/rank", json={"pantry": [], "filters": [], "servings": 2})
    assert r1.status_code == 200
    b1 = r1.json()
    assert b1["recipes"] == []
    assert b1["matches"] == []
    assert b1["total_matches"] == 0

    r2 = client.post("/api/recipes/match", json={"pantry_items": []})
    assert r2.status_code == 200
    b2 = r2.json()
    assert b2["recipes"] == []
    assert b2["matches"] == []


def test_alchemist_rank_and_substitutions() -> None:
    r = client.post(
        "/api/alchemist/rank",
        json={
            "pantry": [
                {"id": "cherry_tomatoes", "urgency": "urgent"},
                {"id": "spinach", "urgency": "urgent"},
                {"id": "milk", "urgency": "soon"},
                {"id": "lemon", "urgency": "soon"},
            ],
            "filters": ["one_pan"],
            "servings": 4,
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["servings"] == 4
    assert len(body["recipes"]) >= 3
    for rec in body["recipes"]:
        assert rec["matched_count"] >= 1

    # Also test string IDs via /api/recipes/match
    rm = client.post("/api/recipes/match", json={"pantry_items": ["eggs", "garlic"]})
    assert rm.status_code == 200
    mbody = rm.json()
    assert len(mbody["recipes"]) >= 10

    sub = client.post(
        "/api/substitutions/lookup",
        json={"missing_id": "buttermilk", "pantry_ids": ["milk", "lemon"]},
    )
    assert sub.status_code == 200
    sbody = sub.json()
    assert sbody["best_match"]["in_pantry"] is True


def test_fridge_photo_upload_and_sample_scan() -> None:
    img_res = client.get("/api/fridge/sample-photo.png")
    assert img_res.status_code == 200
    assert img_res.headers["content-type"] == "image/png"

    sample_scan = client.post("/api/fridge/scan-sample")
    assert sample_scan.status_code == 200
    sdata = sample_scan.json()
    assert len(sdata["detected"]) >= 5

    png_bytes = generate_sample_fridge_photo()
    upload_res = client.post(
        "/api/fridge/scan",
        files={"file": ("my_fridge_spinach_eggs.png", png_bytes, "image/png")},
    )
    assert upload_res.status_code == 200
    udata = upload_res.json()
    assert len(udata["detected"]) >= 5


def test_grocery_list_and_settings(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PANTRY_DATA_DIR", str(tmp_path))
    g = client.post(
        "/api/grocery-list",
        json={
            "recipe_ids": ["midnight_silk_ramen", "sunlit_mediterranean_skillet"],
            "pantry": [{"id": "spinach", "urgency": "urgent"}],
            "servings": 2,
        },
    )
    assert g.status_code == 200
    gdata = g.json()
    assert gdata["total_missing_count"] > 0

    st = client.post(
        "/api/settings",
        json={
            "provider": "offline",
            "ollama_host": "http://127.0.0.1:11434",
            "ollama_model": "llama3.2:3b",
            "ollama_vision_model": "moondream",
            "default_servings": 4,
            "voice_enabled": True,
            "chime_enabled": True,
        },
    )
    assert st.status_code == 200
    assert st.json()["status"] == "saved"

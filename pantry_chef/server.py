"""FastAPI Server for Pantry Chef (port 8095)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from pantry_chef import __version__
from pantry_chef.config import Settings, load_settings, save_settings
from pantry_chef.knowledge import (
    CATEGORIES,
    FILTERS,
    INGREDIENT_MAP,
    INGREDIENTS,
    PRESETS,
    RECIPES,
    SUBSTITUTIONS,
    URGENCY_META,
    build_grocery_list,
    evaluate_recipe,
    extract_timers_from_steps,
    find_substitution,
    rank_and_synthesize_recipes,
)
from pantry_chef.llm import detect_ollama, generate_sample_fridge_photo, get_provider, scan_fridge_image

STATIC_DIR = Path(__file__).resolve().parent / "static"

app = FastAPI(
    title="Pantry Chef — Recipe Alchemist, Substitution Engine & Multi-Timer Kitchen Studio",
    version=__version__,
)


@app.middleware("http")
async def _no_cache_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    return response


if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


class PantryItemInput(BaseModel):
    id: str
    urgency: str = "fresh"


class AlchemistRequest(BaseModel):
    pantry: list[PantryItemInput | str] = Field(default_factory=list)
    pantry_items: list[PantryItemInput | str] = Field(default_factory=list)
    filters: list[str] = Field(default_factory=list)
    servings: int = Field(default=2, ge=1, le=8)
    browse_all: bool = False


class SubstitutionLookupRequest(BaseModel):
    missing_id: str
    pantry_ids: list[str] = Field(default_factory=list)


class GroceryListRequest(BaseModel):
    recipe_ids: list[str] = Field(default_factory=list)
    pantry: list[PantryItemInput] = Field(default_factory=list)
    servings: int = Field(default=2, ge=1, le=8)


class SettingsUpdateRequest(BaseModel):
    provider: str = "offline"
    ollama_host: str = "http://127.0.0.1:11434"
    ollama_model: str = "llama3.2:3b"
    ollama_vision_model: str = "moondream"
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    default_servings: int = 2
    voice_enabled: bool = True
    chime_enabled: bool = True


@app.get("/api/health")
def api_health() -> dict[str, Any]:
    s = load_settings()
    return {
        "status": "ok",
        "app": "pantry-chef",
        "version": __version__,
        "provider": s.provider,
        "effective_model": s.effective_model(),
        "ingredients_count": len(INGREDIENTS),
        "recipes_count": len(RECIPES),
        "substitutions_count": len(SUBSTITUTIONS),
    }


@app.get("/api/catalog")
def api_catalog() -> dict[str, Any]:
    return {
        "categories": CATEGORIES,
        "ingredients": INGREDIENTS,
        "presets": PRESETS,
        "filters": FILTERS,
        "urgency_meta": URGENCY_META,
        "substitutions_catalog": SUBSTITUTIONS,
        "recipes_count": len(RECIPES),
    }


def _normalize_pantry_input(items: list[PantryItemInput | str]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for item in items:
        if isinstance(item, str):
            out.append({"id": item, "urgency": "fresh"})
        else:
            out.append({"id": item.id, "urgency": item.urgency})
    return out


@app.post("/api/alchemist/rank")
@app.post("/api/recipes/match")
def api_alchemist_rank(req: AlchemistRequest, browse_all: bool = False) -> dict[str, Any]:
    raw_items = req.pantry if req.pantry else req.pantry_items
    pantry_dicts = _normalize_pantry_input(raw_items)
    ranked = rank_and_synthesize_recipes(
        pantry_items=pantry_dicts,
        filters=req.filters,
        servings=req.servings,
        browse_all=(req.browse_all or browse_all),
    )
    urgent_count = sum(1 for item in pantry_dicts if item.get("urgency") == "urgent")
    soon_count = sum(1 for item in pantry_dicts if item.get("urgency") == "soon")
    ready_count = sum(1 for r in ranked if r.get("is_ready_now"))
    return {
        "servings": req.servings,
        "pantry_count": len(pantry_dicts),
        "urgent_count": urgent_count,
        "soon_count": soon_count,
        "ready_count": ready_count,
        "total_matches": len(ranked),
        "recipes": ranked,
        "matches": ranked,
    }


@app.get("/api/recipes/{recipe_id}")
def api_get_recipe(recipe_id: str, servings: int = 2) -> dict[str, Any]:
    servings = max(1, min(8, servings))
    for r in RECIPES:
        if r["id"] == recipe_id:
            return evaluate_recipe(r, [], servings=servings)
    raise HTTPException(status_code=404, detail=f"Recipe '{recipe_id}' not found")


@app.post("/api/substitutions/lookup")
def api_substitution_lookup(req: SubstitutionLookupRequest) -> dict[str, Any]:
    pantry_set = set(req.pantry_ids)
    sub = find_substitution(req.missing_id, pantry_set)
    if not sub:
        raise HTTPException(status_code=404, detail=f"No substitution entry for '{req.missing_id}'")
    all_options = SUBSTITUTIONS[req.missing_id]["options"]
    annotated_options = []
    for opt in all_options:
        has_all = all(u in pantry_set for u in opt["uses"])
        has_any = any(u in pantry_set for u in opt["uses"])
        annotated_options.append(
            {
                **opt,
                "in_pantry": has_all or has_any,
                "uses_names": [INGREDIENT_MAP[u]["name"] for u in opt["uses"] if u in INGREDIENT_MAP],
            }
        )
    return {
        "missing_id": req.missing_id,
        "missing_name": SUBSTITUTIONS[req.missing_id]["missing_name"],
        "best_match": sub,
        "all_options": annotated_options,
    }


@app.get("/api/fridge/sample-photo.png")
def api_sample_fridge_photo() -> Response:
    png_bytes = generate_sample_fridge_photo()
    return Response(content=png_bytes, media_type="image/png")


@app.post("/api/fridge/scan")
async def api_scan_fridge(file: UploadFile = File(...)) -> dict[str, Any]:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded photo is empty")
    s = load_settings()
    return scan_fridge_image(content, file.filename or "fridge_upload.png", s)


@app.post("/api/fridge/scan-sample")
def api_scan_sample_fridge() -> dict[str, Any]:
    png_bytes = generate_sample_fridge_photo()
    s = load_settings()
    return scan_fridge_image(png_bytes, "sample_fridge_shelves.png", s)


@app.post("/api/grocery-list")
def api_grocery_list(req: GroceryListRequest) -> dict[str, Any]:
    pantry_dicts = [{"id": item.id, "urgency": item.urgency} for item in req.pantry]
    return build_grocery_list(
        recipe_ids=req.recipe_ids,
        pantry_items=pantry_dicts,
        servings=req.servings,
    )


@app.get("/api/settings")
def api_get_settings() -> dict[str, Any]:
    s = load_settings()
    ollama_info = detect_ollama(s.ollama_host)
    ok, msg = get_provider(s).check()
    return {
        "settings": {
            "provider": s.provider,
            "ollama_host": s.ollama_host,
            "ollama_model": s.ollama_model,
            "ollama_vision_model": s.ollama_vision_model,
            "openai_base_url": s.openai_base_url,
            "openai_model": s.openai_model,
            "has_openai_key": bool(s.openai_api_key),
            "gemini_model": s.gemini_model,
            "has_gemini_key": bool(s.gemini_api_key),
            "default_servings": s.default_servings,
            "voice_enabled": s.voice_enabled,
            "chime_enabled": s.chime_enabled,
        },
        "ollama": ollama_info,
        "provider_status": {"ok": ok, "message": msg},
    }


@app.post("/api/settings")
def api_save_settings(req: SettingsUpdateRequest) -> dict[str, Any]:
    current = load_settings()
    current.provider = req.provider
    current.ollama_host = req.ollama_host
    current.ollama_model = req.ollama_model
    current.ollama_vision_model = req.ollama_vision_model
    if req.openai_api_key:
        current.openai_api_key = req.openai_api_key
    current.openai_base_url = req.openai_base_url
    current.openai_model = req.openai_model
    if req.gemini_api_key:
        current.gemini_api_key = req.gemini_api_key
    current.gemini_model = req.gemini_model
    current.default_servings = max(1, min(8, req.default_servings))
    current.voice_enabled = req.voice_enabled
    current.chime_enabled = req.chime_enabled
    save_settings(current)
    ok, msg = get_provider(current).check()
    return {"status": "saved", "provider_status": {"ok": ok, "message": msg}}


@app.get("/", response_class=HTMLResponse)
def index_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")

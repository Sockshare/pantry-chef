"""Unit tests for Pantry Chef knowledge base, zero-default matching, Waste-Saver Score, Chemistry Substitution Engine, Portion Scaler & Timer Extractor."""

from __future__ import annotations

from pantry_chef.knowledge import (
    CATEGORIES,
    FILTERS,
    INGREDIENTS,
    PRESETS,
    RECIPES,
    SUBSTITUTIONS,
    build_grocery_list,
    extract_timers_from_steps,
    find_substitution,
    format_quantity,
    rank_and_synthesize_recipes,
    scale_amount,
    validate,
)


def test_catalog_integrity_and_massive_expansion() -> None:
    assert validate() == []
    assert len(CATEGORIES) == 8
    assert len(PRESETS) == 5
    assert len(FILTERS) >= 9
    assert len(INGREDIENTS) >= 100
    assert len(RECIPES) >= 75
    assert len(SUBSTITUTIONS) >= 8


def test_strict_zero_default_meals_when_pantry_empty() -> None:
    assert rank_and_synthesize_recipes([]) == []
    assert rank_and_synthesize_recipes([], filters=["under_15_min"], servings=4) == []


def test_single_ingredient_reactive_auto_population() -> None:
    for ing_id in ("eggs", "chicken_breast", "garlic", "jasmine_rice", "avocado", "salmon"):
        matches = rank_and_synthesize_recipes([{"id": ing_id, "urgency": "fresh"}])
        assert len(matches) >= 3, f"Expected multiple meals for {ing_id}, got {len(matches)}"
        for m in matches:
            assert m["matched_count"] >= 1
            assert ing_id in m["matched_ingredient_ids"]


def test_chemistry_substitution_engine() -> None:
    # Buttermilk with milk + lemon in pantry
    sub = find_substitution("buttermilk", {"milk", "lemon"})
    assert sub is not None
    assert sub["in_pantry"] is True
    assert "Casein" in sub["chemistry_tag"]
    assert "pH" in sub["science_why"]

    # Heavy cream with coconut milk in pantry
    cream_sub = find_substitution("heavy_cream", {"coconut_milk"})
    assert cream_sub is not None
    assert cream_sub["in_pantry"] is True
    assert "Coconut Milk" in cream_sub["label"]

    # Cornstarch with flour in pantry
    starch_sub = find_substitution("cornstarch", {"flour"})
    assert starch_sub is not None
    assert starch_sub["in_pantry"] is True
    assert "Gelatinization" in starch_sub["chemistry_tag"]


def test_portion_scaler_and_fraction_formatting() -> None:
    assert format_quantity(0.5) == "½"
    assert format_quantity(1.25) == "1 ¼"
    assert format_quantity(0.75) == "¾"
    assert scale_amount(0.5, "tsp", base_servings=2, target_servings=4) == "1 tsp"
    assert scale_amount(0.5, "cup", base_servings=2, target_servings=5) == "1 ¼ cup"


def test_timer_extraction_from_steps() -> None:
    steps = [
        {"title": "Sear", "instruction": "Sear sliced mushrooms for 4 minutes until deeply golden, then stir garlic for 45 seconds."},
        {"title": "Simmer", "instruction": "Simmer for 12 minutes and let rest for 5 minutes."},
    ]
    timers = extract_timers_from_steps(steps)
    assert len(timers) == 4
    assert timers[0]["duration_seconds"] == 240
    assert timers[1]["duration_seconds"] == 45
    assert timers[2]["duration_seconds"] == 720
    assert timers[3]["duration_seconds"] == 300


def test_waste_saver_ranking_and_grocery_planner() -> None:
    pantry = [
        {"id": "spinach", "urgency": "urgent"},
        {"id": "scallions", "urgency": "urgent"},
        {"id": "mushrooms", "urgency": "urgent"},
        {"id": "eggs", "urgency": "soon"},
        {"id": "ramen_noodles", "urgency": "fresh"},
        {"id": "soy_sauce", "urgency": "fresh"},
        {"id": "sesame_oil", "urgency": "fresh"},
        {"id": "garlic", "urgency": "fresh"},
        {"id": "chili_flakes", "urgency": "fresh"},
    ]
    ranked = rank_and_synthesize_recipes(pantry, filters=["under_15_min"], servings=4)
    assert len(ranked) >= 3
    top = ranked[0]
    assert top["id"] == "midnight_silk_ramen"
    assert top["is_ready_now"] is True
    assert top["waste_saver_score"] >= 85
    assert top["pantry_match_pct"] == 100
    assert "Baby Spinach" in top["rescued_urgent"]

    grocery = build_grocery_list(["midnight_silk_ramen", "sunlit_mediterranean_skillet"], pantry, servings=4)
    assert grocery["total_missing_count"] >= 1
    assert "Produce" in grocery["aisles"] or "Dairy & Eggs" in grocery["aisles"]
    assert "Smart Grocery" in grocery["markdown"]

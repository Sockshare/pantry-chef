/* Pantry Chef — Zero-Default Reactive Culinary Workbench, Chemistry Engine, Multi-Timer Deck & Web Audio/Speech */

(() => {
  const state = {
    catalog: null,
    pantry: [], // Strictly empty on initial load — zero default ingredients or meals!
    activePresetId: "",
    selectedCategory: "All",
    searchQuery: "",
    activeFilters: [],
    servings: 2,
    rankedRecipes: [],
    activeKitchenRecipe: null,
    activeStepIndex: 0,
    autoNarrate: false,
    timers: [], // [{ id, label, totalSeconds, remainingSeconds, running, stepNumber }]
    timerInterval: null,
    selectedChemMissingId: "buttermilk",
    mealPrepRecipeIds: new Set(),
    lastGroceryData: null,
    scannedCandidates: [],
    settings: {
      voice_enabled: true,
      chime_enabled: true,
    },
  };

  const URGENCY_ORDER = ["urgent", "soon", "fresh"];
  const URGENCY_LABELS = {
    urgent: "🔥 Use Today!",
    soon: "⏳ 2–3 Days",
    fresh: "🌿 Fresh",
  };

  function showToast(msg) {
    const el = document.getElementById("toastBanner");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.add("hidden"), 2900);
  }

  /* ==================== BESPOKE SVG PLATED DISH ARTWORK ==================== */
  function renderDishArtworkSvg(recipe) {
    const accent = recipe.accent_color || "#c85a32";
    const emoji = recipe.hero_emoji || "🍲";
    return `
      <div class="dish-plate-artwork" aria-hidden="true">
        <svg viewBox="0 0 80 80" width="68" height="68" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="40" cy="42" r="34" fill="#161412" fill-opacity="0.06"/>
          <circle cx="40" cy="40" r="34" fill="#FAF6EE" stroke="#E2D9C5" stroke-width="2"/>
          <circle cx="40" cy="40" r="26" fill="${accent}" fill-opacity="0.14" stroke="${accent}" stroke-width="1.5" stroke-dasharray="4 3"/>
          <circle cx="40" cy="40" r="19" fill="${accent}" fill-opacity="0.22"/>
          <path d="M28 18C28 14 31 12 31 8" stroke="${accent}" stroke-width="1.6" stroke-linecap="round" opacity="0.55"/>
          <path d="M40 16C40 12 43 10 43 6" stroke="${accent}" stroke-width="1.6" stroke-linecap="round" opacity="0.55"/>
          <path d="M52 18C52 14 55 12 55 8" stroke="${accent}" stroke-width="1.6" stroke-linecap="round" opacity="0.55"/>
          <circle cx="24" cy="28" r="2.5" fill="#1E6B4B" opacity="0.7"/>
          <circle cx="56" cy="50" r="2.2" fill="#D97706" opacity="0.7"/>
          <circle cx="27" cy="53" r="2" fill="${accent}" opacity="0.75"/>
        </svg>
        <span class="dish-plate-emoji">${emoji}</span>
      </div>
    `;
  }

  /* ==================== WEB AUDIO SYNTHESIZED KITCHEN CHIME ==================== */
  function playKitchenChime() {
    if (state.settings && state.settings.chime_enabled === false) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.11);
        gain.gain.setValueAtTime(0.001, ctx.currentTime + idx * 0.11);
        gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + idx * 0.11 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + idx * 0.11 + 0.55);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.11);
        osc.stop(ctx.currentTime + idx * 0.11 + 0.58);
      });
    } catch (_e) {
      // Ignore audio autoplay restrictions in headless environments
    }
  }

  /* ==================== WEB SPEECH API VOICE ASSISTANT ==================== */
  function speakStepAloud(text) {
    if (!("speechSynthesis" in window)) {
      showToast("🔊 Voice readout ready: " + text.slice(0, 60) + "...");
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 0.98;
      utter.pitch = 1.02;
      window.speechSynthesis.speak(utter);
      showToast("🔊 Reading current step aloud...");
    } catch (_e) {
      showToast("🔊 Voice assistant activated");
    }
  }

  /* ==================== VIEW SWITCHING ==================== */
  function switchView(viewName) {
    document.querySelectorAll(".view-section").forEach((sec) => {
      sec.classList.toggle("active", sec.id === `view-${viewName}`);
    });
    document.querySelectorAll(".nav-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === viewName);
    });
    if (viewName === "substitutions") {
      renderChemistryLab();
    } else if (viewName === "kitchen") {
      if (!state.activeKitchenRecipe && state.rankedRecipes.length > 0) {
        loadRecipeIntoKitchen(state.rankedRecipes[0]);
      } else {
        renderKitchenMode();
      }
    } else if (viewName === "grocery") {
      refreshGroceryList();
    }
  }

  /* ==================== FRIDGE INVENTORY & PRESETS ==================== */
  function renderPresets() {
    const bar = document.getElementById("presetBar");
    if (!bar || !state.catalog) return;
    bar.innerHTML = "";
    state.catalog.presets.forEach((preset) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `preset-card ${state.activePresetId === preset.id ? "active" : ""}`;
      btn.dataset.presetId = preset.id;
      btn.innerHTML = `
        <div class="preset-card-top">
          <span>${preset.emoji}</span>
          <span>${preset.name}</span>
        </div>
        <p class="preset-card-desc">${preset.tagline}</p>
      `;
      btn.addEventListener("click", () => {
        state.activePresetId = preset.id;
        state.pantry = preset.items.map((x) => ({ id: x.id, urgency: x.urgency }));
        renderPresets();
        renderFridgeAndPicker();
        rankRecipes();
        showToast(`${preset.emoji} Loaded "${preset.name}" kit (${state.pantry.length} ingredients)`);
      });
      bar.appendChild(btn);
    });
  }

  function renderCategoryTabs() {
    const wrap = document.getElementById("categoryTabs");
    if (!wrap || !state.catalog) return;
    const cats = ["All", ...state.catalog.categories];
    wrap.innerHTML = "";
    cats.forEach((cat) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `cat-tab-btn ${state.selectedCategory === cat ? "active" : ""}`;
      btn.textContent = cat;
      btn.addEventListener("click", () => {
        state.selectedCategory = cat;
        renderCategoryTabs();
        renderIngredientChipGrid();
      });
      wrap.appendChild(btn);
    });
  }

  function renderActiveFridgeShelf() {
    const shelf = document.getElementById("activeFridgeShelf");
    const countEl = document.getElementById("headerPantryCount");
    const urgentEl = document.getElementById("headerUrgentCount");
    const drawerBadge = document.getElementById("drawerSelectedBadge");
    if (!shelf || !state.catalog) return;

    const ingMap = {};
    state.catalog.ingredients.forEach((i) => {
      ingMap[i.id] = i;
    });

    const urgentCount = state.pantry.filter((x) => x.urgency === "urgent").length;
    if (countEl) countEl.textContent = String(state.pantry.length);
    if (urgentEl) urgentEl.textContent = String(urgentCount);
    if (drawerBadge) drawerBadge.textContent = `${state.pantry.length} Selected`;

    if (state.pantry.length === 0) {
      shelf.innerHTML = `<span class="helper-caption">0 ingredients selected — tap any ingredient chips below to populate meals that use them!</span>`;
      return;
    }

    shelf.innerHTML = "";
    state.pantry.forEach((item) => {
      const meta = ingMap[item.id] || { name: item.id, emoji: "🥘" };
      const pill = document.createElement("div");
      pill.className = "fridge-shelf-item";
      pill.dataset.ingId = item.id;

      const urgSpan = document.createElement("span");
      urgSpan.className = `urgency-pill urgency-${item.urgency}`;
      urgSpan.title = "Click to cycle expiration urgency (Use Today! → 2–3 Days → Fresh)";
      urgSpan.textContent = URGENCY_LABELS[item.urgency] || URGENCY_LABELS.fresh;
      urgSpan.addEventListener("click", () => {
        const nextIdx = (URGENCY_ORDER.indexOf(item.urgency) + 1) % URGENCY_ORDER.length;
        item.urgency = URGENCY_ORDER[nextIdx];
        renderActiveFridgeShelf();
        rankRecipes();
      });

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "shelf-remove-btn";
      removeBtn.setAttribute("aria-label", `Remove ${meta.name}`);
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", () => {
        state.pantry = state.pantry.filter((x) => x.id !== item.id);
        renderFridgeAndPicker();
        rankRecipes();
      });

      const labelSpan = document.createElement("span");
      labelSpan.textContent = `${meta.emoji} ${meta.name}`;

      pill.appendChild(labelSpan);
      pill.appendChild(urgSpan);
      pill.appendChild(removeBtn);
      shelf.appendChild(pill);
    });
  }

  function toggleIngredientById(ingId) {
    if (!state.catalog) return;
    const ing = state.catalog.ingredients.find((x) => x.id === ingId);
    if (!ing) return;
    const exists = state.pantry.some((x) => x.id === ingId);
    if (exists) {
      state.pantry = state.pantry.filter((x) => x.id !== ingId);
    } else {
      state.pantry.push({ id: ing.id, urgency: ing.default_urgency || "fresh" });
    }
    state.activePresetId = "";
    renderPresets();
    renderFridgeAndPicker();
    rankRecipes();
  }

  function renderIngredientChipGrid() {
    const grid = document.getElementById("ingredientChipGrid");
    if (!grid || !state.catalog) return;
    const pantryMap = new Map(state.pantry.map((x) => [x.id, x.urgency]));
    const q = state.searchQuery.trim().toLowerCase();

    grid.innerHTML = "";
    state.catalog.ingredients
      .filter((ing) => {
        if (state.selectedCategory !== "All" && ing.category !== state.selectedCategory) return false;
        if (q && !ing.name.toLowerCase().includes(q) && !ing.category.toLowerCase().includes(q)) return false;
        return true;
      })
      .forEach((ing) => {
        const inPantry = pantryMap.has(ing.id);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `ing-chip ${inPantry ? "selected" : ""}`;
        btn.dataset.ingId = ing.id;
        btn.innerHTML = `
          <div class="ing-chip-top">
            <span>${ing.emoji}</span>
            <span>${inPantry ? "✓" : "+"}</span>
          </div>
          <span class="ing-chip-name">${ing.name}</span>
        `;
        btn.addEventListener("click", () => {
          toggleIngredientById(ing.id);
        });
        grid.appendChild(btn);
      });
  }

  function renderFridgeAndPicker() {
    renderActiveFridgeShelf();
    renderIngredientChipGrid();
  }

  /* ==================== FILTERS & PORTION SCALER ==================== */
  function renderFilters() {
    const bar = document.getElementById("filterChipBar");
    if (!bar || !state.catalog) return;
    bar.innerHTML = "";
    state.catalog.filters.forEach((flt) => {
      const active = state.activeFilters.includes(flt.id);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `filter-chip ${active ? "active" : ""}`;
      btn.dataset.filterId = flt.id;
      btn.textContent = flt.label;
      btn.addEventListener("click", () => {
        if (active) {
          state.activeFilters = state.activeFilters.filter((x) => x !== flt.id);
        } else {
          state.activeFilters.push(flt.id);
        }
        renderFilters();
        rankRecipes();
      });
      bar.appendChild(btn);
    });
  }

  /* ==================== RECIPE ALCHEMIST RANKING & AUTO-POPULATION ==================== */
  async function rankRecipes() {
    const navBadge = document.getElementById("matchingMealsNavBadge");
    const livePill = document.getElementById("liveMatchCountPill");

    if (state.pantry.length === 0) {
      state.rankedRecipes = [];
      if (navBadge) navBadge.textContent = "0";
      if (livePill) livePill.textContent = "0 Matching Meals — Select Ingredients";
      renderWasteImpactBanner({ recipes: [], total_matches: 0, ready_count: 0 });
      renderRecipeCards();
      return;
    }

    try {
      const resp = await fetch("/api/alchemist/rank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pantry: state.pantry,
          filters: state.activeFilters,
          servings: state.servings,
        }),
      });
      if (!resp.ok) return;
      const data = await resp.json();
      state.rankedRecipes = data.recipes || [];
      const readyCount = state.rankedRecipes.filter((r) => r.is_ready_now).length;

      if (navBadge) navBadge.textContent = String(state.rankedRecipes.length);
      if (livePill) {
        livePill.textContent =
          readyCount > 0
            ? `✨ ${state.rankedRecipes.length} Matching Meals (${readyCount} Ready Now!)`
            : `✨ ${state.rankedRecipes.length} Matching Meals Auto-Populated`;
      }

      renderWasteImpactBanner(data);
      renderRecipeCards();

      if (state.rankedRecipes.length > 0) {
        if (!state.activeKitchenRecipe) {
          loadRecipeIntoKitchen(state.rankedRecipes[0]);
        } else {
          const updated = state.rankedRecipes.find((r) => r.id === state.activeKitchenRecipe.id);
          loadRecipeIntoKitchen(updated || state.rankedRecipes[0]);
        }
      }
    } catch (_err) {
      // Ignore transient errors
    }
  }

  function renderWasteImpactBanner(data) {
    const el = document.getElementById("wasteImpactBanner");
    if (!el) return;
    if (state.pantry.length === 0) {
      el.classList.add("hidden");
      el.innerHTML = "";
      return;
    }
    el.classList.remove("hidden");
    const recipes = data.recipes || [];
    const top = recipes[0] || null;
    if (!top) {
      el.innerHTML = `<span>No meals matched both your selected ingredients and active dietary filters — try toggling off a filter chip above!</span>`;
      return;
    }
    const readyCount = recipes.filter((r) => r.is_ready_now).length;
    const rescuedCount =
      (top.rescued_urgent ? top.rescued_urgent.length : 0) +
      (top.rescued_soon ? top.rescued_soon.length : 0);
    el.innerHTML = `
      <div>
        <strong>✨ ${recipes.length} Meals Auto-Populated from ${state.pantry.length} Selected Ingredient${state.pantry.length === 1 ? "" : "s"}:</strong>
        ${readyCount > 0 ? `<span style="color:#1b6b4a;font-weight:800;">${readyCount} Ready to Cook Now!</span> · ` : ""}
        Top match rescues <strong>${rescuedCount} perishable item(s)</strong>
        ${top.rescued_urgent && top.rescued_urgent.length ? `(<span class="urgent-text">🔥 ${top.rescued_urgent.join(", ")}</span>)` : ""}
        and saves <strong>~$${top.waste_saved_dollars.toFixed(2)}</strong> in food waste.
      </div>
      <div>
        <span class="urgency-pill urgency-fresh">Scaled for ${state.servings}× Servings</span>
      </div>
    `;
  }

  function renderEmptyKitchenCanvas(grid) {
    const emptyCard = document.createElement("div");
    emptyCard.id = "emptyCanvasState";
    emptyCard.className = "empty-canvas-card";
    emptyCard.innerHTML = `
      <div class="empty-canvas-art" aria-hidden="true">
        <svg viewBox="0 0 96 96" width="76" height="76" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="48" cy="48" r="42" fill="#FFF8EE" stroke="#E5DAC3" stroke-width="2"/>
          <path d="M26 52C26 63.0457 34.9543 72 46 72H50C61.0457 72 70 63.0457 70 52V46H26V52Z" fill="#2A2623" stroke="#161412" stroke-width="2.5"/>
          <path d="M70 49H82C84.2091 49 86 47.2091 86 45C86 42.7909 84.2091 41 82 41H70" stroke="#161412" stroke-width="2.5" stroke-linecap="round"/>
          <circle cx="38" cy="36" r="6" fill="#E07A3C"/>
          <circle cx="52" cy="34" r="7" fill="#2E7D5B"/>
          <circle cx="60" cy="40" r="5" fill="#D94E34"/>
          <path d="M34 22C34 18 37 16 37 12" stroke="#C85A32" stroke-width="2" stroke-linecap="round"/>
          <path d="M48 20C48 16 51 14 51 10" stroke="#C85A32" stroke-width="2" stroke-linecap="round"/>
          <path d="M62 22C62 18 65 16 65 12" stroke="#C85A32" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
      <h3 class="empty-canvas-title">Your Kitchen Canvas is Ready</h3>
      <p class="empty-canvas-sub">
        We never presume default meals beforehand. Tap any ingredients you have in the <strong>Pantry Workbench</strong> on the left — or click a starter ingredient below — and watch authentic meals that use your exact ingredients auto-populate in real time.
      </p>
      <div class="empty-canvas-steps">
        <span class="empty-step-pill"><span class="empty-step-num">1</span> Tap 1 or more ingredients you have</span>
        <span class="empty-step-pill"><span class="empty-step-num">2</span> Meals using those ingredients appear instantly</span>
        <span class="empty-step-pill"><span class="empty-step-num">3</span> Cook with voice &amp; timers or substitute missing items</span>
      </div>
      <div style="margin-top:8px;">
        <span class="section-mini-label" style="display:block;margin-bottom:8px;">Quick-Start: Tap Any Single Ingredient to See Meals Populate</span>
        <div class="starter-ing-prompts">
          <button type="button" class="starter-ing-btn" data-starter-id="eggs">🥚 Pasture-Raised Eggs</button>
          <button type="button" class="starter-ing-btn" data-starter-id="chicken_breast">🍗 Chicken Breast</button>
          <button type="button" class="starter-ing-btn" data-starter-id="garlic">🧄 Fresh Garlic</button>
          <button type="button" class="starter-ing-btn" data-starter-id="jasmine_rice">🍚 Jasmine Rice</button>
          <button type="button" class="starter-ing-btn" data-starter-id="cherry_tomatoes">🍅 Cherry Tomatoes</button>
          <button type="button" class="starter-ing-btn" data-starter-id="avocado">🥑 Ripe Avocado</button>
          <button type="button" class="starter-ing-btn" data-starter-id="spaghetti">🍝 Spaghetti Pasta</button>
          <button type="button" class="starter-ing-btn" data-starter-id="salmon">🍣 Salmon Fillet</button>
        </div>
      </div>
    `;
    emptyCard.querySelectorAll(".starter-ing-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const starterId = btn.dataset.starterId;
        if (starterId) {
          toggleIngredientById(starterId);
        }
      });
    });
    grid.appendChild(emptyCard);
  }

  function renderRecipeCards() {
    const grid = document.getElementById("recipeCardsGrid");
    if (!grid) return;
    grid.innerHTML = "";

    if (state.pantry.length === 0) {
      renderEmptyKitchenCanvas(grid);
      return;
    }

    if (state.rankedRecipes.length === 0) {
      const noMatch = document.createElement("div");
      noMatch.className = "empty-canvas-card";
      noMatch.innerHTML = `
        <h3 class="empty-canvas-title">No Matching Meals With Current Filters</h3>
        <p class="empty-canvas-sub">Try clearing an active dietary/time filter chip above or adding another ingredient from your kitchen.</p>
      `;
      grid.appendChild(noMatch);
      return;
    }

    state.rankedRecipes.forEach((recipe) => {
      const card = document.createElement("article");
      card.className = "recipe-card";
      card.dataset.recipeId = recipe.id;

      const statusBadgeHtml = recipe.is_ready_now
        ? `<span class="ready-cook-glow-badge">✅ Ready to Cook Now! • ${recipe.matched_count + recipe.sub_available_count}/${recipe.total_ingredients} Ingredients</span>`
        : `<span class="partial-match-badge">🥘 Uses ${recipe.matched_count} of your selected ingredient${recipe.matched_count === 1 ? "" : "s"}${recipe.sub_available_count > 0 ? ` (+${recipe.sub_available_count} Chemistry Sub)` : ""} • Missing ${recipe.missing_count}</span>`;

      const rescuedUrgentText =
        recipe.rescued_urgent && recipe.rescued_urgent.length > 0
          ? `🔥 Rescues Use-Today Items: <strong>${recipe.rescued_urgent.join(", ")}</strong>`
          : `🌿 Matched: <strong>${(recipe.matched_ingredient_names || []).join(", ")}</strong>`;

      const ingHtml = (recipe.ingredients_detail || [])
        .map((ing) => {
          let badge = `<span class="urgency-pill urgency-fresh">✓ In Fridge</span>`;
          if (ing.status === "in_pantry" && ing.urgency === "urgent") {
            badge = `<span class="urgency-pill urgency-urgent">🔥 Use Today!</span>`;
          } else if (ing.status === "in_pantry" && ing.urgency === "soon") {
            badge = `<span class="urgency-pill urgency-soon">⏳ 2–3 Days</span>`;
          } else if (ing.status === "sub_available") {
            badge = `<span class="urgency-pill" style="background:#e9e2fc;color:#4a28b5;">🧪 Chemistry Sub</span>`;
          } else if (ing.status === "missing") {
            badge = `<span class="urgency-pill" style="background:#f1efe9;color:#6e655b;">+ Have It?</span>`;
          }
          return `
            <div class="recipe-ing-item ${ing.status}" data-ing-id="${ing.id}" title="${ing.status === "missing" ? "Click if you also have this ingredient on hand" : ""}" style="${ing.status === "missing" ? "cursor:pointer;" : ""}">
              <div>
                <strong>${ing.emoji} ${ing.name}</strong>
                <div style="font-size:0.75rem;color:#5b635e;">${ing.scaled_amount}</div>
              </div>
              ${badge}
            </div>
          `;
        })
        .join("");

      const subsHtml =
        recipe.substitutions && recipe.substitutions.length > 0
          ? recipe.substitutions
              .slice(0, 2)
              .map(
                (sub) => `
              <div class="chem-sub-box">
                <div>
                  <strong>🧪 Culinary Chemistry Sub for ${sub.missing_name}:</strong>
                  Use <strong>${sub.label}</strong> <em>(${sub.chemistry_tag})</em>
                </div>
                <div style="margin-top:3px;color:#4a4e4c;">
                  <strong>Why it works:</strong> ${sub.science_why}
                </div>
              </div>
            `
              )
              .join("")
          : "";

      const timersHtml = (recipe.timers || [])
        .map((t) => `<span class="timer-preview-chip">⏱️ ${t.label}</span>`)
        .join("");

      const n = recipe.nutrition_per_serving || {};
      const inMealPrep = state.mealPrepRecipeIds.has(recipe.id);

      card.innerHTML = `
        <div class="recipe-card-header">
          <div style="display:flex;align-items:flex-start;gap:16px;flex:1;">
            ${renderDishArtworkSvg(recipe)}
            <div class="recipe-title-group">
              <div class="recipe-meta-line">
                <span>${recipe.hero_emoji} ${recipe.cuisine}</span>
                <span>•</span>
                <span>⏱️ ${recipe.prep_minutes} Mins</span>
                <span>•</span>
                <span>🍽️ ${recipe.servings} Servings</span>
              </div>
              <h3 class="recipe-card-title">${recipe.title}</h3>
              <p class="recipe-card-subtitle">${recipe.subtitle}</p>
              <div style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                ${statusBadgeHtml}
              </div>
            </div>
          </div>

          <div class="score-badges-col">
            <div class="score-pill match-score" title="Percentage of recipe covered by your selected ingredients & chemistry substitutions">
              <span class="score-num">${recipe.pantry_match_pct}%</span>
              <span class="score-label">Pantry Match</span>
            </div>
            <div class="score-pill waste-score" title="Prioritizes recipes that rescue expiring Use-Today & 2-3 Day ingredients">
              <span class="score-num">${recipe.waste_saver_score}%</span>
              <span class="score-label">Match Score</span>
            </div>
          </div>
        </div>

        <div class="match-progress-bar-wrap" aria-hidden="true">
          <div class="match-progress-bar-fill" style="width:${Math.min(100, Math.max(8, recipe.pantry_match_pct))}%;"></div>
        </div>

        <div class="rescue-callout">
          <span>${rescuedUrgentText}</span>
          <strong>💰 Saves ~$${recipe.waste_saved_dollars.toFixed(2)} in Food Waste</strong>
        </div>

        <!-- Per-Serving Nutrition & Cost -->
        <div class="macros-strip" aria-label="Per-Serving Nutrition">
          <div class="macro-cell">
            <span class="macro-val">${n.calories} kcal</span>
            <span class="macro-lbl">Calories / Serv</span>
          </div>
          <div class="macro-cell">
            <span class="macro-val">${n.protein_g}g</span>
            <span class="macro-lbl">Protein</span>
          </div>
          <div class="macro-cell">
            <span class="macro-val">${n.carbs_g}g</span>
            <span class="macro-lbl">Net Carbs</span>
          </div>
          <div class="macro-cell">
            <span class="macro-val">${n.fat_g}g</span>
            <span class="macro-lbl">Healthy Fats</span>
          </div>
          <div class="macro-cell">
            <span class="macro-val">${n.fiber_g}g</span>
            <span class="macro-lbl">Dietary Fiber</span>
          </div>
          <div class="macro-cell">
            <span class="macro-val">$${Number(n.cost_per_serving || 2.25).toFixed(2)}</span>
            <span class="macro-lbl">Est. Cost / Serv</span>
          </div>
        </div>

        <!-- Scaled Ingredients Grid -->
        <div class="recipe-ing-grid">
          ${ingHtml}
        </div>

        <!-- Chemistry Substitutions Explanation -->
        ${subsHtml}

        <!-- Footer with Extracted Timers & Action Buttons -->
        <div class="recipe-card-footer">
          <div class="extracted-timers-preview">
            ${timersHtml}
          </div>
          <div class="recipe-action-btns">
            <button type="button" class="btn btn-secondary toggle-prep-btn" data-recipe-id="${recipe.id}">
              ${inMealPrep ? "✓ In Grocery Plan" : "🛒 + Grocery Plan"}
            </button>
            <button type="button" class="btn btn-accent cook-kitchen-btn" data-recipe-id="${recipe.id}">
              👨‍🍳 Cook in Hands-Free Kitchen Mode
            </button>
          </div>
        </div>
      `;

      // Allow clicking a missing ingredient inside a recipe card to immediately add it to the pantry
      card.querySelectorAll(".recipe-ing-item.missing").forEach((missingEl) => {
        missingEl.addEventListener("click", () => {
          const ingId = missingEl.dataset.ingId;
          if (ingId) {
            toggleIngredientById(ingId);
          }
        });
      });

      card.querySelector(".cook-kitchen-btn").addEventListener("click", () => {
        loadRecipeIntoKitchen(recipe);
        switchView("kitchen");
      });

      card.querySelector(".toggle-prep-btn").addEventListener("click", () => {
        if (state.mealPrepRecipeIds.has(recipe.id)) {
          state.mealPrepRecipeIds.delete(recipe.id);
        } else {
          state.mealPrepRecipeIds.add(recipe.id);
        }
        renderRecipeCards();
        refreshGroceryBadge();
        showToast("🛒 Updated Smart Grocery & Meal-Prep Plan");
      });

      grid.appendChild(card);
    });
  }

  /* ==================== VIEW 2: CULINARY CHEMISTRY SUBSTITUTION LAB ==================== */
  async function renderChemistryLab() {
    const selector = document.getElementById("chemMissingSelector");
    const detail = document.getElementById("chemDetailContainer");
    if (!selector || !detail || !state.catalog) return;

    const subCat = state.catalog.substitutions_catalog || {};
    const keys = Object.keys(subCat);
    selector.innerHTML = "";

    keys.forEach((k) => {
      const entry = subCat[k];
      const ingMeta = state.catalog.ingredients.find((i) => i.id === k);
      const emoji = ingMeta ? ingMeta.emoji : "🧪";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `chem-selector-pill ${state.selectedChemMissingId === k ? "active" : ""}`;
      btn.dataset.chemId = k;
      btn.textContent = `${emoji} Missing ${entry.missing_name}?`;
      btn.addEventListener("click", () => {
        state.selectedChemMissingId = k;
        renderChemistryLab();
      });
      selector.appendChild(btn);
    });

    try {
      const resp = await fetch("/api/substitutions/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missing_id: state.selectedChemMissingId,
          pantry_ids: state.pantry.map((x) => x.id),
        }),
      });
      if (!resp.ok) return;
      const data = await resp.json();

      detail.innerHTML = (data.all_options || [])
        .map(
          (opt) => `
          <div class="chem-option-card ${opt.in_pantry ? "in-pantry-match" : ""}">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
              <span class="chem-tag-badge">🔬 ${opt.chemistry_tag}</span>
              <span class="urgency-pill ${opt.in_pantry ? "urgency-fresh" : "urgency-soon"}">
                ${opt.in_pantry ? "✅ Ready in Your Fridge!" : "💡 Pantry Alternative"}
              </span>
            </div>
            <h3 style="margin:4px 0 6px;font-size:1.12rem;">${opt.label}</h3>
            <p style="margin:0 0 8px;font-size:0.82rem;color:#5b635e;">
              <strong>Substitution Ratio:</strong> ${opt.ratio} ·
              <strong>Uses:</strong> ${(opt.uses_names || []).join(" + ")}
            </p>
            <div style="background:#f6f3ec;padding:11px 13px;border-radius:8px;font-size:0.86rem;">
              <strong>Why This Works (Culinary Science):</strong><br/>
              ${opt.science_why}
            </div>
          </div>
        `
        )
        .join("");
    } catch (_e) {
      // Ignore
    }
  }

  /* ==================== VIEW 3: HANDS-FREE KITCHEN MODE & MULTI-TIMER DECK ==================== */
  function loadRecipeIntoKitchen(recipe) {
    state.activeKitchenRecipe = recipe;
    state.activeStepIndex = 0;
    state.timers = (recipe.timers || []).map((t) => ({
      id: t.id,
      label: t.label,
      stepNumber: t.step_number,
      totalSeconds: t.duration_seconds,
      remainingSeconds: t.duration_seconds,
      running: false,
      completed: false,
    }));
    renderKitchenMode();
  }

  function formatMMSS(sec) {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }

  function ensureTimerLoop() {
    if (state.timerInterval) return;
    state.timerInterval = setInterval(() => {
      let anyChanged = false;
      state.timers.forEach((t) => {
        if (t.running && t.remainingSeconds > 0) {
          t.remainingSeconds -= 1;
          anyChanged = true;
          if (t.remainingSeconds <= 0) {
            t.remainingSeconds = 0;
            t.running = false;
            t.completed = true;
            playKitchenChime();
            showToast(`⏰ Kitchen Timer Done: ${t.label}!`);
          }
        }
      });
      if (anyChanged) {
        renderMultiTimerDock();
        updateActiveTimerBadge();
      }
    }, 1000);
  }

  function updateActiveTimerBadge() {
    const badge = document.getElementById("activeTimerCountBadge");
    if (!badge) return;
    const runningCount = state.timers.filter((t) => t.running).length;
    if (runningCount > 0) {
      badge.textContent = String(runningCount);
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  function renderMultiTimerDock() {
    const dock = document.getElementById("multiTimerDock");
    if (!dock) return;
    dock.innerHTML = "";

    const radius = 25;
    const circumference = 2 * Math.PI * radius;

    state.timers.forEach((t) => {
      const pct = t.totalSeconds > 0 ? t.remainingSeconds / t.totalSeconds : 0;
      const dashOffset = circumference * (1 - pct);

      const card = document.createElement("div");
      card.className = `timer-card ${t.running ? "running" : ""} ${t.completed ? "completed" : ""}`;
      card.dataset.timerId = t.id;
      card.innerHTML = `
        <div class="timer-ring-wrap">
          <svg class="timer-ring-svg" viewBox="0 0 62 62">
            <circle class="timer-ring-bg" cx="31" cy="31" r="${radius}"></circle>
            <circle
              class="timer-ring-fg"
              cx="31"
              cy="31"
              r="${radius}"
              stroke-dasharray="${circumference.toFixed(1)}"
              stroke-dashoffset="${dashOffset.toFixed(1)}"
            ></circle>
          </svg>
          <div class="timer-ring-time">${formatMMSS(t.remainingSeconds)}</div>
        </div>
        <div class="timer-info">
          <p class="timer-title">${t.label}</p>
          <span class="timer-sub">Step ${t.stepNumber || "Custom"} · ${t.completed ? "Done! 🔔" : t.running ? "Counting down..." : "Ready"}</span>
        </div>
        <div class="timer-controls">
          <button type="button" class="btn ${t.running ? "btn-secondary" : "btn-accent"} btn-xs timer-toggle-btn">
            ${t.running ? "⏸ Pause" : "▶ Start"}
          </button>
          <button type="button" class="btn btn-ghost btn-xs timer-plus-btn" title="Add 1 minute">+1m</button>
          <button type="button" class="btn btn-ghost btn-xs timer-reset-btn" title="Reset timer">↺</button>
        </div>
      `;

      card.querySelector(".timer-toggle-btn").addEventListener("click", () => {
        t.completed = false;
        t.running = !t.running;
        ensureTimerLoop();
        renderMultiTimerDock();
        updateActiveTimerBadge();
      });

      card.querySelector(".timer-plus-btn").addEventListener("click", () => {
        t.remainingSeconds += 60;
        t.totalSeconds = Math.max(t.totalSeconds, t.remainingSeconds);
        t.completed = false;
        renderMultiTimerDock();
      });

      card.querySelector(".timer-reset-btn").addEventListener("click", () => {
        t.running = false;
        t.completed = false;
        t.remainingSeconds = t.totalSeconds;
        renderMultiTimerDock();
        updateActiveTimerBadge();
      });

      dock.appendChild(card);
    });
  }

  function renderKitchenMode() {
    const r = state.activeKitchenRecipe;
    if (!r) return;

    document.getElementById("kitchenRecipeTitle").textContent = `${r.hero_emoji} ${r.title}`;
    document.getElementById("kitchenRecipeSubtitle").textContent = r.subtitle;
    document.getElementById("kitchenServingsBadge").textContent = `Scaled for ${r.servings}× Servings · Pantry Match ${r.pantry_match_pct}%`;

    const steps = r.steps || [];
    const idx = Math.max(0, Math.min(steps.length - 1, state.activeStepIndex));
    state.activeStepIndex = idx;
    const step = steps[idx] || { title: "Step", instruction: "", tip: "" };

    document.getElementById("kitchenStepCounter").textContent = `Step ${idx + 1} of ${steps.length}`;
    document.getElementById("kitchenActiveStepBadge").textContent = `STEP ${idx + 1}`;
    document.getElementById("kitchenActiveStepTitle").textContent = step.title;
    document.getElementById("kitchenActiveStepText").textContent = step.instruction;
    document.getElementById("kitchenActiveStepTip").innerHTML = `<strong>🔬 Chef Science Tip:</strong> ${step.tip}`;

    // Step dots
    const pillsWrap = document.getElementById("kitchenStepPills");
    pillsWrap.innerHTML = "";
    steps.forEach((s, sIdx) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `step-dot-btn ${sIdx === idx ? "active" : ""}`;
      b.textContent = `Step ${sIdx + 1}: ${s.title.split(" ").slice(0, 3).join(" ")}`;
      b.addEventListener("click", () => {
        state.activeStepIndex = sIdx;
        renderKitchenMode();
        if (state.autoNarrate) {
          speakStepAloud(steps[sIdx].instruction);
        }
      });
      pillsWrap.appendChild(b);
    });

    // Quick step timer triggers
    const stepTimersRow = document.getElementById("kitchenStepQuickTimerRow");
    stepTimersRow.innerHTML = "";
    state.timers
      .filter((t) => t.stepNumber === idx + 1)
      .forEach((t) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-accent btn-sm";
        btn.textContent = `⏱️ Start Step Timer: ${t.label}`;
        btn.addEventListener("click", () => {
          t.running = true;
          t.completed = false;
          ensureTimerLoop();
          renderMultiTimerDock();
          updateActiveTimerBadge();
          showToast(`⏱️ Started ${t.label}`);
        });
        stepTimersRow.appendChild(btn);
      });

    // Mise en Place checklist
    const checkWrap = document.getElementById("kitchenIngredientsChecklist");
    checkWrap.innerHTML = "";
    (r.ingredients_detail || []).forEach((ing) => {
      const item = document.createElement("div");
      item.className = "kitchen-ing-check";
      const subNote = ing.substitution && ing.status !== "in_pantry" ? ` (Sub: ${ing.substitution.label})` : "";
      item.innerHTML = `<span>⬜</span> <span><strong>${ing.emoji} ${ing.name}</strong> — ${ing.scaled_amount}${subNote}</span>`;
      item.addEventListener("click", () => {
        item.classList.toggle("checked");
        const box = item.querySelector("span");
        box.textContent = item.classList.contains("checked") ? "✅" : "⬜";
      });
      checkWrap.appendChild(item);
    });

    renderMultiTimerDock();
  }

  /* ==================== VIEW 4: SMART GROCERY LIST & MEAL-PREP PLANNER ==================== */
  function refreshGroceryBadge() {
    const b = document.getElementById("groceryCountBadge");
    if (b) b.textContent = String(state.mealPrepRecipeIds.size);
  }

  async function refreshGroceryList() {
    const checksWrap = document.getElementById("mealPrepRecipeChecks");
    if (checksWrap) {
      checksWrap.innerHTML = "";
      if (state.rankedRecipes.length === 0) {
        checksWrap.innerHTML = `<span class="helper-caption">Select ingredients in the Pantry Workbench first to populate matching meals, or click "+ Grocery Plan" on any recipe card.</span>`;
      } else {
        state.rankedRecipes.slice(0, 18).forEach((r) => {
          const checked = state.mealPrepRecipeIds.has(r.id);
          const row = document.createElement("label");
          row.className = "prep-recipe-row";
          row.innerHTML = `
            <input type="checkbox" ${checked ? "checked" : ""} data-rid="${r.id}" />
            <div>
              <strong>${r.hero_emoji} ${r.title}</strong>
              <div style="font-size:0.76rem;color:#5b635e;">Pantry Match ${r.pantry_match_pct}% · Uses ${r.matched_count} of your ingredients</div>
            </div>
          `;
          row.querySelector("input").addEventListener("change", (e) => {
            if (e.target.checked) state.mealPrepRecipeIds.add(r.id);
            else state.mealPrepRecipeIds.delete(r.id);
            refreshGroceryBadge();
            refreshGroceryList();
          });
          checksWrap.appendChild(row);
        });
      }
    }

    try {
      const resp = await fetch("/api/grocery-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe_ids: Array.from(state.mealPrepRecipeIds),
          pantry: state.pantry,
          servings: state.servings,
        }),
      });
      if (!resp.ok) return;
      const data = await resp.json();
      state.lastGroceryData = data;

      const banner = document.getElementById("groceryCostBanner");
      const aislesWrap = document.getElementById("groceryAislesContainer");

      banner.innerHTML = `
        <span>🛍️ <strong>${data.total_missing_count} Missing Item(s)</strong> across ${data.planned_recipes.length} planned meal(s) (${data.servings}× servings) — Estimated Supermarket Spend: <strong>$${data.total_estimated_cost.toFixed(2)}</strong></span>
      `;

      const aisles = data.aisles || {};
      const aisleKeys = Object.keys(aisles);
      if (aisleKeys.length === 0) {
        aislesWrap.innerHTML = `
          <div class="aisle-card">
            <h4>🎉 Zero Missing Groceries!</h4>
            <p style="margin:0;font-size:0.86rem;">${data.planned_recipes.length === 0 ? "Add one or more auto-populated recipes to your Grocery Plan to compute missing items by supermarket aisle." : "Your current fridge & active culinary chemistry substitutions cover 100% of your selected meals."}</p>
          </div>
        `;
      } else {
        aislesWrap.innerHTML = aisleKeys
          .map(
            (aisle) => `
            <div class="aisle-card">
              <h4>🏪 ${aisle}</h4>
              <div style="display:flex;flex-direction:column;gap:6px;">
                ${aisles[aisle]
                  .map(
                    (item) => `
                    <label style="display:flex;align-items:center;justify-content:space-between;font-size:0.84rem;cursor:pointer;">
                      <span><input type="checkbox" /> ${item.emoji} <strong>${item.name}</strong> (${item.scaled_amount})</span>
                      <span style="color:#5b635e;">~$${item.cost_est.toFixed(2)}</span>
                    </label>
                  `
                  )
                  .join("")}
              </div>
            </div>
          `
          )
          .join("");
      }
    } catch (_e) {
      // Ignore
    }
  }

  /* ==================== FRIDGE PHOTO SCANNER & CONFIRMATION MODAL ==================== */
  function openScannerModalWithResults(scanData, previewUrl) {
    const modal = document.getElementById("scannerModal");
    const engineBadge = document.getElementById("scannerEngineBadge");
    const previewImg = document.getElementById("scannerPreviewImg");
    const listWrap = document.getElementById("scannedItemsList");
    if (!modal || !listWrap) return;

    engineBadge.textContent = scanData.engine || "Smart Vision Scanner";
    if (previewUrl) {
      previewImg.src = previewUrl;
    }

    state.scannedCandidates = (scanData.detected || []).map((x) => ({
      ...x,
      included: true,
    }));

    listWrap.innerHTML = "";
    state.scannedCandidates.forEach((cand) => {
      const row = document.createElement("div");
      row.className = "scanned-item-row";
      row.innerHTML = `
        <label style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:0.88rem;cursor:pointer;">
          <input type="checkbox" checked />
          <span>${cand.emoji} ${cand.name}</span>
          <span style="font-size:0.74rem;color:#5b635e;font-weight:500;">(${cand.zone} · ${cand.confidence}% match)</span>
        </label>
        <select class="scanned-urgency-select" style="padding:4px 8px;border-radius:6px;border:1px solid #d5cab4;font-size:0.78rem;font-weight:700;">
          <option value="urgent" ${cand.urgency === "urgent" ? "selected" : ""}>🔥 Use Today!</option>
          <option value="soon" ${cand.urgency === "soon" ? "selected" : ""}>⏳ 2–3 Days</option>
          <option value="fresh" ${cand.urgency === "fresh" ? "selected" : ""}>🌿 Fresh</option>
        </select>
      `;
      row.querySelector("input").addEventListener("change", (e) => {
        cand.included = e.target.checked;
      });
      row.querySelector("select").addEventListener("change", (e) => {
        cand.urgency = e.target.value;
      });
      listWrap.appendChild(row);
    });

    modal.classList.remove("hidden");
  }

  async function triggerSampleFridgeScan() {
    try {
      const resp = await fetch("/api/fridge/scan-sample", { method: "POST" });
      if (!resp.ok) return;
      const data = await resp.json();
      openScannerModalWithResults(data, "/api/fridge/sample-photo.png");
    } catch (_e) {
      // Ignore
    }
  }

  async function handlePhotoUpload(file) {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    const localUrl = URL.createObjectURL(file);
    try {
      const resp = await fetch("/api/fridge/scan", {
        method: "POST",
        body: formData,
      });
      if (!resp.ok) return;
      const data = await resp.json();
      openScannerModalWithResults(data, localUrl);
    } catch (_e) {
      // Ignore
    }
  }

  /* ==================== INITIALIZATION ==================== */
  async function init() {
    // Wire Navigation Tabs
    document.querySelectorAll(".nav-tab").forEach((btn) => {
      btn.addEventListener("click", () => switchView(btn.dataset.view));
    });

    // Wire Search & Clear
    const searchInput = document.getElementById("ingredientSearchInput");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        state.searchQuery = e.target.value;
        renderIngredientChipGrid();
      });
    }

    document.getElementById("clearFridgeBtn")?.addEventListener("click", () => {
      state.pantry = [];
      state.activePresetId = "";
      renderPresets();
      renderFridgeAndPicker();
      rankRecipes();
      showToast("🧹 Cleared selected ingredients — canvas reset");
    });

    // Wire Portion Scaler (1x to 8x)
    document.querySelectorAll("#servingsButtonGroup .serving-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.servings = parseInt(btn.dataset.servings, 10) || 2;
        document.querySelectorAll("#servingsButtonGroup .serving-btn").forEach((b) => {
          b.classList.toggle("active", b === btn);
        });
        rankRecipes();
        showToast(`🍽️ Scaled recipes & fractions to ${state.servings}× servings`);
      });
    });

    // Wire Photo Scanner buttons & Modal
    document.getElementById("openScannerModalBtn")?.addEventListener("click", triggerSampleFridgeScan);
    document.getElementById("scanSamplePhotoBtn")?.addEventListener("click", triggerSampleFridgeScan);
    document.getElementById("fridgePhotoInput")?.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        handlePhotoUpload(e.target.files[0]);
      }
    });

    const closeModal = () => document.getElementById("scannerModal")?.classList.add("hidden");
    document.getElementById("closeScannerModalBtn")?.addEventListener("click", closeModal);
    document.getElementById("cancelScannerModalBtn")?.addEventListener("click", closeModal);
    document.getElementById("confirmScannedItemsBtn")?.addEventListener("click", () => {
      const existingMap = new Map(state.pantry.map((x) => [x.id, x.urgency]));
      let added = 0;
      state.scannedCandidates.forEach((c) => {
        if (c.included) {
          existingMap.set(c.id, c.urgency);
          added += 1;
        }
      });
      state.pantry = Array.from(existingMap.entries()).map(([id, urgency]) => ({ id, urgency }));
      closeModal();
      renderFridgeAndPicker();
      rankRecipes();
      showToast(`📸 Added ${added} spotted fridge item(s) — meals auto-populated!`);
    });

    // Wire Kitchen Mode controls
    document.getElementById("kitchenPrevStepBtn")?.addEventListener("click", () => {
      if (state.activeStepIndex > 0) {
        state.activeStepIndex -= 1;
        renderKitchenMode();
      }
    });
    document.getElementById("kitchenNextStepBtn")?.addEventListener("click", () => {
      if (state.activeKitchenRecipe && state.activeStepIndex < state.activeKitchenRecipe.steps.length - 1) {
        state.activeStepIndex += 1;
        renderKitchenMode();
      }
    });
    document.getElementById("kitchenReadStepBtn")?.addEventListener("click", () => {
      const r = state.activeKitchenRecipe;
      if (!r) return;
      const step = r.steps[state.activeStepIndex];
      if (step) speakStepAloud(`${step.title}. ${step.instruction}`);
    });
    document.getElementById("kitchenAutoVoiceBtn")?.addEventListener("click", (e) => {
      state.autoNarrate = !state.autoNarrate;
      e.currentTarget.setAttribute("aria-pressed", String(state.autoNarrate));
      e.currentTarget.textContent = `🎙️ Auto-Narrate: ${state.autoNarrate ? "On" : "Off"}`;
    });
    document.getElementById("kitchenTestChimeBtn")?.addEventListener("click", () => {
      playKitchenChime();
      showToast("🔔 Played synthesized Web Audio kitchen chime!");
    });

    document.querySelectorAll(".quick-timer-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sec = parseInt(btn.dataset.sec, 10) || 60;
        const mins = Math.round(sec / 60);
        state.timers.push({
          id: `custom-timer-${Date.now()}`,
          label: `Quick Timer (${mins} min)`,
          stepNumber: state.activeStepIndex + 1,
          totalSeconds: sec,
          remainingSeconds: sec,
          running: true,
          completed: false,
        });
        ensureTimerLoop();
        renderMultiTimerDock();
        updateActiveTimerBadge();
      });
    });

    // Wire Grocery List Export
    document.getElementById("copyGroceryBtn")?.addEventListener("click", () => {
      if (state.lastGroceryData && state.lastGroceryData.markdown) {
        navigator.clipboard?.writeText(state.lastGroceryData.markdown).catch(() => {});
        showToast("📋 Copied aisle-grouped Markdown grocery list!");
      }
    });
    document.getElementById("downloadGroceryBtn")?.addEventListener("click", () => {
      if (!state.lastGroceryData) return;
      const blob = new Blob([state.lastGroceryData.markdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "pantry-chef-grocery-list.md";
      a.click();
      URL.revokeObjectURL(url);
      showToast("⬇️ Downloaded pantry-chef-grocery-list.md");
    });

    // Wire Settings Form
    document.getElementById("settingsForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        provider: document.getElementById("settingProvider").value,
        ollama_host: document.getElementById("settingOllamaHost").value,
        ollama_model: "llama3.2:3b",
        ollama_vision_model: document.getElementById("settingOllamaVisionModel").value,
        openai_api_key: document.getElementById("settingOpenAIKey").value,
        gemini_api_key: document.getElementById("settingGeminiKey").value,
        default_servings: state.servings,
        voice_enabled: document.getElementById("settingVoiceEnabled").checked,
        chime_enabled: document.getElementById("settingChimeEnabled").checked,
      };
      state.settings.voice_enabled = payload.voice_enabled;
      state.settings.chime_enabled = payload.chime_enabled;
      const resp = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        const res = await resp.json();
        document.getElementById("settingsStatusText").textContent = `✅ Saved (${res.provider_status.message})`;
        showToast("⚙️ Settings saved!");
      }
    });

    // Fetch Catalog — Start with ZERO pre-selected ingredients & ZERO default meals!
    const catResp = await fetch("/api/catalog");
    if (catResp.ok) {
      state.catalog = await catResp.json();
      state.pantry = [];
      state.activePresetId = "";
      renderPresets();
      renderCategoryTabs();
      renderFilters();
      renderFridgeAndPicker();
      refreshGroceryBadge();
      await rankRecipes();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();

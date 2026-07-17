/* =========================================================
   THE HEX — Enchantments page
   Same chest-GUI look as hex.html (6x9), populated from the
   local enchant cache pulled from the NEU-REPO data via the
   shared Worker (see /worker and hex.js's loadItemData).
   ========================================================= */

const WORKER_BASE_URL = "https://dmg-calc-cache.mich536ael.workers.dev";
const PAGE_SIZE = 28; // 4 rows x 7 cols of interior slots

let itemData = { enchants: {} };
let currentBuild = null;
let enchantIds = [];
let page = 0;
let selectedEnchants = new Set();

/* ---------------- Load shared cache + selected weapon ---------------- */

async function loadItemData() {
  try {
    const res = await fetch(`${WORKER_BASE_URL}/api/items`);
    itemData = await res.json();
  } catch (err) {
    console.error("Failed to load item data:", err);
  }
  buildEnchantList();
  renderGrid();
}

function loadCurrentBuild() {
  const stored = localStorage.getItem('currentlyModifying');
  if (!stored) return;
  try {
    currentBuild = JSON.parse(stored);
  } catch (err) {
    console.error('Failed to parse saved weapon build:', err);
    currentBuild = null;
  }
}

function buildEnchantList() {
  const category = currentBuild && currentBuild.weapon && currentBuild.weapon.category;
  const byCategory = (itemData.enchants && itemData.enchants.enchants) || {};
  enchantIds = category && byCategory[category] ? byCategory[category] : [];

  const contextEl = document.getElementById('enchantsContext');
  const weaponName = currentBuild && currentBuild.weapon ? currentBuild.weapon.name : null;
  if (!weaponName) {
    contextEl.textContent = 'No weapon selected — go back and pick one to see applicable enchants.';
  } else if (enchantIds.length === 0) {
    contextEl.textContent = `Enchanting: ${weaponName} — no cached enchant data for category "${category}".`;
  } else {
    contextEl.textContent = `Enchanting: ${weaponName} (${enchantIds.length} enchants available)`;
  }
}

function titleCaseId(id) {
  return id
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// NEU-REPO has no per-enchant lore/description text (only per-item lore) —
// the tooltip is limited to what's actually available: name + XP-per-level
// costs. Some category-list ids are legacy names; enchant_mapping_item/
// enchant_mapping_id translate those to the id used in enchants_xp_cost.
function getEnchantXpCosts(id) {
  const enchants = itemData.enchants || {};
  const xpCostMap = enchants.enchants_xp_cost || {};
  const key = id.toLowerCase();
  if (xpCostMap[key]) return xpCostMap[key];

  // enchant_mapping_id/enchant_mapping_item are parallel arrays pairing
  // legacy/internal enchant ids with their current name — the pairing
  // isn't consistently ordered (old->new either way), so check both.
  const mapItem = enchants.enchant_mapping_item || [];
  const mapId = enchants.enchant_mapping_id || [];
  for (let i = 0; i < mapId.length; i++) {
    if (mapId[i].toLowerCase() === key && xpCostMap[mapItem[i].toLowerCase()]) {
      return xpCostMap[mapItem[i].toLowerCase()];
    }
    if (mapItem[i].toLowerCase() === key && xpCostMap[mapId[i].toLowerCase()]) {
      return xpCostMap[mapId[i].toLowerCase()];
    }
  }

  return null;
}

function showEnchantTooltip(id, anchorEl) {
  const displayName = titleCaseId(id);
  const costs = getEnchantXpCosts(id);

  let html = `<div style="color:${MC_COLORS.b}; font-weight:bold;">${escapeHtml(displayName)}</div>`;
  html += '<div>&nbsp;</div>';
  if (costs && costs.length) {
    html += `<div><span style="color:${MC_COLORS[7]}">Max Level: </span><span style="color:${MC_COLORS.f}">${costs.length}</span></div>`;
    costs.forEach((xp, i) => {
      html += `<div><span style="color:${MC_COLORS[7]}">Level ${i + 1}: </span><span style="color:${MC_COLORS.a}">${xp} XP</span></div>`;
    });
  } else {
    html += `<div><span style="color:${MC_COLORS[7]}">No cost data available.</span></div>`;
  }

  showTooltipHTML(html, anchorEl);
}

/* ---------------- GUI grid (6 rows x 9 cols, matching hex.html) ---------------- */

function handleEnchantClick(id, el) {
  if (selectedEnchants.has(id)) {
    selectedEnchants.delete(id);
    el.classList.remove('selected');
  } else {
    selectedEnchants.add(id);
    el.classList.add('selected');
  }
  console.log(`[The Hex] Enchant "${id}" ${selectedEnchants.has(id) ? 'selected' : 'deselected'} — not yet applied to build.`);
}

function totalPages() {
  return Math.max(1, Math.ceil(enchantIds.length / PAGE_SIZE));
}

function renderGrid() {
  const grid = document.getElementById("enchantsGrid");
  grid.innerHTML = "";

  const pageIds = enchantIds.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  let pageIndex = 0;

  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 9; col++) {
      const el = document.createElement("div");

      const isInteriorRow = row >= 1 && row <= 4;
      const isInteriorCol = col >= 1 && col <= 7;
      const isNavRow = row === 5;

      if (isInteriorRow && isInteriorCol) {
        const id = pageIds[pageIndex];
        pageIndex++;
        if (id) {
          el.classList.add("slot", "enchant");
          el.textContent = "📗";
          if (selectedEnchants.has(id)) el.classList.add("selected");
          el.addEventListener("click", () => handleEnchantClick(id, el));
          el.addEventListener("mouseenter", () => showEnchantTooltip(id, el));
          el.addEventListener("mouseleave", hideTooltip);
        } else {
          el.classList.add("slot", "empty");
        }
      } else if (isInteriorRow && !isInteriorCol) {
        el.classList.add("slot", "filler");
      } else if (isNavRow && col === 3) {
        el.classList.add("slot", "barrier");
        el.textContent = "◀";
        el.title = "Previous Page";
        el.addEventListener("click", () => {
          if (page > 0) { page--; renderGrid(); }
        });
      } else if (isNavRow && col === 4) {
        el.classList.add("slot", "barrier");
        el.textContent = "⛔";
        el.title = "Close";
        el.addEventListener("click", () => { window.location.href = "hex.html"; });
      } else if (isNavRow && col === 5) {
        el.classList.add("slot", "barrier");
        el.textContent = "▶";
        el.title = "Next Page";
        el.addEventListener("click", () => {
          if (page < totalPages() - 1) { page++; renderGrid(); }
        });
      } else {
        el.classList.add("slot", "empty");
      }

      grid.appendChild(el);
    }
  }
}

loadCurrentBuild();
loadItemData();

/* =========================================================
   THE HEX — data layer + GUI skeleton
   Weapons/armor/enchants come from a shared Cloudflare Worker
   cache (see /worker), sourced entirely from NEU-REPO — one
   fetch serves every visitor instead of each client hitting
   GitHub directly.
   ========================================================= */

const WORKER_BASE_URL = "https://dmg-calc-cache.mich536ael.workers.dev";

let itemData = { weapons: [], armor: [], enchants: {}, lastFetched: null };

/* ---------------- Fetch from shared cache ---------------- */

async function loadItemData() {
  setStatus("Loading...");
  try {
    const res = await fetch(`${WORKER_BASE_URL}/api/items`);
    itemData = await res.json();
    reportStatus();
  } catch (err) {
    console.error("Failed to load item data:", err);
    setStatus("Item data: fetch failed (see console)");
  }
}

async function forceRefresh() {
  setStatus("Refreshing...");
  try {
    const res = await fetch(`${WORKER_BASE_URL}/api/refresh`, { method: "POST" });
    itemData = await res.json();
    reportStatus();
  } catch (err) {
    console.error("Failed to refresh item data:", err);
    setStatus("Item data: refresh failed (see console)");
  }
}

function reportStatus() {
  const { weapons, armor, lastFetched } = itemData;
  const date = lastFetched ? new Date(lastFetched).toLocaleString() : "unknown";
  setStatus(`Item data: from shared cache, ${date} (${weapons.length} weapons, ${armor.length} armor)`);
}

function setStatus(text) {
  document.getElementById("statusText").textContent = text;
}

document.getElementById("refreshBtn").addEventListener("click", forceRefresh);
loadItemData();

/* ---------------- Selected weapon (handed off from index.html) ---------------- */

let currentBuild = null;

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

// Inline SVG fallback so a broken icon never depends on a third-party host.
const FALLBACK_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' fill='%23707070'/%3E%3Ctext x='12' y='17' font-size='14' text-anchor='middle' fill='%23ddd'%3E%3F%3C/text%3E%3C/svg%3E";

// Minecraft's item ids occasionally diverge from our icon file names
// (e.g. the shovel item id is historically "SPADE"); map known cases here.
const MATERIAL_ALIASES = { SPADE: 'SHOVEL' };

// Same Title_Case mapping used by weapons.js (local icons are e.g. "Diamond_Sword.png").
function getWeaponIcon(material) {
  if (!material) return 'images/default.png';
  const normalized = material
    .toUpperCase()
    .split('_')
    .map((part) => MATERIAL_ALIASES[part] || part)
    .join('_');
  const titleCased = normalized
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('_');
  return `images/${titleCased}.png`;
}

/* ---------------- Item tooltip ----------------
   Renders the item's real NEU-REPO lore verbatim (see mc-tooltip.js) —
   no reconstructed/guessed stat lines, just the actual game text.
   ------------------------------------------------------- */

function showWeaponTooltip(weapon, anchorEl) {
  const header = `<div style="color:${rarityHex(weapon.tier)}; font-weight:bold;">${escapeHtml(weapon.name)}</div>`;
  showTooltipHTML(header + renderLoreHTML(weapon.lore), anchorEl);
}

/* ---------------- GUI grid ---------------- */

// Dummy handler for every interactive slot — no real behavior yet.
function handleSlotClick(label) {
  console.log(`[The Hex] "${label}" clicked — not yet implemented.`);
}

// 6 rows x 9 columns, matching the reference screenshot.
// type: "empty" | "filler" | "weapon" | "icon" | "barrier"
const GRID_LAYOUT = [
  ["empty","empty","empty","empty","empty","empty","empty","empty","empty"],
  ["empty","empty","empty","filler","filler","filler","icon:📖:Enchantments","icon:📝:Ultimate Enchantments","icon:💎:Gemstones"],
  ["empty","empty","empty","filler","weapon","filler","icon:📔:Books","icon:🗳:Modifiers","empty"],
  ["empty","empty","empty","filler","filler","filler","icon:🔷:Reforges","icon:🔥:Item Upgrades","empty"],
  ["empty","empty","empty","empty","empty","empty","empty","empty","empty"],
  ["empty","empty","empty","empty","barrier:⛔:Close","empty","empty","empty","empty"]
];

function renderGrid() {
  const grid = document.getElementById("hexGrid");
  grid.innerHTML = "";

  GRID_LAYOUT.forEach(row => {
    row.forEach(cellDef => {
      const [type, glyph, label] = cellDef.split(":");
      const el = document.createElement("div");
      el.classList.add("slot", type);

      if (type === "weapon") {
        const weapon = currentBuild && currentBuild.weapon;
        if (weapon) {
          const img = document.createElement("img");
          img.className = "weapon-slot-icon";
          img.src = getWeaponIcon(weapon.material);
          img.alt = weapon.name;
          img.onerror = () => { img.onerror = null; img.src = FALLBACK_ICON; };
          el.appendChild(img);
          el.addEventListener("mouseenter", () => showWeaponTooltip(weapon, el));
          el.addEventListener("mouseleave", hideTooltip);
        } else {
          el.textContent = "⚔️";
          el.title = "No weapon selected — click to choose one";
        }
        el.addEventListener("click", () => { window.location.href = "index.html"; });
      } else if (type === "icon") {
        el.textContent = glyph;
        el.title = label;
        if (label === "Enchantments") {
          el.addEventListener("click", () => { window.location.href = "enchants.html"; });
        } else {
          el.addEventListener("click", () => handleSlotClick(label));
        }
      } else if (type === "barrier") {
        el.textContent = glyph;
        el.title = label;
        el.addEventListener("click", () => { window.location.href = "index.html"; });
      }

      grid.appendChild(el);
    });
  });
}

loadCurrentBuild();
renderGrid();
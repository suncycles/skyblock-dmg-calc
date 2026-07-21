/* =========================================================
   THE HEX — shared cache Worker
   Single source of truth for weapons/armor/enchants data, all
   sourced from NotEnoughUpdates-REPO (community-maintained,
   MIT licensed) — no Hypixel API usage.

   Weapons/armor/equipment (Necklace/Cloak/Belt/Gloves)/pet
   items are NOT fetched live: NEU-REPO's item catalog has no
   structured rarity/category field (only the last line of
   each item's `lore`, e.g. "§6§lLEGENDARY SWORD"), and it's
   8000+ individual files — well past what a single Worker
   invocation's subrequest/CPU budget can parse. Those are
   pre-parsed offline by scripts/build-item-data.mjs into
   src/data/{weapons,armor,equipment,petItems}.json and
   bundled at deploy time; re-run that script + redeploy to
   pick up NEU-REPO updates. (Pet items used to be a hardcoded
   ~34-id list fetched live here instead — it turned out to
   silently cover barely half of the real ones, since it was
   sourced from constants/pets.json's own incomplete
   pet_item_display_name_to_id map; scanning the full catalog
   like everything else here finds all of them.)

   Enchant and reforge data are small (one file each) and still fetched
   live here.

   Routes:
     GET  /api/items    -> returns cached data, refreshing first if stale
     POST /api/refresh  -> forces a refetch regardless of staleness

   Requires a KV namespace bound as CACHE (see wrangler.toml).
   ========================================================= */

import weapons from "./data/weapons.json";
import armor from "./data/armor.json";
import equipment from "./data/equipment.json";
import petItems from "./data/petItems.json";

// Community-maintained source (not the official Hypixel API) —
// the wiki has no API and blocks scraping.
const NEU_ENCHANTS_URL = "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants/enchants.json";

// Two files, both keyed differently but describing two genuinely distinct
// in-game mechanics: reforges.json is the ~50 "free" reforges the
// blacksmith NPC can roll (no item needed), keyed directly by reforge
// name. reforgestones.json is the larger set (~81) that instead need a
// specific physical reforge-stone item (drops/shop purchases, e.g. Dragon
// Claw -> "Fabled", Wither Blood -> "Withered") applied directly to the
// item — kept as its own map (reforgeStones) rather than merged into the
// same list, matching the real game's UI split and this project's
// Reforges page having a separate "reforge stones" sub-screen for them.
const NEU_REFORGES_URL = "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants/reforges.json";
const NEU_REFORGESTONES_URL = "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants/reforgestones.json";

// Per-pet, per-rarity stat table (level 1 and level 100 checkpoints —
// the frontend interpolates in between, see frontend/src/lib/petData.js).
// Small single file, fetched live like enchants/reforges rather than
// needing offline preprocessing.
const NEU_PETNUMS_URL = "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants/petnums.json";

const CACHE_KEY = "hex_data";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — adjust as needed

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/items" && request.method === "GET") {
      return handleGetItems(env);
    }

    if (url.pathname === "/api/refresh" && request.method === "POST") {
      return handleRefresh(env);
    }

    return jsonResponse({ error: "Not found" }, 404);
  }
};

async function handleGetItems(env) {
  const cached = await env.CACHE.get(CACHE_KEY, "json");

  if (cached && Date.now() - cached.lastFetched < CACHE_TTL_MS) {
    return jsonResponse(cached);
  }

  try {
    const fresh = await buildFreshData();
    await env.CACHE.put(CACHE_KEY, JSON.stringify(fresh));
    return jsonResponse(fresh);
  } catch (err) {
    // If a refetch fails but we have stale data, serve it rather than nothing.
    if (cached) return jsonResponse(cached);
    return jsonResponse({ error: "Failed to fetch item data", detail: String(err) }, 502);
  }
}

async function handleRefresh(env) {
  try {
    const fresh = await buildFreshData();
    await env.CACHE.put(CACHE_KEY, JSON.stringify(fresh));
    return jsonResponse(fresh);
  } catch (err) {
    return jsonResponse({ error: "Failed to refresh item data", detail: String(err) }, 502);
  }
}

async function buildFreshData() {
  const enchantsRes = await fetch(NEU_ENCHANTS_URL);
  const enchants = await enchantsRes.json();
  const [reforges, reforgeStones, pets] = await Promise.all([
    fetchReforges(),
    fetchReforgeStones(),
    fetchPetNums(),
  ]);

  return { weapons, armor, equipment, enchants, reforges, reforgeStones, pets, petItems, lastFetched: Date.now() };
}

async function fetchPetNums() {
  const res = await fetch(NEU_PETNUMS_URL);
  return res.json();
}

async function fetchReforges() {
  const res = await fetch(NEU_REFORGES_URL);
  return res.json();
}

// reforgestones.json is keyed by the stone item's own id (e.g.
// "DRAGON_CLAW"), not the reforge name it grants — re-keyed by
// reforgeName here (dropping the cost/ability/reforgeType fields the
// frontend doesn't need, but keeping stoneId so it can look up that
// item's own icon, e.g. /images/reforgestones/dragon_claw.png) so it has
// the same {name: {itemTypes, requiredRarities, reforgeStats}} shape as
// the free-reforges map plus one extra field. No two stones grant the
// same reforgeName (verified against a snapshot).
async function fetchReforgeStones() {
  const res = await fetch(NEU_REFORGESTONES_URL);
  const stones = await res.json();

  const byName = {};
  for (const stone of Object.values(stones)) {
    if (!stone.reforgeName) continue;
    byName[stone.reforgeName] = {
      stoneId: stone.internalName,
      itemTypes: stone.itemTypes,
      requiredRarities: stone.requiredRarities,
      reforgeStats: stone.reforgeStats,
    };
  }
  return byName;
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS
    }
  });
}
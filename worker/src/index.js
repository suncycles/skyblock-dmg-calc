/* =========================================================
   THE HEX — shared cache Worker
   Single source of truth for weapons/armor/pets/enchants data.
   All clients hit this Worker instead of calling Hypixel/GitHub
   directly, so the fetch+parse happens once per TTL window,
   not once per visitor.

   Routes:
     GET  /api/items    -> returns cached data, refreshing first if stale
     POST /api/refresh  -> forces a refetch regardless of staleness

   Requires a KV namespace bound as CACHE (see wrangler.toml).
   ========================================================= */

const HYPIXEL_ITEMS_URL = "https://api.hypixel.net/v2/resources/skyblock/items";
// Community-maintained source (not the official Hypixel API) —
// the wiki has no API and blocks scraping.
const NEU_ENCHANTS_URL = "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants/enchants.json";

const WEAPON_CATEGORIES = ["SWORD", "BOW", "LONGSWORD", "WAND"];
const ARMOR_CATEGORIES = ["HELMET", "CHESTPLATE", "LEGGINGS", "BOOTS"];

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
  const [itemsRes, enchantsRes] = await Promise.all([
    fetch(HYPIXEL_ITEMS_URL),
    fetch(NEU_ENCHANTS_URL)
  ]);

  const itemsData = await itemsRes.json();
  const enchants = await enchantsRes.json();
  const items = itemsData.items || [];

  const weapons = items.filter(i => WEAPON_CATEGORIES.includes(i.category));
  const armor = items.filter(i => ARMOR_CATEGORIES.includes(i.category));
  const pets = items.filter(i => i.category === "PET");

  return { weapons, armor, pets, enchants, lastFetched: Date.now() };
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
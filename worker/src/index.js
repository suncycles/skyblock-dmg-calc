/* =========================================================
   THE HEX — shared cache Worker
   Single source of truth for weapons/armor/enchants data, all
   sourced from NotEnoughUpdates-REPO (community-maintained,
   MIT licensed) — no Hypixel API usage.

   Weapons/armor are NOT fetched live: NEU-REPO's item catalog
   has no structured rarity/category field (only the last line
   of each item's `lore`, e.g. "§6§lLEGENDARY SWORD"), and it's
   8000+ individual files — well past what a single Worker
   invocation's subrequest/CPU budget can parse. Those are
   pre-parsed offline by scripts/build-item-data.mjs into
   src/data/{weapons,armor}.json and bundled at deploy time;
   re-run that script + redeploy to pick up NEU-REPO updates.

   Enchant data is small (one file) and still fetched live here.

   Routes:
     GET  /api/items    -> returns cached data, refreshing first if stale
     POST /api/refresh  -> forces a refetch regardless of staleness

   Requires a KV namespace bound as CACHE (see wrangler.toml).
   ========================================================= */

import weapons from "./data/weapons.json";
import armor from "./data/armor.json";

// Community-maintained source (not the official Hypixel API) —
// the wiki has no API and blocks scraping.
const NEU_ENCHANTS_URL = "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants/enchants.json";

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

  return { weapons, armor, enchants, lastFetched: Date.now() };
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
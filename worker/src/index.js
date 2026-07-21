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

   Enchant and reforge data are small (one file each) and still fetched
   live here.

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
const NEU_ITEMS_BASE = "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/items";

// Pet items — the held item a pet can equip for a stat/XP boost. Unlike
// weapons/armor (8000+ files, needs offline preprocessing) this is a
// small fixed set, so it's just hardcoded and fetched live like
// everything else here. Sourced from constants/pets.json's
// `pet_item_display_name_to_id` map; the 3 "*_DROP" ids omitted below are
// crafting-ingredient "cores" ("Used to craft the Tier Boost pet item"),
// not real equippable items.
const PET_ITEM_IDS = [
  "PET_ITEM_QUICK_CLAW",
  "PET_ITEM_TIER_BOOST",
  "PET_ITEM_COMBAT_SKILL_BOOST_EPIC",
  "PET_ITEM_COMBAT_SKILL_BOOST_RARE",
  "PET_ITEM_COMBAT_SKILL_BOOST_UNCOMMON",
  "PET_ITEM_COMBAT_SKILL_BOOST_COMMON",
  "PET_ITEM_BUBBLEGUM",
  "PET_ITEM_EXP_SHARE",
  "ALL_SKILLS_SUPER_BOOST",
  "PET_ITEM_ALL_SKILLS_BOOST_COMMON",
  "PET_ITEM_LUCKY_CLOVER",
  "PET_ITEM_FORAGING_SKILL_BOOST_EPIC",
  "PET_ITEM_FORAGING_SKILL_BOOST_COMMON",
  "PET_ITEM_FISHING_SKILL_BOOST_EPIC",
  "PET_ITEM_FISHING_SKILL_BOOST_RARE",
  "PET_ITEM_FISHING_SKILL_BOOST_UNCOMMON",
  "PET_ITEM_FISHING_SKILL_BOOST_COMMON",
  "PET_ITEM_FARMING_SKILL_BOOST_EPIC",
  "PET_ITEM_FARMING_SKILL_BOOST_RARE",
  "PET_ITEM_FARMING_SKILL_BOOST_UNCOMMON",
  "PET_ITEM_FARMING_SKILL_BOOST_COMMON",
  "PET_ITEM_HARDENED_SCALES_UNCOMMON",
  "PET_ITEM_TEXTBOOK",
  "PET_ITEM_IRON_CLAWS_COMMON",
  "PET_ITEM_BIG_TEETH_COMMON",
  "PET_ITEM_FLYING_PIG",
  "PET_ITEM_SADDLE",
  "PET_ITEM_SPOOKY_CUPCAKE",
  "PET_ITEM_MINING_SKILL_BOOST_RARE",
  "PET_ITEM_MINING_SKILL_BOOST_UNCOMMON",
  "PET_ITEM_MINING_SKILL_BOOST_COMMON",
  "PET_ITEM_TITANIUM_MINECART",
  "PET_ITEM_BINGO_BOOSTER",
  "PET_ITEM_SHARPENED_CLAWS_UNCOMMON",
];

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
  const [reforges, reforgeStones, pets, petItems] = await Promise.all([
    fetchReforges(),
    fetchReforgeStones(),
    fetchPetNums(),
    fetchPetItems(),
  ]);

  return { weapons, armor, enchants, reforges, reforgeStones, pets, petItems, lastFetched: Date.now() };
}

async function fetchPetNums() {
  const res = await fetch(NEU_PETNUMS_URL);
  return res.json();
}

function stripColorCodes(str) {
  return str.replace(/§./g, "");
}

// Pet items follow the same "<TIER> PET ITEM" lore-tag convention every
// other item in this project already gets tier-parsed from (see
// worker/scripts/build-item-data.mjs's parseTierAndCategory) — simplified
// here since the category half is always literally "PET ITEM".
function parsePetItemTier(lore) {
  for (let i = lore.length - 1; i >= 0; i--) {
    const plain = stripColorCodes(lore[i]).trim().toUpperCase();
    if (!plain) continue;
    if (!plain.endsWith("PET ITEM")) return null;
    return plain.slice(0, -"PET ITEM".length).trim().replace(/ /g, "_") || null;
  }
  return null;
}

function materialFromItemId(itemid) {
  if (!itemid) return null;
  return itemid.replace(/^[a-z0-9_]+:/, "").toUpperCase();
}

async function fetchPetItems() {
  const results = await Promise.all(
    PET_ITEM_IDS.map(async (id) => {
      try {
        const res = await fetch(`${NEU_ITEMS_BASE}/${id}.json`);
        if (!res.ok) return null;
        const data = await res.json();
        if (!Array.isArray(data.lore) || data.lore.length === 0) return null;
        const tier = parsePetItemTier(data.lore);
        if (!tier) return null;
        return {
          id: data.internalname,
          name: stripColorCodes(data.displayname || data.internalname || ""),
          material: materialFromItemId(data.itemid),
          tier,
          lore: data.lore,
        };
      } catch {
        return null;
      }
    }),
  );
  return results.filter(Boolean);
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
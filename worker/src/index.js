/* SKYDMG — shared cache Worker. Single source of truth for weapons/armor/enchants data, sourced
   from NotEnoughUpdates-REPO, plus a thin Hypixel API proxy for the "import my current gear"
   feature (the only place this project talks to the real Hypixel API — everything under
   /api/items is still NEU-REPO only).

   Weapons/armor/equipment/pet items are pre-parsed offline by scripts/build-item-data.mjs into
   src/data/{weapons,armor,equipment,petItems}.json and bundled at deploy time; re-run + redeploy
   to pick up NEU-REPO updates. Enchant and reforge data are small and fetched live here instead.
   Real coin prices (see `costs` in the response, resolveCosts()) are a separate, much
   shorter-lived cache layered on top — sourced from SkyHelperBot/Prices' community-maintained
   pricesV2.json, refreshed independently of the 6h item-catalog TTL below.

   Routes:
     GET  /api/items            -> returns cached data (+ real coin costs), refreshing first if stale
     POST /api/refresh          -> forces a refetch regardless of staleness
     GET  /api/hypixel/import   -> resolves ?username, fetches their SkyBlock profile(s), decodes
                                    currently-worn armor/equipment/pet plus every weapon candidate
                                    found across Inventory/Ender Chest/Backpacks and every
                                    non-empty Wardrobe armor/equipment set (the frontend lets the
                                    user pick), plus computed pet level, attribute levels, Wolf
                                    Slayer level, Alchemy/Enchanting level, and selected Accessory
                                    Power from the Hypixel API (see handleHypixelImport). Needs
                                    env.HYPIXEL_API_KEY.
     POST /api/loadout          -> stores a frontend-encoded loadout blob (see
                                    frontend/src/lib/loadoutCode.js) under a short random id,
                                    returns { id } — lets share links be a handful of characters
                                    instead of embedding the whole compressed build in the URL.
     GET  /api/loadout/:id      -> resolves a short id minted above back to { code }.

   Requires a KV namespace bound as CACHE (see wrangler.toml). */

import weapons from "./data/weapons.json";
import armor from "./data/armor.json";
import equipment from "./data/equipment.json";
import petItems from "./data/petItems.json";
import powerStones from "./data/powerStones.json";
import accessories from "./data/accessories.json";
import accessoryFamilies from "./data/accessoryFamilies.json";
import { decodeInventoryB64, extractItemSummary } from "./nbt.js";

const NEU_ENCHANTS_URL = "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants/enchants.json";

// reforges.json: the ~50 free reforges the blacksmith NPC can roll, keyed by name.
// reforgestones.json: the ~81 that need a specific physical reforge-stone item, kept as its own map.
const NEU_REFORGES_URL = "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants/reforges.json";
const NEU_REFORGESTONES_URL = "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants/reforgestones.json";

// Per-pet, per-rarity stat table (level 1/100 checkpoints — frontend interpolates in between).
const NEU_PETNUMS_URL = "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants/petnums.json";

// Attribute shard rarity/threshold table and skill XP-per-level costs — only needed for the
// Hypixel import's stacks->level / xp->level conversions, fetched live per-request rather than
// folded into the main KV-cached blob (small files, low-traffic route).
const NEU_ATTRIBUTE_SHARDS_URL = "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants/attribute_shards.json";
const NEU_LEVELING_URL = "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants/leveling.json";
// Hypixel's own live skill-cap source (public, no key) — NEU-REPO's leveling.json's own
// leveling_caps object has drifted stale against real game updates (confirmed live 2026-08-25:
// it still reports Farming/Foraging/Taming capped at 50, while Hypixel's own resource reports
// their real current caps of 60/57/60 — Taming's stale "50" was the reported bug). Used only for
// each skill's real max level; leveling.json's leveling_xp per-level cost table is still the XP
// curve source (already verified to have 60 entries, enough for every current real cap).
const HYPIXEL_SKILLS_URL = "https://api.hypixel.net/v2/resources/skyblock/skills";

const CACHE_KEY = "hex_data";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Real coin prices — a separate, much-shorter-lived cache than the item catalog above: prices
// move constantly, catalog data (stats/lore) doesn't. Community-maintained, refreshed by an
// automated bot roughly every 15 min (verified against its commit history); 20 min keeps us under
// that with a small margin without hammering it every request.
const SKYHELPER_PRICES_URL = "https://raw.githubusercontent.com/SkyHelperBot/Prices/main/pricesV2.json";
const PRICES_CACHE_KEY = "prices_data";
const PRICES_CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes

// Ids the client looks up directly from `costs.itemPrices` (see frontend/src/lib/pricing.js and
// accessoryOptimizer.js's lookupAccessoryCost) that don't come from any catalog list below.
const PRICED_EXTRA_IDS = [
  "CROWN_OF_AVARICE",
  "RECOMBOBULATOR_3000",
  "PERFECT_AMBER_GEM", "PERFECT_AMETHYST_GEM", "PERFECT_AQUAMARINE_GEM", "PERFECT_CITRINE_GEM",
  "PERFECT_JADE_GEM", "PERFECT_JASPER_GEM", "PERFECT_ONYX_GEM", "PERFECT_OPAL_GEM",
  "PERFECT_PERIDOT_GEM", "PERFECT_RUBY_GEM", "PERFECT_SAPPHIRE_GEM", "PERFECT_TOPAZ_GEM",
];

// The 6 real combat gemstones (frontend/src/lib/gemstoneData.js's GEMSTONE_IDS) x 5 real tiers
// (GEMSTONE_TIERS) — optimizer.js's evaluateGemstoneCandidates brute-forces every one of these 30
// combos per socket, so pricing.js needs a real cost for each, not just the Perfect tier above
// (which accessoryOptimizer.js uses for an unrelated "cheapest floor" estimate).
const GEM_TYPES = ["RUBY", "JASPER", "SAPPHIRE", "AMETHYST", "ONYX", "OPAL"];
const GEM_TIERS = ["ROUGH", "FLAWED", "FINE", "FLAWLESS", "PERFECT"];

// The raw SkyHelper price map has ~14K entries covering the whole Bazaar/AH; the app only ever
// looks up a few hundred of them (real gear/pet/enchant ids). Shipping the full map to every
// client cost ~860KB of the ~2MB /api/items payload for prices nothing here will ever read —
// prune to just the ids `pricing.js`/`accessoryOptimizer.js` can actually ask for before it's
// cached/returned. Enchant book prices (`ENCHANTMENT_<name>_<level>`) are kept wholesale since
// there's no static list of valid id/level combos to allowlist against server-side.
function pruneItemPrices(itemPrices, catalog) {
  const keep = new Set(PRICED_EXTRA_IDS);
  for (const item of [...catalog.weapons, ...catalog.armor, ...catalog.equipment, ...catalog.petItems, ...catalog.accessories, ...catalog.powerStones]) {
    if (item.id) keep.add(item.id);
  }
  for (const tier of GEM_TIERS) {
    for (const gem of GEM_TYPES) keep.add(`${tier}_${gem}_GEM`);
  }
  const pruned = {};
  for (const [id, price] of Object.entries(itemPrices)) {
    if (keep.has(id) || id.startsWith("ENCHANTMENT_")) pruned[id] = price;
  }
  return pruned;
}

// Golden/Jade/Rose Dragon are the only pets that level past 100 (real cap 200) — same table as
// frontend/src/lib/petData.js's EXTENDED_MAX_LEVELS, duplicated here since the Worker and frontend
// are separate deploys with no shared module today. Used only to build the right
// LVL_{100|200}_{TIER}_{PETID} price key below.
const EXTENDED_PET_MAX_LEVELS = { GOLDEN_DRAGON: 200, JADE_DRAGON: 200, ROSE_DRAGON: 200 };

// Short-link storage for /api/loadout — namespaced within the same CACHE KV so it can't collide
// with the single fixed CACHE_KEY the item-data cache uses.
const LOADOUT_KEY_PREFIX = "loadout:";
const LOADOUT_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const LOADOUT_ID_LENGTH = 8;
const MAX_LOADOUT_CODE_LENGTH = 20000; // generous headroom over any real encoded build, blocks abuse

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

    if (url.pathname === "/api/hypixel/import" && request.method === "GET") {
      return handleHypixelImport(url, env);
    }

    if (url.pathname === "/api/loadout" && request.method === "POST") {
      return handleCreateLoadoutLink(request, env);
    }

    if (url.pathname.startsWith("/api/loadout/") && request.method === "GET") {
      return handleGetLoadoutLink(url, env);
    }

    return jsonResponse({ error: "Not found" }, 404);
  }
};

// 30 minutes: short enough that a POST /api/refresh (see CLAUDE.md) is reflected for new tabs
// well within the KV's own 6h CACHE_TTL_MS, long enough to skip re-downloading this ~728KB
// payload on every hard reload/new tab within a browsing session.
const ITEMS_RESPONSE_CACHE_HEADERS = { "Cache-Control": "public, max-age=1800" };

async function handleGetItems(env) {
  const cached = await env.CACHE.get(CACHE_KEY, "json");

  if (cached && Date.now() - cached.lastFetched < CACHE_TTL_MS) {
    const costs = await resolveCosts(env, cached);
    return jsonResponse({ ...cached, costs }, 200, ITEMS_RESPONSE_CACHE_HEADERS);
  }

  try {
    const fresh = await buildFreshData();
    await env.CACHE.put(CACHE_KEY, JSON.stringify(fresh));
    const costs = await resolveCosts(env, fresh);
    return jsonResponse({ ...fresh, costs }, 200, ITEMS_RESPONSE_CACHE_HEADERS);
  } catch (err) {
    console.error("handleGetItems: buildFreshData failed:", err);
    if (cached) {
      const costs = await resolveCosts(env, cached);
      return jsonResponse({ ...cached, costs }, 200, ITEMS_RESPONSE_CACHE_HEADERS);
    }
    return jsonResponse({ error: "Failed to fetch item data", detail: String(err) }, 502);
  }
}

async function handleRefresh(env) {
  try {
    const fresh = await buildFreshData();
    await env.CACHE.put(CACHE_KEY, JSON.stringify(fresh));
    const costs = await resolveCosts(env, fresh, true);
    return jsonResponse({ ...fresh, costs });
  } catch (err) {
    console.error("handleRefresh: buildFreshData failed:", err);
    return jsonResponse({ error: "Failed to refresh item data", detail: String(err) }, 502);
  }
}

// Mints an id and retries on the (astronomically unlikely) chance it's already taken —
// 8 chars from a 62-char alphabet is ~218 trillion combinations, so this should basically never
// loop more than once, but a check-and-retry is cheap insurance against a stored blob getting
// silently overwritten by an id collision.
async function handleCreateLoadoutLink(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!code) return jsonResponse({ error: "Missing code" }, 400);
  if (code.length > MAX_LOADOUT_CODE_LENGTH) return jsonResponse({ error: "Loadout too large" }, 413);

  for (let attempt = 0; attempt < 5; attempt++) {
    const id = randomLoadoutId();
    const existing = await env.CACHE.get(LOADOUT_KEY_PREFIX + id);
    if (existing) continue;
    await env.CACHE.put(LOADOUT_KEY_PREFIX + id, code);
    return jsonResponse({ id });
  }
  return jsonResponse({ error: "Could not allocate a short id, try again" }, 500);
}

function randomLoadoutId() {
  const bytes = new Uint8Array(LOADOUT_ID_LENGTH);
  crypto.getRandomValues(bytes);
  let id = "";
  for (const b of bytes) id += LOADOUT_ID_ALPHABET[b % LOADOUT_ID_ALPHABET.length];
  return id;
}

async function handleGetLoadoutLink(url, env) {
  const id = url.pathname.slice("/api/loadout/".length);
  if (!id) return jsonResponse({ error: "Missing id" }, 400);
  const code = await env.CACHE.get(LOADOUT_KEY_PREFIX + id);
  if (!code) return jsonResponse({ error: "Loadout not found" }, 404);
  return jsonResponse({ code });
}

async function buildFreshData() {
  const enchantsRes = await fetch(NEU_ENCHANTS_URL);
  const enchants = await enchantsRes.json();
  const [reforges, reforgeStones, pets] = await Promise.all([
    fetchReforges(),
    fetchReforgeStones(),
    fetchPetNums(),
  ]);

  return {
    weapons,
    armor,
    equipment,
    enchants,
    reforges,
    reforgeStones,
    pets,
    petItems,
    powerStones,
    accessories,
    accessoryFamilies,
    lastFetched: Date.now(),
  };
}

async function fetchPetNums() {
  const res = await fetch(NEU_PETNUMS_URL);
  return res.json();
}

async function fetchAttributeShards() {
  const res = await fetch(NEU_ATTRIBUTE_SHARDS_URL);
  return res.json();
}

// Maps this app's own Attribute ids (frontend/src/lib/attributes.js's ATTRIBUTE_IDS) to the real
// bazaar shard's internalName (minus the ";1" NEU-REPO suffix) — verified live against
// attribute_shards.json 2026-08-23, matched by each entry's real abilityName since most (but not
// all) shard ids don't cleanly follow an "<id>" pattern. 6 of the 17 Ruler shards use unrelated
// legacy bazaar item names from before Hypixel renamed the ability (Arthropod=ARACHNO,
// Ender=ENDER, Infernal=BLAZING, Pest=INSECT_POWER, Undead=UNDEAD, Woodland=SPIRIT_AXE); Humanoid
// Ruler specifically needs the "_NEW" variant (attribute_shards.json also has a stale
// "HUMANOID_RULER" entry under a different real ability, "Undead Fortune" — not this one). Every
// other id already matches its shard's internalName 1:1.
const ATTRIBUTE_SHARD_IDS = {
  ruler_airborne: "ATTRIBUTE_SHARD_AIRBORNE_RULER",
  ruler_animal: "ATTRIBUTE_SHARD_ANIMAL_RULER",
  ruler_arcane: "ATTRIBUTE_SHARD_ARCANE_RULER",
  ruler_arthropod: "ATTRIBUTE_SHARD_ARACHNO",
  ruler_construct: "ATTRIBUTE_SHARD_CONSTRUCT_RULER",
  ruler_elusive: "ATTRIBUTE_SHARD_ELUSIVE_RULER",
  ruler_ender: "ATTRIBUTE_SHARD_ENDER",
  ruler_frozen: "ATTRIBUTE_SHARD_FROZEN_RULER",
  ruler_humanoid: "ATTRIBUTE_SHARD_HUMANOID_RULER_NEW",
  ruler_infernal: "ATTRIBUTE_SHARD_BLAZING",
  ruler_magmatic: "ATTRIBUTE_SHARD_MAGMATIC_RULER",
  ruler_mythological: "ATTRIBUTE_SHARD_MYTHOLOGICAL_RULER",
  ruler_pest: "ATTRIBUTE_SHARD_INSECT_POWER",
  ruler_skeletal: "ATTRIBUTE_SHARD_SKELETAL_RULER",
  ruler_subterranean: "ATTRIBUTE_SHARD_SUBTERRANEAN_RULER",
  ruler_undead: "ATTRIBUTE_SHARD_UNDEAD",
  ruler_woodland: "ATTRIBUTE_SHARD_SPIRIT_AXE",
  echo_of_ruler: "ATTRIBUTE_SHARD_ECHO_OF_RULER",
  echo_of_echoes: "ATTRIBUTE_SHARD_ECHO_OF_ECHOES",
  echo_of_elemental: "ATTRIBUTE_SHARD_ECHO_OF_ELEMENTAL",
  echo_of_boxes: "ATTRIBUTE_SHARD_ECHO_OF_BOXES",
  light_elemental: "ATTRIBUTE_SHARD_LIGHT_ELEMENTAL",
  stone_elemental: "ATTRIBUTE_SHARD_STONE_ELEMENTAL",
  lightning_elemental: "ATTRIBUTE_SHARD_LIGHTNING_ELEMENTAL",
  wind_elemental: "ATTRIBUTE_SHARD_WIND_ELEMENTAL",
  storm_elemental: "ATTRIBUTE_SHARD_STORM_ELEMENTAL",
  fog_elemental: "ATTRIBUTE_SHARD_FOG_ELEMENTAL",
  water_elemental: "ATTRIBUTE_SHARD_WATER_ELEMENTAL",
  torrent_elemental: "ATTRIBUTE_SHARD_TORRENT_ELEMENTAL",
  frost_elemental: "ATTRIBUTE_SHARD_FROST_ELEMENTAL",
  snow_elemental: "ATTRIBUTE_SHARD_SNOW_ELEMENTAL",
  deadeye: "ATTRIBUTE_SHARD_DEADEYE",
  warrior: "ATTRIBUTE_SHARD_WARRIOR",
  elite: "ATTRIBUTE_SHARD_ELITE",
  unlimited_power: "ATTRIBUTE_SHARD_UNLIMITED_POWER",
  unlimited_energy: "ATTRIBUTE_SHARD_UNLIMITED_ENERGY",
  maximal_torment: "ATTRIBUTE_SHARD_MAXIMAL_TORMENT",
  almighty: "ATTRIBUTE_SHARD_ALMIGHTY",
  tuning_box: "ATTRIBUTE_SHARD_TUNING_BOX",
  dominance: "ATTRIBUTE_SHARD_DOMINANCE",
  attack_speed: "ATTRIBUTE_SHARD_ATTACK_SPEED",
};

// Dominance is the one attribute whose real max level (32) doesn't follow the standard 10-level
// curve every other rarity/attribute uses below — see frontend/src/lib/attributes.js's
// DOMINANCE_MAX_LEVEL (user-confirmed there already: Epic-tier, 32 total shards -> level 32,
// a flat 1-shard-per-level curve rather than attribute_levelling's escalating one).
const DOMINANCE_TOTAL_SHARDS = 32;

// Real total shard count to reach an attribute's own max level, times its real shard price —
// user-specified 2026-08-23. `attributeShards` is attribute_shards.json's parsed body (fetched
// alongside prices, same cadence); `itemPrices` is the raw (unpruned) price map, since shard ids
// wouldn't otherwise survive pruneItemPrices. Every attribute here caps at level 10 (the standard
// attribute_levelling curve) except Dominance (see DOMINANCE_TOTAL_SHARDS above).
//
// Also returns attributeCostsByLevel: the same real shard price times the CUMULATIVE shard count
// through each individual level (not just the final max-level total) — powers the frontend's
// Setup Cost breakdown, which needs "what did reaching the player's CURRENT level cost", not only
// "what would maxing it cost". [level - 1] is the cumulative cost to reach `level` from 0.
function computeAttributeCosts(itemPrices, attributeShards) {
  const rarityByInternalName = {};
  for (const a of attributeShards.attributes) {
    rarityByInternalName[a.internalName.split(";")[0]] = a.rarity;
  }
  const cumulativeShardsByLevelByRarity = {};
  for (const [rarity, perLevelCosts] of Object.entries(attributeShards.attribute_levelling)) {
    const cumulative = [];
    let running = 0;
    for (const c of perLevelCosts) {
      running += c;
      cumulative.push(running);
    }
    cumulativeShardsByLevelByRarity[rarity] = cumulative;
  }

  const attributeCosts = {};
  const attributeCostsByLevel = {};
  for (const [appId, shardId] of Object.entries(ATTRIBUTE_SHARD_IDS)) {
    const price = itemPrices[shardId];
    if (!price) continue;
    if (appId === "dominance") {
      // Flat 1-shard-per-level curve (see DOMINANCE_TOTAL_SHARDS) rather than the rarity table.
      attributeCosts[appId] = price * DOMINANCE_TOTAL_SHARDS;
      attributeCostsByLevel[appId] = Array.from({ length: DOMINANCE_TOTAL_SHARDS }, (_, i) => price * (i + 1));
      continue;
    }
    const cumulative = cumulativeShardsByLevelByRarity[rarityByInternalName[shardId]];
    if (!cumulative) continue;
    attributeCosts[appId] = price * cumulative[cumulative.length - 1];
    attributeCostsByLevel[appId] = cumulative.map((shards) => price * shards);
  }
  return { attributeCosts, attributeCostsByLevel };
}

async function fetchPrices() {
  const res = await fetch(SKYHELPER_PRICES_URL);
  return res.json(); // flat { ITEM_ID: coins }
}

// Real coin cost per star level for one item's real upgrade_costs (see scripts/build-item-data.mjs
// — Hypixel's own resources API, not in NEU-REPO at all). Each star's cost entry is one of
// ESSENCE_<type>/direct item id/flat coins; summed cumulatively so star N's price is "everything
// spent getting from bare to N", matching how a player actually pays for it one star at a time.
function computeStarCosts(itemId, upgradeCosts, itemPrices, out) {
  let cumulative = 0;
  upgradeCosts.forEach((level, i) => {
    for (const cost of level) {
      if (cost.type === "ESSENCE") cumulative += (cost.amount || 0) * (itemPrices[`ESSENCE_${cost.essence_type}`] || 0);
      else if (cost.type === "ITEM") cumulative += (cost.amount || 0) * (itemPrices[cost.item_id] || 0);
      else if (cost.type === "COINS") cumulative += cost.coins || 0;
    }
    out[`${itemId}_${i + 1}`] = cumulative;
  });
}

// Real coin costs for every priceable "thing" the Optimizer's candidates can reference — resolved
// and persisted here (its own KV key/TTL, independent of the 6h item-catalog cache above) rather
// than recomputed client-side per Optimizer run, per explicit direction: the coin-cost side of a
// candidate is loadout-independent (a Dragon Claw costs the same no matter whose item it reforges),
// so it's cheap to compute once per refresh cycle and just looked up afterward. `catalog` is
// whichever item-catalog object (fresh or cached) the caller is about to respond with — reused for
// its already-resolved `reforgeStones`/`pets`/`armor`/`weapons` rather than re-fetching them here.
async function resolveCosts(env, catalog, force = false) {
  const cachedRaw = await env.CACHE.get(PRICES_CACHE_KEY, "json");
  if (!force && cachedRaw && Date.now() - cachedRaw.lastFetched < PRICES_CACHE_TTL_MS) {
    return cachedRaw.costs;
  }

  try {
    const [itemPrices, attributeShards] = await Promise.all([fetchPrices(), fetchAttributeShards()]);
    const { attributeCosts, attributeCostsByLevel } = computeAttributeCosts(itemPrices, attributeShards);

    const reforgeCosts = {};
    for (const [reforgeName, stone] of Object.entries(catalog.reforgeStones || {})) {
      const price = itemPrices[stone.stoneId];
      if (price) reforgeCosts[reforgeName] = price;
    }

    const recombobulatorCost = itemPrices["RECOMBOBULATOR_3000"] || null;

    const petCosts = {};
    for (const [petId, petCatalog] of Object.entries(catalog.pets || {})) {
      const tiers = Object.keys(petCatalog);
      if (tiers.length === 0) continue;
      const tier = tiers.includes("LEGENDARY") ? "LEGENDARY" : tiers[tiers.length - 1];
      const maxLevel = EXTENDED_PET_MAX_LEVELS[petId] || 100;
      const price = itemPrices[`LVL_${maxLevel}_${tier}_${petId}`];
      if (price) petCosts[petId] = price;
    }

    const starCosts = {};
    for (const item of [...armor, ...weapons]) {
      if (item.upgrade_costs) computeStarCosts(item.id, item.upgrade_costs, itemPrices, starCosts);
    }

    const costs = {
      itemPrices: pruneItemPrices(itemPrices, catalog),
      reforgeCosts,
      recombobulatorCost,
      petCosts,
      starCosts,
      attributeCosts,
      attributeCostsByLevel,
    };
    await env.CACHE.put(PRICES_CACHE_KEY, JSON.stringify({ costs, lastFetched: Date.now() }));
    return costs;
  } catch (err) {
    console.error("resolveCosts: fetchPrices failed:", err);
    return cachedRaw
      ? cachedRaw.costs
      : {
          itemPrices: {},
          reforgeCosts: {},
          recombobulatorCost: null,
          petCosts: {},
          starCosts: {},
          attributeCosts: {},
          attributeCostsByLevel: {},
        };
  }
}

async function fetchReforges() {
  const res = await fetch(NEU_REFORGES_URL);
  return res.json();
}

// Re-keys reforgestones.json (keyed by stone item id) by reforgeName instead, keeping stoneId for icon lookup.
// `nbtModifier` (present on ~1 in 10 entries) is Hypixel's own real ExtraAttributes.modifier id
// when it diverges from a naive lowercase-underscore of the display name — e.g. Bloodshot's real
// id is "blood_shot", Warped's is "aote_stone" — kept so Hypixel import (lib/hypixelImport.js) can
// match a real account's item back to the right reforge instead of guessing at the transform.
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
      nbtModifier: stone.nbtModifier || null,
    };
  }
  return byName;
}

// Currently-worn is still the default source for both armor and equipment — deliberately ignores
// member.loadout.armor/equipment's own "equipped_set" pointer since it isn't reliable (can point
// at an empty saved slot, confirmed against a real account: equipped_set pointed at a set with no
// items while the player was visibly wearing something else entirely). Both armor and equipment
// can additionally come from a user-picked Wardrobe set (wardrobeSets/wardrobeEquipmentSets below)
// instead of what's currently worn — sidesteps that same reliability problem by making the pick
// explicit rather than trusting the auto-pointer.
const WEAPON_IDS = new Set(weapons.map((w) => w.id));

// Real per-rarity Magical Power contribution — user-confirmed values (not published anywhere
// structured in NEU-REPO).
const RARITY_MAGICAL_POWER = {
  COMMON: 3,
  UNCOMMON: 5,
  RARE: 8,
  EPIC: 12,
  LEGENDARY: 16,
  MYTHIC: 22,
  SPECIAL: 3,
  VERY_SPECIAL: 5,
};

// Longest-first so "VERY SPECIAL" matches before "SPECIAL" — same ordering reason as
// scripts/build-item-data.mjs's TIER_NAMES.
const TIER_WORDS = ["VERY SPECIAL", "MYTHIC", "LEGENDARY", "EPIC", "RARE", "UNCOMMON", "COMMON", "SPECIAL"];

// An accessory's CURRENT rarity is read directly from its own real per-instance lore (the last
// non-empty line, e.g. "LEGENDARY ACCESSORY" — same convention as build-item-data.mjs's
// parseTierAndCategory) rather than inferred from the bundled catalog's base tier plus a "+1 tier
// if recombobulated" assumption. That inference is wrong for a real, non-rare class of
// accessories (Power Relic, Pulse Ring, Book of Progression, Runebook, Trapper Crest, ...) whose
// tier is a per-player value unrelated to Recombobulator status, and misses cosmetic items
// (Party Hats) that aren't in the bundled catalog at all but do carry a real tier in their own
// lore. Confirmed live against a real account: the catalog+bump approach undercounted Magical
// Power by ~90 points; reading real lore closes it to within ~5 of the account's known peak
// (accessory_bag_storage.highest_magical_power) — the small remaining gap is expected, since that
// peak doesn't drop if an accessory is later sold.
function realAccessoryTier(item) {
  const lore = item?.tag?.display?.Lore;
  if (!lore || lore.length === 0) return null;
  const lastLine = lore[lore.length - 1]
    .replace(/§./g, "")
    .replace(/[^A-Za-z ]/g, "")
    .trim();
  // Real accessories' own tag always says "...ACCESSORY" (hats say "HATCESSORY" instead, see
  // isHatAccessory below) — without this check, any non-accessory item sharing a tier word
  // (a weapon, block, dungeon material, ...) sitting in the scanned inventory would be
  // miscounted as an owned accessory too, since every item's tier line has ONE of TIER_WORDS.
  if (!lastLine.includes("ACCESSORY") && !lastLine.includes("HATCESSORY")) return null;
  for (const word of TIER_WORDS) {
    if (lastLine.includes(word)) return word.replace(" ", "_");
  }
  return null;
}

// Cosmetic hat accessories (Party Hats, Cake Hats, ...) carry a real "HATCESSORY" tag on their
// last lore line instead of "ACCESSORY" — Hypixel's own marker for "only one can be worn/counted
// at a time", so this generically covers every past and future hat year with no id allowlist.
function isHatAccessory(item) {
  const lore = item?.tag?.display?.Lore;
  if (!lore || lore.length === 0) return false;
  return lore[lore.length - 1].replace(/§./g, "").includes("HATCESSORY");
}

// Real Hypixel tooltip label text for the 3 stats individually-owned accessories are parsed for
// (Strength/Crit Chance/Crit Damage only — user-scoped; no real accessory has Crit Chance as a
// base stat, confirmed by checking every one's real lore, so that key is here for completeness
// but never actually matches anything today) — used to read the real "Stat: +X" lore line
// directly, only for the fixed id list in PARSABLE_ACCESSORY_STAT_IDS below.
const ACCESSORY_STAT_LABELS = {
  strength: "Strength",
  crit_chance: "Crit Chance",
  crit_damage: "Crit Damage",
};

// Real accessory stat NAME (as written in flavor-text phrasing, lowercased) -> our tracked key —
// for the narrative "Grants +X <stat>[, and +Y <stat>]" / "Increases your <stat>[ and <stat>] by
// +X" phrasings several real accessories use instead of a leading "Stat: +X" line (e.g. Day/Night
// Crystal's "Increases your Strength and Defense by +5 during the Day/Night" — the "+5" is fixed
// literal text in the item's own real lore, not account-variable, so it resolves the same way a
// leading stat line would). Superset of ACCESSORY_STAT_LABELS since a couple of real items
// narratively grant Defense too — filtered to tracked keys when summed below.
const ACCESSORY_STAT_NAME_TO_KEY = {
  strength: "strength",
  "crit chance": "crit_chance",
  "crit damage": "crit_damage",
};

function stripLoreLine(line) {
  return line.replace(/§./g, "").replace(/[^\x00-\x7F]/g, "");
}

// Real leading "Stat: +X" lines only (first match per stat) — no reforge/gemstone/dungeonize
// annotation handling, since that's this app's own synthetic tooltip system for GEAR (see
// lib/itemTooltip.js), not how raw Hypixel accessory lore is actually formatted.
function parseLeadingStatLines(lore) {
  const stats = {};
  for (const [statKey, label] of Object.entries(ACCESSORY_STAT_LABELS)) {
    const re = new RegExp(`^${label}:\\s*([+-]?[\\d.]+)`);
    for (const rawLine of lore || []) {
      const m = re.exec(stripLoreLine(rawLine).trim());
      if (m) {
        stats[statKey] = parseFloat(m[1]);
        break;
      }
    }
  }
  return stats;
}

// "Grants +X Y[, and +Z W]." / "Increases your X[ and Y] by +Z ..." narrative phrasing — see
// ACCESSORY_STAT_NAME_TO_KEY above. Genuinely dynamic/positional bonuses that don't resolve to a
// fixed number in an item's own real lore (Gravity Talisman's distance-to-spawn range, Blood God
// Crest's kill-counter-digit scaling) are left at 0 here rather than guessed — a real, documented
// gap, not a silent wrong number.
function parseNarrativeStatGrants(lore) {
  const text = stripLoreLine((lore || []).join(" ")).replace(/\s+/g, " ");
  const stats = {};

  const grants = /Grants\s+([^.]+)\./i.exec(text);
  if (grants) {
    const partRe = /\+([\d,.]+)\s+([A-Za-z ]+?)(?=,\s+|\s+and\s+|$)/g;
    let part;
    while ((part = partRe.exec(grants[1])) !== null) {
      const key = ACCESSORY_STAT_NAME_TO_KEY[part[2].trim().toLowerCase()];
      if (key) stats[key] = (stats[key] || 0) + parseFloat(part[1].replace(/,/g, ""));
    }
  }

  const increases = /Increases your\s+([^.]+?)\s+by\s+\+?([\d.]+)/i.exec(text);
  if (increases) {
    for (const name of increases[1].split(/,\s*|\s+and\s+/i)) {
      const key = ACCESSORY_STAT_NAME_TO_KEY[name.trim().toLowerCase()];
      if (key) stats[key] = (stats[key] || 0) + parseFloat(increases[2]);
    }
  }

  return stats;
}

// Fixed list of every real accessory confirmed (by checking its real lore directly, against the
// bundled catalog — see worker/src/data/accessories.json, Aug 2026) to carry Strength or Crit
// Damage as a base stat, either a leading "Stat: +X" line or the "Grants/Increases" narrative
// phrasing above — user-scoped to just these two (Crit Chance is never a real accessory base
// stat, see ACCESSORY_STAT_LABELS' comment). Parsing is restricted to just this fixed list rather
// than every item in the bag, both for precision (no chance of a coincidental match in some
// future/unusual item's flavor text) and because a few real accessories mention Strength without
// it being a stable, always-on bag bonus — Bat Person Talisman/Ring/Artifact and Reaper Orb scale
// with a momentary combat state (bats currently summoned / a 5s kill-stack, essentially always 0
// outside active combat) and Master Skull tiers are a Dungeon-Master-Mode-only percentage bonus —
// none of those are included here.
//
// Blood God Crest and Blood God Sigil both scale with a persistent lifetime kill counter (not a
// momentary one) — the bundled catalog's snapshot has 0 kills for Crest (no leading line renders
// at 0, confirmed real behavior) but a real counter for Sigil (whose leading "Strength: +4" line
// exactly equals its own separately-shown "Bonus: +4 Strength" line) — strong evidence Hypixel
// bakes the CURRENT resolved counter value into the leading line for a real account, so both are
// included and rely on parseLeadingStatLines picking up whatever a real account's counter resolves
// to (0 if genuinely no kills yet, same as today).
//
// Magic 8 Ball rerolls its bonus category (Farming/Foraging/Mining/Fishing/Combat) once per
// SkyBlock Season — included because whichever category is currently active resolves into a real
// leading stat line same as anything else; the other 4 categories aren't stats this app tracks, so
// it contributes 0 except in Season(s) where the account's roll landed on the Combat (Strength) option.
const PARSABLE_ACCESSORY_STAT_IDS = new Set([
  "BLOOD_GOD_CREST", "BLOOD_GOD_SIGIL",
  "BURSTSTOPPER_TALISMAN", "BURSTSTOPPER_ARTIFACT",
  "DAY_CRYSTAL", "NIGHT_CRYSTAL", "MOONLIGHT_CRYSTAL", "SUNSHINE_CRYSTAL",
  "RAGGEDY_SHARK_TOOTH_NECKLACE", "DULL_SHARK_TOOTH_NECKLACE", "HONED_SHARK_TOOTH_NECKLACE",
  "SHARP_SHARK_TOOTH_NECKLACE", "RAZOR_SHARP_SHARK_TOOTH_NECKLACE",
  "MAGIC_8_BALL",
  "RED_CLAW_TALISMAN", "RED_CLAW_RING", "RED_CLAW_ARTIFACT",
  "TINY_DANCER",
]);

// Gravity Talisman's real bonus is "+1 to +10 Strength and Defense, scaling with distance to the
// island's spawn point" — a live positional value, not something derivable from a static lore
// string, and not a stable "build" characteristic a damage calculator can represent (it changes as
// the player walks around). User-confirmed: average it out to a flat +5 rather than parsing 0 or
// guessing which end of the range to assume.
const GRAVITY_TALISMAN_AVERAGE_STRENGTH = 5;

// General's Medallion: real, per-account Catacombs Stats Boost digit count baked directly into
// the owned copy's own lore server-side — same "live-computed number in a labeled lore line"
// pattern as Midas Sword's "Price paid"/Crown of Avarice's "Coins Consumed"/Daedalus Blade's
// "Bestiary Tiers" (see lib/hypixelImport.js's SPECIAL_LORE_LABELS for the weapon-side versions of
// this same pattern). Confirmed live 2026-08-25 against a real account: a 5,304-secret account's
// medallion reads "§7Bonus: §a+4%" — Hypixel itself already caps this at the real max of 6%
// (the item's own lore states "(Max 6%)"), matching lib/dungeonize.js's MAX_GENERALS_MEDALLION_DIGITS,
// so no extra clamping is needed here.
function parseGeneralsMedallionDigits(lore) {
  for (const rawLine of lore || []) {
    const line = stripLoreLine(rawLine).trim();
    const match = /^Bonus:\s*\+(\d+)%/.exec(line);
    if (match) return parseInt(match[1], 10);
  }
  return 0;
}

// Computes live Magical Power (summed real Accessory Bag rarities), every individually-owned
// accessory's own real stat line (parsed generically — see parseLeadingStatLines/
// parseNarrativeStatGrants above — but only for the ~40 real ids in PARSABLE_ACCESSORY_STAT_IDS,
// confirmed by checking each one's actual lore; replaces a previous hand-picked allowlist of just
// 5 named items), and a total Enrichments count from a decoded talisman_bag item list — see the
// Promise.all above for where `items` comes from. Dedup rules, both confirmed by the account owner:
// - Owning multiple physical copies of the same accessory id only counts the best copy once for
//   both Magical Power AND its own stat line (e.g. 4x Personal Compactor 7000 counts only its
//   single highest tier, not all 4 summed).
// - Hat accessories (see isHatAccessory) are mutually exclusive with each other as a group for
//   Magical Power — only the single highest-Magical-Power hat owned counts, not every hat summed.
// Enrichments count is a flat, undeduped tally of every item carrying a real
// ExtraAttributes.talisman_enrichment value, regardless of which stat it's actually on — the
// Enrichments UI (see damageSources.js) always imports as 'none' (0 stat impact) and lets the
// player manually swap the whole count onto one tracked stat as a "what if" — confirmed by the
// account owner: e.g. an account with 65 Magic-Find-enriched accessories imports as count 65,
// type 'none', and the player can swap that to Strength to see the hypothetical +65 Strength.
// `abiphoneContactCount` (member.nether_island_player_data.abiphone.contact_data key count) adds
// floor(count/2) bonus Magical Power, but only while an Abicase accessory is owned — user-confirmed.
function computeLiveAccessoryStats(items, abiphoneContactCount) {
  const bestMagicalPowerById = new Map();
  const bestStatById = {}; // statKey -> Map<id, value>
  let hatMagicalPower = 0;
  let hasAbicase = false;
  let enrichmentCount = 0;
  let generalsMedallionDigits = 0;

  for (const raw of items) {
    const ea = raw?.tag?.ExtraAttributes;
    const id = ea?.id;
    if (!id) continue;

    const tier = realAccessoryTier(raw);
    let magicalPower = tier && RARITY_MAGICAL_POWER[tier] != null ? RARITY_MAGICAL_POWER[tier] : 0;
    // Hegemony Artifact doubles its own Magical Power contribution — user-confirmed.
    if (id === "HEGEMONY_ARTIFACT") magicalPower *= 2;
    if (isHatAccessory(raw)) {
      hatMagicalPower = Math.max(hatMagicalPower, magicalPower);
    } else {
      bestMagicalPowerById.set(id, Math.max(bestMagicalPowerById.get(id) || 0, magicalPower));
    }
    if (ea.talisman_enrichment) enrichmentCount++;
    if (id === "ABICASE") hasAbicase = true;
    // Best (highest-digit) copy counts, same dedup treatment as Magical Power/itemStats above —
    // a player rarely owns more than one, but a stale lower-secret-count duplicate shouldn't win.
    if (id === "GENERAL_MEDALLION") {
      generalsMedallionDigits = Math.max(generalsMedallionDigits, parseGeneralsMedallionDigits(raw?.tag?.display?.Lore));
    }

    let itemStats = null;
    if (id === "GRAVITY_TALISMAN") {
      itemStats = { strength: GRAVITY_TALISMAN_AVERAGE_STRENGTH };
    } else if (PARSABLE_ACCESSORY_STAT_IDS.has(id)) {
      const lore = raw?.tag?.display?.Lore;
      itemStats = { ...parseNarrativeStatGrants(lore), ...parseLeadingStatLines(lore) };
    }
    if (itemStats) {
      for (const [statKey, value] of Object.entries(itemStats)) {
        if (!value) continue;
        if (!bestStatById[statKey]) bestStatById[statKey] = new Map();
        bestStatById[statKey].set(id, Math.max(bestStatById[statKey].get(id) || 0, value));
      }
    }
  }

  let magicalPower = hatMagicalPower;
  for (const mp of bestMagicalPowerById.values()) magicalPower += mp;
  if (hasAbicase) magicalPower += Math.floor((abiphoneContactCount || 0) / 2);

  const itemStats = {};
  for (const [statKey, map] of Object.entries(bestStatById)) {
    let total = 0;
    for (const value of map.values()) total += value;
    if (total) itemStats[statKey] = Math.round(total * 10) / 10;
  }

  return { magicalPower, itemStats, enrichmentCount, generalsMedallionDigits };
}

// Inventory array index -> our slot name, for the 4-piece flat lists Hypixel returns.
const ARMOR_SLOT_ORDER = ["boots", "leggings", "chestplate", "helmet"];
const EQUIPMENT_SLOT_ORDER = ["necklace", "cloak", "belt", "gloves"];

// Wardrobe data is NOT a single combined blob (unlike inv_armor/equipment_contents) — it lives at
// member.loadout.armor / member.loadout.equipment, each keyed by 1-based set-number strings ("1",
// "2", ...) plus a non-numeric "equipped_set" pointer key to skip. Each set is itself an object
// with one SEPARATELY gzip+base64-encoded NBT blob per real slot (only present when that slot has
// an item) — confirmed against a real account's raw API response, since the NEU-REPO-adjacent
// assumption that it'd match inv_armor's shape (one combined blob) turned out to be wrong.
const WARDROBE_ARMOR_SLOT_KEYS = { helmet: "HELMET", chestplate: "CHESTPLATE", leggings: "LEGGINGS", boots: "BOOTS" };
const WARDROBE_EQUIPMENT_SLOT_KEYS = { necklace: "EQUIPMENT_SLOT_1", cloak: "EQUIPMENT_SLOT_2", belt: "EQUIPMENT_SLOT_3", gloves: "EQUIPMENT_SLOT_4" };

// Decodes member.loadout.armor or member.loadout.equipment into a list of non-empty sets, each
// {index, <slot>: summary|null}. slotKeys maps our slot names to the real per-slot NBT key names
// above. Every set's every slot is decoded concurrently (each decode is its own tiny gzip blob) —
// a saved account can have up to ~19-27 sets depending on rank/Community Center purchases, so this
// is dozens of small decodes per import, all run in parallel rather than sequentially awaited.
async function decodeWardrobeSets(sets, slotKeys) {
  const entries = Object.entries(sets || {}).filter(([key]) => key !== "equipped_set");
  const decoded = await Promise.all(
    entries.map(async ([key, set]) => {
      const slotEntries = await Promise.all(
        Object.entries(slotKeys).map(async ([slot, nbtKey]) => {
          const blob = set[nbtKey];
          if (!blob?.data) return [slot, null];
          const items = await decodeInventoryB64(blob.data);
          return [slot, extractItemSummary(items[0])];
        }),
      );
      const result = { index: Number(key), ...Object.fromEntries(slotEntries) };
      const hasAny = slotEntries.some(([, summary]) => summary);
      return hasAny ? result : null;
    }),
  );
  return decoded.filter(Boolean).sort((a, b) => a.index - b.index);
}

// Pet level XP curve, per rarity tier: cumulative XP to reach level x is a*(b^x - 1) — given
// directly (not NEU-sourced), verified against real account data. Golden/Rose/Jade Dragon are a
// special 200-level-cap family using the Legendary curve through level 102, then a flat
// 1,886,700 XP/level after that (also given directly, confirmed via NEU-REPO's pets.json
// custom_pet_leveling, whose only 3 dragon-type entries are exactly these three).
const PET_LEVEL_CURVES = {
  COMMON: { a: 3574.23, b: 1.076434 },
  UNCOMMON: { a: 6155.92, b: 1.0752 },
  RARE: { a: 8241.25, b: 1.0761 },
  EPIC: { a: 9935.39, b: 1.0774 },
  LEGENDARY: { a: 13115.78, b: 1.0786 },
  MYTHIC: { a: 13115.78, b: 1.0786 },
};
const DRAGON_FAMILY_PETS = new Set(["GOLDEN_DRAGON", "ROSE_DRAGON", "JADE_DRAGON"]);
const DRAGON_LINEAR_START_LEVEL = 102;
const DRAGON_LINEAR_XP_PER_LEVEL = 1886700;

function levelFromCurve(curve, exp, cap) {
  if (!(exp > 0)) return 1;
  const level = Math.log(exp / curve.a + 1) / Math.log(curve.b);
  return Math.max(1, Math.min(cap, Math.floor(level)));
}

function computePetLevel(type, tier, exp) {
  const curve = PET_LEVEL_CURVES[tier] || PET_LEVEL_CURVES.LEGENDARY;
  if (!DRAGON_FAMILY_PETS.has(type)) return levelFromCurve(curve, exp, 100);

  const xpAt102 = curve.a * (curve.b ** DRAGON_LINEAR_START_LEVEL - 1);
  if (exp <= xpAt102) return levelFromCurve(curve, exp, DRAGON_LINEAR_START_LEVEL);
  const level = DRAGON_LINEAR_START_LEVEL + Math.floor((exp - xpAt102) / DRAGON_LINEAR_XP_PER_LEVEL);
  return Math.min(200, level);
}

// "ATTRIBUTE_SHARD_FROST_ELEMENTAL;1" -> "frost_elemental", matching the raw key format Hypixel
// uses in member.attributes.stacks (confirmed via real account data).
function attributeShortId(internalName) {
  return internalName.split(";")[0].replace("ATTRIBUTE_SHARD_", "").toLowerCase();
}

function buildAttributeRarityMap(attributeShards) {
  const map = {};
  for (const a of attributeShards.attributes) {
    map[attributeShortId(a.internalName)] = a.rarity;
  }
  return map;
}

// attribute_levelling gives per-level stack costs (10 per rarity) — convert to cumulative
// thresholds once so stacks->level is a simple lookup.
function buildAttributeThresholds(attributeLevelling) {
  const thresholds = {};
  for (const [rarity, costs] of Object.entries(attributeLevelling)) {
    let cum = 0;
    thresholds[rarity] = costs.map((c) => (cum += c));
  }
  return thresholds;
}

function computeAttributeLevels(stacks, rarityMap, thresholds) {
  const result = {};
  for (const [id, count] of Object.entries(stacks || {})) {
    const rarity = rarityMap[id];
    const cum = rarity && thresholds[rarity];
    if (!cum) continue;
    let level = 0;
    for (let i = 0; i < cum.length; i++) {
      if (count >= cum[i]) level = i + 1;
      else break;
    }
    result[id] = level;
  }
  return result;
}

function computeSkillLevel(xp, leveling_xp, cap) {
  let cum = 0;
  let level = 0;
  for (let i = 0; i < cap; i++) {
    cum += leveling_xp[i];
    if (xp >= cum) level++;
    else break;
  }
  return level;
}

function highestClaimedSlayerLevel(bossData) {
  const claimed = (bossData && bossData.claimed_levels) || {};
  let highest = 0;
  for (const key of Object.keys(claimed)) {
    if (!claimed[key]) continue;
    const match = key.match(/^level_(\d+)$/);
    if (match) highest = Math.max(highest, parseInt(match[1], 10));
  }
  return highest;
}

async function handleHypixelImport(url, env) {
  if (!env.HYPIXEL_API_KEY) {
    return jsonResponse({ error: "Hypixel import is not configured (missing API key)", code: "api_key_invalid" }, 500);
  }

  const username = url.searchParams.get("username");
  const uuidParam = url.searchParams.get("uuid");
  const profileParam = url.searchParams.get("profile");
  if (!username && !uuidParam) {
    return jsonResponse({ error: "Provide ?username= or ?uuid=" }, 400);
  }

  let uuid = uuidParam;
  let resolvedUsername = username;
  if (!uuid) {
    // api.mojang.com's bot-protection (Akamai) blocks Cloudflare Workers' shared egress IPs
    // outright (403 + an HTML challenge page, confirmed live) — PlayerDB proxies the same Mojang
    // lookup and is reachable from Workers.
    let lookupRes;
    try {
      lookupRes = await fetch(`https://playerdb.co/api/player/minecraft/${encodeURIComponent(username)}`);
    } catch (err) {
      console.error("handleHypixelImport: PlayerDB lookup failed:", err);
      return jsonResponse({ error: "Username lookup failed, try again", code: "lookup_failed" }, 502);
    }
    const lookup = await lookupRes.json().catch(() => null);
    if (!lookupRes.ok || !lookup?.success) {
      // PlayerDB returns 400 + "minecraft.invalid_username" for both nonexistent and
      // malformed usernames (confirmed live) — "player.not_found"/404 kept as a fallback in
      // case that ever changes.
      if (lookupRes.status === 400 || lookupRes.status === 404 || lookup?.code === "minecraft.invalid_username" || lookup?.code === "player.not_found") {
        return jsonResponse({ error: `No Minecraft account named "${username}"`, code: "invalid_username" }, 404);
      }
      return jsonResponse({ error: "Username lookup failed, try again", code: "lookup_failed" }, 502);
    }
    uuid = lookup.data.player.raw_id;
    resolvedUsername = lookup.data.player.username;
  }

  let hypixelRes, hypixel;
  try {
    hypixelRes = await fetch(`https://api.hypixel.net/v2/skyblock/profiles?uuid=${encodeURIComponent(uuid)}`, {
      headers: { "API-Key": env.HYPIXEL_API_KEY },
    });
    hypixel = await hypixelRes.json();
  } catch (err) {
    console.error("handleHypixelImport: Hypixel API request failed:", err);
    return jsonResponse({ error: "Hypixel API request failed, try again", code: "hypixel_unreachable" }, 502);
  }
  if (!hypixel.success) {
    if (hypixelRes.status === 403 || /invalid api key/i.test(hypixel.cause || "")) {
      return jsonResponse({ error: "Hypixel import is temporarily unavailable (API key expired) — try again later", code: "api_key_invalid" }, 502);
    }
    if (hypixelRes.status === 429 || hypixel.throttle || /rate limit/i.test(hypixel.cause || "")) {
      return jsonResponse({ error: "Hypixel API rate limit hit — wait a minute and try again", code: "rate_limited" }, 429);
    }
    if (hypixelRes.status === 400 || /invalid uuid/i.test(hypixel.cause || "")) {
      return jsonResponse({ error: `No Minecraft account named "${resolvedUsername || uuid}"`, code: "invalid_username" }, 404);
    }
    return jsonResponse({ error: hypixel.cause || "Hypixel API request failed", code: "hypixel_error" }, 502);
  }
  const profiles = (hypixel.profiles || []).filter(Boolean);
  if (profiles.length === 0) {
    return jsonResponse({ error: `${resolvedUsername || uuid} has no SkyBlock profiles` }, 404);
  }

  let profile = profileParam ? profiles.find((p) => p.profile_id === profileParam) : null;
  if (!profile && !profileParam) {
    profile = profiles.length === 1 ? profiles[0] : profiles.find((p) => p.selected) || null;
  }
  if (!profile) {
    return jsonResponse({
      needsProfileSelection: true,
      uuid,
      username: resolvedUsername,
      profiles: profiles.map((p) => ({
        profile_id: p.profile_id,
        cute_name: p.cute_name,
        selected: !!p.selected,
        game_mode: p.game_mode || null,
      })),
    });
  }

  const member = profile.members && profile.members[uuid];
  if (!member) {
    return jsonResponse({ error: "Couldn't find this player's data on that profile" }, 404);
  }

  try {
    // Backpack contents live under `inventory.backpack_contents`, keyed "0", "1", ... by the
    // backpack's real in-game slot — decoded in that order so `Backpack 1`/`Backpack 2`/... below
    // matches what the player actually sees.
    const backpackContents = member.inventory?.backpack_contents || {};
    const backpackIds = Object.keys(backpackContents).sort((a, b) => Number(a) - Number(b));

    const [armorItems, equipmentItems, invItems, enderChestItems, backpackItemLists, talismanBagItems, attributeShards, leveling, skillsResource] =
      await Promise.all([
        member.inventory?.inv_armor?.data ? decodeInventoryB64(member.inventory.inv_armor.data) : [],
        member.inventory?.equipment_contents?.data ? decodeInventoryB64(member.inventory.equipment_contents.data) : [],
        member.inventory?.inv_contents?.data ? decodeInventoryB64(member.inventory.inv_contents.data) : [],
        // Every unlocked Ender Chest page comes back as one already-combined blob (confirmed
        // live — not paged separately), so no extra per-page fetching is needed.
        member.inventory?.ender_chest_contents?.data ? decodeInventoryB64(member.inventory.ender_chest_contents.data) : [],
        Promise.all(backpackIds.map((id) => (backpackContents[id]?.data ? decodeInventoryB64(backpackContents[id].data) : []))),
        // The real Accessory Bag contents (Hypixel's own internal name for it, confirmed live) —
        // used below to compute live Magical Power and named "Talisman Bonuses" instead of
        // relying on accessory_bag_storage.highest_magical_power, which is a permanent high-water
        // mark that never drops even after selling/swapping accessories out of the bag.
        member.inventory?.bag_contents?.talisman_bag?.data ? decodeInventoryB64(member.inventory.bag_contents.talisman_bag.data) : [],
        fetch(NEU_ATTRIBUTE_SHARDS_URL).then((r) => r.json()),
        fetch(NEU_LEVELING_URL).then((r) => r.json()),
        fetch(HYPIXEL_SKILLS_URL).then((r) => r.json()),
      ]);

    const armorResult = {};
    ARMOR_SLOT_ORDER.forEach((slot, i) => {
      armorResult[slot] = extractItemSummary(armorItems[i]);
    });

    const equipmentResult = {};
    EQUIPMENT_SLOT_ORDER.forEach((slot, i) => {
      equipmentResult[slot] = extractItemSummary(equipmentItems[i]);
    });

    const [wardrobeSets, wardrobeEquipmentSets] = await Promise.all([
      decodeWardrobeSets(member.loadout?.armor, WARDROBE_ARMOR_SLOT_KEYS),
      decodeWardrobeSets(member.loadout?.equipment, WARDROBE_EQUIPMENT_SLOT_KEYS),
    ]);

    // Weapon: every item across the player's Inventory, Ender Chest, and Backpacks whose id is a
    // known weapon — Skyblock has no dedicated weapon slot, and a player can be carrying/storing
    // more than one, so this returns every candidate rather than guessing which one to keep; the
    // frontend lets the user pick. Each candidate is tagged with `location` (which storage it was
    // found in) since a player can easily have duplicates spread across all three. No dedup by
    // id — two physical copies of the same weapon (e.g. a main + backup) are two separate
    // candidates, same "trust real inventory position" treatment the fixed armor/equipment slots
    // already get.
    const weapons = [];
    function collectWeapons(items, location) {
      for (const raw of items) {
        const summary = extractItemSummary(raw);
        if (summary && WEAPON_IDS.has(summary.id)) weapons.push({ ...summary, location });
      }
    }
    collectWeapons(invItems, "Inventory");
    collectWeapons(enderChestItems, "Ender Chest");
    backpackItemLists.forEach((items, i) => collectWeapons(items, `Backpack ${i + 1}`));

    // Every pet the account owns (not just the equipped one) — the frontend lets the user pick
    // which to import, same "return every candidate, let the caller choose" treatment as
    // `weapons` above. `active` flags which one Hypixel currently has equipped, so the frontend
    // can default its picker to that instead of forcing a manual choice every time.
    const rawPets = (member.pets_data && member.pets_data.pets) || [];
    const pets = rawPets.map((p) => ({
      type: p.type,
      tier: p.tier,
      exp: p.exp || 0,
      heldItem: p.heldItem || null,
      skin: p.skin || null,
      active: !!p.active,
      level: computePetLevel(p.type, p.tier, p.exp || 0),
    }));

    const rarityMap = buildAttributeRarityMap(attributeShards);
    const thresholds = buildAttributeThresholds(attributeShards.attribute_levelling);
    const attributeLevels = computeAttributeLevels(member.attributes?.stacks, rarityMap, thresholds);

    // Hypixel's own skill ids are uppercase (e.g. "TAMING") — real maxLevel per skill, falling
    // back to NEU-REPO's static cap only if the live resource is ever missing that skill.
    const skillCap = (key, staticCap) => skillsResource?.skills?.[key.toUpperCase()]?.maxLevel || staticCap;

    const experience = member.player_data?.experience || {};
    const skills = {
      alchemy: computeSkillLevel(experience.SKILL_ALCHEMY || 0, leveling.leveling_xp, skillCap("alchemy", leveling.leveling_caps.alchemy)),
      enchanting: computeSkillLevel(experience.SKILL_ENCHANTING || 0, leveling.leveling_xp, skillCap("enchanting", leveling.leveling_caps.enchanting)),
      combat: computeSkillLevel(experience.SKILL_COMBAT || 0, leveling.leveling_xp, skillCap("combat", leveling.leveling_caps.combat)),
      foraging: computeSkillLevel(experience.SKILL_FORAGING || 0, leveling.leveling_xp, skillCap("foraging", leveling.leveling_caps.foraging)),
      taming: computeSkillLevel(experience.SKILL_TAMING || 0, leveling.leveling_xp, skillCap("taming", leveling.leveling_caps.taming)),
      // Catacombs uses its own XP-cost table (leveling.catacombs), not the shared skill one.
      catacombs: computeSkillLevel(
        member.dungeons?.dungeon_types?.catacombs?.experience || 0,
        leveling.catacombs,
        leveling.leveling_caps.catacombs,
      ),
      // SkyBlock Level: flat 100 XP/level, no cap — the one Hypixel level that isn't a
      // per-level-cost-table skill, just member.leveling.experience / 100 floored.
      skyblock: Math.floor((member.leveling?.experience || 0) / 100),
    };

    const slayers = {
      wolf: highestClaimedSlayerLevel(member.slayer?.slayer_bosses?.wolf),
      // Tarantula Broodfather is Hypixel's real internal key "spider".
      spider: highestClaimedSlayerLevel(member.slayer?.slayer_bosses?.spider),
    };

    // Live Magical Power/individual accessory stats from the real Accessory Bag contents
    // (talismanBagItems, decoded above) — Magical Power falls back to the stale highest-ever peak
    // only if the bag itself couldn't be decoded (e.g. the account has the relevant Hypixel API
    // setting turned off); itemStats has no such fallback (it's not a peak-tracked value on the
    // account, only derivable from the live bag).
    const abiphoneContactCount = Object.keys(member.nether_island_player_data?.abiphone?.contact_data || {}).length;
    const liveAccessoryStats = computeLiveAccessoryStats(talismanBagItems, abiphoneContactCount);
    const accessory = {
      selectedPower: member.accessory_bag_storage?.selected_power || null,
      magicalPower: talismanBagItems.length > 0 ? liveAccessoryStats.magicalPower : member.accessory_bag_storage?.highest_magical_power || 0,
      // Every individually-owned accessory's own real stat line, generically summed — see
      // computeLiveAccessoryStats. Replaces the old talismanStrengthBonus/redClawCritDamage
      // fields (a hand-picked ~5-item allowlist) with the real thing for every real accessory.
      itemStats: liveAccessoryStats.itemStats,
      enrichmentCount: liveAccessoryStats.enrichmentCount,
      // Real Catacombs Stats Boost digit count off the account's own General's Medallion, if
      // owned — see computeLiveAccessoryStats/parseGeneralsMedallionDigits above. 0 (no bonus,
      // matching playerStats.generalsMedallionDigits' own default) when not owned.
      generalsMedallionDigits: liveAccessoryStats.generalsMedallionDigits,
      // Always imports neutral — the real per-item enrichment stat is usually untracked (Magic
      // Find, etc.), so this can't grant a real bonus automatically; the player swaps it onto a
      // tracked stat manually as a "what if" (see computeLiveAccessoryStats' comment).
      enrichmentType: "none",
      // slot_0 is the account's currently active Stat Tuning allocation; slots 1-4 are saved
      // presets and aren't imported.
      tuning: member.accessory_bag_storage?.tuning?.slot_0 || null,
      // Every real accessory id currently owned (best tier per id, same dedup as Magical Power
      // above) — scanned from the Accessory Bag AND main Inventory (an accessory not yet moved
      // into the bag still counts as owned), same two sources SkyHelper/SkyCrypt's own "missing
      // talismans" feature checks. Used by the frontend's Magical Power optimizer
      // (lib/accessoryOptimizer.js) to diff against the full catalog — resolution (upgrade-family
      // exclusion, duplicates) happens there, not here, same split as reforge name resolution.
      owned: (() => {
        // Ranked by RARITY_MAGICAL_POWER value (not TIER_WORDS' match-priority order, which
        // isn't a rarity ordering) so "best tier" means "highest Magical Power", consistent with
        // computeLiveAccessoryStats' own per-id dedup above.
        const bestTierById = new Map();
        for (const raw of [...talismanBagItems, ...invItems]) {
          const id = raw?.tag?.ExtraAttributes?.id;
          if (!id) continue;
          const tier = realAccessoryTier(raw);
          if (!tier) continue;
          // Real Recombobulator usage — a one-time-per-item flag independent of tier (an item's
          // CURRENT tier, read above, already reflects any past recomb bump, so tier alone can't
          // tell a never-recombed EPIC from a recombed RARE-into-EPIC). Used by the frontend to
          // skip suggesting a recomb on an item that's already used its one real upgrade.
          const recombobulated = raw?.tag?.ExtraAttributes?.rarity_upgrades === 1;
          const existing = bestTierById.get(id);
          if (!existing || (RARITY_MAGICAL_POWER[tier] || 0) > (RARITY_MAGICAL_POWER[existing.tier] || 0)) {
            bestTierById.set(id, { tier, recombobulated });
          }
        }
        return Array.from(bestTierById, ([id, { tier, recombobulated }]) => ({ id, tier, recombobulated }));
      })(),
    };

    // Golden Dragon's Legendary Treasure/Shining Scales perks (see lib/damageSources.js) need
    // the co-op bank balance (profile-level, shared across every member on this profile — not
    // "personal", there's no such thing as a personal bank in Skyblock) and this player's own
    // Gold Ingot mining collection. Either is `null` if the account has the relevant Hypixel API
    // setting (Banking API / Collections API) turned off.
    const bank = typeof profile.banking?.balance === "number" ? profile.banking.balance : null;
    const goldCollection = typeof member.collection?.GOLD_INGOT === "number" ? member.collection.GOLD_INGOT : null;

    return jsonResponse({
      profile: { profile_id: profile.profile_id, cute_name: profile.cute_name },
      username: resolvedUsername,
      uuid,
      armor: armorResult,
      equipment: equipmentResult,
      wardrobeSets,
      wardrobeEquipmentSets,
      weapons,
      pets,
      attributeLevels,
      skills,
      slayers,
      accessory,
      bank,
      goldCollection,
    });
  } catch (err) {
    console.error("handleHypixelImport: failed to decode inventory data:", err);
    return jsonResponse({ error: "Failed to decode this player's item data", detail: String(err) }, 500);
  }
}

function jsonResponse(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...extraHeaders
    }
  });
}
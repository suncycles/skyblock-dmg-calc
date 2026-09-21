/* SKYDMG shared cache Worker: serves the item/enchant catalog sourced from NotEnoughUpdates-REPO,
   proxies the Hypixel API for gear import, and stores short loadout links.

   Weapons/armor/equipment/pet items are pre-parsed offline by scripts/build-item-data.mjs into
   src/data/{weapons,armor,equipment,petItems}.json and bundled at deploy time; re-run and redeploy
   to pick up NEU-REPO updates. Enchant and reforge data are fetched live. Coin prices (`costs`,
   resolveCosts) are a shorter-lived cache from SkyHelperBot/Prices. Per-level enchant lore
   (`enchants.levelData`, resolveEnchantLevelData) has no TTL and is rebuilt only by POST
   /api/refresh, incrementally: a full sweep is ~870 requests across ~145 ids.

   Routes:
     GET  /api/items            -> cached catalog + coin costs, refreshed first if stale (the
                                    enchant level cache is served as-is)
     POST /api/refresh          -> forces a refetch and advances the enchant rebuild by one budget
     GET  /api/hypixel/import   -> resolves ?username and returns worn armor/equipment/pet, weapon
                                    candidates from Inventory/Ender Chest/Backpacks, Wardrobe sets,
                                    pet level, attribute levels, skills and Accessory Power
                                    (see handleHypixelImport). Needs env.HYPIXEL_API_KEY.
     POST /api/loadout          -> stores an encoded loadout blob under a short id, returns { id }
     GET  /api/loadout/:id      -> resolves a short id back to { code }

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

// reforges.json: the ~50 free blacksmith reforges, keyed by name.
// reforgestones.json: the ~81 needing a physical stone item, as its own map.
const NEU_REFORGES_URL = "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants/reforges.json";
const NEU_REFORGESTONES_URL = "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants/reforgestones.json";

// Per-pet, per-rarity stat table (level 1/100 checkpoints — frontend interpolates in between).
const NEU_PETNUMS_URL = "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants/petnums.json";

// Attribute shard rarity/threshold table and skill XP-per-level costs, fetched per request for the
// import's stacks->level and xp->level conversions.
const NEU_ATTRIBUTE_SHARDS_URL = "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants/attribute_shards.json";
const NEU_LEVELING_URL = "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants/leveling.json";
// Hypixel's live skill resource, used only for each skill's max level. leveling.json still supplies
// the XP-per-level curve.
const HYPIXEL_SKILLS_URL = "https://api.hypixel.net/v2/resources/skyblock/skills";
// Real per-mob Bestiary tier-cap/kill-threshold data, for computeBestiaryMaxedMobs below.
const NEU_BESTIARY_URL = "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants/bestiary.json";
// Per-collection max-tier thresholds for computeMaxedCollectionsCount, which feeds "The One"'s
// per-maxed-collection bonus. NEU-REPO has no equivalent file.
const HYPIXEL_COLLECTIONS_URL = "https://api.hypixel.net/v2/resources/skyblock/collections";
// Kuudra armor tier-up ("prestige") recipes from Hypixel's item resource: the next tier's id and the
// materials it consumes (Essence + Kuudra Teeth). Not in the bundled catalog, so fetched live on the
// same cadence as prices.
const HYPIXEL_ITEMS_URL = "https://api.hypixel.net/v2/resources/skyblock/items";
// Stars past the 3rd also cost raw coins (10k at 4✩ up to 50M at 15✩) on top of the materials in
// Hypixel's upgrade_costs, which carries no coin entries at all. NEU-REPO's essencecosts.json has
// them as "SKYBLOCK_COIN:<amount>" per star; only those coin lines are read, since its other
// materials duplicate Hypixel's.
// essenceshops.json is a separate file — perk key -> {name, costs: [essence per level]} — used to
// price the Optimizer's Essence-shop perk upgrades.
const NEU_ESSENCE_SHOPS_URL = "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants/essenceshops.json";
const NEU_ESSENCE_COSTS_URL = "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants/essencecosts.json";
// The coin fee of a Kuudra tier-up. No public source carries it: Hypixel's prestige entries list
// only Essence and items, and essencecosts.json covers stars rather than tier-ups, so these four
// numbers come from the user. The fee depends on the tier step alone, not the family or piece.
// Indexed by the tier being upgraded FROM, matching KUUDRA_TIER_PREFIXES.
const KUUDRA_PRESTIGE_COIN_FEE_BY_STEP = {
  0: 2_000_000, // Basic -> Hot
  1: 5_000_000, // Hot -> Burning
  2: 10_000_000, // Burning -> Fiery: 4500 Crimson Essence + 50 Kuudra Teeth + 10M coins, ~15.2M all in
  3: 20_000_000, // Fiery -> Infernal
};

// The 4 tier-up starting points, ascending (VARIANT_TIERS minus Infernal, which has nothing above
// it). Every prestige entry is Kuudra armor, so an id's prefix identifies its tier.
const KUUDRA_TIER_PREFIXES = ["FIERY_", "BURNING_", "HOT_", ""];

function kuudraPrestigeStepIndex(itemId) {
  // Longest prefix first: "" matches everything, so it has to be the last resort.
  const i = KUUDRA_TIER_PREFIXES.findIndex((prefix) => itemId.startsWith(prefix));
  return i === -1 ? null : KUUDRA_TIER_PREFIXES.length - 1 - i;
}

const CACHE_KEY = "hex_data";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Per-level enchant lore (items/{ID};{level}.json), cached with no TTL and rebuilt only by POST
// /api/refresh. A full sweep needs ~870 requests across ~145 ids, far past one invocation's budget
// (ENCHANT_SUBREQUEST_BUDGET), so it is rebuilt incrementally. See buildEnchantLevelData and
// resolveEnchantLevelData.
const ENCHANT_LEVELS_CACHE_KEY = "enchant_levels_data";

// Coin prices: a much shorter-lived cache than the catalog, since prices move constantly. The
// upstream bot refreshes roughly every 15 minutes, so 20 stays just under it.
const SKYHELPER_PRICES_URL = "https://raw.githubusercontent.com/SkyHelperBot/Prices/main/pricesV2.json";
const PRICES_CACHE_KEY = "prices_data";
const PRICES_CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes

// Ids the client looks up directly from `costs.itemPrices` that no catalog list below covers.
const PRICED_EXTRA_IDS = [
  "CROWN_OF_AVARICE",
  "RECOMBOBULATOR_3000",
  "PERFECT_AMBER_GEM", "PERFECT_AMETHYST_GEM", "PERFECT_AQUAMARINE_GEM", "PERFECT_CITRINE_GEM",
  "PERFECT_JADE_GEM", "PERFECT_JASPER_GEM", "PERFECT_ONYX_GEM", "PERFECT_OPAL_GEM",
  "PERFECT_PERIDOT_GEM", "PERFECT_RUBY_GEM", "PERFECT_SAPPHIRE_GEM", "PERFECT_TOPAZ_GEM",
  // Per-tier Master Star items (lib/pricing.js's MASTER_STAR_ITEM_IDS): one is consumed per Master
  // Star level, at a flat cost per tier.
  "FIRST_MASTER_STAR", "SECOND_MASTER_STAR", "THIRD_MASTER_STAR", "FOURTH_MASTER_STAR", "FIFTH_MASTER_STAR",
  // A few enchants' top level is applied by consuming a single-use item rather than a book, so no
  // ENCHANTMENT_<name>_<level> price exists: Ender Slayer 7 (End Stone Idol), Smite 7 (Severed
  // Hand), Venomous 7 (Fateful Stinger), Bane of Arthropods 7 (Ensnared Snail). See
  // lib/pricing.js's SPECIAL_ENCHANT_LEVEL_ITEMS.
  "ENDSTONE_IDOL", "SEVERED_HAND", "FATEFUL_STINGER", "ENSNARED_SNAIL",
];

// The 6 combat gemstones x 5 tiers: evaluateGemstoneCandidates brute-forces all 30 per socket, so
// each needs its own price, not just the Perfect tier above.
const GEM_TYPES = ["RUBY", "JASPER", "SAPPHIRE", "AMETHYST", "ONYX", "OPAL"];
const GEM_TIERS = ["ROUGH", "FLAWED", "FINE", "FLAWLESS", "PERFECT"];

// The raw price map has ~14K entries while the app reads a few hundred, so it is pruned to the ids
// pricing.js and accessoryOptimizer.js can ask for before being cached — about 860KB off the
// payload. Enchant book prices are kept wholesale, since valid id/level combos have no static list.
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

// Golden/Jade/Rose Dragon level past 100 (cap 200), mirroring petData.js's EXTENDED_MAX_LEVELS;
// duplicated because the Worker and frontend share no module. Used to build the
// LVL_{100|200}_{TIER}_{PETID} price key below.
const EXTENDED_PET_MAX_LEVELS = { GOLDEN_DRAGON: 200, JADE_DRAGON: 200, ROSE_DRAGON: 200 };

// Short-link storage for /api/loadout, namespaced inside CACHE so it cannot collide with the item
// cache's key.
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
  async fetch(request, env, ctx) {
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

// 30 minutes: long enough to skip re-downloading the ~728KB payload within a session, short enough
// that a POST /api/refresh reaches new tabs well inside the KV's 6h TTL.
const ITEMS_RESPONSE_CACHE_HEADERS = { "Cache-Control": "public, max-age=1800" };

async function handleGetItems(env) {
  const cached = await env.CACHE.get(CACHE_KEY, "json");

  if (cached && Date.now() - cached.lastFetched < CACHE_TTL_MS) {
    const [costs, enchantLevelData] = await Promise.all([resolveCosts(env, cached), resolveEnchantLevelData(env, cached.enchants)]);
    return jsonResponse(withExtras(cached, costs, enchantLevelData), 200, ITEMS_RESPONSE_CACHE_HEADERS);
  }

  try {
    const fresh = await buildFreshData();
    await env.CACHE.put(CACHE_KEY, JSON.stringify(fresh));
    const [costs, enchantLevelData] = await Promise.all([resolveCosts(env, fresh), resolveEnchantLevelData(env, fresh.enchants)]);
    return jsonResponse(withExtras(fresh, costs, enchantLevelData), 200, ITEMS_RESPONSE_CACHE_HEADERS);
  } catch (err) {
    console.error("handleGetItems: buildFreshData failed:", err);
    if (cached) {
      const [costs, enchantLevelData] = await Promise.all([resolveCosts(env, cached), resolveEnchantLevelData(env, cached.enchants)]);
      return jsonResponse(withExtras(cached, costs, enchantLevelData), 200, ITEMS_RESPONSE_CACHE_HEADERS);
    }
    return jsonResponse({ error: "Failed to fetch item data", detail: String(err) }, 502);
  }
}

async function handleRefresh(env) {
  try {
    const fresh = await buildFreshData();
    await env.CACHE.put(CACHE_KEY, JSON.stringify(fresh));
    const [costs, enchantLevelData] = await Promise.all([resolveCosts(env, fresh, true), resolveEnchantLevelData(env, fresh.enchants, true)]);
    return jsonResponse(withExtras(fresh, costs, enchantLevelData));
  } catch (err) {
    console.error("handleRefresh: buildFreshData failed:", err);
    return jsonResponse({ error: "Failed to refresh item data", detail: String(err) }, 502);
  }
}

// Mints an id and retries if it is taken. 8 characters from a 62-character alphabet makes a
// collision effectively impossible, but the check keeps a stored blob from being overwritten.
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
    accessoryInnateStats: ACCESSORY_INNATE_STATS_BY_ID,
    lastFetched: Date.now(),
  };
}

async function fetchPetNums() {
  const res = await fetch(NEU_PETNUMS_URL);
  return res.json();
}

// The same NEU-REPO item-file source lib/enchantEffects.js's client-side probe uses, so a page
// falling back to that probe resolves an identical shape.
const NEU_ITEMS_BASE = "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/items";
// A head start rather than a cap: max_xp_table_levels understates enchants that reach higher levels
// by anvil-combining (Power and Sharpness reach VII).
const MAX_ENCHANT_PROBE_LEVEL = 10;
// How many enchant ids to probe at once. Low on purpose: the run is bounded by a subrequest budget,
// and at 10 every id cleared the "enough budget to finish" check at spent=0 and then starved
// mid-probe. At 3 the checks stagger, so a run finishes most of what it starts.
const ENCHANT_PROBE_CONCURRENCY = 3;

// A 404 is the only response that means the level doesn't exist. Rate-limiting, 5xx and dropped
// connections would otherwise truncate an enchant at the failing level and cache that as its max.
//
// Deliberately not retried: a rebuild already fires ~870 requests at one host, so the usual cause of
// a non-404 is that host throttling, and retrying multiplies it. The failure is reported as UNKNOWN,
// so callers keep the levels that resolved and mark the id incomplete for the next rebuild.
const LEVEL_UNKNOWN = Symbol("enchant-level-unknown");

// Cloudflare caps one invocation at 50 subrequests while a full sweep needs ~870, so a rebuild
// spends its budget explicitly, skips ids already complete and merges into the previous cache —
// steady progress across runs rather than re-probing the same first ids every time.
const ENCHANT_SUBREQUEST_BUDGET = 40;

async function fetchEnchantLevel(fileId, level, budget) {
  if (budget.spent >= budget.limit) return LEVEL_UNKNOWN;
  budget.spent += 1;
  const url = `${NEU_ITEMS_BASE}/${encodeURIComponent(`${fileId};${level}`)}.json`;
  try {
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (res.ok) {
      const data = await res.json();
      return { level, lore: data.lore || [] };
    }
    return LEVEL_UNKNOWN;
  } catch {
    return LEVEL_UNKNOWN;
  }
}

// Case varies in NEU's own data (every key lowercase except "PROSECUTE") — check as given, then both cases.
function lookupMaxTableLevel(enchantsMeta, fileId) {
  const table = enchantsMeta?.max_xp_table_levels;
  if (!table) return 0;
  return table[fileId] ?? table[fileId.toLowerCase()] ?? table[fileId.toUpperCase()] ?? 0;
}

// Starts at the enchant table's known max, then probes one level past the last success, so a level
// beyond that max (Power VII) is still found.
async function probeEnchantLevels(fileId, enchantsMeta, budget) {
  let level = Math.max(lookupMaxTableLevel(enchantsMeta, fileId), 1);
  const results = await Promise.all(Array.from({ length: level }, (_, i) => fetchEnchantLevel(fileId, i + 1, budget)));
  const top = () => results[results.length - 1];
  while (top() && top() !== LEVEL_UNKNOWN && level < MAX_ENCHANT_PROBE_LEVEL) {
    level += 1;
    results.push(await fetchEnchantLevel(fileId, level, budget));
  }
  // Keeps whatever resolved but reports whether anything was left unknown: a truncated list must not
  // be served as complete, since the client never re-probes an entry marked complete.
  const complete = !results.includes(LEVEL_UNKNOWN);
  const found = results.filter((r) => r && r !== LEVEL_UNKNOWN);
  if (found.length > 0) return { levels: found, complete };
  // The head start assumes levels begin at 1, which fails for an enchant that only exists
  // pre-leveled: "The One" has data at ULTIMATE_THE_ONE;4 and ;5 only. Falls back to a full sweep
  // when the head start finds nothing, so the common case costs no extra requests.
  const fullSweep = await Promise.all(Array.from({ length: MAX_ENCHANT_PROBE_LEVEL }, (_, i) => fetchEnchantLevel(fileId, i + 1, budget)));
  return {
    levels: fullSweep.filter((r) => r && r !== LEVEL_UNKNOWN),
    complete: !fullSweep.includes(LEVEL_UNKNOWN),
  };
}

// Aliases NEU's enchant_mapping_id/_item tables miss. Duplex is filed under its pre-rename id
// ULTIMATE_REITERATE — every ULTIMATE_DUPLEX;N is a 404. One confirmed alias, not a general rule.
const ENCHANT_FILE_ID_ALIASES = { ultimate_duplex: "ULTIMATE_REITERATE" };

// Resolves a category-list enchant id to its real NEU item file id when they differ (e.g. "dragon_tracer" -> "AIMING").
function resolveAlternateEnchantFileId(enchantsMeta, id) {
  const alias = ENCHANT_FILE_ID_ALIASES[id.toLowerCase()];
  if (alias) return alias;
  const mapItem = enchantsMeta?.enchant_mapping_item || [];
  const mapId = enchantsMeta?.enchant_mapping_id || [];
  const key = id.toLowerCase();
  for (let i = 0; i < mapId.length; i++) {
    if (mapId[i].toLowerCase() === key) return mapItem[i].toUpperCase();
    if (mapItem[i].toLowerCase() === key) return mapId[i].toUpperCase();
  }
  return null;
}

// Runs `fn` over `items` with at most `limit` in flight at once, preserving result order.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Every weapon/armor/equipment enchant id across enchantsMeta's category lists, deduped, probed for
// its per-level lore. Venomous is skipped entirely: its numbers are hardcoded client-side.
// The budget below is roughly what one id costs — head-start batch, extension levels, terminating
// 404 — so a worker never starts an id it cannot finish.
const ENCHANT_ID_BUDGET_HEADROOM = 9;

async function buildEnchantLevelData(enchantsMeta, previous) {
  const ids = new Set();
  for (const list of Object.values(enchantsMeta.enchants || {})) {
    for (const id of list) if (id.toLowerCase() !== "venomous") ids.add(id);
  }
  // Only ids the previous run left unfinished or never reached; a finished one is already cached.
  const done = new Set(Object.keys(previous?.levelData || {}).filter((id) => !(previous?.incomplete || []).includes(id)));
  const pending = [...ids].filter((id) => !done.has(id.toLowerCase())).sort();
  // Rotated by a persisted cursor: without it every run spends its budget on the same first ids and
  // the remaining ~135 are never reached.
  const start = pending.length > 0 ? (previous?.cursor || 0) % pending.length : 0;
  const idList = [...pending.slice(start), ...pending.slice(0, start)];
  const budget = { spent: 0, limit: ENCHANT_SUBREQUEST_BUDGET };
  const attempted = new Set();
  const perId = await mapWithConcurrency(idList, ENCHANT_PROBE_CONCURRENCY, async (id) => {
    if (budget.spent + ENCHANT_ID_BUDGET_HEADROOM > budget.limit) return { levels: [], complete: false, skipped: true };
    attempted.add(id);
    let result = await probeEnchantLevels(id.toUpperCase(), enchantsMeta, budget);
    if (result.levels.length === 0) {
      const altFileId = resolveAlternateEnchantFileId(enchantsMeta, id);
      if (altFileId) result = await probeEnchantLevels(altFileId, enchantsMeta, budget);
    }
    return result;
  });
  const levelData = {};
  const incomplete = [];
  idList.forEach((id, i) => {
    const key = id.toLowerCase();
    // A skipped id contributes nothing: the merge keeps its cached version and it stays on the
    // incomplete list for a later run.
    if (perId[i].skipped) {
      incomplete.push(key);
      return;
    }
    if (perId[i].levels.length > 0) levelData[key] = perId[i].levels;
    if (!perId[i].complete) incomplete.push(key);
  });
  // Advance past what this run actually attempted (at least one, so a pathological run still moves).
  return { levelData, incomplete, cursor: (start + Math.max(attempted.size, 1)) % Math.max(pending.length, 1) };
}

// Merges a fresh rebuild over the previous cache so a throttled run cannot lose ground: an id keeps
// whichever version reached the higher level, and leaves the incomplete list only once a run
// resolves it end to end.
function mergeEnchantLevelData(previous, fresh) {
  const levelData = { ...(previous?.levelData || {}) };
  const stillIncomplete = new Set(previous?.incomplete || []);
  for (const [id, levels] of Object.entries(fresh.levelData)) {
    const prev = levelData[id];
    const prevMax = prev ? prev[prev.length - 1].level : 0;
    if (levels[levels.length - 1].level >= prevMax) levelData[id] = levels;
  }
  for (const id of fresh.incomplete) stillIncomplete.add(id);
  // An id this run finished is trustworthy now regardless of what an earlier run recorded.
  for (const id of Object.keys(fresh.levelData)) {
    if (!fresh.incomplete.includes(id)) stillIncomplete.delete(id);
  }
  return { levelData, incomplete: [...stillIncomplete], cursor: fresh.cursor || 0 };
}

// Manual only: an ordinary /api/items read serves whatever KV holds and never rebuilds, however old
// it is. Only POST /api/refresh probes GitHub, one subrequest budget per call, so converging a cold
// cache takes ~25 calls until `levelDataIncomplete` is empty. Meanwhile the client probes any
// missing or incomplete id live (enchantEffects.js's fetchEnchantLevels). A build failure falls
// back to what is already cached.
async function resolveEnchantLevelData(env, enchantsMeta, force = false) {
  const cachedRaw = await env.CACHE.get(ENCHANT_LEVELS_CACHE_KEY, "json");
  const cached = cachedRaw
    ? { levelData: cachedRaw.levelData || {}, incomplete: cachedRaw.incomplete || [], cursor: cachedRaw.cursor || 0 }
    : { levelData: {}, incomplete: [], cursor: 0 };
  if (!force) return cached;

  try {
    const merged = mergeEnchantLevelData(cached, await buildEnchantLevelData(enchantsMeta, cached));
    await env.CACHE.put(ENCHANT_LEVELS_CACHE_KEY, JSON.stringify({ ...merged, lastFetched: Date.now() }));
    return merged;
  } catch (err) {
    console.error("resolveEnchantLevelData: build failed:", err);
    return cached;
  }
}

// Merges the two independently-cached extras (coin costs, enchant level lore) into the catalog on
// the way out; shared by handleGetItems' three return paths and handleRefresh.
function withExtras(catalog, costs, enchantLevelData) {
  return {
    ...catalog,
    enchants: {
      ...catalog.enchants,
      levelData: enchantLevelData.levelData,
      // Ids whose last probe didn't finish: the client re-probes these live rather than trusting a
      // possibly truncated list.
      levelDataIncomplete: enchantLevelData.incomplete,
    },
    costs,
  };
}

async function fetchAttributeShards() {
  const res = await fetch(NEU_ATTRIBUTE_SHARDS_URL);
  return res.json();
}

// Maps this app's Attribute ids (frontend/src/lib/attributes.js's ATTRIBUTE_IDS) to the bazaar
// shard's internalName without the ";1" suffix, matched by abilityName. 6 of the 17 Ruler shards
// carry legacy names from before the ability was renamed (Arthropod=ARACHNO, Ender=ENDER,
// Infernal=BLAZING, Pest=INSECT_POWER, Undead=UNDEAD, Woodland=SPIRIT_AXE), and Humanoid Ruler needs
// the "_NEW" variant. Every other id matches its shard 1:1.
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
  // "Mimic" is the shard's displayName; its internalName, and so its price-feed key, is its ability
  // name Faker — the one entry here where the two differ.
  mimic: "ATTRIBUTE_SHARD_FAKER",
  // "End Stone Protector", ability name "Unlimited Fortitude" — LEGENDARY, so 24 shards to level
  // 10. Grants Defense, which only the Ankylosaurus pet reads (frontend/src/lib/playerDefense.js).
  fortitude: "ATTRIBUTE_SHARD_FORTITUDE",
  // "Hideonring" — RARE, +1 Accessory Bag slot per level. Not a damage stat: it's priced so the
  // Optimizer can charge a new accessory for the bag slot it needs (frontend/src/lib/accessorySlots.js).
  accessory_size: "ATTRIBUTE_SHARD_ACCESSORY_SIZE",
};

// Total shards to reach an attribute's max level (always 10 — rarity changes the per-level shard
// cost, not the cap) times its shard price. `attributeShards` is attribute_shards.json's parsed
// body; `itemPrices` is the unpruned map, since shard ids don't survive pruneItemPrices.
//
// Also returns attributeCostsByLevel: the shard price times the cumulative shards through each
// level, so the client can price what the current level cost as well as what maxing would.
// [level - 1] is the cumulative cost to reach `level` from 0.
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

async function fetchEssenceShops() {
  const res = await fetch(NEU_ESSENCE_SHOPS_URL);
  return res.json();
}

// Coin cost to reach each level of every Essence-shop perk: { <perkKey>: [cumulative coins per
// level] }, index = level - 1. Cumulative, so any jump is cumulative[to-1] - cumulative[from-1].
// A perk whose essence has no price is omitted rather than shipped as 0, so it reads as unpriced.
function computeEssencePerkCosts(essenceShops, itemPrices) {
  const out = {};
  for (const [essenceId, perks] of Object.entries(essenceShops || {})) {
    const essencePrice = itemPrices[essenceId];
    if (!essencePrice) continue;
    for (const [perkKey, def] of Object.entries(perks || {})) {
      if (!Array.isArray(def?.costs) || def.costs.length === 0) continue;
      let running = 0;
      out[perkKey] = def.costs.map((amount) => (running += (amount || 0) * essencePrice));
    }
  }
  return out;
}

async function fetchEssenceCosts() {
  const res = await fetch(NEU_ESSENCE_COSTS_URL);
  return res.json();
}

// { "<star>": coins } for one item, from NEU's per-star material list. Stars 1-3 carry no coin line.
function parseStarCoinCosts(entry) {
  const out = {};
  for (const [star, materials] of Object.entries(entry?.items || {})) {
    for (const material of materials || []) {
      const [id, amount] = String(material).split(":");
      if (id === "SKYBLOCK_COIN") out[star] = Number(amount) || 0;
    }
  }
  return out;
}

async function fetchHypixelItems() {
  const res = await fetch(HYPIXEL_ITEMS_URL);
  const body = await res.json();
  return body.items || [];
}

// Coin cost of one Kuudra armor tier-up, keyed by the item consumed:
// { <sourceItemId>: { to: <nextItemId>, coins } }. A tier-up eats the worn piece plus a material
// list, so its price is those materials at market rather than the gap between two auction prices.
// Each hop is stored separately, so a multi-tier jump is summed by walking `to`.
function computePrestigeCosts(hypixelItems, itemPrices) {
  const out = {};
  for (const item of hypixelItems) {
    const prestige = item.prestige;
    if (!prestige?.item_id || !Array.isArray(prestige.costs)) continue;
    let coins = 0;
    for (const cost of prestige.costs) {
      if (cost.type === "ESSENCE") coins += (cost.amount || 0) * (itemPrices[`ESSENCE_${cost.essence_type}`] || 0);
      else if (cost.type === "ITEM") coins += (cost.amount || 0) * (itemPrices[cost.item_id] || 0);
      else if (cost.type === "COINS") coins += cost.coins || 0;
    }
    const step = kuudraPrestigeStepIndex(item.id);
    out[item.id] = { to: prestige.item_id, coins: coins + (KUUDRA_PRESTIGE_COIN_FEE_BY_STEP[step] || 0) };
  }
  return out;
}

// Coin cost per star level from one item's upgrade_costs. Each star's entry is ESSENCE_<type>, an
// item id, or flat coins, summed cumulatively so star N is everything spent from bare to N.
function computeStarCosts(itemId, upgradeCosts, itemPrices, starCoinCosts, out) {
  let cumulative = 0;
  upgradeCosts.forEach((level, i) => {
    for (const cost of level) {
      if (cost.type === "ESSENCE") cumulative += (cost.amount || 0) * (itemPrices[`ESSENCE_${cost.essence_type}`] || 0);
      else if (cost.type === "ITEM") cumulative += (cost.amount || 0) * (itemPrices[cost.item_id] || 0);
      else if (cost.type === "COINS") cumulative += cost.coins || 0;
    }
    // The raw coin fee every star past the 3rd carries, which Hypixel's upgrade_costs omits (see
    // NEU_ESSENCE_COSTS_URL). The COINS branch above stays: it is the real shape of Hypixel's data.
    cumulative += starCoinCosts[String(i + 1)] || 0;
    out[`${itemId}_${i + 1}`] = cumulative;
  });
}

// Coin cost to unlock one gemstone slot. Not cumulative — a slot is a single flat purchase (coins
// plus specific-tier gem items). It varies per item and per slot index (Hyperion's SAPPHIRE slot is
// 250k + 4 Flawless Sapphire, Voidedge Katana's 100k + 40 Fine Sapphire), so it resolves per
// (item, slotIndex) pair rather than per slot type.
function computeGemstoneUnlockCost(costs, itemPrices) {
  let total = 0;
  for (const cost of costs || []) {
    if (cost.type === "ITEM") total += (cost.amount || 0) * (itemPrices[cost.item_id] || 0);
    else if (cost.type === "COINS") total += cost.coins || 0;
  }
  return total;
}

// Coin costs for everything the Optimizer's candidates can reference, in its own KV key and TTL,
// independent of the item-catalog cache. Computed once per refresh cycle, since a candidate's coin
// cost is loadout-independent. `catalog` is whichever catalog object the caller is about to respond
// with, reused for its already-resolved reforgeStones/pets/armor/weapons.
async function resolveCosts(env, catalog, force = false) {
  const cachedRaw = await env.CACHE.get(PRICES_CACHE_KEY, "json");
  if (!force && cachedRaw && Date.now() - cachedRaw.lastFetched < PRICES_CACHE_TTL_MS) {
    return cachedRaw.costs;
  }

  try {
    const [itemPrices, attributeShards, hypixelItems, essenceCosts, essenceShops] = await Promise.all([
      fetchPrices(),
      fetchAttributeShards(),
      fetchHypixelItems(),
      fetchEssenceCosts(),
      fetchEssenceShops(),
    ]);
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
    const gemstoneUnlockCosts = {};
    for (const item of [...armor, ...weapons]) {
      if (item.upgrade_costs) computeStarCosts(item.id, item.upgrade_costs, itemPrices, parseStarCoinCosts(essenceCosts[item.id]), starCosts);
      if (item.gemstone_slots) {
        item.gemstone_slots.forEach((slot, i) => {
          if (slot.costs) gemstoneUnlockCosts[`${item.id}_${i}`] = computeGemstoneUnlockCost(slot.costs, itemPrices);
        });
      }
    }

    const costs = {
      itemPrices: pruneItemPrices(itemPrices, catalog),
      reforgeCosts,
      recombobulatorCost,
      petCosts,
      starCosts,
      gemstoneUnlockCosts,
      prestigeCosts: computePrestigeCosts(hypixelItems, itemPrices),
      essencePerkCosts: computeEssencePerkCosts(essenceShops, itemPrices),
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
          gemstoneUnlockCosts: {},
          prestigeCosts: {},
          essencePerkCosts: {},
          attributeCosts: {},
          attributeCostsByLevel: {},
        };
  }
}

async function fetchReforges() {
  const res = await fetch(NEU_REFORGES_URL);
  return res.json();
}

// Re-keys reforgestones.json by reforgeName rather than stone item id, keeping stoneId for icons.
// `nbtModifier` (about 1 entry in 10) is Hypixel's own ExtraAttributes.modifier id where it diverges
// from a lowercase-underscore of the display name — Bloodshot is "blood_shot", Warped "aote_stone" —
// so the import can match an account's item back to the right reforge.
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

// Currently-worn gear is the default source for both armor and equipment: member.loadout's own
// equipped_set pointer can name an empty saved set, so it is ignored. Either can instead come from a
// user-picked Wardrobe set (wardrobeSets/wardrobeEquipmentSets below).
const WEAPON_IDS = new Set(weapons.map((w) => w.id));

// Magical Power contributed per accessory rarity.
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

// Longest first, so "VERY SPECIAL" matches before "SPECIAL".
const TIER_WORDS = ["VERY SPECIAL", "MYTHIC", "LEGENDARY", "EPIC", "RARE", "UNCOMMON", "COMMON", "SPECIAL"];

// An accessory's current rarity comes from its own per-instance lore (the last non-empty line, e.g.
// "LEGENDARY ACCESSORY") rather than from the catalog's base tier plus a recombobulator bump. That
// inference is wrong for accessories whose tier is a per-player value (Power Relic, Pulse Ring, Book
// of Progression, Runebook, Trapper Crest) and misses cosmetics (Party Hats) absent from the catalog.
function realAccessoryTier(item) {
  const lore = item?.tag?.display?.Lore;
  if (!lore || lore.length === 0) return null;
  const lastLine = lore[lore.length - 1]
    .replace(/§./g, "")
    .replace(/[^A-Za-z ]/g, "")
    .trim();
  // A real accessory's tag ends in "ACCESSORY" (hats say "HATCESSORY", see isHatAccessory). Without
  // this check any item in the scanned inventories would match, since every tier line carries a
  // TIER_WORD.
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
// (Strength/Crit Chance/Crit Damage only; no real accessory has Crit Chance as a base stat, so
// that key is here for completeness but never actually matches anything today) — used to read the real "Stat: +X" lore line
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

// "Grants +X Y[, and +Z W]." / "Increases your X[ and Y] by +Z ..." phrasing — see
// ACCESSORY_STAT_NAME_TO_KEY above. Bonuses with no fixed number in lore (Gravity Talisman's
// distance scaling, Blood God Crest's kill counter) resolve to 0 rather than a guess.
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

// The accessories confirmed to carry Strength or Crit Damage as a base stat, either as a leading
// "Stat: +X" line or the narrative phrasing above. Crit Chance is never an accessory base stat.
// A fixed list rather than every bag item, both to avoid matching flavour text and to leave out
// accessories whose Strength depends on a momentary combat state (the Bat Person line, Reaper Orb)
// or on Dungeon Master Mode (Master Skulls).
//
// Blood God Crest and Sigil scale with a lifetime kill counter that Hypixel bakes into the leading
// line, so both are included and resolve to whatever the account's counter shows. Magic 8 Ball
// rerolls its category each Season and contributes only while it lands on Combat. Artifact and Relic
// of Power have no pristine stat line — an owned copy renders one from its socketed gems, which
// parseLeadingStatLines picks up generically.
const PARSABLE_ACCESSORY_STAT_IDS = new Set([
  "BLOOD_GOD_CREST", "BLOOD_GOD_SIGIL",
  "BURSTSTOPPER_TALISMAN", "BURSTSTOPPER_ARTIFACT",
  "DAY_CRYSTAL", "NIGHT_CRYSTAL", "MOONLIGHT_CRYSTAL", "SUNSHINE_CRYSTAL",
  "RAGGEDY_SHARK_TOOTH_NECKLACE", "DULL_SHARK_TOOTH_NECKLACE", "HONED_SHARK_TOOTH_NECKLACE",
  "SHARP_SHARK_TOOTH_NECKLACE", "RAZOR_SHARP_SHARK_TOOTH_NECKLACE",
  "MAGIC_8_BALL",
  "RED_CLAW_TALISMAN", "RED_CLAW_RING", "RED_CLAW_ARTIFACT",
  "TINY_DANCER",
  "POWER_ARTIFACT", "POWER_RELIC",
]);

// Gravity Talisman grants +1 to +10 Strength and Defense by distance to spawn, a live positional
// value no static lore carries. Averaged to a flat +5.
const GRAVITY_TALISMAN_AVERAGE_STRENGTH = 5;

// An accessory's innate Strength/Crit Chance/Crit Damage, parsed from the catalog's pristine lore
// through the same parsers used on a live account's NBT above. These ids' stat lines are fixed
// per-tier constants (Blood God Crest/Sigil and Magic 8 Ball excepted, as above), so the result
// matches what an owned copy computes. Lets the Optimizer's "New Accessory" candidates count the
// innate bonus rather than only the Magical Power contribution.
const ACCESSORY_INNATE_STATS_BY_ID = (() => {
  const out = {};
  for (const item of accessories) {
    if (item.id === "GRAVITY_TALISMAN") {
      out[item.id] = { strength: GRAVITY_TALISMAN_AVERAGE_STRENGTH };
      continue;
    }
    if (!PARSABLE_ACCESSORY_STAT_IDS.has(item.id)) continue;
    const stats = { ...parseNarrativeStatGrants(item.lore), ...parseLeadingStatLines(item.lore) };
    if (Object.keys(stats).length > 0) out[item.id] = stats;
  }
  return out;
})();

// General's Medallion: the per-account Catacombs Stats Boost digit count, baked into the owned
// copy's own lore ("Bonus: +4%") the way Midas Sword's "Price paid" and Crown of Avarice's "Coins
// Consumed" are. Hypixel caps it at 6%, matching lib/dungeonize.js's
// MAX_GENERALS_MEDALLION_DIGITS, so no extra clamp is needed.
function parseGeneralsMedallionDigits(lore) {
  for (const rawLine of lore || []) {
    const line = stripLoreLine(rawLine).trim();
    const match = /^Bonus:\s*\+(\d+)%/.exec(line);
    if (match) return parseInt(match[1], 10);
  }
  return 0;
}

// Computes live Magical Power from the Accessory Bag's rarities, each owned accessory's own stat
// line (for the ids in PARSABLE_ACCESSORY_STAT_IDS), and a total Enrichments count from the decoded
// bag. Two dedup rules:
// - Several copies of one accessory id count once, at the best copy.
// - Hat accessories are mutually exclusive as a group: only the highest-Magical-Power hat counts.
// Enrichments: ExtraAttributes.talisman_enrichment names the stat (e.g. "critical_chance", matching
// the TALISMAN_ENRICHMENT_<STAT> item id suffix). They are tallied per stat (ENRICHMENT_STAT_MAP)
// and the dominant tracked stat becomes enrichmentType, with enrichmentCount set to that stat's own
// count, since the UI represents one stat and one count. With no enrichment on a tracked stat it
// falls back to type 'none' and the flat total.
const ENRICHMENT_STAT_MAP = {
  strength: "strength",
  critical_damage: "crit_damage",
  critical_chance: "crit_chance",
  intelligence: "intelligence",
  attack_speed: "bonus_attack_speed",
};
// `abiphoneContactCount` (the Abiphone's contact_data key count) adds floor(count/2) Magical Power,
// but only while an Abicase accessory is owned.
// Bestiary tier caps this app models (frontend/src/lib/bestiaryStrength.js): only mobs whose cap is
// 15 or 20 grant Strength. Every bestiary.json family is scanned, since combat mobs this app tracks
// (Rat, Squid, Sheep, Zealot, Werewolf, Yeti) sit under farming/foraging/fishing/garden families.
const BESTIARY_FAMILY_KEYS = [
  "dynamic",
  "hub",
  "farming_1",
  "combat_1",
  "combat_3",
  "crimson_isle",
  "mining_2",
  "mining_3",
  "crystal_hollows",
  "foraging_1",
  "foraging_2",
  "spooky_festival",
  "mythological_creatures",
  "jerry",
  "kuudra",
  "fishing",
  "catacombs",
  "garden",
  "lotus_atoll",
  "foraging_3",
  "safari",
];
const BESTIARY_STRENGTH_TIERS = new Set([15, 20]);

function stripBestiaryColor(s) {
  return (s || "").replace(/§./g, "").trim();
}

async function fetchBestiary() {
  const res = await fetch(NEU_BESTIARY_URL);
  return res.json();
}

// Mob names (matching this app's MOB_TYPES keys) the account has maxed the Bestiary on, derived from
// member.bestiary.kills summed per family against that family's own `cap`. Only families whose max
// tier is 15 or 20 are checked, since those are the ones with a confirmed Strength bonus.
function computeBestiaryMaxedMobs(bestiary, kills) {
  const maxed = [];
  for (const familyKey of BESTIARY_FAMILY_KEYS) {
    const family = bestiary[familyKey];
    if (!family?.mobs) continue;
    for (const mobFamily of family.mobs) {
      const name = stripBestiaryColor(mobFamily.name);
      if (!name) continue;
      const bracket = bestiary.brackets[String(mobFamily.bracket)];
      if (!bracket || typeof mobFamily.cap !== "number") continue;
      const maxTier = bracket.indexOf(mobFamily.cap) + 1;
      if (!BESTIARY_STRENGTH_TIERS.has(maxTier)) continue;
      const totalKills = (mobFamily.mobs || []).reduce((sum, subId) => sum + (kills?.[subId] || 0), 0);
      if (totalKills >= mobFamily.cap) maxed.push(name);
    }
  }
  return maxed;
}

async function fetchCollections() {
  const res = await fetch(HYPIXEL_COLLECTIONS_URL);
  return res.json();
}

// Count of collections the account has taken to the final tier, which "The One" scales with.
// `collectionsResource` is Hypixel's collections resource (max-tier amountRequired per item);
// `playerCollections` is member.collection, a flat {itemId: totalAmount} map, null when the account
// has that API setting off. A collection is maxed once its total reaches the last tier's requirement.
function computeMaxedCollectionsCount(collectionsResource, playerCollections) {
  if (!playerCollections) return null;
  const categories = collectionsResource?.collections || {};
  let count = 0;
  for (const category of Object.values(categories)) {
    for (const [itemId, meta] of Object.entries(category.items || {})) {
      const tiers = meta.tiers || [];
      if (tiers.length === 0) continue;
      const maxAmount = tiers[tiers.length - 1].amountRequired;
      if ((playerCollections[itemId] || 0) >= maxAmount) count++;
    }
  }
  return count;
}

// Daedalus Blade's "Combined Mythological Bestiary Tiers" (frontend/src/lib/specialWeapons.js, kind
// 'bestiary'): the sum of each Mythological mob's CURRENT Bestiary tier, not a maxed/not-maxed flag.
// Recomputed from member.bestiary.kills so it is available for a Daedalus Blade the player doesn't
// own yet. Scoped to bestiary.json's "mythological_creatures" family, the 12 mobs matching the
// weapon's own lore label.
function computeCombinedMythologicalBestiaryTiers(bestiary, kills) {
  const family = bestiary.mythological_creatures;
  if (!family?.mobs) return 0;
  let total = 0;
  for (const mobFamily of family.mobs) {
    const bracket = bestiary.brackets[String(mobFamily.bracket)];
    if (!bracket || typeof mobFamily.cap !== "number") continue;
    const maxTier = bracket.indexOf(mobFamily.cap) + 1;
    if (maxTier <= 0) continue;
    const totalKills = (mobFamily.mobs || []).reduce((sum, subId) => sum + (kills?.[subId] || 0), 0);
    const currentTier = Math.min(bracket.filter((threshold) => totalKills >= threshold).length, maxTier);
    total += currentTier;
  }
  return total;
}

function computeLiveAccessoryStats(items, abiphoneContactCount) {
  const bestMagicalPowerById = new Map();
  const bestStatById = {}; // statKey -> Map<id, value>
  let hatMagicalPower = 0;
  let hasAbicase = false;
  let enrichmentCount = 0;
  const enrichmentCountByStat = {}; // real Hypixel stat id -> count
  let generalsMedallionDigits = 0;
  let masterSkullTier = 0;

  for (const raw of items) {
    const ea = raw?.tag?.ExtraAttributes;
    const id = ea?.id;
    if (!id) continue;

    const tier = realAccessoryTier(raw);
    let magicalPower = tier && RARITY_MAGICAL_POWER[tier] != null ? RARITY_MAGICAL_POWER[tier] : 0;
    // Hegemony Artifact doubles its own Magical Power contribution.
    if (id === "HEGEMONY_ARTIFACT") magicalPower *= 2;
    if (isHatAccessory(raw)) {
      hatMagicalPower = Math.max(hatMagicalPower, magicalPower);
    } else {
      bestMagicalPowerById.set(id, Math.max(bestMagicalPowerById.get(id) || 0, magicalPower));
    }
    if (ea.talisman_enrichment) {
      enrichmentCount++;
      enrichmentCountByStat[ea.talisman_enrichment] = (enrichmentCountByStat[ea.talisman_enrichment] || 0) + 1;
    }
    if (id === "ABICASE") hasAbicase = true;
    // Master Skull tier; its Strength multiplier is applied client-side (lib/masterSkull.js). The
    // highest owned tier wins, same best-copy dedup as the rest of this loop.
    const skullTier = MASTER_SKULL_ID_RE.exec(id);
    if (skullTier) masterSkullTier = Math.max(masterSkullTier, Number(skullTier[1]));
    // Highest-digit copy wins, same dedup as Magical Power and itemStats above.
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

  // Pre-selects the tracked stat (ENRICHMENT_STAT_MAP) with the most enrichments, falling back to
  // 'none' with the flat total when no enrichment sits on a tracked stat.
  let enrichmentType = "none";
  let bestTrackedCount = 0;
  for (const [rawStat, count] of Object.entries(enrichmentCountByStat)) {
    const mapped = ENRICHMENT_STAT_MAP[rawStat];
    if (mapped && count > bestTrackedCount) {
      enrichmentType = mapped;
      bestTrackedCount = count;
    }
  }
  if (enrichmentType !== "none") enrichmentCount = bestTrackedCount;

  return { magicalPower, itemStats, enrichmentCount, enrichmentType, generalsMedallionDigits, masterSkullTier };
}

// Inventory array index -> our slot name, for the 4-piece flat lists Hypixel returns.
const ARMOR_SLOT_ORDER = ["boots", "leggings", "chestplate", "helmet"];
const EQUIPMENT_SLOT_ORDER = ["necklace", "cloak", "belt", "gloves"];

// Wardrobe data is not one combined blob: it lives at member.loadout.armor / member.loadout.equipment,
// keyed by 1-based set-number strings plus a non-numeric "equipped_set" pointer to skip. Each set
// holds one separately gzip+base64-encoded NBT blob per slot, present only when that slot has an item.
const WARDROBE_ARMOR_SLOT_KEYS = { helmet: "HELMET", chestplate: "CHESTPLATE", leggings: "LEGGINGS", boots: "BOOTS" };
const WARDROBE_EQUIPMENT_SLOT_KEYS = { necklace: "EQUIPMENT_SLOT_1", cloak: "EQUIPMENT_SLOT_2", belt: "EQUIPMENT_SLOT_3", gloves: "EQUIPMENT_SLOT_4" };

// Decodes member.loadout.armor or .equipment into non-empty sets, each {index, <slot>: summary|null}.
// slotKeys maps our slot names to the per-slot NBT key names. Every slot of every set decodes
// concurrently — an account can hold ~19-27 sets, so an import is dozens of small decodes.
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

// Pet level XP curve per rarity: cumulative XP to reach level x is a*(b^x - 1). Golden/Rose/Jade
// Dragon cap at 200, following the Legendary curve through level 102 and a flat 1,886,700 XP per
// level after that.
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

// Heart of the Mountain lives in member.skill_tree rather than member.mining_core, and an account
// holds several trees (nodes.mining, .mining_2 ... .mining_5) of which only the one
// selected_skill_tree_slot.mining names is equipped; slot 1 is the unsuffixed key. Each node carries
// a sibling `toggle_<node>` flag, and a node toggled off grants nothing.
function hotmNodeLevel(skillTree, node) {
  const slot = Math.floor(Number(skillTree?.selected_skill_tree_slot?.mining) || 1);
  const nodes = skillTree?.nodes?.[slot > 1 ? `mining_${slot}` : "mining"];
  if (!nodes || nodes[`toggle_${node}`] === false) return 0;
  return Math.max(0, Math.floor(Number(nodes[node]) || 0));
}

const MASTER_SKULL_ID_RE = /^MASTER_SKULL_TIER_([1-7])$/;

// Mirrors frontend/src/lib/essencePerks.js's TRACKED_PERK_KEYS; the Worker and frontend share no module.
const TRACKED_ESSENCE_PERK_KEYS = [
  "permanent_strength",
  "permanent_intelligence",
  "blessing_of_time",
  "catacombs_strength",
  "catacombs_intelligence",
  "catacombs_crit_damage",
  "bane",
  "edrag_cd",
  "dragon_reforges_buff",
];

// "ATTRIBUTE_SHARD_FROST_ELEMENTAL;1" -> "frost_elemental", the key format Hypixel uses in
// member.attributes.stacks.
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
    // api.mojang.com blocks Cloudflare Workers' shared egress IPs (403 plus a challenge page), so
    // PlayerDB proxies the same lookup.
    let lookupRes;
    try {
      lookupRes = await fetch(`https://playerdb.co/api/player/minecraft/${encodeURIComponent(username)}`);
    } catch (err) {
      console.error("handleHypixelImport: PlayerDB lookup failed:", err);
      return jsonResponse({ error: "Username lookup failed, try again", code: "lookup_failed" }, 502);
    }
    const lookup = await lookupRes.json().catch(() => null);
    if (!lookupRes.ok || !lookup?.success) {
      // PlayerDB returns 400 + "minecraft.invalid_username" for nonexistent and malformed usernames;
      // "player.not_found"/404 is kept as a fallback.
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

  // Also returned on success, so the client can offer a switch to another profile without a
  // second round trip.
  const profileList = profiles.map((p) => ({
    profile_id: p.profile_id,
    cute_name: p.cute_name,
    selected: !!p.selected,
    game_mode: p.game_mode || null,
  }));

  let profile = profileParam ? profiles.find((p) => p.profile_id === profileParam) : null;
  if (!profile && !profileParam) {
    profile = profiles.length === 1 ? profiles[0] : profiles.find((p) => p.selected) || null;
  }
  if (!profile) {
    return jsonResponse({
      needsProfileSelection: true,
      uuid,
      username: resolvedUsername,
      profiles: profileList,
    });
  }

  const member = profile.members && profile.members[uuid];
  if (!member) {
    return jsonResponse({ error: "Couldn't find this player's data on that profile" }, 404);
  }

  try {
    // Backpack contents live under `inventory.backpack_contents`, keyed "0", "1", ... by in-game
    // slot, decoded in that order so "Backpack 1", "Backpack 2" match what the player sees.
    const backpackContents = member.inventory?.backpack_contents || {};
    const backpackIds = Object.keys(backpackContents).sort((a, b) => Number(a) - Number(b));

    const [armorItems, equipmentItems, invItems, enderChestItems, backpackItemLists, talismanBagItems, attributeShards, leveling, skillsResource, bestiary, collectionsResource] =
      await Promise.all([
        member.inventory?.inv_armor?.data ? decodeInventoryB64(member.inventory.inv_armor.data) : [],
        member.inventory?.equipment_contents?.data ? decodeInventoryB64(member.inventory.equipment_contents.data) : [],
        member.inventory?.inv_contents?.data ? decodeInventoryB64(member.inventory.inv_contents.data) : [],
        // Every unlocked Ender Chest page arrives as one combined blob, so no per-page fetch is needed.
        member.inventory?.ender_chest_contents?.data ? decodeInventoryB64(member.inventory.ender_chest_contents.data) : [],
        Promise.all(backpackIds.map((id) => (backpackContents[id]?.data ? decodeInventoryB64(backpackContents[id].data) : []))),
        // The Accessory Bag contents (Hypixel's own internal name for it), used to compute live
        // Magical Power rather than accessory_bag_storage.highest_magical_power, a high-water mark
        // that never drops when accessories leave the bag.
        member.inventory?.bag_contents?.talisman_bag?.data ? decodeInventoryB64(member.inventory.bag_contents.talisman_bag.data) : [],
        fetch(NEU_ATTRIBUTE_SHARDS_URL).then((r) => r.json()),
        fetch(NEU_LEVELING_URL).then((r) => r.json()),
        fetch(HYPIXEL_SKILLS_URL).then((r) => r.json()),
        fetchBestiary(),
        fetchCollections(),
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

    // Weapon: every item across Inventory, Ender Chest and Backpacks whose id is a known weapon.
    // Skyblock has no dedicated weapon slot, so every candidate is returned and the frontend lets the
    // user pick. Each is tagged with `location`, and duplicates are kept as separate candidates.
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

    // Every pet the account owns, not only the equipped one, for the frontend's picker. `active`
    // flags whichever Hypixel currently has equipped, so the picker can default to it.
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
    // member.player_data.perks is the flat {perkKey: level} map of Essence-shop perks;
    // forbidden_blessing is the Wither one, max 10. The Mimic shard is not resolved here — it is a
    // normal attribute (`stacks.faker`) and comes out of computeAttributeLevels.
    const forbiddenBlessingLevel = Math.min(10, member.player_data?.perks?.forbidden_blessing || 0);
    // Every Essence-shop perk level this app models (frontend/src/lib/essencePerks.js), filtered to
    // the tracked keys — the raw map is ~300 entries, mostly fishing/mining/farming perks.
    const perks = member.player_data?.perks || {};
    const essencePerks = {};
    for (const key of TRACKED_ESSENCE_PERK_KEYS) {
      const level = Math.floor(perks[key] || 0);
      if (level > 0) essencePerks[key] = level;
    }

    // Heart of the Mountain's Lonesome Miner perk — a flat Strength/Crit Damage boost while on a
    // Mining Island (frontend/src/lib/miningIslands.js), capped at level 45.
    const lonesomeMinerLevel = Math.min(45, hotmNodeLevel(member.skill_tree, "lonesome_miner"));

    // Hypixel's own skill ids are uppercase (e.g. "TAMING") — real maxLevel per skill, falling
    // back to NEU-REPO's static cap only if the live resource is ever missing that skill.
    const skillCap = (key, staticCap) => skillsResource?.skills?.[key.toUpperCase()]?.maxLevel || staticCap;

    const experience = member.player_data?.experience || {};
    const skills = {
      alchemy: computeSkillLevel(experience.SKILL_ALCHEMY || 0, leveling.leveling_xp, skillCap("alchemy", leveling.leveling_caps.alchemy)),
      enchanting: computeSkillLevel(experience.SKILL_ENCHANTING || 0, leveling.leveling_xp, skillCap("enchanting", leveling.leveling_caps.enchanting)),
      combat: computeSkillLevel(experience.SKILL_COMBAT || 0, leveling.leveling_xp, skillCap("combat", leveling.leveling_caps.combat)),
      foraging: computeSkillLevel(experience.SKILL_FORAGING || 0, leveling.leveling_xp, skillCap("foraging", leveling.leveling_caps.foraging)),
      // Mining feeds the player's Defense, which only the Ankylosaurus pet reads — see
      // frontend/src/lib/playerDefense.js.
      mining: computeSkillLevel(experience.SKILL_MINING || 0, leveling.leveling_xp, skillCap("mining", leveling.leveling_caps.mining)),
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

    // Catacombs class levels, off the same XP table as the Catacombs level itself. Hypixel's own
    // key for Berserker is "berserk", and Healer and Tank are separate here even though the app
    // merges them (neither grants damage). `selected` is the class the player last picked in-game,
    // which the import uses to default the class dropdown.
    const classLevel = (key) =>
      computeSkillLevel(
        member.dungeons?.player_classes?.[key]?.experience || 0,
        leveling.catacombs,
        leveling.leveling_caps.catacombs,
      );
    const dungeonClasses = {
      selected: member.dungeons?.selected_dungeon_class || null,
      mage: classLevel("mage"),
      archer: classLevel("archer"),
      berserk: classLevel("berserk"),
      healer: classLevel("healer"),
      tank: classLevel("tank"),
    };

    const slayers = {
      wolf: highestClaimedSlayerLevel(member.slayer?.slayer_bosses?.wolf),
      // Tarantula Broodfather is Hypixel's real internal key "spider".
      spider: highestClaimedSlayerLevel(member.slayer?.slayer_bosses?.spider),
      // Inferno Demonlord is Hypixel's real internal key "blaze".
      blaze: highestClaimedSlayerLevel(member.slayer?.slayer_bosses?.blaze),
    };

    // Live Magical Power and per-accessory stats from the decoded Accessory Bag. Magical Power falls
    // back to the account's highest-ever peak only when the bag itself couldn't be decoded;
    // itemStats has no fallback, being derivable only from the live bag.
    const abiphoneContactCount = Object.keys(member.nether_island_player_data?.abiphone?.contact_data || {}).length;
    const liveAccessoryStats = computeLiveAccessoryStats(talismanBagItems, abiphoneContactCount);
    const accessory = {
      selectedPower: member.accessory_bag_storage?.selected_power || null,
      // The two readable inputs to the Accessory Bag's size: Jacobus purchases (+2 slots each) and
      // the Redstone Dust collection (6 slots per collection tier). See
      // frontend/src/lib/accessorySlots.js — the Optimizer prices a new accessory's bag slot from these.
      bagUpgradesPurchased: member.accessory_bag_storage?.bag_upgrades_purchased || 0,
      redstoneCollection: member.collection?.REDSTONE || 0,
      magicalPower: talismanBagItems.length > 0 ? liveAccessoryStats.magicalPower : member.accessory_bag_storage?.highest_magical_power || 0,
      // Every owned accessory's own stat line, summed generically — see computeLiveAccessoryStats.
      itemStats: liveAccessoryStats.itemStats,
      enrichmentCount: liveAccessoryStats.enrichmentCount,
      // Catacombs Stats Boost digit count off the account's General's Medallion, or 0 when it isn't
      // owned (matching playerStats.generalsMedallionDigits' default).
      generalsMedallionDigits: liveAccessoryStats.generalsMedallionDigits,
      masterSkullTier: liveAccessoryStats.masterSkullTier,
      // The account's dominant tracked enrichment stat, with enrichmentCount already narrowed to that
      // stat's own count; 'none' plus the flat total when no enrichment sits on a tracked stat.
      enrichmentType: liveAccessoryStats.enrichmentType,
      // slot_0 is the account's currently active Stat Tuning allocation; slots 1-4 are saved
      // presets and aren't imported.
      tuning: member.accessory_bag_storage?.tuning?.slot_0 || null,
      // Every owned accessory id at its best tier (same dedup as Magical Power above), scanned from
      // the Accessory Bag and the main Inventory, since an accessory not yet moved into the bag still
      // counts as owned. The frontend's Magical Power optimizer diffs this against the catalog;
      // upgrade-family exclusion and duplicate handling happen there.
      owned: (() => {
        // Ranked by RARITY_MAGICAL_POWER rather than TIER_WORDS' match order, which is not a rarity
        // ordering, so "best tier" means highest Magical Power.
        const bestTierById = new Map();
        for (const raw of [...talismanBagItems, ...invItems]) {
          const id = raw?.tag?.ExtraAttributes?.id;
          if (!id) continue;
          const tier = realAccessoryTier(raw);
          if (!tier) continue;
          // Recombobulator usage: a one-time per-item flag independent of tier, since an item's
          // current tier already includes any past bump. Lets the frontend skip suggesting a recomb
          // on an item that has used its one upgrade.
          const recombobulated = raw?.tag?.ExtraAttributes?.rarity_upgrades === 1;
          const existing = bestTierById.get(id);
          if (!existing || (RARITY_MAGICAL_POWER[tier] || 0) > (RARITY_MAGICAL_POWER[existing.tier] || 0)) {
            bestTierById.set(id, { tier, recombobulated });
          }
        }
        return Array.from(bestTierById, ([id, { tier, recombobulated }]) => ({ id, tier, recombobulated }));
      })(),
    };

    // Golden Dragon's Legendary Treasure and Shining Scales perks need the co-op bank balance
    // (profile-level, shared by every member) and this player's own Gold Ingot collection. Either is
    // null when the account has the Banking or Collections API setting turned off.
    const bank = typeof profile.banking?.balance === "number" ? profile.banking.balance : null;
    const goldCollection = typeof member.collection?.GOLD_INGOT === "number" ? member.collection.GOLD_INGOT : null;

    // Per-mob Bestiary Strength bonus — see computeBestiaryMaxedMobs and
    // frontend/src/lib/bestiaryStrength.js.
    const bestiaryMaxedMobs = computeBestiaryMaxedMobs(bestiary, member.bestiary?.kills);
    // Daedalus Blade's Bestiary-Tiers ability input — see computeCombinedMythologicalBestiaryTiers.
    const combinedMythologicalBestiaryTiers = computeCombinedMythologicalBestiaryTiers(bestiary, member.bestiary?.kills);
    // "The One" enchant's per-collection scaling input — see computeMaxedCollectionsCount. null
    // rather than 0 when the account has the Collections API off, as with goldCollection and bank.
    const maxedCollectionsCount = computeMaxedCollectionsCount(collectionsResource, member.collection);

    return jsonResponse({
      profile: { profile_id: profile.profile_id, cute_name: profile.cute_name },
      profiles: profileList,
      username: resolvedUsername,
      uuid,
      armor: armorResult,
      equipment: equipmentResult,
      forbiddenBlessingLevel,
      lonesomeMinerLevel,
      essencePerks,
      wardrobeSets,
      wardrobeEquipmentSets,
      weapons,
      pets,
      attributeLevels,
      skills,
      dungeonClasses,
      slayers,
      accessory,
      bank,
      goldCollection,
      bestiaryMaxedMobs,
      combinedMythologicalBestiaryTiers,
      maxedCollectionsCount,
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
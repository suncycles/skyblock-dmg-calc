/* SKYDMG — shared cache Worker. Single source of truth for weapons/armor/enchants data, sourced
   from NotEnoughUpdates-REPO, plus a thin Hypixel API proxy for the "import my current gear"
   feature (the only place this project talks to the real Hypixel API — everything under
   /api/items is still NEU-REPO only).

   Weapons/armor/equipment/pet items are pre-parsed offline by scripts/build-item-data.mjs into
   src/data/{weapons,armor,equipment,petItems}.json and bundled at deploy time; re-run + redeploy
   to pick up NEU-REPO updates. Enchant and reforge data are small and fetched live here instead.

   Routes:
     GET  /api/items            -> returns cached data, refreshing first if stale
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

const CACHE_KEY = "hex_data";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

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
    return jsonResponse(cached, 200, ITEMS_RESPONSE_CACHE_HEADERS);
  }

  try {
    const fresh = await buildFreshData();
    await env.CACHE.put(CACHE_KEY, JSON.stringify(fresh));
    return jsonResponse(fresh, 200, ITEMS_RESPONSE_CACHE_HEADERS);
  } catch (err) {
    console.error("handleGetItems: buildFreshData failed:", err);
    if (cached) return jsonResponse(cached, 200, ITEMS_RESPONSE_CACHE_HEADERS);
    return jsonResponse({ error: "Failed to fetch item data", detail: String(err) }, 502);
  }
}

async function handleRefresh(env) {
  try {
    const fresh = await buildFreshData();
    await env.CACHE.put(CACHE_KEY, JSON.stringify(fresh));
    return jsonResponse(fresh);
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

  return { weapons, armor, equipment, enchants, reforges, reforgeStones, pets, petItems, powerStones, lastFetched: Date.now() };
}

async function fetchPetNums() {
  const res = await fetch(NEU_PETNUMS_URL);
  return res.json();
}

async function fetchReforges() {
  const res = await fetch(NEU_REFORGES_URL);
  return res.json();
}

// Re-keys reforgestones.json (keyed by stone item id) by reforgeName instead, keeping stoneId for icon lookup.
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

// Talismans with their own fixed Strength bonus while in the Accessory Bag, beyond their Magical
// Power contribution above — user-confirmed values. Shark Tooth Necklace is a strict tier
// progression (Raggedy -> ... -> Razor-Sharp); only the best tier owned counts, not every tier
// summed. Day Crystal and Night Crystal are alternatives, not stacking — owning both still only
// grants the bonus once.
const SHARK_TOOTH_STRENGTH_BY_ID = {
  RAGGEDY_SHARK_TOOTH_NECKLACE: 2,
  DULL_SHARK_TOOTH_NECKLACE: 4,
  HONED_SHARK_TOOTH_NECKLACE: 6,
  SHARP_SHARK_TOOTH_NECKLACE: 8,
  RAZOR_SHARP_SHARK_TOOTH_NECKLACE: 10,
};
const DAY_NIGHT_CRYSTAL_STRENGTH = 5;
const GRAVITY_TALISMAN_STRENGTH = 5;
const BLOOD_GOD_CREST_STRENGTH = 5;

// Computes live Magical Power (summed real Accessory Bag rarities) and the flat "Talisman
// Bonuses" Strength total from a decoded talisman_bag item list — see the Promise.all above for
// where `items` comes from. Two dedup rules apply, both confirmed by the account owner:
// - Owning multiple physical copies of the same accessory id only counts the best copy once
//   (e.g. 4x Personal Compactor 7000 counts only its single highest tier, not all 4 summed).
// - Hat accessories (see isHatAccessory) are mutually exclusive with each other as a group —
//   only the single highest-Magical-Power hat owned counts, not every hat summed.
// `abiphoneContactCount` (member.nether_island_player_data.abiphone.contact_data key count) adds
// floor(count/2) bonus Magical Power, but only while an Abicase accessory is owned — user-confirmed.
function computeLiveAccessoryStats(items, abiphoneContactCount) {
  const bestMagicalPowerById = new Map();
  let hatMagicalPower = 0;
  let hasDayOrNightCrystal = false;
  let sharkToothStrength = 0;
  let hasGravityTalisman = false;
  let hasBloodGodCrest = false;
  let hasAbicase = false;

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

    if (id === "DAY_CRYSTAL" || id === "NIGHT_CRYSTAL") hasDayOrNightCrystal = true;
    else if (id === "GRAVITY_TALISMAN") hasGravityTalisman = true;
    else if (id === "BLOOD_GOD_CREST") hasBloodGodCrest = true;
    else if (id === "ABICASE") hasAbicase = true;
    else if (SHARK_TOOTH_STRENGTH_BY_ID[id] != null) {
      sharkToothStrength = Math.max(sharkToothStrength, SHARK_TOOTH_STRENGTH_BY_ID[id]);
    }
  }

  let magicalPower = hatMagicalPower;
  for (const mp of bestMagicalPowerById.values()) magicalPower += mp;
  if (hasAbicase) magicalPower += Math.floor((abiphoneContactCount || 0) / 2);

  const talismanStrengthBonus =
    (hasDayOrNightCrystal ? DAY_NIGHT_CRYSTAL_STRENGTH : 0) +
    (hasGravityTalisman ? GRAVITY_TALISMAN_STRENGTH : 0) +
    (hasBloodGodCrest ? BLOOD_GOD_CREST_STRENGTH : 0) +
    sharkToothStrength;

  return { magicalPower, talismanStrengthBonus };
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

    const [armorItems, equipmentItems, invItems, enderChestItems, backpackItemLists, talismanBagItems, attributeShards, leveling] =
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

    const experience = member.player_data?.experience || {};
    const skills = {
      alchemy: computeSkillLevel(experience.SKILL_ALCHEMY || 0, leveling.leveling_xp, leveling.leveling_caps.alchemy),
      enchanting: computeSkillLevel(experience.SKILL_ENCHANTING || 0, leveling.leveling_xp, leveling.leveling_caps.enchanting),
      combat: computeSkillLevel(experience.SKILL_COMBAT || 0, leveling.leveling_xp, leveling.leveling_caps.combat),
      foraging: computeSkillLevel(experience.SKILL_FORAGING || 0, leveling.leveling_xp, leveling.leveling_caps.foraging),
      taming: computeSkillLevel(experience.SKILL_TAMING || 0, leveling.leveling_xp, leveling.leveling_caps.taming),
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

    const slayers = { wolf: highestClaimedSlayerLevel(member.slayer?.slayer_bosses?.wolf) };

    // Live Magical Power/Talisman Bonuses from the real Accessory Bag contents (talismanBagItems,
    // decoded above) — falls back to the stale highest-ever peak only if the bag itself couldn't
    // be decoded (e.g. the account has the relevant Hypixel API setting turned off).
    const abiphoneContactCount = Object.keys(member.nether_island_player_data?.abiphone?.contact_data || {}).length;
    const liveAccessoryStats = computeLiveAccessoryStats(talismanBagItems, abiphoneContactCount);
    const accessory = {
      selectedPower: member.accessory_bag_storage?.selected_power || null,
      magicalPower: talismanBagItems.length > 0 ? liveAccessoryStats.magicalPower : member.accessory_bag_storage?.highest_magical_power || 0,
      talismanStrengthBonus: liveAccessoryStats.talismanStrengthBonus,
      // slot_0 is the account's currently active Stat Tuning allocation; slots 1-4 are saved
      // presets and aren't imported.
      tuning: member.accessory_bag_storage?.tuning?.slot_0 || null,
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
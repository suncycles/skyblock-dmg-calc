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
                                    currently-worn armor/equipment/pet plus every carried weapon
                                    candidate (the frontend lets the user pick), plus computed pet
                                    level, attribute levels, Wolf Slayer level, Alchemy/Enchanting
                                    level, and selected Accessory Power from the Hypixel API (see
                                    handleHypixelImport). Needs env.HYPIXEL_API_KEY.

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

// Currently-worn-only, per user request — deliberately ignores loadout.armor/loadout.equipment
// (the Wardrobe/Loadout preset storage) since its own "equipped_set" pointer isn't reliable (can
// point at an empty saved slot); inventory.inv_armor/equipment_contents are what's actually on
// the player right now, which is the only thing this imports.
const WEAPON_IDS = new Set(weapons.map((w) => w.id));

// Inventory array index -> our slot name, for the 4-piece flat lists Hypixel returns.
const ARMOR_SLOT_ORDER = ["boots", "leggings", "chestplate", "helmet"];
const EQUIPMENT_SLOT_ORDER = ["necklace", "cloak", "belt", "gloves"];

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
    hypixelRes = await fetch(`https://api.hypixel.net/v2/skyblock/profiles?uuid=${uuid}`, {
      headers: { "API-Key": env.HYPIXEL_API_KEY },
    });
    hypixel = await hypixelRes.json();
  } catch (err) {
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
    const [armorItems, equipmentItems, invItems, attributeShards, leveling] = await Promise.all([
      member.inventory?.inv_armor?.data ? decodeInventoryB64(member.inventory.inv_armor.data) : [],
      member.inventory?.equipment_contents?.data ? decodeInventoryB64(member.inventory.equipment_contents.data) : [],
      member.inventory?.inv_contents?.data ? decodeInventoryB64(member.inventory.inv_contents.data) : [],
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

    // Weapon: every inventory slot (hotbar first, then the rest, in real slot order) whose item
    // id is a known weapon — Skyblock has no dedicated weapon slot, and a player can be carrying
    // more than one, so this returns every candidate rather than guessing which one to keep; the
    // frontend lets the user pick. No dedup by id — two physical copies of the same weapon (e.g.
    // a main + backup) are two separate candidates, same "trust real inventory position"
    // treatment the fixed armor/equipment slots already get.
    const weapons = [];
    for (const raw of invItems) {
      const summary = extractItemSummary(raw);
      if (summary && WEAPON_IDS.has(summary.id)) weapons.push(summary);
    }

    const pets = (member.pets_data && member.pets_data.pets) || [];
    const activePet = pets.find((p) => p.active) || null;
    const pet = activePet
      ? {
          type: activePet.type,
          tier: activePet.tier,
          exp: activePet.exp || 0,
          heldItem: activePet.heldItem || null,
          skin: activePet.skin || null,
          level: computePetLevel(activePet.type, activePet.tier, activePet.exp || 0),
        }
      : null;

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

    const accessory = {
      selectedPower: member.accessory_bag_storage?.selected_power || null,
      magicalPower: member.accessory_bag_storage?.highest_magical_power || 0,
    };

    return jsonResponse({
      profile: { profile_id: profile.profile_id, cute_name: profile.cute_name },
      username: resolvedUsername,
      uuid,
      armor: armorResult,
      equipment: equipmentResult,
      weapons,
      pet,
      attributeLevels,
      skills,
      slayers,
      accessory,
    });
  } catch (err) {
    return jsonResponse({ error: "Failed to decode this player's item data", detail: String(err) }, 500);
  }
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
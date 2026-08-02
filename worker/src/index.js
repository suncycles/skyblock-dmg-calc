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
                                    currently-worn armor/equipment/weapon/pet from the Hypixel API
                                    (see handleHypixelImport). Needs env.HYPIXEL_API_KEY.

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

async function handleHypixelImport(url, env) {
  if (!env.HYPIXEL_API_KEY) {
    return jsonResponse({ error: "Hypixel import is not configured (missing API key)" }, 500);
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
    const lookupRes = await fetch(`https://playerdb.co/api/player/minecraft/${encodeURIComponent(username)}`);
    const lookup = await lookupRes.json().catch(() => null);
    if (!lookupRes.ok || !lookup?.success) {
      if (lookupRes.status === 404 || lookup?.code === "player.not_found") {
        return jsonResponse({ error: `No Minecraft account named "${username}"` }, 404);
      }
      return jsonResponse({ error: "Username lookup failed, try again" }, 502);
    }
    uuid = lookup.data.player.raw_id;
    resolvedUsername = lookup.data.player.username;
  }

  const hypixelRes = await fetch(`https://api.hypixel.net/v2/skyblock/profiles?uuid=${uuid}`, {
    headers: { "API-Key": env.HYPIXEL_API_KEY },
  });
  const hypixel = await hypixelRes.json();
  if (!hypixel.success) {
    return jsonResponse({ error: hypixel.cause || "Hypixel API request failed" }, 502);
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
    const [armorItems, equipmentItems, invItems] = await Promise.all([
      member.inventory?.inv_armor?.data ? decodeInventoryB64(member.inventory.inv_armor.data) : [],
      member.inventory?.equipment_contents?.data ? decodeInventoryB64(member.inventory.equipment_contents.data) : [],
      member.inventory?.inv_contents?.data ? decodeInventoryB64(member.inventory.inv_contents.data) : [],
    ]);

    const armorResult = {};
    ARMOR_SLOT_ORDER.forEach((slot, i) => {
      armorResult[slot] = extractItemSummary(armorItems[i]);
    });

    const equipmentResult = {};
    EQUIPMENT_SLOT_ORDER.forEach((slot, i) => {
      equipmentResult[slot] = extractItemSummary(equipmentItems[i]);
    });

    // Weapon: first inventory slot (hotbar first, then the rest, in real slot order) whose item
    // id is a known weapon — not just slot 0, since Skyblock has no dedicated weapon slot.
    let weapon = null;
    for (const raw of invItems) {
      const summary = extractItemSummary(raw);
      if (summary && WEAPON_IDS.has(summary.id)) {
        weapon = summary;
        break;
      }
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
        }
      : null;

    return jsonResponse({
      profile: { profile_id: profile.profile_id, cute_name: profile.cute_name },
      username: resolvedUsername,
      uuid,
      armor: armorResult,
      equipment: equipmentResult,
      weapon,
      pet,
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
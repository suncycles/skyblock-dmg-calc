import { findGearItem } from './loadoutCode';
import { emptyModifiers, emptyPetModifiers } from './defaultModifiers';
import { fetchEnchantLevels, isUltimateEnchant } from './enchantEffects';
import { derivePetDisplayName } from './petData';

/* Hypixel API "import my current gear" — hits the shared Worker's /api/hypixel/import (which
   holds the API key server-side and does the gzip+NBT decode; see worker/src/nbt.js), then maps
   the raw decoded items onto this app's own loadout/modifiers shape. Deliberately scoped to only
   what's *currently worn* (armor + equipment + best-guess weapon + active pet) per explicit
   instruction — not attributes, skill levels, or the in-game Loadout/Wardrobe presets.

   Weapon has no dedicated Skyblock inventory slot, so the Worker already picked the first
   hotbar/inventory item (in real slot order) that matches a known weapon id — this module just
   consumes that choice, it doesn't re-derive it. */

const WORKER_BASE_URL = 'https://dmg-calc-cache.mich536ael.workers.dev';

const GEAR_SLOT_KEYS = ['weapon', 'helmet', 'chestplate', 'leggings', 'boots', 'necklace', 'cloak', 'belt', 'gloves'];

// Only the 6 "combat" gemstones this calculator models (see lib/gemstoneData.js) — anything
// else (Peridot/Amber/Topaz/Citrine/Aquamarine/Jade) is silently dropped, same as manual entry.
const COMBAT_GEM_TYPES = ['RUBY', 'JASPER', 'SAPPHIRE', 'AMETHYST', 'ONYX', 'OPAL'];

export class HypixelImportError extends Error {}

async function callWorker(params) {
  const res = await fetch(`${WORKER_BASE_URL}/api/hypixel/import?${params.toString()}`);
  let data;
  try {
    data = await res.json();
  } catch {
    throw new HypixelImportError(`Import failed (HTTP ${res.status})`);
  }
  if (!res.ok && !data.needsProfileSelection) {
    throw new HypixelImportError(data.error || `Import failed (HTTP ${res.status})`);
  }
  return data;
}

// Resolves a username (or re-queries by uuid) and fetches the chosen/only SkyBlock profile's
// currently-worn gear. If the account has multiple profiles and none is specified, the Worker
// responds with `needsProfileSelection` + the profile list instead of gear data — call again
// with `profile` once the caller has picked one.
export function fetchHypixelImport(usernameOrUuid, { byUuid = false, profile } = {}) {
  const params = new URLSearchParams();
  params.set(byUuid ? 'uuid' : 'username', usernameOrUuid);
  if (profile) params.set('profile', profile);
  return callWorker(params);
}

// "Green Thumb" -> "green_thumb", matching Hypixel's lowercase-snake-case `modifier` id.
function normalizeReforgeKey(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildReforgeNameLookup(itemData) {
  const map = {};
  for (const name of Object.keys(itemData.reforges || {})) map[normalizeReforgeKey(name)] = name;
  for (const name of Object.keys(itemData.reforgeStones || {})) map[normalizeReforgeKey(name)] = name;
  return map;
}

function extractGemstones(gems) {
  if (!gems) return [];
  const result = [];
  for (const [key, value] of Object.entries(gems)) {
    if (key === 'unlocked_slots' || typeof value !== 'string') continue;
    const match = key.match(/^([A-Z_]+)_\d+$/);
    if (!match || !COMBAT_GEM_TYPES.includes(match[1])) continue;
    result.push({ gem: match[1], tier: value.toLowerCase() });
  }
  return result;
}

// Splits raw {enchant_id: level} into hexEnchantments/ultimateEnchantment, looking up each
// enchant's real max level (fetchEnchantLevels caches per id, so repeats across armor pieces
// only fetch once).
async function buildEnchantEntries(enchantments, itemData) {
  const hexEnchantments = [];
  let ultimateEnchantment = null;
  for (const [id, level] of Object.entries(enchantments || {})) {
    const levels = await fetchEnchantLevels(id, itemData.enchants);
    const maxLevel = levels && levels.length > 0 ? levels[levels.length - 1].level : level;
    const entry = { id, level, maxLevel };
    if (isUltimateEnchant(id)) ultimateEnchantment = entry;
    else hexEnchantments.push(entry);
  }
  return { hexEnchantments, ultimateEnchantment };
}

async function buildItemModifiers(summary, itemData, reforgeLookup) {
  const { hexEnchantments, ultimateEnchantment } = await buildEnchantEntries(summary.enchantments, itemData);
  return {
    ...emptyModifiers(),
    hexEnchantments,
    ultimateEnchantment,
    gemstones: extractGemstones(summary.gems),
    books: Math.min(15, summary.hotPotatoBooks || 0),
    recombobulated: !!summary.recombobulated,
    reforge: summary.modifier ? reforgeLookup[summary.modifier] || null : null,
    stars: Math.min(15, summary.stars || 0),
  };
}

// Maps the Worker's raw decoded response onto {loadout, skipped}: `loadout` is ready to merge
// straight into BuildContext (same {item, modifiers} shape as every other slot-setter), `skipped`
// lists any item id that didn't resolve against the current NEU-REPO catalog (renamed/removed
// item) so the caller can surface it rather than silently dropping gear.
export async function mapHypixelImportToLoadout(raw, itemData) {
  const reforgeLookup = buildReforgeNameLookup(itemData);
  const bySlot = {
    weapon: raw.weapon,
    helmet: raw.armor?.helmet,
    chestplate: raw.armor?.chestplate,
    leggings: raw.armor?.leggings,
    boots: raw.armor?.boots,
    necklace: raw.equipment?.necklace,
    cloak: raw.equipment?.cloak,
    belt: raw.equipment?.belt,
    gloves: raw.equipment?.gloves,
  };

  const loadout = {};
  const skipped = [];

  for (const slot of GEAR_SLOT_KEYS) {
    const summary = bySlot[slot];
    if (!summary) continue;
    const item = findGearItem(itemData, summary.id);
    if (!item) {
      skipped.push(summary.id);
      continue;
    }
    loadout[slot] = {
      item: {
        id: item.id,
        name: item.name,
        material: item.material,
        category: item.category,
        tier: item.tier,
        lore: item.lore || [],
        color: item.color,
      },
      modifiers: await buildItemModifiers(summary, itemData, reforgeLookup),
    };
  }

  if (raw.pet) {
    loadout.pet = {
      item: {
        id: `${raw.pet.type}_${raw.pet.tier}`,
        petId: raw.pet.type,
        name: derivePetDisplayName(raw.pet.type),
        tier: raw.pet.tier,
        material: 'BONE',
      },
      // Pet level isn't imported yet (needs a verified XP-per-level curve) — defaults to 1.
      modifiers: emptyPetModifiers(),
    };
  }

  return { loadout, skipped };
}

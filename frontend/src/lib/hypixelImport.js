import { findGearItem } from './loadoutCode';
import { WORKER_BASE_URL } from './apiConfig';
import { emptyModifiers, emptyPetModifiers, emptyAccessoryModifiers } from './defaultModifiers';
import { fetchEnchantLevels, isUltimateEnchant } from './enchantEffects';
import { derivePetDisplayName } from './petData';
import { getPowerById } from './accessoryPowers';
import { ATTRIBUTE_IDS } from './attributes';
import { getMaxStarsForItem, MAX_MASTER_STARS } from './starring';

/* Hypixel API "import my current gear" — hits the shared Worker's /api/hypixel/import (which
   holds the API key server-side, does the gzip+NBT decode, and computes pet level/attribute
   levels/Wolf Slayer level/Alchemy+Enchanting level server-side; see worker/src/nbt.js and
   worker/src/index.js's handleHypixelImport), then maps the raw response onto this app's own
   loadout/attributes/playerStats shape. Scoped to currently-worn gear + active pet + Accessory
   Power + the account-wide levels named above — not the in-game Loadout/Wardrobe presets.

   Weapon has no dedicated Skyblock inventory slot, so the Worker returns every carried item that
   matches a known weapon id (real slot order, hotbar first) as `raw.weapons` — the Review screen
   (pages/HypixelImport.jsx) lets the user pick one (or none) before mapHypixelImportToLoadout
   resolves that choice into the loadout. */

// Hypixel's raw attribute id order is "<mobType>_ruler" (e.g. "skeletal_ruler") — reversed from
// this app's own "ruler_<mobType>" id. Every other attribute id (elementals, echoes, deadeye,
// unlimited_power, maximal_torment, etc.) already matches Hypixel's raw key 1:1, verified against
// a real account — note the in-game shard's internalName is "MAXIMAL_TORMENT" even though its
// displayed ability name is "Unlimited Torment".
const RULER_TYPES = [
  'airborne',
  'animal',
  'arcane',
  'arthropod',
  'construct',
  'elusive',
  'ender',
  'frozen',
  'humanoid',
  'infernal',
  'magmatic',
  'mythological',
  'pest',
  'skeletal',
  'subterranean',
  'undead',
  'woodland',
];
const RAW_ATTRIBUTE_ID_REMAP = Object.fromEntries(RULER_TYPES.map((t) => [`${t}_ruler`, `ruler_${t}`]));

// Hypixel's raw Stat Tuning field names differ from this app's own TUNING_STATS ids (see
// lib/accessoryPowers.js) — remapped 1:1. The Hypixel API docs don't cover this field; verified
// against community-maintained type definitions (node-hypixel, SkyblockerMod's profile viewer).
const RAW_TUNING_KEY_MAP = {
  health: 'health',
  defense: 'defense',
  walk_speed: 'speed',
  strength: 'strength',
  critical_damage: 'crit_damage',
  critical_chance: 'crit_chance',
  attack_speed: 'bonus_attack_speed',
  intelligence: 'intelligence',
};

function mapHypixelTuning(rawTuning) {
  const tuning = { ...emptyAccessoryModifiers().tuning };
  for (const [rawKey, value] of Object.entries(rawTuning || {})) {
    const key = RAW_TUNING_KEY_MAP[rawKey];
    if (key) tuning[key] = Math.max(0, Math.floor(value) || 0);
  }
  return tuning;
}

function mapHypixelAttributeLevels(rawAttributeLevels) {
  const result = {};
  for (const [rawId, level] of Object.entries(rawAttributeLevels || {})) {
    const id = RAW_ATTRIBUTE_ID_REMAP[rawId] || rawId;
    if (ATTRIBUTE_IDS.includes(id)) result[id] = level;
  }
  return result;
}

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
// only fetch once). Levels are looked up concurrently rather than one id at a time — with an
// item carrying several enchants this turns N sequential round trips into one, and Promise.all
// preserves Object.entries' order regardless of which fetch resolves first.
async function buildEnchantEntries(enchantments, itemData) {
  const entries = await Promise.all(
    Object.entries(enchantments || {}).map(async ([id, level]) => {
      const levels = await fetchEnchantLevels(id, itemData.enchants);
      const maxLevel = levels && levels.length > 0 ? levels[levels.length - 1].level : level;
      return { id, level, maxLevel };
    }),
  );

  const hexEnchantments = [];
  let ultimateEnchantment = null;
  for (const entry of entries) {
    if (isUltimateEnchant(entry.id)) ultimateEnchantment = entry;
    else hexEnchantments.push(entry);
  }
  return { hexEnchantments, ultimateEnchantment };
}

// Hypixel's raw "stars" count doesn't distinguish base stars from Master Stars — a value past
// the item's own real cap (see lib/starring.js's getMaxStarsForItem) means the excess (up to 5)
// is Master Stars, not more base stars. E.g. a 5-cap item reporting stars=7 is 5 base + 2 master.
function splitRawStars(item, rawStars) {
  const cap = getMaxStarsForItem(item);
  const stars = Math.min(cap, rawStars);
  const masterStars = Math.min(MAX_MASTER_STARS, Math.max(0, rawStars - cap));
  return { stars, masterStars };
}

async function buildItemModifiers(item, summary, itemData, reforgeLookup) {
  const { hexEnchantments, ultimateEnchantment } = await buildEnchantEntries(summary.enchantments, itemData);
  const { stars, masterStars } = splitRawStars(item, summary.stars || 0);
  return {
    ...emptyModifiers(),
    hexEnchantments,
    ultimateEnchantment,
    gemstones: extractGemstones(summary.gems),
    books: Math.min(15, summary.hotPotatoBooks || 0),
    recombobulated: !!summary.recombobulated,
    reforge: summary.modifier ? reforgeLookup[summary.modifier] || null : null,
    stars,
    masterStars,
    // Master Stars imply dungeonized (can't exist otherwise), but so does the item's own rarity
    // line reading e.g. "LEGENDARY DUNGEON LEGGINGS" — baked into `category` as a "DUNGEON "
    // prefix (see lib/armorSlots.js) — which catches dungeon-drop gear with 0 Master Stars too.
    dungeonized: masterStars > 0 || (item.category || '').includes('DUNGEON'),
  };
}

// Resolves a raw decoded item summary (just {id, ...modifiers}) against the current item catalog
// into the {id, name, material, category, tier, lore, color} shape both the loadout and the
// Review screen's candidate rows (icon/name) need — null if the id doesn't match anything in the
// current NEU-REPO catalog (renamed/removed item since the account last equipped it).
export function resolveGearSummary(summary, itemData) {
  if (!summary) return null;
  const item = findGearItem(itemData, summary.id);
  if (!item) return null;
  return {
    id: item.id,
    name: item.name,
    material: item.material,
    category: item.category,
    tier: item.tier,
    lore: item.lore || [],
    color: item.color,
  };
}

// Maps the Worker's raw decoded response onto {loadout, skipped, attributes, playerStats}:
// `loadout` is ready to merge straight into BuildContext (same {item, modifiers} shape as every
// other slot-setter), `skipped` lists any item/power id that didn't resolve against the current
// NEU-REPO catalog (renamed/removed item) so the caller can surface it rather than silently
// dropping it, `attributes` is a {id: level} patch for BuildContext's attributes state, and
// `playerStats` is a patch for its playerStats state (wolfSlayerLevel/alchemyLevel/enchantingLevel).
// `selection.weaponIndex` picks one of `raw.weapons` (null/undefined = don't import a weapon —
// there's no dedicated slot to guess from, so the caller must choose); `selection.excludedSlots`
// (a Set of GEAR_SLOT_KEYS names) skips those armor/equipment slots entirely, leaving whatever
// was already in that BuildContext slot untouched (importHypixelLoadout only patches the keys
// present in `loadout`, see BuildContext.jsx). `selection.wardrobeSetIndex` sources the 4 armor
// slots from `raw.wardrobeSets[index]` instead of `raw.armor` (currently worn) — equipment always
// comes from `raw.equipment` since Equipment Wardrobe isn't a released Hypixel feature.
export async function mapHypixelImportToLoadout(raw, itemData, selection = {}) {
  const { weaponIndex = null, excludedSlots, wardrobeSetIndex = null } = selection;
  const excluded = excludedSlots || new Set();
  const reforgeLookup = buildReforgeNameLookup(itemData);
  // wardrobeSetIndex is the set's real Wardrobe slot number (raw.wardrobeSets[].index), not an
  // array position — empty sets are already filtered out worker-side, so the two diverge as soon
  // as there's a gap (e.g. slot 1 empty, slot 2 populated leaves it at array position 0).
  const armorSource = wardrobeSetIndex != null ? raw.wardrobeSets?.find((s) => s.index === wardrobeSetIndex) : raw.armor;
  const bySlot = {
    weapon: weaponIndex != null ? raw.weapons?.[weaponIndex] : null,
    helmet: armorSource?.helmet,
    chestplate: armorSource?.chestplate,
    leggings: armorSource?.leggings,
    boots: armorSource?.boots,
    necklace: raw.equipment?.necklace,
    cloak: raw.equipment?.cloak,
    belt: raw.equipment?.belt,
    gloves: raw.equipment?.gloves,
  };

  const loadout = {};
  const skipped = [];

  // Resolving each summary against the catalog is synchronous, so gather the slots that need
  // building first, then build every item's modifiers concurrently instead of one slot at a
  // time — `loadout` is a plain object keyed by slot name, so build order doesn't matter.
  const toBuild = [];
  for (const slot of GEAR_SLOT_KEYS) {
    if (excluded.has(slot)) continue;
    const summary = bySlot[slot];
    if (!summary) continue;
    const item = resolveGearSummary(summary, itemData);
    if (!item) {
      skipped.push(summary.id);
      continue;
    }
    toBuild.push({ slot, item, summary });
  }
  await Promise.all(
    toBuild.map(async ({ slot, item, summary }) => {
      loadout[slot] = {
        item,
        modifiers: await buildItemModifiers(item, summary, itemData, reforgeLookup),
      };
    }),
  );

  if (raw.pet) {
    loadout.pet = {
      item: {
        id: `${raw.pet.type}_${raw.pet.tier}`,
        petId: raw.pet.type,
        name: derivePetDisplayName(raw.pet.type),
        tier: raw.pet.tier,
        material: 'BONE',
      },
      modifiers: {
        ...emptyPetModifiers(),
        level: raw.pet.level || 1,
        petItem: raw.pet.heldItem || null,
        // Only meaningful for Golden Dragon, but imported unconditionally for whichever pet is
        // active — same "always imported" treatment as level/petItem above. bank is the co-op
        // bank balance (raw.bank), goldCollection is this player's own Gold Ingot collection;
        // either is 0 if the account has that Hypixel API setting turned off.
        bankCoins: raw.bank || 0,
        goldCollection: raw.goldCollection || 0,
      },
    };
  }

  if (raw.accessory?.selectedPower) {
    const power = getPowerById(raw.accessory.selectedPower.toUpperCase());
    if (power) {
      loadout.accessory = {
        item: {
          id: power.id,
          name: power.name,
          iconId: power.sourceItemId || null,
          material: power.sourceItemId ? 'SKULL' : 'BOOK',
        },
        modifiers: {
          ...emptyAccessoryModifiers(),
          magicalPower: raw.accessory.magicalPower || 0,
          tuning: mapHypixelTuning(raw.accessory.tuning),
        },
      };
    } else {
      skipped.push(raw.accessory.selectedPower);
    }
  }

  const attributes = mapHypixelAttributeLevels(raw.attributeLevels);

  const playerStats = {};
  if (typeof raw.slayers?.wolf === 'number') playerStats.wolfSlayerLevel = raw.slayers.wolf;
  if (typeof raw.skills?.alchemy === 'number') playerStats.alchemyLevel = raw.skills.alchemy;
  if (typeof raw.skills?.enchanting === 'number') playerStats.enchantingLevel = raw.skills.enchanting;
  if (typeof raw.skills?.combat === 'number') playerStats.combatLevel = raw.skills.combat;
  if (typeof raw.skills?.foraging === 'number') playerStats.foragingLevel = raw.skills.foraging;
  if (typeof raw.skills?.taming === 'number') playerStats.tamingLevel = raw.skills.taming;
  if (typeof raw.skills?.catacombs === 'number') playerStats.catacombsLevel = raw.skills.catacombs;
  if (typeof raw.skills?.skyblock === 'number') playerStats.skyblockLevel = raw.skills.skyblock;

  return { loadout, skipped, attributes, playerStats };
}

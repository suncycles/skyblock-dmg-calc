import { findGearItem } from './loadoutCode';
import { WORKER_BASE_URL } from './apiConfig';
import { emptyModifiers, emptyPetModifiers, emptyAccessoryModifiers } from './defaultModifiers';
import { fetchEnchantLevels, isUltimateEnchant } from './enchantEffects';
import { derivePetDisplayName } from './petData';
import { getPowerById } from './accessoryPowers';
import { ATTRIBUTE_IDS } from './attributes';
import { getMaxStarsForItem, MAX_MASTER_STARS } from './starring';
import { getSpecialConfig } from './specialWeapons';
import { isTieredArmorStatItem } from './tieredArmorStats';

/* Hypixel "import my current gear": calls the shared Worker's /api/hypixel/import, which holds the
   API key, decodes the gzip+NBT payload and computes pet level, attribute levels and skill levels
   (see worker/src/nbt.js and handleHypixelImport), then maps the response onto this app's
   loadout/attributes/playerStats shape. Scoped to worn gear plus a chosen pet and Accessory Power,
   not the in-game Loadout or Wardrobe presets.

   Weapons have no dedicated inventory slot, so `raw.weapons` holds every match across Inventory,
   Ender Chest and Backpacks, each tagged `location`; `raw.pets` holds every owned pet, flagged
   `active` for the equipped one. The Review screen (pages/HypixelImport.jsx) picks one of each
   before mapHypixelImportToLoadout resolves them into the loadout. */

// Hypixel keys 10 of the 17 Rulers as "<mobType>_ruler", the reverse of this app's
// "ruler_<mobType>". Every other attribute id matches Hypixel's raw key 1:1 — note the shard's
// internalName is "MAXIMAL_TORMENT" though its displayed ability reads "Unlimited Torment".
const STANDARD_PATTERN_RULER_TYPES = [
  'airborne',
  'animal',
  'arcane',
  'construct',
  'elusive',
  'frozen',
  'magmatic',
  'mythological',
  'skeletal',
  'subterranean',
];
// The other 7 Rulers use unrelated legacy shard ids rather than the "<mobType>_ruler" pattern, so
// their levels import only through this map. Humanoid Ruler is a further special case: a raw
// "humanoid_ruler" key exists but tracks a different ability ("Undead Fortune"), while the real
// stack lives under "humanoid_ruler_new" — the plain key is deliberately left unmapped.
const RAW_ATTRIBUTE_ID_REMAP = {
  ...Object.fromEntries(STANDARD_PATTERN_RULER_TYPES.map((t) => [`${t}_ruler`, `ruler_${t}`])),
  blazing: 'ruler_infernal',
  insect_power: 'ruler_pest',
  undead: 'ruler_undead',
  spirit_axe: 'ruler_woodland',
  arachno: 'ruler_arthropod',
  ender: 'ruler_ender',
  humanoid_ruler_new: 'ruler_humanoid',
  // The Mimic shard is keyed by its ability name, as in the price feed. `stacks.faker` is the fused
  // shard count (32 = level 10); `shards.owned` holds only the loose, not-yet-fused stack.
  faker: 'mimic',
};

// Hypixel's Stat Tuning field names differ from this app's own TUNING_STATS ids (see
// lib/accessoryPowers.js), remapped 1:1.
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

// Resolves a username (or re-queries by uuid) and fetches the chosen profile's worn gear. With
// several profiles and none specified, the Worker responds with `needsProfileSelection` and the
// profile list; call again with `profile` once one is picked.
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

// A few reforges' Hypixel `modifier` id isn't a lowercase-underscore of the display name
// (Bloodshot is "blood_shot", Warped "aote_stone"); NEU-REPO's own `nbtModifier` field, preserved
// by fetchReforgeStones, is authoritative when present.
function buildReforgeNameLookup(itemData) {
  const map = {};
  for (const [name, reforge] of Object.entries(itemData.reforges || {})) map[reforge.nbtModifier || normalizeReforgeKey(name)] = name;
  for (const [name, reforge] of Object.entries(itemData.reforgeStones || {})) map[reforge.nbtModifier || normalizeReforgeKey(name)] = name;
  return map;
}

// Reads one slot's quality out of the raw gems compound — a bare string on most slots, but
// Hypixel writes {uuid, quality} for gems that carry a tracked instance id.
function readGemQuality(gems, key) {
  const value = gems?.[key];
  return typeof value === 'string' ? value : value?.quality || null;
}

// Per-slot socketed gem and unlock state, mapped onto the item's own catalog slot order
// (`catalogSlots` — item.gemstone_slots). Hypixel keys each slot "<TYPE>_<n>" where n restarts at 0
// per distinct slot_type rather than running across the whole item, so this walks the catalog's
// ordered slots with a per-type counter instead of trusting key order. A slot with a gem socketed is
// unlocked by construction; only an empty slot needs `gems.unlocked_slots` to tell locked from open.
function extractGemstoneSlotState(gems, catalogSlots) {
  if (!Array.isArray(catalogSlots) || catalogSlots.length === 0) {
    // No per-slot type or order data for this item: flat, order-agnostic extraction, with unlock
    // state unknown beyond what a socketed gem already implies.
    const gemstones = [];
    if (gems) {
      for (const key of Object.keys(gems)) {
        const match = key.match(/^([A-Z]+)_\d+$/);
        if (!match) continue;
        const quality = readGemQuality(gems, key);
        if (!quality) continue;
        const gemType = COMBAT_GEM_TYPES.includes(match[1]) ? match[1] : gems[`${key}_gem`];
        if (!gemType || !COMBAT_GEM_TYPES.includes(gemType)) continue;
        gemstones.push({ gem: gemType, tier: quality.toLowerCase() });
      }
    }
    return { gemstones, unlocked: [] };
  }

  const unlockedKeys = new Set(gems?.unlocked_slots || []);
  const typeCounts = {};
  const gemstones = [];
  const unlocked = [];
  catalogSlots.forEach((slotDef, index) => {
    const type = slotDef.slot_type;
    const n = typeCounts[type] || 0;
    typeCounts[type] = n + 1;
    const key = `${type}_${n}`;
    const quality = readGemQuality(gems, key);
    if (quality) {
      const gemType = COMBAT_GEM_TYPES.includes(type) ? type : gems?.[`${key}_gem`];
      if (gemType && COMBAT_GEM_TYPES.includes(gemType)) gemstones[index] = { gem: gemType, tier: quality.toLowerCase() };
      unlocked[index] = true;
    } else {
      unlocked[index] = unlockedKeys.has(key);
    }
  });
  return { gemstones, unlocked };
}

// Splits raw {enchant_id: level} into hexEnchantments and ultimateEnchantment, looking up each
// enchant's max level (fetchEnchantLevels caches per id, so repeats across armor pieces fetch once).
// Lookups run concurrently, and Promise.all preserves Object.entries' order.
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

// Hypixel's raw "stars" count doesn't separate base stars from Master Stars: anything past the
// item's own cap (lib/starring.js's getMaxStarsForItem), up to 5, is Master Stars. A 5-cap item
// reporting 7 is 5 base plus 2 master.
function splitRawStars(item, rawStars) {
  const cap = getMaxStarsForItem(item);
  const stars = Math.min(cap, rawStars);
  const masterStars = Math.min(MAX_MASTER_STARS, Math.max(0, rawStars - cap));
  return { stars, masterStars };
}

// David's Cloak has no fixed Strength or rarity in the catalog: its tier comes from Hunting Box
// milestones and its Strength has no published formula, so both exist only in the account's own copy
// of the lore ("Strength: +57", a trailing "MYTHIC CLOAK" line). Parsed from there into
// `modifiers.special` and `rarityOverride`.
// A stat line reads "§7Strength: §c+TOTAL §9(+REFORGE) §8(+DUNGEON)". The leading number already
// includes the reforge, which this app applies itself from lib/reforges.js, so only the §9
// parenthetical is subtracted; the §8 one is the Catacombs Boost preview and isn't part of it.
const DAVIDS_CLOAK_REFORGE_BONUS_RE = /§9\(\+?([\d.]+)\)/;

export function parseDavidsCloakFromLore(lore) {
  if (!Array.isArray(lore) || lore.length === 0) return { special: 0, rarityOverride: null };
  const stripped = lore.map((l) => l.replace(/§./g, ''));

  const strengthIdx = stripped.findIndex((l) => /^Strength:\s*[+-]?[\d.]+/.test(l.trim()));
  let special = 0;
  if (strengthIdx !== -1) {
    const total = parseFloat(/^Strength:\s*([+-]?[\d.]+)/.exec(stripped[strengthIdx].trim())[1]);
    const reforgeMatch = DAVIDS_CLOAK_REFORGE_BONUS_RE.exec(lore[strengthIdx]);
    const reforge = reforgeMatch ? parseFloat(reforgeMatch[1]) : 0;
    special = Math.max(0, Math.round(total - reforge));
  }

  const rarities = getSpecialConfig('DAVIDS_CLOAK')?.rarities || [];
  const lastLine = [...stripped].reverse().find((l) => l.trim());
  const rarityOverride = (lastLine && rarities.find((r) => lastLine.trim().toUpperCase().startsWith(r))) || null;

  return { special, rarityOverride };
}

// Several weapons bake a live "Label: N" line into the owned item's own lore: Midas' Sword/Staff's
// "Price paid", Crown of Avarice's "Coins Consumed", and Daedalus Blade's " Mythological Bestiary
// Tiers", which Hypixel computes server-side. Parsed into `modifiers.special`, the same field the
// Special screen's manual input writes to.
function parseLabeledNumberFromLore(lore, labelPattern) {
  if (!Array.isArray(lore)) return 0;
  const stripped = lore.map((l) => l.replace(/§./g, ''));
  const line = stripped.find((l) => labelPattern.test(l.trim()));
  const match = line && /:\s*([\d,]+)/.exec(line);
  return match ? parseInt(match[1].replace(/,/g, ''), 10) : 0;
}

const SPECIAL_LORE_LABELS = {
  midasSword: /^Price paid:/i,
  midasStaff: /^Price paid:/i,
  crownOfAvarice: /^Coins Consumed:/i,
  bestiary: /Bestiary Tiers:/i,
};

// Whether this specific copy is dungeonized. Three signals, in order:
//  - Hypixel's `ExtraAttributes.dungeon_item` flag, which dungeonized weapons still set;
//  - a `STARRED_` id, which is a Master Mode drop and so dungeon gear by definition;
//  - stars on a DUNGEON-category item, since starring requires dungeonizing first.
// The DUNGEON category alone is not evidence: it marks gear as eligible (188 catalog ids across
// weapons/armor/equipment), and a crafted-but-unconverted Necron's Leggings is a real thing.
// `dungeon_item` is absent from real dungeon armor and equipment, which carry `upgrade_level`
// instead, so its absence proves nothing either. Known gap: a dungeonized piece at 0 stars with a
// non-STARRED id still reads false, which the allowlist below covers. Extracted as its own function
// so scripts/verify-dungeon-and-enchant-behavior.mjs can test this expression directly.
const DUNGEON_CATEGORY_PREFIX = 'DUNGEON ';
const STARRED_ID_PREFIX = 'STARRED_';

// Pieces that come out of the game already dungeonized, needing no per-copy evidence — this closes
// the 0-star gap above, since the NBT carries nothing and the category alone stays ambiguous for
// gear that can be crafted unconverted. A narrow allowlist by id, as in tieredArmorStats.js and
// starring.js's HIGH_STAR_ITEM_IDS.
// The four Wither sets use Hypixel's internal names: POWER = Necron's, SPEED = Maxor's,
// WISE = Storm's, TANK = Goldor's.
const WITHER_ARMOR_PREFIXES = ['POWER_WITHER', 'SPEED_WITHER', 'WISE_WITHER', 'TANK_WITHER'];
const ARMOR_PIECE_SUFFIXES = ['HELMET', 'CHESTPLATE', 'LEGGINGS', 'BOOTS'];
const ALWAYS_DUNGEONIZED_IDS = new Set([
  ...WITHER_ARMOR_PREFIXES.flatMap((prefix) => ARMOR_PIECE_SUFFIXES.map((piece) => `${prefix}_${piece}`)),
  ...ARMOR_PIECE_SUFFIXES.map((piece) => `SHADOW_ASSASSIN_${piece}`),
  'SPIRIT_MASK',
  'BONZO_MASK',
  'BONE_NECKLACE',
  'SHADOW_ASSASSIN_CLOAK',
  'ADAPTIVE_BELT',
  'SOULWEAVER_GLOVES',
]);

export function resolveDungeonizedFlag(summary, item) {
  if (summary.dungeonized) return true;
  if (isTieredArmorStatItem(summary.id)) return true;
  // A STARRED_ id is a Master Mode drop and a distinct, stronger catalog item than its base (Bone
  // Necklace Defense +35 against Starred's +45), not the same item with a boost applied — so it is
  // always dungeon gear, and the Catacombs boost layers on top of those printed stats.
  const id = String(summary.id || '');
  if (id.startsWith(STARRED_ID_PREFIX)) return true;
  if (ALWAYS_DUNGEONIZED_IDS.has(id)) return true;
  const isDungeonCategory = String(item?.category || '').toUpperCase().startsWith(DUNGEON_CATEGORY_PREFIX);
  return isDungeonCategory && (summary.stars || 0) > 0;
}

async function buildItemModifiers(item, summary, itemData, reforgeLookup) {
  const { hexEnchantments, ultimateEnchantment } = await buildEnchantEntries(summary.enchantments, itemData);
  const { stars, masterStars } = splitRawStars(item, summary.stars || 0);
  const davidsCloak = item.id === 'DAVIDS_CLOAK' ? parseDavidsCloakFromLore(summary.lore) : null;
  const specialKind = getSpecialConfig(item.id)?.kind;
  const specialLabel = SPECIAL_LORE_LABELS[specialKind];
  const coinSpecial = specialLabel ? { special: parseLabeledNumberFromLore(summary.lore, specialLabel) } : null;
  const { gemstones, unlocked: gemstoneSlotsUnlocked } = extractGemstoneSlotState(summary.gems, item.gemstone_slots);
  return {
    ...emptyModifiers(),
    hexEnchantments,
    ultimateEnchantment,
    gemstones,
    gemstoneSlotsUnlocked,
    books: Math.min(15, summary.hotPotatoBooks || 0),
    recombobulated: !!summary.recombobulated,
    reforge: summary.modifier ? reforgeLookup[summary.modifier] || null : null,
    // ExtraAttributes.art_of_war_count (see nbt.js) — real, weapon-only.
    artOfWar: !!summary.artOfWar,
    // nbt.js also captures ExtraAttributes.artOfPeaceApplied, but it is not threaded in here:
    // applying ART_OF_PEACE_STAT_BONUS ({ health: 40 }, see books.js) to a real armor piece carrying
    // the flag overshoots Hypixel's own displayed Health, so the armor bonus value is unconfirmed and
    // left unset rather than guessed.
    stars,
    masterStars,
    dungeonized: resolveDungeonizedFlag(summary, item),
    // Real per-copy Gear-Score data (see nbt.js) — only meaningful for the handful of tiered-stat
    // items lib/tieredArmorStats.js models, harmless/unused otherwise.
    itemTier: summary.itemTier || null,
    baseStatBoostPercentage: summary.baseStatBoostPercentage || 0,
    ...davidsCloak,
    ...coinSpecial,
  };
}

// Resolves a raw decoded item summary (just {id, ...modifiers}) against the current item catalog
// into the {id, name, material, category, tier, lore, color, gemstone_slots} shape both the loadout
// and the Review screen's candidate rows (icon/name) need — null if the id doesn't match anything
// in the current NEU-REPO catalog (renamed/removed item since the account last equipped it).
// `gemstone_slots` (real per-slot type + unlock cost, worker/scripts/build-item-data.mjs — Hypixel's
// own resources API) is passed through unchanged (snake_case, same as the catalog field itself,
// same treatment as `upgrade_costs` elsewhere) rather than renamed, so every path that can put an
// item into the loadout — a real import via this function, an Optimizer-suggested swap (also via
// this function, see optimizer.js), or a bare manual pick straight off itemData.armor/weapons —
// exposes it under the identical key with no translation to keep in sync.
//
// Design decision 2026-09-02: always returns the catalog's OWN pristine `item.lore`, never
// Hypixel's real per-account lore (`summary.lore`) — an imported item is rebuilt entirely from
// this catalog base plus the real modifiers below (reforge name, gemstones, stars, enchants, ...)
// through this app's own formula pipeline (lib/itemStatTotals.js), exactly like a manually-built
// item, with zero special-casing. An earlier version of this function swapped in `summary.lore`
// for Gear-Score-scaled items (armor and weapons both) to more closely match the player's real
// in-game numbers, and stripped/re-parsed it accordingly — that machinery is gone: user-confirmed
// (2026-09-02) tradeoff is that this app has no Gear Score scaling formula, so a Gear-Score item's
// Health/Defense/True Defense (and any other Gear-Score-scaled stat) will show the catalog's
// un-scaled baseline rather than the player's real in-game number. `Item Gear Score` itself is not
// displayed or used anywhere.
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
    gemstone_slots: item.gemstone_slots || null,
  };
}

// Resolves every weapon in the account's inventory into full {item, modifiers, location} entries,
// the same per-item resolution mapHypixelImportToLoadout does for the chosen weapon, run across the
// whole `raw.weapons` list. Feeds BuildContext's importHypixelWeaponList, the list beside the Weapon
// slot; entries that don't resolve against the current catalog are skipped.
export async function buildWeaponInventoryList(raw, itemData) {
  const reforgeLookup = buildReforgeNameLookup(itemData);
  const entries = await Promise.all(
    (raw.weapons || []).map(async (summary) => {
      const item = resolveGearSummary(summary, itemData);
      if (!item) return null;
      return { item, modifiers: await buildItemModifiers(item, summary, itemData, reforgeLookup), location: summary.location };
    }),
  );
  return entries.filter(Boolean);
}

// Maps the Worker's raw response onto {loadout, skipped, attributes, playerStats}. `loadout` merges
// straight into BuildContext; `skipped` lists ids that didn't resolve against the current catalog;
// `attributes` is a {id: level} patch; `playerStats` patches the slayer and skill levels.
// `selection.weaponIndex` picks one of `raw.weapons` (null = import no weapon, since there is no
// slot to guess from). `selection.excludedSlots` (a Set of GEAR_SLOT_KEYS) leaves those slots
// untouched, since importHypixelLoadout only patches the keys present in `loadout`.
// `selection.wardrobeSetIndex`/`wardrobeEquipmentSetIndex` source the armor/equipment slots from
// `raw.wardrobeSets`/`raw.wardrobeEquipmentSets` rather than what is worn; both are the set's
// in-game Wardrobe number, matched by `.index` rather than array position, since empty sets are
// filtered out worker-side. `selection.petIndex` picks one of `raw.pets`.
export async function mapHypixelImportToLoadout(raw, itemData, selection = {}) {
  const { weaponIndex = null, excludedSlots, wardrobeSetIndex = null, wardrobeEquipmentSetIndex = null, petIndex = null } = selection;
  const excluded = excludedSlots || new Set();
  const reforgeLookup = buildReforgeNameLookup(itemData);
  const armorSource = wardrobeSetIndex != null ? raw.wardrobeSets?.find((s) => s.index === wardrobeSetIndex) : raw.armor;
  const equipmentSource =
    wardrobeEquipmentSetIndex != null ? raw.wardrobeEquipmentSets?.find((s) => s.index === wardrobeEquipmentSetIndex) : raw.equipment;
  const bySlot = {
    weapon: weaponIndex != null ? raw.weapons?.[weaponIndex] : null,
    helmet: armorSource?.helmet,
    chestplate: armorSource?.chestplate,
    leggings: armorSource?.leggings,
    boots: armorSource?.boots,
    necklace: equipmentSource?.necklace,
    cloak: equipmentSource?.cloak,
    belt: equipmentSource?.belt,
    gloves: equipmentSource?.gloves,
  };

  const loadout = {};
  const skipped = [];

  // Resolving each summary against the catalog is synchronous, so the slots are gathered first and
  // every item's modifiers built concurrently; `loadout` is keyed by slot name, so order is free.
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

  const pet = petIndex != null ? raw.pets?.[petIndex] : null;
  if (pet) {
    loadout.pet = {
      item: {
        id: `${pet.type}_${pet.tier}`,
        petId: pet.type,
        name: derivePetDisplayName(pet.type),
        tier: pet.tier,
        material: 'BONE',
      },
      modifiers: {
        ...emptyPetModifiers(),
        level: pet.level || 1,
        petItem: pet.heldItem || null,
        // Only meaningful for Golden Dragon but imported for whichever pet was picked, like level and
        // petItem above. bank is the co-op bank balance and goldCollection this player's own Gold
        // Ingot collection; either is 0 when that Hypixel API setting is off.
        bankCoins: raw.bank || 0,
        goldCollection: raw.goldCollection || 0,
      },
    };
  }

  // Magical Power, Tuning, per-accessory stats and Enrichments all apply whether or not an Accessory
  // Power is selected (see lib/damageSources.js), so a loadout.accessory entry is always built once
  // real data exists, with `item: null` when no Power was chosen.
  if (raw.accessory) {
    const power = raw.accessory.selectedPower ? getPowerById(raw.accessory.selectedPower.toUpperCase()) : null;
    if (raw.accessory.selectedPower && !power) skipped.push(raw.accessory.selectedPower);
    loadout.accessory = {
      item: power
        ? { id: power.id, name: power.name, iconId: power.sourceItemId || null, material: power.sourceItemId ? 'SKULL' : 'BOOK' }
        : null,
      modifiers: {
        ...emptyAccessoryModifiers(),
        magicalPower: raw.accessory.magicalPower || 0,
        tuning: mapHypixelTuning(raw.accessory.tuning),
        enrichmentCount: raw.accessory.enrichmentCount || 0,
        enrichmentType: raw.accessory.enrichmentType || 'none',
        // Each owned accessory's own stat line, summed by the worker from Accessory Bag lore — see
        // worker/src/index.js's computeLiveAccessoryStats.
        individualAccessoryStats: raw.accessory.itemStats || {},
        // Persisted so the Optimizer's Magical Power section can rank missing and upgradeable
        // accessories without a second account fetch (see lib/accessoryOptimizer.js).
        ownedAccessories: raw.accessory.owned || [],
        // How big the bag is — see lib/accessorySlots.js, which turns these into free slots and,
        // when there are none, the coin cost of the next one.
        bagUpgradesPurchased: raw.accessory.bagUpgradesPurchased || 0,
        redstoneCollection: raw.accessory.redstoneCollection || 0,
      },
    };
  }

  const attributes = mapHypixelAttributeLevels(raw.attributeLevels);

  const playerStats = {};
  if (typeof raw.slayers?.wolf === 'number') playerStats.wolfSlayerLevel = raw.slayers.wolf;
  if (typeof raw.slayers?.spider === 'number') playerStats.tarantulaSlayerLevel = raw.slayers.spider;
  if (typeof raw.slayers?.blaze === 'number') playerStats.blazeSlayerLevel = raw.slayers.blaze;
  if (typeof raw.skills?.alchemy === 'number') playerStats.alchemyLevel = raw.skills.alchemy;
  if (typeof raw.skills?.enchanting === 'number') playerStats.enchantingLevel = raw.skills.enchanting;
  if (typeof raw.skills?.combat === 'number') playerStats.combatLevel = raw.skills.combat;
  if (typeof raw.skills?.foraging === 'number') playerStats.foragingLevel = raw.skills.foraging;
  // Feeds Defense, which only the Ankylosaurus pet reads — see lib/playerDefense.js.
  if (typeof raw.skills?.mining === 'number') playerStats.miningLevel = raw.skills.mining;
  if (typeof raw.skills?.taming === 'number') playerStats.tamingLevel = raw.skills.taming;
  if (typeof raw.skills?.catacombs === 'number') playerStats.catacombsLevel = raw.skills.catacombs;
  if (typeof raw.skills?.skyblock === 'number') playerStats.skyblockLevel = raw.skills.skyblock;
  // Heart of the Mountain's Lonesome Miner perk level, off the account's selected mining skill tree
  // (worker/src/index.js's hotmNodeLevel) — see lib/miningIslands.js.
  if (typeof raw.lonesomeMinerLevel === 'number') playerStats.lonesomeMinerLevel = raw.lonesomeMinerLevel;

  // Digit count off the account's own General's Medallion (worker/src/index.js's
  // parseGeneralsMedallionDigits), 0 when the Accessory Bag holds none.
  if (typeof raw.accessory?.generalsMedallionDigits === 'number') {
    playerStats.generalsMedallionDigits = raw.accessory.generalsMedallionDigits;
  }

  // Mob names the account has maxed the Bestiary on (worker/src/index.js's computeBestiaryMaxedMobs)
  // — see lib/bestiaryStrength.js.
  // The Dungeon Potion tier depends on OWNING a Jellyfish rather than equipping one, and `raw.pets`
  // is every pet on the account, so ownership is answerable from it.
  const hasJellyfishPet = (raw.pets || []).some((pet) => String(pet?.type || '').toUpperCase() === 'JELLYFISH');

  const bestiaryMaxedMobs = Array.isArray(raw.bestiaryMaxedMobs) ? raw.bestiaryMaxedMobs : [];

  // Daedalus Blade's "Combined Mythological Bestiary Tiers" input, derived worker-side from
  // member.bestiary.kills. An owned Daedalus Blade still reads the value off its own NBT lore above;
  // this top-level number covers the case NBT can't — the Optimizer proposing a Daedalus Blade the
  // player doesn't own (see lib/optimizer.js's Diana weapon progression).
  const combinedMythologicalBestiaryTiers =
    typeof raw.combinedMythologicalBestiaryTiers === 'number' ? raw.combinedMythologicalBestiaryTiers : 0;

  // "The One" enchant's per-collection scaling input (worker/src/index.js's
  // computeMaxedCollectionsCount), top-level like combinedMythologicalBestiaryTiers above: the
  // enchant's own lore bakes in whichever account's count was scraped for the catalog snapshot.
  const maxedCollectionsCount = typeof raw.maxedCollectionsCount === 'number' ? raw.maxedCollectionsCount : 0;

  // Account-wide upgrades resolved worker-side (player_data.perks.forbidden_blessing and the
  // talisman bag's Master Skull) rather than typed. The Mimic shard is a normal attribute and
  // arrives through attributeLevels.
  const blessingInputs = {
    forbiddenBlessingLevel: raw.forbiddenBlessingLevel || 0,
    // Off the talisman bag, alongside Magical Power — see the Worker's computeLiveAccessoryStats.
    masterSkullTier: raw.accessory?.masterSkullTier || 0,
  };
  // Essence-shop perk levels, {perkKey: level} — see lib/essencePerks.js.
  const essencePerks = raw.essencePerks || {};
  return {
    loadout,
    skipped,
    attributes,
    playerStats,
    bestiaryMaxedMobs,
    hasJellyfishPet,
    combinedMythologicalBestiaryTiers,
    maxedCollectionsCount,
    blessingInputs,
    essencePerks,
  };
}

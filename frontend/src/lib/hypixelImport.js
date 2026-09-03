import { findGearItem } from './loadoutCode';
import { WORKER_BASE_URL } from './apiConfig';
import { emptyModifiers, emptyPetModifiers, emptyAccessoryModifiers } from './defaultModifiers';
import { fetchEnchantLevels, isUltimateEnchant } from './enchantEffects';
import { derivePetDisplayName } from './petData';
import { getPowerById } from './accessoryPowers';
import { ATTRIBUTE_IDS } from './attributes';
import { getMaxStarsForItem, MAX_MASTER_STARS } from './starring';
import { getSpecialConfig } from './specialWeapons';

/* Hypixel API "import my current gear" — hits the shared Worker's /api/hypixel/import (which
   holds the API key server-side, does the gzip+NBT decode, and computes pet level/attribute
   levels/Wolf Slayer level/Alchemy+Enchanting level server-side; see worker/src/nbt.js and
   worker/src/index.js's handleHypixelImport), then maps the raw response onto this app's own
   loadout/attributes/playerStats shape. Scoped to currently-worn gear + a chosen pet + Accessory
   Power + the account-wide levels named above — not the in-game Loadout/Wardrobe presets.

   Weapon has no dedicated Skyblock inventory slot, so the Worker returns every matching item
   found across Inventory (hotbar first, real slot order), Ender Chest, and every Backpack as
   `raw.weapons` — each entry tagged `location` so the Review screen can show where it came from.
   Similarly `raw.pets` holds every pet the account owns (each flagged `active` for whichever is
   currently equipped) — the Review screen (pages/HypixelImport.jsx) lets the user pick a weapon
   and a pet before mapHypixelImportToLoadout resolves those choices into the loadout. */

// Hypixel's raw attribute id order is "<mobType>_ruler" (e.g. "skeletal_ruler") — reversed from
// this app's own "ruler_<mobType>" id, for 10 of the 17 real Ruler types. Every other (non-Ruler)
// attribute id (elementals, echoes, deadeye, unlimited_power, maximal_torment, etc.) already
// matches Hypixel's raw key 1:1, verified against a real account — note the in-game shard's
// internalName is "MAXIMAL_TORMENT" even though its displayed ability name is "Unlimited Torment".
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
// The other 7 Rulers' real raw stack key doesn't follow "<mobType>_ruler" at all — each is an
// unrelated legacy bazaar-shard short id instead, confirmed live against a real account's
// member.attributes.stacks 2026-08-26 (previously only checked for the shard-item PRICING side,
// worker/src/index.js's ATTRIBUTE_SHARD_IDS — this is the same off-pattern issue, but was still
// silently dropping these 6 Rulers' real levels on import since "infernal_ruler" etc. never
// actually appears as a raw key). Humanoid Ruler is worse than merely off-pattern: a raw
// "humanoid_ruler" key DOES exist, but it's a stale duplicate tracking a completely different real
// ability ("Undead Fortune") — the real Humanoid Ruler stack lives under "humanoid_ruler_new".
// Deliberately NOT mapping the plain "humanoid_ruler" key at all, so it's dropped instead of
// silently importing the wrong attribute's level as ruler_humanoid.
const RAW_ATTRIBUTE_ID_REMAP = {
  ...Object.fromEntries(STANDARD_PATTERN_RULER_TYPES.map((t) => [`${t}_ruler`, `ruler_${t}`])),
  blazing: 'ruler_infernal',
  insect_power: 'ruler_pest',
  undead: 'ruler_undead',
  spirit_axe: 'ruler_woodland',
  arachno: 'ruler_arthropod',
  ender: 'ruler_ender',
  humanoid_ruler_new: 'ruler_humanoid',
};

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

// A handful of reforges' real Hypixel `modifier` id doesn't match a naive lowercase-underscore of
// their display name (e.g. Bloodshot's real id is "blood_shot", Warped's is "aote_stone") — NEU-REPO's
// own `nbtModifier` field (worker-preserved, see fetchReforgeStones) is authoritative when present.
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

// Real per-slot socketed gem + unlock state, mapped onto the item's own real catalog slot ORDER
// (`catalogSlots` — item.gemstone_slots, see worker/scripts/build-item-data.mjs/lib/gemstones.js's
// getAllowedGemsForSlotType). Hypixel keys each real slot "<TYPE>_<n>" where n restarts at 0 for
// EACH DISTINCT slot_type on the item (not one running index across every slot) — confirmed live
// against a real account's Infernal Crimson pieces (its two COMBAT slots keyed COMBAT_0/COMBAT_1)
// — so this walks the catalog's ordered slot list with its own per-type counter to recover which
// raw key belongs to which catalog position, rather than trusting object key insertion order (what
// the old flat version of this function did, and what a manually-picked item with no catalog
// gemstone_slots data still falls back to below). A slot with a gem already socketed is unlocked by
// construction — you can't socket into a locked one — so only an EMPTY slot needs the real
// `gems.unlocked_slots` list (also confirmed live) to tell locked from open.
function extractGemstoneSlotState(gems, catalogSlots) {
  if (!Array.isArray(catalogSlots) || catalogSlots.length === 0) {
    // No real per-slot type/order data for this item — same flat, order-agnostic extraction as
    // before rather than losing the gems entirely; unlock state is simply unknown (nothing marked
    // unlocked below other than what's already, unavoidably, implied by a socketed gem).
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

// David's Cloak has no fixed Strength/rarity in the bundled catalog — its tier upgrades via real
// Hunting Box milestones (not a Recombobulator) and its Strength has no published formula, so
// both only exist in the account's own copy of the item's lore (e.g. "Strength: +57" and a
// trailing "MYTHIC CLOAK" tier line) rather than anywhere this app can derive them from. Parsed
// straight from the real lore Hypixel returns instead of leaving the Special screen's manual
// inputs (`modifiers.special`/`rarityOverride`) at their defaults.
function parseDavidsCloakFromLore(lore) {
  if (!Array.isArray(lore) || lore.length === 0) return { special: 0, rarityOverride: null };
  const stripped = lore.map((l) => l.replace(/§./g, ''));

  const strengthLine = stripped.find((l) => /^Strength:\s*[+-]?\d+/.test(l.trim()));
  const strengthMatch = strengthLine && /^Strength:\s*([+-]?\d+)/.exec(strengthLine.trim());
  const special = strengthMatch ? Math.max(0, parseInt(strengthMatch[1], 10)) : 0;

  const rarities = getSpecialConfig('DAVIDS_CLOAK')?.rarities || [];
  const lastLine = [...stripped].reverse().find((l) => l.trim());
  const rarityOverride = (lastLine && rarities.find((r) => lastLine.trim().toUpperCase().startsWith(r))) || null;

  return { special, rarityOverride };
}

// Several weapons' Special values bake a live "Label: N[ Coins/etc]" line straight into the owned
// item's own lore, not just a raw coin counter — Midas' Sword/Staff's Greed ability and Crown of
// Avarice's Overindulgence ability (confirmed live against real accounts — sammui's/GiantWizard's
// Midas' Staff/Sword read "§7Price paid: §6{amount} Coins", sammui's Crown of Avarice reads
// "§7Coins Consumed: §6{amount}"), and Daedalus Blade/Starred Daedalus Blade's real, dynamically
// computed "§7§2 Mythological §7Bestiary Tiers: §3{count}" line (also confirmed live 2026-08-25 —
// Hypixel computes and bakes the account's real combined tier count directly into the item's own
// lore server-side, same as the coin counters, so no separate Bestiary API call/tier-threshold
// math is needed). Parsed from there into `modifiers.special`, the same field the Special screen's
// manual input already writes to.
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

// Hypixel's own `ExtraAttributes.dungeon_item` flag (see nbt.js) is the authoritative source for
// "is THIS specific copy dungeonized" — always a real boolean here (nbt.js's unconditional
// `!!ea.dungeon_item`), never merely absent, and the ONLY signal trusted here.
// Bug fix 2026-09-02 (round 1): this used to also OR in `item.category.includes('DUNGEON')` as a
// "legacy fallback" — but that category prefix just marks catalog gear that's ELIGIBLE to be
// Dungeonized (confirmed: 188 real ids across weapons/armor/equipment, e.g. Bonzo Staff, Astraea —
// ordinary player-buyable weapons, not an "always drops pre-dungeonized" mob-armor subset), not
// that a given imported copy actually IS.
// Bug fix 2026-09-02 (round 2): this also used to OR in `masterStars > 0`, on the assumption
// "Master Stars can only be applied to an already-dungeonized item" — disproved against sammui's
// real Necron's Leggings (4 real Master Stars, but `summary.dungeonized: false`, and the user
// confirmed the correct display is the plain, non-Catacombs-boosted total). That assumption was
// never actually confirmed with real game data — exactly the kind of guessed mechanic CLAUDE.md
// warns against — so it's dropped rather than re-guessed at differently. Extracted to its own
// function (rather than inlined in buildItemModifiers below) so
// scripts/verify-dungeon-and-enchant-behavior.mjs can regression-test this exact expression
// directly.
export function resolveDungeonizedFlag(summary) {
  return !!summary.dungeonized;
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
    // ExtraAttributes.art_of_war_count (see nbt.js) — real, weapon-only. No confirmed real field
    // for The Art of Peace yet, so armor keeps the emptyModifiers() default (false) here.
    artOfWar: !!summary.artOfWar,
    stars,
    masterStars,
    dungeonized: resolveDungeonizedFlag(summary),
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

// Resolves EVERY real weapon in the account's inventory (not just whichever index the Review
// step's picker ends up choosing) into full {item, modifiers, location} entries — same per-item
// resolution mapHypixelImportToLoadout already does for its own single chosen weapon, just run
// across the whole `raw.weapons` list. Feeds BuildContext's importHypixelWeaponList, the easy-
// access weapon list next to the Weapon slot (user-specified 2026-09-01) — skips any entry that
// fails to resolve against the current catalog rather than guessing at it.
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

// Maps the Worker's raw decoded response onto {loadout, skipped, attributes, playerStats}:
// `loadout` is ready to merge straight into BuildContext (same {item, modifiers} shape as every
// other slot-setter), `skipped` lists any item/power id that didn't resolve against the current
// NEU-REPO catalog (renamed/removed item) so the caller can surface it rather than silently
// dropping it, `attributes` is a {id: level} patch for BuildContext's attributes state, and
// `playerStats` is a patch for its playerStats state (wolfSlayerLevel/tarantulaSlayerLevel/
// blazeSlayerLevel/alchemyLevel/enchantingLevel).
// `selection.weaponIndex` picks one of `raw.weapons` (null/undefined = don't import a weapon —
// there's no dedicated slot to guess from, so the caller must choose); `selection.excludedSlots`
// (a Set of GEAR_SLOT_KEYS names) skips those armor/equipment slots entirely, leaving whatever
// was already in that BuildContext slot untouched (importHypixelLoadout only patches the keys
// present in `loadout`, see BuildContext.jsx). `selection.wardrobeSetIndex`/`wardrobeEquipmentSetIndex`
// source the 4 armor / 4 equipment slots from `raw.wardrobeSets`/`raw.wardrobeEquipmentSets`
// instead of `raw.armor`/`raw.equipment` (currently worn). Both are the set's real in-game
// Wardrobe slot number, matched by `.index` rather than treated as an array position — empty sets
// are already filtered out worker-side, so the two diverge as soon as there's a gap.
// `selection.petIndex` picks one of `raw.pets` (null/undefined = don't import a pet).
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
        // Only meaningful for Golden Dragon, but imported unconditionally for whichever pet was
        // picked — same "always imported" treatment as level/petItem above. bank is the co-op
        // bank balance (raw.bank), goldCollection is this player's own Gold Ingot collection;
        // either is 0 if the account has that Hypixel API setting turned off.
        bankCoins: raw.bank || 0,
        goldCollection: raw.goldCollection || 0,
      },
    };
  }

  // Magical Power/Tuning/individual-accessory-stats/Enrichments all apply independent of whether
  // an Accessory Power is actually selected (see lib/damageSources.js) — so this always builds a
  // loadout.accessory entry once real Hypixel data exists, with `item: null` if no Power was
  // chosen (same shape BuildContext's own setAccessoryMagicalPower etc. already produce for that state).
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
        // Every real, individually-owned accessory's own stat line, generically summed by the
        // worker from real Accessory Bag lore — see worker/src/index.js's computeLiveAccessoryStats.
        individualAccessoryStats: raw.accessory.itemStats || {},
        // Persisted so the Damage Optimizer's Magical Power section can rank real missing/
        // upgradeable accessories later without a separate account fetch (see lib/accessoryOptimizer.js).
        ownedAccessories: raw.accessory.owned || [],
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
  if (typeof raw.skills?.taming === 'number') playerStats.tamingLevel = raw.skills.taming;
  if (typeof raw.skills?.catacombs === 'number') playerStats.catacombsLevel = raw.skills.catacombs;
  if (typeof raw.skills?.skyblock === 'number') playerStats.skyblockLevel = raw.skills.skyblock;
  // Real digit count off the account's own General's Medallion (worker/src/index.js's
  // computeLiveAccessoryStats/parseGeneralsMedallionDigits) — 0 (matches the manual input's own
  // default) when the account doesn't own one in its Accessory Bag.
  if (typeof raw.accessory?.generalsMedallionDigits === 'number') {
    playerStats.generalsMedallionDigits = raw.accessory.generalsMedallionDigits;
  }

  // Real mob names the account has reached max Bestiary tier on (worker/src/index.js's
  // computeBestiaryMaxedMobs) — see lib/bestiaryStrength.js for the consumer.
  const bestiaryMaxedMobs = Array.isArray(raw.bestiaryMaxedMobs) ? raw.bestiaryMaxedMobs : [];

  // Daedalus Blade/Starred Daedalus Blade's real "Combined Mythological Bestiary Tiers" ability
  // input — independently derived (worker/src/index.js's computeCombinedMythologicalBestiaryTiers)
  // from the SAME real member.bestiary.kills data buildItemModifiers already reads straight off an
  // OWNED Daedalus Blade's own NBT lore above (parseLabeledNumberFromLore/SPECIAL_LORE_LABELS.
  // bestiary) — that NBT read stays untouched and is still what a real owned Daedalus Blade uses on
  // import, since it's the most direct source for an item the player actually has. This top-level
  // value exists for the one case NBT can't cover: the Optimizer proposing a Daedalus Blade the
  // player doesn't yet own (see lib/optimizer.js's Diana weapon progression), where there's no
  // owned item's lore to read at all.
  const combinedMythologicalBestiaryTiers =
    typeof raw.combinedMythologicalBestiaryTiers === 'number' ? raw.combinedMythologicalBestiaryTiers : 0;

  // "The One" enchant's real per-collection Health/Strength scaling input (worker/src/index.js's
  // computeMaxedCollectionsCount) — same "top-level, independent of any owned item" treatment as
  // combinedMythologicalBestiaryTiers above, since The One's own lore bakes in whichever account's
  // real count happened to be scraped for NEU-REPO's static catalog snapshot, not this player's.
  const maxedCollectionsCount = typeof raw.maxedCollectionsCount === 'number' ? raw.maxedCollectionsCount : 0;

  return { loadout, skipped, attributes, playerStats, bestiaryMaxedMobs, combinedMythologicalBestiaryTiers, maxedCollectionsCount };
}

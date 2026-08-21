// Damage Increase Optimizer — evaluates real gear/enchant/pet/power alternatives against the
// player's CURRENT loadout, one change at a time, and ranks every real improvement by % damage
// increase. Coin cost isn't modeled yet (needs a real-time Bazaar/AH price API this app doesn't
// have) — see pages/Optimizer.jsx; this only ever sorts by damage, per user direction.
//
// Two kinds of candidates:
// - Curated progression lists (armor pieces, pets) — most of the armor/pet catalog is either
//   irrelevant or has no modeled damage effect in this calculator, so these are hand-authored
//   worst-to-best tier lists, confirmed with the user. Only Slayer mode has one so far; Mage/
//   Dungeon-Archer/Dungeon-Mage only surface the brute-forced categories below until provided.
//   Tiers are ordered worst -> best; multiple entries in one tier are sidegrades — every
//   sidegrade is always evaluated (even the ones matching the player's current tier), since one
//   may numerically beat another despite being nominally "equal".
// - Brute-forced against real, already-modeled data — enchant levels, ultimate enchant choice,
//   Power Stones, and Stars all have a small enumerable real catalog this app's damage pipeline
//   already fully understands, so every real option is tested directly; no hand-authored list needed.

import { collectDamageSources } from './damageSources';
import {
  computeFinalDamage,
  computeAbilityDamage,
  computeDpsBreakdown,
  computeVenomousProcDamage,
  computeEnchantProcDamage,
  computeCrimsonSwipeDamage,
} from './finalDamage';
import { computeCrimsonSwipeInfo } from './armorSetBonuses';
import { ARMOR_SLOTS } from './armorSlots';
import { EQUIPMENT_SLOTS } from './equipmentSlots';
import { resolveGearSummary } from './hypixelImport';
import { emptyModifiers, emptyPetModifiers } from './defaultModifiers';
import {
  fetchEnchantLevels,
  isUltimateEnchant,
  titleCaseEnchantId,
  toRoman,
  getCategoryEnchantIds,
  resolveEnchantCategory,
  computeConflictingEntries,
} from './enchantEffects';
import { STONE_POWERS } from './accessoryPowers';
import { getMaxStarsForItem } from './starring';
import { derivePetDisplayName, getMaxPetLevel, SHINING_SCALES_MAX_GOLD_COLLECTION, MAX_GOLDEN_DRAGON_BANK_COINS } from './petData';
import { formatItemName } from './mcText';
import { canRecombobulate } from './recombobulator';

export const OPTIMIZER_MODES = [
  { id: 'slayer', label: 'Slayer' },
  { id: 'mage', label: 'Mage' },
  { id: 'dungeon_archer', label: 'Dungeon / Archer' },
  { id: 'dungeon_mage', label: 'Dungeon / Mage' },
];

// Which real damage number each mode optimizes — reuses this app's existing melee DPS / Ability
// Damage pipelines rather than a new one. Stated assumption (user hasn't corrected it): Slayer
// and Dungeon/Archer optimize melee Total DPS (DPS Mode's own pipeline, see finalDamage.js);
// Mage and Dungeon/Mage optimize Ability Damage. The two Dungeon variants additionally turn on
// Dungeonized Stats.
const MODE_CONFIG = {
  slayer: { useDungeonizedStats: false, useMasterMode: false, metric: 'dps' },
  mage: { useDungeonizedStats: false, useMasterMode: false, metric: 'ability' },
  dungeon_archer: { useDungeonizedStats: true, useMasterMode: false, metric: 'dps' },
  dungeon_mage: { useDungeonizedStats: true, useMasterMode: false, metric: 'ability' },
};

export function getModeConfig(mode) {
  return MODE_CONFIG[mode] || MODE_CONFIG.slayer;
}

// Real ids, confirmed against worker/src/data/armor.json. "10m/100m/1b coin COA" = Crown of
// Avarice's Coins Consumed special value at that tier — see lib/specialWeapons.js.
const SLAYER_HELMET_PROGRESSION = [
  [{ id: 'TARANTULA_HELMET' }],
  [
    { id: 'CRIMSON_HELMET' },
    { id: 'PRIMORDIAL_HELMET' },
    { id: 'CROWN_OF_AVARICE', special: 10_000_000, label: 'Crown of Avarice (10m Coins Consumed)' },
  ],
  [{ id: 'CROWN_OF_AVARICE', special: 100_000_000, label: 'Crown of Avarice (100m Coins Consumed)' }, { id: 'WARDEN_HELMET' }],
  [
    { id: 'CROWN_OF_AVARICE', special: 1_000_000_000, label: 'Crown of Avarice (1b Coins Consumed)' },
    { id: 'INFERNAL_CRIMSON_HELMET' },
  ],
];

// Chestplate/Leggings/Boots share the same chain shape ("other armor" in the user's spec):
// Shadow Assassin -> Necron's Armor (POWER_WITHER_*, confirmed with the user) -> mid-tier Crimson
// (Hot/Burning/Fiery, sidegrades) -> Infernal Crimson.
function otherArmorProgression(slot) {
  const suffix = slot.toUpperCase();
  return [
    [{ id: `SHADOW_ASSASSIN_${suffix}` }],
    [{ id: `POWER_WITHER_${suffix}` }],
    [{ id: `HOT_CRIMSON_${suffix}` }, { id: `BURNING_CRIMSON_${suffix}` }, { id: `FIERY_CRIMSON_${suffix}` }],
    [{ id: `INFERNAL_CRIMSON_${suffix}` }],
  ];
}

const SLAYER_ARMOR_PROGRESSION = {
  helmet: SLAYER_HELMET_PROGRESSION,
  chestplate: otherArmorProgression('chestplate'),
  leggings: otherArmorProgression('leggings'),
  boots: otherArmorProgression('boots'),
};

// Equipment: Ender 4-piece -> Molten 4-piece uniformly, then each slot branches into its own
// further upgrade — user-specified, real ids confirmed against worker/src/data/equipment.json.
// David's Cloak's real Strength bonus is a manually-entered "Special" number (see
// specialWeapons.js) with no fixed rarity either — defaulted to its own real max (50, MYTHIC)
// for the same "compare a candidate at its real best-case" reason pet candidates are maxed above.
const SLAYER_EQUIPMENT_PROGRESSION = {
  necklace: [[{ id: 'ENDER_NECKLACE' }], [{ id: 'MOLTEN_NECKLACE' }], [{ id: 'RIFT_NECKLACE_OUTSIDE' }]],
  cloak: [
    [{ id: 'ENDER_CLOAK' }],
    [{ id: 'MOLTEN_CLOAK' }],
    [{ id: 'DAVIDS_CLOAK', special: 50, rarityOverride: 'MYTHIC' }, { id: 'ANNIHILATION_CLOAK' }],
  ],
  belt: [[{ id: 'ENDER_BELT' }], [{ id: 'MOLTEN_BELT' }], [{ id: 'THE_PRIMORDIAL' }]],
  gloves: [
    [{ id: 'ENDER_GAUNTLET' }],
    [{ id: 'MOLTEN_BRACELET' }, { id: 'SOULWEAVER_GLOVES' }],
    [{ id: 'SHRIVELED_BRACELET' }, { id: 'DEMONLORD_GAUNTLET' }, { id: 'MANTICORE_CLAW' }],
  ],
};

// "eman/tiger/other -> ankylosaurus/lion -> edrag/gdrag" — "tiger" has no real Skyblock pet by
// that name, read as T-Rex (Tyrannosaurus); "other"/"eman" (Enderman) cover any unmodeled pet
// generically (no special perk in this calculator, so they rank about the same as no pet at all).
const SLAYER_PET_PROGRESSION = [
  [{ petId: 'ENDERMAN' }, { petId: 'TYRANNOSAURUS' }],
  [{ petId: 'ANKYLOSAURUS' }, { petId: 'LION' }],
  [{ petId: 'ENDER_DRAGON' }, { petId: 'GOLDEN_DRAGON' }],
];

const ARMOR_PROGRESSION_BY_MODE = { slayer: SLAYER_ARMOR_PROGRESSION };
const EQUIPMENT_PROGRESSION_BY_MODE = { slayer: SLAYER_EQUIPMENT_PROGRESSION };
const PET_PROGRESSION_BY_MODE = { slayer: SLAYER_PET_PROGRESSION };

export function hasCuratedData(mode) {
  return !!ARMOR_PROGRESSION_BY_MODE[mode] || !!EQUIPMENT_PROGRESSION_BY_MODE[mode] || !!PET_PROGRESSION_BY_MODE[mode];
}

// No real-time Bazaar/AH price source wired up yet — every candidate's coin cost is this
// placeholder until one is. `ratio` (damage % per coin) stays null rather than dividing by a fake
// 0, since a fabricated number would be more misleading than an honest "not available yet".
const PLACEHOLDER_COST = 0;

function withCostPlaceholder(result) {
  if (!result) return result;
  return { ...result, cost: PLACEHOLDER_COST, ratio: PLACEHOLDER_COST > 0 ? result.percentIncrease / PLACEHOLDER_COST : null };
}

function findTierIndex(progression, matches) {
  for (let i = 0; i < progression.length; i++) {
    if (progression[i].some(matches)) return i;
  }
  return -1;
}

// Walks every tier from the player's current position onward (tier 0 if unrecognized) — not just
// the nearest one — evaluating every real candidate via `evaluate` (resolves a candidate to
// `{value, ...}` or null on a catalog miss — skipped rather than guessed) and keeping every
// genuine improvement over `baselineValue` found anywhere in the remaining ladder. The caller
// (runOptimizer) picks the single highest % increase per slot from this full set — "show the
// highest damage increase", not just the closest tier's. Sidegrades within the player's current
// tier are still evaluated too (per the "/" rule), everything else is a straightforward superset.
async function evaluateTieredProgression(progression, currentIndex, isCurrent, baselineValue, evaluate) {
  const effectiveIndex = currentIndex === -1 ? 0 : currentIndex;
  const evaluated = [];
  for (let i = effectiveIndex; i < progression.length; i++) {
    const tierCandidates = progression[i].filter((c) => !(i === effectiveIndex && currentIndex !== -1 && isCurrent(c)));
    for (const candidate of tierCandidates) {
      const outcome = await evaluate(candidate);
      if (!outcome) continue;
      const percentIncrease = baselineValue > 0 ? ((outcome.value - baselineValue) / baselineValue) * 100 : 0;
      if (percentIncrease > 0.001) evaluated.push({ ...outcome, percentIncrease });
    }
  }
  return evaluated;
}

// Runs the full damage-source pipeline for one candidate loadout and reduces it to the mode's
// single damage number (melee Total DPS, or Ability Damage) plus the raw sources (needed once,
// for the baseline call, to also read Bonus Attack Speed).
export async function computeModeDamageAndSources(loadout, itemData, build, modeConfig, mob) {
  const sources = await collectDamageSources(
    loadout,
    itemData,
    build.playerStats,
    build.godPotionActive,
    build.attributes,
    build.miscStats,
    build.mobHpPercent,
    build.infernalCrimsonStacks,
    modeConfig.useDungeonizedStats,
    build.swarmMobs,
    build.comboKills,
    build.legionPlayers,
    build.blazeCrimsonIsle,
  );

  if (modeConfig.metric === 'ability') {
    const ability = computeAbilityDamage(sources, mob, loadout, modeConfig.useDungeonizedStats, modeConfig.useMasterMode);
    return { value: ability ? ability.finalDamage : 0, sources };
  }

  const finalDamage = computeFinalDamage(sources, mob, modeConfig.useDungeonizedStats, modeConfig.useMasterMode);
  const venomousProcDamage = computeVenomousProcDamage(sources, mob, finalDamage.finalDamage);
  const fireAspectProcDamage = computeEnchantProcDamage(finalDamage.finalDamage, sources.fireAspectProc);
  const thunderlordProcDamage = computeEnchantProcDamage(finalDamage.finalDamage, sources.thunderlordProc);
  const crimsonSwipeDamage = computeCrimsonSwipeDamage(finalDamage.finalDamage, computeCrimsonSwipeInfo(loadout, ARMOR_SLOTS));
  const dps = computeDpsBreakdown(
    { finalDamage, venomousProcDamage, fireAspectProcDamage, thunderlordProcDamage, crimsonSwipeDamage },
    sources.baseStats.bonus_attack_speed || 0,
    loadout,
  );
  return { value: dps.total, sources };
}

export async function computeModeDamage(loadout, itemData, build, modeConfig, mob) {
  return (await computeModeDamageAndSources(loadout, itemData, build, modeConfig, mob)).value;
}

// Shared by armor and equipment slots (both are "pick a real catalog item for this slot" —
// identical shape, only the slot list/progression map/result category differ). Candidates swap in
// a bare (unenchanted/unreforged/no stars) copy of the item — compares base-item potential, not a
// fully min-maxed version of it, so a real upgrade's true ceiling may read a little higher than
// shown here. `rarityOverride` (David's Cloak) mirrors the same "compare at real best-case" treatment.
async function evaluateItemSlotCandidates(loadout, itemData, build, modeConfig, mob, baselineValue, slots, progressionBySlot, category) {
  if (!progressionBySlot) return [];
  const results = [];
  for (const slot of slots) {
    const progression = progressionBySlot[slot];
    if (!progression) continue;
    const currentId = loadout[slot]?.item?.id || null;
    const currentIndex = findTierIndex(progression, (c) => c.id === currentId);
    const evaluated = await evaluateTieredProgression(progression, currentIndex, (c) => c.id === currentId, baselineValue, async (candidate) => {
      const resolved = resolveGearSummary({ id: candidate.id }, itemData);
      if (!resolved) return null; // catalog lookup failed — skip rather than guess
      const modifiers = emptyModifiers();
      if (candidate.special != null) modifiers.special = candidate.special;
      if (candidate.rarityOverride != null) modifiers.rarityOverride = candidate.rarityOverride;
      const candidateLoadout = { ...loadout, [slot]: { item: resolved, modifiers } };
      const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
      const apply = [{ type: 'selectItem', slot, item: resolved }];
      if (candidate.special != null) apply.push({ type: 'setSpecialValue', slot, value: candidate.special });
      if (candidate.rarityOverride != null) apply.push({ type: 'setRarityOverride', slot, tier: candidate.rarityOverride });
      return {
        category,
        slot,
        label: candidate.label || formatItemName(resolved.name),
        itemId: resolved.id,
        material: resolved.material,
        special: candidate.special,
        value,
        apply,
      };
    });
    results.push(...evaluated);
  }
  return results;
}

// Pet candidates default to max effectiveness — highest real rarity tier, max level, and (for
// Golden Dragon specifically, harmless no-op for every other pet) maxed Legendary Treasure/
// Shining Scales inputs (see petData.js's MAX_GOLDEN_DRAGON_BANK_COINS/
// SHINING_SCALES_MAX_GOLD_COLLECTION) — user-specified, so a candidate pet's real ceiling is what's
// compared, not its stats at 0/0.
async function evaluatePetCandidates(loadout, itemData, build, modeConfig, mob, mode, baselineValue) {
  const progression = PET_PROGRESSION_BY_MODE[mode];
  if (!progression) return [];
  const currentPetId = loadout.pet?.item?.petId || null;
  const currentIndex = findTierIndex(progression, (c) => c.petId === currentPetId);
  return evaluateTieredProgression(progression, currentIndex, (c) => c.petId === currentPetId, baselineValue, async (candidate) => {
    const petCatalog = itemData.pets?.[candidate.petId];
    if (!petCatalog) return null; // catalog lookup failed — skip rather than guess
    const tiers = Object.keys(petCatalog);
    const tier = tiers.includes('LEGENDARY') ? 'LEGENDARY' : tiers[tiers.length - 1];
    const petItem = { id: `${candidate.petId}_${tier}`, petId: candidate.petId, name: derivePetDisplayName(candidate.petId), tier, material: 'BONE' };
    const candidateLoadout = {
      ...loadout,
      pet: {
        item: petItem,
        modifiers: {
          ...emptyPetModifiers(),
          level: getMaxPetLevel(candidate.petId),
          petItem: loadout.pet?.modifiers?.petItem || null,
          bankCoins: MAX_GOLDEN_DRAGON_BANK_COINS,
          goldCollection: SHINING_SCALES_MAX_GOLD_COLLECTION,
        },
      },
    };
    const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
    return {
      category: 'Pet',
      slot: 'pet',
      label: `${derivePetDisplayName(candidate.petId)} (${tier})`,
      itemId: candidate.petId,
      material: 'BONE',
      value,
      apply: [{ type: 'selectItem', slot: 'pet', item: petItem }],
    };
  });
}

// Brute-forces the next real level of every enchant already on the weapon (e.g. Sharpness 6 -> 7)
// — doesn't propose adding an enchant that isn't already equipped (enchant-slot availability
// isn't modeled anywhere in this app, so guessing whether a new slot is even free would be a real guess).
async function evaluateEnchantCandidates(loadout, itemData, build, modeConfig, mob) {
  const weapon = loadout.weapon;
  if (!weapon) return [];
  const results = [];
  for (const enchant of weapon.modifiers.hexEnchantments || []) {
    const levels = await fetchEnchantLevels(enchant.id, itemData.enchants);
    if (levels.length === 0) continue;
    const maxLevel = Math.max(...levels.map((l) => l.level));
    if (enchant.level >= maxLevel) continue;
    const nextLevel = enchant.level + 1;
    const newEnchants = (weapon.modifiers.hexEnchantments || []).map((e) =>
      e.id === enchant.id ? { ...e, level: nextLevel, maxLevel } : e,
    );
    const candidateLoadout = { ...loadout, weapon: { ...weapon, modifiers: { ...weapon.modifiers, hexEnchantments: newEnchants } } };
    const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
    results.push({
      category: 'Enchant',
      slot: 'weapon',
      label: `${titleCaseEnchantId(enchant.id)} ${toRoman(nextLevel)}`,
      value,
      apply: [{ type: 'applyEnchant', slot: 'weapon', id: enchant.id, level: nextLevel, maxLevel, removeIds: [] }],
    });
  }
  return results;
}

// Brute-forces every real ultimate enchant applicable to the weapon's category (at its own real
// max level) as a full alternative to whichever ultimate is currently equipped. Removes whatever
// computeConflictingEntries says the real item would lose — same conflict resolution the Hex
// enchant picker (pages/EnchantList.jsx) already applies, most importantly One For All's "removes
// every other enchant" rule: both the resulting damage number (candidateLoadout below) and the
// swap-in action's removeIds need this, or a One For All suggestion would silently keep double-
// counting Sharpness/etc.'s damage instead of actually replacing them.
async function evaluateUltimateEnchantCandidates(loadout, itemData, build, modeConfig, mob) {
  const weapon = loadout.weapon;
  if (!weapon) return [];
  const category = resolveEnchantCategory(weapon.item.category);
  const ids = getCategoryEnchantIds(itemData.enchants, category).filter(isUltimateEnchant);
  const currentId = weapon.modifiers.ultimateEnchantment?.id?.toLowerCase() || null;
  const results = [];
  for (const id of ids) {
    if (id.toLowerCase() === currentId) continue;
    const levels = await fetchEnchantLevels(id, itemData.enchants);
    if (levels.length === 0) continue;
    const maxLevel = Math.max(...levels.map((l) => l.level));
    const removeIds = computeConflictingEntries(id, weapon.item.lore, weapon.modifiers).map((e) => e.id);
    const candidateLoadout = {
      ...loadout,
      weapon: {
        ...weapon,
        modifiers: {
          ...weapon.modifiers,
          ultimateEnchantment: { id, level: maxLevel, maxLevel },
          hexEnchantments: (weapon.modifiers.hexEnchantments || []).filter((e) => !removeIds.includes(e.id)),
        },
      },
    };
    const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
    results.push({
      category: 'Ultimate Enchant',
      slot: 'weapon',
      label: `${titleCaseEnchantId(id)} ${toRoman(maxLevel)}`,
      value,
      apply: [{ type: 'applyEnchant', slot: 'weapon', id, level: maxLevel, maxLevel, removeIds }],
    });
  }
  return results;
}

// Brute-forces every real Power Stone (lib/accessoryPowers.js's STONE_POWERS — already fully
// modeled real stats, no hand-authored ranking needed) against whichever is currently selected.
async function evaluatePowerStoneCandidates(loadout, itemData, build, modeConfig, mob) {
  if (!loadout.accessory?.item) return [];
  const currentId = loadout.accessory.item.id;
  const results = [];
  for (const power of STONE_POWERS) {
    if (power.id === currentId) continue;
    // Same {id, name, iconId, material} shape AccessoryPowerPicker.jsx's own selectItem call uses.
    const powerItem = { id: power.id, name: power.name, iconId: power.sourceItemId || null, material: power.sourceItemId ? 'SKULL' : 'BOOK' };
    const candidateLoadout = { ...loadout, accessory: { ...loadout.accessory, item: { ...loadout.accessory.item, id: power.id, name: power.name } } };
    const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
    results.push({
      category: 'Power Stone',
      slot: 'accessory',
      label: power.name,
      value,
      apply: [{ type: 'selectItem', slot: 'accessory', item: powerItem }],
    });
  }
  return results;
}

// Brute-forces starring the weapon and every equipped armor piece up to its real max (see
// lib/starring.js's getMaxStarsForItem) — covers the "infernal stars" step in the user's spec generically.
async function evaluateStarsCandidates(loadout, itemData, build, modeConfig, mob) {
  const results = [];
  for (const slot of ['weapon', ...ARMOR_SLOTS]) {
    const equipped = loadout[slot];
    if (!equipped?.item) continue;
    const maxStars = getMaxStarsForItem(equipped.item);
    const currentStars = equipped.modifiers.stars || 0;
    if (currentStars >= maxStars) continue;
    const candidateLoadout = { ...loadout, [slot]: { ...equipped, modifiers: { ...equipped.modifiers, stars: maxStars } } };
    const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
    results.push({
      category: 'Stars',
      slot,
      label: `${formatItemName(equipped.item.name)} — ${maxStars}✩`,
      value,
      apply: [{ type: 'setStarCount', slot, count: maxStars }],
    });
  }
  return results;
}

// Reforges: user-curated worst -> best progression, not brute-forced (the full reforge catalog
// is ~130 entries, mostly irrelevant to armor/equipment) — confirmed real names + real itemTypes
// against NEU-REPO's reforges.json (blacksmith)/reforgestones.json (stone): Pure/Fierce and
// Renowned/Ancient are ARMOR-typed; Blended/Menacing/Strengthened are EQUIPMENT-typed; Bloodshot
// (Shriveled Cornea stone) is real itemTypes "BELT" specifically, so it's only offered there.
const ARMOR_REFORGE_PROGRESSION = [
  [{ name: 'Pure' }, { name: 'Fierce' }],
  [{ name: 'Renowned' }, { name: 'Ancient' }],
];
const EQUIPMENT_REFORGE_CANDIDATES = [{ name: 'Blended' }, { name: 'Strengthened' }, { name: 'Menacing' }];
const BELT_REFORGE_CANDIDATE = { name: 'Bloodshot' };

function reforgeProgressionForSlot(slot) {
  if (ARMOR_SLOTS.includes(slot)) return ARMOR_REFORGE_PROGRESSION;
  const candidates = slot === 'belt' ? [...EQUIPMENT_REFORGE_CANDIDATES, BELT_REFORGE_CANDIDATE] : EQUIPMENT_REFORGE_CANDIDATES;
  return [candidates]; // one flat tier — no worst->best order given for equipment
}

// Reforge is a modifier change on the item already equipped (not a gear swap), same treatment as
// Stars below — goes into `otherResults`, not the dedicated per-slot gear picker. Uses the same
// full-ladder walk as armor/equipment pieces since armor's list has a real worst->best order.
async function evaluateReforgeCandidates(loadout, itemData, build, modeConfig, mob, baselineValue) {
  const results = [];
  for (const slot of [...ARMOR_SLOTS, ...EQUIPMENT_SLOTS]) {
    const equipped = loadout[slot];
    if (!equipped?.item) continue;
    const progression = reforgeProgressionForSlot(slot);
    const currentName = equipped.modifiers.reforge || null;
    const currentIndex = findTierIndex(progression, (c) => c.name === currentName);
    const evaluated = await evaluateTieredProgression(progression, currentIndex, (c) => c.name === currentName, baselineValue, async (candidate) => {
      const candidateLoadout = { ...loadout, [slot]: { ...equipped, modifiers: { ...equipped.modifiers, reforge: candidate.name } } };
      const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
      return {
        category: 'Reforge',
        slot,
        label: `${formatItemName(equipped.item.name)} — ${candidate.name}`,
        value,
        apply: [{ type: 'applyReforge', slot, name: candidate.name }],
      };
    });
    results.push(...evaluated);
  }
  return results;
}

// Recombobulator 3000: brute-forced (only ever one real choice — toggle it on) against every
// armor/equipment slot below its rarity cap. Also a modifier change, not a gear swap.
async function evaluateRecombobulatorCandidates(loadout, itemData, build, modeConfig, mob) {
  const results = [];
  for (const slot of [...ARMOR_SLOTS, ...EQUIPMENT_SLOTS]) {
    const equipped = loadout[slot];
    if (!equipped?.item || equipped.modifiers.recombobulated) continue;
    const baseTier = equipped.modifiers.rarityOverride || equipped.item.tier;
    if (!canRecombobulate(baseTier)) continue;
    const candidateLoadout = { ...loadout, [slot]: { ...equipped, modifiers: { ...equipped.modifiers, recombobulated: true } } };
    const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
    results.push({
      category: 'Recombobulator',
      slot,
      label: `${formatItemName(equipped.item.name)} — Recombobulator 3000`,
      value,
      apply: [{ type: 'toggleRecombobulated', slot }],
    });
  }
  return results;
}

// Armor's only real hex option besides reforge/recomb is the Habanero Tactics ultimate
// (lib/enchantEffects.js's MISSING_CATEGORY_ENCHANTS — the sole ultimate NEU-REPO's per-category
// enchant lists carry for HELMET/CHESTPLATE/LEGGINGS/BOOTS). Brute-forces every real level found
// in the catalog (not just next/max, unlike the weapon evaluator below) since the enchant's own
// real level floor is above 1 (levels IV/V) — catalog-driven rather than hardcoding "4 and 5".
async function evaluateArmorUltimateEnchantCandidates(loadout, itemData, build, modeConfig, mob) {
  const results = [];
  for (const slot of ARMOR_SLOTS) {
    const equipped = loadout[slot];
    if (!equipped?.item) continue;
    const category = resolveEnchantCategory(equipped.item.category);
    const ids = getCategoryEnchantIds(itemData.enchants, category).filter(isUltimateEnchant);
    const current = equipped.modifiers.ultimateEnchantment;
    for (const id of ids) {
      const levels = await fetchEnchantLevels(id, itemData.enchants);
      if (levels.length === 0) continue;
      const maxLevel = Math.max(...levels.map((l) => l.level));
      for (const levelData of levels) {
        const level = levelData.level;
        if (current && current.id.toLowerCase() === id.toLowerCase() && level <= current.level) continue;
        // Same conflict resolution as the weapon evaluator above — a no-op today (armor's only
        // real ultimate is Habanero Tactics, so there's nothing else to conflict with), but
        // correct if that ever changes instead of silently keeping a removed enchant's damage.
        const removeIds = computeConflictingEntries(id, equipped.item.lore, equipped.modifiers).map((e) => e.id);
        const candidateLoadout = {
          ...loadout,
          [slot]: {
            ...equipped,
            modifiers: {
              ...equipped.modifiers,
              ultimateEnchantment: { id, level, maxLevel },
              hexEnchantments: (equipped.modifiers.hexEnchantments || []).filter((e) => !removeIds.includes(e.id)),
            },
          },
        };
        const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
        results.push({
          category: 'Ultimate Enchant',
          slot,
          label: `${formatItemName(equipped.item.name)} — ${titleCaseEnchantId(id)} ${toRoman(level)}`,
          value,
          apply: [{ type: 'applyEnchant', slot, id, level, maxLevel, removeIds }],
        });
      }
    }
  }
  return results;
}

// Dedicated-slot order for the sidebar's fixed layout — one slot each, user-specified.
export const OPTIMIZER_GEAR_SLOTS = [...ARMOR_SLOTS, ...EQUIPMENT_SLOTS, 'pet'];

// Runs every evaluator, computes % increase against the current loadout's real baseline, keeps
// only genuine upgrades (positive delta). Coin cost isn't factored in anywhere here — see the
// file header. Two result shapes:
// - `slots`: one dedicated entry per OPTIMIZER_GEAR_SLOTS slot — the single candidate across the
//   whole remaining curated ladder (every tier from the player's current position onward, not
//   just the nearest one) with the highest real % damage increase, or null ("no upgrades
//   available") when the slot has nothing configured or nothing left beats the current item.
// - `otherResults`: the brute-forced, non-slot-tiered categories (Enchant/Ultimate Enchant/Power
//   Stone/Stars) — these aren't "tiered", so every real option found still shows, sorted by %.
// Every result also carries `cost`/`ratio` (damage-increase-per-coin) — coin cost isn't wired to a
// real price source yet (see file header), so `cost` is a placeholder 0 and `ratio` is null until
// it is; the fields exist now so a future price API only has to fill them in, not add them.
export async function runOptimizer(loadout, itemData, build, mode, mob) {
  const modeConfig = getModeConfig(mode);
  const { value: baselineValue, sources: baselineSources } = await computeModeDamageAndSources(loadout, itemData, build, modeConfig, mob);

  const [armor, equipment, pets, enchants, ultimates, armorUltimates, powers, stars, reforges, recombs] = await Promise.all([
    evaluateItemSlotCandidates(loadout, itemData, build, modeConfig, mob, baselineValue, ARMOR_SLOTS, ARMOR_PROGRESSION_BY_MODE[mode], 'Armor'),
    evaluateItemSlotCandidates(
      loadout,
      itemData,
      build,
      modeConfig,
      mob,
      baselineValue,
      EQUIPMENT_SLOTS,
      EQUIPMENT_PROGRESSION_BY_MODE[mode],
      'Equipment',
    ),
    evaluatePetCandidates(loadout, itemData, build, modeConfig, mob, mode, baselineValue),
    evaluateEnchantCandidates(loadout, itemData, build, modeConfig, mob),
    evaluateUltimateEnchantCandidates(loadout, itemData, build, modeConfig, mob),
    evaluateArmorUltimateEnchantCandidates(loadout, itemData, build, modeConfig, mob),
    evaluatePowerStoneCandidates(loadout, itemData, build, modeConfig, mob),
    evaluateStarsCandidates(loadout, itemData, build, modeConfig, mob),
    evaluateReforgeCandidates(loadout, itemData, build, modeConfig, mob, baselineValue),
    evaluateRecombobulatorCandidates(loadout, itemData, build, modeConfig, mob),
  ]);

  // Armor/equipment/pet/reforge results already carry their own real percentIncrease
  // (evaluateTieredProgression computes it while walking tiers, since it needs the value to decide
  // whether to advance) — only the non-tiered categories below still need it computed here.
  const withPercent = (list) =>
    list
      .map((r) => ({ ...r, percentIncrease: baselineValue > 0 ? ((r.value - baselineValue) / baselineValue) * 100 : 0 }))
      .filter((r) => r.percentIncrease > 0.001);

  const slotCandidates = [...armor, ...equipment, ...pets];
  const slots = {};
  for (const slot of OPTIMIZER_GEAR_SLOTS) {
    const forSlot = slotCandidates.filter((r) => r.slot === slot);
    slots[slot] = forSlot.length > 0 ? forSlot.reduce((best, r) => (r.percentIncrease > best.percentIncrease ? r : best)) : null;
  }

  const otherResults = [...withPercent([...enchants, ...ultimates, ...armorUltimates, ...powers, ...stars, ...recombs]), ...reforges].sort(
    (a, b) => b.percentIncrease - a.percentIncrease,
  );

  for (const slot of OPTIMIZER_GEAR_SLOTS) slots[slot] = withCostPlaceholder(slots[slot]);

  return {
    baselineValue,
    bonusAttackSpeed: baselineSources.baseStats.bonus_attack_speed || 0,
    slots,
    otherResults: otherResults.map(withCostPlaceholder),
  };
}

// Executes one result's `apply` steps against a live BuildContext (see useBuild()) — the
// "swap-in" action. `build` must expose selectItem/applyEnchant/setSpecialValue/setStarCount
// (every one of them already used elsewhere in the app for the exact same mutations, just
// triggered from a picker page instead of here). Steps run in order since a Crown of Avarice
// candidate needs its item selected before its Special value can be set.
export function applyOptimizerResult(build, result) {
  for (const step of result.apply) {
    switch (step.type) {
      case 'selectItem':
        build.selectItem(step.slot, step.item);
        break;
      case 'applyEnchant':
        build.applyEnchant(step.slot, step.id, step.level, step.maxLevel, step.removeIds || []);
        break;
      case 'setSpecialValue':
        build.setSpecialValue(step.slot, step.value);
        break;
      case 'setRarityOverride':
        build.setRarityOverride(step.slot, step.tier);
        break;
      case 'setStarCount':
        build.setStarCount(step.slot, step.count);
        break;
      case 'applyReforge':
        build.applyReforge(step.slot, step.name);
        break;
      case 'toggleRecombobulated':
        build.toggleRecombobulated(step.slot);
        break;
      default:
        break;
    }
  }
}

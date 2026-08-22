// Damage Increase Optimizer — evaluates real gear/enchant/pet/power alternatives against the
// player's CURRENT loadout, one change at a time, and ranks every real improvement by % damage
// increase. Real coin cost (lib/pricing.js, Worker-precomputed from SkyHelperBot/Prices — see
// worker/src/index.js's resolveCosts) is attached to every result below, giving `ratio`
// (% DPS increase per coin) a real value for the "Best Value" sort — see pages/Optimizer.jsx.
//
// Two kinds of candidates:
// - Curated progression lists (weapons, armor pieces, equipment, pets) — most of the catalog is
//   either irrelevant or has no modeled damage effect in this calculator, so these are
//   hand-authored worst-to-best tier lists, confirmed with the user. Only Slayer mode has one so
//   far; Mage/Dungeon-Archer/Dungeon-Mage only surface the brute-forced categories below until
//   provided. Tiers are ordered worst -> best; multiple entries in one tier are sidegrades —
//   every sidegrade is always evaluated (even the ones matching the player's current tier),
//   since one may numerically beat another despite being nominally "equal". Only the player's
//   current tier and the single immediate next tier are ever offered (see
//   evaluateTieredProgression) — a real progression has to be earned one rung at a time, so a
//   later tier scoring a bigger % increase never gets suggested as a shortcut past the one right
//   in front of the player. Weapons are the one
//   exception with more than one tier list per mode (SLAYER_WEAPON_PROGRESSION): each real
//   Slayer type hands out its own independent chain, all targeting the single 'weapon' slot.
// - Brute-forced against real, already-modeled data — enchant levels, ultimate enchant choice,
//   Power Stones, Stars, and Pet Items all have a small enumerable real catalog this app's damage pipeline
//   already fully understands, so every real option is tested directly; no hand-authored list needed.

import { collectDamageSources } from './damageSources';
import { computeAbilityDamage, computeDpsBreakdown } from './finalDamage';
import { ARMOR_SLOTS } from './armorSlots';
import { EQUIPMENT_SLOTS } from './equipmentSlots';
import { VANQUISHED_SET, FINAL_DESTINATION_SET, hasFullSet } from './armorSetBonuses';
import { resolveGearSummary } from './hypixelImport';
import { lookupCandidateCost } from './pricing';
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
// Avarice's Coins Consumed special value at that tier — see lib/specialWeapons.js. The Crimson
// line's Hot/Burning/Fiery power tiers sit between the Basic-equivalent checkpoint (bare Crimson/
// Primordial/10m COA) and the Warden/100m-COA checkpoint, each its own tier (not a sidegrade
// group) so a real player is only ever offered one power tier at a time — Hot before Burning
// before Fiery before Infernal — matching lib/armorVariants.js's VARIANT_TIERS stat-confirmed
// ascending order. Flag if Hot/Burning/Fiery should rank differently against Warden/Crown of
// Avarice specifically; the within-family Hot<Burning<Fiery<Infernal order itself is confirmed.
const SLAYER_HELMET_PROGRESSION = [
  [{ id: 'TARANTULA_HELMET' }],
  [
    { id: 'CRIMSON_HELMET' },
    { id: 'PRIMORDIAL_HELMET' },
    { id: 'CROWN_OF_AVARICE', special: 10_000_000, label: 'Crown of Avarice (10m Coins Consumed)' },
  ],
  [{ id: 'HOT_CRIMSON_HELMET' }],
  [{ id: 'BURNING_CRIMSON_HELMET' }],
  [{ id: 'FIERY_CRIMSON_HELMET' }],
  [{ id: 'CROWN_OF_AVARICE', special: 100_000_000, label: 'Crown of Avarice (100m Coins Consumed)' }, { id: 'WARDEN_HELMET' }],
  [
    { id: 'CROWN_OF_AVARICE', special: 1_000_000_000, label: 'Crown of Avarice (1b Coins Consumed)' },
    { id: 'INFERNAL_CRIMSON_HELMET' },
  ],
];

// Chestplate/Leggings/Boots share the same chain shape ("other armor" in the user's spec):
// Shadow Assassin -> Necron's Armor (POWER_WITHER_*, confirmed with the user) -> Crimson's own
// Basic/Hot/Burning/Fiery power tiers (see the helmet chain's note above for why these are split
// into individual tiers) -> Infernal Crimson.
function otherArmorProgression(slot) {
  const suffix = slot.toUpperCase();
  return [
    [{ id: `SHADOW_ASSASSIN_${suffix}` }],
    [{ id: `POWER_WITHER_${suffix}` }],
    [{ id: `CRIMSON_${suffix}` }],
    [{ id: `HOT_CRIMSON_${suffix}` }],
    [{ id: `BURNING_CRIMSON_${suffix}` }],
    [{ id: `FIERY_CRIMSON_${suffix}` }],
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

// User-specified: no clear universal "best" pet (situational — Golden Dragon is the general
// pick, but not strictly dominant), so all 10 real ids (confirmed against NEU-REPO's
// petnums.json) sit in one flat tier — every pet is always compared against every other,
// unlike the strict worst->best chains below. "Tiger" is a real, separate pet from T-Rex
// (Tyrannosaurus), not an alias for it.
const SLAYER_PET_PROGRESSION = [
  [
    { petId: 'GRIFFIN' },
    { petId: 'TYRANNOSAURUS' },
    { petId: 'TIGER' },
    { petId: 'ANKYLOSAURUS' },
    { petId: 'LION' },
    { petId: 'BLAZE' },
    { petId: 'ZOMBIE' },
    { petId: 'WITHER_SKELETON' },
    { petId: 'ENDER_DRAGON' },
    { petId: 'GOLDEN_DRAGON' },
  ],
];

// Slayer weapon reward lines — each Slayer type hands out its own fixed worst->best weapon
// chain, independent of every other chain (a Reaper Falchion isn't "better or worse" than a
// Scorpion Foil, they're for different Slayers). User-specified endpoints for all 4; ids
// confirmed real against worker/src/data/weapons.json. Zombie/Spider lines are fully
// user-specified. Enderman (katana) and the two Blaze (dagger) lines only had their endpoint
// given ("ends at Atomsplit Katana" / "ending at Pyrochaos/Deathripper") — the middle links
// below are inferred from real rarity progression (UNCOMMON->RARE->EPIC->LEGENDARY) and shared
// id roots (VOID*_KATANA; FIRE*_DAGGER vs MAW*_DAGGER, matching the existing Firedust/Twilight
// sibling-pair note above) — flag if this ordering is wrong.
const SLAYER_WEAPON_PROGRESSION = {
  zombie: [[{ id: 'UNDEAD_SWORD' }], [{ id: 'REVENANT_SWORD' }], [{ id: 'REAPER_SWORD' }], [{ id: 'AXE_OF_THE_SHREDDED' }]],
  spider: [
    [{ id: 'SPIDER_SWORD' }],
    [{ id: 'RECLUSE_FANG' }],
    [{ id: 'TARANTULA_FANG' }],
    [{ id: 'SCORPION_FOIL' }],
    [{ id: 'STING' }],
  ],
  enderman: [[{ id: 'VOIDWALKER_KATANA' }], [{ id: 'VOIDEDGE_KATANA' }], [{ id: 'VORPAL_KATANA' }], [{ id: 'ATOMSPLIT_KATANA' }]],
  blaze_fire: [[{ id: 'FIREDUST_DAGGER' }], [{ id: 'BURSTFIRE_DAGGER' }], [{ id: 'HEARTFIRE_DAGGER' }]],
  blaze_maw: [[{ id: 'MAWDUST_DAGGER' }], [{ id: 'BURSTMAW_DAGGER' }], [{ id: 'HEARTMAW_DAGGER' }]],
};

const ARMOR_PROGRESSION_BY_MODE = { slayer: SLAYER_ARMOR_PROGRESSION };
const EQUIPMENT_PROGRESSION_BY_MODE = { slayer: SLAYER_EQUIPMENT_PROGRESSION };
const PET_PROGRESSION_BY_MODE = { slayer: SLAYER_PET_PROGRESSION };
const WEAPON_PROGRESSION_BY_MODE = { slayer: SLAYER_WEAPON_PROGRESSION };

export function hasCuratedData(mode) {
  return (
    !!WEAPON_PROGRESSION_BY_MODE[mode] ||
    !!ARMOR_PROGRESSION_BY_MODE[mode] ||
    !!EQUIPMENT_PROGRESSION_BY_MODE[mode] ||
    !!PET_PROGRESSION_BY_MODE[mode]
  );
}

// Real coin cost (lib/pricing.js) per candidate — `'?'` (not `0`) when no real cost source exists
// for this specific candidate (Stars without upgrade_costs data, a free/blacksmith-rolled reforge,
// etc.), since a literal 0 would misleadingly read as "this is free" now that sibling rows show
// real numbers. `'?'.toLocaleString()` doesn't throw (strings have that method), so the existing
// render code needs no changes for this case.
function withCost(result, itemData) {
  if (!result) return result;
  const cost = lookupCandidateCost(result, itemData);
  const hasRealCost = typeof cost === 'number' && cost > 0;
  return { ...result, cost: hasRealCost ? cost : '?', ratio: hasRealCost ? result.percentIncrease / cost : null };
}

function findTierIndex(progression, matches) {
  for (let i = 0; i < progression.length; i++) {
    if (progression[i].some(matches)) return i;
  }
  return -1;
}

// Only ever evaluates the player's current tier (to catch a same-tier sidegrade, per the "/"
// rule) and the single immediate next tier up — never further ahead, even if a later tier would
// score a bigger % increase. A real player has to earn each rung of a progression in order (e.g.
// Voidedge Katana's only offer is Vorpal, never Atomsplit; Crimson armor's only offer is Hot, not
// Infernal), so skipping straight to the best-scoring tier down the line isn't a real "upgrade
// path" and was misleading. An unrecognized current item (currentIndex === -1) has no known tier
// to step from, so only the chain's very first tier is offered rather than guessing how far along
// an unrecognized item might be. `evaluate` resolves a candidate to `{value, ...}` or null on a
// catalog miss (skipped rather than guessed); every genuine improvement over `baselineValue`
// within this one-or-two-tier window is kept, and the caller (runOptimizer) picks the single
// highest % increase among those.
async function evaluateTieredProgression(progression, currentIndex, isCurrent, baselineValue, evaluate) {
  const effectiveIndex = currentIndex === -1 ? 0 : currentIndex;
  const maxIndex = currentIndex === -1 ? effectiveIndex : effectiveIndex + 1;
  const evaluated = [];
  for (let i = effectiveIndex; i <= maxIndex && i < progression.length; i++) {
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

  const dps = computeDpsBreakdown(sources, mob, loadout, modeConfig.useDungeonizedStats, modeConfig.useMasterMode);
  return { value: dps.total, sources };
}

export async function computeModeDamage(loadout, itemData, build, modeConfig, mob) {
  return (await computeModeDamageAndSources(loadout, itemData, build, modeConfig, mob)).value;
}

// Shared by armor and equipment slots (both are "pick a real catalog item for this slot" —
// identical shape, only the slot list/progression map/result category differ). Candidates carry
// over the CURRENTLY equipped item's reforge and ultimate enchant (a real player immediately
// re-applies their reforge stone/book on a fresh upgrade, not left bare) — compares "same
// persistent upgrades, different base item" rather than a fully bare candidate against a
// decked-out current item, which used to understate a real upgrade's true value. Gemstones/normal
// enchants/stars are NOT carried (item-specific slot counts/categories, handled by their own
// dedicated evaluators). `rarityOverride` (David's Cloak) mirrors the same "compare at real
// best-case" treatment.
async function evaluateItemSlotCandidates(loadout, itemData, build, modeConfig, mob, baselineValue, slots, progressionBySlot, category) {
  if (!progressionBySlot) return [];
  const results = [];
  for (const slot of slots) {
    const progression = progressionBySlot[slot];
    if (!progression) continue;
    const currentModifiers = loadout[slot]?.modifiers;
    const currentId = loadout[slot]?.item?.id || null;
    const currentIndex = findTierIndex(progression, (c) => c.id === currentId);
    const evaluated = await evaluateTieredProgression(progression, currentIndex, (c) => c.id === currentId, baselineValue, async (candidate) => {
      const resolved = resolveGearSummary({ id: candidate.id }, itemData);
      if (!resolved) return null; // catalog lookup failed — skip rather than guess
      const modifiers = emptyModifiers();
      if (candidate.special != null) modifiers.special = candidate.special;
      if (candidate.rarityOverride != null) modifiers.rarityOverride = candidate.rarityOverride;
      if (currentModifiers?.reforge) modifiers.reforge = currentModifiers.reforge;
      if (currentModifiers?.ultimateEnchantment) modifiers.ultimateEnchantment = currentModifiers.ultimateEnchantment;
      const candidateLoadout = { ...loadout, [slot]: { item: resolved, modifiers } };
      const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
      const apply = [{ type: 'selectItem', slot, item: resolved }];
      if (candidate.special != null) apply.push({ type: 'setSpecialValue', slot, value: candidate.special });
      if (candidate.rarityOverride != null) apply.push({ type: 'setRarityOverride', slot, tier: candidate.rarityOverride });
      if (currentModifiers?.reforge) apply.push({ type: 'applyReforge', slot, name: currentModifiers.reforge });
      if (currentModifiers?.ultimateEnchantment) {
        apply.push({
          type: 'applyEnchant',
          slot,
          id: currentModifiers.ultimateEnchantment.id,
          level: currentModifiers.ultimateEnchantment.level,
          maxLevel: currentModifiers.ultimateEnchantment.maxLevel,
          removeIds: [],
        });
      }
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

// Vanquished (Equipment) and Final Destination (Armor) only pay off once EVERY piece is worn (see
// armorSetBonuses.js's hasFullSet) — evaluating one slot at a time like evaluateItemSlotCandidates
// does could never show a mid-swap piece's true value, since the set bonus doesn't activate until
// the last piece lands (the same "coarse per-point search can't see a lumpy payoff" problem
// lib/tuningOptimizer.js solves for Bonus Attack Speed's breakpoints). So each is its own single
// candidate that swaps every slot in the set at once, carrying over each existing slot's own
// reforge/ultimate enchant the same way evaluateItemSlotCandidates does. Runs unconditionally
// (not gated on a mode's curated progression) since neither set is mode-specific content.
const FULL_SET_CANDIDATES = [
  {
    category: 'Full Set',
    label: 'Vanquished Equipment (Full Set)',
    slots: EQUIPMENT_SLOTS,
    idsBySlot: { necklace: 'VANQUISHED_MAGMA_NECKLACE', cloak: 'VANQUISHED_GHAST_CLOAK', belt: 'VANQUISHED_BLAZE_BELT', gloves: 'VANQUISHED_GLOWSTONE_GAUNTLET' },
    setIds: VANQUISHED_SET,
  },
  {
    category: 'Full Set',
    label: 'Final Destination Armor (Full Set)',
    slots: ARMOR_SLOTS,
    idsBySlot: { helmet: 'FINAL_DESTINATION_HELMET', chestplate: 'FINAL_DESTINATION_CHESTPLATE', leggings: 'FINAL_DESTINATION_LEGGINGS', boots: 'FINAL_DESTINATION_BOOTS' },
    setIds: FINAL_DESTINATION_SET,
  },
];

async function evaluateFullSetCandidates(loadout, itemData, build, modeConfig, mob) {
  const results = [];
  for (const set of FULL_SET_CANDIDATES) {
    if (hasFullSet(loadout, set.slots, set.setIds)) continue; // already wearing it — nothing to suggest
    const candidateLoadout = { ...loadout };
    const apply = [];
    let allResolved = true;
    for (const slot of set.slots) {
      const resolved = resolveGearSummary({ id: set.idsBySlot[slot] }, itemData);
      if (!resolved) {
        allResolved = false;
        break;
      }
      const currentModifiers = loadout[slot]?.modifiers;
      const modifiers = emptyModifiers();
      if (currentModifiers?.reforge) modifiers.reforge = currentModifiers.reforge;
      if (currentModifiers?.ultimateEnchantment) modifiers.ultimateEnchantment = currentModifiers.ultimateEnchantment;
      candidateLoadout[slot] = { item: resolved, modifiers };
      apply.push({ type: 'selectItem', slot, item: resolved });
      if (currentModifiers?.reforge) apply.push({ type: 'applyReforge', slot, name: currentModifiers.reforge });
      if (currentModifiers?.ultimateEnchantment) {
        apply.push({
          type: 'applyEnchant',
          slot,
          id: currentModifiers.ultimateEnchantment.id,
          level: currentModifiers.ultimateEnchantment.level,
          maxLevel: currentModifiers.ultimateEnchantment.maxLevel,
          removeIds: [],
        });
      }
    }
    if (!allResolved) continue; // catalog lookup failed — skip rather than guess
    const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
    results.push({ category: set.category, slot: set.slots.join('/'), label: set.label, value, apply });
  }
  return results;
}

// Weapon item choice: unlike armor/equipment/pet, several independent chains (see
// SLAYER_WEAPON_PROGRESSION) all target the same single 'weapon' slot. Each real Slayer type's
// chain is its own reward track, not a tier of some universal "best weapon" ladder — a Reaper
// Falchion isn't "worse" than a Scorpion Foil, and (user-confirmed) a Pyrochaos Dagger isn't
// "worse" than a Deathripper Dagger despite Deathripper's higher raw damage; they're earned
// independently and are meaningfully different weapons. So once the player's current weapon is
// recognized as belonging to ONE of these chains, only that chain gets walked/suggested — the
// others never cross-suggest into it just because they happen to deal more damage. Only when the
// current weapon matches NONE of the mode's chains (no weapon yet, or one outside this curated
// list) do all chains get walked from tier 0, same bare-item comparison and apply shape as
// evaluateItemSlotCandidates above, just without a slot-keyed progression map.
async function evaluateWeaponProgressionCandidates(loadout, itemData, build, modeConfig, mob, mode, baselineValue) {
  const chains = WEAPON_PROGRESSION_BY_MODE[mode];
  if (!chains) return [];
  const currentModifiers = loadout.weapon?.modifiers;
  const currentId = loadout.weapon?.item?.id || null;
  const allProgressions = Object.values(chains);
  const ownedProgressions = allProgressions.filter((progression) => findTierIndex(progression, (c) => c.id === currentId) !== -1);
  const progressionsToWalk = ownedProgressions.length > 0 ? ownedProgressions : allProgressions;
  const results = [];
  for (const progression of progressionsToWalk) {
    const currentIndex = findTierIndex(progression, (c) => c.id === currentId);
    const evaluated = await evaluateTieredProgression(progression, currentIndex, (c) => c.id === currentId, baselineValue, async (candidate) => {
      const resolved = resolveGearSummary({ id: candidate.id }, itemData);
      if (!resolved) return null; // catalog lookup failed — skip rather than guess
      // Same "carry over the current item's persistent upgrades" treatment as
      // evaluateItemSlotCandidates above — a real player re-applies their reforge/ultimate
      // enchant on a fresh weapon rather than leaving it bare.
      const modifiers = emptyModifiers();
      if (currentModifiers?.reforge) modifiers.reforge = currentModifiers.reforge;
      if (currentModifiers?.ultimateEnchantment) modifiers.ultimateEnchantment = currentModifiers.ultimateEnchantment;
      const candidateLoadout = { ...loadout, weapon: { item: resolved, modifiers } };
      const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
      const apply = [{ type: 'selectItem', slot: 'weapon', item: resolved }];
      if (currentModifiers?.reforge) apply.push({ type: 'applyReforge', slot: 'weapon', name: currentModifiers.reforge });
      if (currentModifiers?.ultimateEnchantment) {
        apply.push({
          type: 'applyEnchant',
          slot: 'weapon',
          id: currentModifiers.ultimateEnchantment.id,
          level: currentModifiers.ultimateEnchantment.level,
          maxLevel: currentModifiers.ultimateEnchantment.maxLevel,
          removeIds: [],
        });
      }
      return {
        category: 'Weapon',
        slot: 'weapon',
        label: formatItemName(resolved.name),
        itemId: resolved.id,
        material: resolved.material,
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

// Every real Crimson armor power tier (Basic/Hot/Burning/Fiery/Infernal) — user-specified: each
// individual star level counts as its own separate upgrade suggestion for these, not just a
// single jump-to-max entry, since Crimson's 10/15-star range is a real, expensive-per-star grind
// (unlike a normal 5-star item) worth seeing broken down. Verified real ids against
// worker/src/data/armor.json (exactly 20: 5 tiers x 4 pieces).
const CRIMSON_ARMOR_RE = /^(?:INFERNAL_|HOT_|BURNING_|FIERY_)?CRIMSON_(?:HELMET|CHESTPLATE|LEGGINGS|BOOTS)$/;

// Brute-forces starring the weapon and every equipped armor piece up to its real max (see
// lib/starring.js's getMaxStarsForItem) — covers the "infernal stars" step in the user's spec
// generically. Every non-Crimson item still gets one "jump straight to max" suggestion; Crimson
// armor (see CRIMSON_ARMOR_RE above) gets one candidate per individual star level instead.
async function evaluateStarsCandidates(loadout, itemData, build, modeConfig, mob) {
  const results = [];
  for (const slot of ['weapon', ...ARMOR_SLOTS]) {
    const equipped = loadout[slot];
    if (!equipped?.item) continue;
    const maxStars = getMaxStarsForItem(equipped.item);
    const currentStars = equipped.modifiers.stars || 0;
    if (currentStars >= maxStars) continue;
    // Crimson: the FULL 1..max range every time (1..10 for the lower 4 tiers, 1..15 for
    // Infernal), not just from the current count onward — user-specified. Anything at or below
    // the current count computes a non-positive percentIncrease and is filtered out downstream
    // (runOptimizer's withPercent), so this is safe/inert for already-passed levels, not a
    // regression risk.
    const starLevels = CRIMSON_ARMOR_RE.test(equipped.item.id)
      ? Array.from({ length: maxStars }, (_, i) => i + 1)
      : [maxStars];
    for (const stars of starLevels) {
      const candidateLoadout = { ...loadout, [slot]: { ...equipped, modifiers: { ...equipped.modifiers, stars } } };
      const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
      results.push({
        category: 'Stars',
        slot,
        label: `${formatItemName(equipped.item.name)} — ${stars}✩`,
        // Real per-item id, so lib/pricing.js can look up the cumulative star cost (Worker-
        // precomputed from Hypixel's real upgrade_costs data) without needing the whole loadout.
        itemId: equipped.item.id,
        value,
        apply: [{ type: 'setStarCount', slot, count: stars }],
      });
    }
  }
  return results;
}

// Pet Items: brute-forced against the full real catalog (~88 entries, see worker/src/data/
// petItems.json) rather than curated — small enough to just test everything, and
// lib/petItemEffects.js's parsePetItemStatBoost already tells real combat-stat boosts (Strength,
// Crit Chance/Damage, etc.) apart from XP/coin/cosmetic ones from the item's own lore, so a pure
// XP-boost item naturally computes a ~0% increase and gets filtered out below same as any other
// non-improvement — no separate "is this combat-relevant" allowlist needed.
async function evaluatePetItemCandidates(loadout, itemData, build, modeConfig, mob) {
  const pet = loadout.pet;
  if (!pet?.item) return [];
  const currentPetItemId = pet.modifiers?.petItem || null;
  const results = [];
  for (const petItem of itemData.petItems || []) {
    if (petItem.id === currentPetItemId) continue;
    const candidateLoadout = { ...loadout, pet: { ...pet, modifiers: { ...pet.modifiers, petItem: petItem.id } } };
    const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
    results.push({
      category: 'Pet Item',
      slot: 'pet',
      label: `${derivePetDisplayName(pet.item.petId)} — ${formatItemName(petItem.name)}`,
      value,
      apply: [{ type: 'setPetItem', slot: 'pet', petItemId: petItem.id }],
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

// NEU-REPO's per-category enchant lists carry 8 real ultimates for HELMET/CHESTPLATE/LEGGINGS/
// BOOTS (Bank, Last Stand, Legion, No Pain No Gain, Wisdom, Habanero Tactics, Bobbin Time,
// Refrigerate — Habanero itself needs lib/enchantEffects.js's MISSING_CATEGORY_ENCHANTS patch
// since NEU-REPO's own list omits it). User-verified from each one's real lore: only Habanero
// Tactics has a damage effect this calculator's formula can ever produce — the other 7 (coins on
// death, Defense/Vitality on a live low-HP trigger this static calculator has no equivalent of, XP
// orbs, banked-XP Intelligence, fishing, Mana-to-Defense) don't map to any tracked stat, and Legion's
// per-nearby-player bonus isn't a reliable value for solo/small-group Slayer grinding the way it
// would be for a full Dungeon party — so Slayer mode prunes straight to Habanero instead of paying
// for a full real-pipeline evaluation of all 8 (measured: this was the single most expensive
// evaluator in the whole optimizer, since it's brute-forced across all 4 armor slots × every real
// level found, not just next/max like the weapon evaluator below).
const SLAYER_ARMOR_ULTIMATE_IDS = new Set(['ultimate_habanero_tactics']);

async function evaluateArmorUltimateEnchantCandidates(loadout, itemData, build, modeConfig, mob, mode) {
  const results = [];
  for (const slot of ARMOR_SLOTS) {
    const equipped = loadout[slot];
    if (!equipped?.item) continue;
    const category = resolveEnchantCategory(equipped.item.category);
    let ids = getCategoryEnchantIds(itemData.enchants, category).filter(isUltimateEnchant);
    if (mode === 'slayer') ids = ids.filter((id) => SLAYER_ARMOR_ULTIMATE_IDS.has(id.toLowerCase()));
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
export const OPTIMIZER_GEAR_SLOTS = ['weapon', ...ARMOR_SLOTS, ...EQUIPMENT_SLOTS, 'pet'];

// Runs every evaluator, computes % increase against the current loadout's real baseline, keeps
// only genuine upgrades (positive delta). Two result shapes:
// - `slots`: one dedicated entry per OPTIMIZER_GEAR_SLOTS slot — the single candidate across the
//   whole remaining curated ladder (every tier from the player's current position onward, not
//   just the nearest one) with the highest real % damage increase, or null ("no upgrades
//   available") when the slot has nothing configured or nothing left beats the current item.
// - `otherResults`: the brute-forced, non-slot-tiered categories (Enchant/Ultimate Enchant/Power
//   Stone/Stars) — these aren't "tiered", so every real option found still shows, sorted by %.
// Every result also carries `cost`/`ratio` (damage-increase-per-coin) via withCost/lib/pricing.js
// — a real number when a coin cost source exists for that specific candidate, `'?'`/`null` when
// it doesn't (see lib/pricing.js for exactly which categories are/aren't priceable today).
export async function runOptimizer(loadout, itemData, build, mode, mob) {
  const modeConfig = getModeConfig(mode);
  const { value: baselineValue, sources: baselineSources } = await computeModeDamageAndSources(loadout, itemData, build, modeConfig, mob);

  const [weapons, armor, equipment, pets, enchants, ultimates, armorUltimates, powers, stars, reforges, recombs, petItems, fullSets] =
    await Promise.all([
      evaluateWeaponProgressionCandidates(loadout, itemData, build, modeConfig, mob, mode, baselineValue),
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
      evaluateArmorUltimateEnchantCandidates(loadout, itemData, build, modeConfig, mob, mode),
      evaluatePowerStoneCandidates(loadout, itemData, build, modeConfig, mob),
      evaluateStarsCandidates(loadout, itemData, build, modeConfig, mob),
      evaluateReforgeCandidates(loadout, itemData, build, modeConfig, mob, baselineValue),
      evaluateRecombobulatorCandidates(loadout, itemData, build, modeConfig, mob),
      evaluatePetItemCandidates(loadout, itemData, build, modeConfig, mob),
      evaluateFullSetCandidates(loadout, itemData, build, modeConfig, mob),
    ]);

  // Armor/equipment/pet/reforge results already carry their own real percentIncrease
  // (evaluateTieredProgression computes it while walking tiers, since it needs the value to decide
  // whether to advance) — only the non-tiered categories below still need it computed here.
  const withPercent = (list) =>
    list
      .map((r) => ({ ...r, percentIncrease: baselineValue > 0 ? ((r.value - baselineValue) / baselineValue) * 100 : 0 }))
      .filter((r) => r.percentIncrease > 0.001);

  const slotCandidates = [...weapons, ...armor, ...equipment, ...pets];
  const slots = {};
  for (const slot of OPTIMIZER_GEAR_SLOTS) {
    const forSlot = slotCandidates.filter((r) => r.slot === slot);
    slots[slot] = forSlot.length > 0 ? forSlot.reduce((best, r) => (r.percentIncrease > best.percentIncrease ? r : best)) : null;
  }

  const otherResults = [
    ...withPercent([...enchants, ...ultimates, ...armorUltimates, ...powers, ...stars, ...recombs, ...petItems, ...fullSets]),
    ...reforges,
  ].sort((a, b) => b.percentIncrease - a.percentIncrease);

  for (const slot of OPTIMIZER_GEAR_SLOTS) slots[slot] = withCost(slots[slot], itemData);

  return {
    baselineValue,
    bonusAttackSpeed: baselineSources.baseStats.bonus_attack_speed || 0,
    slots,
    otherResults: otherResults.map((r) => withCost(r, itemData)),
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
      case 'setPetItem':
        build.setPetItem(step.petItemId);
        break;
      case 'setAccessoryMagicalPower':
        build.setAccessoryMagicalPower(step.mp);
        break;
      case 'setAccessoryTuning':
        build.setAccessoryTuning(step.tuning);
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

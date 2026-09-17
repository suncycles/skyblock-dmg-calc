// Final Damage against a specific target mob.
//
//   InitialDamage = (5 + WeaponDMG) * (1 + Strength/100)
//   FinalDamage   = floor((InitialDamage * AdditiveMultiplier * WeaponBonusMultiplier * MultiplicativeMultiplier + BonusModifiers) * (1 + CritDamage/100))
//
// AdditiveMultiplier = 1 + every applicable % bonus summed (damageSources.js's
// additiveNonConditional plus the matching additiveConditional entries). Excludes the equipped
// weapon's own "+X% damage" ability.
// WeaponBonusMultiplier = 1 + the weapon's own "+X% damage" abilities summed, as its own factor:
// Atomsplit Katana's "+300% damage to Endermen" is a 4x factor.
// MultiplicativeMultiplier = the product of every "x" bonus (Crown of Avarice, Skyblock Level,
// armor-set bonuses).
// BonusModifiers is a flat amount added after those stages but still scaled by Crit Damage; nothing
// modeled maps to it, so it stays 0.
// Unlimited Power and Unlimited Energy are already baked into baseStats by damageSources.js, so
// this formula reads baseStats as-is.

import { MOB_TYPE_SYMBOLS } from './damageSymbols';
import { resolveMobKey, SEA_CREATURE_MOBS, LAVA_SEA_CREATURE_MOBS } from './mobTypes';
import { ABILITY_DAMAGE_TABLE } from './abilityDamage';
import { getMobLocations } from './mobLocations';
import { getBestiaryStrengthBonus } from './bestiaryStrength';
import { hasFullSet, computeCrimsonSwipeInfo, FINAL_DESTINATION_STRENGTH, FINAL_DESTINATION_ATTACK_SPEED } from './armorSetBonuses';
import { ARMOR_SLOTS } from './armorSlots';
import { computeMobDamageReduction, computeMobMagicResistance, computeMobDefenseMultiplier } from './mobDefenses';
import { mobDefenseDebuffMultiplier, finalDamageDebuffMultiplier } from './mobDebuffs';

const KNOWN_TYPE_NAMES = new Set(Object.keys(MOB_TYPE_SYMBOLS).map((t) => t.toLowerCase()));
const SEA_CREATURE_KEYS = new Set(SEA_CREATURE_MOBS.map((name) => resolveMobKey(name)).filter(Boolean));
const LAVA_SEA_CREATURE_KEYS = new Set(LAVA_SEA_CREATURE_MOBS.map((name) => resolveMobKey(name)).filter(Boolean));

// The Garden's mobs and Jerry's Workshop's four Jerrys deal and take token damage in-game, so their
// Final Damage is forced to 0. Checked by name before any formula logic in every damage function
// below, making it a hard override rather than another multiplier.
const JOKE_LOCATIONS = new Set(['The Garden', "Jerry's Workshop"]);
// The Watcher, guarding the gate between Catacombs floors, is an unkillable 0-HP puzzle mob and gets
// the same force-to-0 treatment.
const JOKE_MOB_NAMES = new Set(['The Watcher']);
function isJokeMob(mob) {
  if (!mob?.name) return false;
  return JOKE_MOB_NAMES.has(mob.name) || getMobLocations(mob.name).some((loc) => JOKE_LOCATIONS.has(loc));
}

// Inferno Demonlord (Blaze Slayer Tier 4) takes damage only from the two Blaze Slayer dagger lines
// (Firedust->Burstfire->Heartfire and Twilight/Mawdust->Burstmaw->Heartmaw); every other weapon
// deals zero. A hard override like isJokeMob above. One hardcoded mob — generalize to a per-mob
// weapon allowlist if another appears.
const DAGGER_ONLY_MOBS = new Set(['Inferno Demonlord']);
const DAGGER_LINE_WEAPON_IDS = new Set([
  'FIREDUST_DAGGER', 'BURSTFIRE_DAGGER', 'HEARTFIRE_DAGGER',
  'MAWDUST_DAGGER', 'BURSTMAW_DAGGER', 'HEARTMAW_DAGGER',
]);
function isBlockedByDaggerRestriction(mob, weaponId) {
  return !!mob?.name && DAGGER_ONLY_MOBS.has(mob.name) && !DAGGER_LINE_WEAPON_IDS.has(weaponId);
}

// Mobs tagged "Shielded" (lib/mobTypes.js) take exactly 1 damage per hit from everything: melee,
// abilities, the Beam and every proc. Unlike the force-to-0 above, forcing to 1 doesn't propagate
// through multiplication, so each per-hit and per-proc function below checks it independently.
function isShieldedMob(mob) {
  return !!mob?.types?.includes('Shielded');
}

// A `condition` string is comma-separated ("Undead, Skeletal, Wither"). Each token is a canonical
// Mob Type name, the collective "Sea Creatures" grouping or its narrower "Lava Sea Creatures"
// subset, or a literal mob name from an item ability's own text ("Blazes").
export function conditionMatchesMob(condition, mob) {
  if (!condition || !mob) return false;
  const mobKey = resolveMobKey(mob.name);
  return condition
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .some((token) => {
      const lower = token.toLowerCase();
      if (KNOWN_TYPE_NAMES.has(lower)) {
        return (mob.types || []).some((t) => t.toLowerCase() === lower);
      }
      if (lower === 'lava sea creatures' || lower === 'lava sea creature') {
        return mobKey != null && LAVA_SEA_CREATURE_KEYS.has(mobKey);
      }
      if (lower === 'sea creatures' || lower === 'sea creature') {
        return mobKey != null && SEA_CREATURE_KEYS.has(mobKey);
      }
      return mobKey != null && resolveMobKey(token) === mobKey;
    });
}

// Picks which of damageSources.js's parallel baseStats totals applies — normal, dungeonized or
// master-dungeonized — from the useDungeonizedStats and useMasterMode toggles, then swaps in the
// matching mythological* variant when the target is a Mythological mob (Challenger's/Mythos doubled
// stats, see damageSources.js's MYTHOLOGICAL_STAT_DOUBLE_IDS). `mob` is optional. Exported for
// scripts/verify-dungeon-and-enchant-behavior.mjs.
export function selectBaseStats(sources, useDungeonizedStats, useMasterMode, mob) {
  const isMythological = !!mob?.types?.includes('Mythological');
  // Master Stars' stat bonus is gated behind `useMasterMode`: outside Master Mode they never apply.
  const base = !useDungeonizedStats
    ? isMythological
      ? sources.mythologicalBaseStats
      : sources.baseStats
    : useMasterMode
      ? isMythological
        ? sources.mythologicalMasterDungeonizedBaseStats
        : sources.masterDungeonizedBaseStats
      : isMythological
        ? sources.mythologicalDungeonizedBaseStats
        : sources.dungeonizedBaseStats;
  // Per-mob Bestiary Strength bonus (lib/bestiaryStrength.js), applied once the selected mob's own
  // max tier is known to be maxed. Added here, after collectDamageSources resolved every
  // statsMultiplier source, so Superior Dragon and Unlimited Power never scale it.
  const bestiaryBonus = getBestiaryStrengthBonus(mob?.name, sources.bestiaryMaxedMobs);
  const withBestiary = bestiaryBonus ? { ...base, strength: (base.strength || 0) + bestiaryBonus } : base;
  // Final Destination's Vivacious Darkness Strength and Attack Speed activate only against Ender-type
  // mobs, unlike its +100% Ender damage line, which is an ordinary conditional entry.
  const isEnder = !!mob?.types?.includes('Ender');
  if (!sources.hasFinalDestinationFullSet || !isEnder) return withBestiary;
  return {
    ...withBestiary,
    strength: (withBestiary.strength || 0) + FINAL_DESTINATION_STRENGTH,
    bonus_attack_speed: (withBestiary.bonus_attack_speed || 0) + FINAL_DESTINATION_ATTACK_SPEED,
  };
}

// `sources` is collectDamageSources()'s result; `mob` is {name, types}. Situational entries are never
// included. `useDungeonizedStats` swaps in each dungeonized item's Catacombs-scaled stat total;
// `useMasterMode`, meaningful only alongside it, folds in each item's Master Star delta.
// `excludeFirstHitOnly` drops First Strike/Triple Strike, which fire only on a fight's opening hits.
export function computeFinalDamage(sources, mob, useDungeonizedStats = false, useMasterMode = false, excludeFirstHitOnly = false) {
  if (isJokeMob(mob) || isBlockedByDaggerRestriction(mob, sources.weaponId)) {
    return {
      initialDamage: 0,
      additiveMultiplier: 1,
      additivePercent: 0,
      weaponBonusMultiplier: 1,
      weaponBonusPercent: 0,
      multiplicativeMultiplier: 1,
      bonusModifiers: 0,
      damageReductionPercent: 0,
      mobDefenseMultiplier: 1,
      finalDamage: 0,
      finalDamageNonCrit: 0,
      appliedIds: new Set(),
    };
  }

  if (isShieldedMob(mob)) {
    return {
      initialDamage: 0,
      additiveMultiplier: 1,
      additivePercent: 0,
      weaponBonusMultiplier: 1,
      weaponBonusPercent: 0,
      multiplicativeMultiplier: 1,
      bonusModifiers: 0,
      damageReductionPercent: 0,
      mobDefenseMultiplier: 1,
      finalDamage: 1,
      finalDamageNonCrit: 1,
      appliedIds: new Set(),
    };
  }

  const { additiveNonConditional, additiveConditional, weaponBonusNonConditional, weaponBonusConditional, multiplicative } = sources;
  const baseStats = selectBaseStats(sources, useDungeonizedStats, useMasterMode, mob);
  const appliedIds = new Set();

  let additivePercent = 0;
  for (const e of additiveNonConditional) {
    if (excludeFirstHitOnly && e.firstHitOnly) continue;
    additivePercent += e.value;
    appliedIds.add(e.id);
  }
  for (const e of additiveConditional) {
    if (conditionMatchesMob(e.condition, mob)) {
      additivePercent += e.value;
      appliedIds.add(e.id);
    }
  }

  let weaponBonusPercent = 0;
  for (const e of weaponBonusNonConditional || []) {
    weaponBonusPercent += e.value;
    appliedIds.add(e.id);
  }
  for (const e of weaponBonusConditional || []) {
    if (conditionMatchesMob(e.condition, mob)) {
      weaponBonusPercent += e.value;
      appliedIds.add(e.id);
    }
  }

  let multiplicativeMultiplier = 1;
  for (const e of multiplicative) {
    if (!e.condition || conditionMatchesMob(e.condition, mob)) {
      multiplicativeMultiplier *= e.value;
      appliedIds.add(e.id);
    }
  }

  // No currently-modeled source populates this.
  const bonusModifiers = 0;

  const initialDamage = (5 + baseStats.damage) * (1 + baseStats.strength / 100);
  const additiveMultiplier = 1 + additivePercent / 100;
  const weaponBonusMultiplier = 1 + weaponBonusPercent / 100;
  // Mob-side Damage Reduction and Defense (lib/mobDefenses.js) are direct final multipliers on any
  // damage dealt, so they come last; everything derived from this melee number inherits them.
  const damageReductionPercent = computeMobDamageReduction(mob, sources.isGriffinPet);
  // Last Breath/Lethality shred the Defense STAT before its curve (lib/mobDebuffs.js); Ice Spray
  // and Twilight Arrow Poison are flat external multipliers and belong at this same last step.
  const mobDefenseMultiplier = computeMobDefenseMultiplier(mob, useMasterMode, mobDefenseDebuffMultiplier(sources.debuffs));
  const debuffMultiplier = finalDamageDebuffMultiplier(sources.debuffs);
  const preCritDamage = initialDamage * additiveMultiplier * weaponBonusMultiplier * multiplicativeMultiplier + bonusModifiers;
  const finalDamage = Math.floor(
    preCritDamage * (1 + baseStats.crit_damage / 100) * (1 - damageReductionPercent / 100) * mobDefenseMultiplier * debuffMultiplier,
  );
  // The same formula without the Crit Damage factor: a non-critical hit, used by
  // computeDpsBreakdown's crit-weighted DPS.
  const finalDamageNonCrit = Math.floor(preCritDamage * (1 - damageReductionPercent / 100) * mobDefenseMultiplier * debuffMultiplier);

  return {
    initialDamage,
    additiveMultiplier,
    additivePercent,
    weaponBonusMultiplier,
    weaponBonusPercent,
    multiplicativeMultiplier,
    bonusModifiers,
    damageReductionPercent,
    mobDefenseMultiplier,
    finalDamage,
    finalDamageNonCrit,
    appliedIds,
  };
}

// Mage Mode's Ability Damage:
//   InitialDamage = BaseAbilityDamage * (1 + Intelligence/100 * AbilityScaling) * (1 + AbilityDamageStat/100)
//   FinalDamage   = floor(InitialDamage * AdditiveMultiplier * MultiplicativeMultiplier)
// `table.base` ("Base Ability Damage", e.g. Hyperion's 10000) and `baseStats.ability_damage` (the
// "Ability Damage" stat, e.g. from Wither Goggles) are different inputs, kept as separate variables
// so they are never conflated.
// AdditiveMultiplier counts only entries tagged `abilityEligible`: Giant Killer, Execute, Prosecute,
// the 7 type-bane enchants, the Ruler and Dominance attributes, Combat Level, Golden Dragon's
// Legendary Treasure, Ender Dragon's End Strike, Zombie's Rotten Blade and Wither Skeleton's Wither
// Blood. Every other additive source is excluded.
// MultiplicativeMultiplier is sources.abilityMultiplicative: Skyblock Level, the Implosion Belt's
// 1.25x (Hyperion/Spirit Sceptre/Yeti Sword only) and the Loving reforge's 1.05x (chestplate only,
// stripped out of baseStats.ability_damage in lib/reforges.js) — its own bucket rather than a filter
// over the melee list, most of which doesn't apply here.
// `table.base` also picks up the weapon's GENERAL Catacombs Stats Boost
// (sources.abilityBaseDamageBoost) as a (1 + percent/100) multiplier, distinct from the "Ability
// Damage" stat's own curve-less formula — see CLAUDE.md. Applied only while useDungeonizedStats is
// on and the weapon itself is dungeonized; 0, a 1x no-op, otherwise.
// No Crit Damage step: abilities don't crit. BonusModifiers stays 0.
// Returns null when the equipped weapon has no table entry.
export function computeAbilityDamage(sources, mob, loadout, useDungeonizedStats = false, useMasterMode = false) {
  const weaponId = loadout.weapon?.item?.id;
  const table = ABILITY_DAMAGE_TABLE[weaponId];
  if (!table) return null;

  if (isJokeMob(mob) || isBlockedByDaggerRestriction(mob, weaponId)) {
    return {
      baseDamage: table.base,
      scaling: table.scaling,
      abilityDamageStat: 0,
      catacombsBoostPercent: 0,
      catacombsBoostMultiplier: 1,
      initialDamage: 0,
      additiveMultiplier: 1,
      additivePercent: 0,
      multiplicativeMultiplier: 1,
      damageReductionPercent: 0,
      magicResistancePercent: 0,
      mobDefenseMultiplier: 1,
      finalDamage: 0,
      appliedIds: new Set(),
    };
  }

  if (isShieldedMob(mob)) {
    return {
      baseDamage: table.base,
      scaling: table.scaling,
      abilityDamageStat: 0,
      catacombsBoostPercent: 0,
      catacombsBoostMultiplier: 1,
      initialDamage: 0,
      additiveMultiplier: 1,
      additivePercent: 0,
      multiplicativeMultiplier: 1,
      damageReductionPercent: 0,
      magicResistancePercent: 0,
      mobDefenseMultiplier: 1,
      finalDamage: 1,
      appliedIds: new Set(),
    };
  }

  const { additiveNonConditional, additiveConditional, abilityMultiplicative } = sources;
  const baseStats = selectBaseStats(sources, useDungeonizedStats, useMasterMode, mob);
  const appliedIds = new Set();

  let additivePercent = 0;
  for (const e of additiveNonConditional) {
    if (e.abilityEligible) {
      additivePercent += e.value;
      appliedIds.add(e.id);
    }
  }
  for (const e of additiveConditional) {
    if (e.abilityEligible && conditionMatchesMob(e.condition, mob)) {
      additivePercent += e.value;
      appliedIds.add(e.id);
    }
  }

  let multiplicativeMultiplier = 1;
  for (const e of abilityMultiplicative) {
    if (!e.condition || conditionMatchesMob(e.condition, mob)) {
      multiplicativeMultiplier *= e.value;
      appliedIds.add(e.id);
    }
  }

  const abilityDamageStat = baseStats.ability_damage || 0;
  const catacombsBoostPercent = useDungeonizedStats
    ? (useMasterMode ? sources.abilityBaseDamageBoost?.withMaster : sources.abilityBaseDamageBoost?.withoutMaster) || 0
    : 0;
  const catacombsBoostMultiplier = 1 + catacombsBoostPercent / 100;
  const initialDamage =
    table.base * catacombsBoostMultiplier * (1 + (baseStats.intelligence / 100) * table.scaling) * (1 + abilityDamageStat / 100);
  const additiveMultiplier = 1 + additivePercent / 100;
  // Mob-side Damage Reduction and Defense apply to ANY damage (see computeFinalDamage); Magic
  // Resistance is Ability-damage-only — all three lib/mobDefenses.js, all direct final multipliers.
  const damageReductionPercent = computeMobDamageReduction(mob, sources.isGriffinPet);
  const magicResistancePercent = computeMobMagicResistance(mob);
  const mobDefenseMultiplier = computeMobDefenseMultiplier(mob, useMasterMode, mobDefenseDebuffMultiplier(sources.debuffs));
  const finalDamage = Math.floor(
    initialDamage *
      additiveMultiplier *
      multiplicativeMultiplier *
      (1 - damageReductionPercent / 100) *
      (1 - magicResistancePercent / 100) *
      mobDefenseMultiplier *
      finalDamageDebuffMultiplier(sources.debuffs),
  );

  return {
    baseDamage: table.base,
    scaling: table.scaling,
    abilityDamageStat,
    catacombsBoostPercent,
    catacombsBoostMultiplier,
    initialDamage,
    additiveMultiplier,
    additivePercent,
    damageReductionPercent,
    magicResistancePercent,
    mobDefenseMultiplier,
    multiplicativeMultiplier,
    finalDamage,
    appliedIds,
  };
}

// Mage Staff Beam: a calculation feature rather than an item, always active alongside the weapon's
// own Ability Damage. Every melee attack also fires a ranged beam dealing a multiple of the full
// melee Final Damage for the same mob, scaled by Intelligence:
//   BeamDamage = MeleeFinalDamage * (0.3 + 0.0009 * Intelligence)
// Independent of ABILITY_DAMAGE_TABLE, so unlike computeAbilityDamage it never returns null for a
// non-ability weapon. Uses the same dungeon/master Intelligence through selectBaseStats. Purely
// multiplicative on meleeFinalDamage, so a joke mob's zeroed melee damage zeroes the Beam too.
const MAGE_STAFF_BEAM_BASE_MULTIPLIER = 0.3;
const MAGE_STAFF_BEAM_INTELLIGENCE_RATE = 0.0009;

export function computeMageStaffBeamDamage(sources, mob, meleeFinalDamage, useDungeonizedStats = false, useMasterMode = false) {
  const baseStats = selectBaseStats(sources, useDungeonizedStats, useMasterMode, mob);
  const intelligence = baseStats.intelligence || 0;
  const finalDamage = isShieldedMob(mob)
    ? 1
    : Math.floor(meleeFinalDamage * (MAGE_STAFF_BEAM_BASE_MULTIPLIER + MAGE_STAFF_BEAM_INTELLIGENCE_RATE * intelligence));
  return { meleeFinalDamage, intelligence, finalDamage };
}

// Crimson Swipe: a melee-only proc on meleeFinalDamage. `swipeInfo` is computeCrimsonSwipeInfo()'s
// result, null when fewer than 2 Crimson-family pieces are worn, in which case this returns null.
//   Damage_swipe = MeleeFinal * (SwipeMultiplier * 100) / TotalAdditivePercent
// `additivePercent` is the raw summed additive % (300 for +300%, not the 1+x/100 form), so the more
// additive damage is stacked the smaller Swipe's own share. Guards the divide-by-zero case.
export function computeCrimsonSwipeDamage(mob, meleeFinalDamage, swipeInfo, additivePercent) {
  if (!swipeInfo) return null;
  if (isShieldedMob(mob)) return { ...swipeInfo, meleeFinalDamage, finalDamage: 1 };
  if (!additivePercent) return { ...swipeInfo, meleeFinalDamage, finalDamage: 0 };
  const finalDamage = Math.floor(meleeFinalDamage * ((swipeInfo.multiplier * 100) / additivePercent));
  return { ...swipeInfo, meleeFinalDamage, finalDamage };
}

// Venomous: a per-hit, per-second proc.
//   BaseDamage = X% of melee Final Damage
//   ProcDamage = BaseDamage * (product of every ability-eligible multiplier)
// "ability-eligible" is the same source set Ability Damage counts (Giant Killer, Execute, the 7
// type-bane enchants, Combat Level, Ruler/Dominance), but excluding Skyblock Level. Unlike
// computeAbilityDamage this multiplies onto the finished meleeFinalDamage rather than a from-scratch
// initial damage. Returns null when Venomous isn't equipped.
const VENOMOUS_EXCLUDED_MULTIPLICATIVE_ID = 'skyblock-level';

// Every landed hit adds its own DoT stack rather than refreshing one, stacking to 40, and each stack
// ticks the same ProcDamage per second. This returns the single-stack value; DamageSources.jsx's
// graph multiplies it out to the cap.
export const MAX_VENOMOUS_STACKS = 40;

// Bosses Venomous' poison doesn't apply to at all. Every other damage source works normally.
const VENOMOUS_IMMUNE_MOBS = new Set(['Atoned Horror', 'Quazii', 'Typhoeus']);

// Not immune but heavily resistant: the poison still ticks, at 1% of its normal damage. `label` names
// the mechanic and is shown beside the DPS row, so a tiny Venomous number reads as a mob mechanic
// rather than a bug.
const VENOMOUS_REDUCED_MOBS = {
  'Inferno Demonlord': { multiplier: 0.01, label: 'Hellion Shield' },
};

export function computeVenomousProcDamage(sources, mob, meleeFinalDamage) {
  const proc = sources.venomousProc;
  if (!proc) return null;
  if (isJokeMob(mob) || VENOMOUS_IMMUNE_MOBS.has(mob?.name)) return { ...proc, finalDamage: 0 };
  if (isShieldedMob(mob)) return { ...proc, finalDamage: 1 };

  const { additiveNonConditional, additiveConditional, abilityMultiplicative } = sources;

  let additivePercent = 0;
  for (const e of additiveNonConditional) {
    if (e.abilityEligible) additivePercent += e.value;
  }
  for (const e of additiveConditional) {
    if (e.abilityEligible && conditionMatchesMob(e.condition, mob)) additivePercent += e.value;
  }

  let multiplicativeMultiplier = 1;
  for (const e of abilityMultiplicative) {
    if (e.id === VENOMOUS_EXCLUDED_MULTIPLICATIVE_ID) continue;
    if (!e.condition || conditionMatchesMob(e.condition, mob)) multiplicativeMultiplier *= e.value;
  }

  // Folded into the same single floor rather than floored twice: at 1% a second rounding step would
  // quantise the result enough to matter.
  const reduction = VENOMOUS_REDUCED_MOBS[mob?.name];
  const reductionMultiplier = reduction?.multiplier ?? 1;
  const additiveMultiplier = 1 + additivePercent / 100;
  const baseDamage = meleeFinalDamage * (proc.percent / 100);
  const finalDamage = Math.floor(baseDamage * additiveMultiplier * multiplicativeMultiplier * reductionMultiplier);

  return {
    ...proc,
    additiveMultiplier,
    multiplicativeMultiplier,
    baseDamage,
    finalDamage,
    reductionLabel: reduction?.label || null,
  };
}

// Fire Aspect and Thunderlord: X% of melee Final Damage per level. Unlike Venomous there is no
// restricted modifier set, just a cut of the same finalDamage. `proc` is
// sources.fireAspectProc/thunderlordProc, null when that enchant isn't equipped; the two share this
// function and neither has a per-mob immunity.
export function computeEnchantProcDamage(mob, meleeFinalDamage, proc) {
  if (!proc) return null;
  if (isShieldedMob(mob)) return { ...proc, finalDamage: 1 };
  return { ...proc, finalDamage: Math.floor(meleeFinalDamage * (proc.percent / 100)) };
}

// Melee hit rate is not continuous in Bonus Attack Speed: per-hit time changes only at these
// breakpoints and holds steady in between. Exported so lib/tuningOptimizer.js can spend points to
// reach the next breakpoint as one lumpy move, since each point below a threshold shows no gain.
export const MELEE_HIT_RATE_BREAKPOINTS = [
  { threshold: 0, secondsPerHit: 0.5 },
  { threshold: 6, secondsPerHit: 0.45 },
  { threshold: 18, secondsPerHit: 0.4 },
  { threshold: 34, secondsPerHit: 0.35 },
  { threshold: 54, secondsPerHit: 0.3 },
  { threshold: 82, secondsPerHit: 0.25 },
  { threshold: 123, secondsPerHit: 0.2 },
];

// A bow's own breakpoints: the same seven rates at different Bonus Attack Speed, spaced further
// apart, so the same stat fires slower from a bow — 82 is 0.25s melee but still 0.3s drawn. The
// 0.2s row is reachable only with a full Thermodynamic set, which raises the cap below to 150.
const BOW_SHOT_RATE_BREAKPOINTS = [
  { threshold: 0, secondsPerHit: 0.5 },
  { threshold: 12, secondsPerHit: 0.45 },
  { threshold: 25, secondsPerHit: 0.4 },
  { threshold: 43, secondsPerHit: 0.35 },
  { threshold: 67, secondsPerHit: 0.3 },
  { threshold: 100, secondsPerHit: 0.25 },
  { threshold: 150, secondsPerHit: 0.2 },
];

// Bonus Attack Speed caps at 100, except with the full 4-piece Thermodynamic set, which raises it to
// 150. Bows share the cap exactly; only the breakpoints differ.
const ATTACK_SPEED_CAP = 100;
const THERMODYNAMIC_ATTACK_SPEED_CAP = 150;
const THERMODYNAMIC_SET = ['THERMODYNAMIC_HELMET', 'THERMODYNAMIC_CHESTPLATE', 'THERMODYNAMIC_LEGGINGS', 'THERMODYNAMIC_BOOTS'];

function cappedAttackSpeed(bonusAttackSpeed, loadout) {
  const cap = hasFullSet(loadout, ARMOR_SLOTS, THERMODYNAMIC_SET) ? THERMODYNAMIC_ATTACK_SPEED_CAP : ATTACK_SPEED_CAP;
  return Math.min(bonusAttackSpeed || 0, cap);
}

// Both rates are a table lookup rather than a continuous scale: the value is whichever row's
// threshold the capped Attack Speed has passed, so everything between two thresholds fires alike.
function ratePerSecond(breakpoints, clamped) {
  let secondsPerHit = breakpoints[0].secondsPerHit;
  for (const bp of breakpoints) {
    if (clamped >= bp.threshold) secondsPerHit = bp.secondsPerHit;
  }
  return 1 / secondsPerHit;
}

// Melee hits per second at a given Bonus Attack Speed, looked up from the breakpoint table above
// after capping.
export function computeMeleeHitsPerSecond(bonusAttackSpeed, loadout) {
  return ratePerSecond(MELEE_HIT_RATE_BREAKPOINTS, cappedAttackSpeed(bonusAttackSpeed, loadout));
}

// Bow shots/second — same cap, its own table.
export function computeBowShotsPerSecond(bonusAttackSpeed, loadout) {
  return ratePerSecond(BOW_SHOT_RATE_BREAKPOINTS, cappedAttackSpeed(bonusAttackSpeed, loadout));
}

// DPS Mode: turns each per-hit or per-proc damage number into damage per second by multiplying by
// its own rate. Melee's rate is the breakpoint lookup above; the rest are fixed. A proc missing from
// `mobResult` contributes 0.
export const DPS_HITS_PER_SECOND = {
  venomous: 1,
  thunderlord: 0.6,
  fireAspect: 1,
  crimsonSwipe: 1,
};

// Crimson Swipe's opening proc: the fight's first hit always procs Swipe, at double damage. Only
// simulateHitByHit models a first hit; the steady-state DPS above is every hit after it, the same
// way it leaves out First Strike.
export const CRIMSON_SWIPE_FIRST_HIT_MULTIPLIER = 2;

// Duplex (Reiterate), bow only: a guaranteed extra arrow dealing +4% per level of the first arrow's
// damage — 4/8/12/16/20% at levels I-V, so level 5 is a 1.2x DPS multiplier.
const DUPLEX_DAMAGE_PERCENT_PER_LEVEL = 4;
function getDuplexLevel(loadout) {
  const ultimate = loadout.weapon?.modifiers?.ultimateEnchantment;
  return ultimate?.id?.toLowerCase() === 'ultimate_reiterate' ? ultimate.level || 0 : 0;
}

// `sources`/`mob` mirror computeFinalDamage's parameters, as do useDungeonizedStats/useMasterMode.
// Everything DPS mode needs — the steady-state melee hit plus every proc — is derived here rather
// than reused from a caller's melee-mode numbers, which bake in First Strike/Triple Strike's
// opening-hit bonus and must not be multiplied into every hit per second.
export function computeDpsBreakdown(sources, mob, loadout, useDungeonizedStats = false, useMasterMode = false) {
  // Through selectBaseStats rather than sources.baseStats: the raw block is the non-dungeon,
  // pre-set-bonus total, which drops Final Destination's +20 Bonus Attack Speed against Ender mobs
  // and the Catacombs-scaled attack speed under the Dungeon toggle.
  const stats = selectBaseStats(sources, useDungeonizedStats, useMasterMode, mob);
  const bonusAttackSpeed = stats.bonus_attack_speed || 0;
  const meleeHitsPerSecond = computeMeleeHitsPerSecond(bonusAttackSpeed, loadout);
  const steadyFinalDamage = computeFinalDamage(sources, mob, useDungeonizedStats, useMasterMode, true);
  const meleeFinalDamage = steadyFinalDamage.finalDamage;

  // Crit-chance-weighted expected damage per hit: below 100% Crit Chance some hits don't crit
  // (finalDamageNonCrit rather than finalDamage), and with Overload on a bow any Crit Chance past
  // 100 becomes a chance of a guaranteed Mega Crit — OverloadChance = FinalCritChance - 100,
  // evaluated after every modifier including Terminator's divide-by-4 and the Dungeon boosts.
  const critChance = selectBaseStats(sources, useDungeonizedStats, useMasterMode, mob).crit_chance || 0;
  const hasOverload = (sources.overloadBonusPercent || 0) > 0;
  const critHitChance = Math.min(Math.max(critChance, 0), 100) / 100;
  const megaCritChance = hasOverload ? Math.min(Math.max(0, critChance - 100), 100) / 100 : 0;
  const normalCritChance = critHitChance - megaCritChance;
  const nonCritChance = 1 - critHitChance;
  const expectedArrowDamage =
    nonCritChance * steadyFinalDamage.finalDamageNonCrit +
    normalCritChance * meleeFinalDamage +
    megaCritChance * meleeFinalDamage * (1 + (sources.overloadBonusPercent || 0) / 100);

  // Terminator shoots 3 arrows at once, so its volley is 3x the single-arrow expected damage. Duplex
  // boosts only one of those three: arrow*(1+4%*level) + 2*arrow, rather than 3*arrow*(1+4%*level).
  const duplexLevel = getDuplexLevel(loadout);
  const isTerminator = loadout.weapon?.item?.id === 'TERMINATOR';
  // The weapon's category, exposed so DamageSources.jsx can label this DPS source "Arrow" or
  // "Melee". A loadout holds one weapon, so the two labels are mutually exclusive by construction.
  const isBowWeapon = (loadout.weapon?.item?.category || '').toUpperCase().includes('BOW');
  const duplexMultiplier = 1 + (DUPLEX_DAMAGE_PERCENT_PER_LEVEL * duplexLevel) / 100;
  const bowVolleyDamage = isTerminator
    ? duplexLevel > 0
      ? expectedArrowDamage * duplexMultiplier + 2 * expectedArrowDamage
      : expectedArrowDamage * 3
    : expectedArrowDamage * duplexMultiplier;
  // Duplex is a multiplier on the existing volley rather than a separate hit, so decomposing it means
  // comparing against the same volley at duplexLevel 0. Exposed as its own DPS delta so
  // DamageSources.jsx can show the non-Duplex base and the Duplex bonus separately, summing back to
  // the same `melee` total.
  const bowVolleyDamageWithoutDuplex = isTerminator ? expectedArrowDamage * 3 : expectedArrowDamage;
  const duplexBonusDps = duplexLevel > 0 ? (bowVolleyDamage - bowVolleyDamageWithoutDuplex) * meleeHitsPerSecond : 0;

  const melee = bowVolleyDamage * meleeHitsPerSecond;
  // Every proc below scales off a normal hit's damage rather than the bow's 3-arrow/Duplex volley,
  // using the crit-weighted expectedArrowDamage so each DPS number reflects real Crit Chance and
  // Overload.
  const venomousProc = computeVenomousProcDamage(sources, mob, expectedArrowDamage);
  const thunderlordProc = computeEnchantProcDamage(mob, expectedArrowDamage, sources.thunderlordProc);
  const fireAspectProc = computeEnchantProcDamage(mob, expectedArrowDamage, sources.fireAspectProc);
  const crimsonSwipeProc = computeCrimsonSwipeDamage(
    mob,
    expectedArrowDamage,
    computeCrimsonSwipeInfo(loadout, ARMOR_SLOTS),
    steadyFinalDamage.additivePercent,
  );
  const venomous = (venomousProc?.finalDamage || 0) * DPS_HITS_PER_SECOND.venomous;
  const thunderlord = (thunderlordProc?.finalDamage || 0) * DPS_HITS_PER_SECOND.thunderlord;
  const fireAspect = (fireAspectProc?.finalDamage || 0) * DPS_HITS_PER_SECOND.fireAspect;
  const crimsonSwipe = (crimsonSwipeProc?.finalDamage || 0) * DPS_HITS_PER_SECOND.crimsonSwipe;
  // Mage Beam fires alongside every melee hit, at the same rate, since it is the same swing. Not
  // folded into `total`: every other caller means melee-family DPS only, and the Optimizer has its
  // own 'dungeon_mage_beam' mode. DamageSources.jsx's DPS view adds it on top of `total` while Mage
  // Mode is active and says so on screen.
  const beamProc = computeMageStaffBeamDamage(sources, mob, expectedArrowDamage, useDungeonizedStats, useMasterMode);
  const beam = beamProc.finalDamage * meleeHitsPerSecond;

  // The same volley at a bow's own rate (BOW_SHOT_RATE_BREAKPOINTS), carrying no procs:
  // Venomous/Thunderlord/Fire Aspect/Crimson Swipe ride a melee swing or a beam, never an arrow. So
  // unlike `melee` this is the whole Bow DPS rather than one term of a sum. Reported for every
  // loadout; whether a bow is equipped is the caller's question (see `isBowWeapon`).
  const bowShotsPerSecond = computeBowShotsPerSecond(bonusAttackSpeed, loadout);
  const bow = bowVolleyDamage * bowShotsPerSecond;
  return {
    melee,
    bow,
    bowShotsPerSecond,
    venomous,
    thunderlord,
    fireAspect,
    crimsonSwipe,
    beam,
    meleeHitsPerSecond,
    total: melee + venomous + thunderlord + fireAspect + crimsonSwipe,
    venomousProc,
    beamProc,
    // Steady-state per-hit melee damage, excluding First Strike/Triple Strike, so the by-hit graph can
    // compare it against the boosted opening hits and plot the DPS dip.
    meleeFinalDamage,
    // Crit-chance/Overload/Duplex breakdown behind `melee` above — exposed for display/debugging.
    nonCritChance,
    megaCritChance,
    duplexLevel,
    duplexBonusDps,
    isBowWeapon,
  };
}


// Hit-by-hit fight simulation against a specific starting HP (lib/mobHp.js's resolveStartingHp).
// Unlike computeDpsBreakdown's single steady-state number, this tracks the mob's remaining HP per
// hit, so Execute/Prosecute's value changes over the fight rather than being frozen at one HP%.
// `startingHp` null or 0 means no confirmed HP for this mob: HP% is then held at
// `fallbackHpPercent` for every hit, while still modelling the procs and Venomous below. When
// startingHp is real, `sources` must come from a collectDamageSources call made at
// mobHpPercent=100, so the opening-hit entries exist for excludeFirstHitOnly to gate per hit; the
// caller is responsible for that.
//
// Fire Aspect, Thunderlord and Crimson Swipe fire as discrete lump procs (their own finalDamage,
// via computeEnchantProcDamage/computeCrimsonSwipeDamage) rather than blended DPS: no per-hit
// trigger chance is known, so each is spread across the fight by an accumulator that crosses 1
// every meleeHitsPerSecond / rate hits, reproducing the same long-run average as
// DPS_HITS_PER_SECOND. Venomous is the opposite case — a continuous DoT across every active stack —
// so its contribution is amortized instead: per-stack damage x active stacks x its per-second rate,
// divided by hits per second, growing as stacks accumulate.
//
// Stops early once remainingHp reaches 0 rather than running the full hitCount.
export function simulateHitByHit(
  sources,
  mob,
  loadout,
  startingHp,
  fallbackHpPercent,
  useDungeonizedStats = false,
  useMasterMode = false,
  hitCount = MAX_VENOMOUS_STACKS,
) {
  // Same selection as computeDpsBreakdown's — see the comment there.
  const simStats = selectBaseStats(sources, useDungeonizedStats, useMasterMode, mob);
  const bonusAttackSpeed = simStats.bonus_attack_speed || 0;
  const meleeHitsPerSecond = computeMeleeHitsPerSecond(bonusAttackSpeed, loadout);
  const critChance = simStats.crit_chance || 0;
  const hasOverload = (sources.overloadBonusPercent || 0) > 0;
  const critHitChance = Math.min(Math.max(critChance, 0), 100) / 100;
  const megaCritChance = hasOverload ? Math.min(Math.max(0, critChance - 100), 100) / 100 : 0;
  const normalCritChance = critHitChance - megaCritChance;
  const nonCritChance = 1 - critHitChance;

  const duplexLevel = getDuplexLevel(loadout);
  const isTerminator = loadout.weapon?.item?.id === 'TERMINATOR';
  const duplexMultiplier = 1 + (DUPLEX_DAMAGE_PERCENT_PER_LEVEL * duplexLevel) / 100;
  const swipeInfo = computeCrimsonSwipeInfo(loadout, ARMOR_SLOTS);

  const fireAspectRate = sources.fireAspectProc ? DPS_HITS_PER_SECOND.fireAspect / meleeHitsPerSecond : 0;
  const thunderlordRate = sources.thunderlordProc ? DPS_HITS_PER_SECOND.thunderlord / meleeHitsPerSecond : 0;
  const crimsonSwipeRate = swipeInfo ? DPS_HITS_PER_SECOND.crimsonSwipe / meleeHitsPerSecond : 0;
  let fireAspectAcc = 0;
  let thunderlordAcc = 0;
  // The fight's first hit always procs Crimson Swipe, so the accumulator is primed to cross 1 on hit
  // 1; every later Swipe keeps the 1/s cadence counted from that opening proc.
  let crimsonSwipeAcc = swipeInfo ? 1 - crimsonSwipeRate : 0;

  const rate = sources.executeProsecuteRate;
  function buildHitSources(hpPercent) {
    if (!rate) return { hitSources: sources, executeProsecuteValue: 0 };
    const hpBasis = rate.type === 'execute' ? 100 - hpPercent : hpPercent;
    const value = Math.round(rate.ratePerLevel * hpBasis * 100) / 100;
    const additiveNonConditional = sources.additiveNonConditional.filter((e) => e.id !== rate.id);
    if (value > 0) {
      additiveNonConditional.push({ id: rate.id, label: rate.label, source: rate.source, value, abilityEligible: true });
    }
    return { hitSources: { ...sources, additiveNonConditional }, executeProsecuteValue: value };
  }

  const hasRealHp = typeof startingHp === 'number' && startingHp > 0;

  // First Strike and Triple Strike apply only on the opening hit(s), probed once here so the loop
  // below knows how many hits to include them on.
  const openingHpPercent = hasRealHp ? 100 : fallbackHpPercent;
  const { hitSources: openingSources } = buildHitSources(openingHpPercent);
  const openingAppliedIds = [...computeFinalDamage(openingSources, mob, useDungeonizedStats, useMasterMode, false).appliedIds];
  const hasTripleStrike = openingAppliedIds.some((id) => id.toLowerCase().endsWith('-triple_strike'));
  const hasFirstStrike = openingAppliedIds.some((id) => id.toLowerCase().endsWith('-first_strike'));
  const firstHitBoostCount = hasTripleStrike ? 3 : hasFirstStrike ? 1 : 0;

  let remainingHp = hasRealHp ? startingHp : null;
  const hits = [];
  // The simulation runs only as far as the window it records: no hits-to-kill search, since nothing
  // here models phases, invulnerability windows or adds.
  const simCap = hitCount;
  for (let hit = 1; hit <= simCap; hit++) {
    const hpPercent = hasRealHp ? Math.max(0, Math.min(100, (remainingHp / startingHp) * 100)) : fallbackHpPercent;
    const { hitSources, executeProsecuteValue } = buildHitSources(hpPercent);
    const excludeFirstHitOnly = hit > firstHitBoostCount;

    const steady = computeFinalDamage(hitSources, mob, useDungeonizedStats, useMasterMode, excludeFirstHitOnly);
    const expectedArrowDamage =
      nonCritChance * steady.finalDamageNonCrit +
      normalCritChance * steady.finalDamage +
      megaCritChance * steady.finalDamage * (1 + (sources.overloadBonusPercent || 0) / 100);
    const meleeDamage = isTerminator
      ? duplexLevel > 0
        ? expectedArrowDamage * duplexMultiplier + 2 * expectedArrowDamage
        : expectedArrowDamage * 3
      : expectedArrowDamage * duplexMultiplier;

    let fireAspectDamage = 0;
    if (sources.fireAspectProc) {
      fireAspectAcc += fireAspectRate;
      if (fireAspectAcc >= 1) {
        fireAspectAcc -= 1;
        fireAspectDamage = computeEnchantProcDamage(mob, expectedArrowDamage, sources.fireAspectProc)?.finalDamage || 0;
      }
    }
    let thunderlordDamage = 0;
    if (sources.thunderlordProc) {
      thunderlordAcc += thunderlordRate;
      if (thunderlordAcc >= 1) {
        thunderlordAcc -= 1;
        thunderlordDamage = computeEnchantProcDamage(mob, expectedArrowDamage, sources.thunderlordProc)?.finalDamage || 0;
      }
    }
    let crimsonSwipeDamage = 0;
    if (swipeInfo) {
      crimsonSwipeAcc += crimsonSwipeRate;
      if (crimsonSwipeAcc >= 1) {
        crimsonSwipeAcc -= 1;
        crimsonSwipeDamage = computeCrimsonSwipeDamage(mob, expectedArrowDamage, swipeInfo, steady.additivePercent)?.finalDamage || 0;
        // ...and that opening Swipe deals double damage, on the first hit only.
        if (hit === 1) crimsonSwipeDamage *= CRIMSON_SWIPE_FIRST_HIT_MULTIPLIER;
      }
    }

    let venomousDamage = 0;
    if (sources.venomousProc) {
      // Stacks cap at MAX_VENOMOUS_STACKS, which is also this window's length, so the cap binds only
      // on the final hit.
      const activeStacks = Math.min(hit, MAX_VENOMOUS_STACKS);
      const perStack = computeVenomousProcDamage(hitSources, mob, expectedArrowDamage)?.finalDamage || 0;
      venomousDamage = (perStack * activeStacks * DPS_HITS_PER_SECOND.venomous) / meleeHitsPerSecond;
    }

    const totalDamage = meleeDamage + fireAspectDamage + thunderlordDamage + crimsonSwipeDamage + venomousDamage;
    // totalDamage is damage dealt during one hit-interval, with procs amortized to their share of it,
    // so multiplying back by meleeHitsPerSecond gives the instantaneous DPS this hit represents —
    // which varies hit to hit as Venomous stacks build and Execute/Prosecute ramps with draining HP%.
    const dps = totalDamage * meleeHitsPerSecond;

    if (hit <= hitCount) {
      hits.push({
        // Recorded 0-based for display. Each row is "this hit is about to land": hpPercent is the
        // mob's HP BEFORE it, so numbering from 1 would draw the fight at 100% HP on x=1 and land the
        // opening hit's damage at x=2. At 0, x=0 is the full-HP opening hit and the HP line drops at
        // x=1. The loop itself stays 1-based, since First Strike's window and Crimson Swipe's doubled
        // first proc both key off `hit`.
        hit: hit - 1,
        hpPercent,
        meleeDamage,
        executeProsecuteValue,
        fireAspectDamage,
        thunderlordDamage,
        crimsonSwipeDamage,
        venomousDamage,
        totalDamage,
        dps,
      });
    }

    // Stops on death, so a mob that dies inside the window isn't padded with hits that never happen;
    // the average below is then over the shorter fight.
    if (hasRealHp) {
      remainingHp = Math.max(0, remainingHp - totalDamage);
      if (remainingHp <= 0) break;
    }
  }

  // Max and min across the same window the graph plots and the average covers.
  const maxDps = hits.length > 0 ? Math.max(...hits.map((h) => h.dps)) : null;
  const minDps = hits.length > 0 ? Math.min(...hits.map((h) => h.dps)) : null;

  // How long the recorded hits span: the denominator for a fight-average DPS, exposed so callers
  // don't re-derive it against a whole-fight duration instead.
  const elapsedSeconds = hits.length / meleeHitsPerSecond;
  return { hits, hasRealHp, meleeHitsPerSecond, elapsedSeconds, maxDps, minDps };
}

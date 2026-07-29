// Final Damage against a specific target mob.
//
//   InitialDamage = (5 + WeaponDMG) * (1 + Strength/100)
//   FinalDamage   = floor((InitialDamage * AdditiveMultiplier * WeaponBonusMultiplier * MultiplicativeMultiplier + BonusModifiers) * (1 + CritDamage/100))
//
// AdditiveMultiplier = 1 + (every applicable % bonus, summed) — enchants and ability-text
// bonuses, all just added together. Maps onto damageSources.js's additiveNonConditional +
// matching additiveConditional entries. Does NOT include the equipped weapon's own "+X%
// damage" ability — see WeaponBonusMultiplier below.
//
// WeaponBonusMultiplier = 1 + (the equipped weapon's own "+X% damage" ability bonuses,
// summed) — its own independent factor, e.g. Atomsplit Katana's "+300% damage to Endermen" is
// a weaponBonus of 300, a (1+3) = 4x factor. Maps onto weaponBonusNonConditional + matching weaponBonusConditional entries.
//
// MultiplicativeMultiplier = product of every other "x" bonus (Crown of Avarice, Skyblock
// Level, armor-set bonuses) — genuinely multiplies rather than adds. Maps onto the multiplicative bucket.
//
// BonusModifiers is a flat amount added after the additive/multiplicative stage but still
// scaled by Crit Damage (Soul Eater, End Stone Bow, etc.) — none of these are modeled yet, so always 0.
//
// Unlimited Power/Unlimited Energy apply after everything else as true multipliers on the
// fully-summed Strength/Crit Damage — baked directly into baseStats by damageSources.js's
// collectAttributeEntries, so this formula just reads baseStats as-is.
//
// Formula source: https://hypixel-skyblock.fandom.com/wiki/Damage_Calculation

import { MOB_TYPE_SYMBOLS } from './damageSymbols';
import { resolveMobKey, SEA_CREATURE_MOBS } from './mobTypes';

const KNOWN_TYPE_NAMES = new Set(Object.keys(MOB_TYPE_SYMBOLS).map((t) => t.toLowerCase()));
const SEA_CREATURE_KEYS = new Set(SEA_CREATURE_MOBS.map((name) => resolveMobKey(name)).filter(Boolean));

// A `condition` string is comma-separated ("Undead, Skeletal, Wither"); each token is either
// a canonical Mob Type name (matched against the target's own types), the collective "Sea
// Creatures" grouping (Flaming Flay/Soul Whip), or a literal mob name from an item ability's own
// text (e.g. "Blazes").
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
      if (lower === 'sea creatures' || lower === 'sea creature') {
        return mobKey != null && SEA_CREATURE_KEYS.has(mobKey);
      }
      return mobKey != null && resolveMobKey(token) === mobKey;
    });
}

// `sources` is damageSources.js's collectDamageSources() result; `mob` is {name, types}.
// Situational entries (formula-based, no live target HP state) are never included.
// `useDungeonizedStats` swaps in each dungeonized gear item's own Catacombs-scaled stat total
// (sources.dungeonizedBaseStats) in place of its normal one; `useMasterMode` (only meaningful
// alongside useDungeonizedStats) additionally folds in each item's Master Star delta — see lib/dungeonize.js.
export function computeFinalDamage(sources, mob, useDungeonizedStats = false, useMasterMode = false) {
  const {
    baseStats: normalBaseStats,
    dungeonizedBaseStats,
    masterDungeonizedBaseStats,
    additiveNonConditional,
    additiveConditional,
    weaponBonusNonConditional,
    weaponBonusConditional,
    multiplicative,
  } = sources;
  const baseStats = !useDungeonizedStats
    ? normalBaseStats
    : useMasterMode
      ? masterDungeonizedBaseStats
      : dungeonizedBaseStats;
  const appliedIds = new Set();

  let additivePercent = 0;
  for (const e of additiveNonConditional) {
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
  const finalDamage = Math.floor(
    (initialDamage * additiveMultiplier * weaponBonusMultiplier * multiplicativeMultiplier + bonusModifiers) *
      (1 + baseStats.crit_damage / 100),
  );

  return {
    initialDamage,
    additiveMultiplier,
    additivePercent,
    weaponBonusMultiplier,
    weaponBonusPercent,
    multiplicativeMultiplier,
    bonusModifiers,
    finalDamage,
    appliedIds,
  };
}

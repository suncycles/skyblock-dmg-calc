// Player-applied debuffs on the TARGET — the mirror of lib/dungeonBlessing.js, which buffs the
// player. All four are Catacombs mechanics, so the panel they live on is Dungeon-gated the same
// way the Blessings panel is.
//
// They split into two kinds, and the difference is the whole reason this file exists:
//
// - Ice Spray and Twilight Arrow Poison are flat external multipliers on final damage, applied at
//   the very last step (lib/finalDamage.js) and multiplicative with each other — both on is
//   1.1 * 1.1 = 1.21, not 1.2.
// - Last Breath and Lethality reduce the mob's Defense STAT, not the damage: lib/mobDefenses.js
//   turns Defense into a multiplier as `1 - Def/(100+Def)`, so a Defense cut feeds that formula
//   rather than multiplying the result. That distinction matters — halving Defense is not "+100%
//   damage", and on Master Necron (2100) it is worth considerably more than halving would suggest.
//
// IMPORTANT: only 7 mobs in the whole app have a nonzero Defense (see mobDefenses.js's
// MOB_DEFENSE_TABLE — Necron, Goldor, Storm, Maxor, Angry Archaeologist, Lost Adventurer, Wither
// Dragon). Against every other target both Defense debuffs are a real, correct no-op, because
// there is no published Defense number to cut. The two flat multipliers are the only ones that do
// anything against an ordinary mob.

export const ICE_SPRAY_MULTIPLIER = 1.1;
// Modelled as a general final-damage multiplier, like Ice Spray — NOT scoped to bow damage
// despite the name. Scope it to the bow metric in lib/finalDamage.js if the real item only buffs
// arrows.
export const TWILIGHT_ARROW_POISON_MULTIPLIER = 1.1;

export const LAST_BREATH_MAX_LEVEL = 5;
export const LAST_BREATH_PERCENT_PER_LEVEL = 10;

export const LETHALITY_MAX_STACKS = 4;
export const LETHALITY_PERCENT_PER_STACK = 9;

export function emptyDebuffs() {
  return { iceSpray: false, twilightPoison: false, lastBreath: 0, lethality: 0 };
}

function clampLevel(value, max) {
  return Math.max(0, Math.min(max, Math.floor(Number(value) || 0)));
}

export function lastBreathLevel(debuffs) {
  return clampLevel(debuffs?.lastBreath, LAST_BREATH_MAX_LEVEL);
}

export function lethalityStacks(debuffs) {
  return clampLevel(debuffs?.lethality, LETHALITY_MAX_STACKS);
}

// What the mob's Defense stat is multiplied BY. Last Breath and Lethality are multiplicative with
// each other, not additive: at Last Breath 5 + Lethality 4 that's
// 0.5 * 0.64 = 0.32, i.e. 68% off — NOT the 86% an additive reading would give.
export function mobDefenseDebuffMultiplier(debuffs) {
  const lastBreath = lastBreathLevel(debuffs) * LAST_BREATH_PERCENT_PER_LEVEL;
  const lethality = lethalityStacks(debuffs) * LETHALITY_PERCENT_PER_STACK;
  return (1 - lastBreath / 100) * (1 - lethality / 100);
}

// Every flat external multiplier on final damage, combined. Applied at the same last step as the
// mob's own Defense/Damage Reduction multipliers — see lib/finalDamage.js. Multiplicative with
// each other, so both on is 1.21.
export function finalDamageDebuffMultiplier(debuffs) {
  return (debuffs?.iceSpray ? ICE_SPRAY_MULTIPLIER : 1) * (debuffs?.twilightPoison ? TWILIGHT_ARROW_POISON_MULTIPLIER : 1);
}

// True when anything here is actually doing something — used by the UI to label the panel.
export function hasAnyDebuff(debuffs) {
  return !!debuffs?.iceSpray || !!debuffs?.twilightPoison || lastBreathLevel(debuffs) > 0 || lethalityStacks(debuffs) > 0;
}

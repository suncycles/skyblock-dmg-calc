// Mob-side damage reduction - three fields every mob has:
//
// - Damage Reduction: a direct final multiplier on ANY dealt damage (melee, ability, beam, procs).
//   Each mob's own fixed value (computeMobInnateDamageReduction) plus Mythological immunity.
// - Magic Resistance: a direct final multiplier on Ability damage only.
// - Defense: the real Hypixel mob Defense stat, its own final multiplier on damage dealt,
//   independent of the two above and not merged into either - mult = 1 - Defense/(100+Defense),
//   so Defense=0 is exactly 1, i.e. a no-op.
//
// Only six Catacombs mobs have a published Defense number: Necron 2,100 / Goldor 1,800 / Storm
// 1,200 / Maxor 1,000, all four Master-Mode-only (0 in Normal Mode); Angry Archaeologist 900
// Normal / 1,200 Master; and Lost Adventurer 100 in both modes. Every other mob, in or out of The
// Catacombs, stays a real 0. Wither Dragon is the Master-Mode-only Floor VII chase boss, so its
// Normal Mode value is unreachable in practice.

import { getMobLocations } from './mobLocations';

const MOB_DEFENSE_TABLE = {
  Necron: { normal: 0, master: 2100 },
  Goldor: { normal: 0, master: 1800 },
  Storm: { normal: 0, master: 1200 },
  Maxor: { normal: 0, master: 1000 },
  'Angry Archaeologist': { normal: 900, master: 1200 },
  'Lost Adventurer': { normal: 100, master: 100 },
  'Wither Dragon': { normal: 0, master: 3700 },
};

export function isMythologicalMob(mob) {
  return !!mob?.types?.includes('Mythological');
}

function isInCatacombs(mob) {
  return !!mob?.name && getMobLocations(mob.name).includes('The Catacombs');
}

// A mob's own fixed damage reduction, on every hit: a stat of the mob, which nothing the player
// does changes. Every Catacombs mob takes 10% less; these bosses take a further 90% less on top,
// multiplicatively, so 0.9 * 0.1 = 0.09x (91%). Phase 2 entries are the same fight.
const CATACOMBS_DAMAGE_REDUCTION = 10;
const CATACOMBS_BOSS_DAMAGE_REDUCTION = 90;
const CATACOMBS_BOSSES = new Set([
  'Necron',
  'Storm',
  'Goldor',
  'Maxor',
  'Wither Dragon',
  'Livid',
  'Sadan',
  'Bonzo',
  'Bonzo (Phase 2)',
  'The Professor',
  'The Professor (Phase 2)',
  'Spirit Bear',
]);

// Percent of damage still taken, kept in whole percents so 91 comes out exact rather than 90.99...
export function computeMobInnateDamageReduction(mob) {
  let takenPercent = 100;
  if (isInCatacombs(mob)) takenPercent = (takenPercent * (100 - CATACOMBS_DAMAGE_REDUCTION)) / 100;
  if (CATACOMBS_BOSSES.has(mob?.name)) takenPercent = (takenPercent * (100 - CATACOMBS_BOSS_DAMAGE_REDUCTION)) / 100;
  return 100 - takenPercent;
}

// Mythological mobs are immune to all damage (100% reduction) unless the
// equipped pet is a Griffin - the real reason Griffin is the one BiS Diana pet (see
// DIANA_PET_PROGRESSION in optimizer.js), not just Sacred Strength's Strength bonus.
export function computeMobDamageReduction(mob, isGriffinPet) {
  if (isMythologicalMob(mob) && !isGriffinPet) return 100;
  return computeMobInnateDamageReduction(mob);
}

// Mythological mobs 50%.
export function computeMobMagicResistance(mob) {
  return isMythologicalMob(mob) ? 50 : 0;
}

export function computeMobDefense(mob, masterMode) {
  const entry = mob?.name && MOB_DEFENSE_TABLE[mob.name];
  if (!entry) return 0;
  return masterMode ? entry.master : entry.normal;
}

// mult = 1 - Defense/(100+Defense) - 1 (no-op) at the real Defense=0 default every other mob has.
//
// `defenseMultiplier` is the player's own Defense-shredding debuffs (lib/mobDebuffs.js's Last
// Breath and Lethality) and scales the Defense STAT before this formula, not the result: the
// curve is what turns a Defense cut into damage, so the two are not interchangeable. At Defense=0
// it stays an exact no-op however low the debuffs push it.
export function computeMobDefenseMultiplier(mob, masterMode, defenseMultiplier = 1) {
  const defense = computeMobDefense(mob, masterMode) * defenseMultiplier;
  return 1 - defense / (100 + defense);
}

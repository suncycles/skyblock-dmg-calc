// Mob-side damage reduction - three fields every mob has:
//
// - Damage Reduction: a direct final multiplier on ANY dealt damage (melee, ability, beam, procs).
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

// Mythological mobs are immune to all damage (100% reduction) unless the
// equipped pet is a Griffin - the real reason Griffin is the one BiS Diana pet (see
// DIANA_PET_PROGRESSION in optimizer.js), not just Sacred Strength's Strength bonus.
export function computeMobDamageReduction(mob, isGriffinPet) {
  if (isMythologicalMob(mob) && !isGriffinPet) return 100;
  return 0;
}

// Mythological mobs 50%, any Catacombs-located mob a further/separate 10%
// (additive - no real mob is currently both Mythological-typed and Catacombs-located, so a real
// stacking order between the two has never come up).
export function computeMobMagicResistance(mob) {
  let percent = 0;
  if (isMythologicalMob(mob)) percent += 50;
  if (isInCatacombs(mob)) percent += 10;
  return percent;
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

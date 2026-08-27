// Mob-side damage reduction — three fields every mob conceptually has, all currently derived from
// real confirmed rules rather than stored per-mob (no per-mob table exists yet beyond the specific
// cases below; everything else genuinely defaults to 0 per CLAUDE.md's "don't guess game-mechanic
// numbers" — these are the only rules confirmed so far, 2026-08-27):
//
// - Damage Reduction: a direct final multiplier on ANY dealt damage (melee, ability, beam, procs).
// - Magic Resistance: a direct final multiplier on Ability damage only.
// - Defense: meant to be a separately-calculated reduction modifier to both fields above (the
//   real Hypixel mob Defense stat) — no real per-mob values or the Defense->DR/MR formula are
//   confirmed yet, so computeMobDefense stays a real 0 rather than a guessed number or formula.

import { getMobLocations } from './mobLocations';

export function isMythologicalMob(mob) {
  return !!mob?.types?.includes('Mythological');
}

function isInCatacombs(mob) {
  return !!mob?.name && getMobLocations(mob.name).includes('The Catacombs');
}

// User-confirmed: Mythological mobs are immune to all damage (100% reduction) unless the
// equipped pet is a Griffin — the real reason Griffin is the one BiS Diana pet (see
// DIANA_PET_PROGRESSION in optimizer.js), not just Sacred Strength's Strength bonus.
export function computeMobDamageReduction(mob, isGriffinPet) {
  if (isMythologicalMob(mob) && !isGriffinPet) return 100;
  return 0;
}

// User-confirmed: Mythological mobs 50%, any Catacombs-located mob a further/separate 10%
// (additive — no real mob is currently both Mythological-typed and Catacombs-located, so a real
// stacking order between the two has never come up).
export function computeMobMagicResistance(mob) {
  let percent = 0;
  if (isMythologicalMob(mob)) percent += 50;
  if (isInCatacombs(mob)) percent += 10;
  return percent;
}

export function computeMobDefense() {
  return 0;
}

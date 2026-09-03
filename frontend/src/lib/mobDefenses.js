// Mob-side damage reduction — three fields every mob conceptually has, all currently derived from
// real confirmed rules rather than stored per-mob (no per-mob table exists yet beyond the specific
// cases below; everything else genuinely defaults to 0 per CLAUDE.md's "don't guess game-mechanic
// numbers" — these are the only rules confirmed so far, 2026-08-27):
//
// - Damage Reduction: a direct final multiplier on ANY dealt damage (melee, ability, beam, procs).
// - Magic Resistance: a direct final multiplier on Ability damage only.
// - Defense: the real Hypixel mob Defense stat. User-supplied 2026-09-03 (hypixelskyblock wiki's
//   InfoboxMobStats, cross-checked against every Catacombs mob's full wikitext — only these 6 of
//   51 have a published number at all): Necron 2,100 / Goldor 1,800 / Storm 1,200 / Maxor 1,000 —
//   all four Master-Mode-only (0 in Normal Mode, user-confirmed), and Angry Archaeologist 900
//   Normal / 1,200 Master (user-confirmed both modes). Lost Adventurer's wiki entry (100) carries
//   no Normal/Master split at all, unlike the other four — treated as unconditional (both modes)
//   on that basis, NOT user-confirmed; flag if wrong.
//   No real per-mob values exist for the other 45 Catacombs mobs, or for anything outside The
//   Catacombs — MOB_DEFENSE_TABLE lookups for those stay a real 0.
//   User-confirmed 2026-09-03: Defense is its own final multiplier on damage dealt (independent
//   of Damage Reduction/Magic Resistance above, not merged into either) — mult = 1 -
//   Defense/(100+Defense). At Defense=0 (almost every mob) this is exactly 1, i.e. a no-op.
//   Wither Dragon (user-renamed from the wiki's real name "Apex Dragon" 2026-09-03) is the secret
//   post-Necron chase boss on Master Mode Floor VII — no Normal Mode variant exists at all, so
//   normal stays 0 (unreachable in practice, same as every other unlisted mob).

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

export function computeMobDefense(mob, masterMode) {
  const entry = mob?.name && MOB_DEFENSE_TABLE[mob.name];
  if (!entry) return 0;
  return masterMode ? entry.master : entry.normal;
}

// mult = 1 - Defense/(100+Defense) — 1 (no-op) at the real Defense=0 default every other mob has.
export function computeMobDefenseMultiplier(mob, masterMode) {
  const defense = computeMobDefense(mob, masterMode);
  return 1 - defense / (100 + defense);
}

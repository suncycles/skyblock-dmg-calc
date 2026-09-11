// "Mining Islands" — the zone group two separate combat boosts are gated on. Hypixel's own lore
// uses this exact phrase for both (Lonesome Miner: "while on §bMining Islands§7"; Mithril Golem's
// Subterranean Battler: "on §bMining Islands§7"), so it's the game's grouping, not this app's.
//
// Both boosts raise the same two stats here — Strength and Crit Damage (user-scoped 2026-09-11).
// The real perks are broader: Lonesome Miner's lore also lists Crit Chance, Defense and Health,
// and Subterranean Battler says "all Combat Stats". Only the two that this calculator's damage
// number actually turns on are modelled; widening either is a one-line change to its `stats`.

import { MOB_LOCATIONS } from './mobLocations';

// The three locations the group covers, spelled exactly as lib/mobLocations.js spells them.
export const MINING_ISLAND_LOCATIONS = ['Dwarven Mines', 'Crystal Hollows', 'Deep Caverns'];
export const MINING_ISLANDS_LABEL = 'Mining Islands';

// Which stats both boosts raise — the same list for each, so they read as one group in the
// breakdown even though they come from different sources.
export const MINING_ISLAND_BOOST_STATS = ['strength', 'crit_damage'];

const MINING_ISLAND_SET = new Set(MINING_ISLAND_LOCATIONS);

// True when a mob (by name) lives on any of the three. A mob with no location entry at all is
// not on a Mining Island — same "absent means no" treatment MOB_TYPES lookups already get.
export function isMiningIslandMob(name) {
  return (MOB_LOCATIONS[name] || []).some((loc) => MINING_ISLAND_SET.has(loc));
}

// True when ANY selected target is on a Mining Island, matching how every other target-derived
// flag in this app treats a multi-mob selection (see DamageSources.jsx's isCrimsonIsleTarget).
export function anyMiningIslandTarget(names) {
  return (names || []).some(isMiningIslandMob);
}

// Heart of the Mountain's Lonesome Miner perk. NEU-REPO's hotmlayout.json gives the real formula
// outright — `"stat": "(+ (* level 0.5) 4.5)"`, maxLevel 45 — so level 1 is +5% and level 45 is
// +27% (user-confirmed 2026-09-11, against a quoted +27.5% that the +0.5%/tier step can't reach).
// Level 0 means the perk is unbought and grants nothing, NOT the formula's 4.5% intercept.
export const LONESOME_MINER_MAX_LEVEL = 45;
export const LONESOME_MINER_PERCENT_PER_LEVEL = 0.5;
export const LONESOME_MINER_BASE_PERCENT = 4.5;

export function lonesomeMinerPercent(level) {
  const n = Math.max(0, Math.min(LONESOME_MINER_MAX_LEVEL, Math.floor(Number(level) || 0)));
  if (n <= 0) return 0;
  return n * LONESOME_MINER_PERCENT_PER_LEVEL + LONESOME_MINER_BASE_PERCENT;
}

// Mithril Golem's "Subterranean Battler". 0.2%/level — +20% at level 100 — from NEU-REPO's
// petnums.json (LEGENDARY otherNums[1]: 0.2 at level 1, 20 at level 100), user-confirmed
// 2026-09-11 over a quoted 2%/level, which is otherNums[0], Mithril Affinity's Mining Speed.
// ponytail: tier-agnostic, matching how BLAZE_CRIMSON_ISLE_PERCENT already treats its pet. The
// real ladder has no ability below RARE and gives RARE half this rate (0.1%/level); add a
// per-tier lookup here if a Rare Mithril Golem ever needs to be accurate.
export const MITHRIL_GOLEM_PET_ID = 'MITHRIL_GOLEM';
export const MITHRIL_GOLEM_PERCENT_PER_LEVEL = 0.2;

export function mithrilGolemPercent(petLevel) {
  return Math.max(0, Number(petLevel) || 0) * MITHRIL_GOLEM_PERCENT_PER_LEVEL;
}

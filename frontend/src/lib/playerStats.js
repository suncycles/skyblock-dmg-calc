// Global player-level stats (not tied to any equipped item/pet) that
// still grant a damage bonus — Combat Level, Skyblock Level, etc. Small,
// standalone formulas like lib/starring.js's, kept in one file since
// they all feed the same "player stats" input row on Landing.jsx.

import { MC_COLORS } from './mcText';

export const MAX_COMBAT_LEVEL = 60;

// Real Hypixel Combat Level damage bonus: +4% additive per level for
// levels 0-50 (0-200% at level 50), then a slower +1% per level for
// 51-60 (200-210% at level 60) — not a single continuous rate.
export function computeCombatLevelBonus(level) {
  const clamped = Math.max(0, Math.min(MAX_COMBAT_LEVEL, level || 0));
  if (clamped <= 50) return clamped * 4;
  return 50 * 4 + (clamped - 50) * 1;
}

// Real Hypixel Skyblock Level damage bonus: linear multiplicative, +0.01%
// per level — 4.93% (1.0493x) at the wiki-documented reference point of
// level 493.
const SKYBLOCK_LEVEL_PERCENT_PER_LEVEL = 4.93 / 493;

export function computeSkyblockLevelMultiplier(level) {
  const clamped = Math.max(0, level || 0);
  return 1 + (clamped * SKYBLOCK_LEVEL_PERCENT_PER_LEVEL) / 100;
}

// Every 5 Skyblock Levels grants +1 Strength, separate from the damage
// multiplier above.
export function computeSkyblockLevelStrengthBonus(level) {
  const clamped = Math.max(0, level || 0);
  return Math.floor(clamped / 5);
}

// Real Hypixel Skyblock Level display color, dyed every 40 levels (the
// same colored-wool progression shown in-game/on the wiki) — level 1-40
// is white, 41-80 yellow, ... 441+ stays dark red (no bracket past 480 is
// documented, so it's treated as the ceiling color rather than cycling).
const SKYBLOCK_LEVEL_COLOR_BRACKETS = [
  { max: 40, code: 'f' }, // White
  { max: 80, code: 'e' }, // Yellow
  { max: 120, code: 'a' }, // Green
  { max: 160, code: '2' }, // Dark Green
  { max: 200, code: 'b' }, // Aqua
  { max: 240, code: '3' }, // Cyan
  { max: 280, code: '9' }, // Blue
  { max: 320, code: 'd' }, // Pink
  { max: 360, code: '5' }, // Purple
  { max: 400, code: '6' }, // Gold
  { max: 440, code: 'c' }, // Red
  { max: 480, code: '4' }, // Dark Red
];

export function getSkyblockLevelColor(level) {
  const clamped = Math.max(0, level || 0);
  const bracket = SKYBLOCK_LEVEL_COLOR_BRACKETS.find((b) => clamped <= b.max);
  const code = bracket ? bracket.code : SKYBLOCK_LEVEL_COLOR_BRACKETS[SKYBLOCK_LEVEL_COLOR_BRACKETS.length - 1].code;
  return MC_COLORS[code];
}

export const MAX_FORAGING_LEVEL = 54;

// Real Hypixel Foraging skill Strength reward: +1 Strength per level for
// levels 1-14, then +2 Strength per level for levels 15-54.
export function computeForagingStrengthBonus(level) {
  const clamped = Math.max(0, Math.min(MAX_FORAGING_LEVEL, level || 0));
  return Math.min(clamped, 14) * 1 + Math.max(0, clamped - 14) * 2;
}

export const MAX_CATACOMBS_LEVEL = 50;

// The Ancient reforge (Precursor Gear stone, armor-only) grants +1 Crit
// Damage per Catacombs level, flat, the same at every item rarity — its
// real NEU-REPO reforgeAbility text reads "Grants +1 Crit Damage per
// Catacombs level." Its reforgeStats table (worker/src/data-equivalent,
// fetched live from constants/reforgestones.json) does carry a static
// crit_damage number for COMMON specifically, but that's a stale
// snapshot artifact, not the real per-level mechanic — see
// lib/reforges.js, which overrides it with this instead of reading it.
export function computeAncientReforgeCritDamage(catacombsLevel) {
  return Math.max(0, Math.min(MAX_CATACOMBS_LEVEL, catacombsLevel || 0));
}

// Catacombs Level's overall stat-multiplier scaling (every stat boosted
// by a flat % based on level, separate from the Ancient reforge above) —
// NOT implemented anywhere in this app yet, deliberately: recorded here
// only as reference for whenever that gets built, exactly as given
// (levels 1-30 explicit, un-smoothed — note level 3's value breaks the
// otherwise-steady climb, which is how it was provided, not a transcription
// error corrected here):
//   1:10  2:15  3:29  4:25  5:31  6:38  7:46  8:55  9:65  10:75
//   11:85  12:95  13:105  14:115  15:125  16:135  17:145  18:155  19:165  20:175
//   21:185  22:195  23:205  24:215  25:225  26:235  27:245  28:255  29:265  30:275
//   31-50: +10% per level, up to 485% total at level 50

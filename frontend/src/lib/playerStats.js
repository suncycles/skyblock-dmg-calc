// Global player-level stats (not tied to any equipped item/pet) that still grant a damage
// bonus — Combat Level, Skyblock Level, etc. Feed the "player stats" input row on Landing.jsx.

import { MC_COLORS } from './mcText';

// Base Crit Chance/Crit Damage every Skyblock player starts with before any gear.
export const BASE_CRIT_CHANCE = 30;
export const BASE_CRIT_DAMAGE = 50;

export const MAX_COMBAT_LEVEL = 60;

// Combat Level damage bonus: +4%/level for 0-50, then +1%/level for 51-60.
export function computeCombatLevelBonus(level) {
  const clamped = Math.max(0, Math.min(MAX_COMBAT_LEVEL, level || 0));
  if (clamped <= 50) return clamped * 4;
  return 50 * 4 + (clamped - 50) * 1;
}

// Skyblock Level damage bonus: linear multiplicative, +0.01%/level.
const SKYBLOCK_LEVEL_PERCENT_PER_LEVEL = 4.93 / 493;

export function computeSkyblockLevelMultiplier(level) {
  const clamped = Math.max(0, level || 0);
  return 1 + (clamped * SKYBLOCK_LEVEL_PERCENT_PER_LEVEL) / 100;
}

// Every 5 Skyblock Levels grants +1 Strength.
export function computeSkyblockLevelStrengthBonus(level) {
  const clamped = Math.max(0, level || 0);
  return Math.floor(clamped / 5);
}

// Skyblock Level display color, dyed every 40 levels.
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

// Foraging skill Strength reward: +1/level for 1-14, +2/level for 15-54.
export function computeForagingStrengthBonus(level) {
  const clamped = Math.max(0, Math.min(MAX_FORAGING_LEVEL, level || 0));
  return Math.min(clamped, 14) * 1 + Math.max(0, clamped - 14) * 2;
}

export const MAX_CATACOMBS_LEVEL = 50;

// The Ancient reforge (armor-only): +1 Crit Damage per Catacombs level, flat at every rarity.
export function computeAncientReforgeCritDamage(catacombsLevel) {
  return Math.max(0, Math.min(MAX_CATACOMBS_LEVEL, catacombsLevel || 0));
}

export const MAX_TAMING_LEVEL = 60;

export const MAX_WOLF_SLAYER_LEVEL = 9;

// Catacombs Level's overall stat-multiplier scaling — not implemented yet, kept as reference:
//   1:10  2:15  3:29  4:25  5:31  6:38  7:46  8:55  9:65  10:75
//   11:85  12:95  13:105  14:115  15:125  16:135  17:145  18:155  19:165  20:175
//   21:185  22:195  23:205  24:215  25:225  26:235  27:245  28:255  29:265  30:275
//   31-50: +10% per level, up to 485% total at level 50

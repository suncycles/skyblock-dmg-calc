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

// Skyblock Level damage bonus: linear multiplicative, +0.01%/level, capped at 1.05x (level 500).
const SKYBLOCK_LEVEL_PERCENT_PER_LEVEL = 4.93 / 493;
const MAX_SKYBLOCK_LEVEL_FOR_DAMAGE = 500;

export function computeSkyblockLevelMultiplier(level) {
  const clamped = Math.max(0, Math.min(MAX_SKYBLOCK_LEVEL_FOR_DAMAGE, level || 0));
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

// The Withered reforge (Wither Blood stone, sword/fishing rod): "Withered Bonus — Grants +1
// Strength per Catacombs level" (verified against NEU-REPO's WITHER_BLOOD.json + the SkyBlock
// Wiki). Unlike Ancient, this stacks ON TOP of Withered's own flat per-rarity Strength rather
// than replacing it — that flat table is correct/current, not stale.
export function computeWitheredReforgeStrength(catacombsLevel) {
  return Math.max(0, Math.min(MAX_CATACOMBS_LEVEL, catacombsLevel || 0));
}

export const MAX_TAMING_LEVEL = 60;

export const MAX_WOLF_SLAYER_LEVEL = 9;

export const MAX_ALCHEMY_LEVEL = 50;
export const MAX_ENCHANTING_LEVEL = 60;

// Alchemy Level Intelligence reward: +1/level for 1-14, +2/level for 15-50.
export function computeAlchemyIntelligenceBonus(level) {
  const clamped = Math.max(0, Math.min(MAX_ALCHEMY_LEVEL, level || 0));
  return Math.min(clamped, 14) * 1 + Math.max(0, clamped - 14) * 2;
}

// Enchanting Level Intelligence reward: +1/level for 1-14, +2/level for 15-60.
export function computeEnchantingIntelligenceBonus(level) {
  const clamped = Math.max(0, Math.min(MAX_ENCHANTING_LEVEL, level || 0));
  return Math.min(clamped, 14) * 1 + Math.max(0, clamped - 14) * 2;
}

// Enchanting Level Ability Damage reward: flat +0.5%/level.
export const ENCHANTING_ABILITY_DAMAGE_PERCENT_PER_LEVEL = 0.5;
export function computeEnchantingAbilityDamageBonus(level) {
  const clamped = Math.max(0, Math.min(MAX_ENCHANTING_LEVEL, level || 0));
  return clamped * ENCHANTING_ABILITY_DAMAGE_PERCENT_PER_LEVEL;
}

export const MAX_TARANTULA_SLAYER_LEVEL = 9;

// Tarantula Broodfather (Spider) Slayer Crit Damage reward: +1/level for 1-4, +2/level for 5-7,
// +3/level for 8-9 — cumulative, e.g. level 9 = 4*1 + 3*2 + 2*3 = 16. User-confirmed table.
const TARANTULA_SLAYER_CRIT_DAMAGE_BY_LEVEL = [0, 1, 2, 3, 4, 6, 8, 10, 13, 16];
export function computeTarantulaSlayerCritDamageBonus(level) {
  const clamped = Math.max(0, Math.min(MAX_TARANTULA_SLAYER_LEVEL, level || 0));
  return TARANTULA_SLAYER_CRIT_DAMAGE_BY_LEVEL[clamped];
}

// Combat Level Crit Chance reward: +0.5/level, capped at +30 (level 60) — user-confirmed.
const COMBAT_LEVEL_CRIT_CHANCE_PER_LEVEL = 0.5;
export function computeCombatLevelCritChanceBonus(level) {
  const clamped = Math.max(0, Math.min(MAX_COMBAT_LEVEL, level || 0));
  return clamped * COMBAT_LEVEL_CRIT_CHANCE_PER_LEVEL;
}

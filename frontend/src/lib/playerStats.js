// Global player-level stats (not tied to any equipped item/pet) that
// still grant a damage bonus — Combat Level, Skyblock Level, etc. Small,
// standalone formulas like lib/starring.js's, kept in one file since
// they all feed the same "player stats" input row on Landing.jsx.

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

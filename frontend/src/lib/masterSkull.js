// Master Skull (MASTER_SKULL_TIER_1..7) — a Catacombs accessory whose tier grants a flat Strength
// MULTIPLIER, multiplicative with the Dungeon Blessings rather than summed into them
// (user-specified 2026-09-10). Read off the account's talisman bag on import, never typed.

export const MASTER_SKULL_MAX_TIER = 7;

// Indexed by tier, 0 = not owned. An explicit table rather than a formula on purpose: the ladder
// changes slope at tier 4 — +1 point per tier up to 4, then +2 per tier (1.04 -> 1.06 -> 1.08 ->
// 1.10) — so a single expression would only ever be a guess dressed up as arithmetic.
export const MASTER_SKULL_STRENGTH_MULTIPLIERS = [1, 1.01, 1.02, 1.03, 1.04, 1.06, 1.08, 1.1];

const MASTER_SKULL_ID_RE = /^MASTER_SKULL_TIER_([1-7])$/;

// 1-7 for a real Master Skull item id, or 0 for anything else.
export function masterSkullTierFromItemId(itemId) {
  const m = MASTER_SKULL_ID_RE.exec(itemId || '');
  return m ? Number(m[1]) : 0;
}

export function masterSkullStrengthMultiplier(tier) {
  const t = Math.max(0, Math.min(MASTER_SKULL_MAX_TIER, Math.floor(Number(tier) || 0)));
  return MASTER_SKULL_STRENGTH_MULTIPLIERS[t];
}

// The multiplier expressed as the percentage the stat pipeline actually speaks
// (addPercentStatBoost): tier 7's 1.10x is +10%. Applied as its own boost immediately after the
// blessings', so the two compound — 1.10 * 1.15, not 1 + 0.10 + 0.15.
export function masterSkullStrengthPercent(tier) {
  return (masterSkullStrengthMultiplier(tier) - 1) * 100;
}

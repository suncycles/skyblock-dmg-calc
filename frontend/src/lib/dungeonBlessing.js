// Dungeon Blessings — the per-run buffs picked up inside a Catacombs run. Each is independently
// levelled during the run (all four can be active at once at different levels, user-confirmed
// 2026-09-10), and every one of them is scaled by a single account-wide "blessing effectiveness"
// multiplier before it touches the player's stats at all.

export const BLESSING_MIN_LEVEL = 0;
export const BLESSING_MAX_LEVEL = 30;

// The four real blessings this app models, in the order they're shown in the Misc panel. `flat` is
// the per-level amount added straight to the named base stats; `percent` is the per-level %
// increase applied AFTERWARDS to those same stats, so it compounds on the flat grant rather than
// replacing it. Stone is flat-only — it has no percentage clause (user-confirmed 2026-09-10).
export const DUNGEON_BLESSINGS = [
  { id: 'power', label: 'Power', flatPerLevel: 4, flatStats: ['strength', 'crit_damage'], percentPerLevel: 2, percentStats: ['strength', 'crit_damage'] },
  { id: 'time', label: 'Time', flatPerLevel: 4, flatStats: ['intelligence', 'strength'], percentPerLevel: 2, percentStats: ['intelligence', 'strength'] },
  { id: 'stone', label: 'Stone', flatPerLevel: 6, flatStats: ['damage'], percentPerLevel: 0, percentStats: [] },
  { id: 'wisdom', label: 'Wisdom', flatPerLevel: 4, flatStats: ['intelligence'], percentPerLevel: 2, percentStats: ['intelligence'] },
];

export const BLESSING_IDS = DUNGEON_BLESSINGS.map((b) => b.id);

export function emptyBlessingLevels() {
  return Object.fromEntries(BLESSING_IDS.map((id) => [id, BLESSING_MIN_LEVEL]));
}

// --- Blessing effectiveness -----------------------------------------------------------------
// Four independent sources, MULTIPLICATIVE with each other (user-specified 2026-09-10). At all
// four maxed: 1.10 * 1.10 * 1.20 * 1.25 = 1.815, matching the confirmed +81.5% figure exactly.
export const BLESSING_BASE_BONUS_PERCENT = 20; // always on, no requirement
export const PAUL_BUFF_PERCENT = 25; // the Paul mayor perk — a Misc-panel checkbox
export const MIMIC_SHARD_MAX_LEVEL = 10; // Epic-tier shard, +1% per level
export const FORBIDDEN_BLESSING_MAX_LEVEL = 10; // Wither essence-shop perk, +1% per level
export const MIMIC_SHARD_PERCENT_PER_LEVEL = 1;
export const FORBIDDEN_BLESSING_PERCENT_PER_LEVEL = 1;

// The single multiplier every blessing's own numbers are scaled by, before they reach the player's
// stats. `forbiddenBlessingLevel` is the 0-10 essence-shop perk and `paulBuff` the Misc checkbox,
// both off `inputs`; the Mimic shard's 0-10 level is a normal attribute (`attributes.mimic`, see
// lib/attributes.js) and so comes from the second argument rather than the blessing block.
// Null-safe on purpose: a default parameter only covers `undefined`, and callers legitimately pass
// null — collectDamageSources defaults `blessing` to null, and a Compare snapshot saved before this
// feature existed has no blessing block at all. Both mean "no blessings", not a crash.
export function computeBlessingMultiplier(inputs, attributes) {
  const { forbiddenBlessingLevel = 0, paulBuff = false } = inputs || {};
  const mimicShardLevel = Math.floor(Number(attributes?.mimic) || 0);
  const mimic = Math.max(0, Math.min(MIMIC_SHARD_MAX_LEVEL, mimicShardLevel)) * MIMIC_SHARD_PERCENT_PER_LEVEL;
  const forbidden = Math.max(0, Math.min(FORBIDDEN_BLESSING_MAX_LEVEL, forbiddenBlessingLevel)) * FORBIDDEN_BLESSING_PERCENT_PER_LEVEL;
  return (
    (1 + mimic / 100) *
    (1 + forbidden / 100) *
    (1 + BLESSING_BASE_BONUS_PERCENT / 100) *
    (paulBuff ? 1 + PAUL_BUFF_PERCENT / 100 : 1)
  );
}

// What each active blessing actually grants, with the effectiveness multiplier already folded in.
// Returns [{ label, flat: {statKey: amount}, percent: {statKey: percent} }] — the caller
// (lib/damageSources.js) adds every `flat` first and only then applies every `percent`, so the
// percentage compounds on the flat grant exactly as the real blessing does.
export function computeBlessingEffects(levels, multiplier) {
  const effects = [];
  for (const blessing of DUNGEON_BLESSINGS) {
    const level = Math.max(BLESSING_MIN_LEVEL, Math.min(BLESSING_MAX_LEVEL, Math.floor(levels?.[blessing.id] || 0)));
    if (level <= 0) continue;
    const flat = {};
    for (const statKey of blessing.flatStats) flat[statKey] = blessing.flatPerLevel * level * multiplier;
    const percent = {};
    for (const statKey of blessing.percentStats) percent[statKey] = blessing.percentPerLevel * level * multiplier;
    effects.push({ label: `${blessing.label} Blessing ${level}`, flat, percent });
  }
  return effects;
}

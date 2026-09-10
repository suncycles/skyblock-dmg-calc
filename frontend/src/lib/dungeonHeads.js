// The 7 Catacombs boss heads, each dropping in two ranks: GOLD_<BOSS>_HEAD and
// DIAMOND_<BOSS>_HEAD. (Called "Golden ___ Head" in-game and by players — the real catalog id
// prefix is the shorter GOLD_, which is what everything here matches on.)
//
// Two rules live together in this file because they're the same family seen from two angles: how
// the item's stats are really computed (below) and what the Optimizer may suggest replacing it
// with (diamondCounterpartFor, used by lib/optimizer.js).

const DUNGEON_HEAD_RE = /^(GOLD|DIAMOND)_([A-Z]+)_HEAD$/;

// A head's displayed lore stats are half of what the item actually grants — the real value is the
// lore number doubled, and every later boost (stars, the Catacombs Stats Boost, reforge, gems)
// applies on top of that doubled base, not the printed one (user-specified 2026-09-09). Same shape
// as lib/tieredArmorStats.js's own "the catalog's printed base isn't the real base" case, and
// applied at the same single point in lib/itemStatTotals.js.
export const DUNGEON_HEAD_BASE_STAT_MULTIPLIER = 2;

// { rank, boss } for a real Catacombs boss head, or null for anything else.
export function parseDungeonHead(itemId) {
  const m = DUNGEON_HEAD_RE.exec(itemId || '');
  return m ? { rank: m[1], boss: m[2] } : null;
}

export function dungeonHeadBaseStatMultiplier(itemId) {
  return parseDungeonHead(itemId) ? DUNGEON_HEAD_BASE_STAT_MULTIPLIER : 1;
}

// The one helmet a boss head can actually be traded up for: its own boss's Diamond rank. A head is
// a boss-specific drop, so a Gold Bonzo Head's real upgrade is a Diamond BONZO Head — not a Diamond
// Necron Head, and not a different armour line (user-specified 2026-09-09). Returns null for a head
// that's already Diamond (nothing above it) and for every non-head helmet.
export function diamondCounterpartFor(itemId) {
  const head = parseDungeonHead(itemId);
  return head && head.rank === 'GOLD' ? `DIAMOND_${head.boss}_HEAD` : null;
}

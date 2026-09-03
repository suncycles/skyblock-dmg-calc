// Gear-Score "tiered stats" mechanic — confirmed real, user-supplied 2026-09-03, scoped to
// exactly these two dungeon-mob-drop families (Skeleton Master, Zombie Knight). For these items
// (and only these — most dungeon armor's real per-account scaling gap is a separate, accepted
// limitation, see lib/hypixelImport.js's resolveGearSummary), the pristine base stat isn't the
// catalog's bundled NEU-REPO snapshot at all: it's Hypixel's own public per-item `tiered_stats`
// table (https://api.hypixel.net/v2/resources/skyblock/items, one array of 10 values per stat,
// index = the real per-copy `ExtraAttributes.item_tier` (1-10, which Floor the drop came from) −
// 1), scaled by the real per-copy `ExtraAttributes.baseStatBoostPercentage` (e.g. 50 = +50% =
// ×1.5). Verified exactly against sammui's real, live-decoded Skeleton Master Chestplate: Health
// and Defense matched Hypixel's own displayed total to the decimal once this scaled value was fed
// into the existing hiddenBase/Star pipeline unmodified.
export const MAX_BASE_STAT_BOOST_PERCENTAGE = 50; // the threshold that also bumps rarity +1 tier — see lib/recombobulator.js's getDisplayTier

const HYPIXEL_STAT_KEY_MAP = {
  DEFENSE: 'defense',
  HEALTH: 'health',
  CRITICAL_DAMAGE: 'crit_damage',
  CRITICAL_CHANCE: 'crit_chance',
  WALK_SPEED: 'speed',
  STRENGTH: 'strength',
  DAMAGE: 'damage',
};

// Hardcoded rather than fetched — a narrow, real, confirmed exception (this codebase's established
// convention for these, e.g. starring.js's HIGH_STAR_ITEM_IDS, pricing.js's
// SPECIAL_ENCHANT_LEVEL_ITEMS), not a general "any item with tiered_stats" rule.
const TIERED_ARMOR_STAT_TABLES = {
  SKELETON_MASTER_CHESTPLATE: {
    DEFENSE: [42, 45, 49, 54, 58, 63, 69, 74, 81, 88],
    HEALTH: [26, 29, 31, 34, 37, 40, 44, 47, 51, 56],
    CRITICAL_DAMAGE: [22, 23, 25, 27, 30, 32, 35, 38, 41, 45],
    CRITICAL_CHANCE: [2, 2, 2, 2, 3, 3, 3, 3, 4, 4],
  },
  SKELETON_MASTER_BOOTS: {
    DEFENSE: [22, 25, 26, 29, 32, 34, 38, 41, 44, 48],
    HEALTH: [14, 15, 16, 18, 19, 21, 23, 25, 27, 29],
    CRITICAL_DAMAGE: [22, 23, 25, 27, 30, 32, 35, 38, 41, 45],
    CRITICAL_CHANCE: [2, 2, 2, 2, 3, 3, 3, 3, 4, 4],
  },
  SKELETON_MASTER_LEGGINGS: {
    DEFENSE: [38, 42, 46, 50, 54, 58, 63, 69, 74, 82],
    HEALTH: [24, 26, 28, 31, 34, 36, 40, 43, 47, 51],
    CRITICAL_DAMAGE: [22, 23, 25, 27, 30, 32, 35, 38, 41, 45],
    CRITICAL_CHANCE: [2, 2, 2, 2, 3, 3, 3, 3, 4, 4],
  },
  SKELETON_MASTER_HELMET: {
    DEFENSE: [26, 28, 30, 33, 36, 39, 42, 45, 50, 54],
    HEALTH: [16, 17, 19, 21, 22, 24, 26, 29, 31, 34],
    CRITICAL_DAMAGE: [22, 23, 25, 27, 30, 32, 35, 38, 41, 45],
    CRITICAL_CHANCE: [2, 2, 2, 2, 3, 3, 3, 3, 4, 4],
  },
  ZOMBIE_KNIGHT_BOOTS: {
    WALK_SPEED: [5, 5, 5, 6, 6, 6, 7, 7, 7, 8],
    DEFENSE: [46, 50, 55, 60, 65, 71, 78, 84, 92, 100],
    STRENGTH: [10, 11, 12, 13, 14, 15, 17, 18, 20, 22],
  },
  ZOMBIE_KNIGHT_HELMET: {
    WALK_SPEED: [5, 5, 5, 6, 6, 6, 7, 7, 7, 8],
    DEFENSE: [54, 59, 64, 69, 76, 83, 91, 98, 107, 117],
    STRENGTH: [10, 11, 12, 13, 14, 15, 17, 18, 20, 22],
  },
  ZOMBIE_KNIGHT_CHESTPLATE: {
    WALK_SPEED: [5, 5, 5, 6, 6, 6, 7, 7, 7, 8],
    DEFENSE: [96, 105, 115, 123, 135, 148, 161, 176, 192, 209],
    STRENGTH: [20, 22, 23, 26, 28, 31, 33, 36, 40, 43],
  },
  ZOMBIE_KNIGHT_LEGGINGS: {
    WALK_SPEED: [5, 5, 5, 6, 6, 6, 7, 7, 7, 8],
    DEFENSE: [85, 92, 101, 109, 119, 130, 142, 155, 169, 184],
    STRENGTH: [15, 16, 18, 19, 21, 23, 25, 27, 30, 33],
  },
  ZOMBIE_KNIGHT_SWORD: {
    DAMAGE: [82, 86, 91, 95, 101, 106, 111, 117, 123, 130],
    STRENGTH: [21, 22, 24, 26, 28, 30, 32, 36, 37, 40],
  },
};

// The real, scaled pristine value for one stat on one of the items above, or null when this
// item/stat isn't a tiered exception, or the real per-copy itemTier isn't known (manually-built
// items, or any other real item) — callers fall back to the catalog's own pristine lore value in
// that case (see lib/itemStatTotals.js).
// Real formula user-confirmed 2026-09-03 against sammui's Skeleton Master Chestplate (CEIL is the
// piece missing before: tiered_stats.CRITICAL_DAMAGE[9]=45 x 1.5 = 67.5, and the real item shows
// exactly ceil(67.5)=68 as its pristine — reproducing the real 119.8%/665.57% Crit Damage totals
// exactly through the existing hiddenBase/Star/Catacombs-Boost pipeline unmodified).
export function computeTieredPristineStat(itemId, statKey, itemTier, baseStatBoostPercentage) {
  const table = TIERED_ARMOR_STAT_TABLES[itemId];
  if (!table || !itemTier) return null;
  const hypixelKey = Object.keys(HYPIXEL_STAT_KEY_MAP).find((k) => HYPIXEL_STAT_KEY_MAP[k] === statKey);
  const tiered = hypixelKey ? table[hypixelKey]?.[itemTier - 1] : undefined;
  if (tiered == null) return null;
  return Math.ceil(tiered * (1 + (baseStatBoostPercentage || 0) / 100));
}

// Whether an item id is one of the Gear-Score tiered-stat exceptions above — used by
// lib/hypixelImport.js's resolveDungeonizedFlag: these items are exclusively mob drops from a
// dungeon Floor with no non-dungeon-obtainable variant (unlike e.g. Bonzo Staff, buyable and
// optionally converted via a Dungeonizer), so a real copy is always dungeonized even when its
// `ExtraAttributes.dungeon_item` flag is absent — confirmed live 2026-09-03: sammui's real
// Skeleton Master Chestplate's full decoded NBT has no `dungeon_item` key at all (only
// `dungeon_skill_req`), yet Hypixel's own rendered lore unambiguously shows a real Catacombs Boost
// annotation matching this app's formula exactly.
export function isTieredArmorStatItem(itemId) {
  return Object.prototype.hasOwnProperty.call(TIERED_ARMOR_STAT_TABLES, itemId);
}

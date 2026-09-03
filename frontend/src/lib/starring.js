import { STAT_LABELS } from './reforgeData';

// Dungeon-style item Starring, split into two contexts (see lib/dungeonize.js for the Catacombs
// side): out of a dungeon, each star is a flat +2% of the item's own pristine base stat (parsed
// from lore, before any reforge/gemstone/book/enchant annotation) — this "Overworld" mechanic is
// untouched by anything below. Inside a dungeon, the same star count instead feeds a 10%/star
// rate summed with the Catacombs Level curve/General's Medallion/Master Stars, applied to the
// item's non-star total — see lib/dungeonize.js's computeCatacombsBoostPercent.
// Exported for lib/itemStatTotals.js's own use — a tiered-stat item's real pristine value (see
// lib/tieredArmorStats.js) differs from what parseBaseStatValue reads off raw lore, so that module
// computes the Star bonus inline off its own already-resolved pristine rather than through
// computeStarBonuses below (which always re-derives pristine from lore text).
export const PER_STAR_PERCENT = 2;
export const CATACOMBS_STAR_PERCENT_PER_STAR = 10;

// Real per-item caps: most gear only ever supports 5 stars. Going past 5 is whitelist-only.
export const BASE_MAX_STARS = 5;
export const HIGH_STAR_MAX_STARS = 10;
export const INFERNAL_TIER_MAX_STARS = 15;

// Real Starrable items whose catalog `category` isn't Dungeon-tagged (Magma Lord/Tormentor,
// user-verified) plus user-supplied non-Dungeon items capped at 10 stars (docs/Missing_Starrable_Items.csv,
// cross-checked against every id existing in worker/src/data/{weapons,armor,equipment}.json).
const HIGH_STAR_ITEM_IDS = new Set([
  'MAGMA_LORD_HELMET', 'MAGMA_LORD_CHESTPLATE', 'MAGMA_LORD_LEGGINGS', 'MAGMA_LORD_BOOTS', 'TORMENTOR',
  'FIRE_FURY_STAFF', 'FIRE_VEIL_WAND', 'RAGNAROCK_AXE', 'REAPER_SCYTHE', 'REAPER_SWORD', 'STAFF_OF_THE_VOLCANO',
  'SWORD_OF_BAD_HEALTH', 'BERSERKER_BOOTS', 'BERSERKER_CHESTPLATE', 'BERSERKER_HELMET', 'BERSERKER_LEGGINGS', 'FLAMING_CHESTPLATE',
  'RAMPART_BOOTS', 'RAMPART_CHESTPLATE', 'RAMPART_HELMET', 'RAMPART_LEGGINGS', 'REKINDLED_EMBER_BOOTS', 'REKINDLED_EMBER_CHESTPLATE',
  'REKINDLED_EMBER_HELMET', 'REKINDLED_EMBER_LEGGINGS', 'SHIMMERING_LIGHT_HOOD', 'SHIMMERING_LIGHT_SLIPPERS', 'SHIMMERING_LIGHT_TROUSERS', 'SHIMMERING_LIGHT_TUNIC',
  'SLUG_BOOTS', 'TAURUS_HELMET', 'THUNDER_BOOTS', 'THUNDER_CHESTPLATE', 'THUNDER_HELMET', 'THUNDER_LEGGINGS',
  'UNSTABLE_DRAGON_BOOTS', 'UNSTABLE_DRAGON_CHESTPLATE', 'UNSTABLE_DRAGON_HELMET', 'UNSTABLE_DRAGON_LEGGINGS', 'BLAZE_BELT', 'DELIRIUM_NECKLACE',
  'FLAMING_FIST', 'GAUNTLET_OF_CONTAGION', 'MAGMA_LORD_GAUNTLET', 'MAGMA_NECKLACE', 'MOLTEN_BELT', 'MOLTEN_BRACELET',
  'MOLTEN_CLOAK', 'MOLTEN_NECKLACE', 'SCOURGE_CLOAK', 'SCOVILLE_BELT', 'THUNDERBOLT_NECKLACE', 'VANQUISHED_BLAZE_BELT',
  'VANQUISHED_GHAST_CLOAK', 'VANQUISHED_GLOWSTONE_GAUNTLET', 'VANQUISHED_MAGMA_NECKLACE',
]);

// Same source as HIGH_STAR_ITEM_IDS above (docs/Missing_Starrable_Items.csv) but capped at the
// normal 5-star max — these just need to count as Starrable at all, since BASE_MAX_STARS already
// applies once isStarrableItem is true.
const NON_DUNGEON_STARRABLE_ITEM_IDS = new Set([
  'ASPECT_OF_THE_DRAGON', 'AXE_OF_THE_SHREDDED', 'DRAGON_SHORTBOW', 'FLAMING_FLAY', 'FROZEN_SCYTHE', 'GLACIAL_SCYTHE',
  'JERRY_STAFF', 'JUJU_SHORTBOW', 'MIDAS_STAFF', 'MIDAS_SWORD', 'MOSQUITO_BOW', 'ORNATE_ZOMBIE_SWORD',
  'PIGMAN_SWORD', 'RECLUSE_FANG', 'REVENANT_SWORD', 'ROGUE_SWORD', 'RUNAANS_BOW', 'SCORPION_FOIL',
  'SILK_EDGE_SWORD', 'SOUL_WHIP', 'SPIDER_SWORD', 'STARRED_GLACIAL_SCYTHE', 'STARRED_MIDAS_STAFF', 'STARRED_MIDAS_SWORD',
  'STARRED_YETI_SWORD', 'STING', 'TARANTULA_FANG', 'TERMINATOR', 'UNDEAD_SWORD', 'ZOMBIE_SWORD',
  'BLAZE_BOOTS', 'BLAZE_CHESTPLATE', 'BLAZE_HELMET', 'BLAZE_LEGGINGS', 'CRYSTALLIZED_HEART', 'FROZEN_BLAZE_BOOTS',
  'FROZEN_BLAZE_CHESTPLATE', 'FROZEN_BLAZE_HELMET', 'FROZEN_BLAZE_LEGGINGS', 'HOLY_DRAGON_BOOTS', 'HOLY_DRAGON_CHESTPLATE', 'HOLY_DRAGON_HELMET',
  'HOLY_DRAGON_LEGGINGS', 'OLD_DRAGON_BOOTS', 'OLD_DRAGON_CHESTPLATE', 'OLD_DRAGON_HELMET', 'OLD_DRAGON_LEGGINGS', 'PERFECT_BOOTS_1',
  'PERFECT_BOOTS_10', 'PERFECT_BOOTS_11', 'PERFECT_BOOTS_12', 'PERFECT_BOOTS_13', 'PERFECT_BOOTS_2', 'PERFECT_BOOTS_3',
  'PERFECT_BOOTS_4', 'PERFECT_BOOTS_5', 'PERFECT_BOOTS_6', 'PERFECT_BOOTS_7', 'PERFECT_BOOTS_8', 'PERFECT_BOOTS_9',
  'PERFECT_CHESTPLATE_1', 'PERFECT_CHESTPLATE_10', 'PERFECT_CHESTPLATE_11', 'PERFECT_CHESTPLATE_12', 'PERFECT_CHESTPLATE_13', 'PERFECT_CHESTPLATE_2',
  'PERFECT_CHESTPLATE_3', 'PERFECT_CHESTPLATE_4', 'PERFECT_CHESTPLATE_5', 'PERFECT_CHESTPLATE_6', 'PERFECT_CHESTPLATE_7', 'PERFECT_CHESTPLATE_8',
  'PERFECT_CHESTPLATE_9', 'PERFECT_HELMET_1', 'PERFECT_HELMET_10', 'PERFECT_HELMET_11', 'PERFECT_HELMET_12', 'PERFECT_HELMET_13',
  'PERFECT_HELMET_2', 'PERFECT_HELMET_3', 'PERFECT_HELMET_4', 'PERFECT_HELMET_5', 'PERFECT_HELMET_6', 'PERFECT_HELMET_7',
  'PERFECT_HELMET_8', 'PERFECT_HELMET_9', 'PERFECT_LEGGINGS_1', 'PERFECT_LEGGINGS_10', 'PERFECT_LEGGINGS_11', 'PERFECT_LEGGINGS_12',
  'PERFECT_LEGGINGS_13', 'PERFECT_LEGGINGS_2', 'PERFECT_LEGGINGS_3', 'PERFECT_LEGGINGS_4', 'PERFECT_LEGGINGS_5', 'PERFECT_LEGGINGS_6',
  'PERFECT_LEGGINGS_7', 'PERFECT_LEGGINGS_8', 'PERFECT_LEGGINGS_9', 'PRIMORDIAL_BOOTS', 'PRIMORDIAL_CHESTPLATE', 'PRIMORDIAL_HELMET',
  'PRIMORDIAL_LEGGINGS', 'PROTECTOR_DRAGON_BOOTS', 'PROTECTOR_DRAGON_CHESTPLATE', 'PROTECTOR_DRAGON_HELMET', 'PROTECTOR_DRAGON_LEGGINGS', 'REAPER_BOOTS',
  'REAPER_CHESTPLATE', 'REAPER_LEGGINGS', 'REAPER_MASK', 'REVENANT_BOOTS', 'REVENANT_CHESTPLATE', 'REVENANT_LEGGINGS',
  'REVIVED_HEART', 'STRONG_DRAGON_BOOTS', 'STRONG_DRAGON_CHESTPLATE', 'STRONG_DRAGON_HELMET', 'STRONG_DRAGON_LEGGINGS', 'SUPERIOR_DRAGON_BOOTS',
  'SUPERIOR_DRAGON_CHESTPLATE', 'SUPERIOR_DRAGON_HELMET', 'SUPERIOR_DRAGON_LEGGINGS', 'TARANTULA_BOOTS', 'TARANTULA_CHESTPLATE', 'TARANTULA_HELMET',
  'TARANTULA_LEGGINGS', 'WEREWOLF_BOOTS', 'WEREWOLF_CHESTPLATE', 'WEREWOLF_HELMET', 'WEREWOLF_LEGGINGS', 'WISE_DRAGON_BOOTS',
  'WISE_DRAGON_CHESTPLATE', 'WISE_DRAGON_HELMET', 'WISE_DRAGON_LEGGINGS', 'YOUNG_DRAGON_BOOTS', 'YOUNG_DRAGON_CHESTPLATE', 'YOUNG_DRAGON_HELMET',
  'YOUNG_DRAGON_LEGGINGS', 'ZOMBIE_BOOTS', 'ZOMBIE_CHESTPLATE', 'ZOMBIE_HAT', 'ZOMBIE_HEART', 'ZOMBIE_LEGGINGS',
  'THE_PRIMORDIAL',
]);

// Blaze Slayer's 5 armor sets (Aurora/Crimson/Fervor/Hollow/Terror), split by power tier
// (base/Hot/Burning/Fiery vs. Infernal prefix) — same 100-id family lib/armorVariants.js groups
// for the picker UI, verified against worker/src/data/armor.json (exactly 100 ids). Only the
// Infernal tier reaches 15 stars; the 4 lower tiers cap at 10 — user-confirmed (a single shared
// regex previously gave every tier 15, which was wrong for anything below Infernal).
const INFERNAL_TIER_ARMOR_RE = /^INFERNAL_(?:AURORA|CRIMSON|FERVOR|HOLLOW|TERROR)_(?:HELMET|CHESTPLATE|LEGGINGS|BOOTS)$/;
const LOWER_TIER_VARIANT_ARMOR_RE = /^(?:HOT_|BURNING_|FIERY_)?(?:AURORA|CRIMSON|FERVOR|HOLLOW|TERROR)_(?:HELMET|CHESTPLATE|LEGGINGS|BOOTS)$/;

// Whether an item can be Starred at all in real Skyblock: the catalog's own `category` field
// carries a real "DUNGEON " prefix for genuine Dungeon-tagged gear (ingested straight from
// NotEnoughUpdates-REPO, e.g. "DUNGEON SWORD" vs plain "SWORD") — verified against
// worker/src/data/{weapons,armor,equipment}.json. Kuudra's armor families and the
// HIGH_STAR_ITEM_IDS/NON_DUNGEON_STARRABLE_ITEM_IDS sets above are real exceptions: also
// Starrable in-game but their category is plain (not Dungeon-tagged). Everything else defaults
// to non-Starrable.
export function isStarrableItem(item) {
  if (!item?.id) return false;
  if (item.category?.startsWith('DUNGEON')) return true;
  if (INFERNAL_TIER_ARMOR_RE.test(item.id)) return true;
  if (LOWER_TIER_VARIANT_ARMOR_RE.test(item.id)) return true;
  if (HIGH_STAR_ITEM_IDS.has(item.id)) return true;
  if (NON_DUNGEON_STARRABLE_ITEM_IDS.has(item.id)) return true;
  return false;
}

// The max star count a given item can hold, out of a dungeon (Catacombs Stars in-dungeon use the
// same count, uncapped by this per real-game data — see lib/dungeonize.js). 0 for anything not
// Starrable at all (see isStarrableItem above).
export function getMaxStarsForItem(item) {
  if (!isStarrableItem(item)) return 0;
  if (INFERNAL_TIER_ARMOR_RE.test(item.id)) return INFERNAL_TIER_MAX_STARS;
  if (LOWER_TIER_VARIANT_ARMOR_RE.test(item.id)) return HIGH_STAR_MAX_STARS;
  if (HIGH_STAR_ITEM_IDS.has(item.id)) return HIGH_STAR_MAX_STARS;
  return BASE_MAX_STARS;
}

// Master Stars: usable on any item once it has this many base stars (not restricted to Dungeon-
// tagged gear), worth 5%/star instead of 2%, capped at 5 — see lib/dungeonize.js.
export const MASTER_STAR_MIN_BASE_STARS = 5;
export const MAX_MASTER_STARS = 5;
export const MASTER_STAR_PERCENT_PER_STAR = 5;

// Ability Damage (Wither/Shadow/Dark Goggles, Aurora Helmet, Gilded Midas Staff): user-corrected
// back to the same 10%/star rate as CATACOMBS_STAR_PERCENT_PER_STAR (an earlier session had this
// at 11%, since reverted) — but unlike every other stat, it's untouched by the Catacombs Level
// curve, only by stars and General's Medallion digits (Master Stars still stack normally) — see
// lib/dungeonize.js's computeAbilityDamageCatacombsBoostPercent.
export const ABILITY_DAMAGE_CATACOMBS_STAR_PERCENT_PER_STAR = 10;

// Circled-digit glyph for a given Master Star count (1-5), for UI display — not part of any real item lore.
export const MASTER_STAR_DIGIT_GLYPHS = ['', '➊', '➋', '➌', '➍', '➎'];

// Green — distinct from Books' yellow (e), Art of War/Peace's gold (6), Reforges' blue (9), Special weapons' aqua (b).
export const STAR_COLOR = 'a';

function stripColor(line) {
  return line.replace(/§./g, '');
}

// Finds the item's own pristine value for a stat by matching STAT_LABELS' label text against each
// lore line. Exported for lib/itemStatTotals.js's own use (reads the same pristine value the Star
// bonus is computed from, rather than reimplementing this regex a third time).
export function parseBaseStatValue(lore, statKey) {
  const meta = STAT_LABELS[statKey];
  if (!meta) return null;
  const re = new RegExp(`^${meta.label}:\\s*([+-]?[\\d.]+)`);
  for (const line of lore || []) {
    const m = re.exec(stripColor(line).trim());
    if (m) return parseFloat(m[1]);
  }
  return null;
}

// {statKey: delta} for every base stat line the item has, ready to feed into lib/statLines.js's annotateStatLines.
export function computeStarBonuses(lore, starCount, percentPerStar = PER_STAR_PERCENT) {
  const bonuses = {};
  if (!starCount) return bonuses;
  for (const statKey of Object.keys(STAT_LABELS)) {
    const base = parseBaseStatValue(lore, statKey);
    if (!base) continue;
    const delta = Math.round(base * (percentPerStar / 100) * starCount * 10) / 10;
    if (delta) bonuses[statKey] = delta;
  }
  return bonuses;
}

const TIER_COLORS = ['6', 'd', 'b']; // gold, pink, light blue

// Always exactly 5 ✪ glyphs (once past the first tier): the current tier's progress leads in
// its own color, backfilled from the previous tier's color rather than left blank.
export function buildStarSuffix(starCount) {
  if (!starCount) return '';
  const tierIndex = Math.min(Math.ceil(starCount / 5), TIER_COLORS.length) - 1;
  const filledInTier = starCount - tierIndex * 5;
  const backfill = 5 - filledInTier;

  let suffix = `§${TIER_COLORS[tierIndex]}${'✪'.repeat(filledInTier)}`;
  if (backfill > 0 && tierIndex > 0) {
    suffix += `§${TIER_COLORS[tierIndex - 1]}${'✪'.repeat(backfill)}`;
  }
  return suffix;
}

// Purely cosmetic circled-digit glyph appended after the ✪ star suffix — colored the same red
// (§c) as the rest of the item's own tooltip text, not part of any real item lore.
export function buildMasterStarSuffix(masterStars) {
  if (!masterStars) return '';
  return `§c${MASTER_STAR_DIGIT_GLYPHS[masterStars]}`;
}

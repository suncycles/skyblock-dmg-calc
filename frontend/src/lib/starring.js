import { STAT_LABELS } from './reforgeData';

// Dungeon-style item Starring, split into two contexts (see lib/dungeonize.js for the Catacombs
// side): out of a dungeon, each star is a flat +2% of the item's own pristine base stat (parsed
// from lore, before any reforge/gemstone/book/enchant annotation) — this "Overworld" mechanic is
// untouched by anything below. Inside a dungeon, the same star count instead feeds a 10%/star
// rate summed with the Catacombs Level curve/General's Medallion/Master Stars, applied to the
// item's non-star total — see lib/dungeonize.js's computeCatacombsBoostPercent.
const PER_STAR_PERCENT = 2;
export const CATACOMBS_STAR_PERCENT_PER_STAR = 10;

// Real per-item caps: most gear only ever supports 5 stars. Going past 5 is whitelist-only.
export const BASE_MAX_STARS = 5;
export const HIGH_STAR_MAX_STARS = 10;
export const INFERNAL_TIER_MAX_STARS = 15;

// Magma Lord's 4 armor pieces + Tormentor sword — verified ids in worker/src/data/armor.json/weapons.json.
const HIGH_STAR_ITEM_IDS = new Set(['MAGMA_LORD_HELMET', 'MAGMA_LORD_CHESTPLATE', 'MAGMA_LORD_LEGGINGS', 'MAGMA_LORD_BOOTS', 'TORMENTOR']);

// Blaze Slayer's 5 armor sets (Aurora/Crimson/Fervor/Hollow/Terror) at any of their 5 power
// tiers (base/Hot/Burning/Fiery/Infernal prefix) — same 100-id family lib/armorVariants.js
// groups for the picker UI, verified against worker/src/data/armor.json (exactly 100 ids).
const INFERNAL_TIER_ARMOR_RE =
  /^(?:HOT_|BURNING_|FIERY_|INFERNAL_)?(?:AURORA|CRIMSON|FERVOR|HOLLOW|TERROR)_(?:HELMET|CHESTPLATE|LEGGINGS|BOOTS)$/;

// The max star count a given item can hold, out of a dungeon (Catacombs Stars in-dungeon use the
// same count, uncapped by this per real-game data — see lib/dungeonize.js).
export function getMaxStarsForItem(item) {
  if (!item?.id) return BASE_MAX_STARS;
  if (INFERNAL_TIER_ARMOR_RE.test(item.id)) return INFERNAL_TIER_MAX_STARS;
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

// Finds the item's own pristine value for a stat by matching STAT_LABELS' label text against each lore line.
function parseBaseStatValue(lore, statKey) {
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

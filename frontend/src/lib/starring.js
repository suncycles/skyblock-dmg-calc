import { STAT_LABELS } from './reforgeData';

// Dungeon-style item Starring: each star is a flat +2% of the item's own base stat (parsed
// from pristine lore, before any reforge/gemstone/book/enchant annotation), so it's computed
// independently of every other modifier and never compounds with them.
export const MAX_STARS = 15;
const PER_STAR_PERCENT = 2;

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
export function computeStarBonuses(lore, starCount) {
  const bonuses = {};
  if (!starCount) return bonuses;
  for (const statKey of Object.keys(STAT_LABELS)) {
    const base = parseBaseStatValue(lore, statKey);
    if (!base) continue;
    const delta = Math.round(base * (PER_STAR_PERCENT / 100) * starCount * 10) / 10;
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

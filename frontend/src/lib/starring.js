import { STAT_LABELS } from './reforgeData';

// Dungeon-style item Starring: each star is a flat +2% of the item's own
// *base* stat line (parsed straight from the item's pristine lore, before
// any reforge/gemstone/book/enchant annotation gets appended to it) — so
// it's computed independently of every other modifier and never compounds
// with them, matching the "excluding reforges, potato books, etc." spec.
export const MAX_STARS = 15;
const PER_STAR_PERCENT = 2;

// Green — distinct from Books' yellow (e), Art of War/Peace's gold (6),
// Reforges' blue (9), Special weapons' aqua (b), and enchant stat bonuses'
// light purple (d).
export const STAR_COLOR = 'a';

function stripColor(line) {
  return line.replace(/§./g, '');
}

// Finds the item's own pristine value for a given stat (e.g. "Damage") by
// matching STAT_LABELS' label text against the start of each lore line —
// same label convention lib/statLines.js's annotateStatLines matches
// against, just extracting the number instead of appending to it.
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

// {statKey: delta} for every base stat line the item actually has, ready
// to feed into lib/statLines.js's annotateStatLines.
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

// ✪ per star, colored in bands of 5 (gold, then pink, then light blue) —
// real Hypixel's own star-tier coloring convention.
export function buildStarSuffix(starCount) {
  if (!starCount) return '';
  const gold = Math.min(starCount, 5);
  const pink = Math.min(Math.max(starCount - 5, 0), 5);
  const blue = Math.min(Math.max(starCount - 10, 0), 5);
  let suffix = '';
  if (gold) suffix += `§6${'✪'.repeat(gold)}`;
  if (pink) suffix += `§d${'✪'.repeat(pink)}`;
  if (blue) suffix += `§b${'✪'.repeat(blue)}`;
  return suffix;
}

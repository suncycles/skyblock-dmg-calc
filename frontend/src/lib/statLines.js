import { STAT_LABELS, formatStatValue } from './reforgeData';

// Appends a "§{color}(+X)" annotation to each lore line whose stat label
// matches a key in `bonuses` (a {statKey: numericValue} map using
// reforgeData's NEU stat keys, e.g. {damage: 50, strength: 15}), or adds a
// brand new "§7Label: §{valueColor}+X §{color}(+X)" line — matching real
// stat-line format — for any bonus the item's lore doesn't already show a
// line for. Mirrors gemstones.js's applyGemstonesToLore but for flat/
// percent bonuses keyed by STAT_LABELS instead of gemstone-specific
// bracket handling; used by both Reforges and Books so those two features
// don't each reimplement this line-matching/insertion logic.
export function annotateStatLines(lore, bonuses, color, insertBeforeLineIdx) {
  const entries = Object.entries(bonuses || {}).filter(([, v]) => v);
  if (!lore || entries.length === 0) return lore;

  const byLabel = {};
  entries.forEach(([statKey, value]) => {
    const meta = STAT_LABELS[statKey];
    if (!meta) return;
    byLabel[meta.label] = { statKey, value };
  });

  const matchedLabels = new Set();
  const result = lore.map((line) => {
    const plain = line.replace(/§./g, '');
    const match = /^(\s*)([A-Za-z ]+):\s/.exec(plain);
    if (match && byLabel[match[2]]) {
      matchedLabels.add(match[2]);
      const { statKey, value } = byLabel[match[2]];
      return `${line} §${color}(${formatStatValue(statKey, value)})`;
    }
    return line;
  });

  const newLines = Object.keys(byLabel)
    .filter((label) => !matchedLabels.has(label))
    .map((label) => {
      const { statKey, value } = byLabel[label];
      const formatted = formatStatValue(statKey, value);
      return `§7${label}: §${STAT_LABELS[statKey].color}${formatted} §${color}(${formatted})`;
    });

  if (newLines.length === 0) return result;
  const idx = insertBeforeLineIdx != null && insertBeforeLineIdx !== -1 ? insertBeforeLineIdx : result.length;
  return [...result.slice(0, idx), ...newLines, ...result.slice(idx)];
}

// Same line-matching as annotateStatLines, but instead of appending a
// separate "(+X)" annotation, rewrites the base number itself in place
// (e.g. "§7Damage: §c+170" + {damage: 120} -> "§7Damage: §c+290") — for
// bonuses that should read as part of the item's own base stat rather
// than an external modifier (see Midas Sword's price-paid bonus). Any
// text already following the number on that line (a trailing "%", or an
// annotation appended by an earlier-applied modifier) is preserved as-is.
export function mergeStatIntoBase(lore, bonuses, insertBeforeLineIdx) {
  const entries = Object.entries(bonuses || {}).filter(([, v]) => v);
  if (!lore || entries.length === 0) return lore;

  const byLabel = {};
  entries.forEach(([statKey, value]) => {
    const meta = STAT_LABELS[statKey];
    if (!meta) return;
    byLabel[meta.label] = { statKey, value };
  });

  const matchedLabels = new Set();
  const result = lore.map((line) => {
    const plain = line.replace(/§./g, '');
    const labelMatch = /^(\s*)([A-Za-z ]+):\s/.exec(plain);
    if (!labelMatch || !byLabel[labelMatch[2]]) return line;
    // Base number is the first §-colored token right after "Label: " —
    // captured separately from anything after it (a "%" suffix, or a
    // later modifier's own "(+X)" annotation) so only the base moves.
    const numMatch = /^(.*?:\s*§.)([+-]?[\d.]+)/.exec(line);
    if (!numMatch) return line;
    matchedLabels.add(labelMatch[2]);
    const { value } = byLabel[labelMatch[2]];
    const base = parseFloat(numMatch[2]);
    const merged = Math.round((base + value) * 10) / 10;
    const sign = merged >= 0 ? '+' : '';
    return `${numMatch[1]}${sign}${merged}${line.slice(numMatch[0].length)}`;
  });

  const newLines = Object.keys(byLabel)
    .filter((label) => !matchedLabels.has(label))
    .map((label) => {
      const { statKey, value } = byLabel[label];
      return `§7${label}: §${STAT_LABELS[statKey].color}${formatStatValue(statKey, value)}`;
    });

  if (newLines.length === 0) return result;
  const idx = insertBeforeLineIdx != null && insertBeforeLineIdx !== -1 ? insertBeforeLineIdx : result.length;
  return [...result.slice(0, idx), ...newLines, ...result.slice(idx)];
}

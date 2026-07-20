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

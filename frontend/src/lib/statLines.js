import { STAT_LABELS, formatStatValue } from './reforgeData';

// Appends a "§{color}(+X)" annotation to each lore line whose stat label matches a key in
// `bonuses` ({statKey: numericValue}), or adds a brand-new "§7Label: §{color}+X" line for any
// bonus the item's lore doesn't already show. Used by Reforges/Books/Enchant stat bonuses.
// Every "(+X)" this produces is a genuinely additional amount not already reflected in the
// line's leading number — sumStatFromTooltipLines relies on that to avoid double-counting.
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
      return `§7${label}: §${STAT_LABELS[statKey].color}${formatStatValue(statKey, value)}`;
    });

  if (newLines.length === 0) return result;
  const idx = insertBeforeLineIdx != null && insertBeforeLineIdx !== -1 ? insertBeforeLineIdx : result.length;
  return [...result.slice(0, idx), ...newLines, ...result.slice(idx)];
}

// Same line-matching as annotateStatLines, but rewrites the base number itself in place
// instead of appending an annotation — for bonuses that read as part of the item's own base
// stat. Text already following the number (a "%" suffix, or another modifier's annotation) is preserved.
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
    // Captures just the base number after "Label: ", separate from any trailing "%" or annotation.
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

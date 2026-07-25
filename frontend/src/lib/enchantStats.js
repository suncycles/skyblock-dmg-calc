import { STAT_LABELS } from './reforgeData';

// Some enchants grant a flat/percent stat bonus per level (e.g. "Increases Crit Damage by
// 10%.", "Grants +3 Health.") — parsed generically from the two real NEU-REPO phrasings
// rather than a hardcoded per-enchant table, so any stat-granting enchant picks this up for
// free. Returns null for anything that doesn't resolve to one fixed number on one known stat
// (e.g. Cayenne's Magical-Power-scaled bonus, which this calculator has no input for).
function stripToPlainText(loreLines) {
  return loreLines
    .join(' ')
    .replace(/§./g, '')
    .replace(/[^\x00-\x7F]/g, '') // drop decorative glyphs (❤ ☠ ❈ ✎ etc.)
    .replace(/\s+/g, ' ')
    .trim();
}

function findStatKeyByLabel(label) {
  const target = label.trim().toLowerCase();
  return Object.keys(STAT_LABELS).find((key) => STAT_LABELS[key].label.toLowerCase() === target) || null;
}

export function parseEnchantStatBonus(descriptionLines) {
  if (!descriptionLines || descriptionLines.length === 0) return null;
  const text = stripToPlainText(descriptionLines);

  let m = /Increases ([A-Za-z ]+?) by ([\d.]+)%/i.exec(text);
  if (m) {
    const statKey = findStatKeyByLabel(m[1]);
    if (statKey && STAT_LABELS[statKey].isPercent) return { [statKey]: parseFloat(m[2]) };
  }

  m = /Grants \+([\d.]+) ([A-Za-z ]+?)\.?$/i.exec(text);
  if (m) {
    const statKey = findStatKeyByLabel(m[2]);
    if (statKey && !STAT_LABELS[statKey].isPercent) return { [statKey]: parseFloat(m[1]) };
  }

  return null;
}

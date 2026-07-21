import { STAT_LABELS } from './reforgeData';

// Some enchants grant a flat/percent stat bonus per level (parsed from
// the same real per-level NEU-REPO description text lib/enchantEffects.js
// already fetches for the enchant-picker's own preview tooltip — e.g.
// "Increases Crit Damage by 10%." for Critical I, "Grants +3 Health."
// for Prosperity I) rather than only being a described ability. Those
// should show up as a normal "(+X)" annotation on the item's own stat
// lines, same as Reforges/Books — this is a lightweight text parser for
// the two real phrasings NEU-REPO consistently uses for that, not a
// hardcoded per-enchant table, so any other stat-granting enchant picks
// this up for free.
//
// Deliberately returns null for anything that doesn't cleanly resolve to
// "one fixed number attached to one known stat name" — e.g. Cayenne's
// "+0.8 Health ... per digit in your Magical Power" scales off Magical
// Power, a game-progression stat this calculator has no input for
// anywhere, so it's correctly left unparsed/skipped rather than guessed.
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

import { REFORGE_COLOR } from './reforges';
import { BOOKS_COLOR } from './books';
import { GEMSTONE_COLOR } from './gemstones';
import { STAT_LABELS, formatStatValue } from './reforgeData';

/* Hypixel's real "Dungeonize" mechanic: swaps an item's stats for a Catacombs-level-scaled
   total. The curve is a straight replacement multiplier of the item's own current total
   (including every reforge/gemstone/enchant/star bonus already on it) — not a bonus added on
   top, so a low Catacombs level can make a dungeonized item's stats *worse* than normal. "old"
   is the pre-0.26.1 curve, "new" is current — both user-supplied, index = Catacombs level. */
export const DUNGEONIZE_CURVE_OLD = [
  10, 14, 18, 22, 26, 30, 35, 40, 45, 50, 55, 61, 67, 73, 79, 85, 92, 99, 106, 113, 120, 128, 136, 144, 152, 160, 169,
  178, 187, 196, 205, 215, 225, 235, 245, 255, 267, 279, 291, 303, 315, 329, 343, 357, 371, 385, 401, 418, 436, 455, 475,
];
export const DUNGEONIZE_CURVE_NEW = [
  10, 15, 20, 25, 31, 38, 46, 55, 65, 75, 85, 95, 105, 115, 125, 135, 145, 155, 165, 175, 185, 195, 205, 215, 225, 235,
  245, 255, 265, 275, 285, 295, 305, 315, 325, 335, 345, 355, 365, 375, 385, 395, 405, 415, 425, 435, 445, 455, 465, 475, 485,
];
export const DUNGEONIZE_MAX_CATACOMBS_LEVEL = DUNGEONIZE_CURVE_NEW.length - 1;

export function computeDungeonizeMultiplier(catacombsLevel, useOldCurve) {
  const curve = useOldCurve ? DUNGEONIZE_CURVE_OLD : DUNGEONIZE_CURVE_NEW;
  const level = Math.max(0, Math.min(Math.floor(catacombsLevel || 0), DUNGEONIZE_MAX_CATACOMBS_LEVEL));
  return curve[level] / 100;
}

export const DUNGEONIZE_COLOR = '8'; // dark grey, matching the real game's Dungeonized-stat annotation
export const MASTER_STAR_COLOR = 'q'; // dark blue (#1d213d) — the Master Star delta on top of normal Dungeonize

// Reads a stat line's fully-settled current total: leading number + every genuinely-additive
// annotation. Reforge/Books/Gemstone/Dungeonize/Master Star are excluded because they each echo
// an amount already reflected elsewhere (already merged into the leading number, or an
// independently computed replacement) rather than adding on top of it.
export function sumStatFromTooltipLines(finalLines, label) {
  const labelRe = new RegExp(`^${label}:`);
  const finalLine = finalLines.find((l) => labelRe.test(l.replace(/§./g, '').trim()));
  if (!finalLine) return 0;
  const plain = finalLine.replace(/§./g, '');
  const afterLabelPlain = plain.slice(plain.indexOf(':') + 1);
  const leadingMatch = /^\s*([+-]?[\d.]+)/.exec(afterLabelPlain);
  const base = leadingMatch ? parseFloat(leadingMatch[1]) : 0;

  const rawAfterLabel = finalLine.slice(finalLine.indexOf(':') + 1);
  const annotationRe = /§([0-9a-fk-orpq])\(([+-]?[\d.]+)%?\)/g;
  const parenNums = [...rawAfterLabel.matchAll(annotationRe)]
    .filter(
      (m) =>
        m[1] !== REFORGE_COLOR &&
        m[1] !== BOOKS_COLOR &&
        m[1] !== GEMSTONE_COLOR &&
        m[1] !== DUNGEONIZE_COLOR &&
        m[1] !== MASTER_STAR_COLOR,
    )
    .map((m) => parseFloat(m[2]));

  return base + parenNums.reduce((a, b) => a + b, 0);
}

// Reads ONLY the Dungeonize annotation back out — a standalone replacement total for that stat,
// not summed with the line's base number or any other annotation. Falls back to the item's
// normal total when it has no Dungeonize annotation there (not dungeonized, or the stat's zero).
export function sumDungeonizedStatFromTooltipLines(finalLines, label) {
  const labelRe = new RegExp(`^${label}:`);
  const finalLine = finalLines.find((l) => labelRe.test(l.replace(/§./g, '').trim()));
  if (!finalLine) return sumStatFromTooltipLines(finalLines, label);
  const match = new RegExp(`§${DUNGEONIZE_COLOR}\\(([+-]?[\\d.]+)%?\\)`).exec(finalLine);
  return match ? parseFloat(match[1]) : sumStatFromTooltipLines(finalLines, label);
}

// Reads the Dungeonize total plus the Master Star delta on top of it — the item's fully
// master-boosted total for that stat. Falls back the same way sumDungeonizedStatFromTooltipLines
// does when the item isn't dungeonized at all, and simply ignores a missing Master Star delta
// (not every dungeonized item has Master Stars).
export function sumMasterDungeonizedStatFromTooltipLines(finalLines, label) {
  const labelRe = new RegExp(`^${label}:`);
  const finalLine = finalLines.find((l) => labelRe.test(l.replace(/§./g, '').trim()));
  if (!finalLine) return sumStatFromTooltipLines(finalLines, label);
  const dungeonizedMatch = new RegExp(`§${DUNGEONIZE_COLOR}\\(([+-]?[\\d.]+)%?\\)`).exec(finalLine);
  if (!dungeonizedMatch) return sumStatFromTooltipLines(finalLines, label);
  const masterMatch = new RegExp(`§${MASTER_STAR_COLOR}\\(([+-]?[\\d.]+)%?\\)`).exec(finalLine);
  return parseFloat(dungeonizedMatch[1]) + (masterMatch ? parseFloat(masterMatch[1]) : 0);
}

// Appends the item's fully Catacombs-scaled Dungeonized total (dark grey) after each stat line
// it already shows — never creates a new line for a stat the item doesn't have, matching the
// real game (e.g. Mending, which isn't a recognized STAT_LABELS key here, never gets one either).
// `masterStarBonus` ({statKey: delta}, pristine-lore-based — see lib/starring.js) is the item's
// own Master Star contribution *before* the Catacombs curve; scaled by the same multiplier and
// shown as a separate dark-blue delta so the two effects stay visually distinguishable.
export function applyDungeonizeToLore(lore, catacombsLevel, useOldCurve, masterStarBonus) {
  if (!lore) return lore;
  const multiplier = computeDungeonizeMultiplier(catacombsLevel, useOldCurve);
  return lore.map((line) => {
    const plain = line.replace(/§./g, '');
    const labelMatch = /^(\s*)([A-Za-z ]+):\s/.exec(plain);
    if (!labelMatch) return line;
    const statKey = Object.keys(STAT_LABELS).find((k) => STAT_LABELS[k].label === labelMatch[2]);
    if (!statKey) return line;
    const total = sumStatFromTooltipLines(lore, labelMatch[2]);
    if (!total) return line;
    const dungeonized = Math.round(total * multiplier * 10) / 10;
    let result = `${line} §${DUNGEONIZE_COLOR}(${formatStatValue(statKey, dungeonized)})`;
    const masterDelta = masterStarBonus && masterStarBonus[statKey];
    if (masterDelta) {
      const scaledMasterDelta = Math.round(masterDelta * multiplier * 10) / 10;
      result += ` §${MASTER_STAR_COLOR}(${formatStatValue(statKey, scaledMasterDelta)})`;
    }
    return result;
  });
}

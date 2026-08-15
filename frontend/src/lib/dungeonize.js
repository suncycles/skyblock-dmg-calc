import { REFORGE_COLOR } from './reforges';
import { BOOKS_COLOR } from './books';
import { GEMSTONE_COLOR } from './gemstones';
import { STAT_LABELS, formatStatValue } from './reforgeData';
import {
  CATACOMBS_STAR_PERCENT_PER_STAR,
  MASTER_STAR_PERCENT_PER_STAR,
  ABILITY_DAMAGE_CATACOMBS_STAR_PERCENT_PER_STAR,
} from './starring';

/* Hypixel's real "Dungeonize" mechanic: computes a *separate* Catacombs Boost total for each
   stat, independent of the item's Overworld total (see lib/starring.js's computeStarBonuses for
   that one, untouched by anything here). The Catacombs Boost percentage is a straight sum —
   curve[catacombsLevel] + Catacombs Stars (10%/star, the item's real star count, uncapped by the
   Overworld 5-star norm) + General's Medallion digits (1%/digit) + Master Stars (5%/star,
   dungeon-only) — applied to the item's own total MINUS its Overworld star contribution (i.e.
   pristine + reforge + gems + books + everything else, just not the old 2%/star merge). "old" is
   the pre-0.26.1 curve, "new" is current — both user-supplied, index = Catacombs level. */
export const DUNGEONIZE_CURVE_OLD = [
  10, 14, 18, 22, 26, 30, 35, 40, 45, 50, 55, 61, 67, 73, 79, 85, 92, 99, 106, 113, 120, 128, 136, 144, 152, 160, 169,
  178, 187, 196, 205, 215, 225, 235, 245, 255, 267, 279, 291, 303, 315, 329, 343, 357, 371, 385, 401, 418, 436, 455, 475,
];
export const DUNGEONIZE_CURVE_NEW = [
  10, 15, 20, 25, 31, 38, 46, 55, 65, 75, 85, 95, 105, 115, 125, 135, 145, 155, 165, 175, 185, 195, 205, 215, 225, 235,
  245, 255, 265, 275, 285, 295, 305, 315, 325, 335, 345, 355, 365, 375, 385, 395, 405, 415, 425, 435, 445, 455, 465, 475, 485,
];
export const DUNGEONIZE_MAX_CATACOMBS_LEVEL = DUNGEONIZE_CURVE_NEW.length - 1;

// General's Medallion: +1% additive per digit, up to 6 digits = +6%, folded into the same
// percentage sum as the Catacombs curve/Catacombs Stars/Master Stars.
export const MAX_GENERALS_MEDALLION_DIGITS = 6;

// Returns {withoutMaster, withMaster} — both are the FULL Catacombs Boost percentage (not a
// delta), since Master Stars are just one more additive term in the same sum. `stars` uses the
// item's real star count (not capped at 5 here — see lib/starring.js's getMaxStarsForItem for
// the real per-item cap enforced at input time).
export function computeCatacombsBoostPercent(catacombsLevel, useOldCurve, stars, generalsMedallionDigits = 0, masterStars = 0) {
  const curve = useOldCurve ? DUNGEONIZE_CURVE_OLD : DUNGEONIZE_CURVE_NEW;
  const level = Math.max(0, Math.min(Math.floor(catacombsLevel || 0), DUNGEONIZE_MAX_CATACOMBS_LEVEL));
  const digitBonus = Math.max(0, Math.min(MAX_GENERALS_MEDALLION_DIGITS, Math.floor(generalsMedallionDigits || 0)));
  const starsPercent = CATACOMBS_STAR_PERCENT_PER_STAR * Math.max(0, Math.floor(stars || 0));
  const withoutMaster = curve[level] + starsPercent + digitBonus;
  const masterPercent = MASTER_STAR_PERCENT_PER_STAR * Math.max(0, Math.floor(masterStars || 0));
  return { withoutMaster, withMaster: withoutMaster + masterPercent };
}

// Ability Damage's own dungeon scaling (see lib/starring.js): stars + General's Medallion digits
// (no Catacombs Level curve term), at its own 10%/star rate — Master Stars still stack normally.
export function computeAbilityDamageCatacombsBoostPercent(stars, generalsMedallionDigits = 0, masterStars = 0) {
  const digitBonus = Math.max(0, Math.min(MAX_GENERALS_MEDALLION_DIGITS, Math.floor(generalsMedallionDigits || 0)));
  const withoutMaster = ABILITY_DAMAGE_CATACOMBS_STAR_PERCENT_PER_STAR * Math.max(0, Math.floor(stars || 0)) + digitBonus;
  const masterPercent = MASTER_STAR_PERCENT_PER_STAR * Math.max(0, Math.floor(masterStars || 0));
  return { withoutMaster, withMaster: withoutMaster + masterPercent };
}

export const DUNGEONIZE_COLOR = '8'; // dark grey — Catacombs Boost total without Master Stars
export const MASTER_STAR_COLOR = 'q'; // dark blue (#1d213d) — Catacombs Boost total WITH Master Stars (a full total, not a delta)

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

// Reads the §q annotation directly — a standalone Catacombs-Boost-with-Master total, not a delta
// to sum with anything. Falls back to sumDungeonizedStatFromTooltipLines (which itself falls
// back to the plain Overworld total) when there's no §q, i.e. the item has no Master Stars —
// correct since without-Master and with-Master are then the same number.
export function sumMasterDungeonizedStatFromTooltipLines(finalLines, label) {
  const labelRe = new RegExp(`^${label}:`);
  const finalLine = finalLines.find((l) => labelRe.test(l.replace(/§./g, '').trim()));
  if (!finalLine) return sumDungeonizedStatFromTooltipLines(finalLines, label);
  const masterMatch = new RegExp(`§${MASTER_STAR_COLOR}\\(([+-]?[\\d.]+)%?\\)`).exec(finalLine);
  return masterMatch ? parseFloat(masterMatch[1]) : sumDungeonizedStatFromTooltipLines(finalLines, label);
}

// Appends the item's Catacombs Boost total(s) (dark grey without Master Stars, dark blue WITH
// Master Stars — only shown when the item actually has Master Stars) after each stat line it
// already shows — never creates a new line for a stat the item doesn't have, matching the real
// game (e.g. Mending, which isn't a recognized STAT_LABELS key here, never gets one either).
// `starBonus` ({statKey: delta}, from lib/starring.js's computeStarBonuses at the item's real
// star count) is the item's Overworld 2%/star contribution already folded into `lore`'s leading
// number — subtracted back out so the Catacombs Boost percentage applies to everything EXCEPT
// that old mechanic, per this feature's spec.
export function applyDungeonizeToLore(lore, catacombsLevel, useOldCurve, starBonus, stars, masterStars, generalsMedallionDigits) {
  if (!lore) return lore;
  const { withoutMaster, withMaster } = computeCatacombsBoostPercent(catacombsLevel, useOldCurve, stars, generalsMedallionDigits, masterStars);
  const abilityBoost = computeAbilityDamageCatacombsBoostPercent(stars, generalsMedallionDigits, masterStars);
  return lore.map((line) => {
    const plain = line.replace(/§./g, '');
    const labelMatch = /^(\s*)([A-Za-z ]+):\s/.exec(plain);
    if (!labelMatch) return line;
    const statKey = Object.keys(STAT_LABELS).find((k) => STAT_LABELS[k].label === labelMatch[2]);
    if (!statKey) return line;
    const { withoutMaster: statWithoutMaster, withMaster: statWithMaster } =
      statKey === 'ability_damage' ? abilityBoost : { withoutMaster, withMaster };
    const total = sumStatFromTooltipLines(lore, labelMatch[2]);
    if (!total) return line;
    const catacombsBase = total - (starBonus?.[statKey] || 0);
    if (!catacombsBase) return line;
    const boostedNoMaster = Math.round(catacombsBase * (1 + statWithoutMaster / 100) * 10) / 10;
    let result = `${line} §${DUNGEONIZE_COLOR}(${formatStatValue(statKey, boostedNoMaster)})`;
    if (masterStars > 0) {
      const boostedWithMaster = Math.round(catacombsBase * (1 + statWithMaster / 100) * 10) / 10;
      result += ` §${MASTER_STAR_COLOR}(${formatStatValue(statKey, boostedWithMaster)})`;
    }
    return result;
  });
}

import { statKeyForLabel, formatStatValue } from './reforgeData';
import {
  CATACOMBS_STAR_PERCENT_PER_STAR,
  MASTER_STAR_PERCENT_PER_STAR,
  ABILITY_DAMAGE_CATACOMBS_STAR_PERCENT_PER_STAR,
} from './starring';

/* Hypixel's real "Dungeonize" mechanic: computes a *separate* Catacombs Boost total for each
   stat, independent of the item's Overworld total (see lib/starring.js's computeStarBonuses for
   that one, untouched by anything here — lib/itemStatTotals.js's `hiddenBase` is the shared input
   both formulas scale from). The Catacombs Boost percentage is a straight sum —
   curve[catacombsLevel] + Catacombs Stars (10%/star, the item's real star count, uncapped by the
   Overworld 5-star norm) + General's Medallion digits (1%/digit) + Master Stars (5%/star,
   dungeon-only) — applied to hiddenBase (pristine + reforge + gems + books + everything else,
   never the Overworld 2%/star term). "old" is the pre-0.26.1 curve, "new" is current — both
   user-supplied, index = Catacombs level. */
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

// Stat keys using the Ability Damage stat's own Catacombs Stats Boost formula (Stars(10%) +
// General's Medallion digits(1%) + Master Stars(5%) — no Catacombs Level curve term) instead of
// the general one every other stat gets — user-confirmed 2026-08-30: Bonus Attack Speed and Crit
// Chance both follow this same curve-less behavior, same as the Ability Damage stat already did.
// Exported for lib/itemStatTotals.js's own use (picks the same formula per stat when computing).
export const ABILITY_STYLE_BOOST_STAT_KEYS = new Set(['ability_damage', 'bonus_attack_speed', 'crit_chance']);

// Appends the item's already-computed Catacombs Boost total(s) (dark grey without Master Stars,
// dark blue WITH Master Stars — only shown when the item actually has Master Stars) after each
// stat line it already shows — never creates a new line for a stat the item doesn't have,
// matching the real game (e.g. Mending, which isn't a recognized STAT_LABELS key here, never gets
// one either). `statTotals` is lib/itemStatTotals.js's computeItemStatTotals() result — this
// function only ever formats those already-computed numbers, it doesn't derive anything itself.
export function applyDungeonizeToLore(lore, statTotals, masterStars, isMythological) {
  if (!lore) return lore;
  return lore.map((line) => {
    const plain = line.replace(/§./g, '');
    const labelMatch = /^(\s*)([A-Za-z ]+):\s/.exec(plain);
    if (!labelMatch) return line;
    const statKey = statKeyForLabel(labelMatch[2]);
    const t = statKey && statTotals[statKey];
    if (!t) return line;
    const boostedNoMaster = isMythological ? t.mythologicalDungeonStarred : t.dungeonStarred;
    if (!boostedNoMaster) return line;
    let result = `${line} §${DUNGEONIZE_COLOR}(${formatStatValue(statKey, boostedNoMaster)})`;
    if (masterStars > 0) {
      const boostedWithMaster = isMythological ? t.mythologicalMasterStarred : t.masterStarred;
      result += ` §${MASTER_STAR_COLOR}(${formatStatValue(statKey, boostedWithMaster)})`;
    }
    return result;
  });
}

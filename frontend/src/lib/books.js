import { annotateStatLines, mergeStatIntoBase } from './statLines';

// Hot/Fuming Potato Book: +2 Strength/+2 Damage on weapons, +4 Health/+2 Defense on armor.
// Equipment can't take Potato Books at all. Fuming Potato Book only raises the shared
// application limit from 10 to 15, not a bigger per-book bonus.
export const WEAPON_BOOK_STAT_BONUS = { strength: 2, damage: 2 };
export const ARMOR_BOOK_STAT_BONUS = { health: 4, defense: 2 };

// §e (yellow) — distinct from Gemstones' pink and Reforges' blue.
export const BOOKS_COLOR = 'e';

// The Art of War: one-time-use, +5 Strength, weapon-only, a boolean toggle rather than a stackable count.
export const ART_OF_WAR_STAT_BONUS = { strength: 5 };
export const ART_OF_WAR_ITEM_ID = 'THE_ART_OF_WAR';
export const ART_OF_WAR_COLOR = '6';

// The Art of Peace: Art of War's armor-only counterpart, +40 Health, one-time-use.
export const ART_OF_PEACE_STAT_BONUS = { health: 40 };
export const ART_OF_PEACE_ITEM_ID = 'THE_ART_OF_PEACE';
export const ART_OF_PEACE_COLOR = '6';

// `gearType` picks which bonus table applies and whether Art of War/Art of Peace are honored — the one place that enforces eligibility.
// `potatoBookDoubled`: Legendary-tier Blaze pet doubles the Hot/Fuming Potato Book bonus on
// both weapons and armor (e.g. a weapon's real +30 shows as +60, an extra +30 bonus damage/strength).
// `skipMerge` (live-lore imported items only — see hypixelImport.js's resolveGearSummary): the
// leading number is already Hypixel's real, final total including this item's real book bonus, so
// only the informational "(+X)" annotation should be (re-)added, not another merge on top.
export function applyBooksToLore(lore, bookCount, artOfWarApplied, artOfPeaceApplied, insertBeforeLineIdx, gearType, potatoBookDoubled, skipMerge = false) {
  let result = lore;
  if (bookCount && gearType !== 'equipment') {
    const perBook = gearType === 'armor' ? ARMOR_BOOK_STAT_BONUS : WEAPON_BOOK_STAT_BONUS;
    const multiplier = (potatoBookDoubled ? 2 : 1) * bookCount;
    const bonuses = Object.fromEntries(Object.entries(perBook).map(([stat, value]) => [stat, value * multiplier]));
    // Merged into the item's own base stat number, annotated with the delta on top for visibility.
    const merged = skipMerge ? result : mergeStatIntoBase(result, bonuses, insertBeforeLineIdx);
    result = annotateStatLines(merged, bonuses, BOOKS_COLOR, insertBeforeLineIdx);
  }
  if (artOfWarApplied && gearType === 'weapon') {
    // Recompute the insertion point since the call above may have spliced in new lines.
    const blankIdx = result.indexOf('');
    result = annotateStatLines(result, ART_OF_WAR_STAT_BONUS, ART_OF_WAR_COLOR, blankIdx === -1 ? insertBeforeLineIdx : blankIdx);
  }
  if (artOfPeaceApplied && gearType === 'armor') {
    const blankIdx = result.indexOf('');
    result = annotateStatLines(result, ART_OF_PEACE_STAT_BONUS, ART_OF_PEACE_COLOR, blankIdx === -1 ? insertBeforeLineIdx : blankIdx);
  }
  return result;
}

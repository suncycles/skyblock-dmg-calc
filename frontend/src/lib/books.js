import { annotateStatLines } from './statLines';

// Hot Potato Book and Fuming Potato Book grant an identical bonus per
// application — verified from NEU-REPO's own item lore for both:
// "When applied to weapons, grants +2 Strength and +2 Damage." Fuming
// Potato Book's only difference is raising the shared application limit
// from 10 to 15, not a bigger per-book bonus. (Armor gets +2 Defense/+4
// Health instead, but this calculator's Hex flow is weapon-only.)
export const BOOK_STAT_BONUS = { strength: 2, damage: 2 };

// §e (yellow) — distinct from Gemstones' pink and Reforges' blue.
export const BOOKS_COLOR = 'e';

// The Art of War (NEU-REPO internalname "THE_ART_OF_WAR"): a one-time-use
// book, +5 Strength, "Can only be applied to an item once" — a boolean
// toggle rather than a stackable count like Hot/Fuming Potato Books.
// §6 (gold) matches the real item's own "§6The Art of War" display color.
export const ART_OF_WAR_STAT_BONUS = { strength: 5 };
export const ART_OF_WAR_ITEM_ID = 'THE_ART_OF_WAR';
export const ART_OF_WAR_COLOR = '6';

export function applyBooksToLore(lore, bookCount, artOfWarApplied, insertBeforeLineIdx) {
  let result = lore;
  if (bookCount) {
    const bonuses = {
      strength: BOOK_STAT_BONUS.strength * bookCount,
      damage: BOOK_STAT_BONUS.damage * bookCount,
    };
    result = annotateStatLines(result, bonuses, BOOKS_COLOR, insertBeforeLineIdx);
  }
  if (artOfWarApplied) {
    // Recompute the insertion point — the call above may have spliced in
    // new lines, shifting whatever index was passed in.
    const blankIdx = result.indexOf('');
    result = annotateStatLines(result, ART_OF_WAR_STAT_BONUS, ART_OF_WAR_COLOR, blankIdx === -1 ? insertBeforeLineIdx : blankIdx);
  }
  return result;
}

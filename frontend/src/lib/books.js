import { annotateStatLines } from './statLines';

// Hot Potato Book and Fuming Potato Book grant an identical bonus per
// application — verified from NEU-REPO's own item lore for both:
// "When applied to weapons, grants +2 Strength and +2 Damage." Fuming
// Potato Book's only difference is raising the shared application limit
// from 10 to 15, not a bigger per-book bonus. (Armor gets +2 Defense/+4
// Health instead, but this calculator's Hex flow is weapon-only.)
export const BOOK_STAT_BONUS = { strength: 2, damage: 2 };

// §a (green) — distinct from Gemstones' pink and Reforges' blue.
export const BOOKS_COLOR = 'a';

export function applyBooksToLore(lore, bookCount, insertBeforeLineIdx) {
  if (!bookCount) return lore;
  const bonuses = {
    strength: BOOK_STAT_BONUS.strength * bookCount,
    damage: BOOK_STAT_BONUS.damage * bookCount,
  };
  return annotateStatLines(lore, bonuses, BOOKS_COLOR, insertBeforeLineIdx);
}

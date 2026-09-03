import { annotateStatLines } from './statLines';

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

// {statKey: delta} for the Hot/Fuming Potato Book bonus — the calc-facing counterpart of
// applyBooksToLore's own annotation logic below, shared by lib/itemStatTotals.js. `gearType` picks
// which bonus table applies (equipment can't take Potato Books at all). `potatoBookDoubled`:
// Legendary-tier Blaze pet doubles the bonus on both weapons and armor (e.g. a weapon's real +30
// shows as +60).
export function computeBooksStatBonus(bookCount, gearType, potatoBookDoubled) {
  if (!bookCount || gearType === 'equipment') return {};
  const perBook = gearType === 'armor' ? ARMOR_BOOK_STAT_BONUS : WEAPON_BOOK_STAT_BONUS;
  const multiplier = (potatoBookDoubled ? 2 : 1) * bookCount;
  return Object.fromEntries(Object.entries(perBook).map(([stat, value]) => [stat, value * multiplier]));
}

// `gearType` also picks whether Art of War/Art of Peace are honored — the one place that enforces
// eligibility. The leading stat number itself is set once, elsewhere, from
// lib/itemStatTotals.js's computed hidden base (which includes this same book/Art of War/Art of
// Peace bonus) — this function only ever annotates, never merges.
export function applyBooksToLore(lore, bookCount, artOfWarApplied, artOfPeaceApplied, insertBeforeLineIdx, gearType, potatoBookDoubled) {
  let result = lore;
  const bonuses = computeBooksStatBonus(bookCount, gearType, potatoBookDoubled);
  if (Object.keys(bonuses).length > 0) {
    result = annotateStatLines(result, bonuses, BOOKS_COLOR, insertBeforeLineIdx);
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

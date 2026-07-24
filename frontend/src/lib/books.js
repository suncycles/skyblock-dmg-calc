import { annotateStatLines, mergeStatIntoBase } from './statLines';

// Hot Potato Book and Fuming Potato Book grant a different bonus
// depending on what kind of gear it's applied to — verified from
// NEU-REPO's own item lore: "When applied to weapons, grants +2
// Strength and +2 Damage. When applied to armor, grants +4 Health and
// +2 Defense." Equipment (Necklace/Cloak/Belt/Gloves) can't take Potato
// Books at all in the real game. Fuming Potato Book's only difference
// from Hot Potato Book is raising the shared application limit from 10
// to 15, not a bigger per-book bonus.
export const WEAPON_BOOK_STAT_BONUS = { strength: 2, damage: 2 };
export const ARMOR_BOOK_STAT_BONUS = { health: 4, defense: 2 };

// §e (yellow) — distinct from Gemstones' pink and Reforges' blue.
export const BOOKS_COLOR = 'e';

// The Art of War (NEU-REPO internalname "THE_ART_OF_WAR"): a one-time-use
// book, +5 Strength, "Can only be applied to an item once" — weapon-only
// in the real game (armor and equipment can't take it at all), a boolean
// toggle rather than a stackable count like Hot/Fuming Potato Books.
// §6 (gold) matches the real item's own "§6The Art of War" display color.
export const ART_OF_WAR_STAT_BONUS = { strength: 5 };
export const ART_OF_WAR_ITEM_ID = 'THE_ART_OF_WAR';
export const ART_OF_WAR_COLOR = '6';

// The Art of Peace (NEU-REPO internalname "THE_ART_OF_PEACE") — Art of
// War's armor-only counterpart, verified from its own real item lore:
// "Grants +40❤ Health when applied to an armor piece. Can only be
// applied to an item once." Weapons and equipment can't take it.
export const ART_OF_PEACE_STAT_BONUS = { health: 40 };
export const ART_OF_PEACE_ITEM_ID = 'THE_ART_OF_PEACE';
export const ART_OF_PEACE_COLOR = '6';

// `gearType` ('weapon' | 'armor' | 'equipment', see lib/gearType.js)
// picks which bonus table applies and whether Art of War/Art of Peace
// are honored at all — bookCount/artOfWarApplied/artOfPeaceApplied are
// still passed straight from modifiers regardless of gearType, so this
// is the one place that actually enforces eligibility rather than
// trusting every caller to have already zeroed them out for an
// ineligible item.
export function applyBooksToLore(lore, bookCount, artOfWarApplied, artOfPeaceApplied, insertBeforeLineIdx, gearType) {
  let result = lore;
  if (bookCount && gearType !== 'equipment') {
    const perBook = gearType === 'armor' ? ARMOR_BOOK_STAT_BONUS : WEAPON_BOOK_STAT_BONUS;
    const bonuses = Object.fromEntries(Object.entries(perBook).map(([stat, value]) => [stat, value * bookCount]));
    // Merged into the item's own base stat number (a book-fed item's
    // real tooltip shows its TOTAL stat, books included, not a separate
    // modifier — same "improves the base stats" treatment as Reforges/
    // Stars/Gemstones) — still annotated with its own delta on top,
    // purely for visibility, same pattern as Reforges.
    const merged = mergeStatIntoBase(result, bonuses, insertBeforeLineIdx);
    result = annotateStatLines(merged, bonuses, BOOKS_COLOR, insertBeforeLineIdx);
  }
  if (artOfWarApplied && gearType === 'weapon') {
    // Recompute the insertion point — the call above may have spliced in
    // new lines, shifting whatever index was passed in.
    const blankIdx = result.indexOf('');
    result = annotateStatLines(result, ART_OF_WAR_STAT_BONUS, ART_OF_WAR_COLOR, blankIdx === -1 ? insertBeforeLineIdx : blankIdx);
  }
  if (artOfPeaceApplied && gearType === 'armor') {
    const blankIdx = result.indexOf('');
    result = annotateStatLines(result, ART_OF_PEACE_STAT_BONUS, ART_OF_PEACE_COLOR, blankIdx === -1 ? insertBeforeLineIdx : blankIdx);
  }
  return result;
}

import { annotateStatLines } from './statLines';
import { getReforgeStatBonus } from './reforgeData';

// §9 (blue) — distinct from Gemstones' pink and Books' green.
export const REFORGE_COLOR = '9';

export function applyReforgeToLore(lore, reforge, itemTier, insertBeforeLineIdx) {
  if (!reforge) return lore;
  const bonus = getReforgeStatBonus(reforge, itemTier);
  if (!bonus) return lore;
  return annotateStatLines(lore, bonus, REFORGE_COLOR, insertBeforeLineIdx);
}

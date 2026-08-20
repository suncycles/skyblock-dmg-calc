// Small "at a glance" corner badge shown on an item's icon wherever it renders (equipped slot
// tiles, the Optimizer's upgrade rows) — a shorthand hint for a stat that isn't otherwise visible
// on the icon itself. Two cases so far, both user-specified:
// - Crown of Avarice (either variant): its Coins Consumed special value, coin-shorthand (67m, 1b).
// - The 5 Blaze Slayer variant families (Aurora/Crimson/Fervor/Hollow/Terror): which of the 5 real
//   power tiers (Basic..Infernal) this specific piece is, as "T0"-"T4" (0-indexed, matching
//   VARIANT_TIERS' own array order).

import { formatCoinsShorthand } from './mcText';
import { getVariantTierIndexForId } from './armorVariants';

const CROWN_OF_AVARICE_IDS = new Set(['CROWN_OF_AVARICE', 'CROWN_OF_AVARICE_CELEBRATION']);

// `modifiers` is optional — pass it when known (equipped slot) for the real Coins Consumed value;
// omitted (e.g. an Optimizer candidate not yet equipped) falls back to null, showing no coin badge.
export function getItemCornerBadge(itemId, slot, modifiers) {
  if (!itemId) return null;
  if (CROWN_OF_AVARICE_IDS.has(itemId)) {
    const special = modifiers?.special;
    return special != null ? formatCoinsShorthand(special) : null;
  }
  const tierIndex = getVariantTierIndexForId(itemId, slot);
  return tierIndex != null ? `T${tierIndex}` : null;
}

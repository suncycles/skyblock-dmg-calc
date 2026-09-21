// The player's Defense stat. No panel, tooltip or breakdown line shows it, because exactly one
// thing in this calculator reads it: the Ankylosaurus pet's Armored Tank perk, whose real lore is
// "Gain {0}% of your Defense as Strength. (Max +500)". See lib/petData.js's
// computeAnkylosaurusStrength for the conversion, which comes from the pet's own petnums numbers.
//
// Four sources are modelled: armor, Mining Level, God Potion, and the Unlimited Fortitude
// attribute. Equipment (cloak/belt/necklace/gloves) and accessories carry real Defense too but are
// not counted; add their slots to computeArmorDefense if that changes.
import { ARMOR_SLOTS } from './armorSlots';
import { computeItemStatTotals } from './itemStatTotals';
import { computeMiningDefenseBonus } from './playerStats';
import { petItemStatContext } from './petData';

// God Potion's own Defense contribution while it's active.
export const GOD_POTION_DEFENSE = 66;

// "Unlimited Fortitude", the End Stone Protector shard's ability (lib/attributes.js's `fortitude`):
// +0.2% Defense per level, applied to the base total rather than to any one source.
export const UNLIMITED_FORTITUDE_RATE = 0.2;

// Armor-only Defense, through the same per-item pipeline every other stat uses. Non-dungeon totals:
// nothing downstream of this is Catacombs-scaled, and the Dungeon toggle isn't in scope here.
export async function computeArmorDefense(loadout, itemData, ctx = {}) {
  const totals = await Promise.all(
    ARMOR_SLOTS.map((slot) =>
      loadout?.[slot] ? computeItemStatTotals(loadout[slot].item, loadout[slot].modifiers, itemData, ctx) : null,
    ),
  );
  return totals.reduce((sum, t) => sum + (t?.defense?.nonDungeonStarred || 0), 0);
}

// Everything but the armor, which each caller supplies from wherever it already has it -
// collectDamageSources reuses the per-item totals its own gear loop just computed rather than
// recomputing all four pieces, which would be a third more stat-total work on every Optimizer
// candidate.
export function combinePlayerDefense(armorDefense, playerStats, attributes, godPotionActive) {
  const base =
    (armorDefense || 0) + computeMiningDefenseBonus(playerStats?.miningLevel) + (godPotionActive ? GOD_POTION_DEFENSE : 0);
  const fortitude = UNLIMITED_FORTITUDE_RATE * (attributes?.fortitude || 0);
  return base * (1 + fortitude / 100);
}

// The whole number in one call, for the callers that don't already have armor totals on hand (the
// pet tooltips). Async only because armor stat totals are.
export async function computePlayerDefense(loadout, itemData, playerStats, attributes, godPotionActive) {
  const armorDefense = await computeArmorDefense(loadout, itemData, {
    catacombsLevel: playerStats?.catacombsLevel,
    tamingLevel: playerStats?.tamingLevel,
    wolfSlayerLevel: playerStats?.wolfSlayerLevel,
    generalsMedallionDigits: playerStats?.generalsMedallionDigits,
    ...petItemStatContext(loadout?.pet, itemData),
  });
  return combinePlayerDefense(armorDefense, playerStats, attributes, godPotionActive);
}

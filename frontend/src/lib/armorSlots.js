// Maps the 4 armor slots to their NEU-REPO category strings (see
// worker/src/data/armor.json — each item's `category` is one of these,
// dungeon-upgraded pieces carrying a "DUNGEON " prefix rather than a
// distinct slot). Mirrors lib/specialWeapons.js's small config-table shape.

export const ARMOR_SLOTS = ['helmet', 'chestplate', 'leggings', 'boots'];

export const ARMOR_SLOT_LABELS = {
  helmet: 'Helmet',
  chestplate: 'Chestplate',
  leggings: 'Leggings',
  boots: 'Boots',
};

const ARMOR_SLOT_CATEGORIES = {
  helmet: ['HELMET', 'DUNGEON HELMET'],
  chestplate: ['CHESTPLATE', 'DUNGEON CHESTPLATE'],
  leggings: ['LEGGINGS', 'DUNGEON LEGGINGS'],
  boots: ['BOOTS', 'DUNGEON BOOTS'],
};

export function itemsForArmorSlot(armorList, slot) {
  const categories = ARMOR_SLOT_CATEGORIES[slot] || [];
  return (armorList || []).filter((item) => categories.includes(item.category));
}

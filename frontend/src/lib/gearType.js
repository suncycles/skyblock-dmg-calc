// Classifies an item's NEU-REPO `category` into weapon, armor, or equipment (Necklace/Cloak/Belt/Gloves).
const ARMOR_CATEGORY_SUFFIXES = ['HELMET', 'CHESTPLATE', 'LEGGINGS', 'BOOTS'];
const EQUIPMENT_CATEGORY_SUFFIXES = ['NECKLACE', 'CLOAK', 'BELT', 'GLOVES'];

export function getGearType(category) {
  const upper = (category || '').toUpperCase();
  if (EQUIPMENT_CATEGORY_SUFFIXES.some((s) => upper.endsWith(s))) return 'equipment';
  if (ARMOR_CATEGORY_SUFFIXES.some((s) => upper.endsWith(s))) return 'armor';
  return 'weapon';
}

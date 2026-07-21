// Classifies an item's NEU-REPO `category` into which of the 3 gear
// families it belongs to — weapon, armor, or equipment (Necklace/Cloak/
// Belt/Gloves). Several mechanics are eligible on some families but not
// others in the real game (Potato Books/Art of War — see lib/books.js),
// so this is the single source of truth every one of those checks keys
// off, derived straight from the item's own category rather than
// threading a separate "which slot is this" flag everywhere.
const ARMOR_CATEGORY_SUFFIXES = ['HELMET', 'CHESTPLATE', 'LEGGINGS', 'BOOTS'];
const EQUIPMENT_CATEGORY_SUFFIXES = ['NECKLACE', 'CLOAK', 'BELT', 'GLOVES'];

export function getGearType(category) {
  const upper = (category || '').toUpperCase();
  if (EQUIPMENT_CATEGORY_SUFFIXES.some((s) => upper.endsWith(s))) return 'equipment';
  if (ARMOR_CATEGORY_SUFFIXES.some((s) => upper.endsWith(s))) return 'armor';
  return 'weapon';
}

// Maps the 4 equipment slots to their NEU-REPO category strings (see
// worker/src/data/equipment.json — each item's `category` is one of
// these, dungeon-upgraded pieces carrying a "DUNGEON " prefix rather than
// a distinct slot). Hypixel's "Equipment" is a second, parallel gear set
// alongside armor (Necklace/Cloak/Belt/Gloves), not armor variants —
// mirrors lib/armorSlots.js's shape exactly since both behave the same
// way (enchant/reforge/gemstone/book-eligible real gear pieces).

export const EQUIPMENT_SLOTS = ['necklace', 'cloak', 'belt', 'gloves'];

export const EQUIPMENT_SLOT_LABELS = {
  necklace: 'Necklace',
  cloak: 'Cloak',
  belt: 'Belt',
  gloves: 'Gloves',
};

const EQUIPMENT_SLOT_CATEGORIES = {
  necklace: ['NECKLACE', 'DUNGEON NECKLACE'],
  cloak: ['CLOAK', 'DUNGEON CLOAK'],
  belt: ['BELT', 'DUNGEON BELT'],
  gloves: ['GLOVES', 'DUNGEON GLOVES'],
};

export function itemsForEquipmentSlot(equipmentList, slot) {
  const categories = EQUIPMENT_SLOT_CATEGORIES[slot] || [];
  return (equipmentList || []).filter((item) => categories.includes(item.category));
}

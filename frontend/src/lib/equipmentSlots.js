// Maps the 4 equipment slots (Necklace/Cloak/Belt/Gloves) to their NEU-REPO category strings, dungeon-upgraded pieces carrying a "DUNGEON " prefix.

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
  gloves: ['GLOVES', 'DUNGEON GLOVES', 'BRACELET'], // Bracelet items (Molten Bracelet, etc.) share the Gloves slot under a different tag word
};

export function itemsForEquipmentSlot(equipmentList, slot) {
  const categories = EQUIPMENT_SLOT_CATEGORIES[slot] || [];
  return (equipmentList || []).filter((item) => categories.includes(item.category));
}

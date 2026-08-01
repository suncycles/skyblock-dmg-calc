/* Reforge stat tables come from NEU-REPO's constants/reforges.json (the ~50 "free" reforges
   the blacksmith can roll) and constants/reforgestones.json (the ~81 that need a specific
   reforge-stone item) — worker/src/index.js keeps these as two separate
   {[reforgeName]: {itemTypes, requiredRarities, reforgeStats}} maps, matching the real game's
   UI split.

   itemTypes is usually a plain string, but the two sources spell the same weapon type
   differently (reforges.json's "SWORD/ROD" vs reforgestones.json's "SWORD") —
   getApplicableReforges checks every spelling. A few item-exclusive reforges use
   {internalName: [...ids]} or {itemId: [...]} instead, matched against item.id directly
   rather than item.material (material is just this project's icon-fallback field, shared by
   many unrelated weapons, so matching on it produces false positives). */

// Maps our weapons/armor/equipment `category` values to every reforge-table itemTypes spelling that should match it.
const CATEGORY_TO_REFORGE_TYPES = {
  SWORD: ['SWORD/ROD', 'SWORD'],
  'DUNGEON SWORD': ['SWORD/ROD', 'SWORD'],
  'DUNGEON LONGSWORD': ['SWORD/ROD', 'SWORD'],
  'THE WYLD SWORD': ['SWORD/ROD', 'SWORD'],
  WAND: ['SWORD/ROD', 'SWORD'], // Wands/Staffs reforge off the same table as swords in the real game
  BOW: ['BOW'],
  'DUNGEON BOW': ['BOW'],
  HELMET: ['ARMOR', 'HELMET'],
  'DUNGEON HELMET': ['ARMOR', 'HELMET'],
  CHESTPLATE: ['ARMOR', 'CHESTPLATE'],
  'DUNGEON CHESTPLATE': ['ARMOR', 'CHESTPLATE'],
  LEGGINGS: ['ARMOR'],
  'DUNGEON LEGGINGS': ['ARMOR'],
  BOOTS: ['ARMOR'],
  'DUNGEON BOOTS': ['ARMOR'],
  NECKLACE: ['EQUIPMENT'],
  'DUNGEON NECKLACE': ['EQUIPMENT'],
  CLOAK: ['EQUIPMENT', 'CLOAK'],
  'DUNGEON CLOAK': ['EQUIPMENT', 'CLOAK'],
  BELT: ['EQUIPMENT', 'BELT'],
  'DUNGEON BELT': ['EQUIPMENT', 'BELT'],
  GLOVES: ['EQUIPMENT'],
  'DUNGEON GLOVES': ['EQUIPMENT'],
  // Same Gloves slot under a different tag word (Molten Bracelet, Luminous Bracelet, etc.).
  BRACELET: ['EQUIPMENT'],
};

// Stat-line label + color a reforge bonus renders with when annotating an item's tooltip.
export const STAT_LABELS = {
  damage: { label: 'Damage', color: 'c', isPercent: false },
  strength: { label: 'Strength', color: 'c', isPercent: false },
  crit_chance: { label: 'Crit Chance', color: '9', isPercent: true },
  crit_damage: { label: 'Crit Damage', color: '9', isPercent: true },
  intelligence: { label: 'Intelligence', color: 'b', isPercent: false },
  health: { label: 'Health', color: 'c', isPercent: false },
  defense: { label: 'Defense', color: 'a', isPercent: false },
  true_defense: { label: 'True Defense', color: 'f', isPercent: false },
  ferocity: { label: 'Ferocity', color: 'c', isPercent: false },
  magic_find: { label: 'Magic Find', color: 'a', isPercent: false },
  speed: { label: 'Speed', color: 'f', isPercent: false },
  // Real item lore prefixes this line "Bonus Attack Speed:" (not just "Attack Speed") — matters
  // for sumStatFromTooltipLines' anchored `^label:` match against real tooltip text. The
  // 'Bonus Attack Speed' -> 'Attack Speed' alias in lib/damageSymbols.js still highlights it
  // correctly wherever it's displayed.
  bonus_attack_speed: { label: 'Bonus Attack Speed', color: 'e', isPercent: true },
  ability_damage: { label: 'Ability Damage', color: 'a', isPercent: true },
};

export function formatStatValue(statKey, value) {
  const meta = STAT_LABELS[statKey];
  const sign = value >= 0 ? '+' : '';
  return meta && meta.isPercent ? `${sign}${value}%` : `${sign}${value}`;
}

// Reforges applicable to a given weapon: matching itemTypes and requiring a rarity the item actually has.
export function getApplicableReforges(reforges, item) {
  if (!reforges || !item) return [];
  const categoryTypes = CATEGORY_TO_REFORGE_TYPES[item.category] || [];
  const rarity = (item.tier || '').toUpperCase();
  // No recognized rarity means treat as not-reforgeable rather than showing every reforge as applicable.
  if (!rarity) return [];

  return Object.entries(reforges)
    .filter(([, r]) => {
      const types = r.itemTypes;
      let matchesType;
      if (typeof types === 'string') {
        matchesType = categoryTypes.includes(types);
      } else if (types && typeof types === 'object') {
        const ids = types.internalName || types.itemId || [];
        matchesType = ids.includes(item.id);
      } else {
        matchesType = false;
      }
      if (!matchesType) return false;
      if (!Array.isArray(r.requiredRarities) || !r.requiredRarities.includes(rarity)) return false;
      return true;
    })
    .map(([name, r]) => ({ name, ...r }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// A reforge's stat bonus at a given item rarity, or null if not in its table.
export function getReforgeStatBonus(reforge, tier) {
  if (!reforge || !reforge.reforgeStats) return null;
  return reforge.reforgeStats[(tier || '').toUpperCase()] || null;
}

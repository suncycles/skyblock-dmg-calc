/* Reforge stat tables come from NEU-REPO's constants/reforges.json (the
   ~50 "free" reforges any anvil can roll) and constants/reforgestones.json
   (the ~81 that need a specific reforge-stone item), merged server-side by
   worker/src/index.js into one { [reforgeName]: {itemTypes,
   requiredRarities, reforgeStats} } map — see that file for why the merge
   is safe (no name collides between the two sources).

   itemTypes is usually a plain string like "SWORD/ROD" or "BOW", but for a
   handful of item-exclusive reforges (e.g. "Entropy Suppressor", only for
   the Blaze Slayer daggers) it's instead {internalName: [...ids]} or
   {itemId: [...minecraft ids]} — both are handled in getApplicableReforges. */

// Maps our weapons.json `category` values to the reforge-table itemTypes
// they draw from. Every category also implicitly gets "EQUIPMENT" (the
// universal armor+weapon reforge pool) — added in getApplicableReforges
// rather than repeated here.
const CATEGORY_TO_REFORGE_TYPE = {
  SWORD: 'SWORD/ROD',
  'DUNGEON SWORD': 'SWORD/ROD',
  'DUNGEON LONGSWORD': 'SWORD/ROD',
  'THE WYLD SWORD': 'SWORD/ROD',
  WAND: 'SWORD/ROD', // Wands/Staffs reforge off the same table as swords in the real game
  BOW: 'BOW',
  'DUNGEON BOW': 'BOW',
};

// Stat-line label + color a reforge bonus should render with when
// annotating an item's tooltip — verified against this project's own
// bundled weapon/armor lore (Damage/Strength/Intelligence/Defense/
// Ferocity/Speed/Health) and real NEU-REPO item lore for the rest
// (Crit Chance/Crit Damage/True Defense/Magic Find/Ability Damage from
// reforge "reforgeAbility" description text, Attack Speed from Livid
// Dagger's own base stat line "§7Attack Speed: §e+50%").
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
  bonus_attack_speed: { label: 'Attack Speed', color: 'e', isPercent: true },
  ability_damage: { label: 'Ability Damage', color: 'a', isPercent: true },
};

export function formatStatValue(statKey, value) {
  const meta = STAT_LABELS[statKey];
  const sign = value >= 0 ? '+' : '';
  return meta && meta.isPercent ? `${sign}${value}%` : `${sign}${value}`;
}

// Reforges applicable to a given weapon: matching itemTypes (its category's
// table, or the universal EQUIPMENT pool, or an explicit item-id allowlist
// for item-exclusive reforges) and requiring a rarity the item actually has.
export function getApplicableReforges(reforges, item) {
  if (!reforges || !item) return [];
  const categoryType = CATEGORY_TO_REFORGE_TYPE[item.category];
  const rarity = (item.tier || '').toUpperCase();
  // No recognized rarity (e.g. quest-NPC items with tier: null, or
  // "SPECIAL" one-offs outside the normal common..mythic scale) means we
  // can't check requiredRarities membership at all — treat as
  // not-reforgeable rather than incorrectly showing every reforge as
  // applicable.
  if (!rarity) return [];
  const materialId = item.material ? `minecraft:${item.material.toLowerCase()}` : null;

  return Object.entries(reforges)
    .filter(([, r]) => {
      const types = r.itemTypes;
      let matchesType;
      if (typeof types === 'string') {
        matchesType = types === 'EQUIPMENT' || types === categoryType;
      } else if (types && typeof types === 'object') {
        const ids = types.internalName || types.itemId || [];
        matchesType = ids.includes(item.id) || (materialId && ids.includes(materialId));
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

// A reforge's stat bonus at a given item rarity, or null if that rarity
// isn't in its table (shouldn't happen for anything getApplicableReforges
// already filtered in, but callers may look up a stale/removed reforge).
export function getReforgeStatBonus(reforge, tier) {
  if (!reforge || !reforge.reforgeStats) return null;
  return reforge.reforgeStats[(tier || '').toUpperCase()] || null;
}

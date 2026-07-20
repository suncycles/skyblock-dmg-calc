/* Reforge stat tables come from NEU-REPO's constants/reforges.json (the
   ~50 "free" reforges the blacksmith NPC can roll) and constants/
   reforgestones.json (the ~81 that instead need a specific reforge-stone
   item applied, e.g. Dragon Claw -> "Fabled") — worker/src/index.js keeps
   these as two separate {[reforgeName]: {itemTypes, requiredRarities,
   reforgeStats}} maps (`reforges` and `reforgeStones`) rather than
   merging them, matching the real game's UI split; both have the same
   shape, so every helper here takes whichever map the caller wants
   filtered.

   itemTypes is usually a plain string, but the two sources don't agree on
   its exact spelling for the same weapon type: reforges.json uses
   "SWORD/ROD" (rods share the sword table), reforgestones.json just uses
   "SWORD" — getApplicableReforges checks a category against every
   spelling it might show up as, not one fixed string. For a handful of
   item-exclusive reforges (e.g. "Entropy Suppressor", only for the Blaze
   Slayer daggers) itemTypes is instead {internalName: [...ids]} — also
   handled there, matched against our own item.id.

   A few of these object-shaped restrictions use {itemId: [...]} instead
   (raw "minecraft:x" ids, e.g. "Fanged" -> ["minecraft:iron_sword"]).
   That's deliberately NOT matched against item.material: material is
   just this project's icon-fallback field (which vanilla block/item icon
   to show when there's no bespoke texture) and is shared by dozens of
   unrelated named legendary/epic weapons — matching on it produced false
   positives (e.g. every IRON_SWORD-icon weapon "qualifying" for a reforge
   meant for one specific unmodified vanilla Iron Sword). None of our
   catalogued weapons are actually that plain vanilla item, so itemId
   restrictions correctly resolve to zero matches here rather than being
   approximated. */

// Maps our weapons.json `category` values to every reforge-table itemTypes
// spelling that should match it. Every category also implicitly gets
// "EQUIPMENT" (the universal armor+weapon reforge pool) — added in
// getApplicableReforges rather than repeated here.
const CATEGORY_TO_REFORGE_TYPES = {
  SWORD: ['SWORD/ROD', 'SWORD'],
  'DUNGEON SWORD': ['SWORD/ROD', 'SWORD'],
  'DUNGEON LONGSWORD': ['SWORD/ROD', 'SWORD'],
  'THE WYLD SWORD': ['SWORD/ROD', 'SWORD'],
  WAND: ['SWORD/ROD', 'SWORD'], // Wands/Staffs reforge off the same table as swords in the real game
  BOW: ['BOW'],
  'DUNGEON BOW': ['BOW'],
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
  const categoryTypes = CATEGORY_TO_REFORGE_TYPES[item.category] || [];
  const rarity = (item.tier || '').toUpperCase();
  // No recognized rarity (e.g. quest-NPC items with tier: null, or
  // "SPECIAL" one-offs outside the normal common..mythic scale) means we
  // can't check requiredRarities membership at all — treat as
  // not-reforgeable rather than incorrectly showing every reforge as
  // applicable.
  if (!rarity) return [];

  return Object.entries(reforges)
    .filter(([, r]) => {
      const types = r.itemTypes;
      let matchesType;
      if (typeof types === 'string') {
        matchesType = types === 'EQUIPMENT' || categoryTypes.includes(types);
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

// A reforge's stat bonus at a given item rarity, or null if that rarity
// isn't in its table (shouldn't happen for anything getApplicableReforges
// already filtered in, but callers may look up a stale/removed reforge).
export function getReforgeStatBonus(reforge, tier) {
  if (!reforge || !reforge.reforgeStats) return null;
  return reforge.reforgeStats[(tier || '').toUpperCase()] || null;
}

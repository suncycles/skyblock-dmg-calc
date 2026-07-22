// Blaze Slayer's 5 armor sets (Aurora/Crimson/Fervor/Hollow/Terror), each
// dropping in 5 power tiers via an RNG prefix — real stat progression
// verified directly against worker/src/data/armor.json: base < Hot <
// Burning < Fiery < Infernal (e.g. Crimson Helmet Health: 160 < 202 < 254
// < 320 < 403). That's 5 families x 5 tiers x 4 pieces = 100 armor.json
// entries, which floods the per-slot picker grid — grouped here into one
// family tile per slot; picking a family opens a tier sub-picker instead.
export const ARMOR_VARIANT_FAMILIES = ['AURORA', 'CRIMSON', 'FERVOR', 'HOLLOW', 'TERROR'];

// Ascending power order, confirmed via stat comparison (not just id
// naming) — "Burning" looks like it should outrank "Fiery" by name alone
// but doesn't.
export const VARIANT_TIERS = [
  { prefix: '', label: 'Basic' },
  { prefix: 'HOT_', label: 'Hot' },
  { prefix: 'BURNING_', label: 'Burning' },
  { prefix: 'FIERY_', label: 'Fiery' },
  { prefix: 'INFERNAL_', label: 'Infernal' },
];

const PIECE_SUFFIX = { helmet: 'HELMET', chestplate: 'CHESTPLATE', leggings: 'LEGGINGS', boots: 'BOOTS' };

function titleCase(word) {
  return word.charAt(0) + word.slice(1).toLowerCase();
}

function familyFromId(id, pieceSuffix) {
  for (const family of ARMOR_VARIANT_FAMILIES) {
    for (const { prefix } of VARIANT_TIERS) {
      if (id === `${prefix}${family}_${pieceSuffix}`) return family;
    }
  }
  return null;
}

// Collapses every item belonging to one of the 5 variant families into a
// single family pseudo-entry (isVariantFamily: true, using the Basic
// tier's own icon/material as the tile's representative art); everything
// else in the list passes through unchanged.
export function groupArmorVariants(items, slot) {
  const pieceSuffix = PIECE_SUFFIX[slot];
  if (!pieceSuffix) return items;

  const seenFamilies = new Set();
  const result = [];
  for (const item of items) {
    const family = familyFromId(item.id, pieceSuffix);
    if (!family) {
      result.push(item);
      continue;
    }
    if (seenFamilies.has(family)) continue;
    seenFamilies.add(family);
    const basic = items.find((i) => i.id === `${family}_${pieceSuffix}`) || item;
    result.push({
      id: `VARIANT_FAMILY_${family}_${pieceSuffix}`,
      name: `${titleCase(family)} ${titleCase(pieceSuffix)}`,
      material: basic.material,
      tier: basic.tier,
      isVariantFamily: true,
      family,
    });
  }
  return result;
}

// The 5 real armor.json entries (one per tier) for a given family+slot, in
// ascending power order — null for any tier that's somehow missing.
export function getVariantTierItems(armorList, family, slot) {
  const pieceSuffix = PIECE_SUFFIX[slot];
  if (!pieceSuffix) return [];
  return VARIANT_TIERS.map(({ prefix, label }) => {
    const id = `${prefix}${family}_${pieceSuffix}`;
    const item = (armorList || []).find((it) => it.id === id);
    return item ? { ...item, tierLabel: label } : null;
  });
}

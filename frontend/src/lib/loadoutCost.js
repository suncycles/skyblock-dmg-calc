// "Setup Cost": real coin cost to build the CURRENT loadout from scratch, broken down by section
// — distinct from lib/pricing.js's lookupCandidateCost, which prices one hypothetical Optimizer
// swap. User-triggered (a button on the Landing page), not recomputed live on every loadout edit.

import { ARMOR_SLOTS } from './armorSlots';
import { EQUIPMENT_SLOTS } from './equipmentSlots';
import { priceOf, masterStarCost } from './pricing';

// Sums an equipped gear slot's base item + every priced modifier currently applied to it (reforge,
// stars, gemstones, ultimate/normal enchants, Recombobulator) — "what it costs to replicate this
// exact piece", not just the bare item.
function gearSlotCost(slot, itemPrices, reforgeCosts, starCosts, recombobulatorCost) {
  if (!slot?.item) return null;
  const { item, modifiers } = slot;
  let total = 0;
  let known = false;
  const add = (price) => {
    if (price != null) {
      total += price;
      known = true;
    }
  };

  add(priceOf(itemPrices, item.id));
  if (modifiers.reforge) add(priceOf(reforgeCosts, modifiers.reforge));
  if (modifiers.stars > 0) add(priceOf(starCosts, `${item.id}_${modifiers.stars}`));
  if (modifiers.masterStars > 0) add(masterStarCost(modifiers.masterStars, itemPrices));
  if (modifiers.recombobulated) add(recombobulatorCost > 0 ? recombobulatorCost : null);
  for (const g of modifiers.gemstones || []) {
    if (g) add(priceOf(itemPrices, `${g.tier.toUpperCase()}_${g.gem}_GEM`));
  }
  if (modifiers.ultimateEnchantment) {
    add(priceOf(itemPrices, `ENCHANTMENT_${modifiers.ultimateEnchantment.id.toUpperCase()}_${modifiers.ultimateEnchantment.level}`));
  }
  for (const e of modifiers.hexEnchantments || []) {
    add(priceOf(itemPrices, `ENCHANTMENT_${e.id.toUpperCase()}_${e.level}`));
  }

  return known ? total : null;
}

function petCost(pet, petCosts, itemPrices) {
  if (!pet?.item) return null;
  let total = 0;
  let known = false;
  const base = priceOf(petCosts, pet.item.petId);
  if (base != null) {
    total += base;
    known = true;
  }
  const petItemPrice = pet.modifiers?.petItem ? priceOf(itemPrices, pet.modifiers.petItem) : null;
  if (petItemPrice != null) {
    total += petItemPrice;
    known = true;
  }
  return known ? total : null;
}

// Real market price of every accessory the account actually owns (lib/accessoryOptimizer.js's
// ownedAccessories, from a Hypixel import or an Optimizer "equip" pretending one was bought) — the
// real spend behind the current Magical Power total. null (not 0) when there's no import on file
// at all, vs. a real 0 for an imported account that happens to own nothing priced yet.
function magicalPowerCost(accessorySlot, itemPrices) {
  const owned = accessorySlot?.modifiers?.ownedAccessories;
  if (!owned) return null;
  let total = 0;
  let known = false;
  for (const o of owned) {
    const price = priceOf(itemPrices, o.id);
    if (price != null) {
      total += price;
      known = true;
    }
  }
  return known ? total : owned.length === 0 ? 0 : null;
}

// Real shard cost to reach each attribute's CURRENT level (attributeCostsByLevel[id][level-1] is
// the cumulative cost from 0), summed across every attribute above level 0.
function attributesCost(attributes, attributeCostsByLevel) {
  let total = 0;
  let known = false;
  for (const [id, level] of Object.entries(attributes || {})) {
    if (!level) continue;
    const cost = attributeCostsByLevel?.[id]?.[level - 1];
    if (cost != null) {
      total += cost;
      known = true;
    }
  }
  return known ? total : null;
}

export const LOADOUT_COST_SECTIONS = [
  { key: 'magicalPower', label: 'Magical Power' },
  { key: 'helmet', label: 'Helmet' },
  { key: 'chestplate', label: 'Chestplate' },
  { key: 'leggings', label: 'Leggings' },
  { key: 'boots', label: 'Boots' },
  { key: 'weapon', label: 'Weapon' },
  { key: 'pet', label: 'Pet' },
  { key: 'necklace', label: 'Necklace' },
  { key: 'cloak', label: 'Cloak' },
  { key: 'belt', label: 'Belt' },
  { key: 'gloves', label: 'Bracelet' },
  { key: 'attributes', label: 'Attributes' },
];

// { breakdown: {sectionKey: number|null}, total, hasUnknown } — null per-section means "no priced
// items in that section" (empty slot, or nothing in it has a real market price yet), distinct from
// a real 0.
export function computeLoadoutCostBreakdown(loadout, attributes, itemData) {
  const costs = itemData?.costs || {};
  const { itemPrices = {}, reforgeCosts = {}, recombobulatorCost = null, petCosts = {}, starCosts = {}, attributeCostsByLevel = {} } = costs;

  const breakdown = {};
  for (const slot of [...ARMOR_SLOTS, ...EQUIPMENT_SLOTS, 'weapon']) {
    breakdown[slot] = gearSlotCost(loadout[slot], itemPrices, reforgeCosts, starCosts, recombobulatorCost);
  }
  breakdown.pet = petCost(loadout.pet, petCosts, itemPrices);
  breakdown.magicalPower = magicalPowerCost(loadout.accessory, itemPrices);
  breakdown.attributes = attributesCost(attributes, attributeCostsByLevel);

  let total = 0;
  let hasUnknown = false;
  for (const value of Object.values(breakdown)) {
    if (typeof value === 'number') total += value;
    else hasUnknown = true;
  }

  return { breakdown, total, hasUnknown };
}

// Real coin cost per Optimizer candidate — a thin lookup against the Worker-precomputed
// `itemData.costs` bundle (see worker/src/index.js's resolveCosts), not a client-side computation.
// Coin cost is loadout-independent (a Dragon Claw costs the same no matter whose item it reforges),
// so the actual coin math — real prices × Essence/material sums for Stars, etc. — happens once
// server-side per price-refresh cycle; this module just matches a candidate's category to the
// right precomputed key. Returns a number when priceable, or `null` when no real cost source
// exists (the caller — lib/optimizer.js's withCost — turns `null` into the `'?'` sentinel).

function priceOf(map, id) {
  if (id == null || !map) return null;
  const price = map[id];
  return typeof price === 'number' && price > 0 ? price : null;
}

// The 12 real Perfect Gemstone types. accessoryFamilies.json's perfect_gemstone_rarity_upgrades
// only tracks how MANY Perfect Gemstones a rarity jump needs, not which specific type — priced at
// the cheapest real type as a floor/lower-bound (a real market price, not a guessed mechanic)
// rather than picking one arbitrarily. Used by accessoryOptimizer.js's gemstone-upgrade candidates.
const PERFECT_GEMSTONE_IDS = [
  'PERFECT_AMBER_GEM',
  'PERFECT_AMETHYST_GEM',
  'PERFECT_AQUAMARINE_GEM',
  'PERFECT_CITRINE_GEM',
  'PERFECT_JADE_GEM',
  'PERFECT_JASPER_GEM',
  'PERFECT_ONYX_GEM',
  'PERFECT_OPAL_GEM',
  'PERFECT_PERIDOT_GEM',
  'PERFECT_RUBY_GEM',
  'PERFECT_SAPPHIRE_GEM',
  'PERFECT_TOPAZ_GEM',
];

export function cheapestPerfectGemstonePrice(itemData) {
  const itemPrices = itemData?.costs?.itemPrices || {};
  const prices = PERFECT_GEMSTONE_IDS.map((id) => priceOf(itemPrices, id)).filter((p) => p != null);
  return prices.length > 0 ? Math.min(...prices) : null;
}

function findStep(apply, type) {
  return (apply || []).find((s) => s.type === type);
}

export function lookupCandidateCost(result, itemData) {
  const costs = itemData?.costs;
  if (!costs) return null;
  const { itemPrices = {}, reforgeCosts = {}, recombobulatorCost = null, petCosts = {}, starCosts = {} } = costs;

  // Crown of Avarice's "Coins Consumed" candidates: cost is the item's own real market price
  // (buying a bare Crown) PLUS the Coins Consumed threshold (1 coin consumed = 1 coin spent,
  // user-confirmed) — a player has to acquire the crown itself before feeding coins into it. Must
  // be checked before the general Armor-category branch below since Crown candidates carry
  // category: 'Armor' too. David's Cloak's `special` is a real Strength bonus value, not a coin
  // amount — deliberately excluded (stays unpriced) rather than misread as coins.
  if (result.itemId === 'CROWN_OF_AVARICE' && result.special != null) {
    const basePrice = priceOf(itemPrices, 'CROWN_OF_AVARICE');
    return (basePrice || 0) + result.special;
  }

  switch (result.category) {
    case 'Weapon':
    case 'Armor':
    case 'Equipment': {
      const step = findStep(result.apply, 'selectItem');
      return step ? priceOf(itemPrices, step.item.id) : null;
    }
    case 'Pet': {
      const step = findStep(result.apply, 'selectItem');
      return step ? priceOf(petCosts, step.item.petId) : null;
    }
    case 'Full Set': {
      const steps = (result.apply || []).filter((s) => s.type === 'selectItem');
      if (steps.length === 0) return null;
      let total = 0;
      for (const step of steps) {
        const price = priceOf(itemPrices, step.item.id);
        if (price == null) return null; // any unpriced piece makes the whole set's cost unknown
        total += price;
      }
      return total;
    }
    case 'Enchant':
    case 'Ultimate Enchant': {
      const step = findStep(result.apply, 'applyEnchant');
      return step ? priceOf(itemPrices, `ENCHANTMENT_${step.id.toUpperCase()}_${step.level}`) : null;
    }
    case 'Power Stone': {
      const step = findStep(result.apply, 'selectItem');
      // `item.id` here is the abstract Power's own id (e.g. "STRONG"), not a real catalog item —
      // evaluatePowerStoneCandidates already stashes the real physical stone's id as `iconId`
      // (for icon rendering), so reuse that for pricing rather than adding a new field.
      return step ? priceOf(itemPrices, step.item.iconId) : null;
    }
    case 'Reforge': {
      const step = findStep(result.apply, 'applyReforge');
      // Free/blacksmith-rolled reforges (Pure, Fierce, Blended, Menacing) have no physical stone
      // and so no entry in reforgeCosts — correctly resolves to null, not a guessed fee.
      return step ? priceOf(reforgeCosts, step.name) : null;
    }
    case 'Recombobulator':
      return recombobulatorCost || null;
    case 'Pet Item': {
      const step = findStep(result.apply, 'setPetItem');
      return step ? priceOf(itemPrices, step.petItemId) : null;
    }
    case 'Stars': {
      const step = findStep(result.apply, 'setStarCount');
      if (!step || result.itemId == null) return null;
      return priceOf(starCosts, `${result.itemId}_${step.count}`);
    }
    case 'Gemstone': {
      const step = findStep(result.apply, 'setGemstone');
      if (!step) return null;
      return priceOf(itemPrices, `${step.tier.toUpperCase()}_${step.gem}_GEM`);
    }
    default:
      return null;
  }
}

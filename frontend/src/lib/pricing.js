// Real coin cost per Optimizer candidate — a thin lookup against the Worker-precomputed
// `itemData.costs` bundle (see worker/src/index.js's resolveCosts), not a client-side computation.
// Coin cost is loadout-independent (a Dragon Claw costs the same no matter whose item it reforges),
// so the actual coin math — real prices × Essence/material sums for Stars, etc. — happens once
// server-side per price-refresh cycle; this module just matches a candidate's category to the
// right precomputed key. Returns a number when priceable, or `null` when no real cost source
// exists (the caller — lib/optimizer.js's withCost — turns `null` into the `'?'` sentinel).

export function priceOf(map, id) {
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

// Master Star levels 1-5 each consume one specific real item (user-confirmed source:
// pricesV2.json) — a flat cost, the same for every piece of gear, unlike base Stars' per-item
// Essence costs. Cumulative cost to reach `count` Master Stars is the sum of levels 1..count.
const MASTER_STAR_ITEM_IDS = ['FIRST_MASTER_STAR', 'SECOND_MASTER_STAR', 'THIRD_MASTER_STAR', 'FOURTH_MASTER_STAR', 'FIFTH_MASTER_STAR'];

export function masterStarCost(count, itemPrices) {
  if (!count) return null;
  let total = 0;
  for (let i = 0; i < count; i++) {
    const price = priceOf(itemPrices, MASTER_STAR_ITEM_IDS[i]);
    if (price == null) return null;
    total += price;
  }
  return total;
}

function findStep(apply, type) {
  return (apply || []).find((s) => s.type === type);
}

export function lookupCandidateCost(result, itemData) {
  const costs = itemData?.costs;
  if (!costs) return null;
  const { itemPrices = {}, reforgeCosts = {}, recombobulatorCost = null, petCosts = {}, starCosts = {}, attributeCosts = {} } = costs;

  // Crown of Avarice's "Coins Consumed" and Midas Sword/Staff's "Price Paid at Dark Auction" are
  // both a literal count of coins actually spent/fed into the item (gone, not held) — cost is the
  // item's own real market price (buying it bare) PLUS that counter, 1 coin counted = 1 coin spent
  // (user-confirmed), since a player has to acquire the item itself before investing coins into it.
  // Must be checked before the general Weapon/Armor-category branch below since these candidates
  // carry those categories too. David's Cloak's `special` is a real Strength bonus value and
  // Daedalus Blade's is a Bestiary Tier count — neither is a coin amount, deliberately excluded
  // (stays unpriced) rather than misread as coins. Emerald Blade's "Coins in Purse" is a live
  // balance check, not coins spent (you keep them) — not part of this set for that reason, and not
  // currently offered as an Optimizer candidate anyway.
  const COIN_DENOMINATED_SPECIAL_IDS = new Set(['CROWN_OF_AVARICE', 'MIDAS_SWORD', 'STARRED_MIDAS_SWORD', 'MIDAS_STAFF', 'STARRED_MIDAS_STAFF']);
  if (COIN_DENOMINATED_SPECIAL_IDS.has(result.itemId) && result.special != null) {
    const basePrice = priceOf(itemPrices, result.itemId);
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
      // (for icon rendering), so reuse that for pricing rather than adding a new field. The price
      // feed's entry for that id is a single unit, but unlocking the Power actually takes 9 of it
      // (user-confirmed) — the real cost is 9x the per-unit market price.
      if (!step) return null;
      const unitPrice = priceOf(itemPrices, step.item.iconId);
      return unitPrice != null ? unitPrice * 9 : null;
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
    case 'Master Stars': {
      const step = findStep(result.apply, 'setMasterStarCount');
      return step ? masterStarCost(step.count, itemPrices) : null;
    }
    case 'Gemstone': {
      const step = findStep(result.apply, 'setGemstone');
      if (!step) return null;
      const gemPrice = priceOf(itemPrices, `${step.tier.toUpperCase()}_${step.gem}_GEM`);
      if (gemPrice == null) return null;
      if (result.gemstoneOpen) return gemPrice;
      // Slot isn't unlocked yet — a real one-time unlock fee (coins + specific gem items) is
      // required before the gem can even be socketed, so it has to be part of a fair cost
      // comparison against an already-open slot. No real cost data for this specific slot (rather
      // than a confirmed-free slot) leaves the whole thing unpriced instead of silently
      // understating it as gem-price-only, same "any unpriced piece makes the total unknown"
      // treatment Full Set gives a missing item price.
      return result.gemstoneUnlockCost != null ? gemPrice + result.gemstoneUnlockCost : null;
    }
    case 'Attribute': {
      const step = findStep(result.apply, 'setAttributeLevel');
      return step ? priceOf(attributeCosts, step.id) : null;
    }
    default:
      return null;
  }
}

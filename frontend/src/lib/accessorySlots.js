// Accessory Bag slots. One thing reads this: the Optimizer's accessory recommendations. A brand-new
// accessory needs a free slot, and a bag with none makes that "cheap" accessory cost whatever the
// next slot costs - which is why a 50k accessory can be a worse buy than it looks.
//
// Slot sources, and what each costs:
//   - 9 base slots, free, everyone has them.
//   - Redstone Dust collection, 6 slots per tier to 48. No coins, so never offered as a purchase -
//     but the player's REAL collection decides how many of those slots they already have.
//   - Redstone Miner (+4) and the Community Center account upgrades (+12): no coins, and the
//     Hypixel API exposes neither, so they're counted as already owned.
//   - Jacobus: +2 slots per purchase, 99 purchases, rising 1.5M -> 20M.
//   - The Accessory Size attribute (Hideonring Shard): +1 slot per level, 10 levels, priced from the
//     live shard feed through the same attributeCostsByLevel the Optimizer already uses.
// Numbers from the Accessory Bag and Jacobus wiki pages.

export const BASE_SLOTS = 9;

// The Redstone Dust collection ladder: tiers 2-9, six slots each, 48 at the top.
const REDSTONE_COLLECTION_TIERS = [250, 750, 1500, 2500, 5000, 25000, 100000, 250000];
export const SLOTS_PER_REDSTONE_TIER = 6;

export function redstoneCollectionSlots(collection) {
  return REDSTONE_COLLECTION_TIERS.filter((tier) => (collection || 0) >= tier).length * SLOTS_PER_REDSTONE_TIER;
}

// Redstone Miner + Community Center. Free, unreadable, assumed owned - see the header.
export const ASSUMED_FREE_SLOTS = 16;

export const JACOBUS_SLOTS_PER_PURCHASE = 2;
export const JACOBUS_MAX_PURCHASES = 99;

// Cost of ONE purchase (+2 slots), by how many have been bought before it. 1.7615b for all 99.
const JACOBUS_COST_BANDS = [
  { throughPurchase: 1, coins: 1_500_000 },
  { throughPurchase: 5, coins: 5_000_000 },
  { throughPurchase: 10, coins: 8_000_000 },
  { throughPurchase: 20, coins: 12_000_000 },
  { throughPurchase: JACOBUS_MAX_PURCHASES, coins: 20_000_000 },
];

export function jacobusPurchaseCost(purchaseNumber) {
  if (!(purchaseNumber >= 1) || purchaseNumber > JACOBUS_MAX_PURCHASES) return null;
  return JACOBUS_COST_BANDS.find((band) => purchaseNumber <= band.throughPurchase).coins;
}

// The Accessory Size attribute: +1 slot per level (lib/attributes.js's `accessory_size`).
export const ACCESSORY_SIZE_MAX_LEVEL = 10;
export const ACCESSORY_SIZE_SLOTS_PER_LEVEL = 1;

// Everything the functions below need, read off the imported account: how many accessories sit in
// the bag, plus the three things that decide its size.
export function readSlotState(loadout, attributes) {
  const modifiers = loadout?.accessory?.modifiers;
  const owned = modifiers?.ownedAccessories;
  // No import on file - the bag's real contents are unknown, so slots stay out of the pricing.
  if (!owned) return null;
  // An import predating the Worker's bag fields (or made against a Worker that doesn't send them
  // yet) carries neither: absent is NOT zero. Treating it as zero would compute a 35-slot bag for a
  // maxed account, call it full, and add a slot's price to every accessory. Out of the pricing too.
  if (modifiers.bagUpgradesPurchased == null && modifiers.redstoneCollection == null) return null;
  const accessorySizeLevel = Math.min(attributes?.accessory_size || 0, ACCESSORY_SIZE_MAX_LEVEL);
  const bagUpgradesPurchased = Math.min(modifiers.bagUpgradesPurchased || 0, JACOBUS_MAX_PURCHASES);
  const redstoneCollection = modifiers.redstoneCollection || 0;
  const total =
    BASE_SLOTS +
    redstoneCollectionSlots(redstoneCollection) +
    ASSUMED_FREE_SLOTS +
    bagUpgradesPurchased * JACOBUS_SLOTS_PER_PURCHASE +
    accessorySizeLevel * ACCESSORY_SIZE_SLOTS_PER_LEVEL;
  return { used: owned.length, total, free: Math.max(0, total - owned.length), bagUpgradesPurchased, accessorySizeLevel };
}

// The cheapest slot money can buy right now, as coins-per-slot. Accessory Size is ~1.3M/slot against
// Jacobus's 10M at his top band, so it wins until it's maxed - which is the "cheaper slots first"
// rule this exists for. Returns null once both are exhausted (a 281-slot bag).
// A Jacobus purchase buys TWO slots, so its per-slot price is halved rather than charging the
// first accessory for both. The second slot then reads as free, which it effectively is.
export function nextSlotPurchase(slotState, itemData) {
  if (!slotState) return null;
  const options = [];
  const ladder = itemData?.costs?.attributeCostsByLevel?.accessory_size;
  const nextLevel = slotState.accessorySizeLevel + 1;
  if (nextLevel <= ACCESSORY_SIZE_MAX_LEVEL && Array.isArray(ladder) && ladder.length >= nextLevel) {
    // The ladder is cumulative coins to reach each level, so one level is the gap between two rungs.
    const coins = ladder[nextLevel - 1] - (nextLevel > 1 ? ladder[nextLevel - 2] : 0);
    if (coins > 0) options.push({ coins, slots: ACCESSORY_SIZE_SLOTS_PER_LEVEL, source: `Accessory Size ${nextLevel}` });
  }
  const nextPurchase = slotState.bagUpgradesPurchased + 1;
  const jacobus = jacobusPurchaseCost(nextPurchase);
  if (jacobus) options.push({ coins: jacobus, slots: JACOBUS_SLOTS_PER_PURCHASE, source: `Jacobus upgrade ${nextPurchase}` });
  if (options.length === 0) return null;
  return options
    .map((option) => ({ ...option, coinsPerSlot: option.coins / option.slots }))
    .sort((a, b) => a.coinsPerSlot - b.coinsPerSlot)[0];
}

// What one more accessory really costs in bag space: nothing while slots are free, otherwise the
// cheapest slot on the market. `null` coins = a real slot is needed but nothing prices it (no
// import, or every source maxed) - the caller leaves its own cost unchanged rather than guessing.
export function slotCostForNewAccessory(slotState, itemData) {
  if (!slotState) return { coins: 0, free: true, note: null };
  if (slotState.free > 0) {
    return { coins: 0, free: true, note: `${slotState.free} free slot${slotState.free === 1 ? '' : 's'} (${slotState.used}/${slotState.total})` };
  }
  const purchase = nextSlotPurchase(slotState, itemData);
  if (!purchase) return { coins: null, free: false, note: `Bag full (${slotState.used}/${slotState.total}), no slots left to buy` };
  return {
    coins: Math.round(purchase.coinsPerSlot),
    free: false,
    note: `Bag full (${slotState.used}/${slotState.total}) - includes a slot from ${purchase.source}`,
  };
}

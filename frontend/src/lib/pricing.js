// Coin cost per Optimizer candidate: a lookup against the Worker-precomputed `itemData.costs` bundle
// (worker/src/index.js's resolveCosts) rather than a client-side computation. Coin cost is
// loadout-independent, so the arithmetic — prices times Essence and material sums for Stars and the
// rest — happens once per refresh cycle server-side, and this module matches a candidate's category
// to the right precomputed key. Returns a number when priceable, or null when no cost source exists;
// lib/optimizer.js's withCost turns null into the '?' sentinel.

import { MAX_HOT_POTATO_BOOKS } from './books';

export function priceOf(map, id) {
  if (id == null || !map) return null;
  const price = map[id];
  return typeof price === 'number' && price > 0 ? price : null;
}

// The 12 Perfect Gemstone types. accessoryFamilies.json's perfect_gemstone_rarity_upgrades tracks
// how many Perfect Gemstones a rarity jump needs but not which type, so the jump is priced at the
// cheapest type as a lower bound. Used by accessoryOptimizer.js's gemstone-upgrade candidates.
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

// Master Star levels 1-5 each consume one specific item, at a flat cost that is the same for every
// piece of gear, unlike base Stars' per-item Essence costs. Cumulative cost to reach `count` is the
// sum of levels 1..count.
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

// A few enchants' top level is applied by consuming a single-use item rather than a book, so no
// ENCHANTMENT_<name>_<level> price exists for Ender Slayer 7, Smite 7, Venomous 7 or Bane of
// Arthropods 7, despite each being obtainable. Venomous 7 has no NEU-REPO item file either — see
// enchantEffects.js's VENOMOUS_LEVELS.
const SPECIAL_ENCHANT_LEVEL_ITEMS = {
  ender_slayer: { 7: 'ENDSTONE_IDOL' },
  smite: { 7: 'SEVERED_HAND' },
  venomous: { 7: 'FATEFUL_STINGER' },
  bane_of_arthropods: { 7: 'ENSNARED_SNAIL' },
};

// Real coin price for one enchant at one level — the single source of truth both this file's own
// Enchant/Ultimate Enchant candidate pricing below and loadoutCost.js's Setup Cost breakdown call
// through, so the special-item exceptions above only ever need handling in one place.
export function enchantPrice(itemPrices, id, level) {
  const specialItemId = SPECIAL_ENCHANT_LEVEL_ITEMS[id.toLowerCase()]?.[level];
  if (specialItemId) return priceOf(itemPrices, specialItemId);
  return priceOf(itemPrices, `ENCHANTMENT_${id.toUpperCase()}_${level}`);
}

// Coin cost of tiering a Kuudra armor piece from `fromItemId` to `toItemId`: the sum of every
// prestige hop between them. A tier-up is a craft consuming the worn piece plus a fixed material
// list, so that is what a player spends; the two tiers' auction prices never enter into it.
// `prestigeCosts` is the Worker's { <sourceId>: { to, coins } } map, so walking `to` covers a
// multi-tier jump as easily as one step. null when the chain doesn't reach `toItemId` (a different
// family, a non-Kuudra item, missing data), which leaves the caller on market pricing.
export function prestigeUpgradeCost(fromItemId, toItemId, prestigeCosts) {
  if (!fromItemId || !toItemId || !prestigeCosts) return null;
  let total = 0;
  let id = fromItemId;
  // VARIANT_TIERS is 5 long, so 4 hops is the real maximum — the bound is a cycle guard, not a rule.
  for (let hop = 0; hop < 5; hop++) {
    const step = prestigeCosts[id];
    if (!step) return null;
    total += step.coins || 0;
    if (step.to === toItemId) return total;
    id = step.to;
  }
  return null;
}

export function lookupCandidateCost(result, itemData) {
  const costs = itemData?.costs;
  if (!costs) return null;
  const { itemPrices = {}, reforgeCosts = {}, recombobulatorCost = null, petCosts = {}, starCosts = {}, prestigeCosts = {}, attributeCosts = {} } = costs;

  // Crown of Avarice's "Coins Consumed" and Midas Sword/Staff's "Price Paid" are both a count of
  // coins actually spent into the item, so cost is the item's market price plus that counter, 1 coin
  // counted being 1 coin spent. Checked before the general Weapon/Armor branch below, since these
  // candidates carry those categories too. David's Cloak's `special` is a Strength value and Daedalus
  // Blade's a Bestiary Tier count — neither is coins, so both stay unpriced rather than misread.
  // Emerald Blade's "Coins in Purse" is a balance check rather than coins spent, so it is excluded.
  const COIN_DENOMINATED_SPECIAL_IDS = new Set(['CROWN_OF_AVARICE', 'MIDAS_SWORD', 'STARRED_MIDAS_SWORD', 'MIDAS_STAFF', 'STARRED_MIDAS_STAFF']);
  if (COIN_DENOMINATED_SPECIAL_IDS.has(result.itemId) && result.special != null) {
    const basePrice = priceOf(itemPrices, result.itemId);
    return (basePrice || 0) + result.special;
  }

  // Some candidates are unpriceable rather than merely unpriced: "Max Golden Dragon" is the pet plus
  // a 1b bank and a maxed Gold collection, and no coin figure means "get there". Flagged at the
  // source so it isn't confused with a price-feed miss.
  if (result.unpriced) return null;

  switch (result.category) {
    case 'Weapon':
    case 'Armor':
    case 'Equipment': {
      const step = findStep(result.apply, 'selectItem');
      if (!step) return null;
      // A Kuudra tier-up is crafted rather than bought, consuming the worn piece plus a fixed recipe
      // (lib/optimizer.js sets `result.replaces` for those candidates), so it is priced from that
      // recipe. Falls through to the market price when the prestige chain doesn't cover the swap.
      const prestige = prestigeUpgradeCost(result.replaces?.itemId, step.item.id, prestigeCosts);
      if (prestige != null) return prestige;
      return priceOf(itemPrices, step.item.id);
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
      return step ? enchantPrice(itemPrices, step.id, step.level) : null;
    }
    case 'Enchant Set': {
      // The One-For-All-alternative bundle (lib/optimizer.js's evaluateCheapestOneForAllAlternative)
      // — several applyEnchant steps at once. Unlike Full Set above, an unpriced step here doesn't
      // make the whole total unknown — the evaluator itself already treats a level with no real
      // market price as free (0 coins, not excluded — user-specified 2026-09-02), so the total
      // shown here needs to match that same semantics rather than falling back to '?'.
      const steps = (result.apply || []).filter((s) => s.type === 'applyEnchant');
      if (steps.length === 0) return null;
      let total = 0;
      for (const step of steps) {
        const price = enchantPrice(itemPrices, step.id, step.level) ?? 0;
        total += price;
      }
      return total;
    }
    case 'Power Stone': {
      const step = findStep(result.apply, 'selectItem');
      // `item.id` here is the abstract Power's own id (e.g. "STRONG"), not a real catalog item —
      // evaluatePowerStoneCandidates already stashes the real physical stone's id as `iconId`
      // (for icon rendering), so reuse that for pricing rather than adding a new field. The price
      // feed's entry for that id is a single unit, but unlocking the Power actually takes 9 of it
      // (user-confirmed) — the real cost is 9x the per-unit market price.
      if (!step) return null;
      // The Powers unlocked by default (lib/accessoryPowers.js's DEFAULT_POWERS) have no source
      // stone at all — `iconId` is null for exactly those, and free is a real answer, not a
      // missing price.
      if (!step.item.iconId) return 0;
      const unitPrice = priceOf(itemPrices, step.item.iconId);
      return unitPrice != null ? unitPrice * 9 : null;
    }
    case 'Reforge': {
      const step = findStep(result.apply, 'applyReforge');
      if (!step) return null;
      // A reforge either comes from a physical stone you buy, or it's one the Blacksmith just
      // rolls for you (Hasty, Spicy, Pure, Fierce, ... — all 50 entries in itemData.reforges).
      // Those have no stone to price, which used to resolve to null and render as "unpriced" —
      // but "there is nothing to buy" is a real answer, not a missing one, so they're 0 now
      // (user-specified 2026-09-10). itemData.reforgeStones is the discriminator: in it means a
      // real stone (and every one of those currently has a price), absent means Blacksmith.
      if (!itemData?.reforgeStones?.[step.name]) return 0;
      return priceOf(reforgeCosts, step.name);
    }
    case 'Recombobulator':
      return recombobulatorCost || null;
    case 'Potato Books': {
      // Books 1-10 are Hot Potato Books and 11-15 Fuming (lib/books.js), so a jump from `fromBooks`
      // is priced as however many of each it actually adds. Either needed half being unpriced makes
      // the whole row '?' rather than a total that silently leaves those books out.
      const step = findStep(result.apply, 'setBookCount');
      if (!step) return null;
      const from = result.fromBooks || 0;
      const hot = Math.max(0, Math.min(step.count, MAX_HOT_POTATO_BOOKS) - Math.min(from, MAX_HOT_POTATO_BOOKS));
      const fuming = Math.max(0, step.count - Math.max(from, MAX_HOT_POTATO_BOOKS));
      let total = 0;
      for (const [count, id] of [[hot, 'HOT_POTATO_BOOK'], [fuming, 'FUMING_POTATO_BOOK']]) {
        if (!count) continue;
        const price = priceOf(itemPrices, id);
        if (price == null) return null;
        total += price * count;
      }
      return total;
    }
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
      // Each candidate is a single incremental step (evaluateMasterStarsCandidates always offers
      // "current + 1"), so its real cost is just that ONE star's own item price — not
      // masterStarCost's cumulative 1..count total (the right shape for loadoutCost.js's Setup
      // Cost, "total spent so far", but double-counts already-owned stars here). Bug: a player at
      // Master Star 4 upgrading to 5 was shown the full 1-5 cumulative (~237M) instead of just the
      // 5th star's own price (~114M) — user-confirmed 2026-09-01.
      return step ? priceOf(itemPrices, MASTER_STAR_ITEM_IDS[step.count - 1]) : null;
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
    // Time, not coins. A real 0 rather than null, so it reads as free rather than unpriced — see
    // withCost, which only treats a numeric cost as real.
    case 'Skill':
      return 0;
    // Drinking is free (a consumable already in the inventory); the Jellyfish is a real pet
    // purchase, priced as the level-100 Legendary petCosts holds.
    case 'Potion': {
      if (result.potionKind === 'jellyfish') return priceOf(petCosts, 'JELLYFISH');
      // A Spider Egg is a real purchase, but the feed carries no price for it — unpriced ('?')
      // rather than 0, since "no price found" and "costs nothing" are different claims.
      if (result.potionKind === 'mixin') return priceOf(itemPrices, 'SPIDER_EGG');
      return 0;
    }
    case 'Essence Perk': {
      // Essence bought at the shop, priced through the same feed as everything else (the Worker
      // precomputes the cumulative coin ladder — see its computeEssencePerkCosts). The Optimizer
      // only ever offers a jump straight to max, but the account is rarely at level 0, so the
      // charge is the ladder's difference rather than its whole total.
      const ladder = costs.essencePerkCosts?.[result.perkKey];
      if (!Array.isArray(ladder) || result.toLevel == null) return null;
      const to = ladder[result.toLevel - 1];
      if (to == null) return null;
      const from = result.fromLevel > 0 ? (ladder[result.fromLevel - 1] ?? 0) : 0;
      return Math.max(0, to - from);
    }
    case 'Attribute': {
      const step = findStep(result.apply, 'setAttributeLevel');
      return step ? priceOf(attributeCosts, step.id) : null;
    }
    default:
      return null;
  }
}

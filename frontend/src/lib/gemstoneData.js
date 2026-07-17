/* Gemstone stat-boost table, sourced from wiki.hypixel.net/Gemstone's
   "Stat Boosts" section (one sub-table per tier: Rough/Flawed/Fine/
   Flawless/Perfect, each listing COMMON..DIVINE bonus columns per
   gemstone). Only the 6 "combat" gemstones are wired up per spec — the
   other 6 (Amber/Topaz/Jade/Aquamarine/Citrine/Peridot) boost
   mining/foraging/farming stats this calculator doesn't model yet.

   Bonuses only go up to LEGENDARY here (the calculator's rarity scale) —
   MYTHIC/DIVINE columns exist on the wiki but aren't needed. */

export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export const GEMSTONE_TIERS = ['rough', 'flawed', 'fine', 'flawless', 'perfect'];

// A gemstone's own tier doubles as an item rarity for color purposes —
// Rough/Flawed/Fine/Flawless/Perfect gemstone items are themselves
// Common/Uncommon/Rare/Epic/Legendary rarity, so bracket coloring reuses
// rarityColorCode() from mcText.js against this mapping.
export const TIER_TO_RARITY = {
  rough: 'common',
  flawed: 'uncommon',
  fine: 'rare',
  flawless: 'epic',
  perfect: 'legendary',
};

// Symbols match each gemstone's real slot-type icon from the wiki's
// "Gemstone Slot Types" table (Ruby Slot: ❤, Jasper Slot: ❁, etc.) —
// reused here as the "gem is equipped" icon since Hypixel's actual
// per-gem equipped-icon glyphs live in a custom font this project has no
// access to. Colors match htmlcolorcodes.com/minecraft-color-codes.
// valueColor is the color a stat's *value* is shown in on a real item
// tooltip (distinct from colorCode, the gem's own identity color used for
// the equipped-slot symbol) — verified against real NEU-REPO item lore,
// e.g. Hyperion's "§7Intelligence: §b+350" and "§7Strength: §c+150".
// Used when a gemstone boosts a stat the item's lore doesn't already show,
// so the newly-created line matches how that stat is normally colored.
export const GEMSTONES = {
  RUBY: {
    label: 'Ruby',
    statLabel: 'Health',
    isPercent: false,
    colorCode: 'c', // red
    valueColor: 'c', // red
    symbol: '❤',
    tiers: {
      rough: [1, 2, 3, 4, 5],
      flawed: [3, 4, 5, 6, 8],
      fine: [4, 5, 6, 8, 10],
      flawless: [5, 7, 10, 14, 18],
      perfect: [6, 9, 13, 18, 24],
    },
  },
  JASPER: {
    label: 'Jasper',
    statLabel: 'Strength',
    isPercent: false,
    colorCode: 'd', // light purple
    valueColor: 'c', // red
    symbol: '❁',
    tiers: {
      rough: [1, 1, 1, 2, 3],
      flawed: [2, 2, 3, 4, 4],
      fine: [3, 3, 4, 5, 6],
      flawless: [5, 6, 7, 8, 10],
      perfect: [6, 7, 9, 11, 13],
    },
  },
  SAPPHIRE: {
    label: 'Sapphire',
    statLabel: 'Intelligence',
    isPercent: false,
    colorCode: '9', // blue
    valueColor: 'b', // light blue / aqua
    symbol: '✎',
    tiers: {
      rough: [2, 3, 4, 5, 6],
      flawed: [5, 5, 6, 7, 8],
      fine: [7, 8, 9, 10, 11],
      flawless: [10, 11, 12, 14, 17],
      perfect: [12, 14, 17, 20, 24],
    },
  },
  AMETHYST: {
    label: 'Amethyst',
    statLabel: 'Defense',
    isPercent: false,
    colorCode: '5', // dark purple
    valueColor: 'a', // green
    symbol: '❈',
    tiers: {
      rough: [1, 2, 3, 4, 5],
      flawed: [3, 4, 5, 6, 8],
      fine: [4, 5, 6, 8, 10],
      flawless: [5, 7, 10, 14, 18],
      perfect: [6, 9, 13, 18, 24],
    },
  },
  ONYX: {
    label: 'Onyx',
    statLabel: 'Crit Damage',
    isPercent: true,
    colorCode: '0', // black
    valueColor: '9', // dark blue
    symbol: '☠',
    tiers: {
      rough: [1, 1, 2, 2, 3],
      flawed: [2, 2, 3, 3, 4],
      fine: [3, 3, 4, 5, 6],
      flawless: [4, 5, 6, 7, 8],
      perfect: [5, 6, 7, 8, 10],
    },
  },
  OPAL: {
    label: 'Opal',
    statLabel: 'True Defense',
    isPercent: false,
    colorCode: 'f', // white
    valueColor: 'f', // white
    symbol: '❂',
    tiers: {
      rough: [1, 1, 1, 2, 2],
      flawed: [2, 2, 2, 3, 3],
      fine: [3, 3, 3, 4, 4],
      flawless: [4, 4, 5, 6, 8],
      perfect: [5, 6, 7, 9, 11],
    },
  },
};

export const GEMSTONE_IDS = Object.keys(GEMSTONES);

// Item rarities beyond LEGENDARY (Mythic, Divine, Special...) aren't in
// RARITY_ORDER — clamp to the last (Legendary) column rather than guess.
export function getGemstoneBoost(gemId, tier, itemRarity) {
  const gem = GEMSTONES[gemId];
  if (!gem) return 0;
  const rarityIdx = RARITY_ORDER.indexOf((itemRarity || 'common').toLowerCase());
  const idx = rarityIdx === -1 ? RARITY_ORDER.length - 1 : rarityIdx;
  return gem.tiers[tier][idx];
}

export function formatGemstoneBoost(gemId, value) {
  const gem = GEMSTONES[gemId];
  return gem && gem.isPercent ? `+${value}%` : `+${value}`;
}

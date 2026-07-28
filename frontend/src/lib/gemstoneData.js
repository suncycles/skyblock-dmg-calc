/* Gemstone stat-boost table (Rough/Flawed/Fine/Flawless/Perfect tiers x COMMON-MYTHIC item
   rarity). Only the 6 "combat" gemstones are wired up — the other 6 boost mining/foraging/
   farming stats this calculator doesn't model. */

export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
export const GEMSTONE_TIERS = ['rough', 'flawed', 'fine', 'flawless', 'perfect'];

// A gemstone's own tier doubles as an item rarity for bracket-color purposes (Rough =
// Common, ... Perfect = Legendary), reusing rarityColorCode() from mcText.js.
export const TIER_TO_RARITY = {
  rough: 'common',
  flawed: 'uncommon',
  fine: 'rare',
  flawless: 'epic',
  perfect: 'legendary',
};

// `symbol`/`colorCode` are the gem's own slot-type icon/identity color. `valueColor` is the
// color a stat's value is shown in on a real item tooltip (e.g. Strength = red) — used when
// a gemstone creates a brand-new stat line so it matches how that stat is normally colored.
export const GEMSTONES = {
  RUBY: {
    label: 'Ruby',
    statLabel: 'Health',
    isPercent: false,
    colorCode: 'c', // red
    valueColor: 'c', // red
    symbol: '❤',
    tiers: {
      rough: [1, 2, 3, 4, 5, 7],
      flawed: [3, 4, 5, 6, 8, 10],
      fine: [4, 5, 6, 8, 10, 14],
      flawless: [5, 7, 10, 14, 18, 22],
      perfect: [6, 9, 13, 18, 24, 30],
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
      rough: [1, 1, 1, 2, 3, 4],
      flawed: [2, 2, 3, 4, 4, 5],
      fine: [3, 3, 4, 5, 6, 7],
      flawless: [5, 6, 7, 8, 10, 12],
      perfect: [6, 7, 9, 11, 13, 16],
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
      rough: [2, 3, 4, 5, 6, 7],
      flawed: [5, 5, 6, 7, 8, 10],
      fine: [7, 8, 9, 10, 11, 12],
      flawless: [10, 11, 12, 14, 17, 20],
      perfect: [12, 14, 17, 20, 24, 30],
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
      rough: [1, 2, 3, 4, 5, 7],
      flawed: [3, 4, 5, 6, 8, 10],
      fine: [4, 5, 6, 8, 10, 14],
      flawless: [5, 7, 10, 14, 18, 22],
      perfect: [6, 9, 13, 18, 24, 30],
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
      rough: [1, 1, 2, 2, 3, 4],
      flawed: [2, 2, 3, 3, 4, 6],
      fine: [3, 3, 4, 5, 6, 8],
      flawless: [4, 5, 6, 7, 8, 10],
      perfect: [5, 6, 7, 8, 10, 12],
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
      rough: [1, 1, 1, 2, 2, 3],
      flawed: [2, 2, 2, 3, 3, 4],
      fine: [3, 3, 3, 4, 4, 5],
      flawless: [4, 4, 5, 6, 8, 9],
      perfect: [5, 6, 7, 9, 11, 13],
    },
  },
};

export const GEMSTONE_IDS = Object.keys(GEMSTONES);

// Item rarities beyond MYTHIC aren't in RARITY_ORDER — clamped to the last column.
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

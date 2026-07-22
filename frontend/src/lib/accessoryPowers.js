// Accessory Bag Powers — sourced directly from the Hypixel Skyblock wiki's
// raw wikitext this session (not guessed): the 10 Default Powers from
// https://hypixel-skyblock.fandom.com/wiki/Accessory_Powers/List_of_Accessory_Powers?action=raw
// and the 21 Stone Powers from
// https://hypixel-skyblock.fandom.com/wiki/Power_Stones/List_of_Power_Stones?action=raw
// (both confirm the exact same stat-multiplier formula the user gave).
//
// A couple of Stone Power base stats used wiki abbreviations this app has
// no matching modeled stat for ("vt", "md") — dropped rather than guessed
// at; everything else maps 1:1 onto lib/reforgeData.js's STAT_LABELS keys.
// Stone Powers additionally list a flat "Unique Power Bonus" that does
// NOT scale with Magical Power (unlike baseStats, which does).
//
// Two more real Power Stones exist in NEU-REPO (Sunflower Butter, Vitamin
// Life) beyond the 21 the wiki's own table covers — excluded here since
// there's no verified base-stat source for them, rather than guessing.

export const STARTER_POWER = 'Starter Power';
export const INTERMEDIATE_POWER = 'Intermediate Power';
export const STONE_POWER = 'Stone Power';

export const DEFAULT_POWERS = [
  {
    id: 'FORTUITOUS',
    name: 'Fortuitous',
    type: STARTER_POWER,
    requirement: 'Unlocked by default',
    baseStats: { health: 3.35, defense: 1.2, strength: 4.8, crit_chance: 4.35, crit_damage: 4.8 },
    uniqueBonus: null,
    sourceItemId: null,
  },
  {
    id: 'PRETTY',
    name: 'Pretty',
    type: STARTER_POWER,
    requirement: 'Unlocked by default',
    baseStats: {
      health: 1.65,
      defense: 1.2,
      speed: 0.65,
      strength: 4.8,
      intelligence: 10.8,
      crit_chance: 0.475,
      crit_damage: 1.2,
    },
    uniqueBonus: null,
    sourceItemId: null,
  },
  {
    id: 'PROTECTED',
    name: 'Protected',
    type: STARTER_POWER,
    requirement: 'Unlocked by default',
    baseStats: { health: 11.75, defense: 10.8, strength: 2.4, crit_chance: 0.475, crit_damage: 1.2 },
    uniqueBonus: null,
    sourceItemId: null,
  },
  {
    id: 'SIMPLE',
    name: 'Simple',
    type: STARTER_POWER,
    requirement: 'Unlocked by default',
    baseStats: {
      health: 5.02,
      defense: 3.6,
      speed: 1.2,
      strength: 3.6,
      intelligence: 5.4,
      crit_chance: 1.45,
      crit_damage: 3.6,
    },
    uniqueBonus: null,
    sourceItemId: null,
  },
  {
    id: 'WARRIOR',
    name: 'Warrior',
    type: STARTER_POWER,
    requirement: 'Unlocked by default',
    baseStats: { health: 3.35, defense: 1.2, strength: 8.4, crit_chance: 2.4, crit_damage: 6 },
    uniqueBonus: null,
    sourceItemId: null,
  },
  {
    id: 'COMMANDO',
    name: 'Commando',
    type: INTERMEDIATE_POWER,
    requirement: 'Combat XV',
    baseStats: { health: 5.02, defense: 2.4, strength: 8.4, crit_chance: 0.475, crit_damage: 8.4 },
    uniqueBonus: null,
    sourceItemId: null,
  },
  {
    id: 'DISCIPLINED',
    name: 'Disciplined',
    type: INTERMEDIATE_POWER,
    requirement: 'Combat XV',
    baseStats: { health: 5.02, defense: 2.4, strength: 7.2, crit_chance: 1.45, crit_damage: 7.2 },
    uniqueBonus: null,
    sourceItemId: null,
  },
  {
    id: 'INSPIRED',
    name: 'Inspired',
    type: INTERMEDIATE_POWER,
    requirement: 'Combat XV',
    baseStats: {
      health: 1.65,
      defense: 1.2,
      strength: 4.8,
      intelligence: 16.2,
      crit_chance: 0.95,
      crit_damage: 3.6,
    },
    uniqueBonus: null,
    sourceItemId: null,
  },
  {
    id: 'OMINOUS',
    name: 'Ominous',
    type: INTERMEDIATE_POWER,
    requirement: 'Combat XV',
    baseStats: {
      health: 5.02,
      speed: 0.95,
      strength: 3.6,
      intelligence: 6.1,
      crit_chance: 1.45,
      crit_damage: 3.6,
      bonus_attack_speed: 0.9,
    },
    uniqueBonus: null,
    sourceItemId: null,
  },
  {
    id: 'PREPARED',
    name: 'Prepared',
    type: INTERMEDIATE_POWER,
    requirement: 'Combat XV',
    baseStats: { health: 12.4, defense: 11.3, strength: 1.95, crit_chance: 0.4, crit_damage: 0.95 },
    uniqueBonus: null,
    sourceItemId: null,
  },
];

export const STONE_POWERS = [
  {
    id: 'FORCEFUL',
    name: 'Forceful',
    type: STONE_POWER,
    requirement: 'Combat XX',
    sourceItemId: 'ACACIA_BIRDHOUSE',
    sourceName: 'Acacia Birdhouse',
    baseStats: { health: 1.7, strength: 18, crit_damage: 4.8 },
    uniqueBonus: { ferocity: 4 },
  },
  {
    id: 'BLOODY',
    name: 'Bloody',
    type: STONE_POWER,
    requirement: 'Combat XX',
    sourceItemId: 'BEATING_HEART',
    sourceName: 'Beating Heart',
    baseStats: { strength: 10.8, intelligence: 3.6, crit_damage: 10.8 },
    uniqueBonus: { bonus_attack_speed: 10 },
  },
  {
    id: 'BUBBA',
    name: 'Bubba',
    type: STONE_POWER,
    requirement: 'Combat XXV',
    sourceItemId: 'BUBBA_BLISTER',
    sourceName: 'Bubba Blister',
    baseStats: {
      health: 5.1,
      defense: -9.6,
      strength: 6,
      crit_chance: 0.9,
      crit_damage: 10.8,
      bonus_attack_speed: 1.8,
      true_defense: 1.2,
    },
    uniqueBonus: null, // wiki's "CW" unique bonus has no matching modeled stat here
  },
  {
    id: 'SHADED',
    name: 'Shaded',
    type: STONE_POWER,
    requirement: 'Combat XX',
    sourceItemId: 'DARK_ORB',
    sourceName: 'Dark Orb',
    baseStats: { speed: 0.6, strength: 4.8, crit_damage: 18 },
    uniqueBonus: { bonus_attack_speed: 3, ferocity: 3 },
  },
  {
    id: 'SANGUISUGE',
    name: 'Sanguisuge',
    type: STONE_POWER,
    requirement: 'Combat X',
    sourceItemId: 'DISPLACED_LEECH',
    sourceName: 'Displaced Leech',
    baseStats: { health: 5.1, strength: 12, crit_damage: 4.8 }, // "vt" (unmapped) omitted
    uniqueBonus: { intelligence: 100 },
  },
  {
    id: 'BIZARRE',
    name: 'Bizarre',
    type: STONE_POWER,
    requirement: 'Combat XXV',
    sourceItemId: 'ECCENTRIC_PAINTING',
    sourceName: 'Eccentric Painting',
    baseStats: { strength: -2.4, intelligence: 43.2, crit_damage: -2.4 },
    uniqueBonus: { ability_damage: 5 },
  },
  {
    id: 'ADEPT',
    name: 'Adept',
    type: STONE_POWER,
    requirement: 'Combat XX',
    sourceItemId: 'END_STONE_SHULKER',
    sourceName: 'End Stone Shulker',
    baseStats: { health: 16.8, defense: 9.6, intelligence: 3.6 },
    uniqueBonus: { health: 100, defense: 50 },
  },
  {
    id: 'SIGHTED',
    name: 'Sighted',
    type: STONE_POWER,
    requirement: 'Combat XV',
    sourceItemId: 'ENDER_MONOCLE',
    sourceName: 'Ender Monocle',
    baseStats: { intelligence: 36 },
    uniqueBonus: { ability_damage: 3 },
  },
  {
    id: 'CRUMBLY',
    name: 'Crumbly',
    type: STONE_POWER,
    requirement: 'Combat XX',
    sourceItemId: 'CHOCOLATE_CHIP',
    sourceName: 'Fang-tastic Chocolate Chip',
    baseStats: { health: 10.1, intelligence: 5.4, true_defense: 0.6 }, // "vt"/"md" (unmapped) omitted
    uniqueBonus: { speed: 25 },
  },
  {
    id: 'ITCHY',
    name: 'Itchy',
    type: STONE_POWER,
    requirement: 'Combat XX',
    sourceItemId: 'FURBALL',
    sourceName: 'Furball',
    baseStats: { speed: 0.6, strength: 7.2, crit_damage: 8.4, bonus_attack_speed: 2.15 },
    uniqueBonus: { strength: 15, crit_damage: 15 },
  },
  {
    id: 'FROZEN',
    name: 'Frozen',
    type: STONE_POWER,
    requirement: 'Combat XX',
    sourceItemId: 'GLACITE_SHARD',
    sourceName: 'Glacite Chunk',
    baseStats: { defense: 14.4, crit_damage: 12, strength: 6, speed: -1.8 },
    uniqueBonus: { strength: 25, crit_damage: 25, true_defense: 10 },
  },
  {
    id: 'SLENDER',
    name: 'Slender',
    type: STONE_POWER,
    requirement: 'Combat XXX',
    sourceItemId: 'HAZMAT_ENDERMAN',
    sourceName: 'Hazmat Enderman',
    baseStats: {
      health: 8.4,
      defense: 6,
      speed: 0.6,
      strength: 6,
      intelligence: 7.2,
      crit_damage: 6,
      bonus_attack_speed: 1.1,
    },
    uniqueBonus: { defense: 100, strength: 50 },
  },
  {
    id: 'DEMONIC',
    name: 'Demonic',
    type: STONE_POWER,
    requirement: 'Combat XXV',
    sourceItemId: 'HORNS_OF_TORMENT',
    sourceName: 'Horns of Torment',
    baseStats: { strength: 5.5, intelligence: 27.725 },
    uniqueBonus: { crit_damage: 50 },
  },
  {
    id: 'SILKY',
    name: 'Silky',
    type: STONE_POWER,
    requirement: 'Combat XV',
    sourceItemId: 'LUXURIOUS_SPOOL',
    sourceName: 'Luxurious Spool',
    baseStats: { speed: 0.6, crit_damage: 22.8 },
    uniqueBonus: { bonus_attack_speed: 5 },
  },
  {
    id: 'HURTFUL',
    name: 'Hurtful',
    type: STONE_POWER,
    requirement: 'Combat XXV',
    sourceItemId: 'MAGMA_URCHIN',
    sourceName: 'Magma Urchin',
    baseStats: { strength: 4.8, crit_damage: 19.2 },
    uniqueBonus: { bonus_attack_speed: 15 },
  },
  {
    id: 'STRONG',
    name: 'Strong',
    type: STONE_POWER,
    requirement: 'Combat XXX',
    sourceItemId: 'MANDRAA',
    sourceName: 'Mandraa',
    baseStats: { strength: 12, crit_damage: 12 },
    uniqueBonus: { strength: 25, crit_damage: 25 },
  },
  {
    id: 'MYTHICAL',
    name: 'Mythical',
    type: STONE_POWER,
    requirement: 'Combat XX',
    sourceItemId: 'OBSIDIAN_TABLET',
    sourceName: 'Obsidian Tablet',
    baseStats: {
      health: 5.7,
      defense: 4.05,
      speed: 0.95,
      strength: 4.05,
      intelligence: 6.1,
      crit_chance: 1.65,
      crit_damage: 4.05,
    },
    uniqueBonus: { health: 150, strength: 40 },
  },
  {
    id: 'PLEASANT',
    name: 'Pleasant',
    type: STONE_POWER,
    requirement: 'Combat XXV',
    sourceItemId: 'PRECIOUS_PEARL',
    sourceName: 'Precious Pearl',
    baseStats: { health: 13.45, defense: 14.4 },
    uniqueBonus: null,
  },
  {
    id: 'SWEET',
    name: 'Sweet',
    type: STONE_POWER,
    requirement: 'Combat XV',
    sourceItemId: 'ROCK_CANDY',
    sourceName: 'Rock Candy',
    baseStats: { health: 15.1, defense: 10.8, speed: 1.2 },
    uniqueBonus: { speed: 5 },
  },
  {
    id: 'SCORCHING',
    name: 'Scorching',
    type: STONE_POWER,
    requirement: 'Combat XXXV',
    sourceItemId: 'SCORCHED_BOOKS',
    sourceName: 'Scorched Books',
    baseStats: { strength: 8.4, crit_damage: 9.6, bonus_attack_speed: 1.8 },
    uniqueBonus: { ferocity: 7 },
  },
  {
    id: 'HEALTHY',
    name: 'Healthy',
    type: STONE_POWER,
    requirement: 'Combat XXX',
    sourceItemId: 'VITAMIN_DEATH',
    sourceName: 'Vitamin Death',
    baseStats: { health: 33.6 },
    uniqueBonus: { health: 200 },
  },
];

export const ALL_POWERS = [...DEFAULT_POWERS, ...STONE_POWERS];

export function getPowerById(id) {
  return ALL_POWERS.find((p) => p.id === id) || null;
}

// 29.97*(ln(0.0019*MP+1))^1.2 — the stat multiplier every power's
// baseStats is scaled by, verified directly against the wiki's raw
// wikitext for both power tables (matches the user's own formula).
export function computeAccessoryMultiplier(mp) {
  const m = Math.max(0, mp || 0);
  return 29.97 * Math.log(0.0019 * m + 1) ** 1.2;
}

// 1 Tuning Point per 10 Magical Power (confirmed on the Maxwell wiki
// page), spendable across the 8 stats below.
export function computeTuningPoints(mp) {
  return Math.floor(Math.max(0, mp || 0) / 10);
}

export const TUNING_STATS = [
  'health',
  'defense',
  'speed',
  'strength',
  'crit_damage',
  'crit_chance',
  'bonus_attack_speed',
  'intelligence',
];

// Real per-point values (not published on the wiki — supplied directly).
export const TUNING_RATE_PER_POINT = {
  health: 5,
  defense: 1,
  speed: 1.5,
  strength: 1,
  crit_damage: 1,
  crit_chance: 0.2,
  bonus_attack_speed: 0.3,
  intelligence: 2,
};

export function computeTuningStats(tuning) {
  const stats = {};
  for (const key of TUNING_STATS) {
    const points = (tuning && tuning[key]) || 0;
    if (points) stats[key] = points * TUNING_RATE_PER_POINT[key];
  }
  return stats;
}

// Combines a power's MP-scaled base stats + its flat (non-MP-scaled)
// unique bonus + tuning-point stats into one {statKey: value} map — used
// both for Landing's hover tooltip and Damage Sources' base stat totals.
export function computeAccessoryTotalStats(powerId, mp, tuning) {
  const stats = {};
  const power = getPowerById(powerId);
  if (power) {
    const multiplier = computeAccessoryMultiplier(mp);
    for (const [key, base] of Object.entries(power.baseStats)) {
      stats[key] = (stats[key] || 0) + base * multiplier;
    }
    if (power.uniqueBonus) {
      for (const [key, value] of Object.entries(power.uniqueBonus)) {
        stats[key] = (stats[key] || 0) + value;
      }
    }
  }
  const tuningStats = computeTuningStats(tuning);
  for (const [key, value] of Object.entries(tuningStats)) {
    stats[key] = (stats[key] || 0) + value;
  }
  return stats;
}

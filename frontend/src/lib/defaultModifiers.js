// Default modifiers per loadout entry type, shared by BuildContext and lib/loadoutCode.js.

export function emptyModifiers() {
  return {
    hexEnchantments: [], // [{id, level, maxLevel}], normal enchants
    ultimateEnchantment: null, // {id, level, maxLevel} | null
    gemstones: [],
    // Slot indices known to be unlocked; a slot holding a gem counts as unlocked regardless.
    gemstoneSlotsUnlocked: [],
    books: 0, // Hot/Fuming Potato Book count, 0-15
    artOfWar: false, // +5 Strength, weapons only
    artOfPeace: false, // +40 Health, armor only
    special: 0, // weapon-specific ability input - see lib/specialWeapons.js
    recombobulated: false,
    reforge: null, // reforge name string | null
    stars: 0, // Item Upgrades star count, 0-15 - see lib/starring.js
    rarityOverride: null, // real current tier for milestone-upgrading items (e.g. David's Cloak) | null = use the item's own tier
    dungeonized: false, // Catacombs-level-scaled stat lines - see lib/dungeonize.js
    dungeonizeOldCurve: false, // true = pre-0.26.1 curve, false = current
    masterStars: 0, // Dungeonize-only stars, 5%/star up to 5 - see lib/starring.js. Always 0 unless dungeonized.
    // Per-copy Gear Score data for tiered-stat items (lib/tieredArmorStats.js): the drop's floor
    // 1-10 and its stat boost %. null/0 falls back to the catalog's pristine lore value.
    itemTier: null,
    baseStatBoostPercentage: 0,
  };
}

// Pet modifiers: level and optional held pet item.
export function emptyPetModifiers() {
  return {
    level: 1,
    petItem: null, // pet item id string | null
    bankCoins: 0, // Golden Dragon's "Legendary Treasure" input - see lib/damageSources.js
    goldCollection: 0, // Golden Dragon's "Shining Scales" input - see lib/petData.js
  };
}

// Accessory Power modifiers: power id, Magical Power, and Tuning Point allocation.
export function emptyAccessoryModifiers() {
  return {
    magicalPower: 0,
    tuning: {
      health: 0,
      defense: 0,
      speed: 0,
      strength: 0,
      crit_damage: 0,
      crit_chance: 0,
      bonus_attack_speed: 0,
      intelligence: 0,
    },
    // Enrichment count and the stat they are all set to; 'none' = a stat this app doesn't track.
    enrichmentCount: 0,
    enrichmentType: 'none',
    // Each owned accessory's own stat line, summed as {statKey: value}, filled by Hypixel import.
    individualAccessoryStats: {},
    // Owned accessory id/tier/recombobulated records from the last Hypixel import.
    // null (not []) means no import has ever populated it.
    ownedAccessories: null,
    // Accessory Bag size inputs from import: Jacobus purchases and Redstone Dust collection total.
    bagUpgradesPurchased: 0,
    redstoneCollection: 0,
  };
}

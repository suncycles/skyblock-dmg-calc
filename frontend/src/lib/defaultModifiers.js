// Canonical default modifiers shape per loadout entry type — single source of truth shared by
// BuildContext (fresh-equip state) and lib/loadoutCode.js (omitting default-valued fields from
// exported links, since most items only touch a handful of these).

export function emptyModifiers() {
  return {
    hexEnchantments: [], // [{id, level, maxLevel}], normal enchants
    ultimateEnchantment: null, // {id, level, maxLevel} | null
    gemstones: [],
    books: 0, // Hot/Fuming Potato Book count, 0-15
    artOfWar: false, // +5 Strength, weapons only
    artOfPeace: false, // +40 Health, armor only
    special: 0, // weapon-specific ability input — see lib/specialWeapons.js
    recombobulated: false,
    reforge: null, // reforge name string | null
    stars: 0, // Item Upgrades star count, 0-15 — see lib/starring.js
    rarityOverride: null, // real current tier for milestone-upgrading items (e.g. David's Cloak) | null = use the item's own tier
    dungeonized: false, // Catacombs-level-scaled stat lines — see lib/dungeonize.js
    dungeonizeOldCurve: false, // true = pre-0.26.1 curve, false = current
    masterStars: 0, // Dungeonize-only stars, 5%/star up to 5 — see lib/starring.js. Always 0 unless dungeonized.
  };
}

// Pets' own modifiers shape: just a level and optional held pet item, no enchants/gemstones/reforges.
export function emptyPetModifiers() {
  return {
    level: 1,
    petItem: null, // pet item id string | null
    bankCoins: 0, // Golden Dragon's "Legendary Treasure" input — see lib/damageSources.js
    goldCollection: 0, // Golden Dragon's "Shining Scales" input — see lib/petData.js
  };
}

// Accessory Powers' own modifiers shape: chosen power id, Magical Power, and Tuning Point allocation.
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
    // Accessory Bag Enrichment count and which stat they're all currently set to — see
    // lib/damageSources.js's Enrichments source line. 'none' covers enrichments on a stat this
    // calculator doesn't track (e.g. Magic Find): they still count toward the total but add nothing.
    enrichmentCount: 0,
    enrichmentType: 'none',
  };
}

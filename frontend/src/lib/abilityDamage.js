// Mage Mode's per-weapon Base Ability Damage/Ability Scaling table — user-provided, cross-checked
// against real ids in worker/src/data/weapons.json (and NEU-REPO directly for the two Voodoo
// Doll entries, which aren't in weapons.json without the MANUAL_CATEGORY_OVERRIDES fix in
// worker/scripts/build-item-data.mjs). STARRED_ variants with no distinct value given (Glacial
// Scythe, Midas Staff, Yeti Sword) reuse their base item's numbers. Hyperion/Astraea/Valkyrie/
// Scylla/Necron's Blade (Unrefined) all share the Wither Impact -> Implosion ability's numbers.
export const ABILITY_DAMAGE_TABLE = {
  RUNIC_STAFF: { base: 10000, scaling: 0.2 }, // Aurora Staff
  ASPECT_OF_THE_DRAGON: { base: 12000, scaling: 0.1 },
  BINGO_BLASTER: { base: 625, scaling: 1 },
  BONZO_STAFF: { base: 1000, scaling: 0.2 },
  STARRED_BONZO_STAFF: { base: 1100, scaling: 0.2 },
  CELESTE_WAND: { base: 40, scaling: 1 },
  EMBER_ROD: { base: 30, scaling: 1 },
  FIRE_FURY_STAFF: { base: 42000, scaling: 0.3 },
  FROZEN_SCYTHE: { base: 1000, scaling: 0.3 },
  GIANTS_SWORD: { base: 100000, scaling: 0.05 },
  GLACIAL_SCYTHE: { base: 1500, scaling: 0.3 },
  STARRED_GLACIAL_SCYTHE: { base: 1500, scaling: 0.3 },
  GOLEM_SWORD: { base: 250, scaling: 1 },
  HOLLOW_WAND: { base: 15000, scaling: 1 },
  INK_WAND: { base: 10000, scaling: 1 },
  JERRY_STAFF: { base: 500, scaling: 0.2 }, // Jerry-chine Gun
  LEAPING_SWORD: { base: 350, scaling: 1 },
  MIDAS_STAFF: { base: 6000, scaling: 0.3 },
  STARRED_MIDAS_STAFF: { base: 6000, scaling: 0.3 },
  PIGMAN_SWORD: { base: 30000, scaling: 0.1 },
  SILK_EDGE_SWORD: { base: 400, scaling: 1 },
  BAT_WAND: { base: 2000, scaling: 0.2 }, // Spirit Sceptre
  STARRED_BAT_WAND: { base: 2250, scaling: 0.2 },
  STAFF_OF_THE_VOLCANO: { base: 24000, scaling: 0.3 },
  STARLIGHT_WAND: { base: 50, scaling: 1 },
  ALCHEMISTS_STAFF: { base: 10000, scaling: 0.3 }, // The Alchemist's Staff
  YETI_SWORD: { base: 15000, scaling: 0.3 },
  STARRED_YETI_SWORD: { base: 15000, scaling: 0.3 },
  HYPERION: { base: 10000, scaling: 0.3 },
  ASTRAEA: { base: 10000, scaling: 0.3 },
  VALKYRIE: { base: 10000, scaling: 0.3 },
  SCYLLA: { base: 10000, scaling: 0.3 },
  NECRON_BLADE: { base: 10000, scaling: 0.3 }, // Necron's Blade (Unrefined)
  VOODOO_DOLL: { base: 1500, scaling: 1 },
  VOODOO_DOLL_WILTED: { base: 2222, scaling: 1 }, // Jinxed Voodoo Doll
};

// Implosion Belt: user-verified 1.25x multiplier to Hyperion/Spirit Sceptre/Yeti Sword's own
// ability damage specifically (not a generic Ability Damage source) — the belt's bundled lore
// text describes a different, unrelated "explosion damage" bonus, so this can't be scanned for.
export const IMPLOSION_BELT_ID = 'IMPLOSION_BELT';
export const IMPLOSION_BELT_ABILITY_MULTIPLIER = 1.25;
export const IMPLOSION_BELT_WEAPON_IDS = new Set([
  'HYPERION',
  'BAT_WAND', // Spirit Sceptre
  'STARRED_BAT_WAND',
  'YETI_SWORD',
  'STARRED_YETI_SWORD',
]);

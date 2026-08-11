// Hypixel Skyblock Attributes — Hunting skill shards syphoned to level an account-wide,
// non-item-bound attribute 1-10. Only the damage-relevant subset is modeled: Ruler (per-Mob-
// Type % damage), the Echo chain (relative boosts to Ruler/Elemental/Tuning Box attributes), Strength
// Elemental, Intelligence Elemental, Deadeye (bow-only % damage), Warrior (melee-only,
// Deadeye's inverse), Elite (boss/miniboss % damage, scoped to the 5 real Slayer bosses — see
// lib/damageSources.js's ELITE_BOSS_MOBS), Unlimited Power/Energy/Torrent (post-everything %
// multipliers on Strength/Crit Damage/Intelligence), Almighty (relative boost to all three
// Unlimited attributes), Tuning Box (+Accessory Tuning points), Dominance (always-active), and
// Attack Speed (the "Inferno Demonlord" shard — always-active, feeds Bonus Attack Speed
// directly). Lifeline is out of scope.

export const MAX_ATTRIBUTE_LEVEL = 10;
// Dominance is an Epic-tier shard (32 total copies -> max level 32), unlike every other
// attribute here, which tops out at the Common-tier 10.
export const DOMINANCE_MAX_LEVEL = 32;

export function getAttributeMaxLevel(id) {
  return id === 'dominance' ? DOMINANCE_MAX_LEVEL : MAX_ATTRIBUTE_LEVEL;
}

export const RULER_RATE = 3; // %/level, "+3%-30% more Damage against <Type> mobs"
// All 17 real Ruler shards (verified against NEU-REPO's constants/attribute_shards.json — every
// entry there is templated "<Type> Ruler" at the same rate), matching every mob type this app's
// own damageSymbols.js already recognizes.
export const RULER_ATTRIBUTES = [
  'Airborne',
  'Animal',
  'Arcane',
  'Arthropod',
  'Construct',
  'Elusive',
  'Ender',
  'Frozen',
  'Humanoid',
  'Infernal',
  'Magmatic',
  'Mythological',
  'Pest',
  'Skeletal',
  'Subterranean',
  'Undead',
  'Woodland',
].map((mobType) => ({ id: `ruler_${mobType.toLowerCase()}`, name: `${mobType} Ruler`, mobType }));

export const ECHO_OF_RULER_RATE = 2; // %/level, boosts every attribute whose name contains "Ruler"
export const ECHO_OF_ECHOES_RATE = 5; // %/level, boosts every attribute whose name contains "Echo"
export const ECHO_OF_ELEMENTAL_RATE = 2; // %/level, boosts the (Strength-granting) Elemental family
// Legendary tier. Boosts Tuning Box's own point grant (not the Magical Power-derived points) —
// +2%-20% at level 10, boosted by Echo of Echoes up to +30% total at both maxed. See
// lib/accessoryPowers.js's computeTotalTuningPoints.
export const ECHO_OF_BOXES_RATE = 2; // %/level, boosts Tuning Box's point grant

export const ELEMENTAL_STRENGTH_RATE = 1; // Strength/level, "Grants Strength +1-10"
export const STRENGTH_ELEMENTAL_ATTRIBUTES = ['Light', 'Stone', 'Lightning', 'Wind', 'Storm'].map((prefix) => ({
  id: `${prefix.toLowerCase()}_elemental`,
  name: `${prefix} Elemental`,
}));

export const ELEMENTAL_INTELLIGENCE_RATE = 1; // Intelligence/level, "Grants Intelligence +1-10"
export const INTELLIGENCE_ELEMENTAL_ATTRIBUTES = ['Fog', 'Water', 'Torrent', 'Frost', 'Snow'].map((prefix) => ({
  id: `${prefix.toLowerCase()}_elemental`,
  name: `${prefix} Elemental`,
}));

export const DEADEYE_RATE = 2.5; // %/level, "+2.5%-25% damage from ranged weapons" (bow only)
export const WARRIOR_RATE = 2.5; // %/level, "Increases melee damage dealt by +2.5%-25%" (non-bow only)
export const ELITE_RATE = 3; // %/level, "+3%-30% more Damage against bosses and mini-bosses"
export const UNLIMITED_POWER_RATE = 0.1; // %/level, Strength — applied after everything else
export const UNLIMITED_ENERGY_RATE = 0.1; // %/level, Crit Damage — applied after everything else
export const MAXIMAL_TORMENT_RATE = 1; // %/level, Intelligence — applied after everything else
export const ALMIGHTY_RATE = 5; // %/level, 'Your "Unlimited" Attributes are +5%-50% stronger'
export const TUNING_BOX_RATE = 1; // Tuning Points/level, "+1-10 Tuning Points"
export const DOMINANCE_RATE = 1.5; // %/level, "+1.5%-15% more Damage when at full health" — treated as always-active
// "Inferno Demonlord" shard (verified against NEU-REPO's attribute_shards.json: rarity EPIC,
// internalName ATTRIBUTE_SHARD_ATTACK_SPEED, max level 10 at 32 total shards — same EPIC cost
// curve already used by the Hypixel import's attribute-level computation). Always-active, feeds
// the Bonus Attack Speed base stat directly rather than a % damage source.
export const ATTACK_SPEED_SHARD_RATE = 1; // Bonus Attack Speed %/level, "+1%-10% Bonus Attack Speed"

// Non-Ruler/Elemental/Echo attributes needing a single number input — shared shape for pages/Attributes.jsx to render generically.
export const OTHER_ATTRIBUTES = [
  { id: 'deadeye', name: 'Deadeye', rate: DEADEYE_RATE, unit: '%' },
  { id: 'warrior', name: 'Warrior', rate: WARRIOR_RATE, unit: '%' },
  { id: 'elite', name: 'Elite', rate: ELITE_RATE, unit: '%' },
  { id: 'unlimited_power', name: 'Unlimited Power', rate: UNLIMITED_POWER_RATE, unit: '%' },
  { id: 'unlimited_energy', name: 'Unlimited Energy', rate: UNLIMITED_ENERGY_RATE, unit: '%' },
  { id: 'maximal_torment', name: 'Unlimited Torment', rate: MAXIMAL_TORMENT_RATE, unit: '%' },
  { id: 'almighty', name: 'Almighty', rate: ALMIGHTY_RATE, unit: '%' },
  { id: 'tuning_box', name: 'Tuning Box', rate: TUNING_BOX_RATE, unit: ' pts' },
  { id: 'dominance', name: 'Dominance', rate: DOMINANCE_RATE, unit: '%' },
  { id: 'attack_speed', name: 'Attack Speed', rate: ATTACK_SPEED_SHARD_RATE, unit: '%' },
];

export const ATTRIBUTE_IDS = [
  ...RULER_ATTRIBUTES.map((a) => a.id),
  'echo_of_ruler',
  'echo_of_echoes',
  'echo_of_elemental',
  'echo_of_boxes',
  ...STRENGTH_ELEMENTAL_ATTRIBUTES.map((a) => a.id),
  ...INTELLIGENCE_ELEMENTAL_ATTRIBUTES.map((a) => a.id),
  ...OTHER_ATTRIBUTES.map((a) => a.id),
];

// Echo of Ruler/Echo of Elemental are themselves boosted by Echo of Echoes before boosting their own target family.
export function computeEchoBoost(baseRate, level, echoOfEchoesLevel) {
  const own = baseRate * (level || 0);
  const echoOfEchoesBonus = ECHO_OF_ECHOES_RATE * (echoOfEchoesLevel || 0);
  return own * (1 + echoOfEchoesBonus / 100);
}

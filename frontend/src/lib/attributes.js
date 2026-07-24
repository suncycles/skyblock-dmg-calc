// Hypixel Skyblock Attributes — Hunting skill shards syphoned to level an
// account-wide, non-item-bound attribute 1-10 (toggled on/off in its own
// in-game menu, unlike every other per-item modifier system in this app).
// Real per-level rates sourced directly from hypixelskyblock.minecraft.wiki's
// Attributes page + its 5 rarity sub-pages this session (not guessed) —
// every rate below is a real, verified linear rate x level (1-10).
//
// Only the damage-relevant subset is modeled: Ruler (per-Mob-Type %
// damage), the Echo chain (keyword-matching relative boosts to Ruler/
// Elemental attributes), Strength Elemental, Deadeye (bow-only % damage),
// Warrior (melee-only % damage — the exact inverse condition of
// Deadeye), Elite (boss/miniboss % damage — this app's mob dataset has
// no boss/miniboss flag on any entry, so it's scoped to the 5 real
// Slayer bosses instead, see lib/damageSources.js's ELITE_BOSS_MOBS),
// Unlimited Power/Energy (post-everything %
// multipliers on Strength/Crit Damage), Almighty (keyword-matching
// relative boost to both "Unlimited" attributes, same mechanism as the
// Echo chain), Tuning Box (+Accessory Tuning points), and Dominance
// (treated as always-active per instruction). Lifeline is explicitly
// out of scope, not modeled at all.

export const MAX_ATTRIBUTE_LEVEL = 10;

export const RULER_RATE = 3; // %/level, "+3%-30% more Damage against <Type> mobs"
export const RULER_ATTRIBUTES = [
  'Skeletal',
  'Humanoid',
  'Undead',
  'Woodland',
  'Arthropod',
  'Ender',
  'Magmatic',
  'Frozen',
  'Airborne',
  'Arcane',
  'Animal',
  'Subterranean',
  'Mythological',
  'Construct',
  'Infernal',
].map((mobType) => ({ id: `ruler_${mobType.toLowerCase()}`, name: `${mobType} Ruler`, mobType }));

export const ECHO_OF_RULER_RATE = 2; // %/level, boosts every attribute whose name contains "Ruler"
export const ECHO_OF_ECHOES_RATE = 5; // %/level, boosts every attribute whose name contains "Echo"
export const ECHO_OF_ELEMENTAL_RATE = 2; // %/level, boosts the (Strength-granting) Elemental family

export const ELEMENTAL_STRENGTH_RATE = 1; // Strength/level, "Grants Strength +1-10"
export const STRENGTH_ELEMENTAL_ATTRIBUTES = ['Light', 'Stone', 'Lightning', 'Wind', 'Storm'].map((prefix) => ({
  id: `${prefix.toLowerCase()}_elemental`,
  name: `${prefix} Elemental`,
}));

export const DEADEYE_RATE = 2.5; // %/level, "+2.5%-25% damage from ranged weapons" (bow only)
export const WARRIOR_RATE = 2.5; // %/level, "Increases melee damage dealt by +2.5%-25%" (non-bow only)
export const ELITE_RATE = 3; // %/level, "+3%-30% more Damage against bosses and mini-bosses"
export const UNLIMITED_POWER_RATE = 0.1; // %/level, Strength — applied after everything else
export const UNLIMITED_ENERGY_RATE = 0.1; // %/level, Crit Damage — applied after everything else
export const ALMIGHTY_RATE = 5; // %/level, 'Your "Unlimited" Attributes are +5%-50% stronger'
export const TUNING_BOX_RATE = 1; // Tuning Points/level, "+1-10 Tuning Points"
export const DOMINANCE_RATE = 1.5; // %/level, "+1.5%-15% more Damage when at full health" — treated as always-active

// Non-Ruler/Elemental/Echo attributes this page needs a single number
// input for — shared shape so pages/Attributes.jsx can render them
// generically rather than one-off per attribute.
export const OTHER_ATTRIBUTES = [
  { id: 'deadeye', name: 'Deadeye', rate: DEADEYE_RATE, unit: '%' },
  { id: 'warrior', name: 'Warrior', rate: WARRIOR_RATE, unit: '%' },
  { id: 'elite', name: 'Elite', rate: ELITE_RATE, unit: '%' },
  { id: 'unlimited_power', name: 'Unlimited Power', rate: UNLIMITED_POWER_RATE, unit: '%' },
  { id: 'unlimited_energy', name: 'Unlimited Energy', rate: UNLIMITED_ENERGY_RATE, unit: '%' },
  { id: 'almighty', name: 'Almighty', rate: ALMIGHTY_RATE, unit: '%' },
  { id: 'tuning_box', name: 'Tuning Box', rate: TUNING_BOX_RATE, unit: ' pts' },
  { id: 'dominance', name: 'Dominance', rate: DOMINANCE_RATE, unit: '%' },
];

export const ATTRIBUTE_IDS = [
  ...RULER_ATTRIBUTES.map((a) => a.id),
  'echo_of_ruler',
  'echo_of_echoes',
  'echo_of_elemental',
  ...STRENGTH_ELEMENTAL_ATTRIBUTES.map((a) => a.id),
  ...OTHER_ATTRIBUTES.map((a) => a.id),
];

// Echo of Ruler/Echo of Elemental are themselves boosted by Echo of
// Echoes (never by themselves) before boosting their own target family —
// verified against the user's own worked example: Echo of Ruler 10 (20%)
// boosted by Echo of Echoes 10 (50%) -> 20*1.5=30, which then boosts a
// 30%-base Ruler attribute to 30*1.3=39%.
export function computeEchoBoost(baseRate, level, echoOfEchoesLevel) {
  const own = baseRate * (level || 0);
  const echoOfEchoesBonus = ECHO_OF_ECHOES_RATE * (echoOfEchoesLevel || 0);
  return own * (1 + echoOfEchoesBonus / 100);
}

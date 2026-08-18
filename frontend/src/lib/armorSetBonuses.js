// Full-armor/equipment-set damage bonuses, keyed in ARMOR_SLOTS/EQUIPMENT_SLOTS order
// (helmet/chestplate/leggings/boots, necklace/cloak/belt/gloves) so membership can be
// checked positionally against the loadout.

// Final Destination's Vivacious Darkness set bonus: +30 Strength (unconditional) and +100%
// damage against Ender-type mobs. The Soulflow-cost/sneaking gate is assumed always active.
export const FINAL_DESTINATION_SET = [
  'FINAL_DESTINATION_HELMET',
  'FINAL_DESTINATION_CHESTPLATE',
  'FINAL_DESTINATION_LEGGINGS',
  'FINAL_DESTINATION_BOOTS',
];
export const FINAL_DESTINATION_STRENGTH = 30;
export const FINAL_DESTINATION_ENDER_DAMAGE_PERCENT = 100;

// Vanquished's 1.1x is an undocumented hidden bonus (not stated in-game) — Damage Sources
// shows Final Damage both with and without it rather than silently folding it in.
export const VANQUISHED_SET = [
  'VANQUISHED_MAGMA_NECKLACE',
  'VANQUISHED_GHAST_CLOAK',
  'VANQUISHED_BLAZE_BELT',
  'VANQUISHED_GLOWSTONE_GAUNTLET',
];
export const VANQUISHED_SET_MULTIPLIER = 1.1;
export const VANQUISHED_SET_ID = 'vanquished-set-hidden-bonus';

// Monster Hunter/Monster Raider: undocumented hidden set bonuses. The two sets share their
// first 3 pieces and differ only in boots, so they're mutually exclusive by construction.
export const MONSTER_HUNTER_SET = ['SKELETON_HELMET', 'GUARDIAN_CHESTPLATE', 'CREEPER_LEGGINGS', 'SPIDER_BOOTS'];
export const MONSTER_HUNTER_MULTIPLIER = 1.25;

export const MONSTER_RAIDER_SET = ['SKELETON_HELMET', 'GUARDIAN_CHESTPLATE', 'CREEPER_LEGGINGS', 'TARANTULA_BOOTS'];
export const MONSTER_RAIDER_MULTIPLIER = 1.35;

// `slots` is ARMOR_SLOTS or EQUIPMENT_SLOTS, matched positionally against `setIds`.
export function hasFullSet(loadout, slots, setIds) {
  return slots.every((slot, i) => loadout[slot]?.item?.id === setIds[i]);
}

// How many of `setIds`' pieces are currently equipped, regardless of slot completeness — for
// partial-set bonuses (e.g. Infernal Crimson's 2-piece damage stacks) rather than full-set-only ones.
export function countSetPieces(loadout, slots, setIds) {
  return slots.reduce((count, slot, i) => count + (loadout[slot]?.item?.id === setIds[i] ? 1 : 0), 0);
}

// The top-tier ("Infernal") upgrade of Crimson Armor — the only variant/tier this app currently
// has a damage mechanic tied to (a 1-10 player-entered "combo stack" slider, +10%/stack additive
// damage up to +100%, shown only once 2+ pieces are equipped — see pages/DamageSources.jsx).
export const INFERNAL_CRIMSON_SET = [
  'INFERNAL_CRIMSON_HELMET',
  'INFERNAL_CRIMSON_CHESTPLATE',
  'INFERNAL_CRIMSON_LEGGINGS',
  'INFERNAL_CRIMSON_BOOTS',
];
export const INFERNAL_CRIMSON_MIN_PIECES = 2;
export const INFERNAL_CRIMSON_MAX_STACKS = 10;
export const INFERNAL_CRIMSON_PERCENT_PER_STACK = 10;

// Strong Dragon (full set) + Aspect of the End/Void weapon: +75 flat Damage.
export const STRONG_DRAGON_SET = ['STRONG_DRAGON_HELMET', 'STRONG_DRAGON_CHESTPLATE', 'STRONG_DRAGON_LEGGINGS', 'STRONG_DRAGON_BOOTS'];
export const STRONG_DRAGON_ASPECT_WEAPON_IDS = ['ASPECT_OF_THE_END', 'ASPECT_OF_THE_VOID'];
export const STRONG_DRAGON_DAMAGE_BONUS = 75;

// Superior Dragon (full set): +5% Strength/Crit Chance/Crit Damage, applied as a final
// multiplier on the fully-summed (Base) Stats total (same mechanism as Unlimited Power/Energy).
export const SUPERIOR_DRAGON_SET = [
  'SUPERIOR_DRAGON_HELMET',
  'SUPERIOR_DRAGON_CHESTPLATE',
  'SUPERIOR_DRAGON_LEGGINGS',
  'SUPERIOR_DRAGON_BOOTS',
];
export const SUPERIOR_DRAGON_STAT_BOOST_PERCENT = 5;

// Tuxedo: 3 independent tiers (Boots/Chestplate/Leggings each — no Helmet exists), each tier's
// own bonus applies unconditionally whenever any single piece of that tier is worn, and tiers
// stack with each other (e.g. wearing one Elegant + one Fancy + one Cheap piece grants all 3).
export const TUXEDO_TIERS = [
  { name: 'Elegant', ids: ['ELEGANT_TUXEDO_BOOTS', 'ELEGANT_TUXEDO_CHESTPLATE', 'ELEGANT_TUXEDO_LEGGINGS'], damagePercent: 150 },
  { name: 'Fancy', ids: ['FANCY_TUXEDO_BOOTS', 'FANCY_TUXEDO_CHESTPLATE', 'FANCY_TUXEDO_LEGGINGS'], damagePercent: 100 },
  { name: 'Cheap', ids: ['CHEAP_TUXEDO_BOOTS', 'CHEAP_TUXEDO_CHESTPLATE', 'CHEAP_TUXEDO_LEGGINGS'], damagePercent: 50 },
];

// Whether any equipped armor piece's id is in `ids` — Tuxedo pieces aren't positionally fixed
// (any tier can go in Boots/Chestplate/Leggings), unlike hasFullSet/countSetPieces above.
export function hasAnyEquippedId(loadout, slots, ids) {
  return slots.some((slot) => ids.includes(loadout[slot]?.item?.id));
}

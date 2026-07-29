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

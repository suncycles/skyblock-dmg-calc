// Full-armor/equipment-set damage bonuses — real NEU-REPO ids/values
// fetched this session, keyed in ARMOR_SLOTS/EQUIPMENT_SLOTS order
// (helmet/chestplate/leggings/boots, necklace/cloak/belt/gloves) so
// membership can be checked positionally against the loadout.

// Final Destination's own real lore: "Full Set Bonus: Vivacious
// Darkness (0/4) — Costs 2 Soulflow per 5s in combat while sneaking:
// +30 Strength, +20 Attack Speed, +10 Speed, Multiply Intelligence by
// 1.25x, +200 Ferocity against Endermen, +100% damage against
// Endermen." The Soulflow-cost/sneaking gate is treated as always
// active (same "assumed uptime" precedent as Dominance/Warden Helmet);
// only the two damage-relevant pieces are modeled — Strength
// unconditional, the +100% damage kept scoped to Ender-type mobs
// exactly as the real ability describes (not a blanket bonus).
export const FINAL_DESTINATION_SET = [
  'FINAL_DESTINATION_HELMET',
  'FINAL_DESTINATION_CHESTPLATE',
  'FINAL_DESTINATION_LEGGINGS',
  'FINAL_DESTINATION_BOOTS',
];
export const FINAL_DESTINATION_STRENGTH = 30;
export const FINAL_DESTINATION_ENDER_DAMAGE_PERCENT = 100;

// `slots` is ARMOR_SLOTS or EQUIPMENT_SLOTS (positionally matched
// against `setIds`); `loadout` is BuildContext's own loadout object.
export function hasFullSet(loadout, slots, setIds) {
  return slots.every((slot, i) => loadout[slot]?.item?.id === setIds[i]);
}

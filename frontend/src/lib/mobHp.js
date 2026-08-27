// Mob HP — base health for every mob, sourced from hypixelskyblock.minecraft.wiki's per-mob
// wikitext (same wiki lib/mobTypes.js and lib/mobLocations.js were built from), parsed
// programmatically from its {{Stat|hp}}/InfoboxMobStats/Mob Variants templates — not
// approximated. A mob absent from MOB_HP has no exact number confirmed yet (see
// docs/mob-hp-followups.md for what's outstanding and why).
//
// Three shapes:
//  - flat:    { hp: 100 }                                      — a single constant HP.
//  - tiered:  { tiers: [{ label: 'Tier I', hp: 500 }, ...] }    — Slayer bosses (Tier I-V),
//             Kuudra-family redirects, Mythological burrow mobs (tiered by spawn rarity, not
//             a Slayer-style tier — check the label), and a few named boss variants.
//  - dungeon: { dungeon: { normal: { I: hp, ... }, master: { I: hp, ... } } }
//             — Catacombs mobs, keyed by roman-numeral floor within each of the two Modes.
//             Not every mob has every floor (e.g. Apostle only spawns on Master VII).
import MOB_HP from './mobHp.json';

export { MOB_HP };

export function isFlatMobHp(entry) {
  return !!entry && typeof entry.hp === 'number';
}

export function isTieredMobHp(entry) {
  return !!entry && Array.isArray(entry.tiers);
}

export function isDungeonMobHp(entry) {
  return !!entry && !!entry.dungeon;
}

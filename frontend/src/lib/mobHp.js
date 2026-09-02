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
//
// A mid-fight phase transformation (mob name "X (Phase 2)", e.g. Bonzo/The Professor) never gets
// its own MOB_HP entry — resolveStartingHp below falls back to the base name's entry, since a
// phase change isn't a new encounter with its own HP pool.
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

// A "(Phase N)" name (lib/mobTypes.js's Bonzo (Phase 2)/The Professor (Phase 2), etc.) is a real
// mid-fight transformation — a different combat type and model, hence its own MOB_TYPES/
// mobModelIcons entry — but not a separate encounter with its own HP pool: the transition happens
// at a % HP threshold within the SAME fight, so its starting HP is definitionally its base phase's.
// Stripped here so a new phase entry never needs (and can't drift from) its own duplicated MOB_HP
// number — user-specified 2026-09-01: "phase 2 should stem from the initial entry itself."
function stripPhaseSuffix(mobName) {
  return mobName.replace(/\s*\(Phase \d+\)$/, '');
}

// Fixed display order for dungeon floor keys — JSON key order should already match this (the
// wiki-fetch pass wrote them low-to-high), but a consumer picking a floor to show in a dropdown
// shouldn't depend on that; this guarantees "I" before "II" regardless.
const FLOOR_ORDER = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

// The floor choices available for a dungeon-shaped mob in the given Mode, in display order — null
// when the mob isn't dungeon-shaped or has no entries for that Mode. Used to render a Floor picker
// (lib/mobHp.js's resolveStartingHp's `floor` argument) for a mob that spawns on more than one
// floor with a different HP each time, e.g. Angry Archaeologist (every floor) vs Bonzo (Floor 1
// only, where this always returns a single-entry array — same data, no separate "unambiguous" path
// needed since the picker component itself only renders when there's more than one option).
export function getFloorOptions(mobName, useMasterMode) {
  const entry = MOB_HP[mobName] || MOB_HP[stripPhaseSuffix(mobName)];
  if (!isDungeonMobHp(entry)) return null;
  const modeTable = useMasterMode ? entry.dungeon.master : entry.dungeon.normal;
  if (!modeTable) return null;
  return FLOOR_ORDER.filter((f) => modeTable[f] != null);
}

// The tier choices available for a tiered mob (Slayer bosses Tier I-V, Mythological burrow mobs by
// spawn rarity, etc.) — null when the mob isn't tiered. Returns the raw {label, hp} entries in
// their stored (already-ordered) sequence.
export function getTierOptions(mobName) {
  const entry = MOB_HP[mobName] || MOB_HP[stripPhaseSuffix(mobName)];
  if (!isTieredMobHp(entry)) return null;
  return entry.tiers;
}

// A real starting HP for the hit-by-hit DPS simulation (lib/finalDamage.js's simulateHitByHit).
// Flat mobs always resolve. Dungeon/tiered mobs resolve unconditionally when there's exactly one
// floor/tier on the relevant side (e.g. Bonzo's single Floor-1 entry, Apostle's single Master-VII
// entry). When there's more than one, `selection` — a floor roman numeral ("III") or a tier label
// ("Tier III"), from a Floor/Tier picker the caller renders using getFloorOptions/getTierOptions —
// picks the specific one; without a selection this returns null rather than silently guessing.
export function resolveStartingHp(mobName, useMasterMode, selection) {
  const entry = MOB_HP[mobName] || MOB_HP[stripPhaseSuffix(mobName)];
  if (isFlatMobHp(entry)) return entry.hp;
  if (isDungeonMobHp(entry)) {
    const modeTable = useMasterMode ? entry.dungeon.master : entry.dungeon.normal;
    if (!modeTable) return null;
    const floors = Object.keys(modeTable);
    if (floors.length === 1) return modeTable[floors[0]];
    return selection && modeTable[selection] != null ? modeTable[selection] : null;
  }
  if (isTieredMobHp(entry)) {
    if (entry.tiers.length === 1) return entry.tiers[0].hp;
    const found = selection && entry.tiers.find((t) => t.label === selection);
    return found ? found.hp : null;
  }
  return null;
}

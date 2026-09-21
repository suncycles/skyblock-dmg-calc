// Base HP per mob, in three shapes:
//  - flat:    { hp: 100 }
//  - tiered:  { tiers: [{ label: 'Tier I', hp: 500 }, ...] }
//  - dungeon: { dungeon: { normal: { I: hp, ... }, master: { I: hp, ... } } }
// A mob with no entry has no known HP. An "X (Phase 2)" name resolves to its base entry.
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

// Strips a "(Phase N)" suffix: a phase shares the base name's HP pool.
function stripPhaseSuffix(mobName) {
  return mobName.replace(/\s*\(Phase \d+\)$/, '');
}

// Display order for dungeon floor keys.
const FLOOR_ORDER = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

// Floor choices for a dungeon-shaped mob in the given Mode, in display order; null otherwise.
export function getFloorOptions(mobName, useMasterMode) {
  const entry = MOB_HP[mobName] || MOB_HP[stripPhaseSuffix(mobName)];
  if (!isDungeonMobHp(entry)) return null;
  const modeTable = useMasterMode ? entry.dungeon.master : entry.dungeon.normal;
  if (!modeTable) return null;
  return FLOOR_ORDER.filter((f) => modeTable[f] != null);
}

// Tier choices for a tiered mob as {label, hp} entries in stored order; null otherwise.
export function getTierOptions(mobName) {
  const entry = MOB_HP[mobName] || MOB_HP[stripPhaseSuffix(mobName)];
  if (!isTieredMobHp(entry)) return null;
  return entry.tiers;
}

// Highest tier of a Slayer boss - the tiered mobs whose labels form the "Tier I-V" ladder.
// Tiered mobs labelled by spawn rarity or variant return null.
export function defaultTierSelection(mobName) {
  const tiers = getTierOptions(mobName);
  if (!tiers || tiers.length < 2) return null;
  return tiers.every((t) => /^Tier /.test(t.label)) ? tiers[tiers.length - 1].label : null;
}

// Starting HP for the hit-by-hit simulation. Flat mobs, and dungeon/tiered mobs with a single
// floor/tier, always resolve; otherwise `selection` picks the floor ("III") or tier ("Tier III").
// A Slayer boss without a selection uses its highest tier; anything else returns null.
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
    const picked = selection && entry.tiers.some((t) => t.label === selection) ? selection : defaultTierSelection(mobName);
    const found = entry.tiers.find((t) => t.label === picked);
    return found ? found.hp : null;
  }
  return null;
}

// The five Catacombs classes and the damage stats each grants. Healer and Tank grant none, so they
// share one entry that computes exactly as no class does.
//
// Every bonus here applies ONLY while the Dungeon toggle is on - the classes exist only inside
// Catacombs, so `dungeonClassStats` returns the empty set when that toggle is off.
//
// Each class splits into a passive granted at class level 0 and a per-level bonus accruing to
// level 50.

export const MAX_DUNGEON_CLASS_LEVEL = 50;

// Healer/Tank is the default: it grants nothing, so a build that never picks a class computes the
// same numbers it did before classes existed.
export const DEFAULT_DUNGEON_CLASS = 'healer_tank';

// The neutral cube, shown while no class is in effect - outside a dungeon, where every class grants
// nothing. Each class's own icon is the same cube in that class's colour.
export const DUNGEON_CLASS_NEUTRAL_ICON = '/images/manual/select_class.webp';

// `id` matches Hypixel's own `player_classes` keys where one exists (Berserker is "berserk"), so an
// import maps straight across. Healer and Tank are merged into one id with no Hypixel counterpart.
export const DUNGEON_CLASSES = [
  { id: 'mage', label: 'Mage', hypixelKeys: ['mage'], icon: '/images/manual/mage_mode.webp' },
  { id: 'archer', label: 'Archer', hypixelKeys: ['archer'], icon: '/images/manual/arch_mode.webp' },
  { id: 'berserk', label: 'Berserker', hypixelKeys: ['berserk'], icon: '/images/manual/bers_mode.webp' },
  { id: 'healer_tank', label: 'Healer / Tank', hypixelKeys: ['healer', 'tank'], icon: '/images/manual/healtank_mode.webp' },
];

export function dungeonClassIcon(classId) {
  return DUNGEON_CLASSES.find((c) => c.id === classId)?.icon || DUNGEON_CLASS_NEUTRAL_ICON;
}

const CLASS_IDS = new Set(DUNGEON_CLASSES.map((c) => c.id));
export function isDungeonClassId(id) {
  return CLASS_IDS.has(id);
}

// Mage: +500 Intelligence and +10 Ability Damage at level 0, reaching +750 and +20 at level 50.
const MAGE_BASE_INTELLIGENCE = 500;
const MAGE_INTELLIGENCE_PER_LEVEL = 5;
const MAGE_BASE_ABILITY_DAMAGE = 10;
const MAGE_LEVELS_PER_ABILITY_DAMAGE = 5;

// Archer: arrows x3.0 rising to x3.8, melee a flat x0.75, and a bonus-arrow chance from 50% to 100%.
const ARCHER_ARROW_PERCENT = 200;
const ARCHER_ARROW_PERCENT_PER_LEVEL = 1.6;
const ARCHER_MELEE_MULTIPLIER = 0.75;
const ARCHER_BONUS_ARROW_CHANCE = 0.5;
const ARCHER_BONUS_ARROW_CHANCE_PER_LEVEL = 0.01;

// Berserker: melee x1.8 rising to x2.175, and an opening-hit x1.4 rising to x1.775 that applies to
// melee, ranged and ability damage alike.
const BERSERK_MELEE_PERCENT = 80;
const BERSERK_MELEE_PERCENT_PER_LEVEL = 0.75;
const BERSERK_FIRST_HIT_PERCENT = 40;
const BERSERK_FIRST_HIT_PERCENT_PER_LEVEL = 0.75;

// Lust for Blood: an ADDITIVE damage bonus that BUILDS over a fight, a stack at a time. A melee hit
// gains 5x the per-stack scaling and a ranged hit 1x, both clamped at a cap that grows +70 every 5
// class levels (250 at level 0, 950 at level 50) - so melee crosses the cap within a couple of hits
// while ranged climbs for most of a fight. A single-hit number shows one stack's worth.
const LUST_FOR_BLOOD_PERCENT = 30;
const LUST_FOR_BLOOD_PERCENT_PER_LEVEL = 3;
const LUST_FOR_BLOOD_MELEE_SCALING = 5;
const LUST_FOR_BLOOD_RANGED_SCALING = 1;
const LUST_FOR_BLOOD_BASE_CAP = 250;
const LUST_FOR_BLOOD_CAP_PER_STEP = 70;
const LUST_FOR_BLOOD_LEVELS_PER_CAP_STEP = 5;

export function lustForBloodCap(level) {
  const clamped = clampLevel(level);
  return LUST_FOR_BLOOD_BASE_CAP + LUST_FOR_BLOOD_CAP_PER_STEP * Math.floor(clamped / LUST_FOR_BLOOD_LEVELS_PER_CAP_STEP);
}

function clampLevel(level) {
  return Math.max(0, Math.min(MAX_DUNGEON_CLASS_LEVEL, Math.floor(level || 0)));
}

// Every field a class can grant, all inert. Each class below sets only what it changes, so a caller
// reads the same shape whichever class is picked.
function emptyClassStats() {
  return {
    // Flat grants merged into baseStats.
    intelligence: 0,
    ability_damage: 0,
    // Multiplicative, scoped: melee hits, arrows, and the opening hit of any damage kind.
    meleeMultiplier: 1,
    arrowMultiplier: 1,
    firstHitMultiplier: 1,
    // Lust for Blood. The *Percent pair is one stack's worth, already capped, which is what a
    // single-hit number shows; the *PerHitPercent pair is the same value uncapped, so the hit-by-hit
    // simulation can multiply it by the hit number and clamp at the cap itself as stacks build.
    lustForBloodMeleePercent: 0,
    lustForBloodRangedPercent: 0,
    lustForBloodMeleePerHitPercent: 0,
    lustForBloodRangedPerHitPercent: 0,
    lustForBloodCapPercent: 0,
    // Expected extra arrows per volley (0-1), on top of Duplex and Terminator's own 3.
    bonusArrowChance: 0,
  };
}

// The stats `classId` grants at `level`. `inDungeon` false returns the empty set: class bonuses only
// exist inside Catacombs, so every non-dungeon calculation is untouched by the class picker.
export function dungeonClassStats(classId, level, inDungeon) {
  const stats = emptyClassStats();
  if (!inDungeon || !isDungeonClassId(classId)) return stats;
  const lvl = clampLevel(level);

  if (classId === 'mage') {
    stats.intelligence = MAGE_BASE_INTELLIGENCE + MAGE_INTELLIGENCE_PER_LEVEL * lvl;
    stats.ability_damage = MAGE_BASE_ABILITY_DAMAGE + Math.floor(lvl / MAGE_LEVELS_PER_ABILITY_DAMAGE);
    return stats;
  }

  if (classId === 'archer') {
    stats.arrowMultiplier = 1 + (ARCHER_ARROW_PERCENT + ARCHER_ARROW_PERCENT_PER_LEVEL * lvl) / 100;
    stats.meleeMultiplier = ARCHER_MELEE_MULTIPLIER;
    stats.bonusArrowChance = Math.min(1, ARCHER_BONUS_ARROW_CHANCE + ARCHER_BONUS_ARROW_CHANCE_PER_LEVEL * lvl);
    return stats;
  }

  if (classId === 'berserk') {
    stats.meleeMultiplier = 1 + (BERSERK_MELEE_PERCENT + BERSERK_MELEE_PERCENT_PER_LEVEL * lvl) / 100;
    stats.firstHitMultiplier = 1 + (BERSERK_FIRST_HIT_PERCENT + BERSERK_FIRST_HIT_PERCENT_PER_LEVEL * lvl) / 100;
    const perStack = LUST_FOR_BLOOD_PERCENT + LUST_FOR_BLOOD_PERCENT_PER_LEVEL * lvl;
    const cap = lustForBloodCap(lvl);
    stats.lustForBloodMeleePerHitPercent = perStack * LUST_FOR_BLOOD_MELEE_SCALING;
    stats.lustForBloodRangedPerHitPercent = perStack * LUST_FOR_BLOOD_RANGED_SCALING;
    stats.lustForBloodCapPercent = cap;
    stats.lustForBloodMeleePercent = Math.min(cap, stats.lustForBloodMeleePerHitPercent);
    stats.lustForBloodRangedPercent = Math.min(cap, stats.lustForBloodRangedPerHitPercent);
    return stats;
  }

  return stats; // healer_tank
}

export function dungeonClassLabel(classId) {
  return DUNGEON_CLASSES.find((c) => c.id === classId)?.label || null;
}

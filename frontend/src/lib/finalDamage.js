// Final Damage against a specific target mob.
//
//   InitialDamage = (5 + WeaponDMG) * (1 + Strength/100)
//   FinalDamage   = floor((InitialDamage * AdditiveMultiplier * WeaponBonusMultiplier * MultiplicativeMultiplier + BonusModifiers) * (1 + CritDamage/100))
//
// AdditiveMultiplier = 1 + (every applicable % bonus, summed) — enchants and ability-text
// bonuses, all just added together. Maps onto damageSources.js's additiveNonConditional +
// matching additiveConditional entries. Does NOT include the equipped weapon's own "+X%
// damage" ability — see WeaponBonusMultiplier below.
//
// WeaponBonusMultiplier = 1 + (the equipped weapon's own "+X% damage" ability bonuses,
// summed) — its own independent factor, e.g. Atomsplit Katana's "+300% damage to Endermen" is
// a weaponBonus of 300, a (1+3) = 4x factor. Maps onto weaponBonusNonConditional + matching weaponBonusConditional entries.
//
// MultiplicativeMultiplier = product of every other "x" bonus (Crown of Avarice, Skyblock
// Level, armor-set bonuses) — genuinely multiplies rather than adds. Maps onto the multiplicative bucket.
//
// BonusModifiers is a flat amount added after the additive/multiplicative stage but still
// scaled by Crit Damage (Soul Eater, End Stone Bow, etc.) — none of these are modeled yet, so always 0.
//
// Unlimited Power/Unlimited Energy apply after everything else as true multipliers on the
// fully-summed Strength/Crit Damage — baked directly into baseStats by damageSources.js's
// collectAttributeEntries, so this formula just reads baseStats as-is.
//
// Formula source: https://hypixel-skyblock.fandom.com/wiki/Damage_Calculation

import { MOB_TYPE_SYMBOLS } from './damageSymbols';
import { resolveMobKey, SEA_CREATURE_MOBS, LAVA_SEA_CREATURE_MOBS } from './mobTypes';
import { computeSkyblockLevelMultiplier } from './playerStats';
import { ABILITY_DAMAGE_TABLE, LOVING_REFORGE_NAME, LOVING_ABILITY_DAMAGE_MULTIPLIER } from './abilityDamage';

const KNOWN_TYPE_NAMES = new Set(Object.keys(MOB_TYPE_SYMBOLS).map((t) => t.toLowerCase()));
const SEA_CREATURE_KEYS = new Set(SEA_CREATURE_MOBS.map((name) => resolveMobKey(name)).filter(Boolean));
const LAVA_SEA_CREATURE_KEYS = new Set(LAVA_SEA_CREATURE_MOBS.map((name) => resolveMobKey(name)).filter(Boolean));

// A `condition` string is comma-separated ("Undead, Skeletal, Wither"); each token is either
// a canonical Mob Type name (matched against the target's own types), the collective "Sea
// Creatures" grouping (Flaming Flay/Soul Whip) or its narrower "Lava Sea Creatures" subset
// (Taurus Helmet/Flaming Chestplate/Moogma Leggings), or a literal mob name from an item
// ability's own text (e.g. "Blazes").
export function conditionMatchesMob(condition, mob) {
  if (!condition || !mob) return false;
  const mobKey = resolveMobKey(mob.name);
  return condition
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .some((token) => {
      const lower = token.toLowerCase();
      if (KNOWN_TYPE_NAMES.has(lower)) {
        return (mob.types || []).some((t) => t.toLowerCase() === lower);
      }
      if (lower === 'lava sea creatures' || lower === 'lava sea creature') {
        return mobKey != null && LAVA_SEA_CREATURE_KEYS.has(mobKey);
      }
      if (lower === 'sea creatures' || lower === 'sea creature') {
        return mobKey != null && SEA_CREATURE_KEYS.has(mobKey);
      }
      return mobKey != null && resolveMobKey(token) === mobKey;
    });
}

// Picks which of damageSources.js's three parallel baseStats totals (normal / dungeonized /
// master-dungeonized) applies, per the useDungeonizedStats+useMasterMode toggles described above
// computeFinalDamage and computeAbilityDamage (both need this same selection).
function selectBaseStats(sources, useDungeonizedStats, useMasterMode) {
  if (!useDungeonizedStats) return sources.baseStats;
  return useMasterMode ? sources.masterDungeonizedBaseStats : sources.dungeonizedBaseStats;
}

// `sources` is damageSources.js's collectDamageSources() result; `mob` is {name, types}.
// Situational entries (formula-based, no live target HP state) are never included.
// `useDungeonizedStats` swaps in each dungeonized gear item's own Catacombs-scaled stat total
// (sources.dungeonizedBaseStats) in place of its normal one; `useMasterMode` (only meaningful
// alongside useDungeonizedStats) additionally folds in each item's Master Star delta — see lib/dungeonize.js.
export function computeFinalDamage(sources, mob, useDungeonizedStats = false, useMasterMode = false) {
  const { additiveNonConditional, additiveConditional, weaponBonusNonConditional, weaponBonusConditional, multiplicative } = sources;
  const baseStats = selectBaseStats(sources, useDungeonizedStats, useMasterMode);
  const appliedIds = new Set();

  let additivePercent = 0;
  for (const e of additiveNonConditional) {
    additivePercent += e.value;
    appliedIds.add(e.id);
  }
  for (const e of additiveConditional) {
    if (conditionMatchesMob(e.condition, mob)) {
      additivePercent += e.value;
      appliedIds.add(e.id);
    }
  }

  let weaponBonusPercent = 0;
  for (const e of weaponBonusNonConditional || []) {
    weaponBonusPercent += e.value;
    appliedIds.add(e.id);
  }
  for (const e of weaponBonusConditional || []) {
    if (conditionMatchesMob(e.condition, mob)) {
      weaponBonusPercent += e.value;
      appliedIds.add(e.id);
    }
  }

  let multiplicativeMultiplier = 1;
  for (const e of multiplicative) {
    if (!e.condition || conditionMatchesMob(e.condition, mob)) {
      multiplicativeMultiplier *= e.value;
      appliedIds.add(e.id);
    }
  }

  // No currently-modeled source populates this.
  const bonusModifiers = 0;

  const initialDamage = (5 + baseStats.damage) * (1 + baseStats.strength / 100);
  const additiveMultiplier = 1 + additivePercent / 100;
  const weaponBonusMultiplier = 1 + weaponBonusPercent / 100;
  const finalDamage = Math.floor(
    (initialDamage * additiveMultiplier * weaponBonusMultiplier * multiplicativeMultiplier + bonusModifiers) *
      (1 + baseStats.crit_damage / 100),
  );

  return {
    initialDamage,
    additiveMultiplier,
    additivePercent,
    weaponBonusMultiplier,
    weaponBonusPercent,
    multiplicativeMultiplier,
    bonusModifiers,
    finalDamage,
    appliedIds,
  };
}

// Mage Mode's Ability Damage formula — deliberately naive per the plan (see lib/abilityDamage.js):
//   InitialDamage = BaseAbilityDamage * (1 + (Intelligence/100) * AbilityScaling)
//   FinalDamage   = floor(InitialDamage * AdditiveMultiplier * MultiplicativeMultiplier)
// AdditiveMultiplier only counts entries tagged `abilityEligible`: Giant Killer, Execute,
// Prosecute, and the 7 real type-bane enchants (collectEnchantEntries), plus Golden Dragon's
// Legendary Treasure, Ender Dragon's End Strike, Zombie's Rotten Blade, and Wither Skeleton's
// Wither Blood (collectPetEntries) — every other additive source in the app (One For All,
// Swarm/Combo, other pet perks, etc.) is excluded on purpose.
// MultiplicativeMultiplier only counts Skyblock Level and a Loving-reforged Chestplate's +5%.
// No Crit Damage step — abilities don't crit in real Skyblock. No BonusModifiers term — nothing
// currently modeled maps to it, left at 0 rather than guessed.
// Returns null when the equipped weapon has no table entry (not an ability weapon).
export function computeAbilityDamage(sources, mob, loadout, playerStats, useDungeonizedStats = false, useMasterMode = false) {
  const table = ABILITY_DAMAGE_TABLE[loadout.weapon?.item?.id];
  if (!table) return null;

  const { additiveNonConditional, additiveConditional } = sources;
  const baseStats = selectBaseStats(sources, useDungeonizedStats, useMasterMode);

  let additivePercent = 0;
  for (const e of additiveNonConditional) {
    if (e.abilityEligible) additivePercent += e.value;
  }
  for (const e of additiveConditional) {
    if (e.abilityEligible && conditionMatchesMob(e.condition, mob)) additivePercent += e.value;
  }

  let multiplicativeMultiplier = computeSkyblockLevelMultiplier(playerStats?.skyblockLevel);
  if (loadout.chestplate?.modifiers?.reforge === LOVING_REFORGE_NAME) {
    multiplicativeMultiplier *= LOVING_ABILITY_DAMAGE_MULTIPLIER;
  }

  const initialDamage = table.base * (1 + (baseStats.intelligence / 100) * table.scaling);
  const additiveMultiplier = 1 + additivePercent / 100;
  const finalDamage = Math.floor(initialDamage * additiveMultiplier * multiplicativeMultiplier);

  return {
    baseDamage: table.base,
    scaling: table.scaling,
    initialDamage,
    additiveMultiplier,
    additivePercent,
    multiplicativeMultiplier,
    finalDamage,
  };
}

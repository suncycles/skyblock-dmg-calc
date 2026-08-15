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
import { ABILITY_DAMAGE_TABLE } from './abilityDamage';
import { getMobLocations } from './mobLocations';

const KNOWN_TYPE_NAMES = new Set(Object.keys(MOB_TYPE_SYMBOLS).map((t) => t.toLowerCase()));
const SEA_CREATURE_KEYS = new Set(SEA_CREATURE_MOBS.map((name) => resolveMobKey(name)).filter(Boolean));
const LAVA_SEA_CREATURE_KEYS = new Set(LAVA_SEA_CREATURE_MOBS.map((name) => resolveMobKey(name)).filter(Boolean));

// The Garden's mobs (Beetle, Cricket, Rat, ...) and the 4 Jerrys of Jerry's Workshop are joke
// sets — every one of them deals/takes a token amount of real damage in-game, so this calculator
// forces their Final Damage to 0 rather than modeling farming/event-specific mechanics. Checked
// by name before any other formula logic in every damage function below so it's a hard override,
// not just another multiplier.
const JOKE_LOCATIONS = new Set(['The Garden', "Jerry's Workshop"]);
function isJokeMob(mob) {
  return !!mob?.name && getMobLocations(mob.name).some((loc) => JOKE_LOCATIONS.has(loc));
}

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
  if (isJokeMob(mob)) {
    return {
      initialDamage: 0,
      additiveMultiplier: 1,
      additivePercent: 0,
      weaponBonusMultiplier: 1,
      weaponBonusPercent: 0,
      multiplicativeMultiplier: 1,
      bonusModifiers: 0,
      finalDamage: 0,
      appliedIds: new Set(),
    };
  }

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
// User-verified against real in-game numbers + spreadsheets (10000 base/0.3 scaling, 3057
// Intelligence, 33 Ability Damage stat, 466% additive, 5% multiplicative -> 803947 Final Damage):
//   Initial Damage = Base Ability Damage * (1 + Intelligence/100 * Scaling) * (1 + Ability Damage stat/100)
//   Final Damage   = Initial Damage * (1 + AdditivePercent/100) * MultiplicativeMultiplier
// `table.base` ("Base Ability Damage", e.g. Hyperion's fixed 10000) and `baseStats.ability_damage`
// ("Ability Damage" stat, e.g. from Wither Goggles) are two different things that both feed this
// formula — kept as separate variables/fields below so they never get conflated.
// AdditiveMultiplier only counts entries tagged `abilityEligible`: Giant Killer, Execute,
// Prosecute, the 7 real type-bane enchants (collectEnchantEntries), Ruler and Dominance
// attributes (collectAttributeEntries), Combat Level (Player), plus Golden Dragon's Legendary
// Treasure, Ender Dragon's End Strike, Zombie's Rotten Blade, and Wither Skeleton's Wither Blood
// (collectPetEntries) — every other additive source in the app (One For All, Swarm/Combo, other
// pet perks, etc.) is excluded on purpose.
// MultiplicativeMultiplier is the product of sources.abilityMultiplicative (built in
// damageSources.js): Skyblock Level, the Implosion Belt's 1.25x (Hyperion/Spirit Sceptre/Yeti
// Sword only), and the Loving reforge's 1.05x (chestplate-only; its bundled reforgeStats table
// lists a flat +5 "Ability Damage" stat, but that's user-confirmed to really be a 1.05x
// multiplier, so it's stripped out of baseStats.ability_damage in lib/reforges.js and pushed
// here instead) — deliberately its own bucket, not filtered from the melee `multiplicative`
// list, since most of that list doesn't apply here at all.
// `table.base` also picks up the equipped weapon's own GENERAL Catacombs Stats Boost
// (dungeonize.js's computeCatacombsBoostPercent — Catacombs Level curve + Stars + General's
// Medallion digits + Master Stars, the same formula every other real stat uses — stashed
// per-weapon on sources.abilityBaseDamageBoost by damageSources.js) as a `(1 + percent/100)`
// multiplier. Distinct from the real "Ability Damage" STAT (Wither Goggles etc.), which uses a
// separate no-curve-term formula — see CLAUDE.md. Only applied when useDungeonizedStats is on and
// the weapon itself is dungeonized (abilityBaseDamageBoost defaults to 0, i.e. a 1x no-op, otherwise).
// No Crit Damage step — abilities don't crit in real Skyblock. No BonusModifiers term — nothing
// currently modeled maps to it, left at 0 rather than guessed.
// Returns null when the equipped weapon has no table entry (not an ability weapon).
export function computeAbilityDamage(sources, mob, loadout, useDungeonizedStats = false, useMasterMode = false) {
  const weaponId = loadout.weapon?.item?.id;
  const table = ABILITY_DAMAGE_TABLE[weaponId];
  if (!table) return null;

  if (isJokeMob(mob)) {
    return {
      baseDamage: table.base,
      scaling: table.scaling,
      abilityDamageStat: 0,
      catacombsBoostPercent: 0,
      catacombsBoostMultiplier: 1,
      initialDamage: 0,
      additiveMultiplier: 1,
      additivePercent: 0,
      multiplicativeMultiplier: 1,
      finalDamage: 0,
    };
  }

  const { additiveNonConditional, additiveConditional, abilityMultiplicative } = sources;
  const baseStats = selectBaseStats(sources, useDungeonizedStats, useMasterMode);

  let additivePercent = 0;
  for (const e of additiveNonConditional) {
    if (e.abilityEligible) additivePercent += e.value;
  }
  for (const e of additiveConditional) {
    if (e.abilityEligible && conditionMatchesMob(e.condition, mob)) additivePercent += e.value;
  }

  let multiplicativeMultiplier = 1;
  for (const e of abilityMultiplicative) {
    if (!e.condition || conditionMatchesMob(e.condition, mob)) multiplicativeMultiplier *= e.value;
  }

  const abilityDamageStat = baseStats.ability_damage || 0;
  const catacombsBoostPercent = useDungeonizedStats
    ? (useMasterMode ? sources.abilityBaseDamageBoost?.withMaster : sources.abilityBaseDamageBoost?.withoutMaster) || 0
    : 0;
  const catacombsBoostMultiplier = 1 + catacombsBoostPercent / 100;
  const initialDamage =
    table.base * catacombsBoostMultiplier * (1 + (baseStats.intelligence / 100) * table.scaling) * (1 + abilityDamageStat / 100);
  const additiveMultiplier = 1 + additivePercent / 100;
  const finalDamage = Math.floor(initialDamage * additiveMultiplier * multiplicativeMultiplier);

  return {
    baseDamage: table.base,
    scaling: table.scaling,
    abilityDamageStat,
    catacombsBoostPercent,
    catacombsBoostMultiplier,
    initialDamage,
    additiveMultiplier,
    additivePercent,
    multiplicativeMultiplier,
    finalDamage,
  };
}

// Mage Staff "Beam": not a real item — a Mage Mode calculation feature that's always active,
// alongside (not instead of) the weapon's own Ability Damage. All melee weapon attacks also fire
// as a ranged beam dealing a cut of the character's full melee Final Damage (computeFinalDamage's
// output for the same mob), scaled up by Intelligence. User-provided formula:
//   BeamDamage = (MeleeFinalDamage * 0.3 + 5) * (0.09% * Intelligence)
// Independent of whether the equipped weapon has an ABILITY_DAMAGE_TABLE entry — unlike
// computeAbilityDamage, this never returns null for that reason. Uses the same dungeon/master-
// respective Intelligence as the rest of Mage Mode, via the shared selectBaseStats.
const MAGE_STAFF_BEAM_MELEE_PERCENT = 0.3;
const MAGE_STAFF_BEAM_FLAT_BONUS = 5;
const MAGE_STAFF_BEAM_INTELLIGENCE_PERCENT_PER_POINT = 0.0009;

export function computeMageStaffBeamDamage(sources, meleeFinalDamage, mob, useDungeonizedStats = false, useMasterMode = false) {
  const baseStats = selectBaseStats(sources, useDungeonizedStats, useMasterMode);
  const intelligence = baseStats.intelligence || 0;
  // Even with meleeFinalDamage already 0 (see isJokeMob in computeFinalDamage), the formula's
  // flat +5 bonus would still produce a nonzero beam — an explicit gate is needed here too.
  const finalDamage = isJokeMob(mob)
    ? 0
    : Math.floor(
        (meleeFinalDamage * MAGE_STAFF_BEAM_MELEE_PERCENT + MAGE_STAFF_BEAM_FLAT_BONUS) *
          (MAGE_STAFF_BEAM_INTELLIGENCE_PERCENT_PER_POINT * intelligence),
      );
  return { meleeFinalDamage, intelligence, finalDamage };
}

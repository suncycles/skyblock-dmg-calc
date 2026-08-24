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
import { hasFullSet, computeCrimsonSwipeInfo } from './armorSetBonuses';
import { ARMOR_SLOTS } from './armorSlots';

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

// Inferno Demonlord (Blaze Slayer Tier 4 boss) only takes real damage from the two Blaze Slayer
// dagger lines (Firedust->Burstfire->Heartfire, Twilight/Mawdust->Burstmaw->Heartmaw) — every
// other weapon deals it zero, in-game (user-confirmed 2026-08-23). Same hard-override treatment
// as isJokeMob above: checked before any real formula logic, not a bonus/penalty multiplier.
// ponytail: single hardcoded mob; generalize into a per-mob weapon allowlist if another one turns up.
const DAGGER_ONLY_MOBS = new Set(['Inferno Demonlord']);
const DAGGER_LINE_WEAPON_IDS = new Set([
  'FIREDUST_DAGGER', 'BURSTFIRE_DAGGER', 'HEARTFIRE_DAGGER',
  'MAWDUST_DAGGER', 'BURSTMAW_DAGGER', 'HEARTMAW_DAGGER',
]);
function isBlockedByDaggerRestriction(mob, weaponId) {
  return !!mob?.name && DAGGER_ONLY_MOBS.has(mob.name) && !DAGGER_LINE_WEAPON_IDS.has(weaponId);
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
// `excludeFirstHitOnly` drops First Strike/Triple Strike (damageSources.js's firstHitOnly-tagged
// entries) — used by computeDpsBreakdown below for its steady-state hit, since those enchants only
// fire on a fight's opening hit(s), not every hit.
export function computeFinalDamage(sources, mob, useDungeonizedStats = false, useMasterMode = false, excludeFirstHitOnly = false) {
  if (isJokeMob(mob) || isBlockedByDaggerRestriction(mob, sources.weaponId)) {
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
    if (excludeFirstHitOnly && e.firstHitOnly) continue;
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

  if (isJokeMob(mob) || isBlockedByDaggerRestriction(mob, weaponId)) {
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
      appliedIds: new Set(),
    };
  }

  const { additiveNonConditional, additiveConditional, abilityMultiplicative } = sources;
  const baseStats = selectBaseStats(sources, useDungeonizedStats, useMasterMode);
  const appliedIds = new Set();

  let additivePercent = 0;
  for (const e of additiveNonConditional) {
    if (e.abilityEligible) {
      additivePercent += e.value;
      appliedIds.add(e.id);
    }
  }
  for (const e of additiveConditional) {
    if (e.abilityEligible && conditionMatchesMob(e.condition, mob)) {
      additivePercent += e.value;
      appliedIds.add(e.id);
    }
  }

  let multiplicativeMultiplier = 1;
  for (const e of abilityMultiplicative) {
    if (!e.condition || conditionMatchesMob(e.condition, mob)) {
      multiplicativeMultiplier *= e.value;
      appliedIds.add(e.id);
    }
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
    appliedIds,
  };
}

// Mage Staff "Beam": not a real item — a Mage Mode calculation feature that's always active,
// alongside (not instead of) the weapon's own Ability Damage. All melee weapon attacks also fire
// as a ranged beam dealing a multiple of the character's full melee Final Damage
// (computeFinalDamage's output for the same mob), scaled up by Intelligence. User-confirmed
// formula (a flat -1 off the previous base multiplier, Intelligence rate unchanged):
//   BeamDamage = MeleeFinalDamage * (0.3 + 0.0009 * Intelligence)
// Independent of whether the equipped weapon has an ABILITY_DAMAGE_TABLE entry — unlike
// computeAbilityDamage, this never returns null for that reason. Uses the same dungeon/master-
// respective Intelligence as the rest of Mage Mode, via the shared selectBaseStats. Purely
// multiplicative on meleeFinalDamage, so a joke-mob's already-zeroed melee damage (see
// isJokeMob in computeFinalDamage) naturally zeroes the Beam too — no separate gate needed here.
const MAGE_STAFF_BEAM_BASE_MULTIPLIER = 0.3;
const MAGE_STAFF_BEAM_INTELLIGENCE_RATE = 0.0009;

export function computeMageStaffBeamDamage(sources, meleeFinalDamage, useDungeonizedStats = false, useMasterMode = false) {
  const baseStats = selectBaseStats(sources, useDungeonizedStats, useMasterMode);
  const intelligence = baseStats.intelligence || 0;
  const finalDamage = Math.floor(meleeFinalDamage * (MAGE_STAFF_BEAM_BASE_MULTIPLIER + MAGE_STAFF_BEAM_INTELLIGENCE_RATE * intelligence));
  return { meleeFinalDamage, intelligence, finalDamage };
}

// Crimson Swipe: a melee-only proc on meleeFinalDamage. `swipeInfo` is armorSetBonuses.js's
// computeCrimsonSwipeInfo() result (null when fewer than 2 Crimson-family pieces are worn, in
// which case this returns null too). User-confirmed real formula (2026-08-23), replacing an
// earlier flat-14.5%-of-Final-Damage placeholder:
//   Damage_swipe = MeleeFinal * (SwipeMultiplier * 100) / TotalAdditivePercent
// `additivePercent` is the same raw summed additive % computeFinalDamage already produces (e.g.
// 300 for +300%, NOT the 1+x/100 multiplier form) — the more additive damage % a player has
// already stacked, the smaller Swipe's own share of Final Damage. Guards the (rare, near-0-gear)
// divide-by-zero case rather than emitting Infinity/NaN.
export function computeCrimsonSwipeDamage(meleeFinalDamage, swipeInfo, additivePercent) {
  if (!swipeInfo || !additivePercent) return swipeInfo ? { ...swipeInfo, meleeFinalDamage, finalDamage: 0 } : null;
  const finalDamage = Math.floor(meleeFinalDamage * ((swipeInfo.multiplier * 100) / additivePercent));
  return { ...swipeInfo, meleeFinalDamage, finalDamage };
}

// Venomous: a per-hit-per-second proc. User-confirmed real formula:
//   BaseDamage = X% of (real melee) Final Damage
//   ProcDamage = BaseDamage * (product of every "ability-eligible" multiplier)
// "ability-eligible" is the same additive/multiplicative source set Mage Mode's Ability Damage
// formula counts (Giant Killer, Execute, the 7 type-bane enchants, Combat Level, Ruler/Dominance,
// etc. — see collectDamageSources' abilityEligible tagging), explicitly EXCLUDING Skyblock Level
// even though that's normally ability-eligible too (user-confirmed exclusion). Unlike
// computeAbilityDamage, this multiplies onto the already-fully-computed meleeFinalDamage rather
// than a from-scratch InitialDamage — meleeFinalDamage already has every real bonus baked in, and
// the ability-eligible multiplier is a real second application on top of that, per the confirmed formula.
// `sources.venomousProc` is null when Venomous isn't equipped, in which case this returns null too.
const VENOMOUS_EXCLUDED_MULTIPLICATIVE_ID = 'skyblock-level';

// Real Venomous mechanic: every landed hit adds its own independent DoT stack (not a refresh),
// stacking globally up to 40 — each active stack ticks the same per-hit ProcDamage on its own, so
// N stacks in flight deal N * ProcDamage per second. computeVenomousProcDamage above returns the
// single-stack (N=1) value; DamageSources.jsx's stack graph multiplies it out to this cap.
export const MAX_VENOMOUS_STACKS = 40;

// User-confirmed: Venomous' poison DoT doesn't apply to these bosses in-game (real mechanic, not
// a joke-mob/token-damage case — every other damage source still works normally against them).
const VENOMOUS_IMMUNE_MOBS = new Set(['Atoned Horror', 'Inferno Demonlord']);

export function computeVenomousProcDamage(sources, mob, meleeFinalDamage) {
  const proc = sources.venomousProc;
  if (!proc) return null;
  if (isJokeMob(mob) || VENOMOUS_IMMUNE_MOBS.has(mob?.name)) return { ...proc, finalDamage: 0 };

  const { additiveNonConditional, additiveConditional, abilityMultiplicative } = sources;

  let additivePercent = 0;
  for (const e of additiveNonConditional) {
    if (e.abilityEligible) additivePercent += e.value;
  }
  for (const e of additiveConditional) {
    if (e.abilityEligible && conditionMatchesMob(e.condition, mob)) additivePercent += e.value;
  }

  let multiplicativeMultiplier = 1;
  for (const e of abilityMultiplicative) {
    if (e.id === VENOMOUS_EXCLUDED_MULTIPLICATIVE_ID) continue;
    if (!e.condition || conditionMatchesMob(e.condition, mob)) multiplicativeMultiplier *= e.value;
  }

  const additiveMultiplier = 1 + additivePercent / 100;
  const baseDamage = meleeFinalDamage * (proc.percent / 100);
  const finalDamage = Math.floor(baseDamage * additiveMultiplier * multiplicativeMultiplier);

  return { ...proc, additiveMultiplier, multiplicativeMultiplier, baseDamage, finalDamage };
}

// Fire Aspect/Thunderlord: simple X% of real melee Final Damage per level — unlike Venomous
// above, no restricted modifier set, just a straight cut of the same finalDamage already shown.
// `proc` is sources.fireAspectProc/thunderlordProc (null when that enchant isn't equipped).
export function computeEnchantProcDamage(meleeFinalDamage, proc) {
  if (!proc) return null;
  return { ...proc, finalDamage: Math.floor(meleeFinalDamage * (proc.percent / 100)) };
}

// Melee hit rate isn't continuous in Bonus Attack Speed — real per-hit time only changes at these
// exact breakpoints, holding steady in between. User-provided real thresholds. Exported so
// lib/tuningOptimizer.js's auto-spend can target "just enough points to reach the next breakpoint"
// as a single lumpy move, instead of a naive per-point search that never sees a breakpoint's payoff
// (every individual point below the threshold shows zero gain on its own).
export const MELEE_HIT_RATE_BREAKPOINTS = [
  { threshold: 0, secondsPerHit: 0.5 },
  { threshold: 6, secondsPerHit: 0.45 },
  { threshold: 18, secondsPerHit: 0.4 },
  { threshold: 34, secondsPerHit: 0.35 },
  { threshold: 54, secondsPerHit: 0.3 },
  { threshold: 82, secondsPerHit: 0.25 },
  { threshold: 123, secondsPerHit: 0.2 },
];

// Bonus Attack Speed caps at 100, except the full 4-piece Thermodynamic Armor set raises it to 150.
const ATTACK_SPEED_CAP = 100;
const THERMODYNAMIC_ATTACK_SPEED_CAP = 150;
const THERMODYNAMIC_SET = ['THERMODYNAMIC_HELMET', 'THERMODYNAMIC_CHESTPLATE', 'THERMODYNAMIC_LEGGINGS', 'THERMODYNAMIC_BOOTS'];

// Melee hits/second at a given Bonus Attack Speed — looked up from the real breakpoint table
// above (not a continuous scale), capped before lookup.
export function computeMeleeHitsPerSecond(bonusAttackSpeed, loadout) {
  const cap = hasFullSet(loadout, ARMOR_SLOTS, THERMODYNAMIC_SET) ? THERMODYNAMIC_ATTACK_SPEED_CAP : ATTACK_SPEED_CAP;
  const clamped = Math.min(bonusAttackSpeed || 0, cap);
  let secondsPerHit = MELEE_HIT_RATE_BREAKPOINTS[0].secondsPerHit;
  for (const bp of MELEE_HIT_RATE_BREAKPOINTS) {
    if (clamped >= bp.threshold) secondsPerHit = bp.secondsPerHit;
  }
  return 1 / secondsPerHit;
}

// DPS Mode: turns each already-computed per-hit/per-proc damage number into damage-per-second by
// multiplying by its own real hit/proc rate. Melee's rate is the real breakpoint above (varies by
// loadout); the rest are user-provided fixed rates. A proc missing from `mobResult` (enchant/armor
// not equipped) contributes 0, same as it being absent from the melee Final Damage panel above.
export const DPS_HITS_PER_SECOND = {
  venomous: 1,
  thunderlord: 0.6,
  fireAspect: 1,
  crimsonSwipe: 1,
};

// `sources`/`mob` mirror computeFinalDamage's params (`useDungeonizedStats`/`useMasterMode` too);
// everything DPS-mode needs — steady-state melee hit plus every proc — is derived here from
// scratch rather than reusing a caller's already-computed melee-mode finalDamage/procs, since
// those bake in First Strike/Triple Strike's opening-hit-only bonus (see computeFinalDamage's
// excludeFirstHitOnly) which must NOT be multiplied into every hit/second below.
export function computeDpsBreakdown(sources, mob, loadout, useDungeonizedStats = false, useMasterMode = false) {
  const bonusAttackSpeed = sources.baseStats.bonus_attack_speed || 0;
  const meleeHitsPerSecond = computeMeleeHitsPerSecond(bonusAttackSpeed, loadout);
  const steadyFinalDamage = computeFinalDamage(sources, mob, useDungeonizedStats, useMasterMode, true);
  const meleeFinalDamage = steadyFinalDamage.finalDamage;
  const melee = meleeFinalDamage * meleeHitsPerSecond;
  const venomousProc = computeVenomousProcDamage(sources, mob, meleeFinalDamage);
  const thunderlordProc = computeEnchantProcDamage(meleeFinalDamage, sources.thunderlordProc);
  const fireAspectProc = computeEnchantProcDamage(meleeFinalDamage, sources.fireAspectProc);
  const crimsonSwipeProc = computeCrimsonSwipeDamage(
    meleeFinalDamage,
    computeCrimsonSwipeInfo(loadout, ARMOR_SLOTS),
    steadyFinalDamage.additivePercent,
  );
  const venomous = (venomousProc?.finalDamage || 0) * DPS_HITS_PER_SECOND.venomous;
  const thunderlord = (thunderlordProc?.finalDamage || 0) * DPS_HITS_PER_SECOND.thunderlord;
  const fireAspect = (fireAspectProc?.finalDamage || 0) * DPS_HITS_PER_SECOND.fireAspect;
  const crimsonSwipe = (crimsonSwipeProc?.finalDamage || 0) * DPS_HITS_PER_SECOND.crimsonSwipe;
  return {
    melee,
    venomous,
    thunderlord,
    fireAspect,
    crimsonSwipe,
    meleeHitsPerSecond,
    total: melee + venomous + thunderlord + fireAspect + crimsonSwipe,
    venomousProc,
    // Steady-state per-hit melee damage (excludes First Strike/Triple Strike) — exposed so
    // DamageSources.jsx's by-hit graph can compare it against the opening-hit(s)' real (boosted)
    // per-hit value to plot the DPS dip once those enchants stop applying.
    meleeFinalDamage,
  };
}

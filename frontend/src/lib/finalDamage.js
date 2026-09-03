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
import { getBestiaryStrengthBonus } from './bestiaryStrength';
import { hasFullSet, computeCrimsonSwipeInfo, FINAL_DESTINATION_STRENGTH, FINAL_DESTINATION_ATTACK_SPEED } from './armorSetBonuses';
import { ARMOR_SLOTS } from './armorSlots';
import { computeMobDamageReduction, computeMobMagicResistance, computeMobDefenseMultiplier } from './mobDefenses';

const KNOWN_TYPE_NAMES = new Set(Object.keys(MOB_TYPE_SYMBOLS).map((t) => t.toLowerCase()));
const SEA_CREATURE_KEYS = new Set(SEA_CREATURE_MOBS.map((name) => resolveMobKey(name)).filter(Boolean));
const LAVA_SEA_CREATURE_KEYS = new Set(LAVA_SEA_CREATURE_MOBS.map((name) => resolveMobKey(name)).filter(Boolean));

// The Garden's mobs (Beetle, Cricket, Rat, ...) and the 4 Jerrys of Jerry's Workshop are joke
// sets — every one of them deals/takes a token amount of real damage in-game, so this calculator
// forces their Final Damage to 0 rather than modeling farming/event-specific mechanics. Checked
// by name before any other formula logic in every damage function below so it's a hard override,
// not just another multiplier.
const JOKE_LOCATIONS = new Set(['The Garden', "Jerry's Workshop"]);
// The Watcher (guards the gate between Catacombs floors) is a real 0-HP, unkillable puzzle mob —
// same "player deals nothing" outcome as the location-based joke mobs above, so it's treated the
// same way despite not living in either joke-mob location itself (user-specified 2026-09-01).
const JOKE_MOB_NAMES = new Set(['The Watcher']);
function isJokeMob(mob) {
  if (!mob?.name) return false;
  return JOKE_MOB_NAMES.has(mob.name) || getMobLocations(mob.name).some((loc) => JOKE_LOCATIONS.has(loc));
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

// User-confirmed real mechanic (2026-08-31): mobs tagged "Shielded" in the Bestiary (see
// lib/mobTypes.js's MOB_TYPES) ignore every stat and take exactly 1 damage per hit, no matter
// what — from melee, abilities, the Mage Beam, and every enchant/armor proc alike. Unlike
// isJokeMob's force-to-0 above, forcing to 1 doesn't propagate for free through multiplication
// (1 * x !== 1), so every per-hit/per-proc function below checks this independently rather than
// relying on one upstream short-circuit.
function isShieldedMob(mob) {
  return !!mob?.types?.includes('Shielded');
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
// computeFinalDamage and computeAbilityDamage (both need this same selection) — then, if the mob
// being evaluated is of the real 'Mythological' type, swaps in the matching mythological* variant
// instead (Challenger's/Mythos Armor+Equipment's doubled stats — see damageSources.js's
// MYTHOLOGICAL_STAT_DOUBLE_IDS). `mob` is optional so callers with no specific mob in scope
// (there currently are none, but this keeps the function safe if that ever changes) just fall
// back to the non-mythological totals. Exported (only for scripts/verify-dungeon-and-enchant-
// behavior.mjs's own use) so the useDungeonizedStats/useMasterMode gating below — a spot that's
// already regressed once this session — can be regression-tested directly.
export function selectBaseStats(sources, useDungeonizedStats, useMasterMode, mob) {
  const isMythological = !!mob?.types?.includes('Mythological');
  // Master Stars' own stat bonus is gated behind `useMasterMode` on purpose — a player not
  // toggled into Master Mode Catacombs doesn't care about Master-Mode-relevant upgrades, Master
  // Stars included (user-specified 2026-09-01, reverting an earlier change this session that made
  // Master Stars apply off the Dungeon toggle alone — that let them "leak" into a normal-difficulty
  // read the player never asked for).
  const base = !useDungeonizedStats
    ? isMythological
      ? sources.mythologicalBaseStats
      : sources.baseStats
    : useMasterMode
      ? isMythological
        ? sources.mythologicalMasterDungeonizedBaseStats
        : sources.masterDungeonizedBaseStats
      : isMythological
        ? sources.mythologicalDungeonizedBaseStats
        : sources.dungeonizedBaseStats;
  // Real per-mob Bestiary "leveling reward" Strength bonus (lib/bestiaryStrength.js) — silently
  // applied once the specific selected mob's own max tier is confirmed maxed via a real Hypixel
  // import (sources.bestiaryMaxedMobs). Added here, AFTER collectDamageSources already fully
  // resolved every statsMultiplier source (Superior Dragon/Unlimited Power/etc all run inside
  // collectBaseStats/collectAttributeEntries, well before this function is ever called), so it's
  // deliberately excluded from what those multipliers scale off of — user-specified 2026-08-26.
  const bestiaryBonus = getBestiaryStrengthBonus(mob?.name, sources.bestiaryMaxedMobs);
  const withBestiary = bestiaryBonus ? { ...base, strength: (base.strength || 0) + bestiaryBonus } : base;
  // Final Destination's Vivacious Darkness Strength/Attack Speed only activates against
  // Ender-type mobs in real gameplay (user-confirmed 2026-08-27) — not just its +100% Ender
  // damage line (damageSources.js's additiveConditional entry, gated the normal way).
  const isEnder = !!mob?.types?.includes('Ender');
  if (!sources.hasFinalDestinationFullSet || !isEnder) return withBestiary;
  return {
    ...withBestiary,
    strength: (withBestiary.strength || 0) + FINAL_DESTINATION_STRENGTH,
    bonus_attack_speed: (withBestiary.bonus_attack_speed || 0) + FINAL_DESTINATION_ATTACK_SPEED,
  };
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
      damageReductionPercent: 0,
      mobDefenseMultiplier: 1,
      finalDamage: 0,
      finalDamageNonCrit: 0,
      appliedIds: new Set(),
    };
  }

  if (isShieldedMob(mob)) {
    return {
      initialDamage: 0,
      additiveMultiplier: 1,
      additivePercent: 0,
      weaponBonusMultiplier: 1,
      weaponBonusPercent: 0,
      multiplicativeMultiplier: 1,
      bonusModifiers: 0,
      damageReductionPercent: 0,
      mobDefenseMultiplier: 1,
      finalDamage: 1,
      finalDamageNonCrit: 1,
      appliedIds: new Set(),
    };
  }

  const { additiveNonConditional, additiveConditional, weaponBonusNonConditional, weaponBonusConditional, multiplicative } = sources;
  const baseStats = selectBaseStats(sources, useDungeonizedStats, useMasterMode, mob);
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
  // Mob-side Damage Reduction and Defense (lib/mobDefenses.js) — both direct final multipliers
  // applying to ANY dealt damage, so they're the very last step here. Everything derived from
  // this melee finalDamage (DPS breakdown's procs, Mage Beam) automatically inherits them too, no
  // separate application needed there.
  const damageReductionPercent = computeMobDamageReduction(mob, sources.isGriffinPet);
  const mobDefenseMultiplier = computeMobDefenseMultiplier(mob, useMasterMode);
  const preCritDamage = initialDamage * additiveMultiplier * weaponBonusMultiplier * multiplicativeMultiplier + bonusModifiers;
  const finalDamage = Math.floor(preCritDamage * (1 + baseStats.crit_damage / 100) * (1 - damageReductionPercent / 100) * mobDefenseMultiplier);
  // Same formula as finalDamage, minus the Crit Damage factor — a non-critical hit's real damage.
  // Stored for computeDpsBreakdown's crit-chance-weighted DPS below; not shown as its own panel.
  const finalDamageNonCrit = Math.floor(preCritDamage * (1 - damageReductionPercent / 100) * mobDefenseMultiplier);

  return {
    initialDamage,
    additiveMultiplier,
    additivePercent,
    weaponBonusMultiplier,
    weaponBonusPercent,
    multiplicativeMultiplier,
    bonusModifiers,
    damageReductionPercent,
    mobDefenseMultiplier,
    finalDamage,
    finalDamageNonCrit,
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
      damageReductionPercent: 0,
      magicResistancePercent: 0,
      mobDefenseMultiplier: 1,
      finalDamage: 0,
      appliedIds: new Set(),
    };
  }

  if (isShieldedMob(mob)) {
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
      damageReductionPercent: 0,
      magicResistancePercent: 0,
      mobDefenseMultiplier: 1,
      finalDamage: 1,
      appliedIds: new Set(),
    };
  }

  const { additiveNonConditional, additiveConditional, abilityMultiplicative } = sources;
  const baseStats = selectBaseStats(sources, useDungeonizedStats, useMasterMode, mob);
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
  // Mob-side Damage Reduction and Defense apply to ANY damage (see computeFinalDamage); Magic
  // Resistance is Ability-damage-only — all three lib/mobDefenses.js, all direct final multipliers.
  const damageReductionPercent = computeMobDamageReduction(mob, sources.isGriffinPet);
  const magicResistancePercent = computeMobMagicResistance(mob);
  const mobDefenseMultiplier = computeMobDefenseMultiplier(mob, useMasterMode);
  const finalDamage = Math.floor(
    initialDamage *
      additiveMultiplier *
      multiplicativeMultiplier *
      (1 - damageReductionPercent / 100) *
      (1 - magicResistancePercent / 100) *
      mobDefenseMultiplier,
  );

  return {
    baseDamage: table.base,
    scaling: table.scaling,
    abilityDamageStat,
    catacombsBoostPercent,
    catacombsBoostMultiplier,
    initialDamage,
    additiveMultiplier,
    additivePercent,
    damageReductionPercent,
    magicResistancePercent,
    mobDefenseMultiplier,
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

export function computeMageStaffBeamDamage(sources, mob, meleeFinalDamage, useDungeonizedStats = false, useMasterMode = false) {
  const baseStats = selectBaseStats(sources, useDungeonizedStats, useMasterMode, mob);
  const intelligence = baseStats.intelligence || 0;
  const finalDamage = isShieldedMob(mob)
    ? 1
    : Math.floor(meleeFinalDamage * (MAGE_STAFF_BEAM_BASE_MULTIPLIER + MAGE_STAFF_BEAM_INTELLIGENCE_RATE * intelligence));
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
export function computeCrimsonSwipeDamage(mob, meleeFinalDamage, swipeInfo, additivePercent) {
  if (!swipeInfo) return null;
  if (isShieldedMob(mob)) return { ...swipeInfo, meleeFinalDamage, finalDamage: 1 };
  if (!additivePercent) return { ...swipeInfo, meleeFinalDamage, finalDamage: 0 };
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
  if (isShieldedMob(mob)) return { ...proc, finalDamage: 1 };

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

// User-confirmed: Thunderlord's chain-lightning proc doesn't apply to Inferno Demonlord in-game —
// same "real per-mob immunity" case as VENOMOUS_IMMUNE_MOBS above, not a joke-mob/token-damage
// case (every other damage source, Fire Aspect included, still works normally against it).
const THUNDERLORD_IMMUNE_MOBS = new Set(['Inferno Demonlord']);

// Fire Aspect/Thunderlord: simple X% of real melee Final Damage per level — unlike Venomous
// above, no restricted modifier set, just a straight cut of the same finalDamage already shown.
// `proc` is sources.fireAspectProc/thunderlordProc (null when that enchant isn't equipped) — the
// two share this one function, so the Thunderlord-only immunity above is gated on `proc.id`'s own
// `-thunderlord` suffix (set in damageSources.js as `${slotLabel}-${entry.id}`) rather than a
// separate parameter, since every real caller already only ever passes one or the other.
export function computeEnchantProcDamage(mob, meleeFinalDamage, proc) {
  if (!proc) return null;
  if (proc.id?.endsWith('-thunderlord') && THUNDERLORD_IMMUNE_MOBS.has(mob?.name)) return { ...proc, finalDamage: 0 };
  if (isShieldedMob(mob)) return { ...proc, finalDamage: 1 };
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

// Duplex (Reiterate) ultimate enchant, bow-only: a guaranteed extra arrow dealing +4%/level of
// the first arrow's damage — real lore, confirmed level 1-5: 4/8/12/16/20% (level 5 -> 1.2x DPS,
// user-confirmed 2026-08-29). https://hypixelskyblock.minecraft.wiki/w/Duplex
const DUPLEX_DAMAGE_PERCENT_PER_LEVEL = 4;
function getDuplexLevel(loadout) {
  const ultimate = loadout.weapon?.modifiers?.ultimateEnchantment;
  return ultimate?.id?.toLowerCase() === 'ultimate_reiterate' ? ultimate.level || 0 : 0;
}

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

  // Crit-chance-weighted expected damage per arrow/hit: below 100% real Crit Chance, some hits
  // don't crit at all (finalDamageNonCrit instead of finalDamage); with Overload equipped on a
  // bow, any Crit Chance beyond 100% becomes a chance for that hit to be a guaranteed "Mega Crit"
  // instead of a normal crit (user-confirmed formula, 2026-08-29: OverloadChance = FinalCritChance
  // - 100, evaluated after every modifier including Terminator's divide-by-4 and Dungeon boosts).
  const critChance = selectBaseStats(sources, useDungeonizedStats, useMasterMode, mob).crit_chance || 0;
  const hasOverload = (sources.overloadBonusPercent || 0) > 0;
  const critHitChance = Math.min(Math.max(critChance, 0), 100) / 100;
  const megaCritChance = hasOverload ? Math.min(Math.max(0, critChance - 100), 100) / 100 : 0;
  const normalCritChance = critHitChance - megaCritChance;
  const nonCritChance = 1 - critHitChance;
  const expectedArrowDamage =
    nonCritChance * steadyFinalDamage.finalDamageNonCrit +
    normalCritChance * meleeFinalDamage +
    megaCritChance * meleeFinalDamage * (1 + (sources.overloadBonusPercent || 0) / 100);

  // Duplex/Terminator: Terminator's real lore ("Shoots 3 arrows at once") means its volley is 3x
  // the single-arrow expected damage. Duplex does not multiply all 3 arrows on Terminator — only
  // one of the three gets the Duplex bonus, the other two are unmultiplied (user-confirmed
  // 2026-08-29): arrow*(1+4%*level) + 2*arrow, instead of 3*arrow*(1+4%*level) elsewhere.
  const duplexLevel = getDuplexLevel(loadout);
  const isTerminator = loadout.weapon?.item?.id === 'TERMINATOR';
  // Real weapon category, exposed so DamageSources.jsx can label this whole DPS source "Arrow" vs
  // "Melee" instead of always saying "Melee" even for a Bow (user-specified 2026-09-01) — a real
  // loadout only ever has one weapon equipped, so the two labels are mutually exclusive by
  // construction, not something that needs its own separate row.
  const isBowWeapon = (loadout.weapon?.item?.category || '').toUpperCase().includes('BOW');
  const duplexMultiplier = 1 + (DUPLEX_DAMAGE_PERCENT_PER_LEVEL * duplexLevel) / 100;
  const bowVolleyDamage = isTerminator
    ? duplexLevel > 0
      ? expectedArrowDamage * duplexMultiplier + 2 * expectedArrowDamage
      : expectedArrowDamage * 3
    : expectedArrowDamage * duplexMultiplier;
  // Duplex isn't a separate hit/proc — it's a multiplier on the existing volley — so unlike the
  // real additional procs below, decomposing it means comparing against what the same volley
  // would've been at duplexLevel 0, not adding a new damage source. Exposed as its own DPS
  // delta (user-specified 2026-09-01: "duplex (if using)" as its own breakdown line) so
  // DamageSources.jsx can show "Melee/Arrow DPS" as the non-Duplex base and "Duplex DPS" as the
  // bonus on top, summing back to the same real total `melee` already was.
  const bowVolleyDamageWithoutDuplex = isTerminator ? expectedArrowDamage * 3 : expectedArrowDamage;
  const duplexBonusDps = duplexLevel > 0 ? (bowVolleyDamage - bowVolleyDamageWithoutDuplex) * meleeHitsPerSecond : 0;

  const melee = bowVolleyDamage * meleeHitsPerSecond;
  // Every proc below scales off "a normal hit's damage" (not the bow-specific 3-arrow/Duplex
  // volley above) — now the crit-chance-weighted expectedArrowDamage rather than the old
  // always-crit meleeFinalDamage, so every real DPS number reflects real Crit Chance/Overload
  // (user-specified 2026-08-29: "For ALL dps calculation - crit chance math should be factored in").
  const venomousProc = computeVenomousProcDamage(sources, mob, expectedArrowDamage);
  const thunderlordProc = computeEnchantProcDamage(mob, expectedArrowDamage, sources.thunderlordProc);
  const fireAspectProc = computeEnchantProcDamage(mob, expectedArrowDamage, sources.fireAspectProc);
  const crimsonSwipeProc = computeCrimsonSwipeDamage(
    mob,
    expectedArrowDamage,
    computeCrimsonSwipeInfo(loadout, ARMOR_SLOTS),
    steadyFinalDamage.additivePercent,
  );
  const venomous = (venomousProc?.finalDamage || 0) * DPS_HITS_PER_SECOND.venomous;
  const thunderlord = (thunderlordProc?.finalDamage || 0) * DPS_HITS_PER_SECOND.thunderlord;
  const fireAspect = (fireAspectProc?.finalDamage || 0) * DPS_HITS_PER_SECOND.fireAspect;
  const crimsonSwipe = (crimsonSwipeProc?.finalDamage || 0) * DPS_HITS_PER_SECOND.crimsonSwipe;
  // Mage Beam fires alongside (not instead of) every melee hit (see computeMageStaffBeamDamage's
  // own comment) — same real per-second rate as melee, since it's the same swing. Not folded into
  // `total` here (every other caller of this function — the Optimizer's Slayer/Diana/Dungeon-
  // Archer DPS metric, the by-hit graph, etc. — intentionally means melee-family DPS only, the
  // Optimizer's own separate 'dungeon_mage_beam' mode already covers Beam-focused ranking).
  // DamageSources.jsx's own DPS view adds this in on top of `total` when Mage Mode is also active
  // (user-confirmed 2026-08-28), and notes as much on-screen.
  const beamProc = computeMageStaffBeamDamage(sources, mob, expectedArrowDamage, useDungeonizedStats, useMasterMode);
  const beam = beamProc.finalDamage * meleeHitsPerSecond;
  return {
    melee,
    venomous,
    thunderlord,
    fireAspect,
    crimsonSwipe,
    beam,
    meleeHitsPerSecond,
    total: melee + venomous + thunderlord + fireAspect + crimsonSwipe,
    venomousProc,
    beamProc,
    // Steady-state per-hit melee damage (excludes First Strike/Triple Strike) — exposed so
    // DamageSources.jsx's by-hit graph can compare it against the opening-hit(s)' real (boosted)
    // per-hit value to plot the DPS dip once those enchants stop applying.
    meleeFinalDamage,
    // Crit-chance/Overload/Duplex breakdown behind `melee` above — exposed for display/debugging.
    nonCritChance,
    megaCritChance,
    duplexLevel,
    duplexBonusDps,
    isBowWeapon,
  };
}

// Safety cap on how far simulateHitByHit will run looking for a kill (see its own comment) — at a
// typical melee rate this is still tens of minutes of simulated real time, generous for any real
// fight without risking an effectively-unbounded loop against an edge case that never dies.
const MAX_SIMULATED_HITS = 10000;

// Real hit-by-hit fight simulation against a specific starting HP (lib/mobHp.js's
// resolveStartingHp) — unlike computeDpsBreakdown's single steady-state DPS number, this tracks
// the mob's remaining HP hit-by-hit so Execute/Prosecute's real value (which depends on current
// mob HP%, see damageSources.js's executeProsecuteRate) actually changes over the fight instead
// of being frozen at one static % for every hit. `startingHp` null/0 means no real number is
// confirmed for this mob yet (docs/mob-hp-followups.md) — falls back to holding HP% constant at
// `fallbackHpPercent` (the existing Mob HP% slider value) for every hit, matching the site's
// prior static-% behavior, while still gaining the proc-bump/Venomous modeling below. `sources`
// must come from a collectDamageSources call made with mobHpPercent=100 when startingHp is real,
// so First Strike/Triple Strike's opening-hit-only entry (gated on mobHpPercent===100 at
// collection time) is actually present for this function's own excludeFirstHitOnly gating to work —
// the caller (DamageSources.jsx) is responsible for that; this function just consumes it as-is.
//
// Fire Aspect/Thunderlord/Crimson Swipe fire as discrete lump procs (their own real finalDamage,
// via computeEnchantProcDamage/computeCrimsonSwipeDamage) rather than smoothly blended DPS — no
// per-hit trigger chance is confirmed for any of them, so each is spread evenly across the fight
// via an accumulator that crosses 1 every `meleeHitsPerSecond / rate` hits, reproducing the exact
// same already-confirmed long-run average (DPS_HITS_PER_SECOND) as a placement choice, not a new
// guessed mechanic. Venomous is the opposite case — a genuinely continuous per-second DoT across
// every active stack, not a discrete per-hit event — so its contribution is amortized instead:
// (per-stack damage × active stacks × its own per-second rate) / hits-per-second, i.e. "how much
// poison ticks during roughly one attack cycle," growing every hit as stacks accumulate.
//
// Stops early once remainingHp reaches 0 (mob's dead — no further hits simulated) rather than
// always running the full hitCount.
export function simulateHitByHit(
  sources,
  mob,
  loadout,
  startingHp,
  fallbackHpPercent,
  useDungeonizedStats = false,
  useMasterMode = false,
  hitCount = MAX_VENOMOUS_STACKS,
  maxSearchHits = MAX_SIMULATED_HITS,
) {
  const bonusAttackSpeed = sources.baseStats.bonus_attack_speed || 0;
  const meleeHitsPerSecond = computeMeleeHitsPerSecond(bonusAttackSpeed, loadout);
  const critChance = selectBaseStats(sources, useDungeonizedStats, useMasterMode, mob).crit_chance || 0;
  const hasOverload = (sources.overloadBonusPercent || 0) > 0;
  const critHitChance = Math.min(Math.max(critChance, 0), 100) / 100;
  const megaCritChance = hasOverload ? Math.min(Math.max(0, critChance - 100), 100) / 100 : 0;
  const normalCritChance = critHitChance - megaCritChance;
  const nonCritChance = 1 - critHitChance;

  const duplexLevel = getDuplexLevel(loadout);
  const isTerminator = loadout.weapon?.item?.id === 'TERMINATOR';
  const duplexMultiplier = 1 + (DUPLEX_DAMAGE_PERCENT_PER_LEVEL * duplexLevel) / 100;
  const swipeInfo = computeCrimsonSwipeInfo(loadout, ARMOR_SLOTS);

  const fireAspectRate = sources.fireAspectProc ? DPS_HITS_PER_SECOND.fireAspect / meleeHitsPerSecond : 0;
  const thunderlordRate = sources.thunderlordProc ? DPS_HITS_PER_SECOND.thunderlord / meleeHitsPerSecond : 0;
  const crimsonSwipeRate = swipeInfo ? DPS_HITS_PER_SECOND.crimsonSwipe / meleeHitsPerSecond : 0;
  let fireAspectAcc = 0;
  let thunderlordAcc = 0;
  let crimsonSwipeAcc = 0;

  const rate = sources.executeProsecuteRate;
  function buildHitSources(hpPercent) {
    if (!rate) return { hitSources: sources, executeProsecuteValue: 0 };
    const hpBasis = rate.type === 'execute' ? 100 - hpPercent : hpPercent;
    const value = Math.round(rate.ratePerLevel * hpBasis * 100) / 100;
    const additiveNonConditional = sources.additiveNonConditional.filter((e) => e.id !== rate.id);
    if (value > 0) {
      additiveNonConditional.push({ id: rate.id, label: rate.label, source: rate.source, value, abilityEligible: true });
    }
    return { hitSources: { ...sources, additiveNonConditional }, executeProsecuteValue: value };
  }

  const hasRealHp = typeof startingHp === 'number' && startingHp > 0;

  // First Strike/Triple Strike only ever apply on the fight's opening hit(s) — probed once here
  // (same appliedIds-suffix check DamageSources.jsx's old graph used) so the loop below knows how
  // many opening hits to include them on.
  const openingHpPercent = hasRealHp ? 100 : fallbackHpPercent;
  const { hitSources: openingSources } = buildHitSources(openingHpPercent);
  const openingAppliedIds = [...computeFinalDamage(openingSources, mob, useDungeonizedStats, useMasterMode, false).appliedIds];
  const hasTripleStrike = openingAppliedIds.some((id) => id.toLowerCase().endsWith('-triple_strike'));
  const hasFirstStrike = openingAppliedIds.some((id) => id.toLowerCase().endsWith('-first_strike'));
  const firstHitBoostCount = hasTripleStrike ? 3 : hasFirstStrike ? 1 : 0;

  let remainingHp = hasRealHp ? startingHp : null;
  const hits = [];
  let totalHits = null;
  // The graph only ever shows the first `hitCount` (40) points, but a tanky-enough mob takes far
  // more hits than that to actually die — this loop keeps running (without recording further graph
  // points) up to `maxSearchHits` so "hits/time to kill" reflects the real fight length, not just
  // whatever happened to fit in the visible window. Bounded rather than unbounded so a pathological
  // case (e.g. a Shielded mob's 1-damage-per-hit cap against a multi-million HP pool) can't loop
  // effectively forever — exceededSimCap below tells the caller when that happened. Separate from
  // `hitCount` specifically so optimizer.js's per-candidate average-DPS ranking (potentially
  // hundreds of these per Optimizer pass) can cap the SEARCH itself at 40 too, not just which
  // points get recorded — the default here (MAX_SIMULATED_HITS) is for DamageSources.jsx's own
  // real "Time to Kill" display, which only ever runs once per visible mob per render.
  const simCap = hasRealHp ? maxSearchHits : hitCount;
  for (let hit = 1; hit <= simCap; hit++) {
    const hpPercent = hasRealHp ? Math.max(0, Math.min(100, (remainingHp / startingHp) * 100)) : fallbackHpPercent;
    const { hitSources, executeProsecuteValue } = buildHitSources(hpPercent);
    const excludeFirstHitOnly = hit > firstHitBoostCount;

    const steady = computeFinalDamage(hitSources, mob, useDungeonizedStats, useMasterMode, excludeFirstHitOnly);
    const expectedArrowDamage =
      nonCritChance * steady.finalDamageNonCrit +
      normalCritChance * steady.finalDamage +
      megaCritChance * steady.finalDamage * (1 + (sources.overloadBonusPercent || 0) / 100);
    const meleeDamage = isTerminator
      ? duplexLevel > 0
        ? expectedArrowDamage * duplexMultiplier + 2 * expectedArrowDamage
        : expectedArrowDamage * 3
      : expectedArrowDamage * duplexMultiplier;

    let fireAspectDamage = 0;
    if (sources.fireAspectProc) {
      fireAspectAcc += fireAspectRate;
      if (fireAspectAcc >= 1) {
        fireAspectAcc -= 1;
        fireAspectDamage = computeEnchantProcDamage(mob, expectedArrowDamage, sources.fireAspectProc)?.finalDamage || 0;
      }
    }
    let thunderlordDamage = 0;
    if (sources.thunderlordProc) {
      thunderlordAcc += thunderlordRate;
      if (thunderlordAcc >= 1) {
        thunderlordAcc -= 1;
        thunderlordDamage = computeEnchantProcDamage(mob, expectedArrowDamage, sources.thunderlordProc)?.finalDamage || 0;
      }
    }
    let crimsonSwipeDamage = 0;
    if (swipeInfo) {
      crimsonSwipeAcc += crimsonSwipeRate;
      if (crimsonSwipeAcc >= 1) {
        crimsonSwipeAcc -= 1;
        crimsonSwipeDamage = computeCrimsonSwipeDamage(mob, expectedArrowDamage, swipeInfo, steady.additivePercent)?.finalDamage || 0;
      }
    }

    let venomousDamage = 0;
    if (sources.venomousProc) {
      // Real stacks cap at MAX_VENOMOUS_STACKS even past hit 40 (this loop runs further than that
      // to find a real total-hits/time-to-kill — see MAX_SIMULATED_HITS below).
      const activeStacks = Math.min(hit, MAX_VENOMOUS_STACKS);
      const perStack = computeVenomousProcDamage(hitSources, mob, expectedArrowDamage)?.finalDamage || 0;
      venomousDamage = (perStack * activeStacks * DPS_HITS_PER_SECOND.venomous) / meleeHitsPerSecond;
    }

    const totalDamage = meleeDamage + fireAspectDamage + thunderlordDamage + crimsonSwipeDamage + venomousDamage;
    // totalDamage above is already "damage dealt during this one hit-interval" (procs amortized
    // to their share of that interval, same reasoning as venomousDamage's own division by
    // meleeHitsPerSecond) — multiplying back by meleeHitsPerSecond converts it to the real
    // instantaneous DPS this specific hit represents, which is what actually varies hit-to-hit as
    // Venomous stacks build and Execute/Prosecute's value ramps with draining HP%, unlike the
    // single fixed-snapshot number computeDpsBreakdown reports.
    const dps = totalDamage * meleeHitsPerSecond;

    if (hit <= hitCount) {
      hits.push({
        hit,
        hpPercent,
        meleeDamage,
        executeProsecuteValue,
        fireAspectDamage,
        thunderlordDamage,
        crimsonSwipeDamage,
        venomousDamage,
        totalDamage,
        dps,
      });
    }

    if (hasRealHp) {
      remainingHp = Math.max(0, remainingHp - totalDamage);
      if (remainingHp <= 0) {
        totalHits = hit;
        break;
      }
    }
  }

  const timeToKillSeconds = totalHits != null ? totalHits / meleeHitsPerSecond : null;
  const exceededSimCap = hasRealHp && totalHits == null;
  // Max/min across the same window the graph actually plots (the recorded `hits`, capped at
  // `hitCount`) — not the full kill-search, which can run far past what's ever shown.
  const maxDps = hits.length > 0 ? Math.max(...hits.map((h) => h.dps)) : null;
  const minDps = hits.length > 0 ? Math.min(...hits.map((h) => h.dps)) : null;

  return { hits, hasRealHp, meleeHitsPerSecond, totalHits, timeToKillSeconds, exceededSimCap, maxDps, minDps };
}

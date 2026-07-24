// Final Damage against a specific target mob.
//
//   InitialDamage = (5 + WeaponDMG) * (1 + Strength/100)
//   FinalDamage   = floor((InitialDamage * AdditiveMultiplier * WeaponBonusMultiplier * MultiplicativeMultiplier + BonusModifiers) * (1 + CritDamage/100))
//
// Strength and CritDamage are weighted equally — both are their own
// independent (1 + stat/100) factor, one applied before the additive/
// multiplicative stage and one after, but structurally symmetric.
//
// AdditiveMultiplier = 1 + (every applicable % bonus, summed) — every
// enchantment (Sharpness, Smite, etc.) and ability-text bonus (Golden
// Dragon's Legendary Treasure, Combat Level, etc.) is just added
// together: Smite 50% + Sharpness 65% = 115% additive, not compounded.
// Maps directly onto lib/damageSources.js's `additiveNonConditional` +
// whichever `additiveConditional` entries match the target. The
// equipped WEAPON's own "+X% damage" ability bonus is NOT part of this
// pool any more (per instruction) — see WeaponBonusMultiplier below.
//
// WeaponBonusMultiplier = 1 + (the equipped weapon's own "+X% damage"
// ability bonuses, summed) — its own independent factor, structurally
// like AdditiveMultiplier but kept separate: Atomsplit Katana's real
// "+300% damage to Endermen" is a weaponBonus of 300, i.e. a (1+3) = 4x
// factor, not folded into the shared additive pool with enchants/
// attributes/etc. Maps onto lib/damageSources.js's
// `weaponBonusNonConditional` + whichever `weaponBonusConditional`
// entries match the target (Daedalus Blade's Bestiary bonus, the
// Hyperion/Valkyrie/Astraea/Scylla line's Wither bonus, every tiered
// Slayer weapon, Pooch Sword's Wolf bonus, etc.)
//
// MultiplicativeMultiplier = product of every applicable "x" bonus that
// ISN'T the equipped weapon's own damage-bonus ability — these are few
// and far between (Crown of Avarice, Skyblock Level, and armor-set
// bonuses like Vanquished/Monster Hunter/Raider where modeled) and
// genuinely multiply rather than add, e.g. a 1B-coin Crown of Avarice
// (1.15x) on Skyblock Level 500 (1.05x) is 1.15*1.05, not
// 1.15+1.05-1. Maps onto the `multiplicative` bucket.
//
// BonusModifiers is a flat amount added after the additive/
// multiplicative multiplication but still scaled by Crit Damage — real
// Hypixel examples are Soul Eater, the End Stone Bow, and the One Punch
// Dragon Essence Shop perk (per the wiki's Damage Calculation page
// Trivia), none of which this app currently parses/models, so it's
// always 0 today — kept as an explicit term rather than omitted so the
// formula stays structurally correct if any of those get added later.
//
// Unlimited Power/Unlimited Energy (lib/attributes.js) apply after
// everything else — true multipliers on the fully-summed Strength/Crit
// Damage totals, not another additive contributor, per the real
// Attribute system's own description. Baked directly into
// baseStats.strength/crit_damage by lib/damageSources.js's
// collectAttributeEntries (its own "Unlimited Power"/"Unlimited Energy"
// baseStatSources line), so this formula just reads baseStats as-is —
// see that file rather than re-applying the multiplier here.
//
// Original formula source (still the basis for the underlying pieces):
// https://hypixel-skyblock.fandom.com/wiki/Damage_Calculation — reproduces
// its own worked example exactly (Final Damage 10160) with BonusModifiers=0.

import { MOB_TYPE_SYMBOLS } from './damageSymbols';
import { resolveMobKey } from './mobTypes';

const KNOWN_TYPE_NAMES = new Set(Object.keys(MOB_TYPE_SYMBOLS).map((t) => t.toLowerCase()));

// A `condition` string is comma-separated ("Undead, Skeletal, Wither");
// each token is either a canonical Mob Type name (compare against the
// target's own types — this is how Smite/Ender Slayer/etc. stack: a mob
// with multiple matching types satisfies multiple enchants' conditions
// independently) or a literal mob name from an item ability's own text
// (Demonslayer Gauntlet's "Blazes" — compare directly against the target,
// plural/case-insensitive via the same resolver lib/mobTypes.js's
// getMobTypes already uses).
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
      return mobKey != null && resolveMobKey(token) === mobKey;
    });
}

// `sources` is lib/damageSources.js's collectDamageSources() result;
// `mob` is {name, types}. Situational entries (Execute's uncapped
// %-per-missing-HP, etc.) are never included — they need live target HP
// state this app doesn't model, same as they're excluded from every
// other total in Damage Sources today.
export function computeFinalDamage(sources, mob) {
  const {
    baseStats,
    additiveNonConditional,
    additiveConditional,
    weaponBonusNonConditional,
    weaponBonusConditional,
    multiplicative,
  } = sources;
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

  // No currently-modeled source populates this — see the file header.
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

// Final Damage against a specific target mob — formula sourced directly
// from the wiki's raw wikitext this session (not guessed):
// https://hypixel-skyblock.fandom.com/wiki/Damage_Calculation
//
//   InitialDamage    = (5 + WeaponDMG) * (1 + Strength/100)
//   DamageMultiplier = 1 + CombatLevelBonus + Enchants + WeaponBonus
//   FinalDamage      = floor(InitialDamage * DamageMultiplier * (1+ArmorBonus) * (1 + CritDamage/100))
//
// Crit Chance never appears in the formula — "Final Damage" is Hypixel's
// own crit-assumed reference number, not an expected-value calculation.
// The wiki's (1+ArmorBonus) is a single slot in its simplified example
// (Tarantula's every-4th-hit double damage), but real loadouts can have
// several independent true-multiplier effects active at once (Skyblock
// Level, Crown of Avarice) — generalized here to the product of every
// applicable entry in lib/damageSources.js's `multiplicative` bucket,
// the natural extension rather than a divergence from the source.
// CombatLevelBonus/Enchants/WeaponBonus are all just summed together per
// the wiki ("the values for enchantments should be summed") — no
// architectural distinction between an enchant's % and an item ability's
// %, so `additiveNonConditional` + matching `additiveConditional` entries
// are combined into one sum here.

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
  const { baseStats, additiveNonConditional, additiveConditional, multiplicative } = sources;
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

  let armorFactor = 1;
  for (const e of multiplicative) {
    if (!e.condition || conditionMatchesMob(e.condition, mob)) {
      armorFactor *= e.value;
      appliedIds.add(e.id);
    }
  }

  const initialDamage = (5 + baseStats.damage) * (1 + baseStats.strength / 100);
  const damageMultiplier = 1 + additivePercent / 100;
  const finalDamage = Math.floor(initialDamage * damageMultiplier * armorFactor * (1 + baseStats.crit_damage / 100));

  return { initialDamage, damageMultiplier, additivePercent, armorFactor, finalDamage, appliedIds };
}

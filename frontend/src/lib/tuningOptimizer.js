// Auto-spends Stat Tuning points — greedily, via the real damage pipeline, rather than a fixed
// "dump it all into Strength" rule. That matters because at least one Tuning-eligible stat has a
// real cap this calculator already models: Bonus Attack Speed's melee hit-rate breakpoint table
// (see lib/finalDamage.js) caps its marginal value at 100 (150 with Thermodynamic Armor) — points
// beyond that yield zero further DPS, so a naive single-stat dump can waste points a greedy search
// naturally avoids.
//
// health/defense/speed are Tuning-eligible stats but never forwarded into out.baseStats (see
// lib/damageSources.js's accessory-stat merge) — they can't affect this calculator's damage output
// at all, so they're excluded from the search entirely rather than wasting real pipeline
// evaluations confirming they're always worth 0.
import { emptyAccessoryModifiers } from './defaultModifiers';
import { computeModeDamage } from './optimizer';
import { computeTotalTuningPoints } from './accessoryPowers';

const DAMAGE_RELEVANT_TUNING_STATS = ['strength', 'crit_damage', 'crit_chance', 'bonus_attack_speed', 'intelligence'];
const ALL_TUNING_STATS = ['health', 'defense', 'speed', 'strength', 'crit_damage', 'crit_chance', 'bonus_attack_speed', 'intelligence'];

// Bounds the total number of real pipeline evaluations regardless of how many points there are to
// spend (a maxed account can have 100+) — coarse-to-fine batches, shrinking every round so the
// last few rounds land close to the true per-point optimum instead of stopping at a coarse batch size.
const MAX_ROUNDS = 24;

// Returns a full {statKey: points} allocation (all 8 TUNING_STATS keys, 0 for the 3 damage-irrelevant
// ones) that greedily maximizes computeModeDamage's output for the given loadout/mode/mob, spending
// exactly `totalPoints`. `loadout.accessory` may be entirely absent (no Power selected yet) —
// spending Tuning points still works without one, same as Magical Power itself.
export async function computeOptimalTuning(loadout, itemData, build, modeConfig, mob, totalPoints) {
  const allocation = Object.fromEntries(ALL_TUNING_STATS.map((s) => [s, 0]));
  if (totalPoints <= 0) return allocation;

  const accessorySlot = loadout.accessory || { item: null, modifiers: emptyAccessoryModifiers() };
  let remaining = totalPoints;

  for (let round = 0; round < MAX_ROUNDS && remaining > 0; round++) {
    const roundsLeft = MAX_ROUNDS - round;
    const batch = Math.max(1, Math.ceil(remaining / roundsLeft));
    let bestStat = null;
    let bestValue = -Infinity;
    for (const stat of DAMAGE_RELEVANT_TUNING_STATS) {
      const candidateTuning = { ...allocation, [stat]: allocation[stat] + batch };
      const candidateLoadout = {
        ...loadout,
        accessory: { ...accessorySlot, modifiers: { ...accessorySlot.modifiers, tuning: candidateTuning } },
      };
      const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
      if (value > bestValue) {
        bestValue = value;
        bestStat = stat;
      }
    }
    allocation[bestStat] += batch;
    remaining -= batch;
  }

  return allocation;
}

// Convenience: derives the real total point budget (Magical Power's 1-per-10 rate plus the Tuning
// Box attribute's own flat grant — see lib/accessoryPowers.js's computeTotalTuningPoints) and runs
// the search.
export async function computeOptimalTuningForMp(loadout, itemData, build, modeConfig, mob, magicalPower) {
  const totalPoints = computeTotalTuningPoints(magicalPower, build.attributes?.tuning_box, build.attributes?.echo_of_boxes, build.attributes?.echo_of_echoes);
  return computeOptimalTuning(loadout, itemData, build, modeConfig, mob, totalPoints);
}

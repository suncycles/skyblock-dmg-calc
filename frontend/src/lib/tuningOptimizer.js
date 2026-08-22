// Auto-spends Stat Tuning points — one point at a time, via the real damage pipeline, rather than
// a fixed "dump it all into Strength" rule or a coarse batch-per-round search. True per-point
// granularity matters because every damage-relevant stat multiplies together in the Final Damage
// formula, so whichever stat currently has the single highest marginal value can shift after only
// 1-2 points land elsewhere — a coarse batch re-evaluated only a handful of times per budget can
// lock onto one stat for the whole spend and never reconsider, instead of naturally spreading
// across Crit Damage/Strength/etc. as their relative marginal values shift point by point.
//
// Bonus Attack Speed is the one exception that per-point greedy handles badly on its own: its
// melee hit-rate only changes at fixed breakpoints (lib/finalDamage.js's MELEE_HIT_RATE_BREAKPOINTS),
// so every individual point below the next threshold shows exactly zero marginal gain — a myopic
// "does this next point help RIGHT NOW" search can never justify spending toward one at all, even
// when reaching it is worth far more than the same points spent elsewhere. Each round, this search
// separately computes "how many points would it take to reach the next real breakpoint" and offers
// that as its own lumpy candidate move alongside every other stat's plain +1, then picks whichever
// candidate has the best value gained per point spent — so a breakpoint gets bought in one shot
// exactly when (and only when) it's actually worth it, and otherwise points keep flowing to
// whichever smooth stat currently pays the most per point.
//
// Enchant-level lookups are cached per id (see enchantEffects.js's fetchEnchantLevels), so repeated
// computeModeDamage calls across a large point budget stay cheap once the first pass warms that cache.
//
// health/defense/speed are Tuning-eligible stats but never forwarded into out.baseStats (see
// lib/damageSources.js's accessory-stat merge) — they can't affect this calculator's damage output
// at all, so they're excluded from the search entirely rather than wasting real pipeline
// evaluations confirming they're always worth 0.
import { emptyAccessoryModifiers } from './defaultModifiers';
import { computeModeDamage, computeModeDamageAndSources } from './optimizer';
import { computeTotalTuningPoints, TUNING_RATE_PER_POINT } from './accessoryPowers';
import { MELEE_HIT_RATE_BREAKPOINTS, computeMeleeHitsPerSecond } from './finalDamage';

const SMOOTH_TUNING_STATS = ['strength', 'crit_damage', 'crit_chance', 'intelligence'];
const ALL_TUNING_STATS = ['health', 'defense', 'speed', 'strength', 'crit_damage', 'crit_chance', 'bonus_attack_speed', 'intelligence'];

// Points needed for `allocation.bonus_attack_speed` to carry the player from their current
// (gear-only) Bonus Attack Speed up to the next real hit-rate breakpoint — null if already past
// every breakpoint, or if reaching the next one would cost more points than are left to spend.
function pointsToNextAttackSpeedBreakpoint(gearBonusAttackSpeed, allocation, remaining, loadout) {
  const currentAS = gearBonusAttackSpeed + allocation.bonus_attack_speed * TUNING_RATE_PER_POINT.bonus_attack_speed;
  const currentRate = computeMeleeHitsPerSecond(currentAS, loadout);
  for (const bp of MELEE_HIT_RATE_BREAKPOINTS) {
    if (bp.threshold <= currentAS) continue;
    // computeMeleeHitsPerSecond clamps to the real Attack Speed cap internally, so a threshold
    // beyond that cap naturally shows no further improvement and gets skipped here too.
    if (computeMeleeHitsPerSecond(bp.threshold, loadout) <= currentRate) continue;
    const pointsNeeded = Math.ceil((bp.threshold - currentAS) / TUNING_RATE_PER_POINT.bonus_attack_speed);
    return pointsNeeded >= 1 && pointsNeeded <= remaining ? pointsNeeded : null;
  }
  return null;
}

// Returns a full {statKey: points} allocation (all 8 TUNING_STATS keys, 0 for the 3 damage-irrelevant
// ones) that greedily maximizes computeModeDamage's output for the given loadout/mode/mob, spending
// exactly `totalPoints`. `loadout.accessory` may be entirely absent (no Power selected yet) —
// spending Tuning points still works without one, same as Magical Power itself.
export async function computeOptimalTuning(loadout, itemData, build, modeConfig, mob, totalPoints) {
  const allocation = Object.fromEntries(ALL_TUNING_STATS.map((s) => [s, 0]));
  if (totalPoints <= 0) return allocation;

  const accessorySlot = loadout.accessory || { item: null, modifiers: emptyAccessoryModifiers() };
  const { sources: gearSources } = await computeModeDamageAndSources(loadout, itemData, build, modeConfig, mob);
  const gearBonusAttackSpeed = gearSources.baseStats.bonus_attack_speed || 0;

  function candidateValue(candidateTuning) {
    const candidateLoadout = {
      ...loadout,
      accessory: { ...accessorySlot, modifiers: { ...accessorySlot.modifiers, tuning: candidateTuning } },
    };
    return computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
  }

  let currentValue = await candidateValue(allocation);
  let spent = 0;
  while (spent < totalPoints) {
    const remaining = totalPoints - spent;
    const moves = SMOOTH_TUNING_STATS.map((stat) => ({ stat, points: 1 }));
    const breakpointPoints = pointsToNextAttackSpeedBreakpoint(gearBonusAttackSpeed, allocation, remaining, loadout);
    if (breakpointPoints != null) moves.push({ stat: 'bonus_attack_speed', points: breakpointPoints });

    let bestMove = null;
    let bestRate = -Infinity;
    let bestValue = currentValue;
    for (const move of moves) {
      const candidateTuning = { ...allocation, [move.stat]: allocation[move.stat] + move.points };
      const value = await candidateValue(candidateTuning);
      const rate = (value - currentValue) / move.points;
      if (rate > bestRate) {
        bestRate = rate;
        bestMove = move;
        bestValue = value;
      }
    }

    allocation[bestMove.stat] += bestMove.points;
    spent += bestMove.points;
    currentValue = bestValue;
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

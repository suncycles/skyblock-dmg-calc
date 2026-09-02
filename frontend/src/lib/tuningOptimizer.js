// Auto-spends Stat Tuning points via the real damage pipeline, one point at a time by default —
// true per-point granularity matters because every damage-relevant stat multiplies together in the
// Final Damage formula, so whichever stat currently has the single highest marginal value can shift
// after only 1-2 points land elsewhere. Once a stat has clearly won several rounds in a row, the
// search switches to lump-spending it (see STREAK_THRESHOLD/BATCH_SIZE below) rather than a fixed
// "dump it all into Strength" rule or a naive coarse batch-per-round search from the start, which
// could lock onto one stat too early and never reconsider.
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

// Real per-round candidate stats for a given mode — excludes whichever smooth stats the mode's own
// formula provably never reads, so the search never spends a real pipeline call confirming a stat
// is worth 0 when the formula already guarantees that (user-specified 2026-09-01):
//   - 'ability': computeAbilityDamage's formula reads Intelligence and nothing else off this list —
//     no Strength term, no Crit Damage term, and abilities don't crit at all (no Crit Chance term
//     either). The search below short-circuits this case entirely (single relevant stat, nothing to compare).
//   - 'dps' (melee/arrow): computeFinalDamage has no Intelligence term at all — that stat only ever
//     feeds Ability Damage.
//   - 'beam': computeMageStaffBeamDamage scales off both the real melee hit (so Strength/Crit
//     Chance/Crit Damage still matter) AND Intelligence directly — keeps every smooth stat.
function relevantSmoothStats(metric) {
  if (metric === 'ability') return ['intelligence'];
  if (metric === 'beam') return SMOOTH_TUNING_STATS;
  return SMOOTH_TUNING_STATS.filter((s) => s !== 'intelligence');
}

// Real Crit Chance clamps past its cap — 100%, or 200% with an Overload bow (see
// computeDpsBreakdown's megaCritChance) — so once the running total (gear + already-spent points)
// crosses it, every further Crit Chance point is worth exactly 0. Cheap arithmetic using the same
// known per-point rate the real formula already applies, instead of re-confirming "still worth 0"
// with a real pipeline call every remaining round (user-specified 2026-09-01).
function isCritChanceCapped(gearCritChance, allocation, hasOverload) {
  const current = gearCritChance + allocation.crit_chance * TUNING_RATE_PER_POINT.crit_chance;
  return current >= (hasOverload ? 200 : 100);
}

// Once a stat has won this many consecutive individual-point rounds, lump-spend it instead of
// re-confirming one point at a time (user-specified 2026-09-01, recommendation #1). This is exact,
// not approximate, for Strength/Crit Damage/Intelligence: every damage formula that reads them
// (computeFinalDamage, computeAbilityDamage, computeMageStaffBeamDamage) multiplies them in as a
// bare `(1 + stat/100[*scaling])` factor with every OTHER stat held fixed during the batch, so each
// one's own marginal DPS rate is a true constant, not a diminishing-returns curve — batching never
// changes the final allocation for those three. The one real risk batching introduces is missing a
// bonus_attack_speed breakpoint that only becomes worth crossing partway through a batch (its own
// point-cost doesn't change, but the DPS value of crossing it grows as the batched stat grows) —
// BATCH_SIZE bounds how many points can go by before the next real round re-checks that against
// every move again, catching a missed breakpoint at most one batch late.
const STREAK_THRESHOLD = 6;
const BATCH_SIZE = 24;

// Returns { allocation, nextStat } — `allocation` is a full {statKey: points} map (all 8
// TUNING_STATS keys, 0 for the 3 damage-irrelevant ones) that greedily maximizes computeModeDamage's
// output for the given loadout/mode/mob, spending exactly `totalPoints`; `nextStat` is whichever
// smooth stat the search's own last round found to have the best marginal rate — a free byproduct
// callers can reuse instead of re-testing every stat from scratch for a small top-up (see
// accessoryOptimizer.js's topUpTuning, recommendation #2). `loadout.accessory` may be entirely
// absent (no Power selected yet) — spending Tuning points still works without one, same as Magical
// Power itself.
export async function computeOptimalTuning(loadout, itemData, build, modeConfig, mob, totalPoints) {
  const allocation = Object.fromEntries(ALL_TUNING_STATS.map((s) => [s, 0]));
  if (totalPoints <= 0) return { allocation, nextStat: null };

  // Ability Damage doesn't crit and has no hit-rate dependency (it's a per-cast number, not a DPS
  // one) — Intelligence is the only stat that moves it at all, so every point goes there with no
  // real comparison needed.
  if (modeConfig.metric === 'ability') {
    allocation.intelligence = totalPoints;
    return { allocation, nextStat: 'intelligence' };
  }

  const accessorySlot = loadout.accessory || { item: null, modifiers: emptyAccessoryModifiers() };
  const { sources: gearSources } = await computeModeDamageAndSources(loadout, itemData, build, modeConfig, mob);
  const gearBonusAttackSpeed = gearSources.baseStats.bonus_attack_speed || 0;
  const gearCritChance = gearSources.baseStats.crit_chance || 0;
  const hasOverload = (gearSources.overloadBonusPercent || 0) > 0;
  const smoothStats = relevantSmoothStats(modeConfig.metric);

  function candidateValue(candidateTuning) {
    const candidateLoadout = {
      ...loadout,
      accessory: { ...accessorySlot, modifiers: { ...accessorySlot.modifiers, tuning: candidateTuning } },
    };
    return computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
  }

  let currentValue = await candidateValue(allocation);
  let spent = 0;
  let nextStat = smoothStats[0] || null;
  let streakStat = null;
  let streakCount = 0;
  while (spent < totalPoints) {
    const remaining = totalPoints - spent;

    if (streakStat && streakCount >= STREAK_THRESHOLD) {
      let batch = Math.min(BATCH_SIZE, remaining);
      // Crit Chance is the one smooth stat with a real cap — don't lump past the point it stops
      // helping (the other smooth stats are uncapped, so this clamp only ever applies here).
      if (streakStat === 'crit_chance') {
        const capThreshold = hasOverload ? 200 : 100;
        const currentCritChance = gearCritChance + allocation.crit_chance * TUNING_RATE_PER_POINT.crit_chance;
        const pointsUntilCap = Math.ceil((capThreshold - currentCritChance) / TUNING_RATE_PER_POINT.crit_chance);
        batch = Math.min(batch, Math.max(1, pointsUntilCap));
      }
      const candidateTuning = { ...allocation, [streakStat]: allocation[streakStat] + batch };
      const value = await candidateValue(candidateTuning);
      allocation[streakStat] += batch;
      spent += batch;
      currentValue = value;
      nextStat = streakStat;
      // One real comparison round re-validates (not a fresh 6-round streak) — if the same stat
      // wins again there, streakCount crosses STREAK_THRESHOLD immediately and the next batch goes
      // right out; if something else wins instead (a breakpoint became worth it, say), the normal
      // round below reassigns streakStat/streakCount on its own.
      streakCount = STREAK_THRESHOLD - 1;
      continue;
    }

    const critChanceCapped = smoothStats.includes('crit_chance') && isCritChanceCapped(gearCritChance, allocation, hasOverload);
    const moves = smoothStats.filter((s) => s !== 'crit_chance' || !critChanceCapped).map((stat) => ({ stat, points: 1 }));
    const breakpointPoints = pointsToNextAttackSpeedBreakpoint(gearBonusAttackSpeed, allocation, remaining, loadout);
    if (breakpointPoints != null) moves.push({ stat: 'bonus_attack_speed', points: breakpointPoints });

    let bestMove = null;
    let bestRate = -Infinity;
    let bestValue = currentValue;
    let bestSmoothRate = -Infinity;
    let bestSmoothStat = nextStat;
    for (const move of moves) {
      const candidateTuning = { ...allocation, [move.stat]: allocation[move.stat] + move.points };
      const value = await candidateValue(candidateTuning);
      const rate = (value - currentValue) / move.points;
      if (rate > bestRate) {
        bestRate = rate;
        bestMove = move;
        bestValue = value;
      }
      if (move.stat !== 'bonus_attack_speed' && rate > bestSmoothRate) {
        bestSmoothRate = rate;
        bestSmoothStat = move.stat;
      }
    }

    allocation[bestMove.stat] += bestMove.points;
    spent += bestMove.points;
    currentValue = bestValue;
    nextStat = bestSmoothStat;

    if (bestMove.stat === streakStat) {
      streakCount += 1;
    } else {
      streakStat = bestMove.stat === 'bonus_attack_speed' ? null : bestMove.stat;
      streakCount = streakStat ? 1 : 0;
    }
  }

  return { allocation, nextStat };
}

// Convenience: derives the real total point budget (Magical Power's 1-per-10 rate plus the Tuning
// Box attribute's own flat grant — see lib/accessoryPowers.js's computeTotalTuningPoints) and runs
// the search.
export async function computeOptimalTuningForMp(loadout, itemData, build, modeConfig, mob, magicalPower) {
  const totalPoints = computeTotalTuningPoints(magicalPower, build.attributes?.tuning_box, build.attributes?.echo_of_boxes, build.attributes?.echo_of_echoes);
  return computeOptimalTuning(loadout, itemData, build, modeConfig, mob, totalPoints);
}

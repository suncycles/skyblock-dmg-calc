// Auto-spends Stat Tuning points through the damage pipeline, one point at a time by default: every
// damage-relevant stat multiplies into the Final Damage formula, so the stat with the highest
// marginal value can shift after only a point or two lands elsewhere. Once one stat has won several
// rounds in a row the search lump-spends it (see STREAK_THRESHOLD and BATCH_SIZE), rather than
// starting from a coarse batch that could lock onto a stat too early.
//
// Bonus Attack Speed is the exception a per-point greedy search handles badly: melee hit rate only
// changes at fixed breakpoints (lib/finalDamage.js's MELEE_HIT_RATE_BREAKPOINTS), so every point
// below the next threshold shows zero marginal gain and a myopic search would never spend toward
// one. Each round therefore computes how many points reach the next breakpoint and offers that as
// its own lumpy candidate beside every stat's plain +1, picking whichever has the best value per
// point - so a breakpoint is bought in one shot exactly when it is worth it.
//
// Enchant-level lookups are cached per id (enchantEffects.js's fetchEnchantLevels), so repeated
// computeModeDamage calls stay cheap once the first pass warms that cache.
//
// health/defense/speed are Tuning-eligible but never reach out.baseStats and can't affect damage,
// so they are excluded from the search rather than evaluated to confirm a zero.
import { emptyAccessoryModifiers } from './defaultModifiers';
import { computeModeDamage, computeModeDamageAndSources } from './optimizer';
import { computeTotalTuningPoints, TUNING_RATE_PER_POINT } from './accessoryPowers';
import { MELEE_HIT_RATE_BREAKPOINTS, computeMeleeHitsPerSecond, selectBaseStats } from './finalDamage';

const SMOOTH_TUNING_STATS = ['strength', 'crit_damage', 'crit_chance', 'intelligence'];
const ALL_TUNING_STATS = ['health', 'defense', 'speed', 'strength', 'crit_damage', 'crit_chance', 'bonus_attack_speed', 'intelligence'];

// Points needed for `allocation.bonus_attack_speed` to carry the player from their current
// (gear-only) Bonus Attack Speed up to the next real hit-rate breakpoint - null if already past
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

// The candidate stats for a mode, excluding the smooth stats its formula provably never reads, so
// the search never spends a pipeline call confirming a guaranteed zero:
//   - 'ability': computeAbilityDamage reads Intelligence and nothing else here - no Strength or Crit
//     Damage term, and abilities don't crit. The search short-circuits this case entirely.
//   - 'dps' (melee/arrow): computeFinalDamage has no Intelligence term; that stat only feeds Ability
//     Damage.
//   - 'beam': computeMageStaffBeamDamage scales off both the melee hit and Intelligence, so every
//     smooth stat stays in.
function relevantSmoothStats(metric) {
  if (metric === 'ability') return ['intelligence'];
  if (metric === 'beam') return SMOOTH_TUNING_STATS;
  return SMOOTH_TUNING_STATS.filter((s) => s !== 'intelligence');
}

// Crit Chance clamps past its cap - 100%, or 200% with an Overload bow (see computeDpsBreakdown's
// megaCritChance) - so once gear plus spent points cross it, further Crit Chance points are worth 0.
// Checked with the same per-point rate the formula applies, rather than re-confirming a zero with a
// pipeline call every round.
function isCritChanceCapped(gearCritChance, allocation, hasOverload) {
  const current = gearCritChance + allocation.crit_chance * TUNING_RATE_PER_POINT.crit_chance;
  return current >= (hasOverload ? 200 : 100);
}

// Once a stat has won this many consecutive rounds, it is lump-spent rather than re-confirmed a
// point at a time. This is exact for Strength, Crit Damage and Intelligence: every formula that
// reads them multiplies them in as a bare (1 + stat/100[*scaling]) factor with the other stats held
// fixed during the batch, so each one's marginal rate is constant and batching can't change the
// final allocation. The risk it does introduce is missing a bonus_attack_speed breakpoint that
// becomes worth crossing partway through a batch - its point cost is fixed but its value grows with
// the batched stat - so BATCH_SIZE bounds how long that can go unnoticed to one batch.
const STREAK_THRESHOLD = 6;
const BATCH_SIZE = 24;

// Returns { allocation, nextStat }. `allocation` is a full {statKey: points} map over all 8
// TUNING_STATS keys - 0 for the three damage-irrelevant ones - greedily maximizing
// computeModeDamage for the loadout, mode and mob while spending exactly `totalPoints`. `nextStat`
// is the stat the last round found best at the margin, reused by accessoryOptimizer.js's topUpTuning
// instead of re-testing every stat. `loadout.accessory` may be absent: spending Tuning points works
// without a Power selected, as Magical Power itself does.
export async function computeOptimalTuning(loadout, itemData, build, modeConfig, mob, totalPoints) {
  const allocation = Object.fromEntries(ALL_TUNING_STATS.map((s) => [s, 0]));
  if (totalPoints <= 0) return { allocation, nextStat: null };

  // Ability Damage doesn't crit and has no hit-rate dependency, and Intelligence is the only stat
  // that moves it, so every point goes there with no comparison.
  if (modeConfig.metric === 'ability') {
    allocation.intelligence = totalPoints;
    return { allocation, nextStat: 'intelligence' };
  }

  const accessorySlot = loadout.accessory || { item: null, modifiers: emptyAccessoryModifiers() };
  const { sources: gearSources } = await computeModeDamageAndSources(loadout, itemData, build, modeConfig, mob);
  // Through selectBaseStats, not the raw block: that one misses Final Destination's +20 Bonus
  // Attack Speed against Ender mobs and the Catacombs-scaled totals, which would send the
  // breakpoint search below chasing a breakpoint the gear has already crossed.
  const gearStats = selectBaseStats(gearSources, modeConfig.useDungeonizedStats, modeConfig.useMasterMode, mob);
  const gearBonusAttackSpeed = gearStats.bonus_attack_speed || 0;
  const gearCritChance = gearStats.crit_chance || 0;
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
      // Crit Chance is the one smooth stat with a real cap - don't lump past the point it stops
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
      // One comparison round re-validates rather than restarting the streak: if the same stat wins
      // again, streakCount crosses STREAK_THRESHOLD immediately and the next batch goes out; if
      // something else wins - a breakpoint became worth crossing - the normal round reassigns it.
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

// Derives the total point budget (Magical Power's 1-per-10 rate plus the Tuning Box attribute's flat
// grant, see lib/accessoryPowers.js's computeTotalTuningPoints) and runs the search.
export async function computeOptimalTuningForMp(loadout, itemData, build, modeConfig, mob, magicalPower) {
  const totalPoints = computeTotalTuningPoints(magicalPower, build.attributes?.tuning_box, build.attributes?.echo_of_boxes, build.attributes?.echo_of_echoes);
  return computeOptimalTuning(loadout, itemData, build, modeConfig, mob, totalPoints);
}

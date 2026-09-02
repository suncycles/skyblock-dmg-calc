// Magical Power ("MP") Optimizer — ranks real accessories the player doesn't yet own (or could
// upgrade) by the DPS increase from the resulting MP gain, reusing lib/optimizer.js's "evaluate
// one change against the real baseline" pipeline. Catalog data (real accessory names/rarities,
// upgrade-family exclusivity, duplicates, "of Power" Perfect Gemstone rarity upgrades, and
// non-recombobulatable ids) lives in worker/src/data/accessoryFamilies.json — see its own
// `_source` field for provenance (transcribed from SkyHelper/SkyCrypt's open "missing talismans"
// dataset, plus manual wiki research for the parts that dataset didn't have).
//
// Magical Power's effect is modeled two ways, matching exactly what the rest of the app already
// tracks per accessory: the Accessory Power stat multiplier (via the player's chosen Power Stone,
// scaled by total MP) and each individually-owned accessory's own real stat line (Shark Tooth's
// Strength, Red Claw's Crit Damage, ... — see worker/src/index.js's computeLiveAccessoryStats,
// imported into modifiers.individualAccessoryStats). The account's CURRENT accessories' totals come
// from a real Hypixel import, same as `owned` below; a "New Accessory" (`kind: 'missing'`) candidate
// the player doesn't yet own has no live per-instance lore to read, but its own stat line is still a
// fixed, real, per-tier constant baked into the item's own static definition (see worker/src/
// index.js's ACCESSORY_INNATE_STATS_BY_ID, computed from the SAME catalog lore this file already
// gets via itemData) — evaluateAccessoryCandidates below adds it on top of the account's real
// current total, not a guessed number. Recombobulate/Perfect-Gemstone/Accessory-Upgrade candidates
// (upgrading an already-owned copy to a new tier or a new item id) don't get the tier-up's stat
// DELTA yet — a real, documented gap, see the comment at that call site.
//
// TEMPORARY IMPLEMENTATION — known scope limits:
// - non_recombobulatable_ids is a curated, non-exhaustive list (4 confirmed real ids) — not every
//   one of the ~280 real accessories has been individually checked.

import { emptyAccessoryModifiers } from './defaultModifiers';
import { bumpRarity, canRecombobulate } from './recombobulator';
import { computeModeDamage, computeModeDamageAndSources, getModeConfig, withOptimizerSwarmMobs } from './optimizer';
import { computeTotalTuningPoints } from './accessoryPowers';
import { computeOptimalTuning } from './tuningOptimizer';
import { cheapestPerfectGemstonePrice } from './pricing';

export const MAGICAL_POWER_BY_RARITY = {
  COMMON: 3,
  UNCOMMON: 5,
  RARE: 8,
  EPIC: 12,
  LEGENDARY: 16,
  MYTHIC: 22,
  SPECIAL: 3,
  VERY_SPECIAL: 5,
};

// Real coin cost per accessory candidate, mirroring lib/optimizer.js's withCost/lookupCandidateCost
// for gear. A generic MP-sweep candidate isn't a real, priceable item, so it always falls through
// to null/'?' below.
function lookupAccessoryCost(candidate, itemData) {
  const itemPrices = itemData?.costs?.itemPrices || {};
  if (candidate.kind === 'missing') {
    const price = itemPrices[candidate.id];
    return typeof price === 'number' && price > 0 ? price : null;
  }
  if (candidate.kind === 'upgrade') {
    // Net cost: the higher tier's own price minus the already-owned lower tier's price, not the
    // higher tier's full price — the player isn't buying this family from zero.
    const toPrice = itemPrices[candidate.id];
    const fromPrice = itemPrices[candidate.fromId];
    return typeof toPrice === 'number' && typeof fromPrice === 'number' ? toPrice - fromPrice : null;
  }
  if (candidate.kind === 'recombobulate') {
    return itemData?.costs?.recombobulatorCost || null;
  }
  if (candidate.kind === 'gemstone-upgrade') {
    // The specific Perfect Gemstone type needed isn't tracked in our data — priced at the
    // cheapest real type as a floor/lower-bound (a real market price, not a guessed number).
    const perGem = cheapestPerfectGemstonePrice(itemData);
    return perGem != null && candidate.gemstonesNeeded ? perGem * candidate.gemstonesNeeded : null;
  }
  return null;
}

function withCost(result, cost) {
  const hasRealCost = typeof cost === 'number' && cost > 0;
  return { ...result, cost: hasRealCost ? cost : '?', ratio: hasRealCost ? result.percentIncrease / cost : null };
}

// Fallback candidates when no real account is on file (see buildAccessoryCandidates below):
// hypothetical flat MP increases in +10 steps, so the optimizer can still show Magical Power's
// real DPS effect in the abstract ("if MP went up by N") without knowing which real accessories
// would supply it.
const GENERIC_MP_STEPS = [10, 20, 30, 40, 50];
export function buildGenericMpCandidates() {
  return GENERIC_MP_STEPS.map((mpGain) => ({
    id: `GENERIC_MP_${mpGain}`,
    name: `+${mpGain} Magical Power`,
    mpGain,
    kind: 'generic',
  }));
}

// Union-find over talisman_upgrades (each lower tier redundantly lists every tier above it, so a
// plain "is this id a key/value" check isn't enough) — returns Map<id, Set<everyIdInItsFamily>>,
// including the target id itself. An id absent from talisman_upgrades entirely is its own
// singleton family (most of the catalog — only ~90 of the ~280 real accessories are part of an
// upgrade chain at all).
function buildFamilyGroups(upgrades) {
  const parent = new Map();
  function find(x) {
    if (!parent.has(x)) parent.set(x, x);
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root);
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur);
      parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  for (const [lower, highers] of Object.entries(upgrades || {})) {
    for (const higher of highers) union(lower, higher);
  }
  const idToGroup = new Map();
  const roots = new Map();
  for (const id of parent.keys()) {
    const root = find(id);
    if (!roots.has(root)) roots.set(root, new Set());
    roots.get(root).add(id);
  }
  for (const group of roots.values()) {
    for (const id of group) idToGroup.set(id, group);
  }
  return idToGroup;
}

function familyMembers(id, groups) {
  return groups.get(id) || new Set([id]);
}

// Normalizes the worker's raw owned-accessory list (talisman_duplicates alt ids folded back to
// their canonical id, best tier per canonical id kept) into Map<canonicalId, {tier, recombobulated}>.
function canonicalizeOwned(owned, families) {
  const altToCanonical = new Map();
  for (const [canonical, alts] of Object.entries(families.talisman_duplicates || {})) {
    for (const alt of alts) altToCanonical.set(alt, canonical);
  }
  const bestTierById = new Map();
  for (const { id, tier, recombobulated } of owned || []) {
    const canonical = altToCanonical.get(id) || id;
    const existing = bestTierById.get(canonical);
    if (!existing || (MAGICAL_POWER_BY_RARITY[tier] || 0) > (MAGICAL_POWER_BY_RARITY[existing.tier] || 0)) {
      bestTierById.set(canonical, { tier, recombobulated: !!recombobulated });
    }
  }
  return bestTierById;
}

// Builds every real MP-gaining candidate for this account: missing family-best accessories
// (`kind: 'missing'`), recombobulating an owned-but-not-maxed one (`kind: 'recombobulate'`), and
// the "of Power" family's own Perfect Gemstone rarity upgrade (`kind: 'gemstone-upgrade'`) — no
// DPS number yet, just the real id/name/target rarity/mpGain. `owned` is the worker's
// `accessory.owned` array (`[{id, tier, recombobulated}]`) from a Hypixel import.
export function buildAccessoryCandidates(owned, families) {
  const ownedByCanonical = canonicalizeOwned(owned, families);
  const groups = buildFamilyGroups(families.talisman_upgrades);
  const nonRecomb = new Set(families.non_recombobulatable_ids || []);
  const gemUpgrades = families.perfect_gemstone_rarity_upgrades || {};

  const missing = [];
  const upgrade = [];
  for (const [maxId, meta] of Object.entries(families.max_upgrade_talismans || {})) {
    if (ownedByCanonical.has(maxId)) continue;
    const members = familyMembers(maxId, groups);
    let currentTierMp = 0;
    let fromId = null;
    let fromRecombobulated = false;
    for (const [ownedId, { tier, recombobulated }] of ownedByCanonical.entries()) {
      // A lower tier of the SAME real upgrade family the player already owns a higher tier of
      // (e.g. Frozen Chicken when Fried Frozen Chicken is owned) must never itself surface as a
      // separate "missing" candidate — only relevant here for currentTierMp's baseline, which
      // already covers it via familyMembers' union-find over talisman_upgrades. `fromId` tracks
      // WHICH owned id supplied that baseline, so a real net upgrade cost (see lookupAccessoryCost)
      // can be priced against it instead of the higher tier's full price.
      const mp = MAGICAL_POWER_BY_RARITY[tier] || 0;
      if (members.has(ownedId) && mp > currentTierMp) {
        currentTierMp = mp;
        fromId = ownedId;
        fromRecombobulated = recombobulated;
      }
    }
    if (fromId) {
      // A real Recombobulator use carries over through the family's crafting upgrade — the
      // resulting higher tier keeps the bump instead of losing it, same "carry the owned piece's
      // persistent upgrades onto the new candidate" rule lib/optimizer.js's gear-slot evaluators
      // already use for reforges/gemstones/recomb on armor and weapon swaps.
      const resultRarity = fromRecombobulated && canRecombobulate(meta.rarity) ? bumpRarity(meta.rarity) : meta.rarity;
      const mpGain = (MAGICAL_POWER_BY_RARITY[resultRarity] || 0) - currentTierMp;
      if (mpGain > 0) {
        upgrade.push({ id: maxId, name: meta.name, rarity: resultRarity, mpGain, kind: 'upgrade', fromId, nextRecombobulated: fromRecombobulated });
      }
    } else {
      const mpGain = (MAGICAL_POWER_BY_RARITY[meta.rarity] || 0) - currentTierMp;
      if (mpGain > 0) missing.push({ id: maxId, name: meta.name, rarity: meta.rarity, mpGain, kind: 'missing', nextRecombobulated: false });
    }
  }

  const recombobulate = [];
  const gemstoneUpgrade = [];
  for (const [id, { tier, recombobulated }] of ownedByCanonical.entries()) {
    const gem = gemUpgrades[id];
    if (gem && gem.from === tier) {
      const mpGain = (MAGICAL_POWER_BY_RARITY[gem.to] || 0) - (MAGICAL_POWER_BY_RARITY[tier] || 0);
      if (mpGain > 0) {
        gemstoneUpgrade.push({
          id,
          name: `${families.talismans[id]?.name || id} (${gem.gemstonesNeeded} Perfect Gemstones)`,
          rarity: gem.to,
          mpGain,
          kind: 'gemstone-upgrade',
          gemstonesNeeded: gem.gemstonesNeeded,
          nextRecombobulated: recombobulated, // gemstones don't touch recomb status — preserve it
        });
      }
      continue; // Recombobulator doesn't apply to these two rarity jumps — real mechanic is gemstones only.
    }
    // Real Recombobulator use is a one-time-per-item flag, independent of tier — an item's
    // CURRENT tier already reflects any past recomb bump, so `canRecombobulate(tier)` alone
    // can't tell a never-recombed EPIC from an already-recombed RARE-into-EPIC. Skip anything
    // the account's real copy has already used its recomb on.
    if (recombobulated || nonRecomb.has(id) || !canRecombobulate(tier)) continue;
    const nextTier = bumpRarity(tier);
    const mpGain = (MAGICAL_POWER_BY_RARITY[nextTier] || 0) - (MAGICAL_POWER_BY_RARITY[tier] || 0);
    if (mpGain > 0) {
      recombobulate.push({ id, name: families.talismans[id]?.name || id, rarity: nextTier, mpGain, kind: 'recombobulate', nextRecombobulated: true });
    }
  }

  return [...missing, ...upgrade, ...recombobulate, ...gemstoneUpgrade];
}

const CATEGORY_LABELS = {
  missing: 'New Accessory',
  upgrade: 'Accessory Upgrade',
  recombobulate: 'Recombobulate',
  'gemstone-upgrade': 'Perfect Gemstones',
  generic: 'Magical Power (generic)',
};

// Full result cache, keyed by itemData reference (a WeakMap outer layer means an itemData refresh
// — a new object reference — naturally drops every entry tied to the old catalog with no manual
// invalidation) then by a JSON digest of every other input that can change the real output. Nothing
// about the ~2,000-call search below needs to happen again if the player revisits this exact
// loadout/build/mode/mob/candidate-set — which happens routinely, since Optimizer.jsx and
// OptimizerSidebar.jsx both call this independently for the same account on the same page load
// (user-specified 2026-09-01, recommendation #3). Capped at a handful of entries since a real
// session only ever revisits a couple of loadouts, not to bound unrelated memory growth.
const accessoryEvalCache = new WeakMap();
const ACCESSORY_EVAL_CACHE_MAX_ENTRIES = 8;

function accessoryEvalCacheKey(loadout, build, mode, mob, candidates) {
  return JSON.stringify({
    loadout,
    build,
    mode,
    mobName: mob?.name,
    mobTypes: mob?.types,
    candidates: candidates.map((c) => `${c.kind}:${c.id}:${c.mpGain}:${c.fromId || ''}:${c.rarity || ''}`),
  });
}

// Runs every candidate from buildAccessoryCandidates through the real damage pipeline, varying
// Magical Power on top of the player's current loadout/mode/mob — same "one change at a time
// against baseline" evaluation lib/optimizer.js's other candidates use. Both the baseline and
// every candidate auto-spend their Tuning Points optimally (see lib/tuningOptimizer.js) rather
// than carrying over whatever was manually allocated, so the comparison is apples-to-apples: full
// optimal tuning is computed once at the current MP for the baseline; each candidate then only
// needs a cheap top-up search over its own small extra point delta on top of that baseline
// allocation (a full from-scratch search per candidate would mean tens of thousands of real
// pipeline evaluations across ~90 candidates — this keeps it to a few hundred).
export async function evaluateAccessoryCandidates(loadout, itemData, build, mode, mob, candidates) {
  let innerCache = accessoryEvalCache.get(itemData);
  if (!innerCache) {
    innerCache = new Map();
    accessoryEvalCache.set(itemData, innerCache);
  }
  const cacheKey = accessoryEvalCacheKey(loadout, build, mode, mob, candidates);
  if (innerCache.has(cacheKey)) return innerCache.get(cacheKey);

  const result = await evaluateAccessoryCandidatesUncached(loadout, itemData, build, mode, mob, candidates);

  innerCache.set(cacheKey, result);
  if (innerCache.size > ACCESSORY_EVAL_CACHE_MAX_ENTRIES) innerCache.delete(innerCache.keys().next().value);
  return result;
}

async function evaluateAccessoryCandidatesUncached(loadout, itemData, build, mode, mob, candidates) {
  build = withOptimizerSwarmMobs(build, mode);
  const modeConfig = getModeConfig(mode, build.useMasterMode);
  const accessorySlot = loadout.accessory || { item: null, modifiers: emptyAccessoryModifiers() };
  const currentMp = accessorySlot.modifiers.magicalPower || 0;
  // Includes the Tuning Box attribute's own flat point grant (see computeTotalTuningPoints) for
  // an accurate absolute baseline total — the attribute-derived portion cancels out of `extraPoints`
  // below either way, since it's added equally to both the current and candidate totals.
  const currentPoints = computeTotalTuningPoints(currentMp, build.attributes?.tuning_box, build.attributes?.echo_of_boxes, build.attributes?.echo_of_echoes);

  const { allocation: baselineTuning, nextStat: baselineNextStat } = await computeOptimalTuning(loadout, itemData, build, modeConfig, mob, currentPoints);
  const tunedLoadout = { ...loadout, accessory: { ...accessorySlot, modifiers: { ...accessorySlot.modifiers, tuning: baselineTuning } } };
  // Reuses the same evaluation topUpTuning below needs (real Crit Chance and whether an Overload
  // bow is equipped) — computeModeDamageAndSources costs nothing extra over computeModeDamage since
  // baselineValue has to be computed here either way.
  const { value: baselineValue, sources: tunedSources } = await computeModeDamageAndSources(tunedLoadout, itemData, build, modeConfig, mob);
  const tunedCritChance = tunedSources.baseStats.crit_chance || 0;
  const hasOverload = (tunedSources.overloadBonusPercent || 0) > 0;

  const results = [];
  for (const candidate of candidates) {
    const newPoints = computeTotalTuningPoints(
      currentMp + candidate.mpGain,
      build.attributes?.tuning_box,
      build.attributes?.echo_of_boxes,
      build.attributes?.echo_of_echoes,
    );
    const extraPoints = newPoints - currentPoints;
    const candidateTuning = extraPoints > 0 ? await topUpTuning(tunedLoadout, itemData, build, modeConfig, mob, baselineTuning, extraPoints, tunedCritChance, hasOverload, baselineNextStat) : baselineTuning;
    // A brand-new accessory (not yet owned) carries its own real innate stat line (Shark Tooth
    // Necklace's Strength, Red Claw's Crit Damage, ...) on top of its Magical Power contribution —
    // see worker/src/index.js's ACCESSORY_INNATE_STATS_BY_ID, additive onto whatever the account's
    // OTHER real owned accessories already contribute (individualAccessoryStats is a running sum
    // across the whole bag, not per-item). Recombobulate/Perfect-Gemstone/Accessory-Upgrade
    // candidates all upgrade an ALREADY-owned copy whose current-tier stat is already counted in
    // that real sum — the tier-up's stat DELTA isn't modeled here (would need a reliable
    // family+rarity -> item-id lookup this data doesn't confirm), a real, documented gap rather
    // than a guess.
    const innateStats = candidate.kind === 'missing' ? itemData.accessoryInnateStats?.[candidate.id] : null;
    const individualAccessoryStats = innateStats
      ? { ...accessorySlot.modifiers.individualAccessoryStats }
      : accessorySlot.modifiers.individualAccessoryStats;
    if (innateStats) {
      for (const [statKey, value] of Object.entries(innateStats)) {
        individualAccessoryStats[statKey] = (individualAccessoryStats[statKey] || 0) + value;
      }
    }
    const candidateLoadout = {
      ...loadout,
      accessory: {
        ...accessorySlot,
        modifiers: { ...accessorySlot.modifiers, magicalPower: currentMp + candidate.mpGain, tuning: candidateTuning, individualAccessoryStats },
      },
    };
    const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
    const percentIncrease = baselineValue > 0 ? ((value - baselineValue) / baselineValue) * 100 : 0;
    if (percentIncrease <= 0.001) continue;
    const cost = lookupAccessoryCost(candidate, itemData);
    results.push(
      withCost({
        id: candidate.id,
        label: candidate.kind === 'generic' ? candidate.name : `${candidate.name} (+${candidate.mpGain} MP)`,
        category: CATEGORY_LABELS[candidate.kind] || candidate.kind,
        slot: 'accessory',
        rarity: candidate.rarity,
        mpGain: candidate.mpGain,
        tuning: candidateTuning,
        value,
        percentIncrease,
        apply: [
          { type: 'setAccessoryMagicalPower', mp: currentMp + candidate.mpGain },
          { type: 'setAccessoryTuning', tuning: candidateTuning },
          // Real accessories only (not the generic +MP steps, which have no real id to "own") —
          // marks it owned/upgraded so buildAccessoryCandidates treats it as real going forward
          // (excluded from New Accessory, offered for Recombobulate next, etc.) instead of
          // silently re-offering the same Magical Power gain again next run.
          ...(candidate.kind !== 'generic'
            ? [{ type: 'setOwnedAccessory', id: candidate.id, tier: candidate.rarity, recombobulated: candidate.nextRecombobulated }]
            : []),
          // An 'upgrade' candidate's higher tier is a DIFFERENT real item id than the one it
          // replaces (unlike Recombobulate/Perfect-Gemstone, which keep the same id) — drop the
          // now-gone lower tier's ownership record so it doesn't keep surfacing stale
          // Recombobulate/Perfect-Gemstone suggestions for an item the player no longer has.
          ...(candidate.kind === 'upgrade' ? [{ type: 'removeOwnedAccessory', id: candidate.fromId }] : []),
        ],
      }, cost),
    );
  }
  results.sort((a, b) => b.percentIncrease - a.percentIncrease);
  return { baselineValue, currentMp, results };
}

// For the small deltas (0-2 points is typical) a single accessory's MP gain produces, `nextStat`
// (computeOptimalTuning's own last-round marginal-value winner, a free byproduct of the baseline
// search the caller already ran) is reused directly instead of re-testing every stat from scratch —
// on a smooth multiplicative formula, the winning stat essentially never flips over 1-2 more points
// (user-specified 2026-09-01, recommendation #2). A larger jump (a big generic MP-sweep candidate,
// or the baseline search never having run at all — `nextStat` null, e.g. currentPoints was 0) falls
// back to the original one-quick-round re-test across every damage-relevant stat, since the
// marginal ranking gets less reliable extrapolated over many points.
const TOP_UP_DIRECT_THRESHOLD = 2;

// `tunedCritChance`/`hasOverload` come from the baseline evaluation the caller already ran (see
// evaluateAccessoryCandidates) — same formula-verified exclusions as computeOptimalTuning
// (tuningOptimizer.js): Ability Damage only reads Intelligence, the 'dps' metric never reads
// Intelligence, and a Crit Chance already at/past its real cap (100%, or 200% with Overload) can't
// gain from more of it.
async function topUpTuning(loadout, itemData, build, modeConfig, mob, baseTuning, extraPoints, tunedCritChance, hasOverload, nextStat) {
  if (modeConfig.metric === 'ability') {
    return { ...baseTuning, intelligence: (baseTuning.intelligence || 0) + extraPoints };
  }
  const critChanceCapped = tunedCritChance >= (hasOverload ? 200 : 100);
  if (nextStat && extraPoints <= TOP_UP_DIRECT_THRESHOLD && !(nextStat === 'crit_chance' && critChanceCapped)) {
    return { ...baseTuning, [nextStat]: (baseTuning[nextStat] || 0) + extraPoints };
  }
  const stats = TUNING_TOP_UP_STATS.filter((stat) => {
    if (stat === 'intelligence' && modeConfig.metric !== 'beam') return false;
    if (stat === 'crit_chance' && critChanceCapped) return false;
    return true;
  });
  let bestTuning = baseTuning;
  let bestValue = -Infinity;
  for (const stat of stats) {
    const candidateTuning = { ...baseTuning, [stat]: (baseTuning[stat] || 0) + extraPoints };
    const candidateLoadout = { ...loadout, accessory: { ...loadout.accessory, modifiers: { ...loadout.accessory.modifiers, tuning: candidateTuning } } };
    const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
    if (value > bestValue) {
      bestValue = value;
      bestTuning = candidateTuning;
    }
  }
  return bestTuning;
}

const TUNING_TOP_UP_STATS = ['strength', 'crit_damage', 'crit_chance', 'bonus_attack_speed', 'intelligence'];

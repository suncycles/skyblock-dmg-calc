// Magical Power Optimizer: ranks accessories the player doesn't own, or could upgrade, by the DPS
// increase from the resulting MP gain, through lib/optimizer.js's "one change against the baseline"
// pipeline. Catalog data — names, rarities, upgrade-family exclusivity, duplicates, "of Power"
// Perfect Gemstone upgrades and non-recombobulatable ids — lives in
// worker/src/data/accessoryFamilies.json.
//
// Magical Power is modeled the same two ways the rest of the app tracks it: the Accessory Power
// stat multiplier scaled by total MP, and each owned accessory's own stat line
// (modifiers.individualAccessoryStats, filled by import). A "New Accessory" candidate has no owned
// copy to read, so its stat line comes from the catalog's fixed per-tier constants
// (worker/src/index.js's ACCESSORY_INNATE_STATS_BY_ID) and is added on top of the account's total.
//
// Known scope limits:
// - Recombobulate, Perfect-Gemstone and Accessory-Upgrade candidates don't model the tier-up's own
//   stat delta, which would need a family+rarity -> item-id lookup this data doesn't provide.
// - non_recombobulatable_ids is a curated list of 4 ids, not a check of all ~280 accessories.

import { emptyAccessoryModifiers } from './defaultModifiers';
import { bumpRarity, canRecombobulate } from './recombobulator';
import { computeModeDamage, computeModeDamageAndSources, getModeConfig, withOptimizerSwarmMobs } from './optimizer';
import { computeTotalTuningPoints } from './accessoryPowers';
import { computeOptimalTuning } from './tuningOptimizer';
import { cheapestPerfectGemstonePrice } from './pricing';
import { readSlotState, slotCostForNewAccessory } from './accessorySlots';

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

// Coin cost per accessory candidate, mirroring lib/optimizer.js's withCost/lookupCandidateCost for
// gear. A generic MP-sweep candidate isn't a priceable item and falls through to null/'?'.
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
    // The specific Perfect Gemstone type needed isn't tracked here, so this is priced at the
    // cheapest type as a lower bound.
    const perGem = cheapestPerfectGemstonePrice(itemData);
    return perGem != null && candidate.gemstonesNeeded ? perGem * candidate.gemstonesNeeded : null;
  }
  return null;
}

function withCost(result, cost) {
  const hasRealCost = typeof cost === 'number' && cost > 0;
  return { ...result, cost: hasRealCost ? cost : '?', ratio: hasRealCost ? result.percentIncrease / cost : null };
}

// Fallback candidates when no account is on file: hypothetical flat MP increases in +10 steps, so
// the optimizer can still show Magical Power's effect without knowing which accessories supply it.
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
// key/value check isn't enough), returning Map<id, Set<everyIdInItsFamily>> including the id itself.
// An id absent from talisman_upgrades is its own singleton family, which covers most of the catalog:
// only ~90 of ~280 accessories belong to an upgrade chain.
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
      // A lower tier of a family the player already owns a higher tier of (Frozen Chicken under Fried
      // Frozen Chicken) must never surface as its own "missing" candidate; it matters here only for
      // currentTierMp's baseline, which familyMembers already covers. `fromId` records which owned id
      // supplied that baseline, so lookupAccessoryCost can price the net upgrade.
      const mp = MAGICAL_POWER_BY_RARITY[tier] || 0;
      if (members.has(ownedId) && mp > currentTierMp) {
        currentTierMp = mp;
        fromId = ownedId;
        fromRecombobulated = recombobulated;
      }
    }
    if (fromId) {
      // A Recombobulator use carries through the family's crafting upgrade, so the higher tier keeps
      // the bump — the same carry-over rule the gear-slot evaluators use for reforges and gemstones.
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
    // Recombobulator use is a one-time per-item flag independent of tier: an item's current tier
    // already reflects any past bump, so canRecombobulate(tier) alone can't tell a never-recombed
    // EPIC from a recombed RARE. Anything the account's copy has already used it on is skipped.
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

// Result cache keyed by itemData reference (a WeakMap, so a catalog refresh drops the old entries)
// then by a JSON digest of every other input that changes the output. The Landing column and the
// /optimizer page each mount their own panel, and toggling back to an earlier loadout asks the same
// question again, so the ~2,000-call search is worth memoizing. Capped at a handful of entries.
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

// Runs every candidate through the damage pipeline, varying Magical Power on top of the current
// loadout, mode and mob — the same one-change-against-baseline evaluation lib/optimizer.js uses.
// Baseline and candidates both auto-spend Tuning Points optimally (lib/tuningOptimizer.js) rather
// than carrying a manual allocation, so the comparison is like for like: the full optimal tuning is
// computed once at current MP, then each candidate only needs a cheap top-up over its own extra
// points. A from-scratch search per candidate would be tens of thousands of pipeline evaluations.
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
  // Includes the Tuning Box attribute's flat point grant (computeTotalTuningPoints) for an accurate
  // absolute total; that portion cancels out of `extraPoints`, being added to both sides.
  const currentPoints = computeTotalTuningPoints(currentMp, build.attributes?.tuning_box, build.attributes?.echo_of_boxes, build.attributes?.echo_of_echoes);

  const { allocation: baselineTuning, nextStat: baselineNextStat } = await computeOptimalTuning(loadout, itemData, build, modeConfig, mob, currentPoints);
  const tunedLoadout = { ...loadout, accessory: { ...accessorySlot, modifiers: { ...accessorySlot.modifiers, tuning: baselineTuning } } };
  // Reuses what topUpTuning needs below (Crit Chance, whether an Overload bow is equipped);
  // computeModeDamageAndSources costs nothing extra, since baselineValue is computed here anyway.
  const { value: baselineValue, sources: tunedSources } = await computeModeDamageAndSources(tunedLoadout, itemData, build, modeConfig, mob);
  const tunedCritChance = tunedSources.baseStats.crit_chance || 0;
  const hasOverload = (tunedSources.overloadBonusPercent || 0) > 0;

  // How full the Accessory Bag is, and what another slot would cost — null without a Hypixel import,
  // which leaves every candidate priced exactly as it was before (lib/accessorySlots.js).
  const slotState = readSlotState(loadout, build.attributes);

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
    // A new accessory carries its own innate stat line (Shark Tooth Necklace's Strength, Red Claw's
    // Crit Damage) on top of its Magical Power, added onto what the account's other accessories
    // already contribute — individualAccessoryStats is a running sum across the bag, not per item.
    // Recombobulate/Perfect-Gemstone/Accessory-Upgrade candidates upgrade an owned copy whose
    // current-tier stat is already in that sum, and the tier-up's own delta is not modeled.
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
    // A brand-new accessory also has to fit in the bag: with no free slot, the cheapest slot on the
    // market is part of its cost (lib/accessorySlots.js). Upgrade, Recombobulate and Perfect-Gemstone
    // candidates reuse the slot their accessory already occupies, so they carry no slot cost.
    const slot = candidate.kind === 'missing' ? slotCostForNewAccessory(slotState, itemData) : null;
    const itemCost = lookupAccessoryCost(candidate, itemData);
    const cost = typeof itemCost === 'number' && typeof slot?.coins === 'number' ? itemCost + slot.coins : itemCost;
    results.push(
      withCost({
        id: candidate.id,
        slotCost: slot && slot.coins ? slot.coins : null,
        slotNote: slot?.note || null,
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
          // Real accessories only, not the generic +MP steps: marks it owned so
          // buildAccessoryCandidates treats it as such next run rather than re-offering the same gain.
          ...(candidate.kind !== 'generic'
            ? [{ type: 'setOwnedAccessory', id: candidate.id, tier: candidate.rarity, recombobulated: candidate.nextRecombobulated }]
            : []),
          // An 'upgrade' candidate's higher tier is a different item id than the one it replaces,
          // unlike Recombobulate and Perfect-Gemstone, so the lower tier's ownership record is dropped
          // to stop stale suggestions for an item the player no longer has.
          ...(candidate.kind === 'upgrade' ? [{ type: 'removeOwnedAccessory', id: candidate.fromId }] : []),
        ],
      }, cost),
    );
  }
  results.sort((a, b) => b.percentIncrease - a.percentIncrease);
  return { baselineValue, currentMp, results };
}

// For the small deltas a single accessory's MP gain produces (0-2 points typically), `nextStat` —
// computeOptimalTuning's last-round marginal winner, a byproduct of the baseline search — is reused
// rather than re-testing every stat, since on a smooth multiplicative formula the winner doesn't
// flip over 1-2 points. A larger jump, or a null `nextStat` when the baseline search never ran,
// falls back to a one-round re-test across every damage-relevant stat.
const TOP_UP_DIRECT_THRESHOLD = 2;

// `tunedCritChance`/`hasOverload` come from the baseline evaluation the caller already ran, with the
// same exclusions as computeOptimalTuning (tuningOptimizer.js): Ability Damage reads only
// Intelligence, the 'dps' metric never reads it, and Crit Chance at its cap (100%, or 200% with
// Overload) gains nothing from more.
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

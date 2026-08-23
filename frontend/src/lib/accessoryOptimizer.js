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
// imported into modifiers.individualAccessoryStats). The latter is read-only here (it comes from
// a real Hypixel import of the CURRENT account, same as `owned` below) — a candidate accessory
// not yet owned obviously has no known real per-instance lore to parse, so only its Magical Power
// contribution (and any resulting Tuning Points) are simulated, not a guessed stat line.
//
// TEMPORARY IMPLEMENTATION — known scope limits:
// - non_recombobulatable_ids is a curated, non-exhaustive list (4 confirmed real ids) — not every
//   one of the ~280 real accessories has been individually checked.

import { emptyAccessoryModifiers } from './defaultModifiers';
import { bumpRarity, canRecombobulate } from './recombobulator';
import { computeModeDamage, getModeConfig } from './optimizer';
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
  for (const [maxId, meta] of Object.entries(families.max_upgrade_talismans || {})) {
    if (ownedByCanonical.has(maxId)) continue;
    const members = familyMembers(maxId, groups);
    let currentTierMp = 0;
    for (const [ownedId, { tier }] of ownedByCanonical.entries()) {
      // A lower tier of the SAME real upgrade family the player already owns a higher tier of
      // (e.g. Frozen Chicken when Fried Frozen Chicken is owned) must never itself surface as a
      // separate "missing" candidate — only relevant here for currentTierMp's baseline, which
      // already covers it via familyMembers' union-find over talisman_upgrades.
      if (members.has(ownedId)) currentTierMp = Math.max(currentTierMp, MAGICAL_POWER_BY_RARITY[tier] || 0);
    }
    const mpGain = (MAGICAL_POWER_BY_RARITY[meta.rarity] || 0) - currentTierMp;
    if (mpGain > 0) missing.push({ id: maxId, name: meta.name, rarity: meta.rarity, mpGain, kind: 'missing' });
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
    if (mpGain > 0) recombobulate.push({ id, name: families.talismans[id]?.name || id, rarity: nextTier, mpGain, kind: 'recombobulate' });
  }

  return [...missing, ...recombobulate, ...gemstoneUpgrade];
}

const CATEGORY_LABELS = {
  missing: 'New Accessory',
  recombobulate: 'Recombobulate',
  'gemstone-upgrade': 'Perfect Gemstones',
  generic: 'Magical Power (generic)',
};

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
  const modeConfig = getModeConfig(mode, build.useMasterMode);
  const accessorySlot = loadout.accessory || { item: null, modifiers: emptyAccessoryModifiers() };
  const currentMp = accessorySlot.modifiers.magicalPower || 0;
  // Includes the Tuning Box attribute's own flat point grant (see computeTotalTuningPoints) for
  // an accurate absolute baseline total — the attribute-derived portion cancels out of `extraPoints`
  // below either way, since it's added equally to both the current and candidate totals.
  const currentPoints = computeTotalTuningPoints(currentMp, build.attributes?.tuning_box, build.attributes?.echo_of_boxes, build.attributes?.echo_of_echoes);

  const baselineTuning = await computeOptimalTuning(loadout, itemData, build, modeConfig, mob, currentPoints);
  const tunedLoadout = { ...loadout, accessory: { ...accessorySlot, modifiers: { ...accessorySlot.modifiers, tuning: baselineTuning } } };
  const baselineValue = await computeModeDamage(tunedLoadout, itemData, build, modeConfig, mob);

  const results = [];
  for (const candidate of candidates) {
    const newPoints = computeTotalTuningPoints(
      currentMp + candidate.mpGain,
      build.attributes?.tuning_box,
      build.attributes?.echo_of_boxes,
      build.attributes?.echo_of_echoes,
    );
    const extraPoints = newPoints - currentPoints;
    const candidateTuning = extraPoints > 0 ? await topUpTuning(tunedLoadout, itemData, build, modeConfig, mob, baselineTuning, extraPoints) : baselineTuning;
    const candidateLoadout = {
      ...loadout,
      accessory: { ...accessorySlot, modifiers: { ...accessorySlot.modifiers, magicalPower: currentMp + candidate.mpGain, tuning: candidateTuning } },
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
        ],
      }, cost),
    );
  }
  results.sort((a, b) => b.percentIncrease - a.percentIncrease);
  return { baselineValue, currentMp, results };
}

// One quick round (not a full multi-round search) — tries adding all `extraPoints` to each
// damage-relevant Tuning stat on top of an already-optimal `baseTuning`, keeps whichever wins.
// Accurate for the small deltas (0-2 points is typical) most single-accessory MP gains produce;
// only a full computeOptimalTuning re-run would be exact for a large jump, which isn't worth the
// extra evaluations for a ranked list where relative ordering, not exact numbers, is the point.
async function topUpTuning(loadout, itemData, build, modeConfig, mob, baseTuning, extraPoints) {
  let bestTuning = baseTuning;
  let bestValue = -Infinity;
  for (const stat of TUNING_TOP_UP_STATS) {
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

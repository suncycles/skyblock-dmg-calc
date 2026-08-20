// Magical Power ("MP") Optimizer — ranks real accessories the player doesn't yet own (or could
// upgrade) by the DPS increase from the resulting MP gain, reusing lib/optimizer.js's "evaluate
// one change against the real baseline" pipeline. Catalog data (real accessory names/rarities,
// upgrade-family exclusivity, duplicates, "of Power" Perfect Gemstone rarity upgrades, and
// non-recombobulatable ids) lives in worker/src/data/accessoryFamilies.json — see its own
// `_source` field for provenance (transcribed from SkyHelper/SkyCrypt's open "missing talismans"
// dataset, plus manual wiki research for the parts that dataset didn't have).
//
// TEMPORARY IMPLEMENTATION — known scope limits:
// - Only Magical Power's effect on damage is modeled (the Accessory Power stat multiplier, via
//   the player's already-chosen Power Stone). An accessory's own individual stat line (e.g.
//   Artifact of Power's own bonus) is never modeled — this app doesn't track any of the 279 real
//   accessories individually in its damage pipeline, only the one chosen Power Stone + a total MP
//   number + Tuning, so this matches that existing simplification rather than introducing a new one.
// - The extra Stat Tuning points a higher MP total would unlock are NOT auto-re-spent in the
//   simulated candidate (the player's current tuning allocation carries over unchanged) — this
//   makes every number here a slight UNDERcount of the real benefit, never an overcount.
// - Coin cost is a placeholder 0 (ratio null), same convention as lib/optimizer.js — no real-time
//   price source is wired up.
// - non_recombobulatable_ids is a curated, non-exhaustive list (4 confirmed real ids) — not every
//   one of the ~280 real accessories has been individually checked.

import { emptyAccessoryModifiers } from './defaultModifiers';
import { bumpRarity, canRecombobulate } from './recombobulator';
import { computeModeDamage, getModeConfig } from './optimizer';

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

const PLACEHOLDER_COST = 0;

function withCostPlaceholder(result) {
  return { ...result, cost: PLACEHOLDER_COST, ratio: PLACEHOLDER_COST > 0 ? result.percentIncrease / PLACEHOLDER_COST : null };
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
// their canonical id, best tier per canonical id kept) into Map<canonicalId, tier>.
function canonicalizeOwned(owned, families) {
  const altToCanonical = new Map();
  for (const [canonical, alts] of Object.entries(families.talisman_duplicates || {})) {
    for (const alt of alts) altToCanonical.set(alt, canonical);
  }
  const bestTierById = new Map();
  for (const { id, tier } of owned || []) {
    const canonical = altToCanonical.get(id) || id;
    const existing = bestTierById.get(canonical);
    if (!existing || (MAGICAL_POWER_BY_RARITY[tier] || 0) > (MAGICAL_POWER_BY_RARITY[existing] || 0)) {
      bestTierById.set(canonical, tier);
    }
  }
  return bestTierById;
}

// Builds every real MP-gaining candidate for this account: missing family-best accessories
// (`kind: 'missing'`), recombobulating an owned-but-not-maxed one (`kind: 'recombobulate'`), and
// the "of Power" family's own Perfect Gemstone rarity upgrade (`kind: 'gemstone-upgrade'`) — no
// DPS number yet, just the real id/name/target rarity/mpGain. `owned` is the worker's
// `accessory.owned` array (`[{id, tier}]`) from a Hypixel import.
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
    for (const [ownedId, tier] of ownedByCanonical.entries()) {
      if (members.has(ownedId)) currentTierMp = Math.max(currentTierMp, MAGICAL_POWER_BY_RARITY[tier] || 0);
    }
    const mpGain = (MAGICAL_POWER_BY_RARITY[meta.rarity] || 0) - currentTierMp;
    if (mpGain > 0) missing.push({ id: maxId, name: meta.name, rarity: meta.rarity, mpGain, kind: 'missing' });
  }

  const recombobulate = [];
  const gemstoneUpgrade = [];
  for (const [id, tier] of ownedByCanonical.entries()) {
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
        });
      }
      continue; // Recombobulator doesn't apply to these two rarity jumps — real mechanic is gemstones only.
    }
    if (nonRecomb.has(id) || !canRecombobulate(tier)) continue;
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
};

// Runs every candidate from buildAccessoryCandidates through the real damage pipeline (varying
// only Magical Power on top of the player's current loadout/mode/mob), same "one change at a
// time against baseline" evaluation lib/optimizer.js's other candidates use.
export async function evaluateAccessoryCandidates(loadout, itemData, build, mode, mob, candidates) {
  const modeConfig = getModeConfig(mode);
  const accessorySlot = loadout.accessory || { item: null, modifiers: emptyAccessoryModifiers() };
  const currentMp = accessorySlot.modifiers.magicalPower || 0;
  const baselineValue = await computeModeDamage(loadout, itemData, build, modeConfig, mob);

  const results = [];
  for (const candidate of candidates) {
    const candidateLoadout = {
      ...loadout,
      accessory: { ...accessorySlot, modifiers: { ...accessorySlot.modifiers, magicalPower: currentMp + candidate.mpGain } },
    };
    const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
    const percentIncrease = baselineValue > 0 ? ((value - baselineValue) / baselineValue) * 100 : 0;
    if (percentIncrease <= 0.001) continue;
    results.push(
      withCostPlaceholder({
        id: candidate.id,
        label: `${candidate.name} (+${candidate.mpGain} MP)`,
        category: CATEGORY_LABELS[candidate.kind] || candidate.kind,
        rarity: candidate.rarity,
        mpGain: candidate.mpGain,
        value,
        percentIncrease,
      }),
    );
  }
  results.sort((a, b) => b.percentIncrease - a.percentIncrease);
  return { baselineValue, currentMp, results };
}

// Accessory families: only one member of a family is active at a time, so Magical Power and
// accessory stats count its best member alone. A family is an upgrade chain (talisman_upgrades,
// where each lower tier lists every tier above it) plus talisman_duplicates' alternate ids, folded
// onto their canonical id. Mirrors frontend/src/lib/accessoryOptimizer.js's family grouping; the
// Worker and frontend share no module.
import families from "./data/accessoryFamilies.json";

const canonicalId = new Map();
for (const [base, alts] of Object.entries(families.talisman_duplicates || {})) {
  for (const alt of alts) canonicalId.set(alt, base);
}

// A chain never branches, so its top is the one higher tier with no upgrades of its own.
const chainTop = new Map();
for (const [lower, highers] of Object.entries(families.talisman_upgrades || {})) {
  chainTop.set(lower, highers.find((id) => !families.talisman_upgrades[id]) || lower);
}

export function accessoryFamilyKey(id) {
  const canonical = canonicalId.get(id) || id;
  return chainTop.get(canonical) || canonical;
}

// Their Magical Power doubles inside a dungeon. The total is reported separately; the frontend
// adds it while its Dungeon toggle is on.
const DUNGEON_ACCESSORY_IDS = new Set(families.dungeon_accessory_ids || []);

// `entries`: [{ id, family, magicalPower, stats, enrichment }], one per accessory found; `family`
// overrides the lookup (every hat is one family, since only the best hat counts). Keeps each family's
// best member by Magical Power; a tie (two copies of one id, or same-rarity alternates) keeps each
// stat's best. An enrichment counts only on the member kept, so once per family.
export function sumActiveAccessories(entries) {
  const best = new Map();
  for (const entry of entries) {
    const key = entry.family || accessoryFamilyKey(entry.id);
    const current = best.get(key);
    if (!current || entry.magicalPower > current.magicalPower) {
      best.set(key, { ...entry, stats: { ...(entry.stats || {}) } });
    } else if (entry.magicalPower === current.magicalPower) {
      for (const [statKey, value] of Object.entries(entry.stats || {})) {
        current.stats[statKey] = Math.max(current.stats[statKey] || 0, value);
      }
    }
  }
  let magicalPower = 0;
  let dungeonMagicalPower = 0;
  const stats = {};
  const enrichments = {}; // raw Hypixel enrichment stat -> count
  for (const entry of best.values()) {
    magicalPower += entry.magicalPower;
    if (DUNGEON_ACCESSORY_IDS.has(entry.id)) dungeonMagicalPower += entry.magicalPower;
    if (entry.enrichment) enrichments[entry.enrichment] = (enrichments[entry.enrichment] || 0) + 1;
    for (const [statKey, value] of Object.entries(entry.stats)) {
      if (value) stats[statKey] = (stats[statKey] || 0) + value;
    }
  }
  return { magicalPower, dungeonMagicalPower, stats, enrichments };
}

// Hyperion/Valkyrie/Astraea/Scylla — the four "Wither" dungeon blades —
// each grant +1 Damage per Catacombs level, plus one more stat unique to
// each weapon, verified directly against each item's own real NEU-REPO
// lore this session:
//   Hyperion:  "Grants +1 Damage and +2 Intelligence per Catacombs level."
//   Valkyrie:  "Grants +1 Damage and +1 Strength per Catacombs level."
//   Astraea:   "Grants +1 Damage and +2 Defense per Catacombs level."
//   Scylla:    "Grants +1 Damage and +1 Crit Damage per Catacombs level."
// Intelligence/Defense aren't tracked as an aggregate total anywhere in
// this app (same "nothing to add it to" judgment as God Potion's Jerry
// Candy), so only Damage (all four) and Strength/Crit Damage (Valkyrie/
// Scylla) are modeled here — merged directly into the item's own base
// stat line (see lib/statLines.js's mergeStatIntoBase), same "improves
// the item's base stats" precedent as weapon Stars.
const WITHER_BLADE_CATACOMBS_RATES = {
  HYPERION: { damage: 1 },
  VALKYRIE: { damage: 1, strength: 1 },
  ASTRAEA: { damage: 1 },
  SCYLLA: { damage: 1, crit_damage: 1 },
};

export function computeWitherBladeCatacombsBonus(itemId, catacombsLevel) {
  const rates = WITHER_BLADE_CATACOMBS_RATES[itemId];
  if (!rates || !catacombsLevel) return {};
  const bonuses = {};
  for (const [statKey, rate] of Object.entries(rates)) {
    bonuses[statKey] = rate * catacombsLevel;
  }
  return bonuses;
}

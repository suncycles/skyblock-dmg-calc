// Hyperion/Valkyrie/Astraea/Scylla each grant +1 Damage per Catacombs level, plus one more
// stat unique to each weapon — verified against NEU-REPO's own item lore: Hyperion +2
// Intelligence, Valkyrie +1 Strength, Astraea +2 Defense, Scylla +1 Crit Damage. Defense isn't
// tracked as an aggregate anywhere in this app (see the project backlog), so Astraea's second
// stat stays unmodeled; every other stat here merges directly into the item's own base stat line.
const WITHER_BLADE_CATACOMBS_RATES = {
  HYPERION: { damage: 1, intelligence: 2 },
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

// Hyperion/Valkyrie/Astraea/Scylla each grant +1 Damage per Catacombs level, plus one more
// stat unique to each weapon (Hyperion: Intelligence, Valkyrie: Strength, Astraea: Defense,
// Scylla: Crit Damage). Intelligence/Defense aren't tracked as an aggregate anywhere in this
// app, so only Damage and Strength/Crit Damage (Valkyrie/Scylla) are modeled — merged
// directly into the item's own base stat line.
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

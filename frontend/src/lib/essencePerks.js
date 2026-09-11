// Essence-shop perks — permanent, account-wide upgrades bought with Essence at each shop. Levels
// come straight off the account (member.player_data.perks, a flat {perkKey: level} map, extracted
// Worker-side) and are never typed by hand, so this file only models what each level GRANTS.
// Keys and max levels verified against NEU-REPO's constants/essenceshops.json; the per-level
// effects are user-supplied (2026-09-10) since no public source carries them.
//
// Forbidden Blessing (`forbidden_blessing`) is deliberately absent here — it grants no stat of its
// own, it scales Dungeon Blessings, and so lives in lib/dungeonBlessing.js instead.

// Flat base-stat perks: `perLevel` of each stat in `stats`, per level. `dungeonOnly` ones are the
// Catacombs (Undead essence) line — they exist only inside a dungeon run, so they follow the same
// Dungeon toggle every other Catacombs-scoped bonus does.
export const FLAT_STAT_PERKS = [
  { key: 'permanent_strength', name: 'Forbidden Strength', maxLevel: 5, perLevel: 1, stats: ['strength'], dungeonOnly: false },
  { key: 'permanent_intelligence', name: 'Forbidden Intelligence', maxLevel: 5, perLevel: 2, stats: ['intelligence'], dungeonOnly: false },
  // Not in essenceshops.json (checked 2026-09-10 — it's not an Essence-shop perk), but it is in the
  // same member.player_data.perks map and grants a real stat, so it rides along here. 3 levels.
  { key: 'blessing_of_time', name: 'Blessing of Time', maxLevel: 3, perLevel: 2, stats: ['strength', 'intelligence'], dungeonOnly: false },
  { key: 'catacombs_strength', name: 'Strength Essence', maxLevel: 5, perLevel: 10, stats: ['strength'], dungeonOnly: true },
  { key: 'catacombs_intelligence', name: 'Intelligence Essence', maxLevel: 5, perLevel: 15, stats: ['intelligence'], dungeonOnly: true },
  { key: 'catacombs_crit_damage', name: 'Critical Essence', maxLevel: 5, perLevel: 10, stats: ['crit_damage'], dungeonOnly: true },
];

// The three perks that aren't a flat player stat — each is applied at its own point in the
// pipeline, so they're named constants rather than table rows.
export const BANE_PERK = { key: 'bane', name: 'Bane', maxLevel: 5, percentPerLevel: 3, condition: 'Arthropod' };
export const INFUSED_DRAGON_PERK = { key: 'edrag_cd', name: 'Infused Dragon', maxLevel: 5, critDamagePerLevel: 2, petId: 'ENDER_DRAGON' };
export const TWO_HEADED_STRIKE_PERK = {
  key: 'dragon_reforges_buff',
  name: 'Two-Headed Strike',
  maxLevel: 5,
  attackSpeedPerLevel: 2,
  reforgeNames: ['Renowned', 'Spiked'],
};

// Every perk key this app reads, for the Worker to filter the account's full perk map down to.
export const TRACKED_PERK_KEYS = [
  ...FLAT_STAT_PERKS.map((p) => p.key),
  BANE_PERK.key,
  INFUSED_DRAGON_PERK.key,
  TWO_HEADED_STRIKE_PERK.key,
];

function levelOf(perks, perk) {
  return Math.max(0, Math.min(perk.maxLevel, Math.floor(Number(perks?.[perk.key]) || 0)));
}

// [{ label, stat, value }] for every flat perk the account actually has, honouring `dungeonOnly`.
// Callers add these with addBaseStat, so each shows as its own labelled row in the stat breakdown.
export function computeFlatPerkStats(perks, useDungeonizedStats) {
  const out = [];
  for (const perk of FLAT_STAT_PERKS) {
    if (perk.dungeonOnly && !useDungeonizedStats) continue;
    const level = levelOf(perks, perk);
    if (level <= 0) continue;
    for (const stat of perk.stats) out.push({ label: `${perk.name} ${level}`, stat, value: perk.perLevel * level });
  }
  return out;
}

// Bane: additive % damage against Arachnids — the app's own name for that Bestiary type is
// "Arthropod" (see lib/mobTypes.js), which is what conditionMatchesMob matches on.
export function computeBanePercent(perks) {
  return levelOf(perks, BANE_PERK) * BANE_PERK.percentPerLevel;
}

// Infused Dragon: Crit Damage folded into the Ender Dragon pet's own raw base stats, so it scales
// with pet level exactly like the pet's printed stats do — not added to the player afterwards.
export function computeInfusedDragonCritDamage(perks, petId) {
  if (petId !== INFUSED_DRAGON_PERK.petId) return 0;
  return levelOf(perks, INFUSED_DRAGON_PERK) * INFUSED_DRAGON_PERK.critDamagePerLevel;
}

// Two-Headed Strike: Bonus Attack Speed added to the Renowned and Spiked reforges' own stat block,
// so it inherits everything a reforge stat already gets (stars, the Catacombs boost, ...).
export function computeTwoHeadedStrikeAttackSpeed(perks, reforgeName) {
  if (!TWO_HEADED_STRIKE_PERK.reforgeNames.includes(reforgeName)) return 0;
  return levelOf(perks, TWO_HEADED_STRIKE_PERK) * TWO_HEADED_STRIKE_PERK.attackSpeedPerLevel;
}

// Item buffs — temporary player buffs from items used before a fight (Ragnarock, Sword of Bad
// Health, Weirder Tuba). Unlike Dungeon Blessings, which only exist inside a Catacombs run, these
// apply in every mode, as flat grants to the player's base stats.

import { computeItemStatTotals } from './itemStatTotals';
import { computeBasePetStats, computeItemChimeraBonus, petItemStatContext } from './petData';

export const RAGNAROCK_ID = 'RAGNAROCK_AXE';
// Ragnarock's ability: "gain 1.5x this weapon's Strength". The axe's own real Strength — reforge,
// stars, books, gems and a Chimera enchant's copied pet stats included — times 1.5.
export const RAGNAROCK_STRENGTH_MULTIPLIER = 1.5;
// Bad Health's lore: "+5 Strength for every 5% of total HP ... Capped at +100". Taken at the cap.
export const SWORD_OF_BAD_HEALTH_STRENGTH = 100;
export const WEIRDER_TUBA_STATS = { strength: 40, crit_damage: 10, bonus_attack_speed: 5 };

export const BUFF_ITEMS = [
  { id: 'ragnarock', label: 'Ragnarock' },
  { id: 'swordOfBadHealth', label: 'Sword of Bad Health' },
  { id: 'weirderTuba', label: 'Weirder Tuba' },
];

export function emptyBuffs() {
  return Object.fromEntries(BUFF_ITEMS.map((b) => [b.id, false]));
}

export function hasAnyBuff(buffs) {
  return BUFF_ITEMS.some((b) => !!buffs?.[b.id]);
}

// The Ragnarock whose Strength the buff copies: the one from the last Hypixel import, or — for a
// manually built loadout with no import — an equipped one.
// First match wins; an account holding two copies is not disambiguated by Strength.
export function findRagnarock(importedWeapons, loadout) {
  const candidates = [...(importedWeapons || []), loadout?.weapon].filter(Boolean);
  return candidates.find((entry) => entry.item?.id === RAGNAROCK_ID) || null;
}

// The axe's own total Strength, through the same item-stat pipeline equipped gear uses (see
// lib/damageSources.js's collectBaseStats) — including a Chimera enchant's copy of the CURRENT
// pet's stats, which is what makes a Chimera Ragnarock's buff so much larger. The non-dungeon
// figure: the axe is held for its buff, not worn as dungeon gear.
export async function computeRagnarockStrength(entry, loadout, itemData, playerStats, maxedCollectionsCount, essencePerks) {
  if (!entry?.item || !itemData) return 0;
  const basePetStats = loadout?.pet?.item ? computeBasePetStats(loadout, itemData, essencePerks) : null;
  const totals = await computeItemStatTotals(entry.item, entry.modifiers || {}, itemData, {
    catacombsLevel: playerStats?.catacombsLevel,
    tamingLevel: playerStats?.tamingLevel,
    wolfSlayerLevel: playerStats?.wolfSlayerLevel,
    generalsMedallionDigits: playerStats?.generalsMedallionDigits,
    ...petItemStatContext(loadout?.pet, itemData),
    maxedCollectionsCount,
    essencePerks,
    chimeraBonus: computeItemChimeraBonus(entry, basePetStats) || undefined,
  });
  return totals?.strength?.nonDungeonStarred || 0;
}

// Flat {stat, value, label} grants for every active buff. `ragnarockStrength` is the axe's own
// Strength (computeRagnarockStrength) — 0 when there's no Ragnarock to copy, which grants nothing.
export function computeBuffGrants(buffs, ragnarockStrength = 0) {
  const grants = [];
  if (buffs?.ragnarock && ragnarockStrength > 0) {
    grants.push({ stat: 'strength', value: ragnarockStrength * RAGNAROCK_STRENGTH_MULTIPLIER, label: 'Ragnarock (Buff)' });
  }
  if (buffs?.swordOfBadHealth) {
    grants.push({ stat: 'strength', value: SWORD_OF_BAD_HEALTH_STRENGTH, label: 'Sword of Bad Health (Buff)' });
  }
  if (buffs?.weirderTuba) {
    for (const [stat, value] of Object.entries(WEIRDER_TUBA_STATS)) grants.push({ stat, value, label: 'Weirder Tuba (Buff)' });
  }
  return grants;
}

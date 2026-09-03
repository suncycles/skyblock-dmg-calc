import { STAT_LABELS } from './reforgeData';
import { getDisplayTier } from './recombobulator';
import { getGearType } from './gearType';
import { computeGemstoneStatBonuses } from './gemstones';
import { computeReforgeStatBonus } from './reforges';
import { ART_OF_WAR_STAT_BONUS, ART_OF_PEACE_STAT_BONUS, computeBooksStatBonus } from './books';
import { computeSpecialStatBonus, computeDaedalusTamingBonus, computeWolfSlayerLevelBonus } from './specialWeapons';
import { computeWitherBladeCatacombsBonus } from './witherBladeBonuses';
import { PER_STAR_PERCENT, parseBaseStatValue } from './starring';
import { computeCatacombsBoostPercent, computeAbilityDamageCatacombsBoostPercent, ABILITY_STYLE_BOOST_STAT_KEYS } from './dungeonize';
import { fetchEnchantLevels, extractDescriptionLines } from './enchantEffects';
import { parseEnchantStatBonus } from './enchantStats';
import { MYTHOLOGICAL_STAT_DOUBLE_IDS } from './armorSetBonuses';
import { computeTieredPristineStat } from './tieredArmorStats';

// The single canonical per-item stat computation — the ONLY place "how much of stat X does this
// item really have" gets computed. Both the tooltip renderer (itemTooltip.js) and the damage calc
// (damageSources.js) call this and read its numbers; neither reimplements any piece of it (see
// damageSources.js's own warning comment about a past Chimera-math drift bug caused by exactly
// this kind of duplication). Numbers are computed once here and text is generated FROM them
// elsewhere — never the reverse (no re-parsing rendered lore text to recover a number).

// A handful of real items label their own innate attack-speed stat line "Attack Speed:" instead
// of "Bonus Attack Speed:" (e.g. Deathripper Dagger) — same real player stat, just an
// inconsistent Hypixel tooltip label. Normalized before this module (or the tooltip renderer)
// ever parses a stat value off an item's lore, so every consumer treats it as the SAME line.
export function normalizeAttackSpeedLabel(lore) {
  return (lore || []).map((line) => {
    const plain = line.replace(/§./g, '');
    if (!/^\s*Attack Speed:/.test(plain)) return line;
    return line.replace(/^(\s*(?:§.)*)(Attack Speed:)/, '$1Bonus $2');
  });
}

// "The One" (ultimate_the_one): real lore is "Grants +0.5/+1 Health and +0.1/+0.2 Strength per
// maxed out collection" at levels 4/5 (user-confirmed 2026-09-01 — these are its only two real
// levels; NEU-REPO has no item file at all for 1-3, see enchantEffects.js's probeLevels comment).
// The generic parseEnchantStatBonus below can't handle this — it only matches a single fixed
// number per stat, not a rate scaled by a live account counter — so it's special-cased here the
// same way Venomous/Fire Aspect/etc. are special-cased in damageSources.js's collectEnchantEntries.
const THE_ONE_RATE_PER_LEVEL = { 4: { health: 0.5, strength: 0.1 }, 5: { health: 1, strength: 0.2 } };
function computeTheOneStatBonus(level, maxedCollectionsCount) {
  const rates = THE_ONE_RATE_PER_LEVEL[level];
  if (!rates) return null;
  return { health: rates.health * maxedCollectionsCount, strength: rates.strength * maxedCollectionsCount };
}

// Sums every applied enchant's own flat/percent stat bonus (Critical's +Crit Damage%, etc.).
// Enchants with no parseable flat bonus contribute nothing rather than erroring.
export async function computeEnchantStatBonuses(modifiers, enchantsMeta, maxedCollectionsCount) {
  const entries = [...(modifiers.hexEnchantments || [])];
  if (modifiers.ultimateEnchantment) entries.push(modifiers.ultimateEnchantment);
  if (entries.length === 0) return {};

  const perEnchant = await Promise.all(
    entries.map(async (entry) => {
      if (entry.id.toLowerCase() === 'ultimate_the_one') {
        return computeTheOneStatBonus(entry.level, maxedCollectionsCount || 0);
      }
      const levels = await fetchEnchantLevels(entry.id, enchantsMeta);
      const levelData = levels.find((l) => l.level === entry.level);
      return levelData ? parseEnchantStatBonus(extractDescriptionLines(levelData.lore)) : null;
    }),
  );

  const totals = {};
  for (const bonus of perEnchant) {
    if (!bonus) continue;
    for (const [statKey, value] of Object.entries(bonus)) {
      totals[statKey] = (totals[statKey] || 0) + value;
    }
  }
  return totals;
}

function sumSources(...sources) {
  const totals = {};
  for (const src of sources) {
    for (const [statKey, value] of Object.entries(src || {})) totals[statKey] = (totals[statKey] || 0) + value;
  }
  return totals;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// ctx: { catacombsLevel, tamingLevel, wolfSlayerLevel, chimeraBonus, generalsMedallionDigits,
//        manticoreClawBonus, potatoBookDoubled, maxedCollectionsCount }
// Returns, per STAT_LABELS key:
//   pristine    — the item's own unmodified lore value (0 if it has no such line).
//   hiddenBase  — pristine + gemstones + reforge + books + Art of War/Peace + special (Midas
//                 Sword/David's Cloak) + Wither Blade + Daedalus Taming + Wolf Slayer + Chimera +
//                 Manticore Claw + enchant stat bonuses. NEVER shown directly.
//   nonDungeonStarred / dungeonStarred / masterStarred — the three SHOWN totals. dungeonStarred/
//   masterStarred equal nonDungeonStarred whenever the item's own modifiers.dungeonized is false
//   (an un-Dungeonized item gets no Catacombs Boost at all, matching current real behavior).
//   mythologicalNonDungeonStarred / mythologicalDungeonStarred / mythologicalMasterStarred — the
//   same three, doubled (Challenger's/Mythos Armor+Equipment vs. a Mythological target — see
//   armorSetBonuses.js's MYTHOLOGICAL_STAT_DOUBLE_IDS). Computed for every item; only meaningful
//   when the caller separately checks MYTHOLOGICAL_STAT_DOUBLE_IDS.has(item.id).
export async function computeItemStatTotals(item, modifiers, itemData, ctx = {}) {
  const {
    catacombsLevel = 0,
    tamingLevel = 0,
    wolfSlayerLevel = 0,
    chimeraBonus,
    generalsMedallionDigits = 0,
    manticoreClawBonus,
    potatoBookDoubled = false,
    maxedCollectionsCount = 0,
  } = ctx;

  const lore = normalizeAttackSpeedLabel(item.lore);
  const displayTier = getDisplayTier(item, modifiers);
  const gearType = getGearType(item.category);
  const reforge = modifiers.reforge ? itemData.reforges?.[modifiers.reforge] || itemData.reforgeStones?.[modifiers.reforge] : null;

  const gemstoneBonus = computeGemstoneStatBonuses(modifiers.gemstones, displayTier);
  const reforgeBonus = computeReforgeStatBonus(modifiers.reforge, reforge, displayTier, catacombsLevel);
  const booksBonus = computeBooksStatBonus(modifiers.books, gearType, potatoBookDoubled);
  const artOfWarBonus = modifiers.artOfWar && gearType === 'weapon' ? ART_OF_WAR_STAT_BONUS : {};
  const artOfPeaceBonus = modifiers.artOfPeace && gearType === 'armor' ? ART_OF_PEACE_STAT_BONUS : {};
  const specialBonus = computeSpecialStatBonus(item.id, modifiers.special);
  const witherBladeBonus = computeWitherBladeCatacombsBonus(item.id, catacombsLevel);
  const daedalusBonus = computeDaedalusTamingBonus(item.id, tamingLevel);
  const wolfSlayerBonus = computeWolfSlayerLevelBonus(item.id, wolfSlayerLevel);
  const enchantBonus = await computeEnchantStatBonuses(modifiers, itemData.enchants, maxedCollectionsCount);

  const boostPercent = computeCatacombsBoostPercent(catacombsLevel, modifiers.dungeonizeOldCurve, modifiers.stars, generalsMedallionDigits, modifiers.masterStars);
  const abilityBoostPercent = computeAbilityDamageCatacombsBoostPercent(modifiers.stars, generalsMedallionDigits, modifiers.masterStars);

  const totals = {};
  for (const statKey of Object.keys(STAT_LABELS)) {
    // A real Gear-Score tiered-stat item's (Skeleton Master/Zombie Knight — see
    // lib/tieredArmorStats.js) true pristine isn't the catalog's bundled lore value at all; falls
    // back to the catalog parse for every other item, or when the real per-copy itemTier isn't
    // known (manually-built items).
    const tieredPristine = computeTieredPristineStat(item.id, statKey, modifiers.itemTier, modifiers.baseStatBoostPercentage);
    const pristine = tieredPristine ?? (parseBaseStatValue(lore, statKey) || 0);
    const hiddenBase = sumSources(
      { [statKey]: pristine },
      gemstoneBonus,
      reforgeBonus,
      booksBonus,
      artOfWarBonus,
      artOfPeaceBonus,
      specialBonus,
      witherBladeBonus,
      daedalusBonus,
      wolfSlayerBonus,
      chimeraBonus,
      manticoreClawBonus,
      enchantBonus,
    )[statKey] || 0;

    // Stars scale off THIS stat's real pristine (tiered-aware above), not a batch re-parse of raw
    // lore text — see lib/starring.js's PER_STAR_PERCENT (the same 2%/star Overworld formula).
    const starBonus = pristine ? Math.round(pristine * (PER_STAR_PERCENT / 100) * (modifiers.stars || 0) * 10) / 10 : 0;
    const nonDungeonStarred = round1(hiddenBase + starBonus);

    const { withoutMaster, withMaster } = ABILITY_STYLE_BOOST_STAT_KEYS.has(statKey) ? abilityBoostPercent : boostPercent;
    const dungeonStarred = modifiers.dungeonized ? round1(hiddenBase * (1 + withoutMaster / 100)) : nonDungeonStarred;
    const masterStarred = modifiers.dungeonized ? round1(hiddenBase * (1 + withMaster / 100)) : nonDungeonStarred;

    const isMythological = MYTHOLOGICAL_STAT_DOUBLE_IDS.has(item.id);
    totals[statKey] = {
      pristine,
      hiddenBase,
      nonDungeonStarred,
      dungeonStarred,
      masterStarred,
      mythologicalNonDungeonStarred: isMythological ? round1(nonDungeonStarred * 2) : nonDungeonStarred,
      mythologicalDungeonStarred: isMythological ? round1(dungeonStarred * 2) : dungeonStarred,
      mythologicalMasterStarred: isMythological ? round1(masterStarred * 2) : masterStarred,
    };
  }
  return totals;
}

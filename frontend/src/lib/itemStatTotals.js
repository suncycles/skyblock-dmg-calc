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
import { dungeonHeadBaseStatMultiplier } from './dungeonHeads';
import { blingArmorBaseStatMultiplier } from './petData';

// The canonical per-item stat computation: the only place "how much of stat X does this item have"
// is worked out. The tooltip renderer (itemTooltip.js) and the damage calculation (damageSources.js)
// both call this and read its numbers rather than reimplementing any of it. Numbers are computed
// here and text is generated from them, never the reverse — no re-parsing rendered lore to recover
// a number.

// A few items label their innate attack-speed line "Attack Speed:" rather than "Bonus Attack
// Speed:" (Deathripper Dagger) — the same stat under an inconsistent label. Normalized before this
// module or the tooltip renderer parses a value, so every consumer sees one line.
export function normalizeAttackSpeedLabel(lore) {
  return (lore || []).map((line) => {
    const plain = line.replace(/§./g, '');
    if (!/^\s*Attack Speed:/.test(plain)) return line;
    return line.replace(/^(\s*(?:§.)*)(Attack Speed:)/, '$1Bonus $2');
  });
}

// "The One" (ultimate_the_one): "Grants +0.5/+1 Health and +0.1/+0.2 Strength per maxed out
// collection" at levels 4 and 5, its only two levels — NEU-REPO has no item file for 1-3. The
// generic parseEnchantStatBonus can't express a rate scaled by a live account counter, so it is
// special-cased here as Venomous and Fire Aspect are in damageSources.js.
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
//        manticoreClawBonus, potatoBookDoubled, maxedCollectionsCount, blingArmorPercent }
//   (potatoBookDoubled/blingArmorPercent come from lib/petData.js's petItemStatContext)
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
    blingArmorPercent = 0,
    essencePerks = null,
  } = ctx;

  const lore = normalizeAttackSpeedLabel(item.lore);
  const displayTier = getDisplayTier(item, modifiers);
  const gearType = getGearType(item.category);
  const reforge = modifiers.reforge ? itemData.reforges?.[modifiers.reforge] || itemData.reforgeStones?.[modifiers.reforge] : null;

  const gemstoneBonus = computeGemstoneStatBonuses(modifiers.gemstones, displayTier);
  const reforgeBonus = computeReforgeStatBonus(modifiers.reforge, reforge, displayTier, catacombsLevel, essencePerks);
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
    // A Gear-Score tiered-stat item's pristine value (Skeleton Master, Zombie Knight — see
    // lib/tieredArmorStats.js) isn't the catalog's bundled lore value. Falls back to the catalog
    // parse for every other item, and when the per-copy itemTier is unknown.
    const tieredPristine = computeTieredPristineStat(item.id, statKey, modifiers.itemTier, modifiers.baseStatBoostPercentage);
    // A Catacombs boss head's base is its printed lore value doubled (lib/dungeonHeads.js), 1x for
    // everything else, applied to pristine so every later boost — stars, the Catacombs Boost,
    // reforge, gems — compounds on the doubled base rather than being doubled itself. A Blaze pet's
    // Bling Armor scales Blaze and Frozen Blaze Armor's raw base the same way (lib/petData.js).
    const pristine =
      (tieredPristine ?? (parseBaseStatValue(lore, statKey) || 0)) *
      dungeonHeadBaseStatMultiplier(item.id) *
      blingArmorBaseStatMultiplier(item.id, blingArmorPercent);
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

    // Stars scale off this stat's pristine value, tiered-aware as above, rather than a re-parse of
    // raw lore — see lib/starring.js's PER_STAR_PERCENT.
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

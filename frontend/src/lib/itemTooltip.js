import { rarityColorCode, formatItemName } from './mcText';
import { titleCaseEnchantId, toRoman, fetchEnchantLevels, extractDescriptionLines } from './enchantEffects';
import { parseEnchantStatBonus } from './enchantStats';
import { mergeStatIntoBase } from './statLines';
import { applyGemstonesToLore } from './gemstones';
import { applyReforgeToLore, applyFabledToLore } from './reforges';
import { applyBooksToLore } from './books';
import { applySpecialToLore, computeDaedalusTamingBonus, computeWolfSlayerLevelBonus } from './specialWeapons';
import { computeStarBonuses, buildStarSuffix } from './starring';
import { bumpRarity, applyRecombToLore, applyRarityTagToLore } from './recombobulator';
import { getGearType } from './gearType';
import { computeWitherBladeCatacombsBonus } from './witherBladeBonuses';

// Applied enchants, formatted for the tooltip: ultimate first (bold pink), then normal enchants alphabetically, gold if maxed else grey.
function buildAppliedEnchantLines(modifiers) {
  if (!modifiers) return [];
  const entries = [];
  if (modifiers.ultimateEnchantment) {
    entries.push({ ...modifiers.ultimateEnchantment, isUltimate: true });
  }
  const normals = (modifiers.hexEnchantments || [])
    .slice()
    .sort((a, b) => titleCaseEnchantId(a.id).localeCompare(titleCaseEnchantId(b.id)));
  entries.push(...normals.map((e) => ({ ...e, isUltimate: false })));

  return entries.map((e) => {
    const name = `${titleCaseEnchantId(e.id)} ${toRoman(e.level)}`;
    if (e.isUltimate) return `§d§l${name}`;
    return e.level === e.maxLevel ? `§6${name}` : `§7${name}`;
  });
}

// Splices applied-enchant lines in at the first blank line, matching where real tooltips show them.
function insertEnchantLines(lore, enchantLines) {
  if (enchantLines.length === 0) return lore;
  const blankIdx = lore.indexOf('');
  if (blankIdx === -1) return [...lore, '', ...enchantLines];
  return [...lore.slice(0, blankIdx + 1), ...enchantLines, '', ...lore.slice(blankIdx + 1)];
}

// Sums every applied enchant's own flat/percent stat bonus (Critical's +Crit Damage%, etc.).
// Enchants with no parseable flat bonus contribute nothing rather than erroring.
async function computeEnchantStatBonuses(modifiers, enchantsMeta) {
  const entries = [...(modifiers.hexEnchantments || [])];
  if (modifiers.ultimateEnchantment) entries.push(modifiers.ultimateEnchantment);
  if (entries.length === 0) return {};

  const perEnchant = await Promise.all(
    entries.map(async (entry) => {
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

// Builds the exact real-item tooltip (title + lore) with every applied modifier baked in —
// gemstones, reforge, books/Art of War, special-weapon numbers, enchant stat bonuses and
// name lines, and recombobulation — resolved off the item's current rarity. Shared by every
// screen showing an equipped item's tooltip. Async because of the enchant stat-bonus lookup;
// callers should capture the hover anchor before awaiting.
export async function buildFullItemTooltipLines(item, modifiers, itemData, catacombsLevel, tamingLevel, wolfSlayerLevel) {
  if (!item || !modifiers) return [];
  // rarityOverride corrects for the item's real current tier when it differs from the bundled data (e.g. David's Cloak, which upgrades via Hunting milestones rather than a real recomb).
  const baseTier = modifiers.rarityOverride || item.tier;
  const displayTier = modifiers.recombobulated ? bumpRarity(baseTier) : baseTier;
  const gearType = getGearType(item.category);

  let lore = applyGemstonesToLore(item.lore || [], modifiers.gemstones, displayTier);
  // Reforge could be a free blacksmith one or a stone-exclusive one — check both maps.
  const reforge = modifiers.reforge
    ? itemData.reforges?.[modifiers.reforge] || itemData.reforgeStones?.[modifiers.reforge]
    : null;
  lore = applyReforgeToLore(lore, modifiers.reforge, reforge, displayTier, lore.indexOf(''), catacombsLevel);
  lore = applyBooksToLore(lore, modifiers.books, modifiers.artOfWar, modifiers.artOfPeace, lore.indexOf(''), gearType);
  lore = applySpecialToLore(lore, item.id, modifiers.special);
  // Stars/Wither Blade/Daedalus Taming bonuses merge directly into the item's own base stats.
  lore = mergeStatIntoBase(lore, computeStarBonuses(item.lore, modifiers.stars), lore.indexOf(''));
  lore = mergeStatIntoBase(lore, computeWitherBladeCatacombsBonus(item.id, catacombsLevel), lore.indexOf(''));
  lore = mergeStatIntoBase(lore, computeDaedalusTamingBonus(item.id, tamingLevel), lore.indexOf(''));
  lore = mergeStatIntoBase(lore, computeWolfSlayerLevelBonus(item.id, wolfSlayerLevel), lore.indexOf(''));

  // Enchant stat bonuses also merge into the base stat, no separate annotation.
  const enchantStatBonuses = await computeEnchantStatBonuses(modifiers, itemData.enchants);
  lore = mergeStatIntoBase(lore, enchantStatBonuses, lore.indexOf(''));

  lore = insertEnchantLines(lore, buildAppliedEnchantLines(modifiers));
  if (modifiers.rarityOverride) lore = applyRarityTagToLore(lore, item.tier, baseTier);
  if (modifiers.recombobulated) lore = applyRecombToLore(lore, baseTier);
  lore = applyFabledToLore(lore, modifiers.reforge);

  const reforgePrefix = modifiers.reforge ? `${modifiers.reforge} ` : '';
  const starSuffix = buildStarSuffix(modifiers.stars);
  const title = `§${rarityColorCode(displayTier)}§l${reforgePrefix}${formatItemName(item.name)}${starSuffix ? ` ${starSuffix}` : ''}`;
  return [title, ...lore];
}

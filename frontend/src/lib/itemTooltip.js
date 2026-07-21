import { rarityColorCode, formatItemName } from './mcText';
import { titleCaseEnchantId, toRoman, fetchEnchantLevels, extractDescriptionLines } from './enchantEffects';
import { parseEnchantStatBonus } from './enchantStats';
import { annotateStatLines } from './statLines';
import { applyGemstonesToLore } from './gemstones';
import { applyReforgeToLore } from './reforges';
import { applyBooksToLore } from './books';
import { applySpecialToLore } from './specialWeapons';
import { bumpRarity, applyRecombToLore } from './recombobulator';
import { getGearType } from './gearType';

// §d (light purple) — distinct from Reforges' blue, Books' yellow, Art of
// War's gold, and matches the pink Ultimate-enchant name color, so
// enchant-sourced annotations read as visually related to the enchant
// system.
const ENCHANT_STAT_COLOR = 'd';

// Applied enchants, formatted for the tooltip: ultimate first (always bold
// pink, matching its real in-game color regardless of level), then normal
// enchants alphabetically, gold if at max level else grey.
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

// Real Skyblock tooltips show applied enchants right after the stat block
// (Damage/Strength/.../Gemstones) and before the Ability section — i.e. at
// the first blank line in the lore. Splice them in there rather than at the
// very top, so the tooltip reads exactly like the real item would.
function insertEnchantLines(lore, enchantLines) {
  if (enchantLines.length === 0) return lore;
  const blankIdx = lore.indexOf('');
  if (blankIdx === -1) return [...lore, '', ...enchantLines];
  return [...lore.slice(0, blankIdx + 1), ...enchantLines, '', ...lore.slice(blankIdx + 1)];
}

// Sums every applied enchant's own flat/percent stat bonus (Critical's
// +Crit Damage%, Prosperity's +Health, etc. — see lib/enchantStats.js),
// fetching each enchant's real per-level lore the same way the
// enchant-picker's own preview tooltip already does (lib/enchantEffects.js,
// cached per id so this is nearly free once an enchant's been viewed
// anywhere in the session). Enchants with no parseable flat bonus (a pure
// ability, or one like Cayenne that scales off a stat this calculator
// doesn't model) simply contribute nothing rather than erroring.
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

// Builds the exact real-item tooltip lines (title + lore) with every
// applied modifier baked in — gemstones, reforge, books/Art of War,
// special-weapon ability numbers, enchant stat bonuses, enchant name
// lines, and recombobulation — all resolved off the item's *current*
// rarity (recombobulated bumps it one tier, which also bumps gemstone/
// reforge bonus scaling). Shared by any screen showing an equipped
// item's real tooltip, so it can't drift out of sync between e.g.
// Hex.jsx and the home-grid overview. Async only because of the enchant
// stat-bonus lookup above; callers should await it before showing the
// tooltip (capture the hover anchor before the await — see Hex.jsx).
export async function buildFullItemTooltipLines(item, modifiers, itemData) {
  if (!item || !modifiers) return [];
  const displayTier = modifiers.recombobulated ? bumpRarity(item.tier) : item.tier;
  const gearType = getGearType(item.category);

  let lore = applyGemstonesToLore(item.lore || [], modifiers.gemstones, displayTier);
  // Applied reforge could be either a free blacksmith one or a
  // stone-exclusive one — the two live in separate maps (see
  // worker/src/index.js), so check both.
  const reforge = modifiers.reforge
    ? itemData.reforges?.[modifiers.reforge] || itemData.reforgeStones?.[modifiers.reforge]
    : null;
  lore = applyReforgeToLore(lore, reforge, displayTier, lore.indexOf(''));
  lore = applyBooksToLore(lore, modifiers.books, modifiers.artOfWar, lore.indexOf(''), gearType);
  lore = applySpecialToLore(lore, item.id, modifiers.special);

  const enchantStatBonuses = await computeEnchantStatBonuses(modifiers, itemData.enchants);
  lore = annotateStatLines(lore, enchantStatBonuses, ENCHANT_STAT_COLOR, lore.indexOf(''));

  lore = insertEnchantLines(lore, buildAppliedEnchantLines(modifiers));
  if (modifiers.recombobulated) lore = applyRecombToLore(lore, item.tier);

  const reforgePrefix = modifiers.reforge ? `${modifiers.reforge} ` : '';
  const title = `§${rarityColorCode(displayTier)}§l${reforgePrefix}${formatItemName(item.name)}`;
  return [title, ...lore];
}

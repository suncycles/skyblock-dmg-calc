import { rarityColorCode, formatItemName } from './mcText';
import { titleCaseEnchantId, toRoman } from './enchantEffects';
import { applyGemstonesToLore } from './gemstones';
import { applyReforgeToLore } from './reforges';
import { applyBooksToLore } from './books';
import { applySpecialToLore } from './specialWeapons';
import { bumpRarity, applyRecombToLore } from './recombobulator';

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

// Builds the exact real-item tooltip lines (title + lore) with every
// applied modifier baked in — gemstones, reforge, books/Art of War,
// special-weapon ability numbers, enchants, and recombobulation — all
// resolved off the item's *current* rarity (recombobulated bumps it one
// tier, which also bumps gemstone/reforge bonus scaling). Shared by any
// screen showing an equipped item's real tooltip, so it can't drift out
// of sync between e.g. Hex.jsx and an overview grid.
export function buildFullItemTooltipLines(item, modifiers, itemData) {
  if (!item || !modifiers) return [];
  const displayTier = modifiers.recombobulated ? bumpRarity(item.tier) : item.tier;

  let lore = applyGemstonesToLore(item.lore || [], modifiers.gemstones, displayTier);
  // Applied reforge could be either a free blacksmith one or a
  // stone-exclusive one — the two live in separate maps (see
  // worker/src/index.js), so check both.
  const reforge = modifiers.reforge
    ? itemData.reforges?.[modifiers.reforge] || itemData.reforgeStones?.[modifiers.reforge]
    : null;
  lore = applyReforgeToLore(lore, reforge, displayTier, lore.indexOf(''));
  lore = applyBooksToLore(lore, modifiers.books, modifiers.artOfWar, lore.indexOf(''));
  lore = applySpecialToLore(lore, item.id, modifiers.special);
  lore = insertEnchantLines(lore, buildAppliedEnchantLines(modifiers));
  if (modifiers.recombobulated) lore = applyRecombToLore(lore, item.tier);

  const reforgePrefix = modifiers.reforge ? `${modifiers.reforge} ` : '';
  const title = `§${rarityColorCode(displayTier)}§l${reforgePrefix}${formatItemName(item.name)}`;
  return [title, ...lore];
}

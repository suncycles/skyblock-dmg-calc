import { rarityColorCode, formatItemName } from './mcText';
import { titleCaseEnchantId, toRoman } from './enchantEffects';
import { mergeStatIntoBase } from './statLines';
import { applyGemstonesToLore } from './gemstones';
import { applyReforgeToLore, applyFabledToLore } from './reforges';
import { applyBooksToLore } from './books';
import { applySpecialToLore } from './specialWeapons';
import { buildStarSuffix, buildMasterStarSuffix } from './starring';
import { bumpRarity, applyRecombToLore, applyRarityTagToLore } from './recombobulator';
import { getGearType } from './gearType';
import { applyDungeonizeToLore } from './dungeonize';
import { MYTHOLOGICAL_STAT_DOUBLE_IDS } from './armorSetBonuses';
import { computeItemStatTotals, normalizeAttackSpeedLabel } from './itemStatTotals';

// Applied enchants, formatted for the tooltip: ultimate first (bold pink), then normal enchants
// alphabetically, gold if maxed else grey. Exported (only for
// scripts/verify-dungeon-and-enchant-behavior.mjs's own use) so "the imported enchant list is
// always OUR OWN rendering, never Hypixel's raw imported text" can be regression-tested directly.
export function buildAppliedEnchantLines(modifiers) {
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

// Splices applied-enchant lines in at the first blank line, matching where real tooltips show
// them. Exported for the same regression-test reason as buildAppliedEnchantLines above.
export function insertEnchantLines(lore, enchantLines) {
  if (enchantLines.length === 0) return lore;
  const blankIdx = lore.indexOf('');
  if (blankIdx === -1) return [...lore, '', ...enchantLines];
  return [...lore.slice(0, blankIdx + 1), ...enchantLines, '', ...lore.slice(blankIdx + 1)];
}

// Builds the exact real-item tooltip (title + lore) with every applied modifier baked in —
// gemstones, reforge, books/Art of War, special-weapon numbers, enchant stat bonuses and
// name lines, and recombobulation — resolved off the item's current rarity. Shared by every
// screen showing an equipped item's tooltip. Async because of the enchant stat-bonus lookup;
// callers should capture the hover anchor before awaiting.
export async function buildFullItemTooltipLines(
  item,
  modifiers,
  itemData,
  catacombsLevel,
  tamingLevel,
  wolfSlayerLevel,
  chimeraBonus,
  generalsMedallionDigits,
  manticoreClawBonus,
  potatoBookDoubled,
  isMythologicalTarget,
  maxedCollectionsCount,
) {
  if (!item || !modifiers) return [];
  // rarityOverride corrects for the item's real current tier when it differs from the bundled data (e.g. David's Cloak, which upgrades via Hunting milestones rather than a real recomb).
  const baseTier = modifiers.rarityOverride || item.tier;
  const displayTier = modifiers.recombobulated ? bumpRarity(baseTier) : baseTier;
  const gearType = getGearType(item.category);

  // The single canonical computation (lib/itemStatTotals.js) — every number this tooltip shows
  // for a stat comes from here, never re-derived by parsing rendered lore text back out.
  const totals = await computeItemStatTotals(item, modifiers, itemData, {
    catacombsLevel,
    tamingLevel,
    wolfSlayerLevel,
    chimeraBonus,
    generalsMedallionDigits,
    manticoreClawBonus,
    potatoBookDoubled,
    maxedCollectionsCount,
  });
  const isMythological = isMythologicalTarget && MYTHOLOGICAL_STAT_DOUBLE_IDS.has(item.id);

  // Sets every stat line's leading number exactly once, from the already-computed total — on
  // still-pristine lore, before any of the annotate-only passes below run, so each of them finds
  // the real final number already in place and only ever appends an informational "(+X)" next to
  // it (never re-adds into it). A stat the pristine item doesn't show at all gets a brand-new line
  // here (mergeStatIntoBase's own fallback) with no separate annotation, same as before.
  let lore = normalizeAttackSpeedLabel(item.lore);
  const finalValues = {};
  for (const [statKey, t] of Object.entries(totals)) {
    const finalValue = isMythological ? t.mythologicalNonDungeonStarred : t.nonDungeonStarred;
    if (finalValue !== t.pristine) finalValues[statKey] = finalValue - t.pristine;
  }
  lore = mergeStatIntoBase(lore, finalValues, lore.indexOf(''));

  lore = applyGemstonesToLore(lore, modifiers.gemstones, displayTier);
  // Reforge could be a free blacksmith one or a stone-exclusive one — check both maps.
  const reforge = modifiers.reforge
    ? itemData.reforges?.[modifiers.reforge] || itemData.reforgeStones?.[modifiers.reforge]
    : null;
  lore = applyReforgeToLore(lore, modifiers.reforge, reforge, displayTier, lore.indexOf(''), catacombsLevel);
  lore = applyBooksToLore(lore, modifiers.books, modifiers.artOfWar, modifiers.artOfPeace, lore.indexOf(''), gearType, potatoBookDoubled);
  lore = applySpecialToLore(lore, item.id, modifiers.special);

  // Dungeonize: a dark-grey "Catacombs Boost" annotation for every stat the item already has, a
  // dark-blue second one adding Master Stars on top (shown only when the item actually has Master
  // Stars) — both already-computed totals (lib/itemStatTotals.js), just formatted here.
  if (modifiers.dungeonized) {
    lore = applyDungeonizeToLore(lore, totals, modifiers.masterStars, isMythological);
  }

  lore = insertEnchantLines(lore, buildAppliedEnchantLines(modifiers));
  if (modifiers.rarityOverride) lore = applyRarityTagToLore(lore, item.tier, baseTier);
  if (modifiers.recombobulated) lore = applyRecombToLore(lore, baseTier);
  lore = applyFabledToLore(lore, modifiers.reforge);

  const reforgePrefix = modifiers.reforge ? `${modifiers.reforge} ` : '';
  const starSuffix = buildStarSuffix(modifiers.stars) + buildMasterStarSuffix(modifiers.masterStars);
  const title = `§${rarityColorCode(displayTier)}§l${reforgePrefix}${formatItemName(item.name)}${starSuffix ? ` ${starSuffix}` : ''}`;
  return [title, ...lore];
}

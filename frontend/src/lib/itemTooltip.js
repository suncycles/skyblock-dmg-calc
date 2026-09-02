import { rarityColorCode, formatItemName } from './mcText';
import { titleCaseEnchantId, toRoman, fetchEnchantLevels, extractDescriptionLines } from './enchantEffects';
import { parseEnchantStatBonus } from './enchantStats';
import { mergeStatIntoBase } from './statLines';
import { applyGemstonesToLore } from './gemstones';
import { applyReforgeToLore, applyFabledToLore } from './reforges';
import { applyBooksToLore } from './books';
import { applySpecialToLore, computeDaedalusTamingBonus, computeWolfSlayerLevelBonus } from './specialWeapons';
import { computeStarBonuses, buildStarSuffix, buildMasterStarSuffix } from './starring';
import { bumpRarity, applyRecombToLore, applyRarityTagToLore } from './recombobulator';
import { getGearType } from './gearType';
import { computeWitherBladeCatacombsBonus } from './witherBladeBonuses';
import { applyDungeonizeToLore, sumStatFromTooltipLines } from './dungeonize';
import { STAT_LABELS } from './reforgeData';
import { MYTHOLOGICAL_STAT_DOUBLE_IDS } from './armorSetBonuses';

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
async function computeEnchantStatBonuses(modifiers, enchantsMeta, maxedCollectionsCount) {
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

// A handful of real items label their own innate attack-speed stat line "Attack Speed:" instead
// of "Bonus Attack Speed:" (e.g. Deathripper Dagger) — same real player stat, just an
// inconsistent Hypixel tooltip label. Normalized to the canonical "Bonus Attack Speed:" label
// before any other lore transform runs, so mergeStatIntoBase/annotateStatLines and
// damageSources.js's sumStatFromTooltipLines all treat it as the SAME line instead of the
// item's own value getting silently dropped (nothing merges into an unrecognized label) while a
// separate "Bonus Attack Speed: +Y" line gets appended alongside it for every other source.
function normalizeAttackSpeedLabel(lore) {
  return (lore || []).map((line) => {
    const plain = line.replace(/§./g, '');
    if (!/^\s*Attack Speed:/.test(plain)) return line;
    return line.replace(/^(\s*(?:§.)*)(Attack Speed:)/, '$1Bonus $2');
  });
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

  // Real per-account items whose lore was swapped in wholesale (hypixelImport.js's
  // resolveGearSummary, for Gear Score-scaled Dungeon Mob Armor drops) already have their real
  // reforge/books/Dungeonize/gemstone annotations stripped back to a pristine base at that point
  // (see resolveGearSummary's own comment — Hypixel's real lore already separates the pristine
  // base from those bonuses, same as this app's own catalog+modifiers convention), so this
  // pipeline runs unconditionally here and correctly recomputes the real total from the real
  // modifiers (reforge name, books, dungeonized, stars, ...) that import already populated —
  // letting the item's reforge (etc.) actually be changed afterward instead of frozen.
  let lore = applyGemstonesToLore(normalizeAttackSpeedLabel(item.lore), modifiers.gemstones, displayTier);
  // Reforge could be a free blacksmith one or a stone-exclusive one — check both maps.
  const reforge = modifiers.reforge
    ? itemData.reforges?.[modifiers.reforge] || itemData.reforgeStones?.[modifiers.reforge]
    : null;
  lore = applyReforgeToLore(lore, modifiers.reforge, reforge, displayTier, lore.indexOf(''), catacombsLevel);
  lore = applyBooksToLore(lore, modifiers.books, modifiers.artOfWar, modifiers.artOfPeace, lore.indexOf(''), gearType, potatoBookDoubled);
  lore = applySpecialToLore(lore, item.id, modifiers.special);
  // Stars/Wither Blade/Daedalus Taming bonuses merge directly into the item's own base stats.
  // starBonus is captured (not discarded) — Dungeonize below needs to subtract this same delta
  // back out of the fully-merged total to get the Catacombs Boost base (see lib/dungeonize.js).
  const starBonus = computeStarBonuses(item.lore, modifiers.stars);
  lore = mergeStatIntoBase(lore, starBonus, lore.indexOf(''));
  lore = mergeStatIntoBase(lore, computeWitherBladeCatacombsBonus(item.id, catacombsLevel), lore.indexOf(''));
  lore = mergeStatIntoBase(lore, computeDaedalusTamingBonus(item.id, tamingLevel), lore.indexOf(''));
  lore = mergeStatIntoBase(lore, computeWolfSlayerLevelBonus(item.id, wolfSlayerLevel), lore.indexOf(''));
  lore = mergeStatIntoBase(lore, chimeraBonus, lore.indexOf(''));
  lore = mergeStatIntoBase(lore, manticoreClawBonus, lore.indexOf(''));

  // Enchant stat bonuses also merge into the base stat, no separate annotation.
  const enchantStatBonuses = await computeEnchantStatBonuses(modifiers, itemData.enchants, maxedCollectionsCount);
  lore = mergeStatIntoBase(lore, enchantStatBonuses, lore.indexOf(''));

  // Challenger's/Mythos Armor+Equipment's doubled stats against a Mythological target — see
  // armorSetBonuses.js's MYTHOLOGICAL_STAT_DOUBLE_IDS (the same real-lore-vs-reinterpreted-
  // condition note lives there; damageSources.js's collectBaseStats is the other, separate
  // consumer that feeds the actual damage calc). Doubling = merging another full copy of
  // everything settled onto the item so far (base + reforge + gemstones + stars + enchants),
  // read straight off the lore built up to this point — same "fully-settled total" damageSources.js
  // already computes via sumStatFromTooltipLines on this same function's output.
  if (isMythologicalTarget && MYTHOLOGICAL_STAT_DOUBLE_IDS.has(item.id)) {
    const mythologicalBonus = {};
    for (const [statKey, meta] of Object.entries(STAT_LABELS)) {
      const current = sumStatFromTooltipLines(lore, meta.label);
      if (current) mythologicalBonus[statKey] = current;
    }
    lore = mergeStatIntoBase(lore, mythologicalBonus, lore.indexOf(''));
  }

  // Dungeonize: a dark-grey "Catacombs Boost" annotation for every stat the item already has —
  // curve[catacombsLevel] + Catacombs Stars (10%/star) + General's Medallion digits, applied to
  // everything merged above EXCEPT starBonus (the Overworld 2%/star mechanic — see
  // lib/dungeonize.js). A dark-blue second annotation adds Master Stars (5%/star) on top, shown
  // only when the item actually has Master Stars — never present without Dungeonize being on.
  if (modifiers.dungeonized) {
    lore = applyDungeonizeToLore(
      lore,
      catacombsLevel,
      modifiers.dungeonizeOldCurve,
      starBonus,
      modifiers.stars,
      modifiers.masterStars,
      generalsMedallionDigits,
    );
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

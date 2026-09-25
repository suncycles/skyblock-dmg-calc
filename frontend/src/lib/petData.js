import { formatItemName, rarityColorCode } from './mcText.js';
import { parsePetItemStatBoost, applyPetItemStatBoost, extractPetItemEffectLines } from './petItemEffects.js';
import { computeInfusedDragonCritDamage } from './essencePerks';

/* Pet stats from NEU-REPO's constants/petnums.json (the worker forwards it as itemData.pets),
   shaped { [petId]: { [rarity]: { "1": {statNums, otherNums}, "100": {...} } } }. Only levels 1 and
   100 are given; everything between is interpolated here.

   Pets have no NEU-REPO `items/` entry under their plain id, but do exist under the legacy
   "<PETID>;<rarityOrdinal>" scheme ("WOLF;4" is a Legendary Wolf), with lore templated on {LVL},
   {STAT_NAME} and {0}/{1}/{2} ability numbers - fetched on demand via lib/neuItems.js's
   fetchNeuItem and substituted here with the interpolated values. */

export const MAX_PET_LEVEL = 100; // default cap - 3 dragon pets go higher, see EXTENDED_MAX_LEVELS below

// Golden/Jade/Rose Dragon are the only 3 pets that level past 100 (real cap 200).
const EXTENDED_MAX_LEVELS = { GOLDEN_DRAGON: 200, JADE_DRAGON: 200, ROSE_DRAGON: 200 };

export function getMaxPetLevel(petId) {
  return EXTENDED_MAX_LEVELS[petId] || MAX_PET_LEVEL;
}

// Golden Dragon's Shining Scales perk: +11.1 Strength/+2.2 Magic Find per digit of Gold
// Collection, capped at 100M. Not pet-level-scaled. Only Strength is tracked (Magic Find has no aggregate total).
export const SHINING_SCALES_STRENGTH_PER_DIGIT = 11.1;
export const SHINING_SCALES_MAX_GOLD_COLLECTION = 100_000_000;

// Legendary Treasure's %damage-per-million-bank-coins bonus caps per the item's own lore (a
// "(Max +X%)" clause, see lib/damageSources.js's GOLDEN_DRAGON_TREASURE_RE) rather than at a fixed
// coin amount, so 1b is past that cap for any rarity and serves as the assume-max default.
export const MAX_GOLDEN_DRAGON_BANK_COINS = 1_000_000_000;

function goldCollectionDigits(goldCollection) {
  const capped = Math.max(0, Math.min(goldCollection || 0, SHINING_SCALES_MAX_GOLD_COLLECTION));
  return capped === 0 ? 0 : Math.floor(Math.log10(capped)) + 1;
}

export function computeShiningScalesStrength(goldCollection) {
  return goldCollectionDigits(goldCollection) * SHINING_SCALES_STRENGTH_PER_DIGIT;
}

// Adds Shining Scales' Strength into a pet stats map - call before applyPetItemStatBoost so a %-Strength pet item boosts the combined total.
export function applyGoldenDragonShiningScales(petId, stats, goldCollection) {
  if (petId !== 'GOLDEN_DRAGON') return stats;
  const bonus = computeShiningScalesStrength(goldCollection);
  if (!bonus) return stats;
  return { ...stats, STRENGTH: (stats.STRENGTH || 0) + bonus };
}

// Golden Dragon's Dragon's Greed perk: +% Strength per 5 Magic Find, capped at +5% at max
// pet level. Magic Find isn't tracked, so assumed always active at its real max.
export const DRAGONS_GREED_MAX_STRENGTH_PERCENT = 5;

// Lion's Primal Force perk: flat Strength add (and, separately, an equal flat Damage add -
// applied only in the damage-calc aggregator, since pets have no "Damage" stat line to show it
// on), scaled by rarity/level via otherNums[0].
export function applyLionPrimalForce(petId, stats, otherNums) {
  if (petId !== 'LION') return stats;
  const primalForce = otherNums?.[0] || 0;
  if (!primalForce) return stats;
  return { ...stats, STRENGTH: (stats.STRENGTH || 0) + primalForce };
}

// Ankylosaurus's Armored Tank, from its lore: "Gain {0}% of your Defense as Strength. (Max +500)".
// {0} is petnums' otherNums[0] - 0.5 at level 1, 50 at level 100, i.e. 0.5% of Defense per pet
// level. The Defense it reads is lib/playerDefense.js's, the only thing that stat feeds. Its other
// two perks, Unyielding and Clubbed Tail, are not modelled.
export const ANKYLOSAURUS_MAX_STRENGTH = 500;

export function computeAnkylosaurusStrength(playerDefense, otherNums) {
  const percent = otherNums?.[0] || 0;
  return Math.min(ANKYLOSAURUS_MAX_STRENGTH, ((playerDefense || 0) * percent) / 100);
}

export function applyAnkylosaurusStrength(petId, stats, playerDefense, otherNums) {
  if (petId !== 'ANKYLOSAURUS') return stats;
  const strength = computeAnkylosaurusStrength(playerDefense, otherNums);
  return strength ? { ...stats, STRENGTH: (stats.STRENGTH || 0) + strength } : stats;
}

// Standard Hypixel legacy pet-rarity ordinal scheme ("WOLF;0" = Common ... "WOLF;4" = Legendary, "GRIFFIN;5" = Mythic).
export const PET_RARITY_ORDER = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];

// Blaze pet's Bling Armor: "Upgrades Blaze Armor stats and ability by {1}%", where {1} is 0.4% per
// pet level (petnums.json's BLAZE otherNums[1] runs 0.4 at level 1 to 40 at level 100 for RARE,
// EPIC and LEGENDARY; COMMON and UNCOMMON lack the perk). Scales the raw base stats of both Blaze
// and Frozen Blaze Armor.
export const BLING_ARMOR_PERCENT_PER_LEVEL = 0.4;
const BLING_ARMOR_PET_TIERS = new Set(['RARE', 'EPIC', 'LEGENDARY']);
export const BLING_ARMOR_ITEM_IDS = new Set(
  ['BLAZE', 'FROZEN_BLAZE'].flatMap((line) => ['HELMET', 'CHESTPLATE', 'LEGGINGS', 'BOOTS'].map((piece) => `${line}_${piece}`)),
);

export function computeBlingArmorPercent(pet) {
  if (pet?.item?.petId !== 'BLAZE' || !BLING_ARMOR_PET_TIERS.has(pet.item.tier)) return 0;
  return BLING_ARMOR_PERCENT_PER_LEVEL * (pet.modifiers?.level || 0);
}

// The multiplier on one item's raw base stats - 1 for anything that isn't Blaze/Frozen Blaze Armor.
// Mirrors lib/dungeonHeads.js's dungeonHeadBaseStatMultiplier, applied at the same point.
export function blingArmorBaseStatMultiplier(itemId, blingArmorPercent) {
  return blingArmorPercent && BLING_ARMOR_ITEM_IDS.has(itemId) ? 1 + blingArmorPercent / 100 : 1;
}

// The equipped pet's effects on OTHER items' stats, as computeItemStatTotals ctx. One place for
// them, because every stat total - the damage calculation and every tooltip - has to agree.
export function petItemStatContext(pet, itemData) {
  const boosted = applyTierBoost(pet, itemData);
  return {
    potatoBookDoubled: boosted?.item?.petId === 'BLAZE' && boosted?.item?.tier === 'LEGENDARY',
    blingArmorPercent: computeBlingArmorPercent(boosted),
  };
}

// Tier Boost pet item: raises the pet's rarity by one. A pet already at its highest rarity - the
// highest petnums.json has data for - is left as it is.
// The stored loadout keeps the pet's own rarity plus the held item, as Hypixel's API and loadout
// links do, so this runs at read time. It returns the boosted pet with the item consumed
// (petItem: null), so applying it to its own result is a no-op: collectDamageSources applies it once
// up front, and the helpers it calls apply it again harmlessly.
export const TIER_BOOST_ID = 'PET_ITEM_TIER_BOOST';

export function applyTierBoost(loadoutPet, itemData) {
  if (loadoutPet?.modifiers?.petItem !== TIER_BOOST_ID) return loadoutPet;
  const { item, modifiers } = loadoutPet;
  const next = PET_RARITY_ORDER[PET_RARITY_ORDER.indexOf(item.tier) + 1];
  const tier = next && getAvailableRarities(itemData?.pets, item.petId).includes(next) ? next : item.tier;
  return { item: { ...item, tier }, modifiers: { ...modifiers, petItem: null } };
}
const PET_RARITY_ORDINALS = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4, MYTHIC: 5 };

const PET_ID_DISPLAY_NAME_OVERRIDES = {
  TYRANNOSAURUS: 'T-Rex',
};

function titleCase(word) {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function derivePetDisplayName(petId) {
  if (PET_ID_DISPLAY_NAME_OVERRIDES[petId]) return PET_ID_DISPLAY_NAME_OVERRIDES[petId];
  return petId
    .toLowerCase()
    .split('_')
    .map(titleCase)
    .join(' ');
}

// The real NEU-REPO item id for a pet+rarity's own lore.
export function petLoreItemId(petId, rarity) {
  const ordinal = PET_RARITY_ORDINALS[rarity];
  if (ordinal === undefined) return null;
  return `${petId};${ordinal}`;
}

// One row per pet species - rarity is picked in a second step.
export function getUniquePets(petsRaw) {
  return Object.keys(petsRaw || {})
    .map((petId) => ({ petId, name: derivePetDisplayName(petId) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Every rarity petnums.json has data for, in ascending order.
export function getAvailableRarities(petsRaw, petId) {
  const byRarity = (petsRaw && petsRaw[petId]) || {};
  return PET_RARITY_ORDER.filter((r) => byRarity[r] && byRarity[r]['1'] && byRarity[r]['100']);
}

// Interpolates a stat between its level-1/level-100 checkpoints. The 3 dragon pets (maxLevel
// 200) are unhatched eggs for levels 0-100 (no stats/abilities) and only start scaling from
// 101 onward, with petnums.json's "100" checkpoint really meaning level 200 for them.
export function interpolateValue(level1Val, level100Val, level, maxLevel = MAX_PET_LEVEL) {
  const clampedLevel = Math.max(1, Math.min(level || 1, maxLevel));
  if (maxLevel > MAX_PET_LEVEL) {
    if (clampedLevel <= MAX_PET_LEVEL) return 0;
    const t = (clampedLevel - (MAX_PET_LEVEL + 1)) / (maxLevel - MAX_PET_LEVEL - 1);
    return Math.round((level1Val + (level100Val - level1Val) * t) * 10) / 10;
  }
  const t = (clampedLevel - 1) / 99;
  return Math.round((level1Val + (level100Val - level1Val) * t) * 10) / 10;
}

// Uppercase-keyed stat map, matching NEU's own {STAT_NAME} placeholder spelling.
export function computeAllPetStats(levels, level, maxLevel = MAX_PET_LEVEL) {
  if (!levels) return {};
  const level1 = (levels['1'] && levels['1'].statNums) || {};
  const level100 = (levels['100'] && levels['100'].statNums) || {};
  const result = {};
  for (const [key, level1Val] of Object.entries(level1)) {
    const level100Val = level100[key];
    if (level100Val === undefined) continue;
    result[key] = interpolateValue(level1Val, level100Val, level, maxLevel);
  }
  return result;
}

// Chimera ultimate enchant: copies a fraction of the active pet's entire stat spread (20% per
// level, 100% at level 5) onto the weapon's base stats - not just Strength/Crit Chance/Crit Damage,
// so pet-only stats like Attack Speed or Magic Find appear as new lines on the weapon's tooltip.
// Maps petnums.json's uppercase stat keys to this app's lowercase STAT_LABELS keys.
export const CHIMERA_PERCENT_PER_LEVEL = 20;

const PET_STAT_KEY_MAP = {
  STRENGTH: 'strength',
  CRIT_CHANCE: 'crit_chance',
  CRIT_DAMAGE: 'crit_damage',
  BONUS_ATTACK_SPEED: 'bonus_attack_speed',
  MAGIC_FIND: 'magic_find',
  HEALTH: 'health',
  DEFENSE: 'defense',
  TRUE_DEFENSE: 'true_defense',
  INTELLIGENCE: 'intelligence',
  SPEED: 'speed',
  FEROCITY: 'ferocity',
  // Ability Damage is copied by both Chimera and Manticore Claw, like every other stat here; the pet
  // data carries it (Crow, Sheep) and the rest of the pipeline tracks it end to end.
  ABILITY_DAMAGE: 'ability_damage',
};

export function computeChimeraStatBonus(petStats, chimeraLevel) {
  if (!petStats || !chimeraLevel) return null;
  const fraction = (chimeraLevel * CHIMERA_PERCENT_PER_LEVEL) / 100;
  const bonus = {};
  for (const [petKey, ourKey] of Object.entries(PET_STAT_KEY_MAP)) {
    const value = petStats[petKey];
    if (value) bonus[ourKey] = Math.round(value * fraction * 10) / 10;
  }
  return Object.keys(bonus).length > 0 ? bonus : null;
}

// Positional ability numbers a pet's real lore references as {0}, {1}, {2}...
export function computeOtherNums(levels, level, maxLevel = MAX_PET_LEVEL) {
  if (!levels) return [];
  const level1 = (levels['1'] && levels['1'].otherNums) || [];
  const level100 = (levels['100'] && levels['100'].otherNums) || [];
  return level1.map((v, i) => interpolateValue(v, level100[i] ?? v, level, maxLevel));
}

// What Chimera and Manticore Claw copy onto an item: the pet's full stat total - its curve, Golden
// Dragon's Shining Scales, the held Pet Item's boost and Lion's Primal Force. A Golden Dragon
// holding Hephaestus Remedies (+100% Strength) copies the boosted total, not the pre-item number.
// The one exclusion is Ankylosaurus's Armored Tank: it invents a Strength stat on a pet whose curve
// has none, derived from the PLAYER's Defense rather than from the pet, and damageSources.js adds it
// as its own base-stat line (computeAnkylosaurusStrength). Every other perk here boosts a stat
// already on the pet's own line, which is the distinction - not "abilities vs. base stats".
export function computeBasePetStats(loadout, itemData, essencePerks) {
  if (!loadout.pet) return null;
  const { item: pet, modifiers } = applyTierBoost(loadout.pet, itemData);
  const maxLevel = getMaxPetLevel(pet.petId);
  const levels = itemData.pets?.[pet.petId]?.[pet.tier];
  let stats = computeAllPetStats(levels, modifiers.level, maxLevel);
  // Infused Dragon (Dragon essence shop) adds Crit Damage to the Ender Dragon's raw base stats,
  // folded in before Shining Scales, the held pet item and Primal Force, so a %-Crit-Damage pet item
  // boosts the combined total as it does the pet's printed stats. See lib/essencePerks.js.
  const infusedDragon = computeInfusedDragonCritDamage(essencePerks, pet.petId);
  if (infusedDragon) stats = { ...stats, CRIT_DAMAGE: (stats.CRIT_DAMAGE || 0) + infusedDragon };
  stats = applyGoldenDragonShiningScales(pet.petId, stats, modifiers.goldCollection);
  const petItemId = modifiers.petItem;
  const petItem = petItemId ? (itemData.petItems || []).find((i) => i.id === petItemId) : null;
  const boost = petItem ? parsePetItemStatBoost(petItem.lore) : null;
  stats = applyPetItemStatBoost(stats, boost);
  const otherNums = computeOtherNums(levels, modifiers.level, maxLevel);
  return applyLionPrimalForce(pet.petId, stats, otherNums);
}

// Daedalus Blade and Starred Daedalus Blade "copy the base Combat stats of your active pet"
// unconditionally: an intrinsic, always-on Chimera 5 baked into the weapon, independent of the real
// enchant. It stacks additively with a real Chimera 5 to 200% - 10 combined levels through the same
// linear formula - rather than adding a separate flat bonus.
const DAEDALUS_BLADE_IDS = ['DAEDALUS_AXE', 'STARRED_DAEDALUS_AXE'];
const DAEDALUS_BLADE_INTRINSIC_CHIMERA_LEVEL = 5;

// The Chimera bonus for one equipped item slot ({item, modifiers}) - from a real Chimera ultimate
// enchant, Daedalus Blade's intrinsic copy, or both stacked together - or null if neither applies.
export function computeItemChimeraBonus(equipped, petStats) {
  if (!equipped) return null;
  const chimera = [
    ...(equipped.modifiers.hexEnchantments || []),
    ...(equipped.modifiers.ultimateEnchantment ? [equipped.modifiers.ultimateEnchantment] : []),
  ].find((e) => e.id.toLowerCase() === 'ultimate_chimera');
  const enchantLevel = chimera ? chimera.level : 0;
  const intrinsicLevel = DAEDALUS_BLADE_IDS.includes(equipped.item.id) ? DAEDALUS_BLADE_INTRINSIC_CHIMERA_LEVEL : 0;
  const totalLevel = enchantLevel + intrinsicLevel;
  return totalLevel ? computeChimeraStatBonus(petStats, totalLevel) : null;
}

// Manticore Claw gloves: same "copy the equipped pet's Combat stats" mechanic as Chimera, flat 10%.
const MANTICORE_CLAW_PERCENT = 10;

export function computeManticoreClawBonus(equipped, petStats) {
  if (!equipped || equipped.item.id !== 'MANTICORE_CLAW' || !petStats) return null;
  const fraction = MANTICORE_CLAW_PERCENT / 100;
  const bonus = {};
  for (const [petKey, ourKey] of Object.entries(PET_STAT_KEY_MAP)) {
    const value = petStats[petKey];
    if (value) bonus[ourKey] = Math.round(value * fraction * 10) / 10;
  }
  return Object.keys(bonus).length > 0 ? bonus : null;
}

function formatPlaceholderNum(n) {
  return String(Math.round(n * 10) / 10);
}

// Drops the "Right-click to add this pet to your pet menu!" hint paragraph - real mechanic, but noise in a single-pet calculator.
function removeAddToPetMenuHint(loreLines) {
  const paragraphs = [];
  let current = [];
  for (const line of loreLines) {
    if (line === '') {
      paragraphs.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  paragraphs.push(current);

  const kept = paragraphs.filter((p) => !p.some((l) => /add this pet to your/i.test(l.replace(/§./g, ''))));
  const result = [];
  kept.forEach((p, i) => {
    if (i > 0) result.push('');
    result.push(...p);
  });
  return result;
}

// Fills a pet lore template's {LVL}/{STAT_NAME}/{0}{1}{2}... placeholders with interpolated
// values. A placeholder with no matching value is left as-is rather than silently dropped.
export function substitutePetLore(loreLines, level, statValues, otherNumValues) {
  const substituted = loreLines.map((line) =>
    line
      .replace(/\{LVL\}/g, String(level))
      .replace(/\{([A-Z_]+)\}/g, (m, key) => (statValues[key] !== undefined ? formatPlaceholderNum(statValues[key]) : m))
      .replace(/\{(\d+)\}/g, (m, idx) =>
        otherNumValues[Number(idx)] !== undefined ? formatPlaceholderNum(otherNumValues[Number(idx)]) : m,
      ),
  );
  return removeAddToPetMenuHint(substituted);
}

// The full lore-with-stats-substituted tooltip, shared by PetDetail's side panel and Landing's hover
// tooltip. `rawLore` is fetchNeuItem's result, `false` for a failed fetch and null/undefined while
// loading - left to the caller, since PetDetail keeps it in state while Landing fetches per hover.
export function buildPetTooltipLines(pet, modifiers, itemData, rawLore, playerDefense = 0) {
  const level = modifiers?.level ?? 0;
  const maxLevel = getMaxPetLevel(pet.petId);
  // The caller fetches rawLore for this same boosted rarity; the Held Item line below still shows the Tier Boost.
  const { tier } = applyTierBoost({ item: pet, modifiers }, itemData).item;
  const tierColor = rarityColorCode(tier);
  if (rawLore === null || rawLore === undefined) return [`§${tierColor}§l${pet.name}`, '', '§7Loading...'];
  if (rawLore === false) return [`§${tierColor}§l[Lvl ${level}] ${pet.name}`, '§7No lore available.'];

  const petItemId = modifiers?.petItem;
  const petItem = petItemId ? (itemData.petItems || []).find((i) => i.id === petItemId) : null;
  const levels = itemData.pets?.[pet.petId]?.[tier];
  let stats = computeAllPetStats(levels, level, maxLevel);
  stats = applyGoldenDragonShiningScales(pet.petId, stats, modifiers?.goldCollection);
  const statBoost = petItem ? parsePetItemStatBoost(petItem.lore) : null;
  stats = applyPetItemStatBoost(stats, statBoost);
  const otherNums = computeOtherNums(levels, level, maxLevel);
  stats = applyLionPrimalForce(pet.petId, stats, otherNums);
  stats = applyAnkylosaurusStrength(pet.petId, stats, playerDefense, otherNums);
  const lore = substitutePetLore(rawLore.lore, level, stats, otherNums);
  const title = (rawLore.displayname || `§${tierColor}§l${pet.name}`).replace('{LVL}', String(level));
  const heldItemLines = petItem
    ? [`§7Held Item: §${rarityColorCode(petItem.tier)}${formatItemName(petItem.name)}`, ...(extractPetItemEffectLines(petItem.lore) || [])]
    : [];
  const withHeldItem = heldItemLines.length > 0 ? [...lore.slice(0, -1), ...heldItemLines, lore[lore.length - 1]] : lore;
  return [formatItemName(title), ...withHeldItem];
}

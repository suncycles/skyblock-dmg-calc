import { formatItemName, rarityColorCode } from './mcText';
import { parsePetItemStatBoost, applyPetItemStatBoost, extractPetItemEffectLines } from './petItemEffects';

/* Pet stats, sourced from NEU-REPO's constants/petnums.json (worker forwards it live under
   itemData.pets) — shaped { [petId]: { [rarity]: { "1": {statNums, otherNums}, "100": {...} } } }.
   Only levels 1 and 100 are given; everything in between is linearly interpolated here.

   Pets aren't NEU-REPO `items/` entries under their plain id, but do exist under the legacy
   Hypixel "<PETID>;<rarityOrdinal>" id scheme (e.g. "WOLF;4" = Legendary Wolf), with real lore
   templated with {LVL}, {STAT_NAME}, and {0}/{1}/{2}... ability-number placeholders — fetched
   on demand via lib/neuItems.js's fetchNeuItem, substituted here using interpolated values. */

export const MAX_PET_LEVEL = 100; // default cap — 3 dragon pets go higher, see EXTENDED_MAX_LEVELS below

// Golden/Jade/Rose Dragon are the only 3 pets that level past 100 (real cap 200).
const EXTENDED_MAX_LEVELS = { GOLDEN_DRAGON: 200, JADE_DRAGON: 200, ROSE_DRAGON: 200 };

export function getMaxPetLevel(petId) {
  return EXTENDED_MAX_LEVELS[petId] || MAX_PET_LEVEL;
}

// Golden Dragon's Shining Scales perk: +11.1 Strength/+2.2 Magic Find per digit of Gold
// Collection, capped at 100M. Not pet-level-scaled. Only Strength is tracked (Magic Find has no aggregate total).
export const SHINING_SCALES_STRENGTH_PER_DIGIT = 11.1;
export const SHINING_SCALES_MAGIC_FIND_PER_DIGIT = 2.2; // not tracked — reference only
export const SHINING_SCALES_MAX_GOLD_COLLECTION = 100_000_000;

function goldCollectionDigits(goldCollection) {
  const capped = Math.max(0, Math.min(goldCollection || 0, SHINING_SCALES_MAX_GOLD_COLLECTION));
  return capped === 0 ? 0 : Math.floor(Math.log10(capped)) + 1;
}

export function computeShiningScalesStrength(goldCollection) {
  return goldCollectionDigits(goldCollection) * SHINING_SCALES_STRENGTH_PER_DIGIT;
}

// Adds Shining Scales' Strength into a pet stats map — call before applyPetItemStatBoost so a %-Strength pet item boosts the combined total.
export function applyGoldenDragonShiningScales(petId, stats, goldCollection) {
  if (petId !== 'GOLDEN_DRAGON') return stats;
  const bonus = computeShiningScalesStrength(goldCollection);
  if (!bonus) return stats;
  return { ...stats, STRENGTH: (stats.STRENGTH || 0) + bonus };
}

// Golden Dragon's Dragon's Greed perk: +% Strength per 5 Magic Find, capped at +5% at max
// pet level. Magic Find isn't tracked, so assumed always active at its real max.
export const DRAGONS_GREED_MAX_STRENGTH_PERCENT = 5;

// Lion's Primal Force perk: flat Strength add (and, separately, an equal flat Damage add —
// applied only in the damage-calc aggregator, since pets have no "Damage" stat line to show it
// on), scaled by rarity/level via otherNums[0].
export function applyLionPrimalForce(petId, stats, otherNums) {
  if (petId !== 'LION') return stats;
  const primalForce = otherNums?.[0] || 0;
  if (!primalForce) return stats;
  return { ...stats, STRENGTH: (stats.STRENGTH || 0) + primalForce };
}

// Ankylosaurus: assumed always at its real max (+500 Strength), ignoring its actual
// "Unyielding"/"Clubbed Tail" perks per instruction.
export const ANKYLOSAURUS_MAX_STRENGTH = 500;

export function applyAnkylosaurusMax(petId, stats) {
  if (petId !== 'ANKYLOSAURUS') return stats;
  return { ...stats, STRENGTH: (stats.STRENGTH || 0) + ANKYLOSAURUS_MAX_STRENGTH };
}

// Standard Hypixel legacy pet-rarity ordinal scheme ("WOLF;0" = Common ... "WOLF;4" = Legendary, "GRIFFIN;5" = Mythic).
export const PET_RARITY_ORDER = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
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

// One row per pet species — rarity is picked in a second step.
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

// Chimera ultimate enchant: copies a fraction (20%/level, 100% at max level 5) of the active
// pet's *entire* stat spread onto the equipped weapon's own base stats — not just
// Strength/Crit Chance/Crit Damage, so pet-only stats like Attack Speed or Magic Find show up
// as brand-new lines on the weapon's tooltip too. Maps petnums.json's own uppercase stat keys
// to this app's lowercase STAT_LABELS keys (lib/reforgeData.js).
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

// Full pet-stat pipeline (interpolate -> Shining Scales -> pet item -> Ender Dragon Superior) —
// shared by the damage-calc aggregator and any item tooltip that needs the active pet's stats (Chimera).
export function computeEquippedPetStats(loadout, itemData) {
  if (!loadout.pet) return null;
  const { item: pet, modifiers } = loadout.pet;
  const maxLevel = getMaxPetLevel(pet.petId);
  const levels = itemData.pets?.[pet.petId]?.[pet.tier];
  let stats = computeAllPetStats(levels, modifiers.level, maxLevel);
  stats = applyGoldenDragonShiningScales(pet.petId, stats, modifiers.goldCollection);
  const petItemId = modifiers.petItem;
  const petItem = petItemId ? (itemData.petItems || []).find((i) => i.id === petItemId) : null;
  const boost = petItem ? parsePetItemStatBoost(petItem.lore) : null;
  stats = applyPetItemStatBoost(stats, boost);
  const otherNums = computeOtherNums(levels, modifiers.level, maxLevel);
  stats = applyLionPrimalForce(pet.petId, stats, otherNums);
  return applyAnkylosaurusMax(pet.petId, stats);
}

// The Chimera bonus for one equipped item slot ({item, modifiers}), or null if it doesn't have Chimera applied.
export function computeItemChimeraBonus(equipped, petStats) {
  if (!equipped) return null;
  const chimera = [
    ...(equipped.modifiers.hexEnchantments || []),
    ...(equipped.modifiers.ultimateEnchantment ? [equipped.modifiers.ultimateEnchantment] : []),
  ].find((e) => e.id.toLowerCase() === 'ultimate_chimera');
  return chimera ? computeChimeraStatBonus(petStats, chimera.level) : null;
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

// Drops the "Right-click to add this pet to your pet menu!" hint paragraph — real mechanic, but noise in a single-pet calculator.
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

// The full real-lore-with-stats-substituted tooltip, shared by PetDetail's side panel and
// Landing's hover tooltip. `rawLore` is fetchNeuItem's result (or `false` for a failed fetch,
// `null`/`undefined` while loading) — left to the caller since PetDetail keeps it in state
// while Landing fetches it fresh per hover.
export function buildPetTooltipLines(pet, modifiers, itemData, rawLore) {
  const level = modifiers?.level ?? 0;
  const maxLevel = getMaxPetLevel(pet.petId);
  const tierColor = rarityColorCode(pet.tier);
  if (rawLore === null || rawLore === undefined) return [`§${tierColor}§l${pet.name}`, '', '§7Loading...'];
  if (rawLore === false) return [`§${tierColor}§l[Lvl ${level}] ${pet.name}`, '§7No lore available.'];

  const petItemId = modifiers?.petItem;
  const petItem = petItemId ? (itemData.petItems || []).find((i) => i.id === petItemId) : null;
  const levels = itemData.pets?.[pet.petId]?.[pet.tier];
  let stats = computeAllPetStats(levels, level, maxLevel);
  stats = applyGoldenDragonShiningScales(pet.petId, stats, modifiers?.goldCollection);
  const statBoost = petItem ? parsePetItemStatBoost(petItem.lore) : null;
  stats = applyPetItemStatBoost(stats, statBoost);
  const otherNums = computeOtherNums(levels, level, maxLevel);
  stats = applyLionPrimalForce(pet.petId, stats, otherNums);
  stats = applyAnkylosaurusMax(pet.petId, stats);
  const lore = substitutePetLore(rawLore.lore, level, stats, otherNums);
  const title = (rawLore.displayname || `§${tierColor}§l${pet.name}`).replace('{LVL}', String(level));
  const heldItemLines = petItem
    ? [`§7Held Item: §${rarityColorCode(petItem.tier)}${formatItemName(petItem.name)}`, ...(extractPetItemEffectLines(petItem.lore) || [])]
    : [];
  const withHeldItem = heldItemLines.length > 0 ? [...lore.slice(0, -1), ...heldItemLines, lore[lore.length - 1]] : lore;
  return [formatItemName(title), ...withHeldItem];
}

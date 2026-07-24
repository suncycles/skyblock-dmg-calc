import { formatItemName, rarityColorCode } from './mcText';
import { parsePetItemStatBoost, applyPetItemStatBoost, extractPetItemEffectLines } from './petItemEffects';

/* Pet stats, sourced from NEU-REPO's constants/petnums.json (worker
   forwards it live under itemData.pets, see worker/src/index.js) — shaped
   { [petId]: { [rarity]: { "1": {statNums, otherNums}, "100": {statNums, otherNums} } } }.
   Only levels 1 and 100 are given; everything in between is linearly
   interpolated here. Real Hypixel pet stats aren't guaranteed linear by
   level, so this is a documented simplification — same kind of judgment
   call as lib/specialWeapons.js's linear Midas Sword/Staff approximation.

   Unlike weapons/armor/pet items, pets aren't NEU-REPO `items/` entries
   under their plain id — but they DO exist under the legacy Hypixel
   "<PETID>;<rarityOrdinal>" id scheme (e.g. "WOLF;4" = Legendary Wolf),
   with real lore templated with {LVL}, {STAT_NAME}, and {0}/{1}/{2}...
   ability-number placeholders — verified directly against NEU-REPO.
   That's fetched on demand via lib/neuItems.js's fetchNeuItem, exactly
   like reforge stones/pet items' own real lore, and the placeholders are
   substituted here using the same interpolated values. */

export const MAX_PET_LEVEL = 100; // default cap — 3 dragon pets go higher, see EXTENDED_MAX_LEVELS below

// Golden/Jade/Rose Dragon are the only 3 pets that level past 100 (real
// cap 200) — verified against NEU-REPO's constants/pets.json
// (custom_pet_leveling) and petnums.json (each has a
// "stats_levelling_curve": "101:200:1" marker on its one LEGENDARY entry,
// meaning levels 101-200 just continue the same per-level rate
// established between the 1 and 100 checkpoints — no new checkpoint/curve
// exists for 200, so interpolateValue's rate calculation below is left
// untouched and just allowed to run past its usual level-100 ceiling.
const EXTENDED_MAX_LEVELS = { GOLDEN_DRAGON: 200, JADE_DRAGON: 200, ROSE_DRAGON: 200 };

export function getMaxPetLevel(petId) {
  return EXTENDED_MAX_LEVELS[petId] || MAX_PET_LEVEL;
}

// Golden Dragon's "Shining Scales" perk — real NEU-REPO lore (fetched
// this session): "Grants +11.1 Strength and +2.2 Magic Find to your pet
// for each digit in your Gold Collection. (Max 100M collection)". The
// numbers are hardcoded directly in the lore string (no {n} template
// placeholder), so unlike every other Golden Dragon perk this one isn't
// pet-level-scaled at all — verified against the wiki: "The Shining
// Scales perk adds to the base stats of the pet," i.e. it's summed into
// the pet's own STRENGTH before any pet-item %-boost multiplies the
// total (see applyGoldenDragonShiningScales below). Magic Find isn't
// tracked as an aggregate anywhere in this app (same "nothing to add it
// to" judgment as God Potion's Jerry Candy), so only Strength is wired.
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

// Adds Shining Scales' Strength contribution into an already-computed
// pet stats map (see computeAllPetStats) — call this BEFORE
// applyPetItemStatBoost so a %-Strength pet item (e.g. Hephaestus
// Remedies) correctly boosts the combined total, matching the real
// in-game behavior of a base-stat bonus.
export function applyGoldenDragonShiningScales(petId, stats, goldCollection) {
  if (petId !== 'GOLDEN_DRAGON') return stats;
  const bonus = computeShiningScalesStrength(goldCollection);
  if (!bonus) return stats;
  return { ...stats, STRENGTH: (stats.STRENGTH || 0) + bonus };
}

// Ender Dragon's Legendary-only "Superior" perk — real NEU-REPO lore
// (ENDER_DRAGON;4.json, fetched this session): "Increases all Combat
// stats and Magic Find by {3}%", where {3} is otherNums[3] (index 3 —
// End Strike's own {0}, One With The Dragon's {1}/{2} come first),
// scaling 0.1%/level from petnums.json's own level-1/level-100
// checkpoints (0.1% -> 10%, i.e. reaching the real "10% at max level"
// headline number exactly at level 100). Unlike Dragon's Greed, pet
// level IS already tracked per-pet in this app, so this scales with the
// player's actual entered level rather than assuming max. Multiplies the
// pet's own already-computed Strength/Crit Chance/Crit Damage total
// (after Shining Scales/pet-item boosts, since those are also part of
// "the pet's stats" the ability describes itself as increasing) — call
// this last in the pet-stat pipeline.
export function applyEnderDragonSuperior(petId, tier, stats, otherNums) {
  if (petId !== 'ENDER_DRAGON' || tier !== 'LEGENDARY') return stats;
  const percent = otherNums?.[3];
  if (!percent) return stats;
  const factor = 1 + percent / 100;
  return {
    ...stats,
    STRENGTH: (stats.STRENGTH || 0) * factor,
    CRIT_CHANCE: (stats.CRIT_CHANCE || 0) * factor,
    CRIT_DAMAGE: (stats.CRIT_DAMAGE || 0) * factor,
  };
}

// Golden Dragon's "Dragon's Greed" perk — real NEU-REPO lore (fetched
// this session): "Grants +{1}% Strength per 5 Magic Find. (Max +{2}%)",
// where {1}/{2} are pet-level-scaled otherNums that cap at +0.5%/+5%
// respectively at max pet level (verified against petnums.json's own
// "100" checkpoint for GOLDEN_DRAGON;4 — 0.5% per 5 Magic Find, capped
// at 5%). Magic Find isn't tracked as an aggregate anywhere in this app
// (same judgment as Shining Scales' own Magic Find half), so per
// instruction this is assumed always active at its real max (+5%)
// rather than scaled off a Magic Find input — applied in
// lib/damageSources.js as a flat 5% boost on the fully-summed Strength
// total, same "extra multiplier baked in as its own base-stat source
// line" pattern as the Unlimited Power attribute.
export const DRAGONS_GREED_MAX_STRENGTH_PERCENT = 5;

// Standard Hypixel legacy pet-rarity ordinal scheme, verified against
// NEU-REPO ("WOLF;0" = Common ... "WOLF;4" = Legendary, "GRIFFIN;5" = Mythic).
export const PET_RARITY_ORDER = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
const PET_RARITY_ORDINALS = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4, MYTHIC: 5 };

const PET_ID_DISPLAY_NAME_OVERRIDES = {
  TYRANNOSAURUS: 'T-Rex', // the only entry in NEU-REPO's id_to_display_name
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

// The real NEU-REPO item id for a pet+rarity's own lore — see fetchNeuItem.
export function petLoreItemId(petId, rarity) {
  const ordinal = PET_RARITY_ORDINALS[rarity];
  if (ordinal === undefined) return null;
  return `${petId};${ordinal}`;
}

// One row per pet species (not per rarity) — rarity is picked in a
// second step, same 2-step flow as gemstones (type, then tier).
export function getUniquePets(petsRaw) {
  return Object.keys(petsRaw || {})
    .map((petId) => ({ petId, name: derivePetDisplayName(petId) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Every rarity petnums.json actually has data for, in ascending order —
// most pets don't go up to Mythic (e.g. Wolf tops out at Legendary).
export function getAvailableRarities(petsRaw, petId) {
  const byRarity = (petsRaw && petsRaw[petId]) || {};
  return PET_RARITY_ORDER.filter((r) => byRarity[r] && byRarity[r]['1'] && byRarity[r]['100']);
}

// `maxLevel` only clamps how high `level` is allowed to go for most pets
// (100), but the 3 dragon pets (maxLevel 200) are a different mechanic
// entirely, not just a longer version of the same curve: they're an
// unhatched egg — no stats, no abilities — for the whole 0-100 range, and
// only start actually leveling up (stats/abilities scaling in) from 101
// onward. petnums.json's own "100" checkpoint is really the level-200
// (max) value for these, not level 100's — verified against real pet
// lore/wiki behavior, not an assumption this file's data shape can show
// on its own. Detected purely from `maxLevel > MAX_PET_LEVEL` (only the
// 3 dragons ever pass 200) rather than needing the petId threaded in.
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

// Unfiltered, uppercase-keyed — used to fill in a real lore template's
// {STAT_NAME} placeholders, which reference NEU's own stat key spelling
// directly (unlike the damage-calc's own lowercase STAT_LABELS keys).
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

// otherNums are positional (ability-specific, unlabeled) numbers a pet's
// real lore references as {0}, {1}, {2}... in order.
export function computeOtherNums(levels, level, maxLevel = MAX_PET_LEVEL) {
  if (!levels) return [];
  const level1 = (levels['1'] && levels['1'].otherNums) || [];
  const level100 = (levels['100'] && levels['100'].otherNums) || [];
  return level1.map((v, i) => interpolateValue(v, level100[i] ?? v, level, maxLevel));
}

function formatPlaceholderNum(n) {
  return String(Math.round(n * 10) / 10);
}

// Every pet's real NEU-REPO lore ends with a "Right-click to add this
// pet to your pet menu!" hint — a real in-game mechanic (summoning a pet
// from your collection) that's just noise in a calculator that only
// ever shows one pet at a time. Dropped as a whole blank-line-bounded
// paragraph (not a fixed line count) so it doesn't matter how many
// lines the sentence wraps to.
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

// Fills in a real pet item lore template's {LVL}/{STAT_NAME}/{0}{1}{2}...
// placeholders with this level's interpolated values. Any placeholder
// with no matching value (e.g. a stat this pet doesn't have) is left
// as-is rather than silently dropped, so a gap is visible rather than
// hidden.
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

// The full real-lore-with-stats-substituted tooltip, shared by PetDetail's
// permanent side panel and Landing's hover tooltip so both show the exact
// same thing for the same pet — `rawLore` is the already-fetched
// fetchNeuItem(petLoreItemId(...)) result (or `false` for "fetch failed
// with no lore", or `null`/`undefined` while still loading), left to the
// caller since PetDetail keeps it in state across renders while Landing
// fetches it fresh per hover.
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
  const lore = substitutePetLore(rawLore.lore, level, stats, otherNums);
  const title = (rawLore.displayname || `§${tierColor}§l${pet.name}`).replace('{LVL}', String(level));
  const heldItemLines = petItem
    ? [`§7Held Item: §${rarityColorCode(petItem.tier)}${formatItemName(petItem.name)}`, ...(extractPetItemEffectLines(petItem.lore) || [])]
    : [];
  const withHeldItem = heldItemLines.length > 0 ? [...lore.slice(0, -1), ...heldItemLines, lore[lore.length - 1]] : lore;
  return [formatItemName(title), ...withHeldItem];
}

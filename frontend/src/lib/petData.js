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

// `maxLevel` only clamps how high `level` is allowed to go (100 normally,
// 200 for the 3 dragon pets) — the interpolation rate itself is always
// anchored on the level-1/level-100 checkpoint pair petnums.json actually
// provides (99 steps), so levels 101-200 extrapolate that same rate
// rather than getting compressed into a 0..1 fraction of a 200-level
// span that has no real level-200 checkpoint to interpolate toward.
export function interpolateValue(level1Val, level100Val, level, maxLevel = MAX_PET_LEVEL) {
  const clampedLevel = Math.max(1, Math.min(level || 1, maxLevel));
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

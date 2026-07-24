/* Real per-level enchant effect text, sourced directly from NEU-REPO's
   enchanted-book item files (items/{ID};{level}.json — e.g. SHARPNESS;1.json)
   rather than any hand-written description table. Verified against the
   in-game format: book lore is "§9{Name} {roman}" then a short description
   block, a blank line, then apply/source/applicable-to text.

   NEU-REPO has no dedicated "enchantments" API, but raw.githubusercontent.com
   serves these files with permissive CORS, so the frontend fetches them
   directly rather than routing through the worker — this is a handful of
   small, cacheable, on-demand lookups (only for the one enchant currently
   being viewed), unlike the 8000+ file bulk ingest the worker's weapon/armor
   data needed offline preprocessing for. */

const NEU_ITEMS_BASE = 'https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/items';
const MAX_PROBE_LEVEL = 10;

const levelsCache = new Map(); // enchantId -> Promise<Array<{level, lore}>>

async function fetchLevel(fileId, level) {
  const url = `${NEU_ITEMS_BASE}/${encodeURIComponent(`${fileId};${level}`)}.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return { level, lore: data.lore || [] };
  } catch {
    return null;
  }
}

async function probeLevels(fileId) {
  const results = await Promise.all(
    Array.from({ length: MAX_PROBE_LEVEL }, (_, i) => fetchLevel(fileId, i + 1)),
  );
  return results.filter(Boolean);
}

// Some category-list enchant ids are legacy/internal names that don't match
// a NEU item file directly (e.g. "dragon_tracer" -> file id "AIMING"); the
// worker's enchant data carries enchant_mapping_id/enchant_mapping_item as
// parallel arrays pairing these, not consistently ordered old->new, so check
// both directions — same resolution the enchant-list tooltip already needed.
function resolveAlternateFileId(enchantsMeta, id) {
  const mapItem = (enchantsMeta && enchantsMeta.enchant_mapping_item) || [];
  const mapId = (enchantsMeta && enchantsMeta.enchant_mapping_id) || [];
  const key = id.toLowerCase();
  for (let i = 0; i < mapId.length; i++) {
    if (mapId[i].toLowerCase() === key) return mapItem[i].toUpperCase();
    if (mapItem[i].toLowerCase() === key) return mapId[i].toUpperCase();
  }
  return null;
}

// Fetches every existing level (1..10, probed) for an enchant, each with its
// real lore. Used both for the level-picker GUI and to derive min...max
// effect text for the enchant-list hover tooltip. Cached per enchant id.
export function fetchEnchantLevels(id, enchantsMeta) {
  if (levelsCache.has(id)) return levelsCache.get(id);

  const promise = (async () => {
    let levels = await probeLevels(id.toUpperCase());
    if (levels.length === 0) {
      const altFileId = resolveAlternateFileId(enchantsMeta, id);
      if (altFileId) levels = await probeLevels(altFileId);
    }
    return levels;
  })();

  levelsCache.set(id, promise);
  return promise;
}

// Usually line 0 is the level name (e.g. "§9Sharpness I") and the description
// runs right after it. A few enchants (e.g. Pyroclasm/"magmarizer") lead with
// an unrelated note line — "§8Combinable in Anvil" — before a blank line and
// the real name, which broke the "line 0 is always the name" assumption:
// description extraction hit that leading blank immediately and returned
// nothing. Find the actual name line by its shape (ends in a roman numeral)
// instead of assuming its position.
function findNameLineIndex(lore) {
  for (let i = 0; i < lore.length; i++) {
    const plain = lore[i].replace(/§./g, '').trim();
    if (ROMAN.slice(1).some((r) => plain.endsWith(` ${r}`))) return i;
  }
  return 0;
}

// The description block runs from just after the name line until the next
// blank line.
export function extractDescriptionLines(lore) {
  const nameIdx = findNameLineIndex(lore);
  const lines = [];
  for (let i = nameIdx + 1; i < lore.length; i++) {
    if (lore[i] === '') break;
    lines.push(lore[i]);
  }
  return lines;
}

// Merges two same-shaped lore lines, replacing differing numeric runs with
// "min...max" (e.g. "§a5%" + "§a65%" -> "§a5...65%"). Non-numeric text and
// numbers that don't change between levels are left untouched.
function numericDiffMerge(lineMin, lineMax) {
  const re = /\d+(?:[.,]\d+)?/g;
  const numsMin = [...lineMin.matchAll(re)];
  const numsMax = [...lineMax.matchAll(re)];
  if (numsMin.length === 0 || numsMin.length !== numsMax.length) return lineMin;

  let result = '';
  let cursor = 0;
  for (let i = 0; i < numsMin.length; i++) {
    const a = numsMin[i];
    const b = numsMax[i];
    result += lineMin.slice(cursor, a.index);
    result += a[0] === b[0] ? a[0] : `${a[0]}...${b[0]}`;
    cursor = a.index + a[0].length;
  }
  result += lineMin.slice(cursor);
  return result;
}

// Builds the "effect" lines shown in the enchant-list hover tooltip: the
// level-1 description with any level-scaling numbers expanded to a range,
// e.g. ["§7Increases melee damage dealt by", "§a5...65%"].
export function buildEffectLines(levels) {
  if (!levels || levels.length === 0) return null;
  const first = levels[0];
  const last = levels[levels.length - 1];
  const descMin = extractDescriptionLines(first.lore);
  const descMax = extractDescriptionLines(last.lore);
  if (descMin.length !== descMax.length) return descMin;
  return descMin.map((line, i) => numericDiffMerge(line, descMax[i]));
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export function toRoman(level) {
  return ROMAN[level] || String(level);
}

// weapons.json/armor.json categories don't all match NEU-REPO's own
// enchant category keys 1:1 — NEU's enchants.json only has SWORD/BOW/
// LONGSWORD for melee/ranged weapons (verified against a snapshot: no
// "DUNGEON SWORD", "DUNGEON BOW", or "WAND" key exists at all), so those
// categories were silently showing zero enchants rather than falling
// back to the base weapon type they actually share enchants with in the
// real game. Dungeon Longswords resolve to NEU's real "LONGSWORD" key
// (a distinct enchant pool from plain swords), not "SWORD". Extend this
// as armor categories need the same treatment (e.g. a future "DUNGEON
// HELMET" category, if one turns out not to match NEU's "HELMET" key).
const ENCHANT_CATEGORY_ALIASES = {
  'DUNGEON SWORD': 'SWORD',
  'THE WYLD SWORD': 'SWORD',
  WAND: 'SWORD', // Wands/Staffs take Sword enchants in the real game
  'DUNGEON BOW': 'BOW',
  'DUNGEON LONGSWORD': 'LONGSWORD',
  // Unlike the weapon dungeon variants above, plain HELMET/CHESTPLATE/
  // LEGGINGS/BOOTS already match NEU's real enchants.json keys directly —
  // only the DUNGEON-prefixed armor categories need aliasing.
  'DUNGEON HELMET': 'HELMET',
  'DUNGEON CHESTPLATE': 'CHESTPLATE',
  'DUNGEON LEGGINGS': 'LEGGINGS',
  'DUNGEON BOOTS': 'BOOTS',
  // Same story for equipment: NECKLACE/CLOAK/BELT/GLOVES all match NEU's
  // enchants.json keys directly (verified against a snapshot), only the
  // DUNGEON-prefixed variants need aliasing.
  'DUNGEON NECKLACE': 'NECKLACE',
  'DUNGEON CLOAK': 'CLOAK',
  'DUNGEON BELT': 'BELT',
  'DUNGEON GLOVES': 'GLOVES',
};

export function resolveEnchantCategory(category) {
  return ENCHANT_CATEGORY_ALIASES[category] || category;
}

// NEU-REPO's per-category enchant lists are occasionally missing an
// enchant entirely, not just filed under an alternate id — verified
// against the enchant's own real lore/wiki page. Habanero Tactics'
// pristine lore (ULTIMATE_HABANERO_TACTICS;4/5.json) reads "Applied To:
// Armor," and its wiki page confirms it can go on any armor piece, but
// NEU's HELMET/CHESTPLATE/LEGGINGS/BOOTS category lists have no entry
// for it at all (checked directly, not just under a different id).
const MISSING_CATEGORY_ENCHANTS = {
  HELMET: ['ultimate_habanero_tactics'],
  CHESTPLATE: ['ultimate_habanero_tactics'],
  LEGGINGS: ['ultimate_habanero_tactics'],
  BOOTS: ['ultimate_habanero_tactics'],
};

// Same {enchants: {CATEGORY: [ids]}} shape as itemData.enchants, patched
// with the above — callers should use this instead of reading
// enchantsMeta.enchants[category] directly.
export function getCategoryEnchantIds(enchantsMeta, category) {
  const base = (enchantsMeta && enchantsMeta.enchants && enchantsMeta.enchants[category]) || [];
  const missing = (MISSING_CATEGORY_ENCHANTS[category] || []).filter((id) => !base.includes(id));
  return missing.length > 0 ? [...base, ...missing] : base;
}

// NEU-REPO's category-list enchant ids don't always match the enchant's real
// current display name, and titleCaseEnchantId's default "strip ultimate_,
// title-case the rest" rule is wrong for a few specific ids. Verified against
// each enchant's own item lore (items/{ID};1.json):
//  - "ultimate_wise" really does display as "Ultimate Wise" (unlike every
//    other ultimate, which drops the "Ultimate" word — e.g. ULTIMATE_ONE_FOR_ALL;1
//    lore says "One For All I", but ULTIMATE_WISE;1 says "Ultimate Wise I").
//  - "ultimate_reiterate" is the id for what's actually named "Duplex".
//  - "syphon" is the id for what's actually named "Drain".
//  - "aiming" is the id for what's actually named "Dragon Tracer".
//  - "dragon_hunter" is the id for what's actually named "Gravity".
//  - "magmarizer" is the id for what's actually named "Pyroclasm".
const DISPLAY_NAME_OVERRIDES = {
  ultimate_wise: 'Ultimate Wise',
  ultimate_reiterate: 'Duplex',
  syphon: 'Drain',
  aiming: 'Dragon Tracer',
  dragon_hunter: 'Gravity',
  magmarizer: 'Pyroclasm',
};

// "ultimate_duplex" is a second, broken category-list entry for the same
// enchant as "ultimate_reiterate" — probing ULTIMATE_DUPLEX;1..10 all 404,
// there's no item data behind it at all. Hide it rather than show a dead slot.
const HIDDEN_ENCHANT_IDS = new Set(['ultimate_duplex']);

export function isHiddenEnchant(id) {
  return HIDDEN_ENCHANT_IDS.has(id.toLowerCase());
}

// Strips the "ultimate_" prefix (real lore doesn't include it for most
// ultimates, e.g. "ultimate_one_for_all" displays as "One For All") before
// title-casing, except for the overrides above.
export function titleCaseEnchantId(id) {
  const key = id.toLowerCase();
  if (DISPLAY_NAME_OVERRIDES[key]) return DISPLAY_NAME_OVERRIDES[key];
  const stripped = key.startsWith('ultimate_') ? key.slice(9) : key;
  return stripped
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function isUltimateEnchant(id) {
  return id.toLowerCase().startsWith('ultimate_');
}

// A short 3-letter badge for each enchant slot on EnchantList.jsx, so a
// specific enchant is recognizable without hovering — first 3 letters of
// its displayed name (matching titleCaseEnchantId, so it stays in sync
// with any of that function's overrides), lowercased. One explicit
// exception: "One For All" would otherwise read "one", indistinguishable
// at a glance from any other enchant starting with "On"/"one" — shortened
// to "ofa" per instruction instead.
export function getEnchantCaption(id) {
  const key = id.toLowerCase();
  if (key === 'ultimate_one_for_all') return 'ofa';
  return titleCaseEnchantId(id).replace(/[^A-Za-z]/g, '').slice(0, 3).toLowerCase();
}

// Some enchants' own "Conflicts:" lore sections still reference the legacy
// name of an enchant we display under a corrected name (e.g. Life Steal and
// Mana Steal's lore lists "Syphon", not "Drain" — see DISPLAY_NAME_OVERRIDES),
// or spell it with punctuation titleCaseEnchantId's plain space-join never
// produces (Triple Strike's own "Conflicts:" list says "Triple-Strike", with
// a hyphen — this silently broke First Strike -> Triple Strike removal one
// direction only, since Triple Strike's own lore names "First Strike" with
// no punctuation mismatch and matched fine). Normalize those raw names to
// the same canonical name titleCaseEnchantId produces, so comparisons
// against currently-applied enchants match.
const CONFLICT_NAME_ALIASES = { Syphon: 'Drain', 'Triple-Strike': 'Triple Strike' };

// Parses the "§6Conflicts:\n§7- §cName\n§7- §cName\n\n" block real NEU-REPO
// enchant lore carries, into a plain list of canonical display names.
function parseConflictNames(lore) {
  const idx = lore.findIndex((line) => line.includes('Conflicts:'));
  if (idx === -1) return [];
  const names = [];
  for (let i = idx + 1; i < lore.length; i++) {
    const line = lore[i];
    if (line === '') break;
    const plain = line.replace(/§./g, '').replace(/^-\s*/, '').trim();
    if (plain) names.push(CONFLICT_NAME_ALIASES[plain] || plain);
  }
  return names;
}

// Given the enchant being hovered/selected (its id + one level's real lore,
// conflicts are the same at every level) and the enchants currently applied
// to the build, returns the applied {id, level, maxLevel} entries that would
// be removed if this one were applied. Used both to render the "X will be
// removed" warning and (by BuildContext.applyEnchant) to actually remove them
// on selection, so the warning is never a broken promise.
//
// Handled cases:
//  - Enchants with an explicit lore "Conflicts:" list (Life Steal/Drain/Mana
//    Steal, Execute/Prosecute, Giant Killer/Titan Killer, Thunderlord/
//    Thunderbolt, First Strike/Triple-Strike).
//  - Any two ultimate enchants: the build only has one ultimate slot, so
//    picking a different one always replaces the current one.
//  - "One For All", whose own lore says it removes every other enchant
//    (normal and ultimate) — it has no lore "Conflicts:" list since the rule
//    isn't a pairwise conflict, so it's special-cased both directions: hovering
//    it warns about everything currently applied, and hovering anything else
//    while it's applied warns that it will be removed.
export function computeConflictingEntries(id, lore, modifiers) {
  if (!modifiers) return [];
  const key = id.toLowerCase();
  const appliedNormals = modifiers.hexEnchantments || [];
  const appliedUltimate = modifiers.ultimateEnchantment;
  const seen = new Set();
  const result = [];
  function add(entry) {
    if (!entry || seen.has(entry.id)) return;
    seen.add(entry.id);
    result.push(entry);
  }

  if (key === 'ultimate_one_for_all') {
    appliedNormals.forEach(add);
    if (appliedUltimate && appliedUltimate.id.toLowerCase() !== key) add(appliedUltimate);
    return result;
  }

  const conflictNames = parseConflictNames(lore);
  if (conflictNames.length > 0) {
    appliedNormals.forEach((e) => {
      if (conflictNames.includes(titleCaseEnchantId(e.id))) add(e);
    });
  }

  if (isUltimateEnchant(id) && appliedUltimate && appliedUltimate.id.toLowerCase() !== key) {
    add(appliedUltimate);
  }

  if (appliedUltimate && appliedUltimate.id.toLowerCase() === 'ultimate_one_for_all') {
    add(appliedUltimate);
  }

  return result;
}

export function computeConflictWarnings(id, lore, modifiers) {
  return computeConflictingEntries(id, lore, modifiers).map((e) => titleCaseEnchantId(e.id));
}

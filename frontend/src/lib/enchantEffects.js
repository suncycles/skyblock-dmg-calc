/* Real per-level enchant effect text, sourced directly from NEU-REPO's enchanted-book item
   files (items/{ID};{level}.json). Primary source is the Worker's own daily-refreshed cache
   (enchantsMeta.levelData — see worker/src/index.js's buildEnchantLevelData/resolveEnchantLevelData,
   merged into the same `enchants` object /api/items already returns), so a real page load never
   blocks on live raw.githubusercontent.com requests at all (user-specified 2026-09-01). Falls back
   to fetching directly from raw.githubusercontent.com only when the server cache is missing an id
   (a brand-new enchant added since the last daily refresh, or the Worker's own refresh degraded to
   stale/empty) — same probing this always did before it moved server-side. */

const NEU_ITEMS_BASE = 'https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/items';
// Safety ceiling only, never the primary probe target — see probeLevels below. NEU-REPO's own
// enchants.json ships a max_xp_table_levels map, but it's the enchant TABLE's cap (obtainable via
// Bookshelves alone), not the real achievable max: verified live 2026-09-01 that
// max_xp_table_levels.power = 5 while POWER;7.json (and SHARPNESS;7.json) both return 200 OK —
// Skyblock's anvil-combining mechanic pushes some enchants past their table cap. Trusting the field
// as a hard ceiling would silently truncate real, in-game-obtainable levels (e.g. a real Power VII
// weapon showing as Power V) — used below only as a head start, always extended further if the top
// of that range actually succeeds.
const MAX_PROBE_LEVEL = 10;

const levelsCache = new Map(); // enchantId -> Promise<Array<{level, lore}>>
const PERSIST_PREFIX = 'enchantLevels:';

// NEU-REPO's per-level lore is static, so a resolved probe is safe to keep across page loads —
// without this, every hard reload re-probes up to 10 raw.githubusercontent.com requests per
// distinct enchant on the weapon, right on the Optimizer's critical path (Enchant/Ultimate
// Enchant candidates await this). Only successful (non-empty) probes are persisted — an empty
// result more often means a transient network failure than a real "no levels exist" case, and
// caching that permanently would silently break the enchant forever instead of just once.
function loadPersistedLevels(id) {
  try {
    const raw = localStorage.getItem(PERSIST_PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePersistedLevels(id, levels) {
  if (levels.length === 0) return;
  try {
    localStorage.setItem(PERSIST_PREFIX + id, JSON.stringify(levels));
  } catch {
    // localStorage full or unavailable (private browsing) — in-memory cache still covers this session
  }
}

// Mirrors worker/src/index.js's fetchEnchantLevel — a 404 is the only response that really means
// "this level doesn't exist"; a rate-limit, 5xx or dropped connection used to read the same way
// and silently truncate the enchant. Retries transient failures, then reports UNKNOWN so the
// caller refuses to cache (and, here, refuses to PERSIST) a guess.
const LEVEL_UNKNOWN = Symbol('enchant-level-unknown');
const LEVEL_FETCH_RETRIES = 3;

async function fetchLevel(fileId, level) {
  const url = `${NEU_ITEMS_BASE}/${encodeURIComponent(`${fileId};${level}`)}.json`;
  for (let attempt = 0; attempt < LEVEL_FETCH_RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (res.ok) {
        const data = await res.json();
        return { level, lore: data.lore || [] };
      }
    } catch {
      // Network failure — transient, retried below exactly like a 429/5xx.
    }
    if (attempt < LEVEL_FETCH_RETRIES - 1) await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
  }
  return LEVEL_UNKNOWN;
}

// Case varies in NEU's own data (every key lowercase except "PROSECUTE") — check as given, then
// both cases, rather than assuming one.
function lookupMaxTableLevel(enchantsMeta, fileId) {
  const table = enchantsMeta?.max_xp_table_levels;
  if (!table) return 0;
  return table[fileId] ?? table[fileId.toLowerCase()] ?? table[fileId.toUpperCase()] ?? 0;
}

// Starts the probe at the enchant table's own known max instead of always guessing 10 — most
// enchants cap exactly there, eliminating every guaranteed-404 request beyond it on a cold cache
// (recommendation #5, user-specified 2026-09-01). That max understates a handful of real enchants
// (Power/Sharpness reach VII in Skyblock — see MAX_PROBE_LEVEL's comment), so this never treats it
// as a hard ceiling: it keeps probing one level past the last real success, so a level beyond the
// table max still gets found, just at the cost of one request per extra level instead of a blind
// batch of 10 up front.
async function probeLevels(fileId, enchantsMeta) {
  let level = Math.max(lookupMaxTableLevel(enchantsMeta, fileId), 1);
  const results = await Promise.all(Array.from({ length: level }, (_, i) => fetchLevel(fileId, i + 1)));
  const top = () => results[results.length - 1];
  while (top() && top() !== LEVEL_UNKNOWN && level < MAX_PROBE_LEVEL) {
    level += 1;
    results.push(await fetchLevel(fileId, level));
  }
  // null = "couldn't resolve right now", distinct from [] = "no such enchant" — see the caller,
  // which must not persist a truncated list to localStorage where it would outlive the outage.
  if (results.includes(LEVEL_UNKNOWN)) return null;
  const found = results.filter(Boolean);
  if (found.length > 0) return found;
  // The head-start above assumes real levels start at 1 and go up — true for every normal
  // combinable enchant, but not for a rare one dropped pre-leveled directly from a boss with no
  // lower levels at all: "The One" (ultimate_the_one) only has real data at ULTIMATE_THE_ONE;4 and
  // ;5 — levels 1-3 flat-out don't exist (verified live 2026-09-01), so starting the probe at 1
  // finds nothing and gives up before ever trying 4. Falls back to a full blind sweep of every
  // level up to the ceiling only when the head start found nothing at all, so this never costs
  // extra requests for the common (starts-at-1) case.
  const fullSweep = await Promise.all(Array.from({ length: MAX_PROBE_LEVEL }, (_, i) => fetchLevel(fileId, i + 1)));
  if (fullSweep.includes(LEVEL_UNKNOWN)) return null;
  return fullSweep.filter(Boolean);
}

// Resolves a category-list enchant id to its real NEU item file id when they differ (e.g. "dragon_tracer" -> "AIMING").
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

// Venomous: user-confirmed real numbers (walk speed reduction %, damage %/s per hit) — NEU-REPO's
// community data is stale as of this writing (pre-rebalance 1-6 numbers, no level 7 entry at all),
// so this bypasses the live fetch below entirely rather than surfacing wrong/missing data.
const VENOMOUS_LEVELS = [
  { walkSpeed: 2, damage: 0.2 },
  { walkSpeed: 4, damage: 0.4 },
  { walkSpeed: 6, damage: 0.6 },
  { walkSpeed: 8, damage: 0.8 },
  { walkSpeed: 12, damage: 1.2 },
  { walkSpeed: 15, damage: 1.6 },
  { walkSpeed: 20, damage: 2 },
];

// The real "deals +X% of your damage per second per hit" number for a Venomous level — used by
// damageSources.js's proc-damage calculation, same source of truth as the tooltip lore above.
export function getVenomousDamagePercent(level) {
  return VENOMOUS_LEVELS[level - 1]?.damage ?? null;
}

function buildVenomousLevels() {
  return VENOMOUS_LEVELS.map(({ walkSpeed, damage }, i) => {
    const level = i + 1;
    return {
      level,
      lore: [
        `§9Venomous ${toRoman(level)}`,
        `§7Reduces the target's walk speed`,
        `§7by §a${walkSpeed}% §7and deals §2+${damage}% §7of`,
        `§7your damage per second per hit,`,
        `§7stacking globally up to §240`,
        `§7hits. Lasts §65s§7.`,
      ],
    };
  });
}

// Fetches every existing level for an enchant with its real lore. Cached per enchant id. Checks
// the Worker's server-side cache first (instant, no network) before falling back to live probing.
export function fetchEnchantLevels(id, enchantsMeta) {
  if (id.toLowerCase() === 'venomous') return Promise.resolve(buildVenomousLevels());

  const serverLevels = enchantsMeta?.levelData?.[id.toLowerCase()];
  if (serverLevels) return Promise.resolve(serverLevels);

  if (levelsCache.has(id)) return levelsCache.get(id);

  const persisted = loadPersistedLevels(id);
  if (persisted) {
    const promise = Promise.resolve(persisted);
    levelsCache.set(id, promise);
    return promise;
  }

  const promise = (async () => {
    let levels = await probeLevels(id.toUpperCase(), enchantsMeta);
    if (levels && levels.length === 0) {
      const altFileId = resolveAlternateFileId(enchantsMeta, id);
      if (altFileId) levels = await probeLevels(altFileId, enchantsMeta);
    }
    // Unresolved (null) is never persisted and never memoized — the next call retries instead of
    // freezing an outage into a permanently short enchant list.
    if (!levels) {
      levelsCache.delete(id);
      return [];
    }
    savePersistedLevels(id, levels);
    return levels;
  })();

  levelsCache.set(id, promise);
  return promise;
}

// Finds the level-name line (ends in a roman numeral) rather than assuming it's always line 0.
function findNameLineIndex(lore) {
  for (let i = 0; i < lore.length; i++) {
    const plain = lore[i].replace(/§./g, '').trim();
    if (ROMAN.slice(1).some((r) => plain.endsWith(` ${r}`))) return i;
  }
  return 0;
}

// The description block runs from just after the name line until the next blank line.
export function extractDescriptionLines(lore) {
  const nameIdx = findNameLineIndex(lore);
  const lines = [];
  for (let i = nameIdx + 1; i < lore.length; i++) {
    if (lore[i] === '') break;
    lines.push(lore[i]);
  }
  return lines;
}

// Merges two same-shaped lore lines, replacing differing numeric runs with "min...max".
// Lookbehind excludes a digit-valued §-color-code (e.g. the "9" in "§910%") from being read
// as part of the adjacent real number.
function numericDiffMerge(lineMin, lineMax) {
  const re = /(?<!§)\d+(?:[.,]\d+)?/g;
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

// Builds the enchant-list hover tooltip's effect lines: the level-1 description with level-scaling numbers expanded to a min...max range.
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

// Maps weapon/armor categories to NEU-REPO's own enchant-category keys where they differ (mostly Dungeon-prefixed variants).
const ENCHANT_CATEGORY_ALIASES = {
  'DUNGEON SWORD': 'SWORD',
  'THE WYLD SWORD': 'SWORD',
  WAND: 'SWORD', // Wands/Staffs take Sword enchants in the real game
  'DUNGEON BOW': 'BOW',
  'DUNGEON LONGSWORD': 'LONGSWORD',
  'DUNGEON HELMET': 'HELMET',
  'DUNGEON CHESTPLATE': 'CHESTPLATE',
  'DUNGEON LEGGINGS': 'LEGGINGS',
  'DUNGEON BOOTS': 'BOOTS',
  'DUNGEON NECKLACE': 'NECKLACE',
  'DUNGEON CLOAK': 'CLOAK',
  'DUNGEON BELT': 'BELT',
  'DUNGEON GLOVES': 'GLOVES',
};

export function resolveEnchantCategory(category) {
  return ENCHANT_CATEGORY_ALIASES[category] || category;
}

// Enchants NEU-REPO's per-category lists are missing entirely (not just filed under an alternate id).
const MISSING_CATEGORY_ENCHANTS = {
  HELMET: ['ultimate_habanero_tactics'],
  CHESTPLATE: ['ultimate_habanero_tactics'],
  LEGGINGS: ['ultimate_habanero_tactics'],
  BOOTS: ['ultimate_habanero_tactics'],
};

// The inverse of MISSING_CATEGORY_ENCHANTS above — enchants NEU-REPO's per-category lists WRONGLY
// include. User-confirmed: neither Chimera (2026-08-29) nor Swarm (2026-08-30) can actually be
// applied to a Bow in-game, despite NEU-REPO's own BOW category list including both
// 'ultimate_chimera' and 'ultimate_swarm'.
const EXCLUDED_CATEGORY_ENCHANTS = {
  BOW: ['ultimate_chimera', 'ultimate_swarm'],
};

// Same {enchants: {CATEGORY: [ids]}} shape as itemData.enchants, patched with
// MISSING_CATEGORY_ENCHANTS/EXCLUDED_CATEGORY_ENCHANTS.
export function getCategoryEnchantIds(enchantsMeta, category) {
  const base = (enchantsMeta && enchantsMeta.enchants && enchantsMeta.enchants[category]) || [];
  const missing = (MISSING_CATEGORY_ENCHANTS[category] || []).filter((id) => !base.includes(id));
  const combined = missing.length > 0 ? [...base, ...missing] : base;
  const excluded = EXCLUDED_CATEGORY_ENCHANTS[category];
  return excluded ? combined.filter((id) => !excluded.includes(id)) : combined;
}

// Enchant ids whose real display name titleCaseEnchantId's default rule gets wrong.
const DISPLAY_NAME_OVERRIDES = {
  ultimate_wise: 'Ultimate Wise',
  ultimate_reiterate: 'Duplex',
  syphon: 'Drain',
  aiming: 'Dragon Tracer',
  dragon_hunter: 'Gravity',
  magmarizer: 'Pyroclasm',
};

// "ultimate_duplex" is a dead category-list entry with no real item data behind it — hidden rather than shown as a broken slot.
const HIDDEN_ENCHANT_IDS = new Set(['ultimate_duplex']);

export function isHiddenEnchant(id) {
  return HIDDEN_ENCHANT_IDS.has(id.toLowerCase());
}

// Strips the "ultimate_" prefix before title-casing, except for the overrides above.
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

// Short 3-letter badge for an enchant slot on EnchantList.jsx — first 3 letters of its display name, lowercased.
export function getEnchantCaption(id) {
  const key = id.toLowerCase();
  if (key === 'ultimate_one_for_all') return 'ofa';
  return titleCaseEnchantId(id).replace(/[^A-Za-z]/g, '').slice(0, 3).toLowerCase();
}

// Normalizes an enchant's own "Conflicts:" lore names to the canonical display name titleCaseEnchantId produces.
const CONFLICT_NAME_ALIASES = { Syphon: 'Drain', 'Triple-Strike': 'Triple Strike' };

// Parses the "Conflicts:" lore block into a plain list of canonical display names.
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

// Returns the applied {id, level, maxLevel} entries that would be removed if `id` were applied
// — used both for the "X will be removed" warning and to actually remove them on selection.
// Handles lore "Conflicts:" lists, ultimate-enchant slot replacement, and One For All's
// "removes every other enchant" rule (both directions).
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

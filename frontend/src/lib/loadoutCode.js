import { derivePetDisplayName } from './petData';
import { getPowerById } from './accessoryPowers';
import { emptyModifiers, emptyPetModifiers, emptyAccessoryModifiers } from './defaultModifiers';
import { WORKER_BASE_URL } from './apiConfig';
import { INFERNAL_CRIMSON_MAX_STACKS } from './armorSetBonuses';

/* Encodes the entire build into one compact, URL-safe string and decodes it back — powers
   the "Loadouts" Export/Import buttons and the /loadout/:code share-link route. Only
   `item.id`/`petId`+`tier`/power `id` is stored per slot (never the item's heavy `lore`
   array, reconstructed from itemData on decode); everything else passes through as plain
   JSON. Modifiers are diffed against their type's defaults before encoding (most items only
   touch a handful of the ~15 fields) and re-filled with defaults on decode — most real builds
   shrink substantially since a lot of slots and stats sit at their default value. Deflated via
   the browser's native CompressionStream, then base64url-encoded.

   shortenLoadoutCode() additionally uploads that encoded blob to the Worker's KV store (see
   worker/src/index.js) under a short random id — decodeLoadoutCode() tries the embedded-blob
   decode first and only falls back to resolving `code` as a KV id if that fails, so both a raw
   embedded blob and a short id can hit the same /loadout/:code route with no separate URL shape
   needed to tell them apart. Only the Export/share-link flow shortens; saved-locally Loadouts
   keep the plain embedded blob so loading your own saved builds never needs a network round trip. */

const FORMAT_VERSION = 2;
// v1 links (gzip-wrapped, enchant/gemstone entries as keyed objects) are still decodable —
// expandState() branches on compact.v. Only v2 (deflate-raw, tuple-packed) is ever encoded now.
const SUPPORTED_VERSIONS = new Set([1, 2]);

const GEAR_SLOTS = ['weapon', 'helmet', 'chestplate', 'leggings', 'boots', 'necklace', 'cloak', 'belt', 'gloves'];

export function findGearItem(itemData, id) {
  if (!id) return null;
  return (
    (itemData.weapons || []).find((i) => i.id === id) ||
    (itemData.armor || []).find((i) => i.id === id) ||
    (itemData.equipment || []).find((i) => i.id === id) ||
    null
  );
}

// Keeps only the keys that differ from `defaults` (deep-compared via JSON), so an item that
// only, say, has 5 Stars applied doesn't also carry every other untouched field's default value.
function diffFromDefaults(obj, defaults) {
  const diff = {};
  for (const key of Object.keys(defaults)) {
    if (JSON.stringify(obj?.[key]) !== JSON.stringify(defaults[key])) diff[key] = obj[key];
  }
  return diff;
}

function withDefaults(diff, defaults) {
  return { ...defaults, ...(diff || {}) };
}

// v2 packs {id, level, maxLevel} enchant entries and {gem, tier} gemstone entries as plain
// positional tuples instead of keyed objects — same values, just without the repeated field-name
// text (JSON key names are otherwise the single biggest compressible-but-still-there cost for a
// fully-decked item with a dozen-plus enchants and 3-4 gemstones).
function packEnchant(e) {
  return [e.id, e.level, e.maxLevel];
}
function unpackEnchant(t) {
  return { id: t[0], level: t[1], maxLevel: t[2] };
}
function packGemstone(g) {
  return g ? [g.gem, g.tier] : null;
}
function unpackGemstone(t) {
  return t ? { gem: t[0], tier: t[1] } : null;
}

// Only called for v2 compacts — v1's enchant/gemstone entries are already the keyed-object shape
// withDefaults() expects, so running them through this would silently scramble them instead of
// throwing (array-index access on a plain object just reads undefined).
function unpackModifiersDiff(diff) {
  if (!diff) return diff;
  const out = { ...diff };
  if (out.hexEnchantments) out.hexEnchantments = out.hexEnchantments.map(unpackEnchant);
  if (out.ultimateEnchantment) out.ultimateEnchantment = unpackEnchant(out.ultimateEnchantment);
  if (out.gemstones) out.gemstones = out.gemstones.map(unpackGemstone);
  return out;
}

// Drops zero-valued numeric entries — safe wherever the decode side already zero-fills missing
// keys itself (BuildContext's loadFullState merges attributes/playerStats/miscStats over their
// own defaults), so no matching "fill" step is needed here.
function trimZeros(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj || {})) {
    if (value) result[key] = value;
  }
  return result;
}

function buildEncodableState({
  loadout,
  targetMobs,
  attributes,
  playerStats,
  godPotionActive,
  useDungeonizedStats,
  useMasterMode,
  mageMode,
  miscStats,
  mobHpPercent,
  infernalCrimsonStacks,
  swarmMobs,
  comboKills,
  legionPlayers,
  blazeCrimsonIsle,
}) {
  const encodedLoadout = {};

  for (const slot of GEAR_SLOTS) {
    const entry = loadout[slot];
    if (!entry) continue;
    const modifiersDiff = diffFromDefaults(entry.modifiers, emptyModifiers());
    if (modifiersDiff.hexEnchantments) modifiersDiff.hexEnchantments = modifiersDiff.hexEnchantments.map(packEnchant);
    if (modifiersDiff.ultimateEnchantment) modifiersDiff.ultimateEnchantment = packEnchant(modifiersDiff.ultimateEnchantment);
    if (modifiersDiff.gemstones) modifiersDiff.gemstones = modifiersDiff.gemstones.map(packGemstone);
    encodedLoadout[slot] = { id: entry.item.id, modifiers: modifiersDiff };
  }

  if (loadout.pet) {
    encodedLoadout.pet = {
      petId: loadout.pet.item.petId,
      tier: loadout.pet.item.tier,
      modifiers: diffFromDefaults(loadout.pet.modifiers, emptyPetModifiers()),
    };
  }

  if (loadout.accessory?.item) {
    encodedLoadout.accessory = {
      id: loadout.accessory.item.id,
      modifiers: diffFromDefaults(loadout.accessory.modifiers, emptyAccessoryModifiers()),
    };
  }

  return {
    v: FORMAT_VERSION,
    loadout: encodedLoadout,
    targetMobs: targetMobs || [],
    attributes: trimZeros(attributes),
    playerStats: trimZeros(playerStats),
    godPotionActive: !!godPotionActive,
    useDungeonizedStats: !!useDungeonizedStats,
    useMasterMode: !!useMasterMode,
    mageMode: !!mageMode,
    miscStats: trimZeros(miscStats),
    mobHpPercent: mobHpPercent ?? 100,
    infernalCrimsonStacks: infernalCrimsonStacks ?? INFERNAL_CRIMSON_MAX_STACKS,
    swarmMobs: swarmMobs ?? 1,
    comboKills: comboKills ?? 1,
    legionPlayers: legionPlayers ?? 0,
    blazeCrimsonIsle: !!blazeCrimsonIsle,
  };
}

// Expands the decoded compact object back into BuildContext's own state shape,
// reconstructing each item's full record from itemData. A gear/pet/accessory id that no
// longer resolves (removed/renamed since the link was shared) is silently skipped rather
// than blocking the rest of the build from loading.
function expandState(compact, itemData) {
  const loadout = {};

  for (const slot of GEAR_SLOTS) {
    const encoded = compact.loadout?.[slot];
    if (!encoded) continue;
    const item = findGearItem(itemData, encoded.id);
    if (!item) continue;
    const rawModifiers = compact.v >= 2 ? unpackModifiersDiff(encoded.modifiers) : encoded.modifiers;
    loadout[slot] = {
      item: {
        id: item.id,
        name: item.name,
        material: item.material,
        category: item.category,
        tier: item.tier,
        lore: item.lore || [],
        color: item.color,
      },
      modifiers: withDefaults(rawModifiers, emptyModifiers()),
    };
  }

  const encodedPet = compact.loadout?.pet;
  if (encodedPet) {
    loadout.pet = {
      item: {
        id: `${encodedPet.petId}_${encodedPet.tier}`,
        petId: encodedPet.petId,
        name: derivePetDisplayName(encodedPet.petId),
        tier: encodedPet.tier,
        material: 'BONE',
      },
      modifiers: withDefaults(encodedPet.modifiers, emptyPetModifiers()),
    };
  }

  const encodedAccessory = compact.loadout?.accessory;
  if (encodedAccessory) {
    const power = getPowerById(encodedAccessory.id);
    if (power) {
      loadout.accessory = {
        item: { id: power.id, name: power.name, iconId: power.sourceItemId || null, material: power.sourceItemId ? 'SKULL' : 'BOOK' },
        modifiers: withDefaults(encodedAccessory.modifiers, emptyAccessoryModifiers()),
      };
    }
  }

  return {
    loadout,
    targetMobs: compact.targetMobs || [],
    attributes: compact.attributes || {},
    playerStats: compact.playerStats || {},
    godPotionActive: !!compact.godPotionActive,
    useDungeonizedStats: !!compact.useDungeonizedStats,
    useMasterMode: !!compact.useMasterMode,
    mageMode: !!compact.mageMode,
    miscStats: compact.miscStats || {},
    mobHpPercent: compact.mobHpPercent ?? 100,
    infernalCrimsonStacks: compact.infernalCrimsonStacks ?? INFERNAL_CRIMSON_MAX_STACKS,
    swarmMobs: compact.swarmMobs ?? 1,
    comboKills: compact.comboKills ?? 1,
    legionPlayers: compact.legionPlayers ?? 0,
    blazeCrimsonIsle: !!compact.blazeCrimsonIsle,
  };
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function readAllChunks(readable) {
  const chunks = [];
  let total = 0;
  const reader = readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function compress(bytes) {
  const stream = new CompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return readAllChunks(stream.readable);
}

async function decompressDeflateRaw(bytes) {
  const stream = new DecompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return readAllChunks(stream.readable);
}

async function decompressGzip(bytes) {
  const stream = new DecompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return readAllChunks(stream.readable);
}

// Old (v1) links were gzip-wrapped; gzip's fixed 2-byte magic number (0x1f 0x8b) identifies them
// unambiguously — raw deflate (v2+) has no header at all, so a byte-signature check is enough to
// route each format to the right decompressor without needing a separate URL shape for old vs new.
async function decompress(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) return decompressGzip(bytes);
  return decompressDeflateRaw(bytes);
}

export async function encodeLoadout(state) {
  const compact = buildEncodableState(state);
  const json = JSON.stringify(compact);
  const compressed = await compress(new TextEncoder().encode(json));
  return bytesToBase64Url(compressed);
}

async function decodeEmbeddedBlob(code, itemData) {
  const compressed = base64UrlToBytes(code);
  const bytes = await decompress(compressed);
  const compact = JSON.parse(new TextDecoder().decode(bytes));
  if (!SUPPORTED_VERSIONS.has(compact.v)) throw new Error('Unsupported loadout link format.');
  return expandState(compact, itemData);
}

// Returns the expanded state, or throws if `code` doesn't decode to valid JSON, is an
// unsupported format version, or isn't the right shape — callers should catch and show a friendly
// error. `code` is either a self-contained embedded blob (the original scheme, and still what
// saved-locally Loadouts use) or a short id minted by shortenLoadoutCode() — tried in that order,
// since a short id is the wrong shape entirely to parse as an embedded blob and will always fail
// fast, so no separate URL pattern is needed to tell the two apart.
export async function decodeLoadoutCode(code, itemData) {
  try {
    return await decodeEmbeddedBlob(code, itemData);
  } catch (localErr) {
    let res;
    try {
      res = await fetch(`${WORKER_BASE_URL}/api/loadout/${encodeURIComponent(code)}`);
    } catch {
      throw localErr;
    }
    if (!res.ok) throw localErr;
    const { code: resolvedCode } = await res.json();
    return decodeEmbeddedBlob(resolvedCode, itemData);
  }
}

// Uploads the embedded blob to the Worker's KV store for a short share id. Falls back to
// returning the embedded blob itself if the Worker call fails for any reason, so Export still
// works (just with a long link) rather than breaking entirely.
export async function shortenLoadoutCode(code) {
  try {
    const res = await fetch(`${WORKER_BASE_URL}/api/loadout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) return code;
    const { id } = await res.json();
    return id || code;
  } catch {
    return code;
  }
}

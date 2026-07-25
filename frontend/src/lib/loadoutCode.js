import { derivePetDisplayName } from './petData';
import { getPowerById } from './accessoryPowers';

/* Encodes the entire build into one compact, URL-safe string and decodes it back — powers
   the "Loadouts" Export/Import buttons and the /loadout/:code share-link route. Only
   `item.id`/`petId`+`tier`/power `id` is stored per slot (never the item's heavy `lore`
   array, reconstructed from itemData on decode); everything else passes through as plain
   JSON. Gzipped via the browser's native CompressionStream, then base64url-encoded. */

const FORMAT_VERSION = 1;

const GEAR_SLOTS = ['weapon', 'helmet', 'chestplate', 'leggings', 'boots', 'necklace', 'cloak', 'belt', 'gloves'];

function findGearItem(itemData, id) {
  if (!id) return null;
  return (
    (itemData.weapons || []).find((i) => i.id === id) ||
    (itemData.armor || []).find((i) => i.id === id) ||
    (itemData.equipment || []).find((i) => i.id === id) ||
    null
  );
}

function buildEncodableState({ loadout, targetMobs, attributes, playerStats, godPotionActive, miscStats, mobHpPercent }) {
  const encodedLoadout = {};

  for (const slot of GEAR_SLOTS) {
    const entry = loadout[slot];
    if (!entry) continue;
    encodedLoadout[slot] = { id: entry.item.id, modifiers: entry.modifiers };
  }

  if (loadout.pet) {
    encodedLoadout.pet = { petId: loadout.pet.item.petId, tier: loadout.pet.item.tier, modifiers: loadout.pet.modifiers };
  }

  if (loadout.accessory) {
    encodedLoadout.accessory = { id: loadout.accessory.item.id, modifiers: loadout.accessory.modifiers };
  }

  return {
    v: FORMAT_VERSION,
    loadout: encodedLoadout,
    targetMobs: targetMobs || [],
    attributes: attributes || {},
    playerStats: playerStats || {},
    godPotionActive: !!godPotionActive,
    miscStats: miscStats || {},
    mobHpPercent: mobHpPercent ?? 100,
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
    loadout[slot] = {
      item: { id: item.id, name: item.name, material: item.material, category: item.category, tier: item.tier, lore: item.lore || [] },
      modifiers: encoded.modifiers,
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
      modifiers: encodedPet.modifiers,
    };
  }

  const encodedAccessory = compact.loadout?.accessory;
  if (encodedAccessory) {
    const power = getPowerById(encodedAccessory.id);
    if (power) {
      loadout.accessory = {
        item: { id: power.id, name: power.name, iconId: power.sourceItemId || null, material: power.sourceItemId ? 'SKULL' : 'BOOK' },
        modifiers: encodedAccessory.modifiers,
      };
    }
  }

  return {
    loadout,
    targetMobs: compact.targetMobs || [],
    attributes: compact.attributes || {},
    playerStats: compact.playerStats || {},
    godPotionActive: !!compact.godPotionActive,
    miscStats: compact.miscStats || {},
    mobHpPercent: compact.mobHpPercent ?? 100,
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

async function gzip(bytes) {
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return readAllChunks(stream.readable);
}

async function gunzip(bytes) {
  const stream = new DecompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return readAllChunks(stream.readable);
}

export async function encodeLoadout(state) {
  const compact = buildEncodableState(state);
  const json = JSON.stringify(compact);
  const compressed = await gzip(new TextEncoder().encode(json));
  return bytesToBase64Url(compressed);
}

// Returns the expanded state, or throws if `code` doesn't decode to valid JSON, is an
// unsupported format version, or isn't the right shape — callers should catch and show a friendly error.
export async function decodeLoadoutCode(code, itemData) {
  const compressed = base64UrlToBytes(code);
  const bytes = await gunzip(compressed);
  const compact = JSON.parse(new TextDecoder().decode(bytes));
  if (compact.v !== FORMAT_VERSION) throw new Error('Unsupported loadout link format.');
  return expandState(compact, itemData);
}

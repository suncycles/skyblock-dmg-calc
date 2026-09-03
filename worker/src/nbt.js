// Minimal big-endian NBT reader for Hypixel's gzip+base64 item data (the same format Minecraft
// uses for ItemStack NBT). Only decodes what SkyDmg needs from ExtraAttributes — ports the same
// tag-type switch Mojang's format has used since forever. Not a general-purpose NBT library.

const TAG_END = 0;
const TAG_BYTE = 1;
const TAG_SHORT = 2;
const TAG_INT = 3;
const TAG_LONG = 4;
const TAG_FLOAT = 5;
const TAG_DOUBLE = 6;
const TAG_BYTE_ARRAY = 7;
const TAG_STRING = 8;
const TAG_LIST = 9;
const TAG_COMPOUND = 10;
const TAG_INT_ARRAY = 11;
const TAG_LONG_ARRAY = 12;

class Reader {
  constructor(buf) {
    this.view = new DataView(buf);
    this.pos = 0;
  }
  byte() {
    const v = this.view.getInt8(this.pos);
    this.pos += 1;
    return v;
  }
  ubyte() {
    const v = this.view.getUint8(this.pos);
    this.pos += 1;
    return v;
  }
  short() {
    const v = this.view.getInt16(this.pos, false);
    this.pos += 2;
    return v;
  }
  int() {
    const v = this.view.getInt32(this.pos, false);
    this.pos += 4;
    return v;
  }
  // Long as a JS number — item NBT longs (timestamps, UUID halves) never need bit-exact 64-bit precision here.
  long() {
    const hi = this.view.getInt32(this.pos, false);
    const lo = this.view.getUint32(this.pos + 4, false);
    this.pos += 8;
    return hi * 4294967296 + lo;
  }
  float() {
    const v = this.view.getFloat32(this.pos, false);
    this.pos += 4;
    return v;
  }
  double() {
    const v = this.view.getFloat64(this.pos, false);
    this.pos += 8;
    return v;
  }
  string() {
    const len = this.view.getUint16(this.pos, false);
    this.pos += 2;
    const bytes = new Uint8Array(this.view.buffer, this.pos, len);
    this.pos += len;
    return new TextDecoder('utf-8').decode(bytes);
  }
  payload(tagType) {
    switch (tagType) {
      case TAG_END:
        return null;
      case TAG_BYTE:
        return this.byte();
      case TAG_SHORT:
        return this.short();
      case TAG_INT:
        return this.int();
      case TAG_LONG:
        return this.long();
      case TAG_FLOAT:
        return this.float();
      case TAG_DOUBLE:
        return this.double();
      case TAG_BYTE_ARRAY: {
        const len = this.int();
        const arr = [];
        for (let i = 0; i < len; i++) arr.push(this.byte());
        return arr;
      }
      case TAG_STRING:
        return this.string();
      case TAG_LIST: {
        const itemType = this.ubyte();
        const len = this.int();
        const arr = [];
        for (let i = 0; i < len; i++) arr.push(this.payload(itemType));
        return arr;
      }
      case TAG_COMPOUND: {
        const obj = {};
        for (;;) {
          const t = this.ubyte();
          if (t === TAG_END) break;
          const name = this.string();
          obj[name] = this.payload(t);
        }
        return obj;
      }
      case TAG_INT_ARRAY: {
        const len = this.int();
        const arr = [];
        for (let i = 0; i < len; i++) arr.push(this.int());
        return arr;
      }
      case TAG_LONG_ARRAY: {
        const len = this.int();
        const arr = [];
        for (let i = 0; i < len; i++) arr.push(this.long());
        return arr;
      }
      default:
        throw new Error(`Unknown NBT tag type ${tagType} at byte ${this.pos}`);
    }
  }
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return buf;
}

// Decodes one Hypixel inventory blob (base64 gzip NBT) into its root compound's "i" list —
// one entry per inventory slot, `null`/`{}` for empty slots (id === undefined).
export async function decodeInventoryB64(b64) {
  const gz = base64ToBytes(b64);
  const buf = await gunzip(gz);
  const reader = new Reader(buf);
  const rootType = reader.ubyte();
  reader.string(); // root compound name, unused
  const root = reader.payload(rootType);
  return root.i || [];
}

// Pulls out just the fields SkyDmg's import needs from one decoded inventory-slot item.
// Returns null for an empty/unrecognized slot.
export function extractItemSummary(slotItem) {
  if (!slotItem || !slotItem.tag) return null;
  const ea = slotItem.tag.ExtraAttributes;
  if (!ea || !ea.id) return null;
  return {
    id: ea.id,
    modifier: ea.modifier || null,
    recombobulated: !!ea.rarity_upgrades,
    stars: ea.upgrade_level || ea.dungeon_item_level || 0,
    // Hypixel's real, authoritative "this specific copy is dungeonized" flag — independent of
    // star count (a dungeonized item can sit at 0-5 base stars same as a normal one) and of the
    // catalog's own category (only armor pieces that are ALWAYS dungeon drops get a "DUNGEON "
    // category prefix baked in; weapons like Terminator/Flaming Flay never do). Confirmed live:
    // `ExtraAttributes.dungeon_item === 1` on a dungeonized Terminator/Flaming Flay with 5 stars,
    // where masterStars/category both give no signal. See lib/hypixelImport.js's consumer.
    dungeonized: !!ea.dungeon_item,
    hotPotatoBooks: ea.hot_potato_count || 0,
    // Confirmed live (2026-08-25) against a real weapon with The Art of War applied:
    // ExtraAttributes.art_of_war_count === 1. No confirmed real field for The Art of Peace yet
    // (no armor piece with it applied found in the account checked) — left unset until confirmed,
    // rather than guessed. See lib/hypixelImport.js's consumer.
    artOfWar: !!ea.art_of_war_count,
    // Real per-copy Gear-Score data — which Floor this specific drop came from (1-10) and its
    // real stat boost % — confirmed live 2026-09-03 against a real Skeleton Master Chestplate
    // (item_tier: 10, baseStatBoostPercentage: 50). Only meaningful for the handful of tiered-stat
    // items lib/tieredArmorStats.js models; harmless/unused otherwise. See lib/hypixelImport.js's consumer.
    itemTier: ea.item_tier || null,
    baseStatBoostPercentage: ea.baseStatBoostPercentage || 0,
    enchantments: ea.enchantments || {},
    gems: ea.gems || null,
    // Real per-instance lore (with §-codes) — most items don't need this (their real stats come
    // from the bundled NEU-REPO catalog), but a few (David's Cloak's Strength/rarity, neither of
    // which has a published formula and both of which live only in the account's own copy of the
    // item) can only be recovered by reading it directly. See lib/hypixelImport.js's consumer.
    lore: slotItem.tag.display?.Lore || null,
  };
}

#!/usr/bin/env node
/**
 * Build-time ingest, same head-render technique as
 * apply-skull-head-icons.mjs but for reforge STONE items (Dragon Claw,
 * Wither Blood, etc. — see worker/src/index.js's fetchReforgeStones)
 * rather than weapons/armor/pets. Unlike those, reforge stones aren't in
 * this project's bundled data files at all (they're fetched live), so
 * lib/icons.js's getReforgeStoneIcon() expects hand-added art at
 * frontend/public/images/reforgestones/{id}.png with no automated
 * fallback — most stones still have no icon there at all.
 *
 * Scoped here to just the Armor-applicable stones (itemTypes 'ARMOR'/
 * 'HELMET'/'CHESTPLATE', or an item-exclusive internalName list that
 * includes an armor piece, e.g. Greater Spook's Great Spook set) rather
 * than all ~81 stones, per request. Every one of these is a real
 * "minecraft:skull" custom-head item in NEU-REPO (spot-checked several
 * before writing this), so the same skin-texture-hash + mc-heads.net
 * /head/ render approach applies directly — see that script's own header
 * comment for why texture hash (not profileId) is what's rendered.
 *
 * Usage: node apply-armor-reforge-stone-skulls.mjs
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', '..', 'frontend', 'public', 'images', 'reforgestones');

const NEU_ITEMS_BASE = 'https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/items';
const NEU_REFORGESTONES_URL = 'https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants/reforgestones.json';
const HEAD_RENDER_SIZE = 100;

const ARMOR_PIECE_KEYWORDS = ['HELMET', 'CHESTPLATE', 'LEGGINGS', 'BOOTS'];

// Mirrors lib/reforgeData.js's own itemTypes handling: most armor stones
// share a generic 'ARMOR' bucket, a few use piece-specific 'HELMET'/
// 'CHESTPLATE' strings, and item-exclusive stones (Great Spook set) carry
// an {internalName: [...]} object instead of a plain string — armor if
// any listed id looks like an armor piece.
function isArmorStone(stone) {
  const types = stone.itemTypes;
  if (typeof types === 'string') return types === 'ARMOR' || types === 'HELMET' || types === 'CHESTPLATE';
  if (types && typeof types === 'object' && Array.isArray(types.internalName)) {
    return types.internalName.some((id) => ARMOR_PIECE_KEYWORDS.some((kw) => id.includes(kw)));
  }
  return false;
}

function extractSkinTextureHash(nbttag) {
  const m = /Value:"([^"]+)"/.exec(nbttag || '');
  if (!m) return null;
  try {
    const decoded = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));
    const url = decoded.textures?.SKIN?.url;
    if (!url) return null;
    return url.split('/').pop() || null;
  } catch {
    return null;
  }
}

async function fetchSkinTextureHash(itemId) {
  try {
    const res = await fetch(`${NEU_ITEMS_BASE}/${encodeURIComponent(itemId)}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    return extractSkinTextureHash(data.nbttag);
  } catch {
    return null;
  }
}

async function saveHeadRender(textureHash, outPath) {
  try {
    const res = await fetch(`https://mc-heads.net/head/${textureHash}/${HEAD_RENDER_SIZE}`);
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(outPath, buf);
    return true;
  } catch {
    return false;
  }
}

async function runBatched(items, worker, concurrency = 8) {
  let done = 0;
  let ok = 0;
  const queue = [...items];
  async function next() {
    const item = queue.shift();
    if (item === undefined) return;
    if (await worker(item)) ok++;
    done++;
    return next();
  }
  await Promise.all(Array.from({ length: concurrency }, next));
  return { done, ok };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const res = await fetch(NEU_REFORGESTONES_URL);
  const stones = await res.json();

  const armorStoneIds = Object.values(stones)
    .filter(isArmorStone)
    .map((s) => s.internalName)
    .filter((id) => id && !existsSync(path.join(OUT_DIR, `${id.toLowerCase()}.png`)));

  console.log(`${armorStoneIds.length} armor reforge stones missing an icon...`);
  const result = await runBatched(armorStoneIds, async (id) => {
    const hash = await fetchSkinTextureHash(id);
    if (!hash) {
      console.log(`  ${id}: no skin texture (not a skull item?)`);
      return false;
    }
    return saveHeadRender(hash, path.join(OUT_DIR, `${id.toLowerCase()}.png`));
  });
  console.log(`  saved ${result.ok}/${result.done}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

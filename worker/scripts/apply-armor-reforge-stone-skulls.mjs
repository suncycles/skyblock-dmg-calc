#!/usr/bin/env node
/**
 * Bakes head-render icons for the Armor-applicable reforge STONES (itemTypes 'ARMOR'/'HELMET'/
 * 'CHESTPLATE', or an item-exclusive internalName list containing an armor piece), using the same
 * skin-texture-hash + mc-heads.net /head/ render as apply-skull-head-icons.mjs — see that
 * script's header for why the texture hash, not profileId, is what gets rendered.
 *
 * Reforge stones aren't in the bundled data files (worker/src/index.js fetches them live), so
 * lib/icons.js's getReforgeStoneIcon() reads hand-added art from
 * frontend/public/images/reforgestones/{id}.png with no automated fallback.
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
    // mc-heads.net returns HTTP 200 with a silent default-Steve render (not an error) for some
    // real texture hashes it can't resolve; its `x-account-valid` response header is the only
    // reliable signal. See apply-skull-head-icons.mjs's saveHeadRender.
    if (!res.ok || res.headers.get('x-account-valid') === 'false') return false;
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

// compress-icons.mjs converts every baked icon to WebP at the end of the pipeline and deletes the
// PNG, so this has to accept either extension or every later run re-downloads what it already has.
function hasBakedIcon(id) {
  const base = path.join(OUT_DIR, id.toLowerCase());
  return existsSync(`${base}.png`) || existsSync(`${base}.webp`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const res = await fetch(NEU_REFORGESTONES_URL);
  const stones = await res.json();

  const armorStoneIds = Object.values(stones)
    .filter(isArmorStone)
    .map((s) => s.internalName)
    .filter((id) => id && !hasBakedIcon(id));

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

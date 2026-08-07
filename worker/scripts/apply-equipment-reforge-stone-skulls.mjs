#!/usr/bin/env node
/**
 * Build-time ingest, same head-render technique as apply-armor-reforge-stone-skulls.mjs but for
 * the Equipment-applicable reforge stones (Necklace/Cloak/Belt/Gloves — itemTypes 'EQUIPMENT' or
 * one of the 4 slot-specific strings) instead of Armor's. Reforge stones aren't in this project's
 * bundled data files at all (they're fetched live), so lib/icons.js's getReforgeStoneIcon()
 * expects hand-added art at frontend/public/images/reforgestones/{id}.png with no automated
 * fallback. Item-exclusive stones with object-form itemTypes (e.g. BOO_STONE, which also covers
 * armor pieces) are left to whichever script already handles them rather than re-fetched here.
 *
 * Usage: node apply-equipment-reforge-stone-skulls.mjs
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', '..', 'frontend', 'public', 'images', 'reforgestones');

const NEU_ITEMS_BASE = 'https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/items';
const NEU_REFORGESTONES_URL = 'https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants/reforgestones.json';
const HEAD_RENDER_SIZE = 100;

const EQUIPMENT_TYPE_STRINGS = new Set(['EQUIPMENT', 'NECKLACE', 'CLOAK', 'BELT', 'GLOVES']);

function isEquipmentStone(stone) {
  return typeof stone.itemTypes === 'string' && EQUIPMENT_TYPE_STRINGS.has(stone.itemTypes);
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
    // mc-heads.net returns HTTP 200 with a silent default-Steve-skin render (not an error) for
    // some real, resolvable texture hashes it doesn't otherwise recognize — see
    // apply-skull-head-icons.mjs's saveHeadRender for the full writeup. Its own
    // `x-account-valid` response header is the only reliable signal that happened.
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

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const res = await fetch(NEU_REFORGESTONES_URL);
  const stones = await res.json();

  const equipmentStoneIds = Object.values(stones)
    .filter(isEquipmentStone)
    .map((s) => s.internalName)
    .filter((id) => id && !existsSync(path.join(OUT_DIR, `${id.toLowerCase()}.png`)));

  console.log(`${equipmentStoneIds.length} equipment reforge stones missing an icon...`);
  const result = await runBatched(equipmentStoneIds, async (id) => {
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

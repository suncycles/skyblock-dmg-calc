#!/usr/bin/env node
/**
 * Build-time ingest, a second pass after apply-hypixel-textures.mjs: fills
 * in a real head-render icon for every item that pass's Hypixel-resource-
 * pack matching didn't find a texture for AND that's a "minecraft:skull"
 * (custom player-head) item — plus every pet, which has no bundled
 * weapons.json/armor.json-equivalent to match against at all.
 *
 * The pack has no render for these because they're custom third-party
 * skins (a real Mojang skin texture referenced via SkullOwner in the
 * item's own NBT), not a resource-pack-overridden vanilla texture — but
 * that same NBT is exactly what Hypixel's own UI renders as the item's
 * icon, so this extracts the skin's profile UUID and renders a real head
 * icon via mc-heads.net (a public Minecraft-skin-render service;
 * crafatar.com, the other common one, returned HTTP 521 when checked)
 * instead of guessing at a texture-pack match.
 *
 * Output goes to the same frontend/public/images/skyblock/{ID}.png path
 * apply-hypixel-textures.mjs already writes to — getSkyblockIcon()/
 * WeaponIcon need zero changes, they already check that path first for
 * any item id before falling back to a generic vanilla-material icon.
 *
 * Pets' id list comes straight from constants/petnums.json (there's no
 * pets.json-equivalent bundled locally to read ids from). Verified all
 * rarities of a given pet share one skin (spot-checked Wolf and Griffin
 * across their full rarity range) — one head render per pet species,
 * saved under the bare pet id, covers every rarity.
 *
 * Usage: node apply-skull-head-icons.mjs
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', '..', 'frontend', 'public', 'images', 'skyblock');
const DATA_DIR = path.join(__dirname, '..', 'src', 'data');

const NEU_ITEMS_BASE = 'https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/items';
const NEU_PETNUMS_URL = 'https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants/petnums.json';
const HEAD_RENDER_SIZE = 100;

// Standard Hypixel legacy pet-rarity ordinal scheme (see
// frontend/src/lib/petData.js's PET_RARITY_ORDER) — tried in roughly
// most-to-least-common order since not every pet has every rarity and we
// only need whichever one resolves first.
const RARITY_ORDINALS = [4, 3, 2, 5, 1, 0];

function extractSkinUuid(nbttag) {
  const m = /Value:"([^"]+)"/.exec(nbttag || '');
  if (!m) return null;
  try {
    const decoded = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));
    return decoded.profileId || null;
  } catch {
    return null;
  }
}

async function fetchSkinUuid(itemId) {
  try {
    const res = await fetch(`${NEU_ITEMS_BASE}/${encodeURIComponent(itemId)}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    return extractSkinUuid(data.nbttag);
  } catch {
    return null;
  }
}

async function saveHeadRender(uuid, outPath) {
  try {
    const res = await fetch(`https://mc-heads.net/avatar/${uuid}/${HEAD_RENDER_SIZE}`);
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(outPath, buf);
    return true;
  } catch {
    return false;
  }
}

// Small concurrency-capped batch runner — hundreds of sequential fetches
// would be slow, hundreds fully-parallel is impolite to both
// raw.githubusercontent.com and mc-heads.net.
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
  const weapons = JSON.parse(readFileSync(path.join(DATA_DIR, 'weapons.json'), 'utf8'));
  const armor = JSON.parse(readFileSync(path.join(DATA_DIR, 'armor.json'), 'utf8'));

  const skullItems = [...weapons, ...armor].filter(
    (item) => item.material === 'SKULL' && !existsSync(path.join(OUT_DIR, `${item.id}.png`)),
  );
  console.log(`${skullItems.length} skull-based weapon/armor items missing an icon...`);
  const itemResult = await runBatched(skullItems, async (item) => {
    const uuid = await fetchSkinUuid(item.id);
    if (!uuid) return false;
    return saveHeadRender(uuid, path.join(OUT_DIR, `${item.id}.png`));
  });
  console.log(`  saved ${itemResult.ok}/${itemResult.done}`);

  const petsRes = await fetch(NEU_PETNUMS_URL);
  const pets = await petsRes.json();
  const petIds = Object.keys(pets).filter((id) => !existsSync(path.join(OUT_DIR, `${id}.png`)));
  console.log(`${petIds.length} pets missing an icon...`);
  const petResult = await runBatched(petIds, async (petId) => {
    for (const ordinal of RARITY_ORDINALS) {
      const uuid = await fetchSkinUuid(`${petId};${ordinal}`);
      if (uuid) return saveHeadRender(uuid, path.join(OUT_DIR, `${petId}.png`));
    }
    return false;
  });
  console.log(`  saved ${petResult.ok}/${petResult.done}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

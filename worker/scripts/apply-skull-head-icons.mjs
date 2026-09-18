#!/usr/bin/env node
/**
 * Build-time ingest, a second pass after apply-hypixel-textures.mjs: renders a head icon for every
 * item that pass found no texture for AND that is a "minecraft:skull" (custom player-head) item,
 * plus every pet, which has no bundled catalog to match against.
 *
 * Equipment (Necklace/Cloak/Belt/Gloves) is entirely skull items with no resource-pack entries, so
 * all of it comes through this pass.
 *
 * The pack has no render for these because they are custom skins referenced through SkullOwner in
 * the item's own NBT rather than resource-pack-overridden vanilla textures. That NBT is what
 * Hypixel's own UI renders, so this extracts the skin texture and renders a head icon through
 * mc-heads.net (crafatar.com, the other common service, returned HTTP 521 when checked).
 *
 * The render must be keyed off the texture hash — textures.SKIN.url's last path segment — and not
 * off `profileId`. `profileId` is the Mojang account UUID the skin was captured from, and
 * mc-heads.net's /avatar/{uuid} route resolves it to that account's CURRENT skin, which may have
 * changed. The texture hash is a content-addressed id of the exact image and works as a drop-in
 * replacement in the same route. Querying CROWN_OF_AVARICE by profileId rendered a random player's
 * face; by texture hash it rendered the correct crown.
 *
 * Output goes to the same frontend/public/images/skyblock/{ID}.png path apply-hypixel-textures.mjs
 * writes to, which getSkyblockIcon and WeaponIcon already check before the vanilla fallback.
 *
 * Pet ids come from constants/petnums.json, there being no bundled pets.json. Every rarity of a pet
 * shares one skin, so one render per species, saved under the bare pet id, covers them all.
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

// Hypixel's legacy pet-rarity ordinals (see frontend/src/lib/petData.js's PET_RARITY_ORDER), tried
// most-to-least common: not every pet has every rarity, and only the first that resolves is needed.
const RARITY_ORDINALS = [4, 3, 2, 5, 1, 0];

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
    // /head/ rather than /avatar/: the isometric 3D cube render matching the resource-pack icons,
    // not a flat 2D face crop.
    const res = await fetch(`https://mc-heads.net/head/${textureHash}/${HEAD_RENDER_SIZE}`);
    // mc-heads.net returns HTTP 200 with a silent default-Steve render for some resolvable texture
    // hashes it doesn't recognize: PIG;4 and SHEEP;4's real hashes render byte-for-byte identically
    // to a garbage hash. Its `x-account-valid` response header is the only reliable signal, since
    // `res.ok` can't tell a real render from the fallback.
    if (!res.ok || res.headers.get('x-account-valid') === 'false') return false;
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(outPath, buf);
    return true;
  } catch {
    return false;
  }
}

// Concurrency-capped batch runner: hundreds of sequential fetches are slow, and hundreds of
// parallel ones are impolite to both raw.githubusercontent.com and mc-heads.net.
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

// This script writes PNG, but compress-icons.mjs converts every baked icon to WebP at the end of the
// pipeline and deletes the PNG, so the "already have it?" check accepts either extension —
// otherwise every run re-downloads several hundred head renders.
function hasBakedIcon(id) {
  return existsSync(path.join(OUT_DIR, `${id}.png`)) || existsSync(path.join(OUT_DIR, `${id}.webp`));
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const weapons = JSON.parse(readFileSync(path.join(DATA_DIR, 'weapons.json'), 'utf8'));
  const armor = JSON.parse(readFileSync(path.join(DATA_DIR, 'armor.json'), 'utf8'));
  const equipment = JSON.parse(readFileSync(path.join(DATA_DIR, 'equipment.json'), 'utf8'));
  const petItems = JSON.parse(readFileSync(path.join(DATA_DIR, 'petItems.json'), 'utf8'));
  const powerStones = JSON.parse(readFileSync(path.join(DATA_DIR, 'powerStones.json'), 'utf8'));

  const skullItems = [...weapons, ...armor, ...equipment, ...petItems, ...powerStones].filter(
    (item) => item.material === 'SKULL' && !hasBakedIcon(item.id),
  );
  console.log(`${skullItems.length} skull-based weapon/armor/equipment/pet-item items missing an icon...`);
  const itemResult = await runBatched(skullItems, async (item) => {
    const hash = await fetchSkinTextureHash(item.id);
    if (!hash) return false;
    return saveHeadRender(hash, path.join(OUT_DIR, `${item.id}.png`));
  });
  console.log(`  saved ${itemResult.ok}/${itemResult.done}`);

  const petsRes = await fetch(NEU_PETNUMS_URL);
  const pets = await petsRes.json();
  const petIds = Object.keys(pets).filter((id) => !hasBakedIcon(id));
  console.log(`${petIds.length} pets missing an icon...`);
  const petResult = await runBatched(petIds, async (petId) => {
    for (const ordinal of RARITY_ORDINALS) {
      const hash = await fetchSkinTextureHash(`${petId};${ordinal}`);
      if (hash) return saveHeadRender(hash, path.join(OUT_DIR, `${petId}.png`));
    }
    return false;
  });
  console.log(`  saved ${petResult.ok}/${petResult.done}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

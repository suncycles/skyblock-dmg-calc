#!/usr/bin/env node
/**
 * Build-time ingest: pulls Hypixel's official SkyBlock resource pack
 * (https://api.hypixel.net/v2/resources/packs) and copies out the subset of
 * item textures that map cleanly onto items in weapons.json/armor.json,
 * into frontend/public/images/skyblock/{ITEM_ID}.png.
 *
 * The API only returns a zip download (one per supported pack format) —
 * there's no per-texture endpoint — so this downloads it once and keeps the
 * extracted PNGs as regular committed files rather than re-fetching at
 * runtime. Re-run this + rebuild the frontend to pick up pack updates.
 *
 * Most items DON'T have bespoke SkyBlock art here: the pack overrides
 * vanilla item textures per unique item via 1.21.4+ item-model predicates
 * (assets/hypixel_skyblock/items/item/**.json -> models -> textures), not
 * by vanilla material, and only a fraction of items (mostly higher-rarity
 * or otherwise distinctive gear) get one. The item-model basenames happen
 * to match NEU-REPO's internal item id lowercased (e.g. the model for
 * "ASPECT_OF_THE_VOID" is textures/item/.../aspect_of_the_void.png), which
 * is a far more reliable join key than fuzzy-matching display names.
 * Everything without a match here is expected to fall back to the generic
 * vanilla-material icon (see frontend/src/lib/icons.js) — not a bug.
 *
 * Usage: node apply-hypixel-textures.mjs
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, copyFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', '..', 'frontend', 'public', 'images', 'skyblock');
const DATA_DIR = path.join(__dirname, '..', 'src', 'data');

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function downloadTo(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buf);
}

function walkPngs(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkPngs(p, acc);
    else if (entry.name.endsWith('.png')) acc.push(p);
  }
  return acc;
}

async function main() {
  const { packs } = await fetchJson('https://api.hypixel.net/v2/resources/packs');
  const skyblockPack = packs.find((p) => p.id === 'SkyBlock');
  if (!skyblockPack) throw new Error('No "SkyBlock" pack in API response');
  // Highest packFormat = newest Minecraft version this pack targets.
  const latest = skyblockPack.versions.slice().sort((a, b) => b.packFormat - a.packFormat)[0];
  console.log(`Using pack format ${latest.packFormat}: ${latest.url}`);

  const workDir = mkdtempSync(path.join(tmpdir(), 'hypixel-pack-'));
  const zipPath = path.join(workDir, 'pack.zip');
  const extractDir = path.join(workDir, 'extracted');
  await downloadTo(latest.url, zipPath);
  mkdirSync(extractDir, { recursive: true });
  execFileSync('unzip', ['-q', zipPath, '-d', extractDir]);

  const itemTexturesDir = path.join(extractDir, 'assets', 'hypixel_skyblock', 'textures', 'item');
  const pngPaths = walkPngs(itemTexturesDir);

  const byBasename = new Map();
  const dupes = new Set();
  for (const p of pngPaths) {
    const base = path.basename(p, '.png').toLowerCase();
    if (byBasename.has(base)) dupes.add(base);
    else byBasename.set(base, p);
  }
  dupes.forEach((base) => byBasename.delete(base)); // ambiguous — don't guess

  const weapons = JSON.parse(readFileSync(path.join(DATA_DIR, 'weapons.json'), 'utf8'));
  const armor = JSON.parse(readFileSync(path.join(DATA_DIR, 'armor.json'), 'utf8'));

  mkdirSync(OUT_DIR, { recursive: true });
  let copied = 0;
  for (const item of [...weapons, ...armor]) {
    const src = byBasename.get(item.id.toLowerCase());
    if (!src) continue;
    copyFileSync(src, path.join(OUT_DIR, `${item.id}.png`));
    copied++;
  }

  rmSync(workDir, { recursive: true, force: true });
  console.log(`Copied ${copied} item-specific textures into ${path.relative(process.cwd(), OUT_DIR)}`);
  console.log(`(dropped ${dupes.size} ambiguous basenames shared by multiple pack files)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

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
 * or otherwise distinctive gear) get one. Everything without a match here
 * is expected to fall back to the generic vanilla-material icon (see
 * frontend/src/lib/icons.js) — not a bug.
 *
 * Matching is tiered, cheapest/most-precise first:
 *  1. Exact: item id lowercased == texture basename (e.g. "ASPECT_OF_THE_VOID"
 *     -> aspect_of_the_void.png). Works when the id and the in-pack name
 *     agree, which is most items.
 *  2. Exact: slugified display name == texture basename. The pack is
 *     actually keyed by in-game display name, not internal id, so renamed/
 *     nicknamed items (id "DAEDALUS_AXE", texture "daedalus_blade.png",
 *     because the item is really called "Daedalus Blade") only resolve this
 *     way. Starred (max-stat reforge) items carry a leading Hypixel-font
 *     glyph before the name — strip it before slugifying, same fix as the
 *     weapon-search box.
 *  3. Fuzzy: slugified display name within Levenshtein distance 1 of a
 *     texture basename, e.g. "hunter_knife" -> "hunters_knife" (the real
 *     name has a possessive the slug drops) or "bouquet_of_lies" ->
 *     "bouqet_of_lies" (a typo in Hypixel's own filename). Gated to names
 *     >=6 chars with a *unique* closest match — short names produce
 *     coincidental one-edit collisions with unrelated items (e.g. "bow" is
 *     distance 2 from the unrelated "wob", "iron_sword" is distance 3 from
 *     "broken_sword"), so this is intentionally conservative rather than a
 *     general fuzzy search.
 *
 * Usage: node apply-hypixel-textures.mjs
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, copyFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', '..', 'frontend', 'public', 'images', 'skyblock');
const GEMSTONE_OUT_DIR = path.join(__dirname, '..', '..', 'frontend', 'public', 'images', 'gemstones');
const DATA_DIR = path.join(__dirname, '..', 'src', 'data');

// The 6 gemstone types the calculator's Gemstone slots feature supports —
// see frontend/src/lib/gemstoneData.js.
const GEMSTONE_IDS = ['RUBY', 'JASPER', 'SAPPHIRE', 'AMETHYST', 'ONYX', 'OPAL'];
const GEMSTONE_TIERS = ['rough', 'flawed', 'fine', 'flawless', 'perfect'];

function slugify(name) {
  return name
    .replace(/^[^A-Za-z0-9]+/, '') // leading starred-reforge glyph
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// Closest basename to `key` at edit distance exactly 1, only if it's the
// unique closest one (no ties) — see module doc for why this is gated.
function findFuzzyMatch(key, basenames) {
  if (key.length < 6) return null;
  let best = null;
  let bestDist = Infinity;
  let tie = false;
  for (const base of basenames) {
    if (Math.abs(base.length - key.length) > 1) continue;
    const d = levenshtein(key, base);
    if (d < bestDist) {
      bestDist = d;
      best = base;
      tie = false;
    } else if (d === bestDist) {
      tie = true;
    }
  }
  return bestDist === 1 && !tie ? best : null;
}

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
  const basenames = [...byBasename.keys()];

  mkdirSync(OUT_DIR, { recursive: true });
  const tally = { id: 0, name: 0, fuzzy: 0 };
  for (const item of [...weapons, ...armor]) {
    const idKey = item.id.toLowerCase();
    const nameKey = slugify(item.name);

    let src = byBasename.get(idKey);
    let tier = 'id';
    if (!src) {
      src = byBasename.get(nameKey);
      tier = 'name';
    }
    if (!src) {
      const fuzzyBase = findFuzzyMatch(nameKey, basenames);
      if (fuzzyBase) {
        src = byBasename.get(fuzzyBase);
        tier = 'fuzzy';
      }
    }
    if (!src) continue;

    copyFileSync(src, path.join(OUT_DIR, `${item.id}.png`));
    tally[tier]++;
  }

  // The pack also has real per-gem, per-tier item art for the Gemstones
  // collection at a fixed, well-known path — read directly from there
  // rather than through byBasename, which dedupes by basename alone and
  // would drop these: some gems (e.g. Opal) have a same-named but visually
  // different reskinned texture elsewhere in the pack (a Blaze Slayer
  // drop), which is a real ambiguity for the general id/name matching
  // above but not here, since we know exactly which path we want.
  mkdirSync(GEMSTONE_OUT_DIR, { recursive: true });
  let gemstoneCopied = 0;
  for (const gemId of GEMSTONE_IDS) {
    for (const tier of GEMSTONE_TIERS) {
      const src = path.join(itemTexturesDir, 'collections', 'gemstone', gemId.toLowerCase(), `${tier}_${gemId.toLowerCase()}_gem.png`);
      if (!existsSync(src)) continue;
      copyFileSync(src, path.join(GEMSTONE_OUT_DIR, `${gemId}_${tier.toUpperCase()}.png`));
      gemstoneCopied++;
    }
  }

  rmSync(workDir, { recursive: true, force: true });
  const copied = tally.id + tally.name + tally.fuzzy;
  console.log(`Copied ${copied} item-specific textures into ${path.relative(process.cwd(), OUT_DIR)}`);
  console.log(`  (id match: ${tally.id}, name match: ${tally.name}, fuzzy match: ${tally.fuzzy})`);
  console.log(`(dropped ${dupes.size} ambiguous basenames shared by multiple pack files)`);
  console.log(`Copied ${gemstoneCopied} gemstone tier textures into ${path.relative(process.cwd(), GEMSTONE_OUT_DIR)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

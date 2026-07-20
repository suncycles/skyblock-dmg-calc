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
 *  1. Item-definition resolution: look up items/item/**\/{slug}.json — the
 *     pack's actual item-identity keying, matched by slugified display name
 *     first and internal id second (see below for why name wins), then walk
 *     its item-model predicate tree (condition/select/range_dispatch/
 *     composite, recursively) down to a leaf model, then read that model's
 *     texture. This is the only tier that gets skin-variant items right:
 *     e.g. id "BURSTFIRE_DAGGER" (displayed as "Kindlebane Dagger") has no
 *     "burstfire_dagger.png" *or* "kindlebane_dagger.png" — the real files
 *     are "kindlebane_dagger_ashen.png"/"_auric.png" (powder-track skins),
 *     and only items/item/slayer/blaze/swords/kindlebane_dagger.json says
 *     which one is the default. For items whose id is "STARRED_"-prefixed
 *     (our weapons.json entry for the max-stat variant), this tier first
 *     tries "{slug}_fragged" — Hypixel's internal name for what players
 *     call "starred" — before falling back to the un-starred "{slug}". It's
 *     a *separate* top-level item-def file with its own distinct texture
 *     (e.g. "daedalus_blade_fragged.json"/.png next to "daedalus_blade"),
 *     not a condition inside the base item's def, and only about a
 *     quarter of starred items in our data actually have one — the rest
 *     share their base item's texture, which is correct (no fragged file
 *     exists for them in the pack either).
 *  2. Exact: item id lowercased == texture basename (e.g. "ASPECT_OF_THE_VOID"
 *     -> aspect_of_the_void.png). Works when the id and the in-pack name
 *     agree, which is most items.
 *  3. Exact: slugified display name == texture basename. The pack is
 *     actually keyed by in-game display name, not internal id, so renamed/
 *     nicknamed items (id "DAEDALUS_AXE", texture "daedalus_blade.png",
 *     because the item is really called "Daedalus Blade") only resolve this
 *     way. Starred (max-stat reforge) items carry a leading Hypixel-font
 *     glyph before the name — strip it before slugifying, same fix as the
 *     weapon-search box.
 *  4. Fuzzy: slugified display name within Levenshtein distance 1 of a
 *     texture basename, e.g. "hunter_knife" -> "hunters_knife" (the real
 *     name has a possessive the slug drops) or "bouquet_of_lies" ->
 *     "bouqet_of_lies" (a typo in Hypixel's own filename). Gated to names
 *     >=6 chars with a *unique* closest match — short names produce
 *     coincidental one-edit collisions with unrelated items (e.g. "bow" is
 *     distance 2 from the unrelated "wob", "iron_sword" is distance 3 from
 *     "broken_sword"), so this is intentionally conservative rather than a
 *     general fuzzy search.
 *
 * Tiers 2-4 are a basename-guessing fallback for items with no
 * items/item/**.json entry at all. Empirically, matching weapons.json/
 * armor.json entries against items/item/**.json basenames hits on name 45x
 * more than on id alone (992 items: 45 name-only, 8 id-only, 123 both) —
 * name is checked first in tier 1 for the same reason.
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
    .replace(/['’]/g, '') // possessives are squashed together in the pack's own slugs, e.g. "Bonzo's Staff" -> "bonzos_staff", not "bonzo_s_staff"
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

function walkFiles(dir, ext, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(p, ext, acc);
    else if (entry.name.endsWith(ext)) acc.push(p);
  }
  return acc;
}

// Strips the "hypixel_skyblock:" (or any) resource-location namespace off a
// model/texture reference, leaving the path relative to models/ or textures/.
function stripNamespace(ref) {
  const idx = ref.indexOf(':');
  return idx === -1 ? ref : ref.slice(idx + 1);
}

// Walks an item-model predicate node (the "model" field of an
// items/item/**.json file, or any nested model within it) down to a single
// leaf model reference string. Handles the predicate types actually seen in
// the pack: minecraft:model (leaf), condition (take on_false, the
// non-special-cased default state), minecraft:select keyed on
// minecraft:display_context (take the "gui" case — that's what's shown in
// an inventory slot, which is what we're rendering), range_dispatch (take
// fallback, i.e. no special property active), and composite (take the
// first layer, e.g. a drill's head). Falls back to a best-effort deep
// search for any nested "model" string so unrecognized/future predicate
// shapes degrade gracefully instead of throwing.
function resolveModelRef(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return null;
  const type = node.type;
  if (type === 'model' || type === 'minecraft:model') {
    return typeof node.model === 'string' ? node.model : null;
  }
  if (type === 'condition' || type === 'minecraft:condition') {
    return resolveModelRef(node.on_false, depth + 1) || resolveModelRef(node.on_true, depth + 1);
  }
  if (type === 'minecraft:select') {
    const guiCase = (node.cases || []).find((c) => Array.isArray(c.when) && c.when.includes('gui'));
    if (guiCase) return resolveModelRef(guiCase.model, depth + 1);
    if (node.fallback) return resolveModelRef(node.fallback, depth + 1);
    if (node.cases && node.cases[0]) return resolveModelRef(node.cases[0].model, depth + 1);
    return null;
  }
  if (type === 'range_dispatch') {
    if (node.fallback) return resolveModelRef(node.fallback, depth + 1);
    if (node.entries && node.entries[0]) return resolveModelRef(node.entries[0].model, depth + 1);
    return null;
  }
  if (type === 'composite') {
    return node.models && node.models[0] ? resolveModelRef(node.models[0], depth + 1) : null;
  }
  if (typeof node.model === 'string') return node.model;
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') {
      const found = resolveModelRef(Array.isArray(value) ? value[0] : value, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

// Resolves a leaf model reference (e.g.
// "hypixel_skyblock:item/slayer/blaze/swords/kindlebane_dagger_ashen") to
// its texture PNG on disk, by reading the model json's layer0 texture (or
// walking up its parent chain if it has none of its own).
function resolveTexturePath(modelRef, extractDir, depth = 0) {
  if (!modelRef || depth > 8) return null;
  const modelJsonPath = path.join(extractDir, 'assets', 'hypixel_skyblock', 'models', `${stripNamespace(modelRef)}.json`);
  if (!existsSync(modelJsonPath)) return null;
  const modelJson = JSON.parse(readFileSync(modelJsonPath, 'utf8'));
  const texRef = modelJson.textures && (modelJson.textures.layer0 || Object.values(modelJson.textures)[0]);
  if (texRef) {
    const texPath = path.join(extractDir, 'assets', 'hypixel_skyblock', 'textures', `${stripNamespace(texRef)}.png`);
    if (existsSync(texPath)) return texPath;
  }
  if (typeof modelJson.parent === 'string' && modelJson.parent.startsWith('hypixel_skyblock:')) {
    return resolveTexturePath(modelJson.parent, extractDir, depth + 1);
  }
  return null;
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
  const pngPaths = walkFiles(itemTexturesDir, '.png');

  const byBasename = new Map();
  const dupes = new Set();
  for (const p of pngPaths) {
    const base = path.basename(p, '.png').toLowerCase();
    if (byBasename.has(base)) dupes.add(base);
    else byBasename.set(base, p);
  }
  dupes.forEach((base) => byBasename.delete(base)); // ambiguous — don't guess

  const itemDefsDir = path.join(extractDir, 'assets', 'hypixel_skyblock', 'items', 'item');
  const itemDefPaths = walkFiles(itemDefsDir, '.json');
  const itemDefByBasename = new Map();
  const itemDefDupes = new Set();
  for (const p of itemDefPaths) {
    const base = path.basename(p, '.json').toLowerCase();
    if (itemDefByBasename.has(base)) itemDefDupes.add(base);
    else itemDefByBasename.set(base, p);
  }
  itemDefDupes.forEach((base) => itemDefByBasename.delete(base)); // ambiguous — don't guess

  const weapons = JSON.parse(readFileSync(path.join(DATA_DIR, 'weapons.json'), 'utf8'));
  const armor = JSON.parse(readFileSync(path.join(DATA_DIR, 'armor.json'), 'utf8'));
  const basenames = [...byBasename.keys()];

  mkdirSync(OUT_DIR, { recursive: true });
  const tally = { itemdefStarred: 0, itemdef: 0, id: 0, name: 0, fuzzy: 0 };
  for (const item of [...weapons, ...armor]) {
    const idKey = item.id.toLowerCase();
    const nameKey = slugify(item.name);
    const starred = item.id.startsWith('STARRED_');

    let src = null;
    let tier = null;

    // Starred (max-stat) items get a genuinely different texture in the
    // pack, keyed as a *separate* top-level item-def basename suffixed
    // "_fragged" (Hypixel's internal name for what players call
    // "starred") — e.g. "daedalus_blade" (base) vs
    // "daedalus_blade_fragged" (starred), two unrelated files, not a
    // condition/select inside one. Only ~7 of 27 starred items in our
    // data actually have one; the rest fall through to the shared base
    // texture same as before. Name checked before id — see module doc for
    // why the pack's own item-identity keying favors display name.
    const candidateKeys = starred ? [`${nameKey}_fragged`, `${idKey}_fragged`, nameKey, idKey] : [nameKey, idKey];
    for (const key of candidateKeys) {
      const defPath = itemDefByBasename.get(key);
      if (!defPath) continue;
      const def = JSON.parse(readFileSync(defPath, 'utf8'));
      const texPath = resolveTexturePath(resolveModelRef(def.model), extractDir);
      if (texPath) {
        src = texPath;
        tier = key.endsWith('_fragged') ? 'itemdefStarred' : 'itemdef';
        break;
      }
    }

    if (!src) {
      src = byBasename.get(idKey);
      tier = 'id';
    }
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
  const copied = tally.itemdefStarred + tally.itemdef + tally.id + tally.name + tally.fuzzy;
  console.log(`Copied ${copied} item-specific textures into ${path.relative(process.cwd(), OUT_DIR)}`);
  console.log(
    `  (itemdef-starred match: ${tally.itemdefStarred}, itemdef match: ${tally.itemdef}, id match: ${tally.id}, name match: ${tally.name}, fuzzy match: ${tally.fuzzy})`,
  );
  console.log(`(dropped ${dupes.size} ambiguous texture basenames, ${itemDefDupes.size} ambiguous item-def basenames)`);
  console.log(`Copied ${gemstoneCopied} gemstone tier textures into ${path.relative(process.cwd(), GEMSTONE_OUT_DIR)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

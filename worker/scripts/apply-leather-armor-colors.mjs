#!/usr/bin/env node
/**
 * Build-time ingest, run after build-item-data.mjs: backfills a `color`
 * field (6-digit lowercase hex, e.g. "0e666d") onto every LEATHER-material
 * armor.json entry, read from that item's real NEU-REPO nbttag — Skyblock
 * leather armor is dyed via the vanilla `display.color` NBT int (a packed
 * 0xRRGGBB value), the same mechanism vanilla leather armor/dye uses.
 *
 * Frontend renders this as a CSS mix-blend-mode:overlay tint on top of the
 * generic Leather_*.png base texture (see components/WeaponIcon.jsx) since
 * NEU-REPO's bundled Hypixel-resource-pack icons don't include a
 * pre-colored render per leather item.
 *
 * Usage: node apply-leather-armor-colors.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARMOR_PATH = path.join(__dirname, '..', 'src', 'data', 'armor.json');
const NEU_ITEMS_BASE = 'https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/items';

function decimalToHex(decimal) {
  return (decimal >>> 0).toString(16).padStart(6, '0');
}

async function fetchLeatherColor(itemId) {
  try {
    const res = await fetch(`${NEU_ITEMS_BASE}/${encodeURIComponent(itemId)}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    const m = /color:(-?\d+)/.exec(data.nbttag || '');
    return m ? decimalToHex(parseInt(m[1], 10)) : null;
  } catch {
    return null;
  }
}

// Concurrency-capped batch runner — hundreds of sequential fetches would be
// slow, hundreds fully-parallel is impolite to raw.githubusercontent.com.
async function runBatched(items, worker, concurrency = 8) {
  let done = 0;
  let ok = 0;
  const queue = [...items];
  async function next() {
    const item = queue.shift();
    if (item === undefined) return;
    if (await worker(item)) ok++;
    done++;
    if (done % 50 === 0) console.log(`  ${done}/${items.length}...`);
    return next();
  }
  await Promise.all(Array.from({ length: concurrency }, next));
  return { done, ok };
}

async function main() {
  const armor = JSON.parse(readFileSync(ARMOR_PATH, 'utf8'));
  const leatherItems = armor.filter((item) => item.material && item.material.startsWith('LEATHER'));
  console.log(`${leatherItems.length} leather-material armor items to color...`);

  const result = await runBatched(leatherItems, async (item) => {
    const hex = await fetchLeatherColor(item.id);
    if (!hex) return false;
    item.color = hex;
    return true;
  });
  console.log(`  colored ${result.ok}/${result.done}`);

  writeFileSync(ARMOR_PATH, JSON.stringify(armor));
  console.log(`Wrote ${ARMOR_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

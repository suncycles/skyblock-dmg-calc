#!/usr/bin/env node
/**
 * Build-time ingest: parses a local checkout of NotEnoughUpdates-REPO
 * (https://github.com/NotEnoughUpdates/NotEnoughUpdates-REPO, MIT) into
 * the weapons/armor JSON bundles the worker ships with, replacing the
 * old Hypixel /resources/skyblock/items dependency.
 *
 * NEU-REPO's item files have no structured rarity/category field. The
 * `nbttag` field isn't even valid JSON (it's stringified SNBT). The only
 * place rarity+category live is the last non-empty line of `lore`, e.g.
 * "§6§lLEGENDARY SWORD". This script strips color codes from that line,
 * matches the leading words against constants/misc.json's tier_colors,
 * and treats what's left as the category — kept even when it doesn't
 * match a known type, but only weapon/armor categories are retained in
 * the output (this app doesn't use the rest).
 *
 * This runs offline, not inside the Cloudflare Worker: parsing 8000+
 * files exceeds a Worker invocation's subrequest/CPU budget. Output is
 * committed into worker/src/data/ and imported directly by the worker
 * at deploy time — re-run this + redeploy to pick up NEU-REPO updates.
 *
 * Usage: node build-item-data.mjs <path-to-NEU-REPO-checkout>
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoPath = process.argv[2];
if (!repoPath) {
  console.error('Usage: node build-item-data.mjs <path-to-NEU-REPO-checkout>');
  process.exit(1);
}

const itemsDir = path.join(repoPath, 'items');
const misc = JSON.parse(readFileSync(path.join(repoPath, 'constants', 'misc.json'), 'utf8'));

// Longest first so "VERY SPECIAL" matches before "SPECIAL".
const TIER_NAMES = Object.keys(misc.tier_colors)
  .map((t) => t.replace(/_/g, ' ').toUpperCase())
  .sort((a, b) => b.length - a.length);

const WEAPON_TYPES = ['SWORD', 'BOW', 'LONGSWORD', 'WAND'];
const ARMOR_TYPES = ['HELMET', 'CHESTPLATE', 'LEGGINGS', 'BOOTS'];
// Hypixel's "Equipment" gear category (Necklace/Cloak/Belt/Gloves) — a
// second, parallel armor-like slot set, not variants of HELMET etc.
const EQUIPMENT_TYPES = ['NECKLACE', 'CLOAK', 'BELT', 'GLOVES'];

// Items that parse as a weapon/armor category but aren't real
// player-obtainable gear: Rift NPC "items" (their tier is always null —
// they're dialogue props, not loot) and one-off cosmetic/quest items
// whose real function has nothing to do with combat.
const EXCLUDED_IDS = new Set([
  'ARGOFAY_THREEBROTHER_1_RIFT_NPC',
  'ARGOFAY_THREEBROTHER_2_RIFT_NPC',
  'ARGOFAY_THREEBROTHER_3_RIFT_NPC',
  'TIME_KNIFE', // "Time Shuriken" — Rift cosmetic throwable, not a weapon
]);

function stripColorCodes(str) {
  return str.replace(/§./g, '');
}

function parseTierAndCategory(lore) {
  for (let i = lore.length - 1; i >= 0; i--) {
    const plain = stripColorCodes(lore[i]).trim();
    if (!plain) continue;
    const upper = plain.toUpperCase();
    for (const tierName of TIER_NAMES) {
      if (upper.startsWith(tierName)) {
        const rest = upper.slice(tierName.length).trim();
        return { tier: tierName.replace(/ /g, '_'), category: rest || null };
      }
    }
    // No recognized tier prefix — keep the whole line as a best-effort
    // category rather than discarding the item outright.
    return { tier: null, category: upper || null };
  }
  return { tier: null, category: null };
}

// NEU's itemid is namespaced/lowercase (e.g. "minecraft:iron_sword");
// normalize to the upper-snake-case form the frontend's icon lookup expects.
function materialFromItemId(itemid) {
  if (!itemid) return null;
  return itemid.replace(/^[a-z0-9_]+:/, '').toUpperCase();
}

const weapons = [];
const armor = [];
const equipment = [];
let skippedNoLore = 0;
let parseErrors = 0;

const files = readdirSync(itemsDir).filter((f) => f.endsWith('.json'));
console.log(`Parsing ${files.length} item files from ${itemsDir}...`);

for (const file of files) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(path.join(itemsDir, file), 'utf8'));
  } catch (err) {
    parseErrors++;
    continue;
  }

  if (!Array.isArray(raw.lore) || raw.lore.length === 0) {
    skippedNoLore++;
    continue;
  }

  if (EXCLUDED_IDS.has(raw.internalname)) continue;

  const { tier, category } = parseTierAndCategory(raw.lore);
  if (!category) continue;

  const isWeapon = WEAPON_TYPES.some((t) => category.endsWith(t));
  const isArmor = !isWeapon && ARMOR_TYPES.some((t) => category.endsWith(t));
  // Equipment additionally requires a real tier: unlike weapon/armor
  // (where every category-matching file so far has genuinely been real
  // gear), one Rift NPC dialogue item's last lore line happens to end in
  // "...AND THE SILKRIDER SAFETY BELT" — a sentence, not a rarity tag —
  // and would otherwise false-positive as a BELT. A real equipment item
  // always has a parsed tier; dialogue text doesn't.
  const isEquipment = !isWeapon && !isArmor && tier && EQUIPMENT_TYPES.some((t) => category.endsWith(t));
  if (!isWeapon && !isArmor && !isEquipment) continue;

  const item = {
    id: raw.internalname,
    name: stripColorCodes(raw.displayname || raw.internalname || ''),
    material: materialFromItemId(raw.itemid),
    category,
    tier,
    lore: raw.lore,
  };

  if (isWeapon) weapons.push(item);
  else if (isArmor) armor.push(item);
  else equipment.push(item);
}

console.log(`weapons: ${weapons.length}`);
console.log(`armor: ${armor.length}`);
console.log(`equipment: ${equipment.length}`);
console.log(`skipped (no lore): ${skippedNoLore}`);
console.log(`parse errors: ${parseErrors}`);

const outDir = path.join(__dirname, '..', 'src', 'data');
writeFileSync(path.join(outDir, 'weapons.json'), JSON.stringify(weapons));
writeFileSync(path.join(outDir, 'armor.json'), JSON.stringify(armor));
writeFileSync(path.join(outDir, 'equipment.json'), JSON.stringify(equipment));
console.log(`Wrote ${path.join(outDir, 'weapons.json')}, armor.json, and equipment.json`);

#!/usr/bin/env node
/**
 * Build-time ingest: parses a local checkout of NotEnoughUpdates-REPO
 * (https://github.com/NotEnoughUpdates/NotEnoughUpdates-REPO, MIT) into the
 * weapons/armor JSON bundles the worker ships with. Hypixel's own
 * /resources/skyblock/items is still the source of one field, upgrade_costs,
 * which NEU-REPO doesn't carry.
 *
 * NEU-REPO's item files have no structured rarity or category field, and
 * `nbttag` is stringified SNBT rather than JSON. Rarity and category live only
 * in the last non-empty line of `lore`, e.g. "§6§lLEGENDARY SWORD", so this
 * script strips colour codes from that line, matches the leading words against
 * constants/misc.json's tier_colors, and treats the rest as the category —
 * kept even when unrecognized, though only weapon and armor categories reach
 * the output.
 *
 * Runs offline rather than inside the Worker: parsing 8000+ files exceeds a
 * Worker invocation's subrequest and CPU budget. The output is committed to
 * worker/src/data/ and imported at deploy time, so re-run this and redeploy to
 * pick up NEU-REPO updates.
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

// 'GAUNTLET' is Gemstone Gauntlet's own tag word ("LEGENDARY GAUNTLET"): a mining tool held in the
// weapon slot, distinct from Gloves-slot equipment named "Gauntlet" (Demonslayer Gauntlet), which
// tags itself GLOVES or BRACELET like every other Gloves item.
const WEAPON_TYPES = ['SWORD', 'BOW', 'LONGSWORD', 'WAND', 'GAUNTLET'];
const ARMOR_TYPES = ['HELMET', 'CHESTPLATE', 'LEGGINGS', 'BOOTS'];
// Hypixel's "Equipment" gear category (Necklace/Cloak/Belt/Gloves) — a
// second, parallel armor-like slot set, not variants of HELMET etc.
// 'BRACELET' is the same Gloves slot under a different tag word — some
// Gloves-slot items (Molten Bracelet, Luminous Bracelet, etc.) use it
// instead of 'GLOVES' in their own real tag line.
const EQUIPMENT_TYPES = ['NECKLACE', 'CLOAK', 'BELT', 'GLOVES', 'BRACELET'];
// Pet items — the one held item a summoned pet can equip. Their tag line is just "<TIER> PET ITEM",
// with no category word. Scanned from the full items/ catalog like every other category here rather
// than from constants/pets.json's display-name map, which covers only 34 of the ~80 and misses
// Antique Remedies, Minos Relic and Hephaestus Remedies among others.
const PET_ITEM_CATEGORY = 'PET ITEM';

// Power Stones (combine 9 at Maxwell to unlock a Stone Power on the Accessory Bag) — same
// "<TIER> POWER STONE" trailing-lore convention as everything else here. The Power itself, its name
// and per-MP stat scaling, isn't structured data anywhere in NEU-REPO; only the stone item is, so
// that half is a hand-curated table in lib/accessoryPowers.js and this script only finds the 21
// stone items for their icon and lore.
const POWER_STONE_CATEGORY = 'POWER STONE';

// Accessory Bag items (Talismans, Rings, Artifacts, Relics): their trailing tag is always
// "<TIER> ACCESSORY" whatever the family, including dungeon drops like WITHER_RELIC's
// "LEGENDARY DUNGEON ACCESSORY", which `category.endsWith` catches as ARMOR_TYPES catches
// "DUNGEON HELMET". Needed to resolve an account's Accessory Bag contents to rarities for the live
// Magical Power calculation — see worker/src/index.js.
const ACCESSORY_TYPES = ['ACCESSORY'];

// Items that parse as a weapon or armor category but aren't player-obtainable gear: Rift NPC
// "items", whose tier is always null because they are dialogue props, and one-off cosmetic or
// quest items with no combat function.
const EXCLUDED_IDS = new Set([
  'ARGOFAY_THREEBROTHER_1_RIFT_NPC',
  'ARGOFAY_THREEBROTHER_2_RIFT_NPC',
  'ARGOFAY_THREEBROTHER_3_RIFT_NPC',
  'TIME_KNIFE', // "Time Shuriken" — Rift cosmetic throwable, not a weapon
]);

// Items whose lore matches the /rift/i scan below but are kept anyway — exceptions to that filter
// rather than to EXCLUDED_IDS above:
//   GYROKINETIC_WAND: "Create a large rift at the aimed location" describes the ability's visual
//     effect, not the Rift Dimension.
//   RIFT_NECKLACE_INSIDE / RIFT_NECKLACE_OUTSIDE: genuinely Rift gear, kept by explicit request.
// The "Rift-Transferable"/"Rift-Exportable" footnote marks any item that can be carried out of the
// Rift, which turned out to be common on ordinary Accessory Bag items, so it is filtered out of the
// scan itself below rather than allowlisted one id at a time.
const RIFT_MENTION_KEEP_IDS = new Set(['GYROKINETIC_WAND', 'RIFT_NECKLACE_INSIDE', 'RIFT_NECKLACE_OUTSIDE']);
// Matches only the footnote itself, not genuine Rift-dimension-specific lines (an ability/effect
// that only works "while in the rift", a Rift-only requirement, etc.), which should still exclude
// the item.
const RIFT_FOOTNOTE_RE = /rift-(transferable|exportable)/i;
// Some ordinary accessories (Respiration Artifact, Hocus-Pocus Cipher) carry a real, non-footnote
// Rift mention: a bonus that triggers only in the Rift, on top of stats that work everywhere.
// Hypixel's own "Works while in Accessory Bag!" line is the signal that an item is a normal
// always-on accessory rather than Rift-exclusive content — it is absent on genuine Rift-only gear —
// so it is checked before excluding on a rift mention.
const ACCESSORY_BAG_MARKER_RE = /works while in accessory bag/i;

// The inverse of EXCLUDED_IDS: player-obtainable weapons whose last lore line is a bare tier
// ("§9§lRARE") with no category word, so parseTierAndCategory finds none and they would be dropped.
// Voodoo Doll and Jinxed Voodoo Doll are Zombie Slayer weapon-slot items.
const MANUAL_CATEGORY_OVERRIDES = {
  VOODOO_DOLL: 'SWORD',
  VOODOO_DOLL_WILTED: 'SWORD',
};

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

// Star-upgrade material costs (Essence plus crafting items, such as Kuudra armor's Heavy Pearl and
// Kuudra Teeth at higher stars) are absent from NEU-REPO but present per item in Hypixel's public
// resources endpoint, keyed by the same internalname. This is the one field still pulled live
// rather than from the offline parse: one request up front, id-indexed for the main item loop.
// Per-slot gemstone type (COMBAT/DEFENSIVE/UNIVERSAL/RUBY/SAPPHIRE/JASPER/AMETHYST/ONYX/OPAL/...)
// and unlock cost (coins plus specific Flawless or Fine gems) are likewise absent from NEU-REPO and
// come from the same endpoint. A COMBAT slot accepts any of the 6 gems this app models, while a slot
// whose type is itself a gem id (Hyperion's SAPPHIRE, Giant's Sword's two JASPER slots) accepts only
// that one — see lib/gemstones.js's getAllowedGemsForSlotType. Unlock cost is per item rather than
// per slot type (Hyperion's SAPPHIRE slot is 250k + 4 Flawless Sapphire; Voidedge Katana's is 100k +
// 40 Fine Sapphire), so the whole per-slot object is kept.
console.log('Fetching upgrade_costs/gemstone_slots from Hypixel resources API...');
const upgradeCostsById = new Map();
const gemstoneSlotsById = new Map();
try {
  const res = await fetch('https://api.hypixel.net/v2/resources/skyblock/items');
  const data = await res.json();
  for (const it of data.items || []) {
    if (Array.isArray(it.upgrade_costs) && it.upgrade_costs.length > 0) {
      upgradeCostsById.set(it.id, it.upgrade_costs);
    }
    if (Array.isArray(it.gemstone_slots) && it.gemstone_slots.length > 0) {
      gemstoneSlotsById.set(it.id, it.gemstone_slots);
    }
  }
  console.log(`Fetched upgrade_costs for ${upgradeCostsById.size} items, gemstone_slots for ${gemstoneSlotsById.size} items.`);
} catch (err) {
  console.error('Failed to fetch upgrade_costs/gemstone_slots (continuing without star-cost/gemstone-slot data):', err);
}

const weapons = [];
const armor = [];
const equipment = [];
const petItems = [];
const powerStones = [];
const accessories = [];
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

  // Rift-dimension items (Rift Damage, Rift Time, Rift Gallery): their stat lines only matter inside
  // the Rift, a mode this calculator doesn't model, so they are dead weight in every picker.
  // Text-scanned rather than an id list, so future Rift items are caught automatically. The
  // Rift-Transferable footnote doesn't count (RIFT_FOOTNOTE_RE), nor does a rift mention on an item
  // carrying the "Works while in Accessory Bag!" tag (ACCESSORY_BAG_MARKER_RE).
  if (
    !RIFT_MENTION_KEEP_IDS.has(raw.internalname) &&
    !raw.lore.some((line) => ACCESSORY_BAG_MARKER_RE.test(line)) &&
    raw.lore.some((line) => !RIFT_FOOTNOTE_RE.test(line) && /rift/i.test(line))
  )
    continue;

  let { tier, category } = parseTierAndCategory(raw.lore);
  if (!category && MANUAL_CATEGORY_OVERRIDES[raw.internalname]) {
    category = MANUAL_CATEGORY_OVERRIDES[raw.internalname];
  }
  if (!category) continue;

  const isWeapon = WEAPON_TYPES.some((t) => category.endsWith(t));
  const isArmor = !isWeapon && ARMOR_TYPES.some((t) => category.endsWith(t));
  // Equipment additionally requires a parsed tier: one Rift NPC dialogue item's last lore line ends
  // "...AND THE SILKRIDER SAFETY BELT", a sentence rather than a rarity tag, which would otherwise
  // false-positive as a BELT. Real equipment always has a tier; dialogue text doesn't.
  const isEquipment = !isWeapon && !isArmor && tier && EQUIPMENT_TYPES.some((t) => category.endsWith(t));
  const isPetItem = !isWeapon && !isArmor && !isEquipment && tier && category === PET_ITEM_CATEGORY;
  const isPowerStone = !isWeapon && !isArmor && !isEquipment && !isPetItem && tier && category === POWER_STONE_CATEGORY;
  const isAccessory =
    !isWeapon && !isArmor && !isEquipment && !isPetItem && !isPowerStone && tier && ACCESSORY_TYPES.some((t) => category.endsWith(t));
  if (!isWeapon && !isArmor && !isEquipment && !isPetItem && !isPowerStone && !isAccessory) continue;

  if (isPetItem) {
    // Pet items have no slot-matching `category` concept — there is only ever one pet-item slot.
    petItems.push({
      id: raw.internalname,
      name: stripColorCodes(raw.displayname || raw.internalname || ''),
      material: materialFromItemId(raw.itemid),
      tier,
      lore: raw.lore,
    });
    continue;
  }

  if (isPowerStone) {
    powerStones.push({
      id: raw.internalname,
      name: stripColorCodes(raw.displayname || raw.internalname || ''),
      material: materialFromItemId(raw.itemid),
      tier,
      lore: raw.lore,
    });
    continue;
  }

  if (isAccessory) {
    // Only rarity, for the live Magical Power calculation, and name/material for rendering matter
    // here — there is no category breakdown, since every accessory shares the bare "ACCESSORY" tag.
    accessories.push({
      id: raw.internalname,
      name: stripColorCodes(raw.displayname || raw.internalname || ''),
      material: materialFromItemId(raw.itemid),
      tier,
      lore: raw.lore,
    });
    continue;
  }

  const item = {
    id: raw.internalname,
    name: stripColorCodes(raw.displayname || raw.internalname || ''),
    material: materialFromItemId(raw.itemid),
    category,
    tier,
    lore: raw.lore,
  };
  // Only weapon and armor slots take stars (optimizer.js's evaluateStarsCandidates), so this is
  // omitted on equipment items rather than bloating equipment.json with a field nothing reads.
  if ((isWeapon || isArmor) && upgradeCostsById.has(raw.internalname)) {
    item.upgrade_costs = upgradeCostsById.get(raw.internalname);
  }
  // Same weapon/armor-only scope as upgrade_costs above: equipment has no gemstone sockets.
  if ((isWeapon || isArmor) && gemstoneSlotsById.has(raw.internalname)) {
    item.gemstone_slots = gemstoneSlotsById.get(raw.internalname);
  }

  if (isWeapon) weapons.push(item);
  else if (isArmor) armor.push(item);
  else equipment.push(item);
}

console.log(`weapons: ${weapons.length}`);
console.log(`armor: ${armor.length}`);
console.log(`equipment: ${equipment.length}`);
console.log(`pet items: ${petItems.length}`);
console.log(`power stones: ${powerStones.length}`);
console.log(`accessories: ${accessories.length}`);
console.log(`skipped (no lore): ${skippedNoLore}`);
console.log(`parse errors: ${parseErrors}`);

const outDir = path.join(__dirname, '..', 'src', 'data');
writeFileSync(path.join(outDir, 'weapons.json'), JSON.stringify(weapons));
writeFileSync(path.join(outDir, 'armor.json'), JSON.stringify(armor));
writeFileSync(path.join(outDir, 'equipment.json'), JSON.stringify(equipment));
writeFileSync(path.join(outDir, 'petItems.json'), JSON.stringify(petItems));
writeFileSync(path.join(outDir, 'powerStones.json'), JSON.stringify(powerStones));
writeFileSync(path.join(outDir, 'accessories.json'), JSON.stringify(accessories));
console.log(`Wrote ${path.join(outDir, 'weapons.json')}, armor.json, equipment.json, petItems.json, powerStones.json, and accessories.json`);

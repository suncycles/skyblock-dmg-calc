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

// 'GAUNTLET' is Gemstone Gauntlet's own real tag word ("LEGENDARY GAUNTLET") — a mining tool
// held in the weapon slot, distinct from Gloves-slot "Gauntlet"-named equipment (Demonslayer
// Gauntlet etc.), which tags itself GLOVES/BRACELET like every other Gloves item and is
// unaffected by this addition (verified: no armor.json/equipment.json entry uses category
// GAUNTLET).
const WEAPON_TYPES = ['SWORD', 'BOW', 'LONGSWORD', 'WAND', 'GAUNTLET'];
const ARMOR_TYPES = ['HELMET', 'CHESTPLATE', 'LEGGINGS', 'BOOTS'];
// Hypixel's "Equipment" gear category (Necklace/Cloak/Belt/Gloves) — a
// second, parallel armor-like slot set, not variants of HELMET etc.
// 'BRACELET' is the same Gloves slot under a different tag word — some
// Gloves-slot items (Molten Bracelet, Luminous Bracelet, etc.) use it
// instead of 'GLOVES' in their own real tag line.
const EQUIPMENT_TYPES = ['NECKLACE', 'CLOAK', 'BELT', 'GLOVES', 'BRACELET'];
// Pet items (the one held item a summoned pet can equip) — their tag line
// is just "<TIER> PET ITEM" with no further category word, unlike the
// others above. Previously hand-maintained as a ~34-entry hardcoded list
// fetched live by the Worker (see worker/src/index.js's old
// PET_ITEM_IDS), sourced from constants/pets.json's
// pet_item_display_name_to_id map — which turned out to only cover 34 of
// the real ~80, missing e.g. Antique Remedies/Minos Relic/Hephaestus
// Remedies entirely. Scanning the full items/ catalog like every other
// category here instead finds all of them and can't silently drift stale.
const PET_ITEM_CATEGORY = 'PET ITEM';

// Power Stones (combine 9x at Maxwell/Thaumaturgist to unlock a Stone
// Power on the Accessory Bag) — same "<TIER> POWER STONE" trailing-lore
// convention as everything else here, verified against real NEU-REPO
// files (e.g. ACACIA_BIRDHOUSE.json ends "§9§lRARE POWER STONE"). The
// Power itself (name, per-MP stat scaling) isn't structured data
// anywhere in NEU-REPO — only the physical stone item is — so that part
// is a small hand-curated table in the frontend (lib/accessoryPowers.js),
// sourced directly from the wiki; this script only needs to find the 21
// real stone items for their icon/lore.
const POWER_STONE_CATEGORY = 'POWER STONE';

// Accessory Bag items (Talismans/Rings/Artifacts/Relics) — their trailing lore tag is always
// "<TIER> ACCESSORY" regardless of the item's own display name/family (verified against several
// real files, including dungeon-drop ones like WITHER_RELIC's "LEGENDARY DUNGEON ACCESSORY" —
// `category.endsWith` catches that the same way ARMOR_TYPES catches "DUNGEON HELMET"). Needed to
// resolve a player's real Accessory Bag contents (member.inventory.bag_contents.talisman_bag) to
// a rarity for the live Magical Power calc — see worker/src/index.js.
const ACCESSORY_TYPES = ['ACCESSORY'];

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

// Items whose lore matches the /rift/i scan below but are kept anyway — exceptions to that
// filter, not to EXCLUDED_IDS above:
//   GYROKINETIC_WAND: "Create a large rift at the aimed location" — a lowercase common noun
//     describing the ability's visual effect (a spatial tear), not the Rift Dimension game mode.
//   RIFT_NECKLACE_INSIDE / RIFT_NECKLACE_OUTSIDE: genuinely Rift-dimension gear — kept by
//     explicit user request regardless (unlike GYROKINETIC_WAND above, a real scan hit, not a
//     false positive).
// The "Rift-Transferable"/"Rift-Exportable" drop-mechanic footnote (any item that CAN be carried
// out of the Rift gets this tag) used to only need a couple of one-off entries here (see below),
// but turned out to be common enough on ordinary Accessory Bag items (10+ real talismans found
// on one live test account alone, e.g. Scarf's Grimoire, Vampire Dentist Relic, Future Calories
// Talisman) that hand-allowlisting each one doesn't scale — filtered out of the scan itself
// instead, below.
const RIFT_MENTION_KEEP_IDS = new Set(['GYROKINETIC_WAND', 'RIFT_NECKLACE_INSIDE', 'RIFT_NECKLACE_OUTSIDE']);
// Matches only the footnote itself, not genuine Rift-dimension-specific lines (an ability/effect
// that only works "while in the rift", a Rift-only requirement, etc.), which should still exclude
// the item.
const RIFT_FOOTNOTE_RE = /rift-(transferable|exportable)/i;
// A handful of ordinary accessories (Respiration Artifact, Hocus-Pocus Cipher, ...) have a real,
// non-footnote Rift mention too — a bonus effect that only triggers while in the Rift, on top of
// stats/an Accessory Power that work everywhere. Hypixel's own "Works while in Accessory Bag!"
// line is the authoritative signal that an item is a normal always-on accessory rather than
// Rift-exclusive content (confirmed absent on genuine Rift-only gear like RIFT_NECKLACE_INSIDE) —
// checked before excluding on a rift mention, same rescue as RIFT_MENTION_KEEP_IDS but driven by
// the item's own real text instead of a hand-maintained id list.
const ACCESSORY_BAG_MARKER_RE = /works while in accessory bag/i;

// Inverse of EXCLUDED_IDS: real player-obtainable weapons whose last lore line is just the bare
// tier (e.g. "§9§lRARE") with no trailing category word, so parseTierAndCategory finds no
// category and they'd otherwise be silently dropped. Voodoo Doll/Jinxed Voodoo Doll are
// Zombie Slayer weapon-slot items, verified directly against their real NEU-REPO item files.
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

  // Rift-dimension items (Rift Damage/Rift Time/Rift Gallery etc.) — their whole stat line only
  // matters inside the Rift, a separate game mode this calculator doesn't model at all, so
  // they're dead weight in every picker. Text-scanned rather than a hardcoded id list so any
  // future Rift item NEU-REPO adds is caught automatically. The Rift-Transferable/-Exportable
  // footnote line itself doesn't count (see RIFT_FOOTNOTE_RE above) — it means the opposite of
  // Rift-exclusive. Nor does any other rift mention on an item carrying the real "Works while in
  // Accessory Bag!" tag (see ACCESSORY_BAG_MARKER_RE above).
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
  // Equipment additionally requires a real tier: unlike weapon/armor
  // (where every category-matching file so far has genuinely been real
  // gear), one Rift NPC dialogue item's last lore line happens to end in
  // "...AND THE SILKRIDER SAFETY BELT" — a sentence, not a rarity tag —
  // and would otherwise false-positive as a BELT. A real equipment item
  // always has a parsed tier; dialogue text doesn't.
  const isEquipment = !isWeapon && !isArmor && tier && EQUIPMENT_TYPES.some((t) => category.endsWith(t));
  const isPetItem = !isWeapon && !isArmor && !isEquipment && tier && category === PET_ITEM_CATEGORY;
  const isPowerStone = !isWeapon && !isArmor && !isEquipment && !isPetItem && tier && category === POWER_STONE_CATEGORY;
  const isAccessory =
    !isWeapon && !isArmor && !isEquipment && !isPetItem && !isPowerStone && tier && ACCESSORY_TYPES.some((t) => category.endsWith(t));
  if (!isWeapon && !isArmor && !isEquipment && !isPetItem && !isPowerStone && !isAccessory) continue;

  if (isPetItem) {
    // Pet items have no slot-matching `category` concept (there's only
    // ever one pet-item slot) and no consumer needs one — matches the
    // shape the old live-fetch code produced.
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
    // Only rarity (for the live Magical Power calc) and name/material (in case a future picker
    // wants to render one) matter here — no `category` breakdown the way weapons/armor get one,
    // since every accessory shares the single bare "ACCESSORY" tag regardless of family.
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

// Inline SVG fallback so a broken icon never depends on a third-party host.
export const FALLBACK_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' fill='%23707070'/%3E%3Ctext x='12' y='17' font-size='14' text-anchor='middle' fill='%23ddd'%3E%3F%3C/text%3E%3C/svg%3E";

// Minecraft's item ids occasionally diverge from our icon file names
// (e.g. the shovel item id is historically "SPADE"); map known cases here.
const MATERIAL_ALIASES = { SPADE: 'SHOVEL' };

// Local icons are stored Title_Cased (e.g. "Diamond_Sword.png"), while the
// worker normalizes NEU-REPO's namespaced itemid ("minecraft:diamond_sword")
// to upper snake case ("DIAMOND_SWORD") before this ever sees it.
export function getWeaponIcon(material) {
  if (!material) return '/images/default.png';
  const normalized = material
    .toUpperCase()
    .split('_')
    .map((part) => MATERIAL_ALIASES[part] || part)
    .join('_');
  const titleCased = normalized
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('_');
  return `/images/${titleCased}.png`;
}

// A subset of items have bespoke SkyBlock art in Hypixel's official resource
// pack (https://api.hypixel.net/v2/resources/packs), keyed by the item's
// internal id (e.g. "ASPECT_OF_THE_VOID") rather than its vanilla material —
// most items don't have one and should fall back to getWeaponIcon(material).
// See worker/scripts/apply-hypixel-textures.mjs for how these were extracted.
export function getSkyblockIcon(id) {
  if (!id) return null;
  return `/images/skyblock/${id.toUpperCase()}.png`;
}

// Real per-gem, per-tier gemstone art, also pulled from the Hypixel
// resource pack (textures/item/collections/gemstone/{gem}/{tier}_{gem}_gem.png
// in-pack) — see worker/scripts/apply-hypixel-textures.mjs.
export function getGemstoneIcon(gemId, tier) {
  if (!gemId || !tier) return null;
  return `/images/gemstones/${gemId.toUpperCase()}_${tier.toUpperCase()}.png`;
}

// Each reforge STONE item (Dragon Claw, Wither Blood, etc. — see
// worker/src/index.js's fetchReforgeStones) gets its own icon here, keyed
// by its internal id lowercased (e.g. "DRAGON_CLAW" -> dragon_claw.png).
// These aren't in the Hypixel resource pack subset this project bundles,
// so they're added manually rather than extracted — callers should fall
// back to CATEGORY_ICONS.Reforges (onError) for any not yet added.
export function getReforgeStoneIcon(stoneId) {
  if (!stoneId) return null;
  return `/images/reforgestones/${stoneId.toLowerCase()}.png`;
}

// Chest-inventory chrome shared by every grid page (Hex, enchant/gemstone
// pickers): vanilla glass panes standing in for "empty"/"filler" slots and
// a Barrier for "close", styled to read as a real Minecraft chest GUI.
export const SLOT_TEXTURES = {
  empty: '/images/Gray_Stained_Glass_Pane.png',
  filler: '/images/Magenta_Stained_Glass_Pane.png',
  close: '/images/Barrier.png',
  // Lighter than the inert `empty` background pane — marks a real,
  // clickable "add a gemstone here" slot on the Gemstones page.
  emptyGemSlot: '/images/Light_Gray_Stained_Glass_Pane.png',
};

// Icons for the Hex screen's category buttons. Recombobulator 3000 and
// Luxurious Spool and Dragon Essence are Hypixel custom player-head items
// (itemid "minecraft:skull") with no resource-pack texture of their own —
// their icon is a real player-skin texture referenced from NEU-REPO's item
// NBT, cropped to the 8x8 UV region that actually holds their art (the hat
// overlay layer for Recombobulator/Dragon Essence, the base head layer for
// Luxurious Spool — checked each individually, they aren't consistent).
export const CATEGORY_ICONS = {
  Enchantments: '/images/Enchanting_Table.png',
  'Ultimate Enchantments': '/images/Book_and_Quill.png',
  Gemstones: '/images/gemstones/RUBY_PERFECT.png',
  Books: '/images/Book.png',
  Modifiers: '/images/Recombobulator_3000.png',
  Reforges: '/images/Luxurious_Spool.png',
  'Item Upgrades': '/images/Dragon_Essence.png',
  // Weapon-specific ability mechanics (Daedalus Blade, Midas' Sword/Staff,
  // Emerald Blade) — only shown for the handful of weapons that have one.
  Special: '/images/Nether_Star.png',
};

export const ENCHANTED_BOOK_ICON = '/images/Enchanted_Book.png';

// The Art of War's own NEU item material is "minecraft:book" — same as the
// Hot/Fuming Potato Book slots it sits alongside on the Books screen — so
// Book_and_Quill.png (already bundled, used elsewhere for Ultimate
// Enchantments) stands in here instead, purely so the one-time toggle
// reads as visually distinct from the 15 numbered Potato Book slots.
export const ART_OF_WAR_ICON = '/images/Book_and_Quill.png';

// Opens the Blacksmith sub-screen from the Reforges (stones) page — an
// anvil is the blacksmith's tool, not a reforge stone's.
export const ANVIL_ICON = '/images/Anvil.png';

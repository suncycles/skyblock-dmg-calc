// Inline SVG fallback so a broken icon never depends on a third-party host.
export const FALLBACK_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' fill='%23707070'/%3E%3Ctext x='12' y='17' font-size='14' text-anchor='middle' fill='%23ddd'%3E%3F%3C/text%3E%3C/svg%3E";

// A few item ids diverge from the icon file names (e.g. shovel's real id is "SPADE").
const MATERIAL_ALIASES = { SPADE: 'SHOVEL' };

// Local icons are stored Title_Cased (e.g. "Diamond_Sword.png"); the worker already
// normalizes NEU-REPO's namespaced itemid to upper snake case before this sees it.
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

// Bespoke SkyBlock art from Hypixel's resource pack, keyed by item id — falls back to getWeaponIcon(material) if none exists.
export function getSkyblockIcon(id) {
  if (!id) return null;
  return `/images/skyblock/${id.toUpperCase()}.png`;
}

// Real per-gem, per-tier gemstone art from the Hypixel resource pack.
export function getGemstoneIcon(gemId, tier) {
  if (!gemId || !tier) return null;
  return `/images/gemstones/${gemId.toUpperCase()}_${tier.toUpperCase()}.png`;
}

// Reforge stone icons, added manually (not in the bundled resource-pack subset) — falls back to CATEGORY_ICONS.Reforges if missing.
export function getReforgeStoneIcon(stoneId) {
  if (!stoneId) return null;
  return `/images/reforgestones/${stoneId.toLowerCase()}.png`;
}

// A plain left-pointing chevron (black outline, white fill) — reads as "go back" rather than
// the Barrier block's "forbidden" connotation, and stays legible on the grey slot background.
const BACK_ARROW_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath d='M21 4 L10 16 L21 28' fill='none' stroke='black' stroke-width='7' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M21 4 L10 16 L21 28' fill='none' stroke='white' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

// Chest-inventory chrome shared by every grid page: glass panes for "empty"/"filler" slots, a back arrow for "close".
export const SLOT_TEXTURES = {
  empty: '/images/Gray_Stained_Glass_Pane.png',
  filler: '/images/Magenta_Stained_Glass_Pane.png',
  close: BACK_ARROW_ICON,
  emptyGemSlot: '/images/Light_Gray_Stained_Glass_Pane.png',
};

// Icons for the item-detail screen's category buttons.
export const CATEGORY_ICONS = {
  Enchantments: '/images/Enchanting_Table.png',
  'Ultimate Enchantments': '/images/Book_and_Quill.png',
  Gemstones: '/images/gemstones/RUBY_PERFECT.png',
  Books: '/images/Book.png',
  Modifiers: '/images/Recombobulator_3000.png',
  Reforges: '/images/Luxurious_Spool.png',
  'Item Upgrades': '/images/Dragon_Essence.png',
  Special: '/images/Nether_Star.png',
};

export const ENCHANTED_BOOK_ICON = '/images/Enchanted_Book.png';

// Shared placeholder icon for the Art of War/Art of Peace one-time toggles.
export const ART_OF_WAR_ICON = '/images/Book_and_Quill.png';

export const ANVIL_ICON = '/images/Anvil.png';

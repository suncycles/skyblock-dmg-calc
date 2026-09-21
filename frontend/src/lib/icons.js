// Inline SVG fallback so a broken icon never depends on a third-party host.
export const FALLBACK_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' fill='%23707070'/%3E%3Ctext x='12' y='17' font-size='14' text-anchor='middle' fill='%23ddd'%3E%3F%3C/text%3E%3C/svg%3E";

// A few item ids diverge from the icon file names (e.g. shovel's real id is "SPADE").
const MATERIAL_ALIASES = { SPADE: 'SHOVEL' };

// Local icons are stored Title_Cased (e.g. "Diamond_Sword.webp"); the worker already
// normalizes NEU-REPO's namespaced itemid to upper snake case before this sees it.
export function getWeaponIcon(material) {
  if (!material) return '/images/vanilla/default.webp';
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
  return `/images/vanilla/${titleCased}.webp`;
}

// Bespoke SkyBlock art from Hypixel's resource pack, keyed by item id - falls back to getWeaponIcon(material) if none exists.
export function getSkyblockIcon(id) {
  if (!id) return null;
  return `/images/skyblock/${id.toUpperCase()}.webp`;
}

// Hand-provided override for ids the automated bake pipeline can't produce a real render for
// (see worker/scripts/apply-skull-head-icons.mjs's saveHeadRender and
// frontend/public/images/manual/README.md) - checked before the auto-baked skyblock icon.
export function getManualIcon(id) {
  if (!id) return null;
  return `/images/manual/${id.toUpperCase()}.webp`;
}

// Real per-gem, per-tier gemstone art from the Hypixel resource pack.
export function getGemstoneIcon(gemId, tier) {
  if (!gemId || !tier) return null;
  return `/images/gemstones/${gemId.toUpperCase()}_${tier.toUpperCase()}.webp`;
}

// Reforge stone icons, added manually (not in the bundled resource-pack subset) - falls back to CATEGORY_ICONS.Reforges if missing.
export function getReforgeStoneIcon(stoneId) {
  if (!stoneId) return null;
  return `/images/reforgestones/${stoneId.toLowerCase()}.webp`;
}

// Chest-inventory chrome shared by every grid page: glass panes for "empty"/"filler" slots, a Barrier for "close".
export const SLOT_TEXTURES = {
  empty: '/images/vanilla/Gray_Stained_Glass_Pane.webp',
  filler: '/images/vanilla/Magenta_Stained_Glass_Pane.webp',
  close: '/images/vanilla/Barrier.webp',
  emptyGemSlot: '/images/vanilla/Light_Gray_Stained_Glass_Pane.webp',
};

// Icons for the item-detail screen's category buttons.
export const CATEGORY_ICONS = {
  Enchantments: '/images/vanilla/Enchanting_Table.webp',
  'Ultimate Enchantments': '/images/vanilla/Book_and_Quill.webp',
  Gemstones: '/images/gemstones/RUBY_PERFECT.webp',
  Books: '/images/vanilla/Book.webp',
  Modifiers: '/images/vanilla/Recombobulator_3000.webp',
  Reforges: '/images/vanilla/Luxurious_Spool.webp',
  'Item Upgrades': '/images/vanilla/Dragon_Essence.webp',
  Special: '/images/vanilla/Nether_Star.webp',
  Clean: '/images/vanilla/Sponge.webp',
};

export const ENCHANTED_BOOK_ICON = '/images/vanilla/Enchanted_Book.webp';

// Shared placeholder icon for the Art of War/Art of Peace one-time toggles.
export const ART_OF_WAR_ICON = '/images/vanilla/Book_and_Quill.webp';

export const ANVIL_ICON = '/images/vanilla/Anvil.webp';

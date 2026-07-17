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

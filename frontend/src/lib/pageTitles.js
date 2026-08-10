// Maps the current route to a short human label for the global TopBar (see components/TopBar.jsx).
// Deliberately generic/static — per-item detail (a specific weapon or pet name) stays on the
// page's own content, not duplicated up here. Ordered so more specific patterns are tested first
// (e.g. the blacksmith reforge route before the plain one).
const ROUTES = [
  [/^\/weapon$/, 'Choose Weapon'],
  [/^\/armor\/[^/]+\/variant\/[^/]+$/, 'Choose Tier'],
  [/^\/armor\/[^/]+$/, 'Choose Armor'],
  [/^\/equipment\/[^/]+$/, 'Choose Equipment'],
  [/^\/pet\/detail$/, 'Pet'],
  [/^\/pet\/item$/, 'Pet Item'],
  [/^\/pet\/[^/]+$/, 'Choose Rarity'],
  [/^\/pet$/, 'Choose Pet'],
  [/^\/hex\/[^/]+$/, 'Item Menu'],
  [/^\/enchants\/[^/]+$/, 'Enchantments'],
  [/^\/ultimate-enchants\/[^/]+$/, 'Ultimate Enchantments'],
  [/^\/enchant-levels\/[^/]+\/[^/]+$/, 'Enchant Level'],
  [/^\/gemstones\/[^/]+\/[^/]+\/[^/]+$/, 'Gemstone Tier'],
  [/^\/gemstones\/[^/]+\/[^/]+$/, 'Choose Gemstone'],
  [/^\/gemstones\/[^/]+$/, 'Gemstones'],
  [/^\/books\/[^/]+$/, 'Books'],
  [/^\/reforges\/[^/]+\/blacksmith$/, 'Blacksmith'],
  [/^\/reforges\/[^/]+$/, 'Reforges'],
  [/^\/special\/[^/]+$/, 'Special'],
  [/^\/stars\/[^/]+$/, 'Item Upgrades'],
  [/^\/damage-sources$/, 'Damage Sources'],
  [/^\/compare$/, 'Compare'],
  [/^\/accessory\/tuning$/, 'Stat Tuning'],
  [/^\/accessory$/, 'Accessory Powers'],
  [/^\/player-levels$/, 'Player Levels'],
  [/^\/target-mob$/, 'Target Mobs'],
  [/^\/attributes$/, 'Attributes'],
  [/^\/loadout\/[^/]+$/, 'Shared Loadout'],
  [/^\/hypixel-import$/, 'Hypixel Import'],
  [/^\/credits$/, 'Credits'],
  [/^\/guides$/, 'Guides'],
  [/^\/tutorial$/, 'Tutorial'],
  [/^\/examples$/, 'Examples'],
  [/^\/resources$/, 'Resources'],
];

// Returns null for "/" (Landing) — the TopBar just shows the bare brand there.
export function getPageLabel(pathname) {
  for (const [pattern, label] of ROUTES) {
    if (pattern.test(pathname)) return label;
  }
  return null;
}

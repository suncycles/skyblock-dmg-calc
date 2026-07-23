// God Potion — a simple on/off toggle (not a picker/GUI), grants the max
// tier of a large assortment of potions for its duration. Real per-tier
// values sourced directly from the wiki's raw wikitext this session (not
// guessed): https://hypixel-skyblock.fandom.com/wiki/God_Potion for the
// effect list, then each linked potion's own page for its exact number
// at the tier God Potion grants:
//   Strength VIII      -> +75 Strength      (Strength_Potion)
//   Critical IV         -> +25% Crit Chance, +40% Crit Damage (Critical_Potion)
//   Spirit IV            -> +40 Speed (untracked), +40% Crit Damage (Spirit_Potion)
//   Archery IV           -> +75% bow damage, bow weapons only (Archery_Potion)
//   Jerry Candy          -> +100 Health, +20 Strength, +2 Ferocity,
//                            +100 Intelligence, +3 Magic Find (listed
//                            directly on the God Potion page itself)
//
// This app's base-stat tracking (lib/damageSources.js's `baseStats`) only
// aggregates Damage/Strength/Crit Chance/Crit Damage — Health/Ferocity/
// Intelligence/Magic Find/Defense/True Defense/Speed have no aggregate
// total anywhere in this app (individual item tooltips show them, but
// nothing sums them loadout-wide), so only the Strength/Crit Chance/Crit
// Damage pieces of the above are wired into Damage Sources; Jerry
// Candy's Health/Ferocity/Intelligence/Magic Find have nothing to add to.
// The other ~25 effects God Potion grants (Regeneration, Agility, Night
// Vision, Absorption, Burning, Stun, Dodge, Experience, Mana, Speed,
// Water Breathing, the 6 skill XP boosts, Rabbit, Resistance, Jump
// Boost, Magic Find, Pet Luck, Spelunker, Adrenaline, Fire
// Resistance, Haste, True Resistance) don't correspond to anything this
// damage calculator tracks either, so they're intentionally not modeled.

export const GOD_POTION_STRENGTH_POTION = 75; // Strength Potion VIII
export const GOD_POTION_CRIT_CHANCE = 25; // Critical Potion IV
export const GOD_POTION_CRIT_DAMAGE = 40; // Critical Potion IV
export const GOD_POTION_SPIRIT_CRIT_DAMAGE = 40; // Spirit Potion IV
export const GOD_POTION_ARCHERY_DAMAGE = 75; // Archery Potion IV, bow weapons only

export const JERRY_CANDY_STRENGTH = 20;
// Not wired into baseStats — no aggregate Health/Ferocity/Intelligence/
// Magic Find total exists anywhere in this app to add them to (see file
// header). Kept here for completeness/reference.
export const JERRY_CANDY_HEALTH = 100;
export const JERRY_CANDY_FEROCITY = 2;
export const JERRY_CANDY_INTELLIGENCE = 100;
export const JERRY_CANDY_MAGIC_FIND = 3;

const BOW_CATEGORIES = new Set(['BOW', 'DUNGEON BOW']);

export function isBowEquipped(loadout) {
  return !!loadout.weapon && BOW_CATEGORIES.has((loadout.weapon.item.category || '').toUpperCase());
}

// Tooltip shown on hover — real Minecraft §-formatted lines, same
// convention as every other hover tooltip in this app.
export const GOD_POTION_TOOLTIP_LINES = [
  '§d§lGod Potion',
  '§7Grants the max tier of a large',
  '§7assortment of positive potions.',
  '',
  '§7Only effects this calculator tracks:',
  `§7Strength: §c+${GOD_POTION_STRENGTH_POTION + JERRY_CANDY_STRENGTH}`,
  `§7Crit Chance: §9+${GOD_POTION_CRIT_CHANCE}%`,
  `§7Crit Damage: §9+${GOD_POTION_CRIT_DAMAGE + GOD_POTION_SPIRIT_CRIT_DAMAGE}%`,
  `§7Bow Damage: §a+${GOD_POTION_ARCHERY_DAMAGE}% §7(bow equipped only)`,
];

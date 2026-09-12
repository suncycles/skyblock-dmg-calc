// God Potion — a simple on/off toggle, grants the max tier of a large assortment of potions.
// Real per-tier values:
//   Strength VIII  -> +75 Strength
//   Critical IV    -> +25% Crit Chance, +40% Crit Damage
//   Spirit IV      -> +40 Speed (untracked), +40% Crit Damage
//   Archery IV     -> +75% bow damage, bow weapons only
//   Jerry Candy    -> +100 Health, +20 Strength, +2 Ferocity, +100 Intelligence, +3 Magic Find
//
// Only the Strength/Crit Chance/Crit Damage pieces are wired into Damage Sources — this app
// has no aggregate total for Health/Ferocity/Intelligence/Magic Find/Defense/True
// Defense/Speed anywhere. God Potion's ~25 other effects (Regeneration, skill XP boosts,
// etc.) don't correspond to anything this calculator tracks and aren't modeled.

export const GOD_POTION_STRENGTH_POTION = 78.75; // Strength Potion VIII
export const GOD_POTION_CRIT_CHANCE = 25; // Critical Potion IV
export const GOD_POTION_CRIT_DAMAGE = 40; // Critical Potion IV
export const GOD_POTION_SPIRIT_CRIT_DAMAGE = 40; // Spirit Potion IV
export const GOD_POTION_ARCHERY_DAMAGE = 75; // Archery Potion IV, bow weapons only

export const JERRY_CANDY_STRENGTH = 20;
// Not wired into baseStats — no aggregate total exists for these anywhere in this app.
export const JERRY_CANDY_HEALTH = 100;
export const JERRY_CANDY_FEROCITY = 2;
export const JERRY_CANDY_INTELLIGENCE = 100;
export const JERRY_CANDY_MAGIC_FIND = 3;

// Mixins add a real, extra effect on top of the base God Potion (still one potion/one toggle) —
// user-scoped to just the one this app tracks a stat for.
export const GOD_POTION_MIXINS = {
  none: { label: 'None' },
  spider_egg: { label: 'Spider Egg', critDamage: 15 },
};
export function godPotionMixinCritDamage(mixin) {
  return GOD_POTION_MIXINS[mixin]?.critDamage || 0;
}

// Inside a dungeon the God Potion is replaced outright by the Dungeon Potion — not stacked with
// it, and not a scaled version of it: different stats, and weaker across the board except that the
// arrow bonus survives (user-specified 2026-09-11). Two tiers, and which one applies is decided by
// whether the account owns a Jellyfish pet rather than by anything the player drinks.
export const DUNGEON_POTION_TIERS = {
  tier7: { label: 'Tier VII', strength: 40, critChance: 20, critDamage: 30, arrowDamage: 50 },
  jellyfish: { label: 'Jellyfish VII', strength: 60, critChance: 30, critDamage: 45, arrowDamage: 75 },
};

// The tier the player actually gets. Ownership, not the equipped pet: a Jellyfish sitting in the
// pet menu still upgrades the potion, so this must not read loadout.pet.
export function dungeonPotionTierKey(hasJellyfishPet) {
  return hasJellyfishPet ? 'jellyfish' : 'tier7';
}

export function dungeonPotionEffects(hasJellyfishPet) {
  return DUNGEON_POTION_TIERS[dungeonPotionTierKey(hasJellyfishPet)];
}

export function getDungeonPotionTooltipLines(hasJellyfishPet) {
  const tier = dungeonPotionEffects(hasJellyfishPet);
  const lines = [
    '§b§lDungeon Potion',
    `§7${tier.label}${hasJellyfishPet ? '' : ' §8(a Jellyfish pet upgrades this)'}`,
    '',
    `§7Strength: §c+${tier.strength}`,
    `§7Crit Chance: §9+${tier.critChance}%`,
    `§7Crit Damage: §9+${tier.critDamage}%`,
    `§7Bow Damage: §a+${tier.arrowDamage}% §7(bow equipped only)`,
  ];
  if (!hasJellyfishPet) {
    const jelly = DUNGEON_POTION_TIERS.jellyfish;
    lines.push('', `§8With a Jellyfish pet: §7+${jelly.strength} Str, +${jelly.critChance}% CC, +${jelly.critDamage}% CD, +${jelly.arrowDamage}% bow`);
  }
  return lines;
}

const BOW_CATEGORIES = new Set(['BOW', 'DUNGEON BOW']);

export function isBowEquipped(loadout) {
  return !!loadout.weapon && BOW_CATEGORIES.has((loadout.weapon.item.category || '').toUpperCase());
}

export function getGodPotionTooltipLines(mixin) {
  const mixinCritDamage = godPotionMixinCritDamage(mixin);
  const lines = [
    '§d§lGod Potion',
    '§7Grants the max tier of a large',
    '§7assortment of positive potions.',
    '',
    '§7Only effects this calculator tracks:',
    `§7Strength: §c+${GOD_POTION_STRENGTH_POTION + JERRY_CANDY_STRENGTH}`,
    `§7Crit Chance: §9+${GOD_POTION_CRIT_CHANCE}%`,
    `§7Crit Damage: §9+${GOD_POTION_CRIT_DAMAGE + GOD_POTION_SPIRIT_CRIT_DAMAGE + mixinCritDamage}%`,
    `§7Bow Damage: §a+${GOD_POTION_ARCHERY_DAMAGE}% §7(bow equipped only)`,
  ];
  if (mixinCritDamage) lines.push(`§7Mixin: §d${GOD_POTION_MIXINS[mixin].label} §7(+${mixinCritDamage}% Crit Damage)`);
  return lines;
}

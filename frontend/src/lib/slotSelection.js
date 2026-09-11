// What equipping an item into a slot really produces — the trimmed item record and the modifiers
// that survive the swap. Extracted from BuildContext's selectItem (2026-09-11) so the live UI and
// lib/applyResult.js's pure planner apply share ONE implementation of these rules rather than two
// that drift. Everything here is a pure function of its arguments: no React, no storage, no refs.

import { emptyModifiers, emptyPetModifiers, emptyAccessoryModifiers } from './defaultModifiers';
import { MASTER_STAR_MIN_BASE_STARS, getMaxStarsForItem } from './starring';
import { getMaxPetLevel, SHINING_SCALES_MAX_GOLD_COLLECTION, MAX_GOLDEN_DRAGON_BANK_COINS } from './petData';
import { ARMOR_VARIANT_FAMILIES } from './armorVariants';
import { isReforgeApplicable } from './reforgeData';

// Which broad weapon family a real catalog `category` belongs to — enchants meaningfully differ
// across these (Sharpness/Critical are melee-only, a Bow's own enchants don't apply to a Sword,
// Wand's are Ability-focused), so persisted upgrades only carry across a weapon swap WITHIN one
// family, never across (user-specified 2026-08-29, bug report: Sharpness persisting onto a freshly
// picked Bow). Real ids confirmed against worker/src/data/weapons.json's `category` field —
// SWORD/DUNGEON SWORD/DUNGEON LONGSWORD/GAUNTLET are all melee weapons; only 'weapon'-slot swaps
// ever check this, since armor/equipment categories are already fixed per slot.
export function weaponTypeGroup(category) {
  const c = (category || '').toUpperCase();
  if (c.includes('BOW')) return 'bow';
  if (c === 'WAND') return 'wand';
  if (c.includes('SWORD') || c === 'GAUNTLET') return 'melee';
  return null;
}

// Kuudra armor (any of the 5 real families, any power tier) never carries its stars to a different
// piece in real Hypixel, even within the same family: Basic -> Hot is a genuinely new item. Every
// other piece is much cheaper to re-star in practice, so its stars persist across a swap instead
// (user-specified 2026-08-23).
export function isKuudraArmorId(id) {
  return !!id && ARMOR_VARIANT_FAMILIES.some((family) => id.includes(family));
}

export const PET_SLOT = 'pet';
export const ACCESSORY_SLOT = 'accessory';

// True when this swap crosses a real weapon family boundary, which drops every persisted upgrade.
// `prevCategory` may come from the slot being replaced OR from a remove-then-repick stash; an
// unrecognised category (null group) is treated as same-family — the permissive default, never
// worse than leaving modifiers alone.
export function crossesWeaponFamily(slot, prevCategory, nextCategory) {
  if (slot !== 'weapon') return false;
  const prev = weaponTypeGroup(prevCategory);
  return !!prev && prev !== weaponTypeGroup(nextCategory);
}

// The item record actually stored per slot — deliberately trimmed rather than the whole catalog
// entry, and shaped differently per slot family (a pet has no lore/gemstone slots, an accessory
// carries an iconId). Keeping this here means both callers store byte-identical records, so a
// loadout built by the planner and one built by a click compare equal.
export function trimItemForSlot(slot, item) {
  if (slot === PET_SLOT) {
    return { id: item.id, petId: item.petId, name: item.name, material: item.material, tier: item.tier };
  }
  if (slot === ACCESSORY_SLOT) {
    return { id: item.id, name: item.name, iconId: item.iconId, material: item.material };
  }
  return {
    id: item.id,
    name: item.name,
    material: item.material,
    category: item.category,
    tier: item.tier,
    lore: item.lore || [],
    color: item.color,
    // Real per-slot gemstone type/unlock-cost data (worker/scripts/build-item-data.mjs) — see
    // lib/optimizer.js's evaluateGemstoneCandidates, the consumer.
    gemstone_slots: item.gemstone_slots || null,
  };
}

// The modifiers a gear slot ends up with after equipping `item`.
//
// `carried` is whatever modifiers should be inherited — the remove-then-repick stash in the live
// UI, and nothing at all for a planner's direct swap. `prevModifiers` is the entry being replaced,
// read separately because stars carry from a DIRECT swap too, not only from the stash.
export function resolveGearModifiers({ item, carried, prevModifiers, crossesFamily, itemData }) {
  const inherited = crossesFamily ? null : carried;
  const modifiers = inherited ? { ...emptyModifiers(), ...inherited } : emptyModifiers();

  // A carried-over gemstone set can be too big for the new item's own real slot count (e.g.
  // Infernal Crimson Chestplate's 2 slots -> Mythos Chestplate's 1), so it's clipped rather than
  // left to overflow into a socket the item doesn't have (user-specified 2026-08-30).
  if (modifiers.gemstones?.length || modifiers.gemstoneSlotsUnlocked?.length) {
    const slotCount = item.gemstone_slots?.length || 0;
    modifiers.gemstones = (modifiers.gemstones || []).slice(0, slotCount);
    modifiers.gemstoneSlotsUnlocked = (modifiers.gemstoneSlotsUnlocked || []).slice(0, slotCount);
  }

  // A carried-over reforge can be item-exclusive to the item being replaced (Gilded -> Midas Sword
  // only, matched by id rather than category/rarity — see reforgeData.js's isReforgeApplicable).
  // A lookup miss (itemData not loaded, or a genuinely unknown name) carries over rather than
  // guessing it's invalid.
  if (modifiers.reforge) {
    const meta = itemData?.reforges?.[modifiers.reforge] || itemData?.reforgeStones?.[modifiers.reforge];
    if (meta && !isReforgeApplicable(meta, item)) modifiers.reforge = null;
  }

  const carriedStars = crossesFamily ? 0 : (prevModifiers?.stars ?? carried?.stars ?? 0);
  const maxStars = getMaxStarsForItem(item);
  modifiers.stars = isKuudraArmorId(item.id) ? 0 : Math.max(0, Math.min(maxStars, carriedStars));
  if (modifiers.stars < MASTER_STAR_MIN_BASE_STARS) modifiers.masterStars = 0;
  return modifiers;
}

// A freshly picked pet defaults to max effectiveness (max level, and for Golden Dragon its maxed
// Legendary Treasure/Shining Scales inputs) rather than level 1/0 — a real Hypixel import
// overwrites these afterwards, so this only matters for a from-scratch pick.
export function freshPetModifiers(item) {
  return {
    ...emptyPetModifiers(),
    level: getMaxPetLevel(item.petId),
    ...(item.petId === 'GOLDEN_DRAGON'
      ? { bankCoins: MAX_GOLDEN_DRAGON_BANK_COINS, goldCollection: SHINING_SCALES_MAX_GOLD_COLLECTION }
      : null),
  };
}

// The whole {item, modifiers} entry for a slot after equipping `item`. `prevEntry` is what the
// slot held; `stashedEntry` is the remove-then-repick stash ({modifiers, category}) and is null
// for a direct swap. The Accessory slot keeps its own Magical Power/Tuning across a Power Stone
// switch, which is why it reads prevEntry's modifiers rather than resetting.
export function buildSlotEntry({ slot, item, prevEntry, stashedEntry = null, itemData }) {
  if (slot === PET_SLOT) {
    return { item: trimItemForSlot(slot, item), modifiers: freshPetModifiers(item) };
  }
  if (slot === ACCESSORY_SLOT) {
    return { item: trimItemForSlot(slot, item), modifiers: prevEntry?.modifiers || emptyAccessoryModifiers() };
  }
  const prevCategory = prevEntry?.item?.category ?? stashedEntry?.category ?? null;
  const crossesFamily = crossesWeaponFamily(slot, prevCategory, item.category);
  return {
    item: trimItemForSlot(slot, item),
    modifiers: resolveGearModifiers({
      item,
      carried: stashedEntry?.modifiers ?? null,
      prevModifiers: prevEntry?.modifiers,
      crossesFamily,
      itemData,
    }),
  };
}

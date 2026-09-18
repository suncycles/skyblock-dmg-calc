// What equipping an item into a slot produces: the trimmed item record and the modifiers that
// survive the swap. Shared by BuildContext's selectItem and lib/applyResult.js's pure planner, so
// both produce the same result. Everything here is a pure function of its arguments — no React,
// storage or refs.

import { emptyModifiers, emptyPetModifiers, emptyAccessoryModifiers } from './defaultModifiers';
import { MASTER_STAR_MIN_BASE_STARS, getMaxStarsForItem } from './starring';
import { getMaxPetLevel, SHINING_SCALES_MAX_GOLD_COLLECTION, MAX_GOLDEN_DRAGON_BANK_COINS } from './petData';
import { ARMOR_VARIANT_FAMILIES } from './armorVariants';
import { isReforgeApplicable } from './reforgeData';

// Which broad weapon family a catalog `category` belongs to. Enchants differ meaningfully across
// them — Sharpness and Critical are melee-only, a Bow's enchants don't apply to a Sword — so
// persisted upgrades carry across a weapon swap only within one family. SWORD, DUNGEON SWORD,
// DUNGEON LONGSWORD and GAUNTLET are all melee. Only 'weapon'-slot swaps check this, armor and
// equipment categories being fixed per slot.
export function weaponTypeGroup(category) {
  const c = (category || '').toUpperCase();
  if (c.includes('BOW')) return 'bow';
  if (c === 'WAND') return 'wand';
  if (c.includes('SWORD') || c === 'GAUNTLET') return 'melee';
  return null;
}

// Kuudra armor never carries its stars to a different piece, even within a family: Basic -> Hot is
// a new item. Every other piece is cheap enough to re-star that its stars persist across a swap.
export function isKuudraArmorId(id) {
  return !!id && ARMOR_VARIANT_FAMILIES.some((family) => id.includes(family));
}

export const PET_SLOT = 'pet';
export const ACCESSORY_SLOT = 'accessory';

// True when a swap crosses a weapon family boundary, which drops every persisted upgrade.
// `prevCategory` comes from the slot being replaced or from a remove-then-repick stash; an
// unrecognised category (null group) counts as same-family, the permissive default.
export function crossesWeaponFamily(slot, prevCategory, nextCategory) {
  if (slot !== 'weapon') return false;
  const prev = weaponTypeGroup(prevCategory);
  return !!prev && prev !== weaponTypeGroup(nextCategory);
}

// The item record stored per slot: trimmed rather than the whole catalog entry, and shaped per slot
// family (a pet has no lore or gemstone slots, an accessory carries an iconId). Both callers store
// byte-identical records, so a loadout built by the planner compares equal to one built by a click.
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

  // A carried-over gemstone set can exceed the new item's slot count (Infernal Crimson Chestplate's
  // 2 against Mythos Chestplate's 1), so it is clipped rather than overflowing into a socket that
  // doesn't exist.
  if (modifiers.gemstones?.length || modifiers.gemstoneSlotsUnlocked?.length) {
    const slotCount = item.gemstone_slots?.length || 0;
    modifiers.gemstones = (modifiers.gemstones || []).slice(0, slotCount);
    modifiers.gemstoneSlotsUnlocked = (modifiers.gemstoneSlotsUnlocked || []).slice(0, slotCount);
  }

  // A carried-over reforge can be item-exclusive to the piece being replaced (Gilded belongs to
  // Midas Sword, matched by id rather than category — see reforgeData.js's isReforgeApplicable). A
  // lookup miss carries the reforge over rather than assuming it is invalid.
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

// A freshly picked pet defaults to max effectiveness — max level, and for Golden Dragon its maxed
// Legendary Treasure and Shining Scales inputs. An import overwrites these, so it only matters for
// a from-scratch pick.
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

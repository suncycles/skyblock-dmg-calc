import { rarityColorCode } from './mcText';

// Recombobulator 3000's own NEU-REPO lore is just "Permanently increases
// the rarity of an item. Can only be applied to an item once." — no flat
// stat bonus of its own (unlike Books/Reforges/Gemstones). Its real effect
// here is bumping which rarity's reforge-stat column a reforge reads from
// (reforge bonuses scale with rarity), plus the rarity color/label shown
// on the tooltip — so it doesn't get its own "(+x)" annotation.
const RARITY_UPGRADE_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

export function canRecombobulate(tier) {
  const idx = RARITY_UPGRADE_ORDER.indexOf((tier || '').toLowerCase());
  return idx !== -1 && idx < RARITY_UPGRADE_ORDER.length - 1;
}

// Unrecognized or already-max tiers pass through unchanged.
export function bumpRarity(tier) {
  const idx = RARITY_UPGRADE_ORDER.indexOf((tier || '').toLowerCase());
  if (idx === -1 || idx === RARITY_UPGRADE_ORDER.length - 1) return tier;
  return RARITY_UPGRADE_ORDER[idx + 1].toUpperCase();
}

// Real item lore always ends with a "§{color}§l{RARITY} {CATEGORY}" tag
// line (e.g. "§6§lLEGENDARY SWORD") — only that line is touched, both to
// avoid false-positive matches of the rarity word elsewhere in ability
// text and because it's the one line real Recombobulated items actually
// show updated.
//
// The "$ ... $" flanking and trailing "Rarity Upgraded" note are purely a
// calculator-UI visual marker (not a real Hypixel convention) so a
// recombobulated item's rarity tag is instantly distinguishable at a
// glance from an item that's naturally that rarity.
export function applyRecombToLore(lore, originalTier) {
  if (!lore || lore.length === 0) return lore;
  const newTier = bumpRarity(originalTier);
  if (!newTier || newTier.toUpperCase() === (originalTier || '').toUpperCase()) return lore;

  const lastIdx = lore.length - 1;
  const oldWord = (originalTier || '').toUpperCase();
  if (!lore[lastIdx].includes(oldWord)) return lore; // unexpected shape — leave untouched

  const updated = lore[lastIdx]
    .replace(oldWord, newTier.toUpperCase())
    .replace(/§[0-9a-f](§l)/, `§${rarityColorCode(newTier)}$1`)
    .replace(/^(§[0-9a-f]§l)(.+)$/, '$1$ $2 $');
  return [...lore.slice(0, lastIdx), updated, '§8Rarity Upgraded'];
}

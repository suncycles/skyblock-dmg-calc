import { rarityColorCode } from './mcText';

// Recombobulator 3000 has no flat stat bonus of its own — its real effect is bumping which
// rarity's reforge-stat column a reforge reads from, plus the rarity color/label on the tooltip.
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

// Rewrites the item's trailing "§{color}§l{RARITY} {CATEGORY}" tag line, and flags it with a
// "$ ... $" marker + "Rarity Upgraded" note (a calculator-UI convention, not a real Hypixel one).
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

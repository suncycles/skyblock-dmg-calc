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

// Rewrites the item's trailing "§{color}§l{RARITY} {CATEGORY}" tag line to a different rarity,
// no annotation — a plain correction (e.g. a milestone-upgrading item's real current tier).
export function applyRarityTagToLore(lore, fromTier, toTier) {
  if (!lore || lore.length === 0) return lore;
  const fromWord = (fromTier || '').toUpperCase();
  const toWord = (toTier || '').toUpperCase();
  if (!fromWord || !toWord || fromWord === toWord) return lore;

  const lastIdx = lore.length - 1;
  if (!lore[lastIdx].includes(fromWord)) return lore; // unexpected shape — leave untouched

  const updated = lore[lastIdx].replace(fromWord, toWord).replace(/§[0-9a-f](§l)/, `§${rarityColorCode(toTier)}$1`);
  return [...lore.slice(0, lastIdx), updated];
}

// Same tag rewrite as applyRarityTagToLore, plus a "$ ... $" marker + "Rarity Upgraded" note
// (a calculator-UI convention, not a real Hypixel one) so a recomb bump reads differently from a plain rarity correction.
export function applyRecombToLore(lore, originalTier) {
  const newTier = bumpRarity(originalTier);
  const tagged = applyRarityTagToLore(lore, originalTier, newTier);
  if (tagged === lore) return lore; // no bump available, or tag line didn't match expected shape

  const lastIdx = tagged.length - 1;
  const marked = tagged[lastIdx].replace(/^(§[0-9a-f]§l)(.+)$/, '$1$ $2 $');
  return [...tagged.slice(0, lastIdx), marked, '§8Rarity Upgraded'];
}

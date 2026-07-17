import { rarityColorCode } from './mcText';
import { GEMSTONES, TIER_TO_RARITY, getGemstoneBoost, formatGemstoneBoost } from './gemstoneData';

// Real Skyblock lore marks gemstone slots as a run of bracket groups on one
// line, e.g. "§7Gemstones: §8[] [⚔]" (2 slots) or "§7Gemstones: §8[⚔]"
// (1 slot) — each bracket is a slot regardless of what's inside it (blank
// for a Universal slot, a restriction icon like ⚔ for a typed one). Slot
// *type* restrictions aren't modeled — spec says any of the 6 supported
// gems can go in any slot for now.
function findGemstoneLine(lore) {
  return (lore || []).find((line) => line.includes('Gemstones:'));
}

export function countGemstoneSlots(lore) {
  const line = findGemstoneLine(lore);
  if (!line) return 0;
  return (line.match(/\[[^\]]*\]/g) || []).length;
}

export function hasGemstoneSlots(lore) {
  return countGemstoneSlots(lore) > 0;
}

// Slots are laid out centered on the grid's middle column: 1 slot sits
// dead center, additional slots alternate outward from there, skipping the
// center exactly when the count is even (2 -> one left, one right of
// center; 4 -> two on each side, center itself empty). Matches the spec's
// worked examples (1 -> F4; 2 -> E4,G4; 3 -> E4,F4,G4).
export function gemstoneSlotColumnOffsets(count) {
  if (count <= 0) return [];
  const offsets = [];
  if (count % 2 === 1) {
    const half = (count - 1) / 2;
    for (let i = -half; i <= half; i++) offsets.push(i);
  } else {
    const half = count / 2;
    for (let i = -half; i <= -1; i++) offsets.push(i);
    for (let i = 1; i <= half; i++) offsets.push(i);
  }
  return offsets;
}

function findGemIdByStatLabel(statLabel) {
  return Object.keys(GEMSTONES).find((id) => GEMSTONES[id].statLabel === statLabel);
}

// Rebuilds an item's lore with applied gemstones reflected: the
// "Gemstones:" line's brackets recolor per-slot (bracket color = the
// gemstone's tier-as-rarity, symbol color = the gemstone's own color), and
// every boosted stat gets a "§d(+X)" pink annotation — appended to its
// existing lore line if the item already shows that stat, or as a brand
// new "§7{Stat}: §{color}+X §d(+X)" line (matching real stat-line format,
// inserted right before Gemstones:) if it doesn't. `gemstones` is a sparse
// array indexed by slot position, entries are {gem, tier} or null/undefined.
export function applyGemstonesToLore(lore, gemstones, itemRarity) {
  if (!lore || !gemstones || gemstones.every((g) => !g)) return lore;

  const totals = {}; // statLabel -> accumulated boost
  gemstones.forEach((entry) => {
    if (!entry) return;
    const gem = GEMSTONES[entry.gem];
    if (!gem) return;
    const boost = getGemstoneBoost(entry.gem, entry.tier, itemRarity);
    totals[gem.statLabel] = (totals[gem.statLabel] || 0) + boost;
  });

  const gemstoneLineIdx = lore.findIndex((line) => line.includes('Gemstones:'));
  const matchedLabels = new Set();

  const result = lore.map((line, idx) => {
    if (idx === gemstoneLineIdx) {
      let slotIdx = 0;
      return line.replace(/\[[^\]]*\]/g, (bracket) => {
        const entry = gemstones[slotIdx];
        slotIdx++;
        if (!entry) return bracket;
        const gem = GEMSTONES[entry.gem];
        const bracketColor = rarityColorCode(TIER_TO_RARITY[entry.tier]);
        // §-codes don't auto-reset, so without a trailing §8 this slot's
        // color would bleed into whatever untouched bracket comes next
        // (the base "§8[...] [...]" line is all dark gray by default).
        return `§${bracketColor}[§${gem.colorCode}${gem.symbol}§${bracketColor}]§8`;
      });
    }

    const plain = line.replace(/§./g, '');
    const match = /^(\s*)([A-Za-z ]+):\s/.exec(plain);
    if (match && totals[match[2]] !== undefined) {
      matchedLabels.add(match[2]);
      const gemId = findGemIdByStatLabel(match[2]);
      return `${line} §d(${formatGemstoneBoost(gemId, totals[match[2]])})`;
    }
    return line;
  });

  const newLines = Object.keys(totals)
    .filter((statLabel) => !matchedLabels.has(statLabel))
    .map((statLabel) => {
      const gemId = findGemIdByStatLabel(statLabel);
      const gem = GEMSTONES[gemId];
      const formatted = formatGemstoneBoost(gemId, totals[statLabel]);
      return `§7${statLabel}: §${gem.valueColor}${formatted} §d(${formatted})`;
    });

  if (newLines.length === 0 || gemstoneLineIdx === -1) return result;
  return [...result.slice(0, gemstoneLineIdx), ...newLines, ...result.slice(gemstoneLineIdx)];
}

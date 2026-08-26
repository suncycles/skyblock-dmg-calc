import { rarityColorCode } from './mcText';
import { GEMSTONES, GEMSTONE_IDS, TIER_TO_RARITY, getGemstoneBoost, formatGemstoneBoost } from './gemstoneData';

// Real per-slot type restrictions (item.gemstone_slots' own slot_type, see
// worker/scripts/build-item-data.mjs — Hypixel's resources API, not in NEU-REPO). Confirmed live:
// a "COMBAT" slot accepts any of the 6 gems this app models (a real account's Infernal Crimson
// pieces hold Onyx in a COMBAT slot); "UNIVERSAL" is likewise unrestricted by definition. A slot
// whose type IS itself one of the 6 gem ids (Hyperion's own "SAPPHIRE" slot, Giant's Sword's two
// "JASPER" slots) accepts ONLY that one type — the real restriction this app didn't model before.
// Any other real type (DEFENSIVE/MINING/CHISEL/AMBER/TOPAZ/JADE/AQUAMARINE/CITRINE/PERIDOT) takes
// none of the 6 gems this calculator has stat data for.
const UNRESTRICTED_SLOT_TYPES = new Set(['COMBAT', 'UNIVERSAL']);

// `slotType` is one real gemstone_slots[i].slot_type value, or undefined/null when no real catalog
// data exists for this slot (an item this app tracks that's missing from Hypixel's resources
// response, or a slot count beyond what real catalog data covers) — falls back to unrestricted
// (the old, only-ever behavior) rather than silently zeroing out every candidate for that slot.
export function getAllowedGemsForSlotType(slotType) {
  if (!slotType || UNRESTRICTED_SLOT_TYPES.has(slotType)) return GEMSTONE_IDS;
  return GEMSTONE_IDS.includes(slotType) ? [slotType] : [];
}

// Gemstone slots are a run of bracket groups on one lore line, e.g. "§7Gemstones: §8[] [⚔]".
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

// Slots are centered on the grid's middle column, alternating outward (1 -> center; 2 -> one left/right of center; etc).
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

// App-only extension of the vanilla color palette (see lib/mcText.js's MC_COLORS) so a
// gemstone's annotation stays pink without colliding with 'd', the code Enchant stat bonuses use.
export const GEMSTONE_COLOR = 'p';

// Rebuilds an item's lore with applied gemstones reflected: the "Gemstones:" line's brackets
// recolor per-slot, and every boosted stat merges directly into the item's own base number
// (a socketed gemstone is a permanent part of the item's stats), echoed alongside as a pink
// "(+X)" annotation. Also adds a brand-new stat line for a stat the item doesn't already show
// (most weapons have no pristine Health/Defense/True Defense line). `gemstones` is a sparse
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
        // Trailing §8 resets color so it doesn't bleed into the next untouched bracket.
        return `§${bracketColor}[§${gem.colorCode}${gem.symbol}§${bracketColor}]§8`;
      });
    }

    const plain = line.replace(/§./g, '');
    const labelMatch = /^(\s*)([A-Za-z ]+):\s/.exec(plain);
    if (!labelMatch || totals[labelMatch[2]] === undefined) return line;
    // Captures just the base number after "Label: ", separately from any trailing "%" or annotation.
    const numMatch = /^(.*?:\s*§.)([+-]?[\d.]+)/.exec(line);
    if (!numMatch) return line;
    matchedLabels.add(labelMatch[2]);
    const bonus = totals[labelMatch[2]];
    const merged = Math.round((parseFloat(numMatch[2]) + bonus) * 10) / 10;
    const sign = merged >= 0 ? '+' : '';
    const gemId = findGemIdByStatLabel(labelMatch[2]);
    return `${numMatch[1]}${sign}${merged}${line.slice(numMatch[0].length)} §${GEMSTONE_COLOR}(${formatGemstoneBoost(gemId, bonus)})`;
  });

  const newLines = Object.keys(totals)
    .filter((statLabel) => !matchedLabels.has(statLabel))
    .map((statLabel) => {
      const gemId = findGemIdByStatLabel(statLabel);
      const gem = GEMSTONES[gemId];
      const formatted = formatGemstoneBoost(gemId, totals[statLabel]);
      return `§7${statLabel}: §${gem.valueColor}${formatted} §${GEMSTONE_COLOR}(${formatted})`;
    });

  if (newLines.length === 0 || gemstoneLineIdx === -1) return result;
  return [...result.slice(0, gemstoneLineIdx), ...newLines, ...result.slice(gemstoneLineIdx)];
}

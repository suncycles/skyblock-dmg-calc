import { useNavigate, useParams } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useTooltip } from '../context/TooltipContext';
import { GEMSTONES, GEMSTONE_TIERS, TIER_TO_RARITY, getGemstoneBoost, formatGemstoneBoost } from '../lib/gemstoneData';
import { rarityColorCode } from '../lib/mcText';

const slotBase = 'border border-neutral-700';
const navSlot = `${slotBase} flex items-center justify-center bg-neutral-300 cursor-pointer text-[clamp(14px,3.5vw,26px)] hover:bg-neutral-200`;

function titleCase(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// Step 2 of applying a gemstone: pick the tier (Rough..Perfect), which
// together with the item's rarity determines the stat boost. Applying
// backs out two screens (past this picker and the gem-type picker) straight
// to the slot grid, same "pick and auto-return" feel as enchant levels.
export default function GemstoneTierPicker() {
  const { slotIndex, gemType } = useParams();
  const navigate = useNavigate();
  const { build, applyGemstone } = useBuild();
  const { showTooltip, hideTooltip } = useTooltip();
  const idx = Number(slotIndex);
  const gemId = gemType.toUpperCase();
  const gem = GEMSTONES[gemId];
  const itemRarity = build?.weapon?.tier || 'common';
  const current = build?.modifiers?.gemstones?.[idx];

  function handleSelect(tier) {
    applyGemstone(idx, gemId, tier);
    navigate(-2);
  }

  const cells = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 9; col++) {
      const key = `${row}-${col}`;
      const isInteriorRow = row >= 1 && row <= 4;
      const isInteriorCol = col >= 1 && col <= 7;

      if (isInteriorRow && isInteriorCol) {
        const tierIdx = (row - 1) * 7 + (col - 1);
        const tier = GEMSTONE_TIERS[tierIdx];
        if (tier && gem) {
          const boost = getGemstoneBoost(gemId, tier, itemRarity);
          const tierColor = rarityColorCode(TIER_TO_RARITY[tier]);
          cells.push(
            <div
              key={key}
              className={`${slotBase} flex flex-col items-center justify-center cursor-pointer text-sm hover:bg-neutral-200 ${
                current?.gem === gemId && current?.tier === tier ? 'bg-green-400' : 'bg-neutral-300'
              }`}
              title={`${titleCase(tier)} ${gem.label}: ${formatGemstoneBoost(gemId, boost)} ${gem.statLabel}`}
              onClick={() => handleSelect(tier)}
              onMouseEnter={(e) =>
                showTooltip(
                  [`§${tierColor}${titleCase(tier)} ${gem.label}`, `§7${gem.statLabel}: §a${formatGemstoneBoost(gemId, boost)}`],
                  e.currentTarget,
                )
              }
              onMouseLeave={hideTooltip}
            >
              <span>{titleCase(tier)}</span>
              <span className="text-xs">{formatGemstoneBoost(gemId, boost)}</span>
            </div>,
          );
        } else {
          cells.push(<div key={key} className={`${slotBase} bg-neutral-500`} />);
        }
      } else if (isInteriorRow && !isInteriorCol) {
        cells.push(<div key={key} className={`${slotBase} bg-purple-500`} />);
      } else if (row === 5 && col === 4) {
        cells.push(
          <div key={key} className={navSlot} title="Back" onClick={() => navigate(-1)}>
            ⛔
          </div>,
        );
      } else {
        cells.push(<div key={key} className={`${slotBase} bg-neutral-500`} />);
      }
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <header className="w-full max-w-[700px] mb-4">
        <h1 className="text-xl font-bold">The Hex — {gem ? gem.label : gemType} Tier</h1>
      </header>

      <div className="w-full max-w-[700px] overflow-x-auto">
        <div className="grid grid-cols-9 grid-rows-6 gap-0.5 w-full min-w-[380px] aspect-[9/6] bg-neutral-600 border-2 border-neutral-500 p-1">
          {cells}
        </div>
      </div>
    </div>
  );
}

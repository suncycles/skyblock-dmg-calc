import { useNavigate, useParams } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useTooltip } from '../context/TooltipContext';
import { GEMSTONES, GEMSTONE_TIERS, TIER_TO_RARITY, getGemstoneBoost, formatGemstoneBoost } from '../lib/gemstoneData';
import { rarityColorCode } from '../lib/mcText';
import { getGemstoneIcon, SLOT_TEXTURES } from '../lib/icons';
import { bumpRarity } from '../lib/recombobulator';

const slotBase =
  'flex items-center justify-center bg-[#8b8b8b] shadow-[inset_2px_2px_0_0_#373737,inset_-2px_-2px_0_0_#ffffff]';
const navSlot = `${slotBase} cursor-pointer hover:brightness-110`;
const iconImg = 'w-[70%] h-[70%] object-contain pixelated';
const slotFillImg = 'w-full h-full object-cover pixelated';

function titleCase(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// Step 2 of applying a gemstone: pick the tier (Rough..Perfect), which
// together with the item's rarity determines the stat boost. Applying
// backs out two screens (past this picker and the gem-type picker) straight
// to the slot grid, same "pick and auto-return" feel as enchant levels.
export default function GemstoneTierPicker() {
  const { slot, slotIndex, gemType } = useParams();
  const navigate = useNavigate();
  const { loadout, applyGemstone } = useBuild();
  const { showTooltip, hideTooltip } = useTooltip();
  const idx = Number(slotIndex);
  const gemId = gemType.toUpperCase();
  const gem = GEMSTONES[gemId];
  const baseTier = loadout[slot]?.item?.tier || 'common';
  const itemRarity = loadout[slot]?.modifiers?.recombobulated ? bumpRarity(baseTier) : baseTier;
  const current = loadout[slot]?.modifiers?.gemstones?.[idx];

  function handleSelect(tier) {
    applyGemstone(slot, idx, gemId, tier);
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
              className={`${slotBase} relative flex-col cursor-pointer hover:brightness-110 ${
                current?.gem === gemId && current?.tier === tier ? 'bg-green-400' : ''
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
              <img src={getGemstoneIcon(gemId, tier)} alt={`${titleCase(tier)} ${gem.label}`} className={iconImg} />
              <span className="absolute bottom-0.5 right-1 text-[10px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                {formatGemstoneBoost(gemId, boost)}
              </span>
            </div>,
          );
        } else {
          cells.push(
            <div key={key} className={slotBase}>
              <img src={SLOT_TEXTURES.empty} alt="" className={slotFillImg} />
            </div>,
          );
        }
      } else if (isInteriorRow && !isInteriorCol) {
        cells.push(
          <div key={key} className={slotBase}>
            <img src={SLOT_TEXTURES.filler} alt="" className={slotFillImg} />
          </div>,
        );
      } else if (row === 5 && col === 4) {
        cells.push(
          <div key={key} className={navSlot} title="Back" onClick={() => navigate(-1)}>
            <img src={SLOT_TEXTURES.close} alt="Back" className={iconImg} />
          </div>,
        );
      } else {
        cells.push(
          <div key={key} className={slotBase}>
            <img src={SLOT_TEXTURES.empty} alt="" className={slotFillImg} />
          </div>,
        );
      }
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <header className="w-full max-w-[700px] mb-4">
        <h1 className="text-xl font-bold">The Hex — {gem ? gem.label : gemType} Tier</h1>
      </header>

      <div className="w-full max-w-[700px] overflow-x-auto">
        <div className="grid grid-cols-9 grid-rows-6 gap-[3px] w-full min-w-[380px] aspect-[9/6] bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black p-2">
          {cells}
        </div>
      </div>
    </div>
  );
}

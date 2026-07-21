import { useNavigate, useParams } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useTooltip } from '../context/TooltipContext';
import { GEMSTONES, GEMSTONE_IDS } from '../lib/gemstoneData';
import { getGemstoneIcon, SLOT_TEXTURES } from '../lib/icons';

const slotBase =
  'flex items-center justify-center bg-[#8b8b8b] shadow-[inset_2px_2px_0_0_#373737,inset_-2px_-2px_0_0_#ffffff]';
const navSlot = `${slotBase} cursor-pointer hover:brightness-110`;
const iconImg = 'w-[70%] h-[70%] object-contain pixelated';
const slotFillImg = 'w-full h-full object-cover pixelated';

// Step 1 of applying a gemstone: pick which of the 6 supported gem types
// goes in this slot. Spec allows any gem in any slot for now, so this
// doesn't check the slot's restriction icon.
export default function GemstoneTypePicker() {
  const { slot, slotIndex } = useParams();
  const navigate = useNavigate();
  const { loadout, removeGemstone } = useBuild();
  const { showTooltip, hideTooltip } = useTooltip();
  const idx = Number(slotIndex);
  const current = loadout[slot]?.modifiers?.gemstones?.[idx];

  const cells = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 9; col++) {
      const key = `${row}-${col}`;
      const isInteriorRow = row >= 1 && row <= 4;
      const isInteriorCol = col >= 1 && col <= 7;

      if (isInteriorRow && isInteriorCol) {
        const gemIdx = (row - 1) * 7 + (col - 1);
        const gemId = GEMSTONE_IDS[gemIdx];
        if (gemId) {
          const gem = GEMSTONES[gemId];
          cells.push(
            <div
              key={key}
              className={`${slotBase} cursor-pointer hover:brightness-110 ${current?.gem === gemId ? 'bg-green-400' : ''}`}
              title={`${gem.label} (${gem.statLabel})`}
              onClick={() => navigate(`/gemstones/${slot}/${idx}/${gemId}`)}
              onMouseEnter={(e) => showTooltip([`§${gem.colorCode}${gem.symbol} ${gem.label}`, `§7${gem.statLabel}`], e.currentTarget)}
              onMouseLeave={hideTooltip}
            >
              <img src={getGemstoneIcon(gemId, 'rough')} alt={gem.label} className={iconImg} />
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
      } else if (row === 5 && col === 3 && current) {
        cells.push(
          <div
            key={key}
            className={navSlot}
            title="Remove Gemstone"
            onClick={() => {
              removeGemstone(slot, idx);
              navigate(`/gemstones/${slot}`);
            }}
          >
            🗑️
          </div>,
        );
      } else if (row === 5 && col === 4) {
        cells.push(
          <div key={key} className={navSlot} title="Close" onClick={() => navigate(`/gemstones/${slot}`)}>
            <img src={SLOT_TEXTURES.close} alt="Close" className={iconImg} />
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
        <h1 className="text-xl font-bold">The Hex — Choose a Gemstone</h1>
      </header>

      <div className="w-full max-w-[700px] overflow-x-auto">
        <div className="grid grid-cols-9 grid-rows-6 gap-[3px] w-full min-w-[380px] aspect-[9/6] bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black p-2">
          {cells}
        </div>
      </div>
    </div>
  );
}

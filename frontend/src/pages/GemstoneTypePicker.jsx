import { useNavigate, useParams } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useTooltip } from '../context/TooltipContext';
import { GEMSTONES, GEMSTONE_IDS } from '../lib/gemstoneData';
import { MC_COLORS } from '../lib/mcText';

const slotBase = 'border border-neutral-700';
const navSlot = `${slotBase} flex items-center justify-center bg-neutral-300 cursor-pointer text-[clamp(14px,3.5vw,26px)] hover:bg-neutral-200`;

// Step 1 of applying a gemstone: pick which of the 6 supported gem types
// goes in this slot. Spec allows any gem in any slot for now, so this
// doesn't check the slot's restriction icon.
export default function GemstoneTypePicker() {
  const { slotIndex } = useParams();
  const navigate = useNavigate();
  const { build, removeGemstone } = useBuild();
  const { showTooltip, hideTooltip } = useTooltip();
  const idx = Number(slotIndex);
  const current = build?.modifiers?.gemstones?.[idx];

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
              className={`${slotBase} flex items-center justify-center cursor-pointer text-xl hover:bg-neutral-200 ${
                current?.gem === gemId ? 'bg-green-400' : 'bg-neutral-300'
              }`}
              title={`${gem.label} (${gem.statLabel})`}
              onClick={() => navigate(`/gemstones/${idx}/${gemId}`)}
              onMouseEnter={(e) => showTooltip([`§${gem.colorCode}${gem.symbol} ${gem.label}`, `§7${gem.statLabel}`], e.currentTarget)}
              onMouseLeave={hideTooltip}
            >
              <span style={{ color: MC_COLORS[gem.colorCode] }}>{gem.symbol}</span>
            </div>,
          );
        } else {
          cells.push(<div key={key} className={`${slotBase} bg-neutral-500`} />);
        }
      } else if (isInteriorRow && !isInteriorCol) {
        cells.push(<div key={key} className={`${slotBase} bg-purple-500`} />);
      } else if (row === 5 && col === 3 && current) {
        cells.push(
          <div
            key={key}
            className={navSlot}
            title="Remove Gemstone"
            onClick={() => {
              removeGemstone(idx);
              navigate('/gemstones');
            }}
          >
            🗑️
          </div>,
        );
      } else if (row === 5 && col === 4) {
        cells.push(
          <div key={key} className={navSlot} title="Close" onClick={() => navigate('/gemstones')}>
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
        <h1 className="text-xl font-bold">The Hex — Choose a Gemstone</h1>
      </header>

      <div className="w-full max-w-[700px] overflow-x-auto">
        <div className="grid grid-cols-9 grid-rows-6 gap-0.5 w-full min-w-[380px] aspect-[9/6] bg-neutral-600 border-2 border-neutral-500 p-1">
          {cells}
        </div>
      </div>
    </div>
  );
}

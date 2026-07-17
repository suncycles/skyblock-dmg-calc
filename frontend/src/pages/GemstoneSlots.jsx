import { useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useTooltip } from '../context/TooltipContext';
import { rarityColorCode } from '../lib/mcText';
import { countGemstoneSlots, gemstoneSlotColumnOffsets, applyGemstonesToLore } from '../lib/gemstones';
import { GEMSTONES } from '../lib/gemstoneData';
import WeaponIcon from '../components/WeaponIcon';

const slotBase = 'border border-neutral-700';
const navSlot = `${slotBase} flex items-center justify-center bg-neutral-300 cursor-pointer text-[clamp(14px,3.5vw,26px)] hover:bg-neutral-200`;

// Item sits at B3, gemstone slots are centered on column F (index 5),
// both on the grid's 3rd row (index 2) — see lib/gemstones.js for how the
// column spread for >1 slot is derived.
const ITEM_ROW = 2;
const ITEM_COL = 1;
const CENTER_COL = 5;

// The "screen" opened by the Gemstones icon: the item plus one slot per
// gemstone slot the item has, laid out per spec. Clicking an empty or
// filled slot opens the gem-type picker (GemstoneTypePicker) for that slot
// index; applying a gem there (via the tier picker) navigates back here.
export default function GemstoneSlots() {
  const navigate = useNavigate();
  const { build } = useBuild();
  const { showTooltip, hideTooltip } = useTooltip();
  const weapon = build && build.weapon;
  const slotCount = weapon ? countGemstoneSlots(weapon.lore) : 0;
  const gemstones = (build && build.modifiers && build.modifiers.gemstones) || [];
  const offsets = gemstoneSlotColumnOffsets(slotCount);

  function handleWeaponHover(e) {
    if (!weapon) return;
    const lore = applyGemstonesToLore(weapon.lore || [], gemstones, weapon.tier);
    showTooltip([`§${rarityColorCode(weapon.tier)}§l${weapon.name}`, ...lore], e.currentTarget);
  }

  const cells = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 9; col++) {
      const key = `${row}-${col}`;

      if (row === ITEM_ROW && col === ITEM_COL) {
        cells.push(
          <div
            key={key}
            className={`${slotBase} flex items-center justify-center bg-neutral-500 text-[clamp(20px,5vw,34px)]`}
            onMouseEnter={handleWeaponHover}
            onMouseLeave={hideTooltip}
          >
            {weapon && <WeaponIcon id={weapon.id} material={weapon.material} alt={weapon.name} className="w-[70%] h-[70%] object-contain pixelated" />}
          </div>,
        );
        continue;
      }

      const slotIdx = row === ITEM_ROW ? offsets.indexOf(col - CENTER_COL) : -1;
      if (slotIdx !== -1) {
        const entry = gemstones[slotIdx];
        const gem = entry && GEMSTONES[entry.gem];
        cells.push(
          <div
            key={key}
            className={`${slotBase} flex items-center justify-center cursor-pointer text-xl hover:bg-neutral-200 ${
              gem ? 'bg-green-400' : 'bg-neutral-300'
            }`}
            title={gem ? `${entry.tier[0].toUpperCase()}${entry.tier.slice(1)} ${gem.label}` : 'Empty gemstone slot'}
            onClick={() => navigate(`/gemstones/${slotIdx}`)}
          >
            {gem ? gem.symbol : ''}
          </div>,
        );
        continue;
      }

      if (row === 4 && col === 4) {
        cells.push(
          <div key={key} className={navSlot} title="Close" onClick={() => navigate('/hex')}>
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
        <h1 className="text-xl font-bold">The Hex — Gemstones</h1>
      </header>

      <div className="w-full max-w-[700px] text-[13px] text-neutral-300 mb-2.5">
        {!weapon
          ? 'No weapon selected — go back and pick one.'
          : slotCount === 0
            ? 'This item has no Gemstone Slots.'
            : `${weapon.name} — ${slotCount} Gemstone Slot${slotCount === 1 ? '' : 's'}`}
      </div>

      <div className="w-full max-w-[700px] overflow-x-auto">
        <div className="grid grid-cols-9 grid-rows-6 gap-0.5 w-full min-w-[380px] aspect-[9/6] bg-neutral-600 border-2 border-neutral-500 p-1">
          {cells}
        </div>
      </div>
    </div>
  );
}

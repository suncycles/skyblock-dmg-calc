import { useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useTooltip } from '../context/TooltipContext';
import { rarityColorCode, formatItemName } from '../lib/mcText';
import { countGemstoneSlots, gemstoneSlotColumnOffsets, applyGemstonesToLore } from '../lib/gemstones';
import { GEMSTONES } from '../lib/gemstoneData';
import { getGemstoneIcon, SLOT_TEXTURES } from '../lib/icons';
import WeaponIcon from '../components/WeaponIcon';

const slotBase =
  'flex items-center justify-center bg-[#8b8b8b] shadow-[inset_2px_2px_0_0_#373737,inset_-2px_-2px_0_0_#ffffff]';
const navSlot = `${slotBase} cursor-pointer hover:brightness-110`;
const iconImg = 'w-[70%] h-[70%] object-contain pixelated';
const slotFillImg = 'w-full h-full object-cover pixelated';

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
    showTooltip([`§${rarityColorCode(weapon.tier)}§l${formatItemName(weapon.name)}`, ...lore], e.currentTarget);
  }

  const cells = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 9; col++) {
      const key = `${row}-${col}`;

      if (row === ITEM_ROW && col === ITEM_COL) {
        cells.push(
          <div key={key} className={`${slotBase} cursor-default`} onMouseEnter={handleWeaponHover} onMouseLeave={hideTooltip}>
            {weapon && <WeaponIcon id={weapon.id} material={weapon.material} alt={weapon.name} className={iconImg} />}
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
            className={`${slotBase} cursor-pointer hover:brightness-110 ${gem ? 'bg-green-400' : ''}`}
            title={gem ? `${entry.tier[0].toUpperCase()}${entry.tier.slice(1)} ${gem.label}` : 'Empty gemstone slot'}
            onClick={() => navigate(`/gemstones/${slotIdx}`)}
          >
            {gem ? (
              <img src={getGemstoneIcon(entry.gem, entry.tier)} alt={gem.label} className={iconImg} />
            ) : (
              <img src={SLOT_TEXTURES.emptyGemSlot} alt="" className={slotFillImg} />
            )}
          </div>,
        );
        continue;
      }

      if (row === 4 && col === 4) {
        cells.push(
          <div key={key} className={navSlot} title="Close" onClick={() => navigate('/hex')}>
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
        <h1 className="text-xl font-bold">The Hex — Gemstones</h1>
      </header>

      <div className="w-full max-w-[700px] text-[13px] text-neutral-300 mb-2.5">
        {!weapon
          ? 'No weapon selected — go back and pick one.'
          : slotCount === 0
            ? 'This item has no Gemstone Slots.'
            : `${formatItemName(weapon.name)} — ${slotCount} Gemstone Slot${slotCount === 1 ? '' : 's'}`}
      </div>

      <div className="w-full max-w-[700px] overflow-x-auto">
        <div className="grid grid-cols-9 grid-rows-6 gap-[3px] w-full min-w-[380px] aspect-[9/6] bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black p-2">
          {cells}
        </div>
      </div>
    </div>
  );
}

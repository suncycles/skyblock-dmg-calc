import { useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useItemData } from '../context/ItemDataContext';
import { useTooltip } from '../context/TooltipContext';
import { formatItemName } from '../lib/mcText';
import { countGemstoneSlots, gemstoneSlotColumnOffsets } from '../lib/gemstones';
import { GEMSTONES } from '../lib/gemstoneData';
import { getGemstoneIcon, SLOT_TEXTURES } from '../lib/icons';
import { buildFullItemTooltipLines } from '../lib/itemTooltip';
import WeaponIcon from '../components/WeaponIcon';

const slotBase =
  'flex items-center justify-center bg-[#8b8b8b] shadow-[inset_2px_2px_0_0_#373737,inset_-2px_-2px_0_0_#ffffff]';
const navSlot = `${slotBase} cursor-pointer hover:brightness-110`;
const iconImg = 'w-[70%] h-[70%] object-contain pixelated';
const slotFillImg = 'w-full h-full object-cover pixelated';

// Item sits at B3, gemstone slots centered on column F (index 5), both on the grid's 3rd row.
const ITEM_ROW = 2;
const ITEM_COL = 1;
const CENTER_COL = 5;

// The item plus one slot per gemstone slot it has. Clicking a slot opens the gem-type picker for that index.
export default function GemstoneSlots() {
  const { slot } = useParams();
  const navigate = useNavigate();
  const { loadout, playerStats } = useBuild();
  const { itemData } = useItemData();
  const { showTooltip, hideTooltip } = useTooltip();
  const item = loadout[slot] && loadout[slot].item;
  const modifiers = loadout[slot] && loadout[slot].modifiers;
  const slotCount = item ? countGemstoneSlots(item.lore) : 0;
  const gemstones = (modifiers && modifiers.gemstones) || [];
  const offsets = gemstoneSlotColumnOffsets(slotCount);

  const hoverTokenRef = useRef(0);
  async function handleItemHover(e) {
    if (!item) return;
    const anchor = e.currentTarget;
    const token = ++hoverTokenRef.current;
    const lines = await buildFullItemTooltipLines(item, modifiers, itemData, playerStats.catacombsLevel, playerStats.tamingLevel);
    if (hoverTokenRef.current === token) showTooltip(lines, anchor);
  }
  function handleItemLeave() {
    hoverTokenRef.current++;
    hideTooltip();
  }

  const cells = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 9; col++) {
      const key = `${row}-${col}`;

      if (row === ITEM_ROW && col === ITEM_COL) {
        cells.push(
          <div key={key} className={`${slotBase} cursor-default`} onMouseEnter={handleItemHover} onMouseLeave={handleItemLeave}>
            {item && <WeaponIcon id={item.id} material={item.material} alt={item.name} className={iconImg} />}
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
            onClick={() => navigate(`/gemstones/${slot}/${slotIdx}`)}
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
          <div key={key} className={navSlot} title="Close" onClick={() => navigate(`/hex/${slot}`)}>
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
        <h1 className="text-xl font-bold">SkyDmg — Gemstones</h1>
      </header>

      <div className="w-full max-w-[700px] text-[13px] text-neutral-300 mb-2.5">
        {!item
          ? 'No item selected — go back and pick one.'
          : slotCount === 0
            ? 'This item has no Gemstone Slots.'
            : `${formatItemName(item.name)} — ${slotCount} Gemstone Slot${slotCount === 1 ? '' : 's'}`}
      </div>

      <div className="w-full max-w-[700px] overflow-x-auto">
        <div className="grid grid-cols-9 grid-rows-6 gap-[3px] w-full min-w-[380px] aspect-[9/6] bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black p-2">
          {cells}
        </div>
      </div>
    </div>
  );
}

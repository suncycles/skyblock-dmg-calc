import { useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useTooltip } from '../context/TooltipContext';
import { rarityColorCode, formatItemName } from '../lib/mcText';
import { ARMOR_SLOTS, ARMOR_SLOT_LABELS } from '../lib/armorSlots';
import { SLOT_TEXTURES } from '../lib/icons';
import WeaponIcon from '../components/WeaponIcon';

const slotBase =
  'flex items-center justify-center bg-[#8b8b8b] shadow-[inset_2px_2px_0_0_#373737,inset_-2px_-2px_0_0_#ffffff]';
const navSlot = `${slotBase} cursor-pointer hover:brightness-110`;
const iconImg = 'w-[70%] h-[70%] object-contain pixelated';
const slotFillImg = 'w-full h-full object-cover pixelated';

// 4 armor slots laid out in one centered row, same chest-GUI grid
// convention as every other Hex sub-screen. An equipped slot opens straight
// into Hex to keep modifying it; an empty slot opens the item picker for
// that piece first — mirroring how re-picking the weapon already requires
// leaving Hex (there's no in-Hex "swap item" shortcut for weapons either).
const SLOT_COLUMNS = [1, 3, 5, 7];

export default function ArmorSlotPicker() {
  const navigate = useNavigate();
  const { loadout } = useBuild();
  const { showTooltip, hideTooltip } = useTooltip();

  function handleSlotClick(slot) {
    navigate(loadout[slot] ? `/hex/${slot}` : `/armor/${slot}`);
  }

  function handleHover(slot, e) {
    const equipped = loadout[slot];
    if (!equipped) {
      showTooltip([`§7${ARMOR_SLOT_LABELS[slot]}`, '§8Empty — click to pick one'], e.currentTarget);
      return;
    }
    const { item } = equipped;
    showTooltip([`§${rarityColorCode(item.tier)}${formatItemName(item.name)}`], e.currentTarget);
  }

  const equippedCount = ARMOR_SLOTS.filter((slot) => loadout[slot]).length;

  const cells = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 9; col++) {
      const key = `${row}-${col}`;
      const slotIdx = row === 2 ? SLOT_COLUMNS.indexOf(col) : -1;

      if (slotIdx !== -1) {
        const slot = ARMOR_SLOTS[slotIdx];
        const equipped = loadout[slot];
        cells.push(
          <div
            key={key}
            className={`${slotBase} relative cursor-pointer hover:brightness-110 ${equipped ? 'bg-green-400' : ''}`}
            onClick={() => handleSlotClick(slot)}
            onMouseEnter={(e) => handleHover(slot, e)}
            onMouseLeave={hideTooltip}
          >
            {equipped ? (
              <WeaponIcon id={equipped.item.id} material={equipped.item.material} alt={equipped.item.name} className={iconImg} />
            ) : (
              <img src={SLOT_TEXTURES.emptyGemSlot} alt="" className={slotFillImg} />
            )}
            <span className="absolute bottom-0.5 left-0 right-0 text-center text-[9px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
              {ARMOR_SLOT_LABELS[slot]}
            </span>
          </div>,
        );
      } else if (row === 4 && col === 4) {
        cells.push(
          <div key={key} className={navSlot} title="Back" onClick={() => navigate('/')}>
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
        <h1 className="text-xl font-bold">The Hex — Armor</h1>
      </header>

      <div className="w-full max-w-[700px] text-[13px] text-neutral-300 mb-2.5">
        {equippedCount}/4 armor pieces equipped
      </div>

      <div className="w-full max-w-[700px] overflow-x-auto">
        <div className="grid grid-cols-9 grid-rows-6 gap-[3px] w-full min-w-[380px] aspect-[9/6] bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black p-2">
          {cells}
        </div>
      </div>
    </div>
  );
}

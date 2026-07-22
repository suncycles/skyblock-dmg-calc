import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useItemData } from '../context/ItemDataContext';
import { useBuild } from '../context/BuildContext';
import { useTooltip } from '../context/TooltipContext';
import { formatItemName } from '../lib/mcText';
import { getVariantTierItems } from '../lib/armorVariants';
import { ARMOR_SLOT_LABELS } from '../lib/armorSlots';
import { SLOT_TEXTURES } from '../lib/icons';
import WeaponIcon from '../components/WeaponIcon';

const slotBase =
  'flex items-center justify-center bg-[#8b8b8b] shadow-[inset_2px_2px_0_0_#373737,inset_-2px_-2px_0_0_#ffffff]';
const navSlot = `${slotBase} cursor-pointer hover:brightness-110`;
const iconImg = 'w-[70%] h-[70%] object-contain pixelated';
const slotFillImg = 'w-full h-full object-cover pixelated';

// Step 2 of picking one of the 5 Blaze Slayer variant families (see
// lib/armorVariants.js) — choose the power tier, real lore shown on hover
// straight from the already-bundled itemData.armor (no fetch needed,
// unlike pets' on-demand fetchNeuItem).
export default function ArmorVariantTierPicker() {
  const { slot, family } = useParams();
  const navigate = useNavigate();
  const { itemData } = useItemData();
  const { selectItem } = useBuild();
  const { showTooltip, hideTooltip } = useTooltip();

  const tiers = useMemo(() => getVariantTierItems(itemData.armor, family, slot), [itemData.armor, family, slot]);
  const label = ARMOR_SLOT_LABELS[slot] || 'Armor';
  const familyLabel = family ? family.charAt(0) + family.slice(1).toLowerCase() : '';

  function handleSelect(item) {
    selectItem(slot, item);
    navigate(`/hex/${slot}`);
  }

  function handleHover(item, e) {
    showTooltip([formatItemName(item.name), ...(item.lore || [])], e.currentTarget);
  }

  const cells = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 9; col++) {
      const key = `${row}-${col}`;

      // 5 tier cells centered in the middle row (cols 2-6).
      if (row === 2 && col >= 2 && col <= 6) {
        const item = tiers[col - 2];
        if (item) {
          cells.push(
            <div
              key={key}
              className={`${slotBase} relative cursor-pointer hover:brightness-110`}
              onClick={() => handleSelect(item)}
              onMouseEnter={(e) => handleHover(item, e)}
              onMouseLeave={hideTooltip}
            >
              <WeaponIcon id={item.id} material={item.material} alt={item.name} className={iconImg} />
              <span className="absolute bottom-0.5 left-0 right-0 text-center text-[9px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                {item.tierLabel}
              </span>
            </div>,
          );
          continue;
        }
        cells.push(
          <div key={key} className={slotBase}>
            <img src={SLOT_TEXTURES.empty} alt="" className={slotFillImg} />
          </div>,
        );
        continue;
      }

      if (row === 5 && col === 4) {
        cells.push(
          <div key={key} className={navSlot} title="Back" onClick={() => navigate(`/armor/${slot}`)}>
            <img src={SLOT_TEXTURES.close} alt="Back" className={iconImg} />
          </div>,
        );
        continue;
      }

      cells.push(
        <div key={key} className={slotBase}>
          <img src={SLOT_TEXTURES.filler} alt="" className={slotFillImg} />
        </div>,
      );
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <header className="w-full max-w-[700px] mb-4">
        <h1 className="text-xl font-bold">
          The Hex — {familyLabel} {label} Tier
        </h1>
      </header>

      <div className="w-full max-w-[700px] overflow-x-auto">
        <div className="grid grid-cols-9 grid-rows-6 gap-[3px] w-full min-w-[380px] aspect-[9/6] bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black p-2">
          {cells}
        </div>
      </div>
    </div>
  );
}

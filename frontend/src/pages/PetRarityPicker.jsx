import { useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useItemData } from '../context/ItemDataContext';
import { useBuild } from '../context/BuildContext';
import { useTooltip } from '../context/TooltipContext';
import { rarityColorCode, formatItemName } from '../lib/mcText';
import {
  derivePetDisplayName,
  getAvailableRarities,
  petLoreItemId,
  computeAllPetStats,
  computeOtherNums,
  substitutePetLore,
} from '../lib/petData';
import { fetchNeuItem } from '../lib/neuItems';
import { SLOT_TEXTURES } from '../lib/icons';
import WeaponIcon from '../components/WeaponIcon';

const slotBase =
  'flex items-center justify-center bg-[#8b8b8b] shadow-[inset_2px_2px_0_0_#373737,inset_-2px_-2px_0_0_#ffffff]';
const navSlot = `${slotBase} cursor-pointer hover:brightness-110`;
const iconImg = 'w-[70%] h-[70%] object-contain pixelated';
const slotFillImg = 'w-full h-full object-cover pixelated';

// Step 2 of picking a pet: choose the rarity, only offering the ones
// petnums.json actually has data for (most pets don't go up to Mythic).
// Hovers a level-1 preview of the real NEU-REPO lore (level itself is set
// after, on PetDetail) — same "preview before you've customized further"
// feel as ReforgesPicker's real stone-lore hover.
export default function PetRarityPicker() {
  const { petId } = useParams();
  const navigate = useNavigate();
  const { itemData } = useItemData();
  const { selectItem } = useBuild();
  const { showTooltip, hideTooltip } = useTooltip();
  const hoveredRarityRef = useRef(null);

  const name = derivePetDisplayName(petId);
  const rarities = useMemo(() => getAvailableRarities(itemData.pets, petId), [itemData.pets, petId]);

  function handleSelect(rarity) {
    selectItem('pet', { id: `${petId}_${rarity}`, petId, name, tier: rarity, material: 'BONE' });
    navigate('/pet/detail');
  }

  function handleHover(rarity, e) {
    const anchor = e.currentTarget;
    hoveredRarityRef.current = rarity;
    const tierColor = rarityColorCode(rarity);
    showTooltip([`§${tierColor}§l${name}`, '', '§7Loading...'], anchor);

    const loreId = petLoreItemId(petId, rarity);
    fetchNeuItem(loreId).then((data) => {
      if (hoveredRarityRef.current !== rarity) return; // moved on before this resolved
      if (data && data.lore && data.lore.length > 0) {
        const levels = itemData.pets?.[petId]?.[rarity];
        const stats = computeAllPetStats(levels, 1);
        const otherNums = computeOtherNums(levels, 1);
        const lore = substitutePetLore(data.lore, 1, stats, otherNums);
        const title = (data.displayname || `§${tierColor}§l${name}`).replace('{LVL}', '1');
        showTooltip([formatItemName(title), ...lore], anchor);
      } else {
        showTooltip([`§${tierColor}§l${name}`, '§7No preview available.'], anchor);
      }
    });
  }

  const cells = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 9; col++) {
      const key = `${row}-${col}`;
      const isInteriorRow = row >= 1 && row <= 4;
      const isInteriorCol = col >= 1 && col <= 7;

      if (isInteriorRow && isInteriorCol) {
        const idx = (row - 1) * 7 + (col - 1);
        const rarity = rarities[idx];
        if (rarity) {
          cells.push(
            <div
              key={key}
              className={`${slotBase} relative cursor-pointer hover:brightness-110`}
              onClick={() => handleSelect(rarity)}
              onMouseEnter={(e) => handleHover(rarity, e)}
              onMouseLeave={() => {
                hoveredRarityRef.current = null;
                hideTooltip();
              }}
            >
              <WeaponIcon id={petId} material="BONE" alt={rarity} className={iconImg} />
              <span className="absolute bottom-0.5 left-0 right-0 text-center text-[9px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                {rarity[0]}
                {rarity.slice(1).toLowerCase()}
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
          <div key={key} className={navSlot} title="Back" onClick={() => navigate('/pet')}>
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
        <h1 className="text-xl font-bold">The Hex — {name} Rarity</h1>
      </header>

      <div className="w-full max-w-[700px] overflow-x-auto">
        <div className="grid grid-cols-9 grid-rows-6 gap-[3px] w-full min-w-[380px] aspect-[9/6] bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black p-2">
          {cells}
        </div>
      </div>
    </div>
  );
}

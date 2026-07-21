import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useItemData } from '../context/ItemDataContext';
import { useBuild } from '../context/BuildContext';
import { useTooltip } from '../context/TooltipContext';
import { rarityColorCode, formatItemName } from '../lib/mcText';
import { petLoreItemId, computeAllPetStats, computeOtherNums, substitutePetLore, MAX_PET_LEVEL } from '../lib/petData';
import { fetchNeuItem } from '../lib/neuItems';
import { SLOT_TEXTURES } from '../lib/icons';
import WeaponIcon from '../components/WeaponIcon';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';
const slotBase =
  'flex items-center justify-center bg-[#8b8b8b] shadow-[inset_2px_2px_0_0_#373737,inset_-2px_-2px_0_0_#ffffff]';

// Compact panel, not the 6x9 chest grid — a level number input and a
// pick-one pet-item row don't fit the grid paradigm any better here than
// SpecialPicker's price/tier inputs did, so this follows that same
// precedent instead. Hovering the pet itself shows its real NEU-REPO
// lore (see lib/petData.js's petLoreItemId/substitutePetLore) with
// {LVL}/stat/ability-number placeholders filled in for the current
// level — same real-tooltip convention as every equipped item elsewhere
// in the app, rather than a synthesized stat list.
export default function PetDetail() {
  const navigate = useNavigate();
  const { itemData } = useItemData();
  const { loadout, setPetLevel, setPetItem } = useBuild();
  const { showTooltip, hideTooltip } = useTooltip();
  const hoveringPetRef = useRef(false);
  const hoveringItemRef = useRef(false);
  const pet = loadout.pet && loadout.pet.item;
  const level = (loadout.pet && loadout.pet.modifiers && loadout.pet.modifiers.level) || 1;
  const petItemId = loadout.pet && loadout.pet.modifiers && loadout.pet.modifiers.petItem;
  const petItem = petItemId ? (itemData.petItems || []).find((i) => i.id === petItemId) : null;

  if (!pet) {
    return (
      <div className="min-h-screen flex flex-col items-center p-4">
        <header className="w-full max-w-[700px] mb-4">
          <h1 className="text-xl font-bold">The Hex — Pet</h1>
        </header>
        <div className="w-full max-w-[700px] text-[13px] text-neutral-300 mb-2.5">No pet selected.</div>
        <button
          className={`${panel} px-4 py-2 cursor-pointer hover:brightness-110 flex items-center gap-2`}
          onClick={() => navigate('/pet')}
        >
          <img src={SLOT_TEXTURES.close} alt="Back" className="w-5 h-5" />
          Back
        </button>
      </div>
    );
  }

  function handleLevelChange(e) {
    const num = Math.max(1, Math.min(MAX_PET_LEVEL, Number(e.target.value) || 1));
    setPetLevel(num);
  }

  function handlePetHover(e) {
    const anchor = e.currentTarget;
    hoveringPetRef.current = true;
    const tierColor = rarityColorCode(pet.tier);
    showTooltip([`§${tierColor}§l${pet.name}`, '', '§7Loading...'], anchor);

    const loreId = petLoreItemId(pet.petId, pet.tier);
    fetchNeuItem(loreId).then((data) => {
      if (!hoveringPetRef.current) return; // moved on before this resolved
      if (data && data.lore && data.lore.length > 0) {
        const levels = itemData.pets?.[pet.petId]?.[pet.tier];
        const stats = computeAllPetStats(levels, level);
        const otherNums = computeOtherNums(levels, level);
        const lore = substitutePetLore(data.lore, level, stats, otherNums);
        const title = (data.displayname || `§${tierColor}§l${pet.name}`).replace('{LVL}', String(level));
        showTooltip([formatItemName(title), ...lore], anchor);
      } else {
        showTooltip([`§${tierColor}§l[Lvl ${level}] ${pet.name}`, '§7No lore available.'], anchor);
      }
    });
  }

  function handleItemHover(e) {
    if (!petItem) return;
    const anchor = e.currentTarget;
    hoveringItemRef.current = true;
    showTooltip([formatItemName(petItem.name), '', '§7Loading...'], anchor);
    fetchNeuItem(petItem.id).then((data) => {
      if (!hoveringItemRef.current) return;
      if (data && data.lore && data.lore.length > 0) {
        showTooltip([data.displayname || formatItemName(petItem.name), ...data.lore], anchor);
      } else {
        showTooltip([formatItemName(petItem.name), ...petItem.lore], anchor);
      }
    });
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <header className="w-full max-w-[700px] mb-4">
        <h1 className="text-xl font-bold">The Hex — Pet</h1>
      </header>

      <div className={`${panel} w-full max-w-[500px] p-6 flex flex-col gap-4`}>
        <div className="flex items-center gap-3">
          <div
            className={`${slotBase} w-12 h-12 cursor-default`}
            onMouseEnter={handlePetHover}
            onMouseLeave={() => {
              hoveringPetRef.current = false;
              hideTooltip();
            }}
          >
            <WeaponIcon id={pet.id} material={pet.material} alt={pet.name} className="w-[70%] h-[70%] object-contain pixelated" />
          </div>
          <div className="font-bold text-lg" style={{ color: MC_HEX[rarityColorCode(pet.tier)] }}>
            {formatItemName(pet.name)}
          </div>
        </div>

        <label className="text-sm font-bold text-black" htmlFor="pet-level">
          Level (1-{MAX_PET_LEVEL})
        </label>
        <input
          id="pet-level"
          type="number"
          min="1"
          max={MAX_PET_LEVEL}
          step="1"
          value={level}
          onChange={handleLevelChange}
          className="px-3 py-2 bg-black text-white border-2 border-neutral-700"
        />
        <div className="text-xs text-neutral-700">Hover the pet above for its full stats and abilities at this level.</div>

        <div className="flex items-center justify-between gap-3 border-t border-neutral-500 pt-4">
          <div
            className="text-sm text-black cursor-default"
            onMouseEnter={handleItemHover}
            onMouseLeave={() => {
              hoveringItemRef.current = false;
              hideTooltip();
            }}
          >
            Pet Item: {petItem ? formatItemName(petItem.name) : 'None'}
          </div>
          <div className="flex gap-2">
            <button
              className="px-3 py-1.5 bg-neutral-800 text-white text-sm cursor-pointer hover:brightness-110"
              onClick={() => navigate('/pet/item')}
            >
              Change
            </button>
            {petItem && (
              <button
                className="px-3 py-1.5 bg-neutral-800 text-white text-sm cursor-pointer hover:brightness-110"
                onClick={() => setPetItem(null)}
              >
                Remove
              </button>
            )}
          </div>
        </div>

        <button
          className="self-start px-4 py-2 bg-neutral-800 text-white cursor-pointer hover:brightness-110"
          onClick={() => navigate('/pet')}
        >
          Back
        </button>
      </div>
    </div>
  );
}

const MC_HEX = {
  0: '#000000', 1: '#0000aa', 2: '#00aa00', 3: '#00aaaa',
  4: '#aa0000', 5: '#aa00aa', 6: '#ffaa00', 7: '#aaaaaa',
  8: '#555555', 9: '#5555ff', a: '#55ff55', b: '#55ffff',
  c: '#ff5555', d: '#ff55ff', e: '#ffff55', f: '#ffffff',
};

import { useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useItemData } from '../context/ItemDataContext';
import { useBuild } from '../context/BuildContext';
import { useTooltip } from '../context/TooltipContext';
import { rarityColorCode, formatItemName, parseMinecraftLine } from '../lib/mcText';
import { computePetStats, MAX_PET_LEVEL } from '../lib/petData';
import { STAT_LABELS, formatStatValue } from '../lib/reforgeData';
import { fetchNeuItem } from '../lib/neuItems';
import { SLOT_TEXTURES } from '../lib/icons';
import WeaponIcon from '../components/WeaponIcon';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

// Compact panel, not the 6x9 chest grid — a level number input and a
// pick-one pet-item row don't fit the grid paradigm any better here than
// SpecialPicker's price/tier inputs did, so this follows that same
// precedent instead.
export default function PetDetail() {
  const navigate = useNavigate();
  const { itemData } = useItemData();
  const { loadout, setPetLevel, setPetItem } = useBuild();
  const { showTooltip, hideTooltip } = useTooltip();
  const hoveringItemRef = useRef(false);
  const pet = loadout.pet && loadout.pet.item;
  const level = (loadout.pet && loadout.pet.modifiers && loadout.pet.modifiers.level) || 1;
  const petItemId = loadout.pet && loadout.pet.modifiers && loadout.pet.modifiers.petItem;

  // BuildContext only persists a lean {id, petId, name, material, tier}
  // for the pet slot (no point duplicating the whole stat blob into
  // localStorage) — the actual level1/level100 stat checkpoints are
  // looked back up fresh from itemData.pets by (petId, tier) here.
  const statSource = useMemo(() => {
    if (!pet) return null;
    const byRarity = itemData.pets && itemData.pets[pet.petId];
    const levels = byRarity && byRarity[pet.tier];
    if (!levels) return null;
    return { level1Stats: levels['1'].statNums || {}, level100Stats: levels['100'].statNums || {} };
  }, [pet, itemData.pets]);

  const stats = useMemo(() => computePetStats(statSource, level), [statSource, level]);
  const petItem = useMemo(
    () => (petItemId ? (itemData.petItems || []).find((i) => i.id === petItemId) : null),
    [petItemId, itemData.petItems],
  );

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

  const statLines = Object.entries(stats).map(([statKey, value]) => {
    const meta = STAT_LABELS[statKey];
    return `§7${meta.label}: §${meta.color}${formatStatValue(statKey, value)}`;
  });

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <header className="w-full max-w-[700px] mb-4">
        <h1 className="text-xl font-bold">The Hex — Pet</h1>
      </header>

      <div className={`${panel} w-full max-w-[500px] p-6 flex flex-col gap-4`}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 flex items-center justify-center bg-[#8b8b8b] shadow-[inset_2px_2px_0_0_#373737,inset_-2px_-2px_0_0_#ffffff]">
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

        <div className="flex flex-col gap-1">
          {statLines.length === 0 ? (
            <div className="text-sm text-neutral-700">No combat stats for this pet.</div>
          ) : (
            statLines.map((line, i) => <McLine key={i} line={line} />)
          )}
        </div>

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

// Same rarity color table mcText.js's rarityColorCode() maps codes into —
// duplicated as a §-code -> hex lookup (rather than a rarity -> hex one)
// since McLine needs to color arbitrary §-coded segments, not just rarity.
const MC_HEX = {
  0: '#000000', 1: '#0000aa', 2: '#00aa00', 3: '#00aaaa',
  4: '#aa0000', 5: '#aa00aa', 6: '#ffaa00', 7: '#aaaaaa',
  8: '#555555', 9: '#5555ff', a: '#55ff55', b: '#55ffff',
  c: '#ff5555', d: '#ff55ff', e: '#ffff55', f: '#ffffff',
};

// Renders one already-§-colored lore-style line as plain colored text
// (this panel isn't the game-styled tooltip overlay, just inline text) —
// reuses mcText.js's parseMinecraftLine rather than re-parsing §-codes.
function McLine({ line }) {
  const segments = parseMinecraftLine(line);
  return (
    <div className="text-sm font-mono">
      {segments.map((seg, i) => (
        <span key={i} style={{ color: seg.color, fontWeight: seg.bold ? 'bold' : 'normal' }}>
          {seg.text}
        </span>
      ))}
    </div>
  );
}

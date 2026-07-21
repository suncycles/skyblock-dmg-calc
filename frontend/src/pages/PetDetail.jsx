import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useItemData } from '../context/ItemDataContext';
import { useBuild } from '../context/BuildContext';
import { rarityColorCode, formatItemName, parseMinecraftLine } from '../lib/mcText';
import { petLoreItemId, computeAllPetStats, computeOtherNums, substitutePetLore, getMaxPetLevel, MAX_PET_LEVEL } from '../lib/petData';
import { fetchNeuItem } from '../lib/neuItems';
import { SLOT_TEXTURES } from '../lib/icons';
import WeaponIcon from '../components/WeaponIcon';
import McTooltipLines from '../components/McTooltipLines';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';
const slotBase =
  'flex items-center justify-center bg-[#8b8b8b] shadow-[inset_2px_2px_0_0_#373737,inset_-2px_-2px_0_0_#ffffff]';

// Compact panel, not the 6x9 chest grid — a level number input and a
// pick-one pet-item row don't fit the grid paradigm any better here than
// SpecialPicker's price/tier inputs did, so this follows that same
// precedent instead. The pet's real NEU-REPO lore (see lib/petData.js's
// petLoreItemId/substitutePetLore) is shown permanently side-by-side
// with the controls, not behind a hover — {LVL}/stat/ability-number
// placeholders filled in for the current level, same real-tooltip
// convention as every equipped item elsewhere in the app.
export default function PetDetail() {
  const navigate = useNavigate();
  const { itemData } = useItemData();
  const { loadout, setPetLevel, setPetItem } = useBuild();
  const pet = loadout.pet && loadout.pet.item;
  const level = (loadout.pet && loadout.pet.modifiers && loadout.pet.modifiers.level) ?? 0;
  const petItemId = loadout.pet && loadout.pet.modifiers && loadout.pet.modifiers.petItem;
  const petItem = petItemId ? (itemData.petItems || []).find((i) => i.id === petItemId) : null;
  const maxLevel = pet ? getMaxPetLevel(pet.petId) : MAX_PET_LEVEL;

  // Decoupled from `level` itself so the field can sit empty mid-edit
  // (e.g. backspacing "1" to retype "29") without every keystroke
  // snapping it back to a clamped number — only committed to
  // BuildContext (and re-synced here) once it parses to a real number,
  // and normalized to "0" on blur if left empty. 0 doesn't exist as a
  // real pet level in-game, but is allowed here as the empty state.
  const [levelInput, setLevelInput] = useState(String(level));
  useEffect(() => {
    setLevelInput(String(level));
  }, [level]);

  const loreId = pet ? petLoreItemId(pet.petId, pet.tier) : null;
  const [rawLore, setRawLore] = useState(null); // null = loading, false = fetch failed, {displayname, lore} = real data
  useEffect(() => {
    if (!loreId) return;
    let cancelled = false;
    setRawLore(null);
    fetchNeuItem(loreId).then((data) => {
      if (!cancelled) setRawLore(data && data.lore && data.lore.length > 0 ? data : false);
    });
    return () => {
      cancelled = true;
    };
  }, [loreId]);

  const tooltipLines = useMemo(() => {
    if (!pet) return [];
    const tierColor = rarityColorCode(pet.tier);
    if (rawLore === null) return [`§${tierColor}§l${pet.name}`, '', '§7Loading...'];
    if (rawLore === false) return [`§${tierColor}§l[Lvl ${level}] ${pet.name}`, '§7No lore available.'];
    const levels = itemData.pets?.[pet.petId]?.[pet.tier];
    const stats = computeAllPetStats(levels, level, maxLevel);
    const otherNums = computeOtherNums(levels, level, maxLevel);
    const lore = substitutePetLore(rawLore.lore, level, stats, otherNums);
    const title = (rawLore.displayname || `§${tierColor}§l${pet.name}`).replace('{LVL}', String(level));
    return [formatItemName(title), ...lore];
  }, [pet, rawLore, level, maxLevel, itemData.pets]);

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
    const raw = e.target.value;
    setLevelInput(raw);
    if (raw === '') return; // let it sit empty mid-edit; committed on blur
    const num = Number(raw);
    if (Number.isNaN(num)) return;
    const clamped = Math.max(0, Math.min(maxLevel, Math.floor(num)));
    setPetLevel(clamped);
    // Only the out-of-range case needs an explicit re-sync: if `clamped`
    // happens to equal whatever `level` already was (e.g. typing "250"
    // when already at the 200 cap), the level-changed effect below won't
    // fire (the number genuinely didn't change), so the field would
    // otherwise keep showing the raw unclamped "250" forever.
    if (clamped !== num) setLevelInput(String(clamped));
  }

  function handleLevelBlur() {
    if (levelInput === '' || Number.isNaN(Number(levelInput))) {
      setLevelInput('0');
      setPetLevel(0);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <header className="w-full max-w-[700px] mb-4">
        <h1 className="text-xl font-bold">The Hex — Pet</h1>
      </header>

      <div className="w-full max-w-[900px] flex flex-wrap items-start gap-4">
        <div className={`${panel} p-6 flex flex-col gap-4 w-full max-w-[500px]`}>
          <div className="flex items-center gap-3">
            <div className={`${slotBase} w-12 h-12`}>
              {/* icon keyed by the bare species id (pet.id is "<petId>_<rarity>") —
                  every rarity shares one baked head icon, see
                  worker/scripts/apply-skull-head-icons.mjs */}
              <WeaponIcon id={pet.petId} material={pet.material} alt={pet.name} className="w-[70%] h-[70%] object-contain pixelated" />
            </div>
            <div className="font-bold text-lg" style={{ color: MC_HEX[rarityColorCode(pet.tier)] }}>
              {formatItemName(pet.name)}
            </div>
          </div>

          <label className="text-sm font-bold text-black" htmlFor="pet-level">
            Level (0-{maxLevel})
          </label>
          <input
            id="pet-level"
            type="number"
            min="0"
            max={maxLevel}
            step="1"
            value={levelInput}
            onChange={handleLevelChange}
            onBlur={handleLevelBlur}
            className="px-3 py-2 bg-black text-white border-2 border-neutral-700"
          />

          <div className="flex items-center justify-between gap-3 border-t border-neutral-500 pt-4">
            <div className="text-sm text-black">Pet Item: {petItem ? formatItemName(petItem.name) : 'None'}</div>
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

        <div className="mc-tooltip" style={{ position: 'static' }}>
          <McTooltipLines parsedLines={tooltipLines.map(parseMinecraftLine)} />
        </div>
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

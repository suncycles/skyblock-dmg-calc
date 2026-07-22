import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useItemData } from '../context/ItemDataContext';
import { useBuild } from '../context/BuildContext';
import { useTooltip } from '../context/TooltipContext';
import { rarityColorCode, formatItemName, parseMinecraftLine } from '../lib/mcText';
import { petLoreItemId, buildPetTooltipLines, getMaxPetLevel, MAX_PET_LEVEL } from '../lib/petData';
import { fetchNeuItem } from '../lib/neuItems';
import { parseShorthandNumber } from '../lib/numberInput';
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
  const { loadout, setPetLevel, setPetItem, setPetBankCoins } = useBuild();
  const { hideTooltip } = useTooltip();

  // This page shows its own tooltip permanently, inline (see the mc-tooltip
  // side panel below) rather than on hover — but a hover-triggered
  // tooltip from whatever was last hovered on the previous page (e.g. a
  // rarity cell on PetRarityPicker, clicked to navigate here) can still be
  // showing when this page mounts, since a click-driven route change
  // doesn't fire a natural mouseleave to clear it. Explicitly clear it on
  // mount so it can never show duplicated alongside the inline one.
  useEffect(() => {
    hideTooltip();
  }, [hideTooltip]);
  const pet = loadout.pet && loadout.pet.item;
  const level = (loadout.pet && loadout.pet.modifiers && loadout.pet.modifiers.level) ?? 0;
  const petItemId = loadout.pet && loadout.pet.modifiers && loadout.pet.modifiers.petItem;
  const petItem = petItemId ? (itemData.petItems || []).find((i) => i.id === petItemId) : null;
  const bankCoins = (loadout.pet && loadout.pet.modifiers && loadout.pet.modifiers.bankCoins) || 0;
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

  // Shared with Landing's hover tooltip (lib/petData.js's
  // buildPetTooltipLines) so both show the exact same real-lore-with-
  // stats-substituted content for the same pet.
  const tooltipLines = useMemo(() => {
    if (!pet || !loadout.pet) return [];
    return buildPetTooltipLines(pet, loadout.pet.modifiers, itemData, rawLore);
  }, [pet, loadout.pet, itemData, rawLore]);

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

      <div className="w-full max-w-[560px] flex flex-wrap items-start gap-2">
        <div className={`${panel} p-3 flex flex-col gap-2 w-full max-w-[260px] text-[13px]`}>
          <div className="flex items-center gap-2">
            <div className={`${slotBase} w-8 h-8`}>
              {/* icon keyed by the bare species id (pet.id is "<petId>_<rarity>") —
                  every rarity shares one baked head icon, see
                  worker/scripts/apply-skull-head-icons.mjs */}
              <WeaponIcon id={pet.petId} material={pet.material} alt={pet.name} className="w-[70%] h-[70%] object-contain pixelated" />
            </div>
            <div className="font-bold text-sm" style={{ color: MC_HEX[rarityColorCode(pet.tier)] }}>
              {formatItemName(pet.name)}
            </div>
          </div>

          <label className="text-xs font-bold text-black" htmlFor="pet-level">
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
            className="px-2 py-1 text-sm bg-black text-white border-2 border-neutral-700"
          />

          <div className="flex items-center justify-between gap-2 border-t border-neutral-500 pt-2">
            <div className="text-xs text-black">Pet Item: {petItem ? formatItemName(petItem.name) : 'None'}</div>
            <div className="flex gap-1">
              <button
                className="px-2 py-1 bg-neutral-800 text-white text-xs cursor-pointer hover:brightness-110"
                onClick={() => navigate('/pet/item')}
              >
                Change
              </button>
              {petItem && (
                <button
                  className="px-2 py-1 bg-neutral-800 text-white text-xs cursor-pointer hover:brightness-110"
                  onClick={() => setPetItem(null)}
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          {/* Legendary Treasure ("Gain X% damage for every million coins
              in your bank, Max Y%") is the one Golden Dragon perk with a
              real, fixed formula (see lib/damageSources.js) — every other
              perk either isn't a damage bonus or depends on state this app
              doesn't track (Magic Find, Gold Collection), so this is the
              only pet-specific input, shown only for this one species. */}
          {pet.petId === 'GOLDEN_DRAGON' && (
            <div className="border-t border-neutral-500 pt-2">
              <label className="text-xs font-bold text-black" htmlFor="pet-bank-coins">
                Coins in Bank (Legendary Treasure)
              </label>
              <input
                id="pet-bank-coins"
                type="text"
                inputMode="decimal"
                value={bankCoins}
                onChange={(e) => setPetBankCoins(Math.max(0, parseShorthandNumber(e.target.value)))}
                placeholder="e.g. 10m"
                className="w-full px-2 py-1 mt-1 text-sm bg-black text-white border-2 border-neutral-700"
              />
            </div>
          )}

          <div className="flex gap-1">
            <button
              className="px-3 py-1 bg-neutral-800 text-white text-xs cursor-pointer hover:brightness-110"
              onClick={() => navigate('/pet')}
            >
              Back
            </button>
            {/* Detail is 2 levels deep (species list, then rarity) from
                the home grid — a direct shortcut beats clicking Back
                twice. */}
            <button
              className="px-3 py-1 bg-neutral-800 text-white text-xs cursor-pointer hover:brightness-110"
              onClick={() => navigate('/')}
            >
              Home
            </button>
          </div>
        </div>

        <div className="mc-tooltip" style={{ position: 'static', fontSize: '11px', lineHeight: 1.35, maxWidth: 260 }}>
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

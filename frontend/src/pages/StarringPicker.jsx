import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useItemData } from '../context/ItemDataContext';
import { formatItemName, parseMinecraftLine } from '../lib/mcText';
import { getMaxStarsForItem, MASTER_STAR_MIN_BASE_STARS, MAX_MASTER_STARS } from '../lib/starring';
import { buildFullItemTooltipLines } from '../lib/itemTooltip';
import { computeEquippedPetStats, computeItemChimeraBonus, computeManticoreClawBonus } from '../lib/petData';
import { SLOT_TEXTURES } from '../lib/icons';
import McTooltipLines from '../components/McTooltipLines';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

// Dungeon-style Starring: a bounded number input (capped per-item, see lib/starring.js's
// getMaxStarsForItem) plus a live preview of the item's real tooltip — same
// buildFullItemTooltipLines call Hex.jsx's hover tooltip uses, so the Overworld total and the
// Catacombs Boost annotation(s) are both visible while tuning stars.
export default function StarringPicker() {
  const { slot } = useParams();
  const navigate = useNavigate();
  const { loadout, playerStats, setStarCount, setDungeonized, setDungeonizeOldCurve, setMasterStars } = useBuild();
  const { itemData } = useItemData();
  const item = loadout[slot] && loadout[slot].item;
  const modifiers = loadout[slot] && loadout[slot].modifiers;
  const stars = (modifiers && modifiers.stars) || 0;
  const dungeonized = !!(modifiers && modifiers.dungeonized);
  const dungeonizeOldCurve = !!(modifiers && modifiers.dungeonizeOldCurve);
  const masterStars = (modifiers && modifiers.masterStars) || 0;
  const maxStars = getMaxStarsForItem(item);

  const [tooltipLines, setTooltipLines] = useState(null);
  useEffect(() => {
    if (!item || !modifiers || !itemData) {
      setTooltipLines(null);
      return;
    }
    let cancelled = false;
    const petStats = computeEquippedPetStats(loadout, itemData);
    const chimeraBonus = computeItemChimeraBonus(loadout[slot], petStats);
    const manticoreClawBonus = computeManticoreClawBonus(loadout[slot], petStats);
    const potatoBookDoubled = loadout.pet?.item?.petId === 'BLAZE' && loadout.pet?.item?.tier === 'LEGENDARY';
    buildFullItemTooltipLines(
      item,
      modifiers,
      itemData,
      playerStats.catacombsLevel,
      playerStats.tamingLevel,
      playerStats.wolfSlayerLevel,
      chimeraBonus,
      playerStats.generalsMedallionDigits,
      manticoreClawBonus,
      potatoBookDoubled,
    ).then((lines) => {
      if (!cancelled) setTooltipLines(lines);
    });
    return () => {
      cancelled = true;
    };
  }, [item, modifiers, itemData, loadout, slot, playerStats]);

  if (!item) {
    return (
      <div className="min-h-screen flex flex-col items-center p-4 relative">
        <header className="w-full max-w-[700px] mb-4">
          <h1 className="text-xl font-bold">Item Upgrades</h1>
        </header>
        <div className="w-full max-w-[700px] text-[13px] text-neutral-300 mb-2.5">No item selected.</div>
        <button
          className={`${panel} px-4 py-2 cursor-pointer hover:brightness-110 flex items-center gap-2 text-sm font-bold text-black`}
          onClick={() => navigate(-1)}
        >
          <img src={SLOT_TEXTURES.close} alt="Back" className="w-5 h-5" />
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-4 relative">
      <header className="w-full max-w-[700px] mb-4">
        <h1 className="text-xl font-bold">{formatItemName(item.name)}</h1>
      </header>

      <div className={`${panel} w-full max-w-[500px] p-6 flex flex-col gap-4`}>
        {/* Preview. whiteSpace/width override .mc-tooltip's nowrap+max-content sizing (meant for
            the floating hover tooltip) — without it, a single long lore line (e.g. a Floor
            requirement line) forces this static, in-flow box wider than the viewport on mobile. */}
        <div className="mc-tooltip" style={{ position: 'static', fontSize: '13px', whiteSpace: 'normal', width: '100%' }}>
          {tooltipLines ? (
            <McTooltipLines parsedLines={tooltipLines.map(parseMinecraftLine)} />
          ) : (
            <div className="text-neutral-500 text-xs italic">Loading preview…</div>
          )}
        </div>

        {/* Stars */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-bold text-black">Stars (0-{maxStars})</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {Array.from({ length: maxStars }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setStarCount(slot, stars === n ? 0 : n)}
                className={`text-3xl leading-none cursor-pointer transition-colors ${
                  n <= stars ? 'text-amber-400 hover:text-amber-300' : 'text-neutral-600 hover:text-neutral-400'
                }`}
                aria-label={`${n} Star${n > 1 ? 's' : ''}`}
                title={`${n} Star${n > 1 ? 's' : ''}`}
              >
                ✪
              </button>
            ))}
          </div>
        </div>
        <div className="text-sm text-neutral-800">
          +2%/star normally. In a dungeon: +10%/star instead, combined with Catacombs Level, General's Medallion,
          and Master Stars into a separate Catacombs Boost total.
        </div>

        {/* Dungeonize toggle — same bright-on/dark-off skull-icon button style as Damage Sources' "Dungeon" toggle */}
        <button
          type="button"
          onClick={() => setDungeonized(slot, !dungeonized)}
          className={`${panel} px-3 py-2 cursor-pointer flex items-center gap-2 text-sm font-bold text-black transition-[filter] ${
            dungeonized ? 'hover:brightness-110' : 'brightness-50'
          }`}
        >
          <img src="/images/manual/catacombs.webp" alt="" className="w-5 h-5 shrink-0" />
          Dungeonize Item
        </button>
        <div className="text-xs text-neutral-700 -mt-2">
          Shows the Catacombs Boost total (dark grey) and lets the Dungeon toggle use it instead.
        </div>

        {/* Master Stars */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-bold text-black">Master Stars</span>
          {!dungeonized ? (
            <div className="text-xs text-neutral-700">Dungeonize this item to unlock Master Stars.</div>
          ) : stars < MASTER_STAR_MIN_BASE_STARS ? (
            <div className="text-xs text-neutral-700">Master Stars unlock once this item has {MASTER_STAR_MIN_BASE_STARS} base stars.</div>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                {Array.from({ length: MAX_MASTER_STARS }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMasterStars(slot, masterStars === n ? 0 : n)}
                    className={`text-3xl leading-none cursor-pointer transition-colors ${
                      n <= masterStars ? 'text-red-500 hover:text-red-400' : 'text-neutral-600 hover:text-neutral-400'
                    }`}
                    aria-label={`${n} Master Star${n > 1 ? 's' : ''}`}
                    title={`${n} Master Star${n > 1 ? 's' : ''}`}
                  >
                    ✪
                  </button>
                ))}
              </div>
              <div className="text-xs text-neutral-700">
                Each Master Star adds +5% to the Catacombs Boost percentage (on top of Catacombs Level/Catacombs
                Stars/General's Medallion) — only while Damage Sources' "Master" toggle is on. Shown as a separate
                dark-blue total alongside the without-Master one.
              </div>
            </>
          )}
        </div>

        {/* Use old curve */}
        {dungeonized && (
          <label className="flex items-center gap-2 text-sm text-black" htmlFor="dungeonize-old-curve">
            <input
              id="dungeonize-old-curve"
              type="checkbox"
              checked={dungeonizeOldCurve}
              onChange={(e) => setDungeonizeOldCurve(slot, e.target.checked)}
            />
            Use old Catacombs Stat curve (Pre-0.26.1)
          </label>
        )}

        {/* Back */}
        <button
          className="self-start px-4 py-2 bg-neutral-800 text-white cursor-pointer hover:brightness-110"
          onClick={() => navigate(-1)}
        >
          Back
        </button>
      </div>
    </div>
  );
}

import { useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useTooltip } from '../context/TooltipContext';
import { SLOT_TEXTURES, CATEGORY_ICONS, ART_OF_WAR_ICON } from '../lib/icons';
import { BOOK_STAT_BONUS, ART_OF_WAR_STAT_BONUS, ART_OF_WAR_ITEM_ID, ART_OF_WAR_COLOR } from '../lib/books';
import { formatStatValue } from '../lib/reforgeData';
import { fetchNeuItem } from '../lib/neuItems';

const slotBase =
  'flex items-center justify-center bg-[#8b8b8b] shadow-[inset_2px_2px_0_0_#373737,inset_-2px_-2px_0_0_#ffffff]';
const navSlot = `${slotBase} cursor-pointer hover:brightness-110`;
const iconImg = 'w-[70%] h-[70%] object-contain pixelated';
const slotFillImg = 'w-full h-full object-cover pixelated';

const MAX_BOOKS = 15;

// Hot Potato Book (up to 10) and Fuming Potato Book (extends the same
// counter to 15) grant an identical bonus per application and share one
// combined limit in the real game — see lib/books.js — so this is a single
// "how many total" picker, not two separate counters. Same grid-of-levels
// UX as EnchantLevels.jsx: pick a count, apply, back out.
export default function BooksPicker() {
  const { slot } = useParams();
  const navigate = useNavigate();
  const { loadout, setBookCount, toggleArtOfWar } = useBuild();
  const { showTooltip, hideTooltip } = useTooltip();
  const current = loadout[slot]?.modifiers?.books || 0;
  const artOfWarApplied = Boolean(loadout[slot]?.modifiers?.artOfWar);
  const hoveringArtOfWarRef = useRef(false);

  function handleSelect(count) {
    setBookCount(slot, count);
    navigate(-1);
  }

  function tooltipLines(count) {
    const strength = BOOK_STAT_BONUS.strength * count;
    const damage = BOOK_STAT_BONUS.damage * count;
    return [
      `§5${count} Potato Book${count === 1 ? '' : 's'}`,
      '',
      `§7Grants §c${formatStatValue('strength', strength)} Strength §7and`,
      `§c${formatStatValue('damage', damage)} Damage§7.`,
    ];
  }

  // Fallback if the live NEU-REPO fetch fails — synthesized from the same
  // stat table applyBooksToLore uses, colored to match its §6 annotation.
  function artOfWarFallbackLines() {
    return [
      `§${ART_OF_WAR_COLOR}The Art of War`,
      '',
      `§7Grants §c${formatStatValue('strength', ART_OF_WAR_STAT_BONUS.strength)} Strength §7when applied.`,
    ];
  }

  // The Art of War's real item lore (ability text, flavor quote, rarity
  // tag) is fetched live from NEU-REPO, same on-hover pattern as
  // ReforgesPicker's stone tooltips — see lib/neuItems.js.
  function handleArtOfWarHover(e) {
    const anchor = e.currentTarget;
    hoveringArtOfWarRef.current = true;
    showTooltip([`§${ART_OF_WAR_COLOR}The Art of War`, '', '§7Loading...'], anchor);

    fetchNeuItem(ART_OF_WAR_ITEM_ID).then((data) => {
      if (!hoveringArtOfWarRef.current) return; // moved on before this resolved
      if (data && data.lore && data.lore.length > 0) {
        showTooltip([data.displayname || `§${ART_OF_WAR_COLOR}The Art of War`, ...data.lore], anchor);
      } else {
        showTooltip(artOfWarFallbackLines(), anchor);
      }
    });
  }

  function handleArtOfWarLeave() {
    hoveringArtOfWarRef.current = false;
    hideTooltip();
  }

  const cells = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 9; col++) {
      const key = `${row}-${col}`;
      const isInteriorRow = row >= 1 && row <= 4;
      const isInteriorCol = col >= 1 && col <= 7;

      if (isInteriorRow && isInteriorCol) {
        const count = (row - 1) * 7 + (col - 1) + 1;
        if (count <= MAX_BOOKS) {
          const isApplied = current === count;
          cells.push(
            <div
              key={key}
              className={`${slotBase} relative cursor-pointer hover:brightness-110 ${isApplied ? 'bg-green-400' : ''}`}
              onClick={() => handleSelect(count)}
              onMouseEnter={(e) => showTooltip(tooltipLines(count), e.currentTarget)}
              onMouseLeave={hideTooltip}
            >
              <img src={CATEGORY_ICONS.Books} alt={`${count} books`} className={iconImg} />
              <span className="absolute bottom-0.5 right-1 text-xs font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                {count}
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
      } else if (row === 5 && col === 1) {
        cells.push(
          <div
            key={key}
            className={`${navSlot} ${artOfWarApplied ? 'bg-green-400' : ''}`}
            title="The Art of War — click to toggle"
            onClick={() => toggleArtOfWar(slot)}
            onMouseEnter={handleArtOfWarHover}
            onMouseLeave={handleArtOfWarLeave}
          >
            <img src={ART_OF_WAR_ICON} alt="The Art of War" className={iconImg} />
          </div>,
        );
      } else if (row === 5 && col === 3 && current > 0) {
        cells.push(
          <div
            key={key}
            className={navSlot}
            title="Remove Books"
            onClick={() => handleSelect(0)}
          >
            🗑️
          </div>,
        );
      } else if (row === 5 && col === 4) {
        cells.push(
          <div key={key} className={navSlot} title="Back" onClick={() => navigate(-1)}>
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
        <h1 className="text-xl font-bold">The Hex — Books</h1>
      </header>

      <div className="w-full max-w-[700px] text-[13px] text-neutral-300 mb-2.5">
        {current === 0 ? 'No Potato Books applied.' : `${current} Potato Book${current === 1 ? '' : 's'} applied.`}
        {artOfWarApplied ? ' The Art of War applied.' : ''}
      </div>

      <div className="w-full max-w-[700px] overflow-x-auto">
        <div className="grid grid-cols-9 grid-rows-6 gap-[3px] w-full min-w-[380px] aspect-[9/6] bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black p-2">
          {cells}
        </div>
      </div>
    </div>
  );
}

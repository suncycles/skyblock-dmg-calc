import { useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useTooltip } from '../context/TooltipContext';
import { SLOT_TEXTURES, CATEGORY_ICONS, ART_OF_WAR_ICON } from '../lib/icons';
import {
  WEAPON_BOOK_STAT_BONUS,
  ARMOR_BOOK_STAT_BONUS,
  ART_OF_WAR_STAT_BONUS,
  ART_OF_WAR_ITEM_ID,
  ART_OF_WAR_COLOR,
  ART_OF_PEACE_STAT_BONUS,
  ART_OF_PEACE_ITEM_ID,
  ART_OF_PEACE_COLOR,
} from '../lib/books';
import { getGearType } from '../lib/gearType';
import { formatStatValue } from '../lib/reforgeData';
import { fetchNeuItem } from '../lib/neuItems';

const slotBase =
  'flex items-center justify-center bg-[#8b8b8b] shadow-[inset_2px_2px_0_0_#373737,inset_-2px_-2px_0_0_#ffffff]';
const navSlot = `${slotBase} cursor-pointer hover:brightness-110`;
const iconImg = 'w-[70%] h-[70%] object-contain pixelated';
const slotFillImg = 'w-full h-full object-cover pixelated';

const MAX_BOOKS = 15;

// Hot/Fuming Potato Books share one combined 0-15 counter (identical bonus per application).
export default function BooksPicker() {
  const { slot } = useParams();
  const navigate = useNavigate();
  const { loadout, setBookCount, toggleArtOfWar, toggleArtOfPeace } = useBuild();
  const { showTooltip, hideTooltip, handleTapOrActivate, guardHover } = useTooltip();
  const current = loadout[slot]?.modifiers?.books || 0;
  const artOfWarApplied = Boolean(loadout[slot]?.modifiers?.artOfWar);
  const artOfPeaceApplied = Boolean(loadout[slot]?.modifiers?.artOfPeace);
  const hoveringArtOfWarRef = useRef(false);
  const hoveringArtOfPeaceRef = useRef(false);
  // Reachable for weapon/armor slots only, but stays gear-type-aware defensively rather than assuming weapon.
  const gearType = getGearType(loadout[slot]?.item?.category);
  const isWeapon = gearType === 'weapon';
  const isArmor = gearType === 'armor';
  const bookBonus = isWeapon ? WEAPON_BOOK_STAT_BONUS : ARMOR_BOOK_STAT_BONUS;

  // Picking a count stays on screen; removing (0) is a "done here" action that backs out.
  function handleSelectCount(count) {
    setBookCount(slot, count);
  }

  function handleRemove() {
    setBookCount(slot, 0);
    navigate(-1);
  }

  function tooltipLines(count) {
    if (isWeapon) {
      const strength = bookBonus.strength * count;
      const damage = bookBonus.damage * count;
      return [
        `§5${count} Potato Book${count === 1 ? '' : 's'}`,
        '',
        `§7Grants §c${formatStatValue('strength', strength)} Strength §7and`,
        `§c${formatStatValue('damage', damage)} Damage§7.`,
      ];
    }
    const health = bookBonus.health * count;
    const defense = bookBonus.defense * count;
    return [
      `§5${count} Potato Book${count === 1 ? '' : 's'}`,
      '',
      `§7Grants §c${formatStatValue('health', health)} Health §7and`,
      `§a${formatStatValue('defense', defense)} Defense§7.`,
    ];
  }

  // Fallback if the live NEU-REPO fetch fails.
  function artOfWarFallbackLines() {
    return [
      `§${ART_OF_WAR_COLOR}The Art of War`,
      '',
      `§7Grants §c${formatStatValue('strength', ART_OF_WAR_STAT_BONUS.strength)} Strength §7when applied.`,
    ];
  }

  function handleArtOfWarHover(e) {
    const anchor = e.currentTarget;
    hoveringArtOfWarRef.current = true;
    showTooltip([`§${ART_OF_WAR_COLOR}The Art of War`, '', '§7Loading...'], anchor);

    fetchNeuItem(ART_OF_WAR_ITEM_ID).then((data) => {
      if (!hoveringArtOfWarRef.current) return;
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

  // Fallback if the live NEU-REPO fetch fails.
  function artOfPeaceFallbackLines() {
    return [
      `§${ART_OF_PEACE_COLOR}The Art of Peace`,
      '',
      `§7Grants §c${formatStatValue('health', ART_OF_PEACE_STAT_BONUS.health)} Health §7when applied.`,
    ];
  }

  function handleArtOfPeaceHover(e) {
    const anchor = e.currentTarget;
    hoveringArtOfPeaceRef.current = true;
    showTooltip([`§${ART_OF_PEACE_COLOR}The Art of Peace`, '', '§7Loading...'], anchor);

    fetchNeuItem(ART_OF_PEACE_ITEM_ID).then((data) => {
      if (!hoveringArtOfPeaceRef.current) return;
      if (data && data.lore && data.lore.length > 0) {
        showTooltip([data.displayname || `§${ART_OF_PEACE_COLOR}The Art of Peace`, ...data.lore], anchor);
      } else {
        showTooltip(artOfPeaceFallbackLines(), anchor);
      }
    });
  }

  function handleArtOfPeaceLeave() {
    hoveringArtOfPeaceRef.current = false;
    hideTooltip();
  }

  const cells = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 9; col++) {
      const key = `${row}-${col}`;
      const isInteriorRow = row >= 1 && row <= 4;
      const isInteriorCol = col >= 1 && col <= 7;

      // Art of War sits centered below the book grid; Art of Peace at the right edge of that row.
      if (row === 3 && col === 4) {
        cells.push(
          isWeapon ? (
            <div
              key={key}
              className={`${navSlot} ${artOfWarApplied ? 'bg-green-400' : ''}`}
              title="The Art of War — click to toggle"
              onClick={handleTapOrActivate('art-of-war', handleArtOfWarHover, () => toggleArtOfWar(slot))}
              onMouseEnter={guardHover(handleArtOfWarHover)}
              onMouseLeave={guardHover(handleArtOfWarLeave)}
            >
              <img src={ART_OF_WAR_ICON} alt="The Art of War" className={iconImg} />
            </div>
          ) : (
            <div key={key} className={`${slotBase} opacity-40 cursor-not-allowed`} title="The Art of War — only weapons can use it">
              <img src={ART_OF_WAR_ICON} alt="The Art of War" className={iconImg} />
            </div>
          ),
        );
      } else if (row === 3 && col === 7) {
        cells.push(
          isArmor ? (
            <div
              key={key}
              className={`${navSlot} ${artOfPeaceApplied ? 'bg-green-400' : ''}`}
              title="The Art of Peace — click to toggle"
              onClick={handleTapOrActivate('art-of-peace', handleArtOfPeaceHover, () => toggleArtOfPeace(slot))}
              onMouseEnter={guardHover(handleArtOfPeaceHover)}
              onMouseLeave={guardHover(handleArtOfPeaceLeave)}
            >
              <img src={ART_OF_WAR_ICON} alt="The Art of Peace" className={iconImg} />
            </div>
          ) : (
            <div key={key} className={`${slotBase} opacity-40 cursor-not-allowed`} title="The Art of Peace — only armor can use it">
              <img src={ART_OF_WAR_ICON} alt="The Art of Peace" className={iconImg} />
            </div>
          ),
        );
      } else if (isInteriorRow && isInteriorCol) {
        const count = (row - 1) * 7 + (col - 1) + 1;
        if (count <= MAX_BOOKS) {
          const isApplied = current === count;
          cells.push(
            <div
              key={key}
              className={`${slotBase} relative cursor-pointer hover:brightness-110 ${isApplied ? 'bg-green-400' : ''}`}
              onClick={handleTapOrActivate(
                `books-${count}`,
                (e) => showTooltip(tooltipLines(count), e.currentTarget),
                () => handleSelectCount(count),
              )}
              onMouseEnter={guardHover((e) => showTooltip(tooltipLines(count), e.currentTarget))}
              onMouseLeave={guardHover(hideTooltip)}
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
      } else if (row === 5 && col === 3 && current > 0) {
        cells.push(
          <div
            key={key}
            className={navSlot}
            title="Remove Books"
            onClick={handleRemove}
          >
            🗑️
          </div>,
        );
      } else if (row === 5 && col === 4) {
        cells.push(
          <div key={key} className={navSlot} title="Back" onClick={() => navigate(-1)}>
            <img src={SLOT_TEXTURES.close} alt="Back" className="w-[85%] h-[85%] object-contain pixelated" />
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
    <div className="min-h-screen flex flex-col items-center p-4 relative">
      <header className="w-full max-w-[700px] mb-4">
        <h1 className="text-xl font-bold">Books</h1>
      </header>

      <div className="w-full max-w-[700px] text-[13px] text-neutral-300 mb-2.5">
        {current === 0 ? 'No Potato Books applied.' : `${current} Potato Book${current === 1 ? '' : 's'} applied.`}
        {artOfWarApplied ? ' The Art of War applied.' : ''}
        {artOfPeaceApplied ? ' The Art of Peace applied.' : ''}
      </div>

      <div className="w-full max-w-[700px] overflow-x-auto">
        <div className="grid grid-cols-9 grid-rows-6 gap-[3px] w-full min-w-[380px] aspect-[9/6] bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black p-2">
          {cells}
        </div>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useItemData } from '../context/ItemDataContext';
import { useBuild } from '../context/BuildContext';
import { useTooltip } from '../context/TooltipContext';
import { rarityColorCode } from '../lib/mcText';
import { getApplicableReforges, getReforgeStatBonus, formatStatValue, STAT_LABELS } from '../lib/reforgeData';
import { SLOT_TEXTURES, CATEGORY_ICONS } from '../lib/icons';

const PAGE_SIZE = 28;

const slotBase =
  'flex items-center justify-center bg-[#8b8b8b] shadow-[inset_2px_2px_0_0_#373737,inset_-2px_-2px_0_0_#ffffff]';
const navSlot = `${slotBase} cursor-pointer hover:brightness-110`;
const iconImg = 'w-[70%] h-[70%] object-contain pixelated';
const slotFillImg = 'w-full h-full object-cover pixelated';

// Every applicable reforge for the current weapon, one apply-and-close
// step (unlike Enchants' list-then-level split, a reforge has no further
// choice to make once picked) — same chest-GUI list/pagination shape as
// EnchantList.jsx, reusing one icon for every slot since there's no
// per-reforge art, just like that page reuses the enchanted book icon.
export default function ReforgesPicker() {
  const navigate = useNavigate();
  const { itemData } = useItemData();
  const { build, applyReforge } = useBuild();
  const { showTooltip, hideTooltip } = useTooltip();
  const [page, setPage] = useState(0);
  const weapon = build && build.weapon;

  const applicable = useMemo(() => {
    if (!weapon) return [];
    return getApplicableReforges(itemData.reforges, weapon);
  }, [itemData.reforges, weapon]);

  const totalPages = Math.max(1, Math.ceil(applicable.length / PAGE_SIZE));
  const pageReforges = applicable.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const current = build?.modifiers?.reforge;

  function handleSelect(name) {
    applyReforge(name);
    navigate('/hex');
  }

  function handleHover(reforge, e) {
    const tierColor = rarityColorCode(weapon.tier);
    const bonus = getReforgeStatBonus(reforge, weapon.tier);
    const statLines = bonus
      ? Object.entries(bonus)
          .filter(([statKey]) => STAT_LABELS[statKey])
          .map(([statKey, value]) => `§7${STAT_LABELS[statKey].label}: §${STAT_LABELS[statKey].color}${formatStatValue(statKey, value)}`)
      : [];
    showTooltip([`§${tierColor}§l${reforge.name}`, '', ...statLines], e.currentTarget);
  }

  const contextText = !weapon
    ? 'No weapon selected — go back and pick one to see applicable reforges.'
    : applicable.length === 0
      ? `Reforging: ${weapon.name} — no applicable reforges found.`
      : `Reforging: ${weapon.name} (${applicable.length} reforge${applicable.length === 1 ? '' : 's'} available)`;

  const cells = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 9; col++) {
      const isInteriorRow = row >= 1 && row <= 4;
      const isInteriorCol = col >= 1 && col <= 7;
      const isNavRow = row === 5;
      const key = `${row}-${col}`;

      if (isInteriorRow && isInteriorCol) {
        const idx = (row - 1) * 7 + (col - 1);
        const reforge = pageReforges[idx];
        if (reforge) {
          cells.push(
            <div
              key={key}
              className={`${slotBase} cursor-pointer hover:brightness-110 ${current === reforge.name ? 'bg-green-400' : ''}`}
              onClick={() => handleSelect(reforge.name)}
              onMouseEnter={(e) => handleHover(reforge, e)}
              onMouseLeave={hideTooltip}
            >
              <img src={CATEGORY_ICONS.Reforges} alt={reforge.name} className={iconImg} />
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
      } else if (isNavRow && col === 2 && current) {
        cells.push(
          <div key={key} className={navSlot} title="Remove Reforge" onClick={() => handleSelect(null)}>
            🗑️
          </div>,
        );
      } else if (isNavRow && col === 3) {
        cells.push(
          <div key={key} className={navSlot} title="Previous Page" onClick={() => page > 0 && setPage(page - 1)}>
            ◀
          </div>,
        );
      } else if (isNavRow && col === 4) {
        cells.push(
          <div key={key} className={navSlot} title="Close" onClick={() => navigate('/hex')}>
            <img src={SLOT_TEXTURES.close} alt="Close" className={iconImg} />
          </div>,
        );
      } else if (isNavRow && col === 5) {
        cells.push(
          <div
            key={key}
            className={navSlot}
            title="Next Page"
            onClick={() => page < totalPages - 1 && setPage(page + 1)}
          >
            ▶
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
        <h1 className="text-xl font-bold">The Hex — Reforges</h1>
      </header>

      <div className="w-full max-w-[700px] text-[13px] text-neutral-300 mb-2.5">{contextText}</div>

      <div className="w-full max-w-[700px] overflow-x-auto">
        <div className="grid grid-cols-9 grid-rows-6 gap-[3px] w-full min-w-[380px] aspect-[9/6] bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black p-2">
          {cells}
        </div>
      </div>
    </div>
  );
}

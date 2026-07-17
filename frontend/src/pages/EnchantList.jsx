import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useItemData } from '../context/ItemDataContext';
import { useBuild } from '../context/BuildContext';
import { useTooltip } from '../context/TooltipContext';
import {
  fetchEnchantLevels,
  buildEffectLines,
  titleCaseEnchantId,
  isUltimateEnchant,
  isHiddenEnchant,
  computeConflictWarnings,
} from '../lib/enchantEffects';
import { SLOT_TEXTURES, ENCHANTED_BOOK_ICON } from '../lib/icons';

const PAGE_SIZE = 28; // 4 rows x 7 cols of interior slots

const slotBase = 'flex items-center justify-center border border-black/40 bg-[#8b8b8b]';
const navSlot = `${slotBase} cursor-pointer hover:brightness-110`;
const iconImg = 'w-[70%] h-[70%] object-contain pixelated';
const slotFillImg = 'w-full h-full object-cover pixelated';

// Shared by /enchants and /ultimate-enchants — same chest-GUI layout,
// filtered by whether the enchant id has the "ultimate_" prefix. Clicking a
// slot opens the level-picker (/enchant-levels/:id) instead of toggling a
// local selection; the applied enchant (if any) is read from BuildContext
// so it stays highlighted after coming back from the picker.
export default function EnchantList({ ultimate }) {
  const navigate = useNavigate();
  const { itemData } = useItemData();
  const { build } = useBuild();
  const { showTooltip, hideTooltip } = useTooltip();
  const [page, setPage] = useState(0);
  const hoveredIdRef = useRef(null);

  const category = build && build.weapon && build.weapon.category;

  const enchantIds = useMemo(() => {
    const byCategory = (itemData.enchants && itemData.enchants.enchants) || {};
    const all = category && byCategory[category] ? byCategory[category] : [];
    return all.filter((id) => isUltimateEnchant(id) === ultimate && !isHiddenEnchant(id));
  }, [itemData.enchants, category, ultimate]);

  const appliedIds = useMemo(() => {
    const set = new Set();
    if (build && build.modifiers && build.modifiers.ultimateEnchantment) {
      set.add(build.modifiers.ultimateEnchantment.id);
    }
    ((build && build.modifiers && build.modifiers.hexEnchantments) || []).forEach((e) => set.add(e.id));
    return set;
  }, [build]);

  const totalPages = Math.max(1, Math.ceil(enchantIds.length / PAGE_SIZE));
  const pageIds = enchantIds.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const noun = ultimate ? 'ultimate enchants' : 'enchants';
  const contextText = !build || !build.weapon
    ? 'No weapon selected — go back and pick one to see applicable enchants.'
    : enchantIds.length === 0
      ? `Enchanting: ${build.weapon.name} — no cached ${noun} for category "${category}".`
      : `Enchanting: ${build.weapon.name} (${enchantIds.length} ${noun} available)`;

  function handleEnchantHover(id, e) {
    hoveredIdRef.current = id;
    const anchor = e.currentTarget;
    const displayName = titleCaseEnchantId(id);
    showTooltip([`§b§l${displayName}`, '', '§7Loading effect...'], anchor);

    fetchEnchantLevels(id, itemData.enchants).then((levels) => {
      if (hoveredIdRef.current !== id) return; // moved on before this resolved
      const effect = buildEffectLines(levels);
      const lines = [`§b§l${displayName}`, '', ...(effect || ['§7No effect data available.'])];

      if (levels.length > 0) {
        const warnings = computeConflictWarnings(id, levels[0].lore, build && build.modifiers);
        if (warnings.length > 0) {
          lines.push('', ...warnings.map((name) => `§c${name} will be removed`));
        }
      }

      showTooltip(lines, anchor);
    });
  }

  function handleEnchantLeave() {
    hoveredIdRef.current = null;
    hideTooltip();
  }

  const cells = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 9; col++) {
      const isInteriorRow = row >= 1 && row <= 4;
      const isInteriorCol = col >= 1 && col <= 7;
      const isNavRow = row === 5;
      const key = `${row}-${col}`;

      if (isInteriorRow && isInteriorCol) {
        const idx = (row - 1) * 7 + (col - 1);
        const id = pageIds[idx];
        if (id) {
          cells.push(
            <div
              key={key}
              className={`${slotBase} cursor-pointer hover:brightness-110 ${appliedIds.has(id) ? 'bg-green-400' : ''}`}
              onClick={() => navigate(`/enchant-levels/${encodeURIComponent(id)}`)}
              onMouseEnter={(e) => handleEnchantHover(id, e)}
              onMouseLeave={handleEnchantLeave}
            >
              <img src={ENCHANTED_BOOK_ICON} alt={titleCaseEnchantId(id)} className={iconImg} />
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
        <h1 className="text-xl font-bold">The Hex — {ultimate ? 'Ultimate Enchantments' : 'Enchantments'}</h1>
      </header>

      <div className="w-full max-w-[700px] text-[13px] text-neutral-300 mb-2.5">{contextText}</div>

      <div className="w-full max-w-[700px] overflow-x-auto">
        <div className="grid grid-cols-9 grid-rows-6 gap-[3px] w-full min-w-[380px] aspect-[9/6] bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] p-2">
          {cells}
        </div>
      </div>
    </div>
  );
}

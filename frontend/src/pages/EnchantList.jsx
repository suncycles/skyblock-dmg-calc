import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  computeConflictingEntries,
  resolveEnchantCategory,
  getEnchantCaption,
} from '../lib/enchantEffects';
import { SLOT_TEXTURES, ENCHANTED_BOOK_ICON } from '../lib/icons';
import { formatItemName } from '../lib/mcText';

const PAGE_SIZE = 28; // 4 rows x 7 cols of interior slots

const slotBase =
  'flex items-center justify-center bg-[#8b8b8b] shadow-[inset_2px_2px_0_0_#373737,inset_-2px_-2px_0_0_#ffffff]';
const navSlot = `${slotBase} cursor-pointer hover:brightness-110`;
const iconImg = 'w-[70%] h-[70%] object-contain pixelated';
const slotFillImg = 'w-full h-full object-cover pixelated';

// Shared by /enchants and /ultimate-enchants — same chest-GUI layout,
// filtered by whether the enchant id has the "ultimate_" prefix. Clicking a
// slot opens the level-picker (/enchant-levels/:id) instead of toggling a
// local selection; the applied enchant (if any) is read from BuildContext
// so it stays highlighted after coming back from the picker.
export default function EnchantList({ ultimate }) {
  const { slot } = useParams();
  const navigate = useNavigate();
  const { itemData } = useItemData();
  const { loadout, applyEnchant } = useBuild();
  const { showTooltip, hideTooltip } = useTooltip();
  const [page, setPage] = useState(0);
  const [massApplying, setMassApplying] = useState(false);
  const hoveredIdRef = useRef(null);

  const item = loadout[slot] && loadout[slot].item;
  const modifiers = loadout[slot] && loadout[slot].modifiers;
  const category = item && item.category;

  const enchantIds = useMemo(() => {
    const byCategory = (itemData.enchants && itemData.enchants.enchants) || {};
    const resolvedCategory = category && resolveEnchantCategory(category);
    const all = resolvedCategory && byCategory[resolvedCategory] ? byCategory[resolvedCategory] : [];
    return all.filter((id) => isUltimateEnchant(id) === ultimate && !isHiddenEnchant(id));
  }, [itemData.enchants, category, ultimate]);

  const appliedIds = useMemo(() => {
    const set = new Set();
    if (modifiers && modifiers.ultimateEnchantment) {
      set.add(modifiers.ultimateEnchantment.id);
    }
    (modifiers && modifiers.hexEnchantments || []).forEach((e) => set.add(e.id));
    return set;
  }, [modifiers]);

  const totalPages = Math.max(1, Math.ceil(enchantIds.length / PAGE_SIZE));
  const pageIds = enchantIds.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const noun = ultimate ? 'ultimate enchants' : 'enchants';
  const contextText = !item
    ? 'No item selected — go back and pick one to see applicable enchants.'
    : enchantIds.length === 0
      ? `Enchanting: ${formatItemName(item.name)} — no cached ${noun} for category "${category}".`
      : `Enchanting: ${formatItemName(item.name)} (${enchantIds.length} ${noun} available)`;

  // [T6]/[T7] — applies every normal enchant available for this item at
  // (max tier - offset), alphabetically by displayed name so conflicting
  // pairs (Life Steal/Drain, Execute/Prosecute, Giant Killer/Titan
  // Killer, Thunderlord/Thunderbolt, First Strike/Triple-Strike) resolve
  // exactly like clicking through the list by hand would: the later
  // letter wins, same computeConflictingEntries removal EnchantLevels.jsx
  // already uses per-click. `simulated` tracks modifiers locally as the
  // loop goes (React's real state won't have re-rendered mid-loop) so
  // each step's conflict check sees everything already applied earlier
  // in this same run, not the stale pre-click snapshot.
  async function applyMassTier(offsetFromMax) {
    if (!modifiers || enchantIds.length === 0 || massApplying) return;
    setMassApplying(true);
    const sortedIds = [...enchantIds].sort((a, b) => titleCaseEnchantId(a).localeCompare(titleCaseEnchantId(b)));
    let simulated = modifiers;
    for (const id of sortedIds) {
      const levels = await fetchEnchantLevels(id, itemData.enchants);
      if (levels.length === 0) continue;
      const maxLevel = levels[levels.length - 1].level;
      const targetLevel = Math.max(1, maxLevel - offsetFromMax);
      const levelData = levels.find((l) => l.level === targetLevel) || levels[levels.length - 1];
      const conflicts = computeConflictingEntries(id, levelData.lore, simulated);
      const removeIds = conflicts.map((c) => c.id);
      applyEnchant(slot, id, levelData.level, maxLevel, removeIds);
      const entry = { id, level: levelData.level, maxLevel };
      simulated = {
        ...simulated,
        hexEnchantments: [...(simulated.hexEnchantments || []).filter((e) => !removeIds.includes(e.id) && e.id !== id), entry],
        ultimateEnchantment:
          simulated.ultimateEnchantment && removeIds.includes(simulated.ultimateEnchantment.id) ? null : simulated.ultimateEnchantment,
      };
    }
    setMassApplying(false);
  }

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
        const warnings = computeConflictWarnings(id, levels[0].lore, modifiers);
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
              className={`${slotBase} relative cursor-pointer hover:brightness-110 ${appliedIds.has(id) ? 'bg-green-400' : ''}`}
              onClick={() => navigate(`/enchant-levels/${slot}/${encodeURIComponent(id)}`)}
              onMouseEnter={(e) => handleEnchantHover(id, e)}
              onMouseLeave={handleEnchantLeave}
            >
              <img src={ENCHANTED_BOOK_ICON} alt={titleCaseEnchantId(id)} className={iconImg} />
              <span
                className={`absolute bottom-0.5 right-1 text-[10px] font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] ${
                  ultimate ? 'text-fuchsia-400' : 'text-white'
                }`}
              >
                {getEnchantCaption(id)}
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
      } else if (isNavRow && col === 3) {
        cells.push(
          <div key={key} className={navSlot} title="Previous Page" onClick={() => page > 0 && setPage(page - 1)}>
            ◀
          </div>,
        );
      } else if (isNavRow && col === 4) {
        cells.push(
          <div key={key} className={navSlot} title="Close" onClick={() => navigate(`/hex/${slot}`)}>
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
        <div className="grid grid-cols-9 grid-rows-6 gap-[3px] w-full min-w-[380px] aspect-[9/6] bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black p-2">
          {cells}
        </div>
      </div>

      {/* Mass-apply shortcuts — deliberately outside the chest-GUI grid,
          same "small utility control below the panel" precedent as
          Landing's Damage Sources button. Ultimate enchants only ever
          occupy one slot each, so "every enchant at tier X" only makes
          sense for the normal list. */}
      {!ultimate && (
        <div className="mt-2 flex items-center gap-3">
          <button
            className="text-[13px] font-bold text-amber-500 hover:brightness-110 cursor-pointer underline disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => applyMassTier(1)}
            disabled={!item || enchantIds.length === 0 || massApplying}
            title="Apply every enchant at max tier - 1"
          >
            [T6]
          </button>
          {massApplying && <span className="text-[11px] text-neutral-400">Applying…</span>}
        </div>
      )}
    </div>
  );
}

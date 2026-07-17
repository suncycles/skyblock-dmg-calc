import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useItemData } from '../context/ItemDataContext';
import { useBuild } from '../context/BuildContext';
import { useTooltip } from '../context/TooltipContext';
import {
  fetchEnchantLevels,
  titleCaseEnchantId,
  toRoman,
  isUltimateEnchant,
  computeConflictingEntries,
} from '../lib/enchantEffects';

const slotBase = 'border border-neutral-700';
const navSlot = `${slotBase} flex items-center justify-center bg-neutral-300 cursor-pointer text-[clamp(14px,3.5vw,26px)] hover:bg-neutral-200`;

// The "separate GUI" opened by clicking an enchant: every level that exists
// (probed live from NEU-REPO, see lib/enchantEffects) as a selectable slot.
// Hovering a level shows that level's real, unmodified book lore. Picking
// one applies it to the build and backs out to whichever list (normal or
// ultimate) opened this — browser history, since either can lead here.
export default function EnchantLevels() {
  const { enchantId } = useParams();
  const navigate = useNavigate();
  const { itemData } = useItemData();
  const { build, applyEnchant } = useBuild();
  const { showTooltip, hideTooltip } = useTooltip();
  const [levels, setLevels] = useState(null); // null = loading

  useEffect(() => {
    let cancelled = false;
    setLevels(null);
    fetchEnchantLevels(enchantId, itemData.enchants).then((result) => {
      if (!cancelled) setLevels(result);
    });
    return () => {
      cancelled = true;
    };
  }, [enchantId, itemData.enchants]);

  const displayName = titleCaseEnchantId(enchantId);
  const ultimate = isUltimateEnchant(enchantId);
  const maxLevel = levels && levels.length > 0 ? levels[levels.length - 1].level : null;

  const appliedLevel = ultimate
    ? build?.modifiers?.ultimateEnchantment?.id === enchantId
      ? build.modifiers.ultimateEnchantment.level
      : null
    : (build?.modifiers?.hexEnchantments || []).find((e) => e.id === enchantId)?.level ?? null;

  function handleSelect(levelEntry) {
    const conflicts = computeConflictingEntries(enchantId, levelEntry.lore, build && build.modifiers);
    applyEnchant(enchantId, levelEntry.level, maxLevel, conflicts.map((e) => e.id));
    navigate(-1);
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
        const levelEntry = levels ? levels[idx] : null;
        if (levelEntry) {
          const isMax = levelEntry.level === maxLevel;
          const textColor = ultimate ? 'text-fuchsia-600' : isMax ? 'text-amber-600' : 'text-neutral-800';
          const isApplied = appliedLevel === levelEntry.level;
          cells.push(
            <div
              key={key}
              className={`${slotBase} flex items-center justify-center cursor-pointer text-base font-bold hover:bg-neutral-200 ${textColor} ${
                isApplied ? 'bg-green-400' : 'bg-neutral-300'
              }`}
              onClick={() => handleSelect(levelEntry)}
              onMouseEnter={(e) => {
                const conflicts = computeConflictingEntries(enchantId, levelEntry.lore, build && build.modifiers);
                const lines =
                  conflicts.length > 0
                    ? [
                        ...levelEntry.lore,
                        '',
                        ...conflicts.map((c) => `§c${titleCaseEnchantId(c.id)} will be removed`),
                      ]
                    : levelEntry.lore;
                showTooltip(lines, e.currentTarget);
              }}
              onMouseLeave={hideTooltip}
            >
              {toRoman(levelEntry.level)}
            </div>,
          );
        } else {
          cells.push(<div key={key} className={`${slotBase} bg-neutral-500`} />);
        }
      } else if (isInteriorRow && !isInteriorCol) {
        cells.push(<div key={key} className={`${slotBase} bg-purple-500`} />);
      } else if (isNavRow && col === 4) {
        cells.push(
          <div key={key} className={navSlot} title="Close" onClick={() => navigate(-1)}>
            ⛔
          </div>,
        );
      } else {
        cells.push(<div key={key} className={`${slotBase} bg-neutral-500`} />);
      }
    }
  }

  const statusText =
    levels === null
      ? 'Loading levels...'
      : levels.length === 0
        ? 'No level data found for this enchant.'
        : 'Choose a level to apply.';

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <header className="w-full max-w-[700px] mb-4">
        <h1 className="text-xl font-bold">The Hex — {displayName}</h1>
      </header>

      <div className="w-full max-w-[700px] text-[13px] text-neutral-300 mb-2.5">{statusText}</div>

      <div className="w-full max-w-[700px] overflow-x-auto">
        <div className="grid grid-cols-9 grid-rows-6 gap-0.5 w-full min-w-[380px] aspect-[9/6] bg-neutral-600 border-2 border-neutral-500 p-1">
          {cells}
        </div>
      </div>
    </div>
  );
}

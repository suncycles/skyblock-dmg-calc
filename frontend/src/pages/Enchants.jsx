import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useItemData } from '../context/ItemDataContext';
import { useBuild } from '../context/BuildContext';
import { useTooltip } from '../context/TooltipContext';

const PAGE_SIZE = 28; // 4 rows x 7 cols of interior slots

function titleCaseId(id) {
  return id
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// NEU-REPO has no per-enchant lore/description text (only per-item lore) —
// the tooltip is limited to what's actually available: name + XP-per-level
// costs. Some category-list ids are legacy names; enchant_mapping_item/
// enchant_mapping_id translate those to the id used in enchants_xp_cost.
// The pairing isn't consistently ordered (old->new either way), so check both.
function getEnchantXpCosts(enchants, id) {
  const xpCostMap = enchants.enchants_xp_cost || {};
  const key = id.toLowerCase();
  if (xpCostMap[key]) return xpCostMap[key];

  const mapItem = enchants.enchant_mapping_item || [];
  const mapId = enchants.enchant_mapping_id || [];
  for (let i = 0; i < mapId.length; i++) {
    if (mapId[i].toLowerCase() === key && xpCostMap[mapItem[i].toLowerCase()]) {
      return xpCostMap[mapItem[i].toLowerCase()];
    }
    if (mapItem[i].toLowerCase() === key && xpCostMap[mapId[i].toLowerCase()]) {
      return xpCostMap[mapId[i].toLowerCase()];
    }
  }
  return null;
}

const slotBase = 'border border-neutral-700';
const navSlot = `${slotBase} flex items-center justify-center bg-neutral-300 cursor-pointer text-[clamp(14px,3.5vw,26px)] hover:bg-neutral-200`;

export default function Enchants() {
  const navigate = useNavigate();
  const { itemData } = useItemData();
  const { build } = useBuild();
  const { showTooltip, hideTooltip } = useTooltip();
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(() => new Set());

  const category = build && build.weapon && build.weapon.category;

  const enchantIds = useMemo(() => {
    const byCategory = (itemData.enchants && itemData.enchants.enchants) || {};
    return category && byCategory[category] ? byCategory[category] : [];
  }, [itemData.enchants, category]);

  const totalPages = Math.max(1, Math.ceil(enchantIds.length / PAGE_SIZE));
  const pageIds = enchantIds.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const contextText = !build || !build.weapon
    ? 'No weapon selected — go back and pick one to see applicable enchants.'
    : enchantIds.length === 0
      ? `Enchanting: ${build.weapon.name} — no cached enchant data for category "${category}".`
      : `Enchanting: ${build.weapon.name} (${enchantIds.length} enchants available)`;

  function toggleEnchant(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      console.log(`[The Hex] Enchant "${id}" ${next.has(id) ? 'selected' : 'deselected'} — not yet applied to build.`);
      return next;
    });
  }

  function handleEnchantHover(id, e) {
    const displayName = titleCaseId(id);
    const costs = getEnchantXpCosts(itemData.enchants || {}, id);
    const lines = [`§b§l${displayName}`, ''];
    if (costs && costs.length) {
      lines.push(`§7Max Level: §f${costs.length}`);
      costs.forEach((xp, i) => lines.push(`§7Level ${i + 1}: §a${xp} XP`));
    } else {
      lines.push('§7No cost data available.');
    }
    showTooltip(lines, e.currentTarget);
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
              className={`${slotBase} flex items-center justify-center cursor-pointer text-[clamp(14px,3.5vw,26px)] hover:bg-neutral-200 ${
                selected.has(id) ? 'bg-green-400' : 'bg-neutral-300'
              }`}
              onClick={() => toggleEnchant(id)}
              onMouseEnter={(e) => handleEnchantHover(id, e)}
              onMouseLeave={hideTooltip}
            >
              📗
            </div>,
          );
        } else {
          cells.push(<div key={key} className={`${slotBase} bg-neutral-500`} />);
        }
      } else if (isInteriorRow && !isInteriorCol) {
        cells.push(<div key={key} className={`${slotBase} bg-purple-500`} />);
      } else if (isNavRow && col === 3) {
        cells.push(
          <div key={key} className={navSlot} title="Previous Page" onClick={() => page > 0 && setPage(page - 1)}>
            ◀
          </div>,
        );
      } else if (isNavRow && col === 4) {
        cells.push(
          <div key={key} className={navSlot} title="Close" onClick={() => navigate('/hex')}>
            ⛔
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
        cells.push(<div key={key} className={`${slotBase} bg-neutral-500`} />);
      }
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <header className="w-full max-w-[700px] mb-4">
        <h1 className="text-xl font-bold">The Hex — Enchantments</h1>
      </header>

      <div className="w-full max-w-[700px] text-[13px] text-neutral-300 mb-2.5">{contextText}</div>

      <div className="w-full max-w-[700px] overflow-x-auto">
        <div className="grid grid-cols-9 grid-rows-6 gap-0.5 w-full min-w-[380px] aspect-[9/6] bg-neutral-600 border-2 border-neutral-500 p-1">
          {cells}
        </div>
      </div>
    </div>
  );
}

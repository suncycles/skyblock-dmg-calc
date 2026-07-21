import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useItemData } from '../context/ItemDataContext';
import { useBuild } from '../context/BuildContext';
import { useTooltip } from '../context/TooltipContext';
import { rarityColorCode } from '../lib/mcText';
import { getApplicableReforges, getReforgeStatBonus, formatStatValue, STAT_LABELS } from '../lib/reforgeData';
import { fetchNeuItem } from '../lib/neuItems';
import { SLOT_TEXTURES, CATEGORY_ICONS, ANVIL_ICON, getReforgeStoneIcon } from '../lib/icons';

const PAGE_SIZE = 28;

const slotBase =
  'flex items-center justify-center bg-[#8b8b8b] shadow-[inset_2px_2px_0_0_#373737,inset_-2px_-2px_0_0_#ffffff]';
const navSlot = `${slotBase} cursor-pointer hover:brightness-110`;
const iconImg = 'w-[70%] h-[70%] object-contain pixelated';
const slotFillImg = 'w-full h-full object-cover pixelated';

// Shared by /reforges and /reforges/blacksmith — the real game splits
// reforges into two mechanically distinct sources: reforge STONE items
// (Dragon Claw -> "Fabled", Wither Blood -> "Withered", etc.), applied
// directly to the weapon, and the ~50 the Blacksmith NPC can instead roll
// for free at an anvil. worker/src/index.js keeps them as two separate
// maps (itemData.reforgeStones / itemData.reforges) for exactly this
// split. Reforge stones are the base access point (this is what "Reforges"
// on the Hex screen opens); the anvil slot — a blacksmith's tool, not a
// stone's — opens the Blacksmith sub-screen instead.
//
// Every applicable reforge for the current weapon is one apply-and-close
// step (unlike Enchants' list-then-level split, a reforge has no further
// choice to make once picked) — same chest-GUI list/pagination shape as
// EnchantList.jsx. Stone slots show that stone's own icon (getReforgeStoneIcon,
// added manually per stone — see icons.js) falling back to the generic
// Reforges icon for any not added yet; blacksmith reforges have no
// physical item, so they always use the generic icon, same as EnchantList
// reuses one icon for every enchant slot.
export default function ReforgesPicker({ blacksmith }) {
  const { slot } = useParams();
  const navigate = useNavigate();
  const { itemData } = useItemData();
  const { loadout, applyReforge } = useBuild();
  const { showTooltip, hideTooltip } = useTooltip();
  const [page, setPage] = useState(0);
  const hoveredNameRef = useRef(null);
  const weapon = loadout[slot] && loadout[slot].item;
  const reforgeSource = blacksmith ? itemData.reforges : itemData.reforgeStones;
  const noun = blacksmith ? 'blacksmith reforges' : 'reforge stones';

  const applicable = useMemo(() => {
    if (!weapon) return [];
    return getApplicableReforges(reforgeSource, weapon);
  }, [reforgeSource, weapon]);

  const totalPages = Math.max(1, Math.ceil(applicable.length / PAGE_SIZE));
  const pageReforges = applicable.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const current = loadout[slot]?.modifiers?.reforge;

  function handleSelect(name) {
    applyReforge(slot, name);
    navigate(`/hex/${slot}`);
  }

  // Fallback shown for blacksmith reforges (no physical item to fetch lore
  // for) and if a stone's own item fetch below fails: the reforge's own
  // name/stat table, synthesized into stat lines the same way the Hex
  // tooltip's reforge annotations are colored (see reforgeData.js).
  function synthesizedLines(reforge) {
    const tierColor = rarityColorCode(weapon.tier);
    const bonus = getReforgeStatBonus(reforge, weapon.tier);
    const statLines = bonus
      ? Object.entries(bonus)
          .filter(([statKey]) => STAT_LABELS[statKey])
          .map(([statKey, value]) => `§7${STAT_LABELS[statKey].label}: §${STAT_LABELS[statKey].color}${formatStatValue(statKey, value)}`)
      : [];
    return [`§${tierColor}§l${reforge.name}`, '', ...statLines];
  }

  // Stone slots show the real physical item's own lore (ability
  // description, flavor text, level requirement — everything, not just
  // the stat table) fetched live from NEU-REPO and matched by stoneId,
  // the stone's real internal item id — see reforgeStoneItems.js.
  // Blacksmith reforges have no physical item, so they always use the
  // synthesized fallback.
  function handleHover(reforge, e) {
    const anchor = e.currentTarget;
    hoveredNameRef.current = reforge.name;

    if (blacksmith || !reforge.stoneId) {
      showTooltip(synthesizedLines(reforge), anchor);
      return;
    }

    showTooltip([`§${rarityColorCode(weapon.tier)}§l${reforge.name}`, '', '§7Loading...'], anchor);
    fetchNeuItem(reforge.stoneId).then((data) => {
      if (hoveredNameRef.current !== reforge.name) return; // moved on before this resolved
      if (data && data.lore && data.lore.length > 0) {
        showTooltip([data.displayname || reforge.name, ...data.lore], anchor);
      } else {
        showTooltip(synthesizedLines(reforge), anchor);
      }
    });
  }

  const contextText = !weapon
    ? `No weapon selected — go back and pick one to see applicable ${noun}.`
    : applicable.length === 0
      ? `Reforging: ${weapon.name} — no applicable ${noun} found.`
      : `Reforging: ${weapon.name} (${applicable.length} ${noun} available)`;

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
              onMouseLeave={() => {
                hoveredNameRef.current = null;
                hideTooltip();
              }}
            >
              <img
                src={blacksmith ? CATEGORY_ICONS.Reforges : getReforgeStoneIcon(reforge.stoneId) || CATEGORY_ICONS.Reforges}
                alt={reforge.name}
                className={iconImg}
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = CATEGORY_ICONS.Reforges;
                }}
              />
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
      } else if (isNavRow && col === 1 && !blacksmith) {
        cells.push(
          <div key={key} className={navSlot} title="Blacksmith" onClick={() => navigate(`/reforges/${slot}/blacksmith`)}>
            <img src={ANVIL_ICON} alt="Blacksmith" className={iconImg} />
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
          <div
            key={key}
            className={navSlot}
            title={blacksmith ? 'Back' : 'Close'}
            onClick={() => (blacksmith ? navigate(-1) : navigate(`/hex/${slot}`))}
          >
            <img src={SLOT_TEXTURES.close} alt={blacksmith ? 'Back' : 'Close'} className={iconImg} />
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
        <h1 className="text-xl font-bold">The Hex — {blacksmith ? 'Blacksmith' : 'Reforges'}</h1>
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

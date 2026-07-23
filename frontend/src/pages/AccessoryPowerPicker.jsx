import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useTooltip } from '../context/TooltipContext';
import { ALL_POWERS } from '../lib/accessoryPowers';
import { STAT_LABELS, formatStatValue } from '../lib/reforgeData';
import { fetchNeuItem } from '../lib/neuItems';
import { parseShorthandNumber } from '../lib/numberInput';
import { formatItemName } from '../lib/mcText';
import { SLOT_TEXTURES } from '../lib/icons';
import WeaponIcon from '../components/WeaponIcon';

const PAGE_SIZE = 28; // 4 rows x 7 cols of interior slots

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';
const slotBase =
  'flex items-center justify-center bg-[#8b8b8b] shadow-[inset_2px_2px_0_0_#373737,inset_-2px_-2px_0_0_#ffffff]';
const navSlot = `${slotBase} cursor-pointer hover:brightness-110`;
const iconImg = 'w-[70%] h-[70%] object-contain pixelated';
const slotFillImg = 'w-full h-full object-cover pixelated';

// Base stat lines shown for every power (Default and Stone alike) — the
// same one, two, or ten stats a real power actually grants, in the same
// "Label: +X" format the rest of this app already uses.
function buildBaseStatLines(power, heading) {
  const lines = [`§6${heading}`];
  for (const [key, value] of Object.entries(power.baseStats)) {
    const meta = STAT_LABELS[key];
    if (!meta) continue;
    lines.push(`§7${meta.label}: §${meta.color}${formatStatValue(key, value)}`);
  }
  return lines;
}

function buildUniqueBonusLines(power) {
  if (!power.uniqueBonus) return [];
  const lines = ['', '§6Unique Power Bonus'];
  for (const [key, value] of Object.entries(power.uniqueBonus)) {
    const meta = STAT_LABELS[key];
    if (!meta) continue;
    lines.push(`§7${meta.label}: §${meta.color}${formatStatValue(key, value)}`);
  }
  return lines;
}

// Picking one of the 31 real Accessory Powers (10 Default + 21 Stone —
// see lib/accessoryPowers.js) — a chest-GUI grid like Hex.jsx/
// EnchantList.jsx rather than the flexible ItemPicker list, since there's
// a dedicated bottom-left "Tuning" cell (row 5, col 0) navigating to
// /accessory/tuning. Hovering a Stone Power cell fetches its real
// NEU-REPO item lore (same on-demand pattern ReforgesPicker.jsx already
// uses for reforge stones) and appends a synthesized base-stats block;
// Default Powers (no physical item) only get the synthesized block since
// no real lore exists for them.
export default function AccessoryPowerPicker() {
  const navigate = useNavigate();
  const { loadout, selectItem, setAccessoryMagicalPower } = useBuild();
  const { showTooltip, hideTooltip } = useTooltip();
  const [page, setPage] = useState(0);
  const hoveredIdRef = useRef(null);

  const magicalPower = (loadout.accessory && loadout.accessory.modifiers && loadout.accessory.modifiers.magicalPower) || 0;
  const selectedPowerId = loadout.accessory && loadout.accessory.item && loadout.accessory.item.id;

  const totalPages = Math.max(1, Math.ceil(ALL_POWERS.length / PAGE_SIZE));
  const pagePowers = useMemo(() => ALL_POWERS.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE), [page]);

  // Stays on screen after picking — lets the player compare powers or
  // change their mind without re-entering; same "select stays, only
  // explicit Close backs out" precedent as BooksPicker.jsx.
  function handleSelect(power) {
    selectItem('accessory', {
      id: power.id,
      name: power.name,
      iconId: power.sourceItemId || null,
      material: power.sourceItemId ? 'SKULL' : 'BOOK',
    });
  }

  function handleHover(power, e) {
    const anchor = e.currentTarget;
    hoveredIdRef.current = power.id;
    const statLines = buildBaseStatLines(power, 'Base Stats');
    const uniqueLines = buildUniqueBonusLines(power);
    const footer = ['', `§8${power.type}`, `§8Requires: ${power.requirement}`];

    if (!power.sourceItemId) {
      showTooltip([`§d§l${power.name}`, ...statLines, ...uniqueLines, ...footer], anchor);
      return;
    }

    showTooltip([`§d§l${power.name}`, '', '§7Loading...'], anchor);
    fetchNeuItem(power.sourceItemId).then((data) => {
      if (hoveredIdRef.current !== power.id) return; // moved on before this resolved
      const realLore = data && data.lore && data.lore.length > 0 ? [formatItemName(data.displayname || power.sourceName), ...data.lore, ''] : [];
      showTooltip([...realLore, ...statLines, ...uniqueLines, ...footer], anchor);
    });
  }

  function handleLeave() {
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
        const power = pagePowers[idx];
        if (power) {
          cells.push(
            <div
              key={key}
              className={`${slotBase} relative cursor-pointer hover:brightness-110 ${selectedPowerId === power.id ? 'bg-green-400' : ''}`}
              onClick={() => handleSelect(power)}
              onMouseEnter={(e) => handleHover(power, e)}
              onMouseLeave={handleLeave}
            >
              <WeaponIcon id={power.sourceItemId} material={power.sourceItemId ? 'SKULL' : 'BOOK'} alt={power.name} className={iconImg} />
              <span className="absolute bottom-0.5 left-0 right-0 text-center text-[9px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                {power.name}
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
      } else if (isNavRow && col === 0) {
        cells.push(
          <div key={key} className={navSlot} title="Tuning" onClick={() => navigate('/accessory/tuning')}>
            <span className="text-2xl">🔧</span>
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
          <div key={key} className={navSlot} title="Close" onClick={() => navigate('/')}>
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
        <h1 className="text-xl font-bold">The Hex — Accessory Powers</h1>
      </header>

      <div className="w-full max-w-[700px] overflow-x-auto">
        <div className="grid grid-cols-9 grid-rows-6 gap-[3px] w-full min-w-[380px] aspect-[9/6] bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black p-2">
          {cells}
        </div>
      </div>

      <div className={`${panel} mt-3 p-3 flex items-center gap-2`}>
        <label className="text-sm font-bold text-black" htmlFor="magical-power">
          Magical Power:
        </label>
        <input
          id="magical-power"
          type="text"
          inputMode="decimal"
          value={magicalPower}
          onChange={(e) => setAccessoryMagicalPower(Math.max(0, parseShorthandNumber(e.target.value)))}
          placeholder="e.g. 2000"
          className="w-32 px-2 py-1 text-sm bg-black text-white border-2 border-neutral-700"
        />
      </div>
    </div>
  );
}

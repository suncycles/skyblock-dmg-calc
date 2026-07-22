import { useNavigate, useParams } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { formatItemName, parseMinecraftLine } from '../lib/mcText';
import { MAX_STARS, buildStarSuffix } from '../lib/starring';
import { SLOT_TEXTURES } from '../lib/icons';
import McTooltipLines from '../components/McTooltipLines';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

// Dungeon-style Starring (see lib/starring.js) — a single bounded number
// input plus a live preview of the ✪ suffix and its color banding, same
// free-form-number shape as SpecialPicker.jsx rather than a slot grid.
export default function StarringPicker() {
  const { slot } = useParams();
  const navigate = useNavigate();
  const { loadout, setStarCount } = useBuild();
  const item = loadout[slot] && loadout[slot].item;
  const stars = (loadout[slot] && loadout[slot].modifiers && loadout[slot].modifiers.stars) || 0;

  if (!item) {
    return (
      <div className="min-h-screen flex flex-col items-center p-4">
        <header className="w-full max-w-[700px] mb-4">
          <h1 className="text-xl font-bold">The Hex — Item Upgrades</h1>
        </header>
        <div className="w-full max-w-[700px] text-[13px] text-neutral-300 mb-2.5">No item selected.</div>
        <button
          className={`${panel} px-4 py-2 cursor-pointer hover:brightness-110 flex items-center gap-2`}
          onClick={() => navigate(-1)}
        >
          <img src={SLOT_TEXTURES.close} alt="Back" className="w-5 h-5" />
          Back
        </button>
      </div>
    );
  }

  function handleChange(e) {
    const num = Math.max(0, Math.min(MAX_STARS, Math.floor(Number(e.target.value) || 0)));
    setStarCount(slot, num);
  }

  const suffix = buildStarSuffix(stars);
  const previewLine = `§7${formatItemName(item.name)}${suffix ? ` ${suffix}` : ''}`;

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <header className="w-full max-w-[700px] mb-4">
        <h1 className="text-xl font-bold">The Hex — {formatItemName(item.name)}</h1>
      </header>

      <div className={`${panel} w-full max-w-[500px] p-6 flex flex-col gap-4`}>
        <label className="text-sm font-bold text-black" htmlFor="star-count">
          Stars (0-{MAX_STARS})
        </label>
        <input
          id="star-count"
          type="number"
          min="0"
          max={MAX_STARS}
          step="1"
          value={stars}
          onChange={handleChange}
          className="px-3 py-2 bg-black text-white border-2 border-neutral-700"
        />
        <div className="text-sm text-neutral-800">Each star grants +2% of this item's own base stats.</div>
        <div className="mc-tooltip" style={{ position: 'static', fontSize: '13px' }}>
          <McTooltipLines parsedLines={[parseMinecraftLine(previewLine)]} />
        </div>
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

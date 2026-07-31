import { useNavigate, useParams } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { formatItemName, parseMinecraftLine } from '../lib/mcText';
import { MAX_STARS, MAX_MASTER_STARS, buildStarSuffix, buildMasterStarSuffix } from '../lib/starring';
import { SLOT_TEXTURES } from '../lib/icons';
import McTooltipLines from '../components/McTooltipLines';
import NumberInput from '../components/NumberInput';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

// Dungeon-style Starring: a bounded number input plus a live preview of the ✪ suffix and its color banding.
export default function StarringPicker() {
  const { slot } = useParams();
  const navigate = useNavigate();
  const { loadout, setStarCount, setDungeonized, setDungeonizeOldCurve, setMasterStars } = useBuild();
  const item = loadout[slot] && loadout[slot].item;
  const modifiers = loadout[slot] && loadout[slot].modifiers;
  const stars = (modifiers && modifiers.stars) || 0;
  const dungeonized = !!(modifiers && modifiers.dungeonized);
  const dungeonizeOldCurve = !!(modifiers && modifiers.dungeonizeOldCurve);
  const masterStars = (modifiers && modifiers.masterStars) || 0;

  if (!item) {
    return (
      <div className="min-h-screen flex flex-col items-center p-4">
        <header className="w-full max-w-[700px] mb-4">
          <h1 className="text-xl font-bold">SkyDmg — Item Upgrades</h1>
        </header>
        <div className="w-full max-w-[700px] text-[13px] text-neutral-300 mb-2.5">No item selected.</div>
        <button
          className={`${panel} px-4 py-2 cursor-pointer hover:brightness-110 flex items-center gap-2 text-sm font-bold text-black`}
          onClick={() => navigate(-1)}
        >
          <img src={SLOT_TEXTURES.close} alt="Back" className="w-5 h-5" />
          Back
        </button>
      </div>
    );
  }

  const suffix = buildStarSuffix(stars) + buildMasterStarSuffix(masterStars);
  const previewLine = `§7${formatItemName(item.name)}${suffix ? ` ${suffix}` : ''}`;

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <header className="w-full max-w-[700px] mb-4">
        <h1 className="text-xl font-bold">SkyDmg — {formatItemName(item.name)}</h1>
      </header>

      <div className={`${panel} w-full max-w-[500px] p-6 flex flex-col gap-4`}>
        <label className="text-sm font-bold text-black" htmlFor="star-count">
          Stars (0-{MAX_STARS})
        </label>
        <NumberInput
          id="star-count"
          max={MAX_STARS}
          value={stars}
          onChange={(num) => setStarCount(slot, num)}
          className="px-3 py-2 bg-black text-white border-2 border-neutral-700"
        />
        <div className="text-sm text-neutral-800">Each star grants +2% of this item's own base stats.</div>
        <div className="mc-tooltip" style={{ position: 'static', fontSize: '13px' }}>
          <McTooltipLines parsedLines={[parseMinecraftLine(previewLine)]} />
        </div>

        <label className="flex items-center gap-2 text-sm font-bold text-black" htmlFor="dungeonize-toggle">
          <input
            id="dungeonize-toggle"
            type="checkbox"
            checked={dungeonized}
            onChange={(e) => setDungeonized(slot, e.target.checked)}
          />
          Dungeonize item
        </label>
        <div className="text-xs text-neutral-700 -mt-2">
          Shows each stat's Catacombs-scaled total (dark grey) and lets Damage Sources' "Toggle Dungeon Stats" use it instead.
        </div>
        {dungeonized && (
          <>
            <label className="flex items-center gap-2 text-sm text-black" htmlFor="dungeonize-old-curve">
              <input
                id="dungeonize-old-curve"
                type="checkbox"
                checked={dungeonizeOldCurve}
                onChange={(e) => setDungeonizeOldCurve(slot, e.target.checked)}
              />
              Use old Catacombs Stat curve (Pre-0.26.1)
            </label>

            <label className="text-sm font-bold text-black" htmlFor="master-star-count">
              Master Stars (0-{MAX_MASTER_STARS})
            </label>
            <NumberInput
              id="master-star-count"
              max={MAX_MASTER_STARS}
              value={masterStars}
              onChange={(num) => setMasterStars(slot, num)}
              className="px-3 py-2 bg-black text-white border-2 border-neutral-700"
            />
            <div className="text-xs text-neutral-700 -mt-2">
              Each Master Star grants +5% (instead of the normal +2%) of this item's own base stats — only usable while
              Dungeonized. Shown as a dark-blue delta on top of the normal Dungeonize total.
            </div>
          </>
        )}

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

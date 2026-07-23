import { useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { TUNING_STATS, TUNING_RATE_PER_POINT, computeTuningPoints } from '../lib/accessoryPowers';
import { STAT_LABELS, formatStatValue } from '../lib/reforgeData';
import { SLOT_TEXTURES } from '../lib/icons';
import { TUNING_BOX_RATE } from '../lib/attributes';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

// Stat Tuning — 1 point per 10 Magical Power (lib/accessoryPowers.js's
// computeTuningPoints), spendable across the 8 stats real Maxwell offers.
// A single number input per stat rather than +/- buttons, same shape as
// every other bounded-count input in this app (Books, Stars); each
// setAccessoryTuningPoint call is already clamped so the running total
// can never exceed what the current Magical Power grants (see
// BuildContext.jsx).
export default function AccessoryTuning() {
  const navigate = useNavigate();
  const { loadout, attributes, setAccessoryTuningPoint } = useBuild();

  if (!loadout.accessory) {
    return (
      <div className="min-h-screen flex flex-col items-center p-4">
        <header className="w-full max-w-[700px] mb-4">
          <h1 className="text-xl font-bold">The Hex — Stat Tuning</h1>
        </header>
        <div className="w-full max-w-[700px] text-[13px] text-neutral-300 mb-2.5">No Accessory Power selected.</div>
        <button
          className={`${panel} px-4 py-2 cursor-pointer hover:brightness-110 flex items-center gap-2`}
          onClick={() => navigate('/accessory')}
        >
          <img src={SLOT_TEXTURES.close} alt="Back" className="w-5 h-5" />
          Back
        </button>
      </div>
    );
  }

  const { magicalPower, tuning } = loadout.accessory.modifiers;
  const totalPoints = computeTuningPoints(magicalPower) + attributes.tuning_box * TUNING_BOX_RATE;
  const spentPoints = TUNING_STATS.reduce((sum, key) => sum + (tuning[key] || 0), 0);

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <header className="w-full max-w-[700px] mb-4">
        <h1 className="text-xl font-bold">The Hex — Stat Tuning</h1>
      </header>

      <div className={`${panel} w-full max-w-[500px] p-6 flex flex-col gap-3`}>
        <div className="text-sm font-bold text-black">
          Points remaining: {totalPoints - spentPoints} / {totalPoints}
        </div>

        {TUNING_STATS.map((key) => {
          const meta = STAT_LABELS[key];
          const points = tuning[key] || 0;
          return (
            <div key={key} className="flex items-center justify-between gap-2">
              <label className="text-sm text-black" htmlFor={`tuning-${key}`}>
                {meta.label}{' '}
                <span className="text-xs text-neutral-600">
                  ({formatStatValue(key, points * TUNING_RATE_PER_POINT[key])})
                </span>
              </label>
              <input
                id={`tuning-${key}`}
                type="number"
                min="0"
                max={totalPoints}
                step="1"
                value={points}
                onChange={(e) => setAccessoryTuningPoint(key, Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                className="w-16 px-2 py-1 text-sm bg-black text-white border-2 border-neutral-700 text-center"
              />
            </div>
          );
        })}

        <button
          className="self-start px-4 py-2 bg-neutral-800 text-white cursor-pointer hover:brightness-110"
          onClick={() => navigate('/accessory')}
        >
          Back
        </button>
      </div>
    </div>
  );
}

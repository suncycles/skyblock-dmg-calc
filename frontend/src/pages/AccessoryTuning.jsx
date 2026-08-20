import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useItemData } from '../context/ItemDataContext';
import { TUNING_STATS, TUNING_RATE_PER_POINT, computeTotalTuningPoints } from '../lib/accessoryPowers';
import { computeOptimalTuningForMp } from '../lib/tuningOptimizer';
import { STAT_LABELS, formatStatValue } from '../lib/reforgeData';
import { MOB_TYPES } from '../lib/mobTypes';
import { SLOT_TEXTURES } from '../lib/icons';
import NumberInput from '../components/NumberInput';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';
const translucentPanel =
  'bg-[#c6c6c6]/75 backdrop-blur-[1px] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

// Stat Tuning: 1 point per 10 Magical Power, spendable across the 8 stats Maxwell offers. Each
// setAccessoryTuningPoint call is clamped so the running total can never exceed the points granted.
export default function AccessoryTuning() {
  const navigate = useNavigate();
  const build = useBuild();
  const { loadout, attributes, setAccessoryTuningPoint, setAccessoryTuning } = build;
  const { itemData } = useItemData();
  const [autoSpending, setAutoSpending] = useState(false);

  const mobName = build.targetMobs[0] || null;
  const mobTypes = mobName ? MOB_TYPES[mobName] : null;

  async function handleAutoSpend() {
    if (!mobName || !mobTypes) return;
    setAutoSpending(true);
    try {
      const modeConfig = {
        useDungeonizedStats: build.useDungeonizedStats,
        useMasterMode: build.useMasterMode,
        metric: build.mageMode ? 'ability' : 'dps',
      };
      const optimal = await computeOptimalTuningForMp(loadout, itemData, build, modeConfig, { name: mobName, types: mobTypes }, loadout.accessory.modifiers.magicalPower);
      setAccessoryTuning(optimal);
    } finally {
      setAutoSpending(false);
    }
  }

  if (!loadout.accessory) {
    return (
      <div className="min-h-screen flex flex-col items-center p-4 relative">
        <header className="w-full max-w-[700px] mb-4">
          <h1 className="text-xl font-bold">Stat Tuning</h1>
        </header>
        <div className="w-full max-w-[700px] text-[13px] text-neutral-300 mb-2.5">No Accessory Power selected.</div>
        <button
          className={`${panel} px-4 py-2 cursor-pointer hover:brightness-110 flex items-center gap-2 text-sm font-bold text-black`}
          onClick={() => navigate('/accessory')}
        >
          <img src={SLOT_TEXTURES.close} alt="Back" className="w-5 h-5" />
          Back
        </button>
      </div>
    );
  }

  const { magicalPower, tuning } = loadout.accessory.modifiers;
  const totalPoints = computeTotalTuningPoints(magicalPower, attributes.tuning_box, attributes.echo_of_boxes, attributes.echo_of_echoes);
  const spentPoints = TUNING_STATS.reduce((sum, key) => sum + (tuning[key] || 0), 0);

  return (
    <div className="min-h-screen flex flex-col items-center p-4 relative">
      <header className="w-full max-w-[700px] mb-4">
        <h1 className="text-xl font-bold">Stat Tuning</h1>
      </header>

      <div className={`${translucentPanel} w-full max-w-[500px] p-6 flex flex-col gap-3`}>
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-bold text-black">
            Points remaining: {totalPoints - spentPoints} / {totalPoints}
          </div>
          <button
            type="button"
            onClick={handleAutoSpend}
            disabled={autoSpending || !mobName}
            title={mobName ? 'Spend every point where it does the most real DPS' : 'Pick a target mob first'}
            className="px-3 py-1.5 text-xs font-bold text-black bg-[#8fbf3f] border-[3px] border-t-[#c5e88a] border-l-[#c5e88a] border-b-[#4d6b1f] border-r-[#4d6b1f] cursor-pointer hover:brightness-110 disabled:opacity-50 disabled:cursor-default"
          >
            {autoSpending ? 'Spending...' : 'Auto-Spend'}
          </button>
        </div>
        {!mobName && <div className="text-[11px] text-neutral-600 italic -mt-1.5">Pick a target mob to auto-spend.</div>}

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
              <NumberInput
                id={`tuning-${key}`}
                max={totalPoints}
                value={points}
                onChange={(num) => setAccessoryTuningPoint(key, num)}
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

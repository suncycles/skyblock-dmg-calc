import { useBuild } from '../context/BuildContext';
import {
  mobDefenseDebuffMultiplier,
  finalDamageDebuffMultiplier,
  ICE_SPRAY_MULTIPLIER,
  TWILIGHT_ARROW_POISON_MULTIPLIER,
  LAST_BREATH_MAX_LEVEL,
  LAST_BREATH_PERCENT_PER_LEVEL,
  LETHALITY_MAX_STACKS,
  LETHALITY_PERCENT_PER_STACK,
} from '../lib/mobDebuffs';
import PageHeader from '../components/PageHeader';

const translucentPanel =
  'bg-[#c6c6c6]/75 backdrop-blur-[1px] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

const round2 = (n) => Math.round(n * 100) / 100;

// Debuffs applied to the TARGET (lib/mobDebuffs.js) — reached from the Debuffs tile on the gear
// board, which only appears while the Dungeon toggle is on. Same move and same live-apply behavior
// as the Dungeon Blessings page.
export default function Debuffs() {
  const { debuffs, setIceSpray, setTwilightPoison, setLastBreathLevel, setLethalityStacks, useDungeonizedStats } = useBuild();

  return (
    <div className="min-h-screen flex flex-col items-center p-4 relative">
      <PageHeader title="Debuffs" />

      <div className={`${translucentPanel} w-full max-w-[500px] p-6 flex flex-col gap-4`}>
        <div className="text-[12px] text-neutral-700 leading-snug -mt-1">Applied to the target, not to you.</div>
        {!useDungeonizedStats && (
          <div className="text-[12px] text-amber-300 border border-amber-400/40 bg-amber-400/10 rounded px-2 py-1.5">
            Debuffs only apply while the Dungeon toggle is on.
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-black" htmlFor="ice-spray">
          <input
            id="ice-spray"
            type="checkbox"
            checked={!!debuffs.iceSpray}
            onChange={(e) => setIceSpray(e.target.checked)}
            className="w-4 h-4 shrink-0"
          />
          <span>
            Ice Spray
            <span className="text-neutral-600 italic"> (x{ICE_SPRAY_MULTIPLIER} final damage)</span>
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm text-black" htmlFor="twilight-poison">
          <input
            id="twilight-poison"
            type="checkbox"
            checked={!!debuffs.twilightPoison}
            onChange={(e) => setTwilightPoison(e.target.checked)}
            className="w-4 h-4 shrink-0"
          />
          <span>
            Twilight Arrow Poison
            <span className="text-neutral-600 italic"> (x{TWILIGHT_ARROW_POISON_MULTIPLIER} final damage)</span>
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm text-black" htmlFor="last-breath">
          <span className="flex justify-between">
            <span>Last Breath</span>
            <span className="font-mono">{debuffs.lastBreath}</span>
          </span>
          <input
            id="last-breath"
            type="range"
            min="0"
            max={LAST_BREATH_MAX_LEVEL}
            step="1"
            value={debuffs.lastBreath}
            onChange={(e) => setLastBreathLevel(e.target.value)}
            className="w-full"
          />
          <span className="text-[11px] text-neutral-600 italic">-{LAST_BREATH_PERCENT_PER_LEVEL}% Defense per level</span>
        </label>
        <label className="flex flex-col gap-1 text-sm text-black" htmlFor="lethality-stacks">
          <span className="flex justify-between">
            <span>Lethality Stacks</span>
            <span className="font-mono">{debuffs.lethality}</span>
          </span>
          <input
            id="lethality-stacks"
            type="range"
            min="0"
            max={LETHALITY_MAX_STACKS}
            step="1"
            value={debuffs.lethality}
            onChange={(e) => setLethalityStacks(e.target.value)}
            className="w-full"
          />
          <span className="text-[11px] text-neutral-600 italic">-{LETHALITY_PERCENT_PER_STACK}% Defense per stack</span>
        </label>

        <div className="text-[12px] text-neutral-700 leading-snug border-t border-neutral-500/40 pt-2">
          Mob Defense x{round2(mobDefenseDebuffMultiplier(debuffs))} &middot; Final damage x{round2(finalDamageDebuffMultiplier(debuffs))}
          {/* Only 7 mobs in the app have a published Defense at all (lib/mobDefenses.js) — without
              this the two sliders look broken against everything else. */}
          <div className="italic mt-1 text-neutral-600">
            The two Defense sliders only change anything against a mob with a real Defense stat &mdash; the Catacombs
            bosses, Angry Archaeologist and Lost Adventurer.
          </div>
        </div>
      </div>
    </div>
  );
}

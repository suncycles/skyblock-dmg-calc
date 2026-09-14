import { useBuild } from '../context/BuildContext';
import {
  DUNGEON_BLESSINGS,
  BLESSING_MIN_LEVEL,
  BLESSING_MAX_LEVEL,
  computeBlessingMultiplier,
  MIMIC_SHARD_MAX_LEVEL,
  FORBIDDEN_BLESSING_MAX_LEVEL,
} from '../lib/dungeonBlessing';
import { masterSkullStrengthMultiplier } from '../lib/masterSkull';
import PageHeader from '../components/PageHeader';

const translucentPanel =
  'bg-[#c6c6c6]/75 backdrop-blur-[1px] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

const round2 = (n) => Math.round(n * 100) / 100;

// Dungeon Blessings — reached from the Blessings tile on the gear board, which only appears while
// the Dungeon toggle is on. Moved out of the damage breakdown (user-specified 2026-09-14): it's
// something you set, not something the calculator reports. Edits apply as you make them, like every
// other edit page; the damage numbers recalculate when you go back.
export default function DungeonBlessings() {
  const { blessing, attributes, setPaulBuff, setBlessingLevel, useDungeonizedStats } = useBuild();

  return (
    <div className="min-h-screen flex flex-col items-center p-4 relative">
      <PageHeader title="Dungeon Blessings" />

      <div className={`${translucentPanel} w-full max-w-[500px] p-6 flex flex-col gap-4`}>
        {!useDungeonizedStats && (
          <div className="text-[12px] text-amber-300 border border-amber-400/40 bg-amber-400/10 rounded px-2 py-1.5">
            Blessings only apply while the Dungeon toggle is on.
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-black" htmlFor="paul-buff">
          <input
            id="paul-buff"
            type="checkbox"
            checked={!!blessing.paulBuff}
            onChange={(e) => setPaulBuff(e.target.checked)}
            className="w-4 h-4 shrink-0"
          />
          <span>Paul Buff</span>
        </label>

        {/* Read-only: both come from the account on import (Mimic Shard level, Forbidden Blessing
            perk), editable on the Player Levels page — not typed here. */}
        <div className="flex flex-col gap-1 text-[12px] text-neutral-700 leading-snug">
          <div>
            Effectiveness x{round2(computeBlessingMultiplier(blessing, attributes))}
            <span className="italic">
              {' '}
              (Mimic {attributes.mimic || 0}/{MIMIC_SHARD_MAX_LEVEL} &middot; Forbidden {blessing.forbiddenBlessingLevel}/
              {FORBIDDEN_BLESSING_MAX_LEVEL})
            </span>
          </div>
          <div>
            Master Skull x{masterSkullStrengthMultiplier(blessing.masterSkullTier)}
            <span className="italic"> (Tier {blessing.masterSkullTier || '—'}, Strength only)</span>
          </div>
        </div>

        {DUNGEON_BLESSINGS.map((b) => (
          <label key={b.id} className="flex flex-col gap-1 text-sm text-black" htmlFor={`blessing-${b.id}`}>
            <span className="flex justify-between">
              <span>{b.label}</span>
              <span className="font-mono">{blessing.levels[b.id]}</span>
            </span>
            <input
              id={`blessing-${b.id}`}
              type="range"
              min={BLESSING_MIN_LEVEL}
              max={BLESSING_MAX_LEVEL}
              step="1"
              value={blessing.levels[b.id]}
              onChange={(e) => setBlessingLevel(b.id, e.target.value)}
              className="w-full"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

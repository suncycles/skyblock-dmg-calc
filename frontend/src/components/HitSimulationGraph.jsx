import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

// Matches DpsByHitGraph's own note — Recharts renders raw SVG with literal stroke/fill props, so
// the site's Tailwind dark-glass theme never applies here and has to be hardcoded instead.
const GRAPH_AXIS_COLOR = 'rgba(241, 245, 249, 0.7)';
const GRAPH_GRID_COLOR = 'rgba(255, 255, 255, 0.15)';
const HP_LINE_COLOR = '#f87171';

const PROC_LABELS = {
  meleeDamage: 'Melee (+ Execute/Prosecute)',
  fireAspectDamage: 'Fire Aspect',
  thunderlordDamage: 'Thunderlord',
  crimsonSwipeDamage: 'Crimson Swipe',
  venomousDamage: 'Venomous (amortized)',
};

function HitTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  return (
    <div className="bg-neutral-900/95 border border-white/15 rounded px-2.5 py-1.5 text-[11px] text-white shadow-lg">
      <div className="font-bold mb-0.5">Hit {label}</div>
      {point && (
        <>
          <div className="flex justify-between gap-3">
            <span className="text-neutral-400">Mob HP</span>
            <span className="font-mono">{point.hpPercent.toFixed(1)}%</span>
          </div>
          {Object.entries(PROC_LABELS).map(
            ([key, name]) =>
              point[key] > 0 && (
                <div key={key} className="flex justify-between gap-3">
                  <span className="text-neutral-300">{name}</span>
                  <span className="font-mono">{Math.round(point[key]).toLocaleString()}</span>
                </div>
              ),
          )}
          <div className="flex justify-between gap-3 border-t border-white/15 mt-0.5 pt-0.5">
            <span className="text-emerald-400 font-semibold">Total Damage</span>
            <span className="font-mono font-semibold">{Math.round(point.totalDamage).toLocaleString()}</span>
          </div>
        </>
      )}
    </div>
  );
}

// Real hit-by-hit fight simulation (lib/finalDamage.js's simulateHitByHit) — replaces
// DpsByHitGraph's flat steady-state extrapolation with an actual per-hit damage sequence against
// the mob's real starting HP, so Execute/Prosecute's ramp and Fire Aspect/Thunderlord/Crimson
// Swipe's individual procs show up as real bumps/growth instead of being smoothed into one
// constant DPS number (user-specified 2026-08-31). `hasRealHp` false means no confirmed HP number
// exists for this mob yet (docs/mob-hp-followups.md) — the sequence still simulates (holding Mob
// HP% constant at the slider's value instead of draining a real pool), so a small note explains why.
// Under a minute shows seconds to 1 decimal; past that, whole minutes+seconds — matches how
// real fight lengths actually get talked about ("14.2s" for a quick kill, "3m 20s" for a slog).
function formatDuration(seconds) {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

export default function HitSimulationGraph({ hits, hasRealHp, mobName, totalHits, timeToKillSeconds, exceededSimCap, maxDps, minDps }) {
  if (!hits || hits.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 border-t-2 border-neutral-500 pt-2 mt-1">
      <div className="flex items-baseline justify-between flex-wrap gap-x-3">
        <span className="text-[11px] font-bold text-neutral-700 uppercase tracking-wide">
          Damage by Hit ({hits.length === 40 ? '1-40' : `1-${hits.length}`})
        </span>
        {hasRealHp && totalHits != null && (
          <span className="text-[11px] font-mono text-neutral-800">
            <span className="font-bold">Time to Kill:</span> {totalHits.toLocaleString()} hits ({formatDuration(timeToKillSeconds)})
          </span>
        )}
        {exceededSimCap && (
          <span className="text-[11px] font-mono text-neutral-800">
            <span className="font-bold">Time to Kill:</span> doesn't die within 10,000 hits
          </span>
        )}
      </div>
      {/* Real per-hit DPS swings over the shown window — from Venomous stacking up, Execute/
          Prosecute ramping as real HP drains, and First Strike/Triple Strike's opening-hit-only
          boost — rather than the single fixed "Total DPS" snapshot above assumes. Shown whenever
          there's more than one point to spread across (a flat, unvarying fight makes max===min,
          not worth a redundant line). */}
      {maxDps != null && minDps != null && Math.round(maxDps) !== Math.round(minDps) && (
        <span className="text-[11px] font-mono text-neutral-800">
          <span className="font-bold">Max DPS:</span> {Math.round(maxDps).toLocaleString()}
          <span className="mx-1.5 text-neutral-600">·</span>
          <span className="font-bold">Min DPS:</span> {Math.round(minDps).toLocaleString()}
        </span>
      )}
      {!hasRealHp && (
        <span className="text-[10px] italic text-neutral-600">
          No confirmed HP for {mobName} yet — held at the Mob HP% slider's value instead of a real draining pool.
        </span>
      )}
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={hits} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRAPH_GRID_COLOR} vertical={false} />
          <XAxis
            dataKey="hit"
            tick={{ fill: GRAPH_AXIS_COLOR, fontSize: 11 }}
            stroke={GRAPH_AXIS_COLOR}
            label={{ value: 'Hits', position: 'insideBottom', offset: -4, fill: GRAPH_AXIS_COLOR, fontSize: 11 }}
          />
          <YAxis
            yAxisId="damage"
            tick={{ fill: GRAPH_AXIS_COLOR, fontSize: 11 }}
            stroke={GRAPH_AXIS_COLOR}
            width={56}
            tickFormatter={(v) => v.toLocaleString()}
          />
          {hasRealHp && (
            <YAxis
              yAxisId="hp"
              orientation="right"
              domain={[0, 100]}
              tick={{ fill: GRAPH_AXIS_COLOR, fontSize: 11 }}
              stroke={GRAPH_AXIS_COLOR}
              width={40}
              tickFormatter={(v) => `${v}%`}
            />
          )}
          <Tooltip content={<HitTooltip />} cursor={{ stroke: GRAPH_GRID_COLOR, strokeWidth: 1 }} />
          <Line
            yAxisId="damage"
            type="linear"
            dataKey="totalDamage"
            name="Total Damage"
            stroke="#4ade80"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
          {hasRealHp && (
            <Line
              yAxisId="hp"
              type="linear"
              dataKey="hpPercent"
              name="Mob HP %"
              stroke={HP_LINE_COLOR}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

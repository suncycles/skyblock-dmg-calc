import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { DPS_HITS_PER_SECOND, MAX_VENOMOUS_STACKS } from '../lib/finalDamage';

// Matches the site-wide "universal text relighting" every panel gets for its dark-glass theme
// (index.css's .text-neutral-*/.border-neutral-* overrides) — Recharts renders raw SVG with
// literal stroke/fill props, so those Tailwind classes never apply here and the same colors have
// to be hardcoded directly instead.
const GRAPH_AXIS_COLOR = 'rgba(241, 245, 249, 0.7)';
const GRAPH_GRID_COLOR = 'rgba(255, 255, 255, 0.15)';

function DpsStackTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-neutral-900/95 border border-white/15 rounded px-2.5 py-1.5 text-[11px] text-white shadow-lg">
      <div className="font-bold mb-0.5">Hit {label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex justify-between gap-3">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono">{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

// X-axis is "hits landed so far" — Venomous's real mechanic is that every landed hit adds its own
// independent DoT stack (up to MAX_VENOMOUS_STACKS), so hit count and active-stack count are the
// same number; `perStackVenomousDamage` scales linearly with it exactly as before. The same hit
// count also now gates First Strike/Triple Strike: `steadyOtherDps` (Melee/Thunderlord/Fire
// Aspect/Crimson Swipe at the steady, no-opening-bonus rate — see finalDamage.js's
// computeDpsBreakdown) gets `meleeBoostDelta` added back on for hits within `firstHitBoostCount`
// (1 for First Strike, 3 for Triple Strike, 0 for neither), so the line visibly steps down once
// those hits stop applying instead of staying flat. Always rendered (not gated on Venomous/either
// enchant being equipped) — with neither, `perStackVenomousDamage` and `meleeBoostDelta` are both
// 0 so the line is just flat at steadyOtherDps, same placeholder behavior as before.
//
// Its own dynamically-imported chunk (see DamageSources.jsx's React.lazy wrapper) rather than a
// normal import — recharts (+ its d3 submodules) is a genuinely heavy dependency used nowhere else
// in the app, so bundling it directly into DamageSources' chunk meant every visit to the page paid
// for it even in the (far more common) plain Final Damage view where DPS mode is never toggled on.
export default function DpsByHitGraph({ perStackVenomousDamage, steadyOtherDps, meleeBoostDelta, firstHitBoostCount, hasVenomous }) {
  const data = Array.from({ length: MAX_VENOMOUS_STACKS }, (_, i) => {
    const hit = i + 1;
    const venomousDps = Math.round(perStackVenomousDamage * hit * DPS_HITS_PER_SECOND.venomous);
    const otherDps = steadyOtherDps + (hit <= firstHitBoostCount ? meleeBoostDelta : 0);
    return { hit, venomousDps, totalDps: Math.round(otherDps) + venomousDps };
  });

  return (
    <div className="flex flex-col gap-1 border-t-2 border-neutral-500 pt-2 mt-1">
      {/* One neutral title regardless of what's equipped — used to single out "(no Venomous
          equipped)" specifically, which over-called-out one enchant among several that can shape
          this line (Venomous stacks, First Strike/Triple Strike's opening-hit boost) (user-specified
          2026-08-29). */}
      <span className="text-[11px] font-bold text-neutral-700 uppercase tracking-wide">Total DPS by Hit (1-{MAX_VENOMOUS_STACKS})</span>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRAPH_GRID_COLOR} vertical={false} />
          <XAxis
            dataKey="hit"
            tick={{ fill: GRAPH_AXIS_COLOR, fontSize: 11 }}
            stroke={GRAPH_AXIS_COLOR}
            label={{ value: 'Hits', position: 'insideBottom', offset: -4, fill: GRAPH_AXIS_COLOR, fontSize: 11 }}
          />
          <YAxis tick={{ fill: GRAPH_AXIS_COLOR, fontSize: 11 }} stroke={GRAPH_AXIS_COLOR} width={56} tickFormatter={(v) => v.toLocaleString()} />
          <Tooltip content={<DpsStackTooltip />} cursor={{ stroke: GRAPH_GRID_COLOR, strokeWidth: 1 }} />
          <Line
            type="linear"
            dataKey="totalDps"
            name="Total DPS"
            stroke="#4ade80"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
          {hasVenomous && (
            <Line
              type="linear"
              dataKey="venomousDps"
              name="Venomous DPS"
              stroke="#38bdf8"
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

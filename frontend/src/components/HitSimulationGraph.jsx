import { useState } from 'react';
import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

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

// One line per damage source rather than a single summed line (user-specified 2026-09-05) — a
// stacked total hides which source is actually moving. Same key order as PROC_LABELS so the
// legend and the tooltip read in the same order.
const SOURCE_SERIES = [
  { key: 'meleeDamage', name: 'Melee', color: '#4ade80' },
  { key: 'venomousDamage', name: 'Venomous', color: '#a78bfa' },
  { key: 'fireAspectDamage', name: 'Fire Aspect', color: '#fb923c' },
  { key: 'thunderlordDamage', name: 'Thunderlord', color: '#38bdf8' },
  { key: 'crimsonSwipeDamage', name: 'Crimson Swipe', color: '#f472b6' },
];
const TOTAL_COLOR = '#4ade80';

// The damage axis deliberately does NOT start at zero. Anchored at 0, a real build's variance is
// invisible — at ~5,000,000 per hit a 10,000 swing is 0.2% of the axis, a flat line (user-reported
// 2026-09-05). Fitting the axis to the values actually plotted turns that same swing into real
// vertical movement. Padded by 8% of the span so the extremes aren't welded to the frame, and only
// clamped at 0 when the padding would otherwise push below it.
function damageDomain(hits, keys) {
  const values = [];
  for (const h of hits) {
    for (const k of keys) {
      const v = h[k];
      if (Number.isFinite(v)) values.push(v);
    }
  }
  if (values.length === 0) return [0, 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [Math.max(0, min - Math.abs(min) * 0.05 - 1), max + Math.abs(max) * 0.05 + 1];
  const pad = (max - min) * 0.08;
  return [Math.max(0, min - pad), max + pad];
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-1 text-[10px] text-neutral-700 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="cursor-pointer" />
      {label}
    </label>
  );
}

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
export default function HitSimulationGraph({ hits, hasRealHp, mobName, maxDps, minDps }) {
  // Split by default, aggregate on demand. Mob HP stays on by default (unchanged), but is now
  // switchable: it spans the full 0-100% height on its own axis, so against damage lines that
  // only vary by a fraction of a percent it was the only thing the eye could follow.
  const [aggregate, setAggregate] = useState(false);
  const [showHp, setShowHp] = useState(true);
  const safeHits = hits && hits.length > 0 ? hits : [];

  // Only sources that actually fire — a build with no Venomous/Thunderlord shouldn't get flat
  // zero lines pinning the axis minimum to 0 and squashing everything else.
  const activeSeries = SOURCE_SERIES.filter(({ key }) => safeHits.some((h) => (h[key] || 0) > 0));
  const plottedKeys = aggregate || activeSeries.length === 0 ? ['totalDamage'] : activeSeries.map((sm) => sm.key);
  const domain = damageDomain(safeHits, plottedKeys);
  const hpVisible = hasRealHp && showHp;

  if (safeHits.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 border-t-2 border-neutral-500 pt-2 mt-1">
      <div className="flex items-baseline justify-between flex-wrap gap-x-3">
        <span className="text-[11px] font-bold text-neutral-700 uppercase tracking-wide">
          Damage by Hit ({hits.length === 40 ? '1-40' : `1-${hits.length}`})
        </span>
        <div className="flex items-center gap-3 ml-auto">
          {activeSeries.length > 1 && <Toggle checked={aggregate} onChange={setAggregate} label="Aggregate" />}
          {hasRealHp && <Toggle checked={showHp} onChange={setShowHp} label="Mob HP" />}
        </div>
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
          No confirmed HP for {mobName} yet — held at full HP instead of a real draining pool.
        </span>
      )}
      {/* Taller than the original 200 and with real bottom padding: the legend added above the
          plot consumed vertical space, which pushed the "Hits" axis label 8px past the container
          and clipped it. */}
      <ResponsiveContainer width="100%" height={228}>
        {/* left margin + a wider damage axis: at width 56 with no left margin, a realistic
            damage tick ("1,234,567" is ~58px at this font size) overflowed the axis and got
            clipped against the SVG's left edge. 72 fits ~10 characters, and the 6px margin keeps
            the widest label off the boundary entirely. */}
        <ComposedChart data={hits} margin={{ top: 8, right: 12, bottom: 16, left: 6 }}>
          <CartesianGrid stroke={GRAPH_GRID_COLOR} vertical={false} />
          <XAxis
            dataKey="hit"
            tick={{ fill: GRAPH_AXIS_COLOR, fontSize: 11 }}
            stroke={GRAPH_AXIS_COLOR}
            label={{ value: 'Hits', position: 'insideBottom', offset: -4, fill: GRAPH_AXIS_COLOR, fontSize: 11 }}
          />
          <YAxis
            yAxisId="damage"
            domain={domain}
            allowDataOverflow
            tick={{ fill: GRAPH_AXIS_COLOR, fontSize: 11 }}
            stroke={GRAPH_AXIS_COLOR}
            width={72}
            /* Full numbers, not compact ("4.99M"): on an axis fitted this tightly, compact ticks
               round several gridlines to the same label and throw away the resolution the fitted
               domain exists to show. */
            tickFormatter={(v) => Math.round(v).toLocaleString()}
          />
          {hpVisible && (
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
          <Legend
            verticalAlign="top"
            height={22}
            iconSize={8}
            wrapperStyle={{ fontSize: 10, color: GRAPH_AXIS_COLOR }}
          />
          {aggregate || activeSeries.length === 0 ? (
            <Line
              yAxisId="damage"
              type="linear"
              dataKey="totalDamage"
              name="Total Damage"
              stroke={TOTAL_COLOR}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          ) : (
            activeSeries.map(({ key, name, color }) => (
              <Line
                key={key}
                yAxisId="damage"
                type="linear"
                dataKey={key}
                name={name}
                stroke={color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            ))
          )}
          {hpVisible && (
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

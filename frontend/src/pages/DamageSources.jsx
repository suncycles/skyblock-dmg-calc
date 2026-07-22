import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useItemData } from '../context/ItemDataContext';
import { collectDamageSources } from '../lib/damageSources';
import { STAT_LABELS, formatStatValue } from '../lib/reforgeData';
import { SLOT_TEXTURES } from '../lib/icons';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

function Section({ title, subtitle, children, empty }) {
  return (
    <div className={`${panel} p-3 flex flex-col gap-1.5`}>
      <div className="text-sm font-bold text-black">{title}</div>
      {subtitle && <div className="text-[11px] text-neutral-700 -mt-1 mb-1">{subtitle}</div>}
      {children.length === 0 ? <div className="text-xs text-neutral-600 italic">{empty}</div> : children}
    </div>
  );
}

const BASE_STAT_KEYS = ['damage', 'strength', 'crit_chance', 'crit_damage'];

// Cross-loadout damage-source breakdown — every equipped item/enchant/
// pet ability that contributes bonus damage, categorized the same way
// lib/damageSources.js computes it: (Base) stats summed across every
// slot; non-conditional vs conditional % additive damage (condition
// shown per entry, e.g. Smite -> "Wither, Undead, Skeletal"); Nx
// multiplicative sources; and a collapsed-by-default situational list
// for formula-based sources this app can't resolve to a fixed value yet
// (Execute's %-per-missing-HP, etc.) — shown for transparency rather
// than silently dropped, not counted in any total above.
export default function DamageSources() {
  const navigate = useNavigate();
  const { loadout } = useBuild();
  const { itemData } = useItemData();
  const [result, setResult] = useState(null);
  const [showSituational, setShowSituational] = useState(false);
  const tokenRef = useRef(0);

  useEffect(() => {
    const token = ++tokenRef.current;
    setResult(null);
    collectDamageSources(loadout, itemData).then((r) => {
      if (tokenRef.current === token) setResult(r);
    });
  }, [loadout, itemData]);

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <header className="w-full max-w-[700px] mb-4 flex items-center gap-3">
        <button
          className="text-sm px-3 py-1.5 cursor-pointer bg-neutral-800 text-white hover:brightness-110"
          onClick={() => navigate('/')}
        >
          <img src={SLOT_TEXTURES.close} alt="" className="w-4 h-4 inline-block mr-1 align-[-2px]" />
          Back
        </button>
        <h1 className="text-xl font-bold">Damage Sources</h1>
      </header>

      {!result ? (
        <div className="w-full max-w-[700px] text-sm text-neutral-300">Calculating...</div>
      ) : (
        <div className="w-full max-w-[700px] flex flex-col gap-3">
          <Section title="(Base) Stats" empty="">
            {BASE_STAT_KEYS.map((key) => (
              <div key={key} className="flex justify-between text-[13px] text-black">
                <span>{STAT_LABELS[key].label}:</span>
                <span className="font-mono">{formatStatValue(key, Math.round(result.baseStats[key] * 10) / 10)}</span>
              </div>
            ))}
          </Section>

          <Section title="Non-conditional % Additive Damage" empty="None equipped.">
            {result.additiveNonConditional.map((e) => (
              <Row key={e.id} left={e.label} right={`+${round1(e.value)}%`} source={e.source} />
            ))}
          </Section>

          <Section
            title="Conditional % Additive Damage"
            subtitle="Only applies against the listed target(s)."
            empty="None equipped."
          >
            {result.additiveConditional.map((e) => (
              <Row key={e.id} left={e.label} right={`+${round1(e.value)}% to ${e.condition}`} source={e.source} />
            ))}
          </Section>

          <Section title="Multiplicative Damage Sources" empty="None equipped.">
            {result.multiplicative.map((e) => (
              <Row key={e.id} left={e.label} right={`${round1(e.value)}x${e.condition ? ` to ${e.condition}` : ''}`} source={e.source} />
            ))}
          </Section>

          <div className={`${panel} p-3`}>
            <button
              className="text-xs font-bold text-black cursor-pointer underline"
              onClick={() => setShowSituational((v) => !v)}
            >
              {showSituational ? 'Hide' : 'Show'} situational sources ({result.situational.length}) — not counted above
            </button>
            {showSituational && (
              <div className="flex flex-col gap-1.5 mt-2">
                {result.situational.length === 0 ? (
                  <div className="text-xs text-neutral-600 italic">None.</div>
                ) : (
                  result.situational.map((e) => (
                    <div key={e.id} className="text-[12px] text-neutral-800 border-t border-neutral-400 pt-1.5">
                      <div className="font-bold">
                        {e.label} <span className="font-normal text-neutral-600">— {e.source}</span>
                      </div>
                      <div className="text-neutral-600">{e.note}</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function Row({ left, right, source }) {
  return (
    <div className="flex justify-between items-baseline text-[13px] text-black gap-2">
      <span>
        {left} <span className="text-[11px] text-neutral-600">— {source}</span>
      </span>
      <span className="font-mono whitespace-nowrap">{right}</span>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useItemData } from '../context/ItemDataContext';
import { collectDamageSources } from '../lib/damageSources';
import { computeFinalDamage } from '../lib/finalDamage';
import { MOB_TYPES } from '../lib/mobTypes';
import { STAT_LABELS, formatStatValue } from '../lib/reforgeData';
import { SLOT_TEXTURES } from '../lib/icons';
import { splitKeywords, KEYWORD_SYMBOLS, MOB_TYPE_SYMBOLS } from '../lib/damageSymbols';

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

// Prefixes every stat/mob-type keyword mention (lib/damageSymbols.js) with
// its colored glyph — used for base-stat labels, conditional/multiplicative
// condition text ("Undead, Skeletal, Wither", "Cubic"), and situational
// notes, since any of those can name a keyword.
function Keyworded({ text }) {
  return splitKeywords(text).map((part, i) =>
    typeof part === 'string' ? (
      <span key={i}>{part}</span>
    ) : (
      <span key={i} style={{ color: KEYWORD_SYMBOLS[part.keyword].color }}>
        {KEYWORD_SYMBOLS[part.keyword].symbol} {part.matchedText}
      </span>
    ),
  );
}

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
  const { loadout, playerStats, targetMob } = useBuild();
  const { itemData } = useItemData();
  const [result, setResult] = useState(null);
  const [showSituational, setShowSituational] = useState(false);
  const tokenRef = useRef(0);

  useEffect(() => {
    const token = ++tokenRef.current;
    setResult(null);
    collectDamageSources(loadout, itemData, playerStats).then((r) => {
      if (tokenRef.current === token) setResult(r);
    });
  }, [loadout, itemData, playerStats]);

  const targetMobTypes = targetMob ? MOB_TYPES[targetMob] : null;
  const validTarget = targetMob && targetMobTypes;
  const finalDamage = result && validTarget ? computeFinalDamage(result, { name: targetMob, types: targetMobTypes }) : null;

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
          <div className={`${panel} p-4 flex flex-col gap-2`}>
            <div className="text-sm font-bold text-black">Final Damage</div>
            {!validTarget ? (
              <div className="text-xs text-neutral-600 italic">
                {targetMob && !targetMobTypes
                  ? `"${targetMob}" is no longer in the mob data — `
                  : 'No target selected — '}
                <button className="underline cursor-pointer" onClick={() => navigate('/target-mob')}>
                  pick a mob
                </button>{' '}
                to compute Final Damage.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <span className="text-[13px] font-bold text-black">{targetMob}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {targetMobTypes.map((t) => {
                      const meta = MOB_TYPE_SYMBOLS[t];
                      return (
                        <span key={t} className="text-[10px] font-mono" style={{ color: meta.color }}>
                          {meta.symbol} {t}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[12px] text-neutral-700">
                  <span>Initial Damage</span>
                  <span className="text-right font-mono">{round1(finalDamage.initialDamage)}</span>
                  <span>Additive Multiplier</span>
                  <span className="text-right font-mono">
                    +{round1(finalDamage.additivePercent)}% (x{round4(finalDamage.additiveMultiplier)})
                  </span>
                  <span>Multiplicative Multiplier</span>
                  <span className="text-right font-mono">{round4(finalDamage.multiplicativeMultiplier)}x</span>
                  {finalDamage.bonusModifiers !== 0 && (
                    <>
                      <span>Bonus Modifiers</span>
                      <span className="text-right font-mono">+{round1(finalDamage.bonusModifiers)}</span>
                    </>
                  )}
                </div>
                <div className="flex items-baseline justify-between border-t-2 border-neutral-500 pt-2 mt-1">
                  <span className="text-sm font-bold text-black">Final Damage</span>
                  <span className="text-2xl font-mono font-bold text-black">
                    {finalDamage.finalDamage.toLocaleString()}
                  </span>
                </div>
              </>
            )}
          </div>

          <Section title="(Base) Stats" empty="">
            {BASE_STAT_KEYS.map((key) => (
              <div key={key} className="flex justify-between text-[13px] text-black">
                <span>
                  <Keyworded text={STAT_LABELS[key].label} />:
                </span>
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
              <Row
                key={e.id}
                left={e.label}
                right={
                  <>
                    +{round1(e.value)}% to <Keyworded text={e.condition} />
                  </>
                }
                source={e.source}
                applied={finalDamage ? finalDamage.appliedIds.has(e.id) : undefined}
              />
            ))}
          </Section>

          <Section title="Multiplicative Damage Sources" empty="None equipped.">
            {result.multiplicative.map((e) => (
              <Row
                key={e.id}
                left={e.label}
                right={
                  <>
                    {round4(e.value)}x{e.condition && (
                      <>
                        {' '}
                        to <Keyworded text={e.condition} />
                      </>
                    )}
                  </>
                }
                source={e.source}
                applied={finalDamage ? finalDamage.appliedIds.has(e.id) : undefined}
              />
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
                      <div className="text-neutral-600">
                        <Keyworded text={e.note} />
                      </div>
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

// Multiplicative sources can be much finer-grained than the 1-decimal %
// entries (Skyblock Level is only +0.0001x per level) — 1 decimal would
// silently flatten a real bonus down to "1x".
function round4(n) {
  return Math.round(n * 10000) / 10000;
}

// `applied` is only meaningful once a target mob is selected (see
// lib/finalDamage.js's appliedIds) — undefined (no target yet) renders
// normally, false dims the row to show it isn't contributing to the
// Final Damage number above.
function Row({ left, right, source, applied }) {
  return (
    <div className={`flex justify-between items-baseline text-[13px] text-black gap-2 ${applied === false ? 'opacity-40' : ''}`}>
      <span>
        {left} <span className="text-[11px] text-neutral-600">— {source}</span>
      </span>
      <span className="font-mono whitespace-nowrap">{right}</span>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useItemData } from '../context/ItemDataContext';
import { collectDamageSources } from '../lib/damageSources';
import { computeFinalDamage } from '../lib/finalDamage';
import { MOB_TYPES } from '../lib/mobTypes';
import { MOB_TYPE_SYMBOLS } from '../lib/damageSymbols';
import { STAT_LABELS, formatStatValue } from '../lib/reforgeData';
import { BASE_STAT_KEYS, Keyworded, round1, round4 } from '../lib/damageFormat';
import { decodeLoadoutCode } from '../lib/loadoutCode';
import { loadSavedLoadoutsFromStorage } from '../lib/savedLoadouts';
import PageHeader from '../components/PageHeader';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';
const sectionTitle = 'text-[13px] font-bold text-black uppercase tracking-wide pb-1 mb-0.5 border-b border-neutral-500/40';

const SELECTION_A_KEY = 'hexCompareLoadoutA';
const SELECTION_B_KEY = 'hexCompareLoadoutB';

// B defaults to the first saved loadout (not Current Build again) so a first-time visit doesn't
// show a pointless "Current vs Current" comparison — A always defaults to Current Build.
function loadInitialSelection(key, fallbackToFirstSaved) {
  const stored = localStorage.getItem(key);
  if (stored) return stored;
  if (fallbackToFirstSaved) {
    const saved = loadSavedLoadoutsFromStorage();
    if (saved.length > 0) return saved[0].id;
  }
  return 'current';
}

// Snapshots the live build into the same shape decodeLoadoutCode() produces for a saved
// loadout, memoized so its identity only changes when the underlying build state actually does
// (collectDamageSources runs off this identity — see useLoadoutResult below).
function useCurrentBuildState(build) {
  return useMemo(
    () => ({
      loadout: build.loadout,
      playerStats: build.playerStats,
      attributes: build.attributes,
      miscStats: build.miscStats,
      godPotionActive: build.godPotionActive,
      useDungeonizedStats: build.useDungeonizedStats,
      useMasterMode: build.useMasterMode,
      mageMode: build.mageMode,
      mobHpPercent: build.mobHpPercent,
      infernalCrimsonStacks: build.infernalCrimsonStacks,
      swarmMobs: build.swarmMobs,
      comboKills: build.comboKills,
      legionPlayers: build.legionPlayers,
      blazeCrimsonIsle: build.blazeCrimsonIsle,
    }),
    [
      build.loadout,
      build.playerStats,
      build.attributes,
      build.miscStats,
      build.godPotionActive,
      build.useDungeonizedStats,
      build.useMasterMode,
      build.mageMode,
      build.mobHpPercent,
      build.infernalCrimsonStacks,
      build.swarmMobs,
      build.comboKills,
      build.legionPlayers,
      build.blazeCrimsonIsle,
    ],
  );
}

// Resolves one side's selection (either 'current' or a saved-loadout id) into a full build
// state, then runs the same collectDamageSources() pipeline DamageSources.jsx uses — both are
// plain functions taking explicit args, not tied to context, so this is the only new plumbing
// needed to compute two independent results at once.
function useLoadoutResult(selection, itemData, currentState, savedLoadouts) {
  const [decoded, setDecoded] = useState(null);
  const [result, setResult] = useState(null);
  const decodeToken = useRef(0);
  const resultToken = useRef(0);

  const entry = selection === 'current' ? null : savedLoadouts.find((l) => l.id === selection) || null;
  const missing = selection !== 'current' && !entry;

  useEffect(() => {
    if (!entry) {
      setDecoded(null);
      return;
    }
    const token = ++decodeToken.current;
    decodeLoadoutCode(entry.code, itemData)
      .then((s) => {
        if (decodeToken.current === token) setDecoded(s);
      })
      .catch((err) => {
        console.error('Failed to decode saved loadout for comparison:', err);
        if (decodeToken.current === token) setDecoded(null);
      });
  }, [entry, itemData]);

  const state = selection === 'current' ? currentState : decoded;

  useEffect(() => {
    if (!state) {
      setResult(null);
      return;
    }
    const token = ++resultToken.current;
    collectDamageSources(
      state.loadout,
      itemData,
      state.playerStats,
      state.godPotionActive,
      state.attributes,
      state.miscStats,
      state.mobHpPercent,
      state.infernalCrimsonStacks,
      state.useDungeonizedStats,
      state.swarmMobs,
      state.comboKills,
      state.legionPlayers,
      state.blazeCrimsonIsle,
    ).then((r) => {
      if (resultToken.current === token) setResult(r);
    });
  }, [state, itemData]);

  return { state, result, missing };
}

function computeSideMobResult(side, mobName) {
  if (side.missing) return { status: 'missing' };
  if (!side.result) return { status: 'loading' };
  const types = MOB_TYPES[mobName] || null;
  if (!types) return { status: 'unknown-mob' };
  const finalDamage = computeFinalDamage(side.result, { name: mobName, types }, side.state.useDungeonizedStats, side.state.useMasterMode);
  return { status: 'ok', finalDamage };
}

function displayedStat(side, key) {
  if (!side.result) return null;
  if (!side.state.useDungeonizedStats) return side.result.baseStats[key];
  return side.state.useMasterMode ? side.result.masterDungeonizedBaseStats[key] : side.result.dungeonizedBaseStats[key];
}

function LoadoutSelect({ label, value, onChange, savedLoadouts }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[11px] font-bold text-neutral-300 uppercase tracking-wide whitespace-nowrap w-20">{label}</label>
      <select value={value} onChange={onChange} className={`${panel} text-sm px-2 py-1.5 text-black cursor-pointer flex-1`}>
        <option value="current">Current Build</option>
        {savedLoadouts.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function MobResultCard({ label, r }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] font-bold text-neutral-700 uppercase tracking-wide truncate">{label}</div>
      {r.status === 'loading' && <div className="text-xs text-neutral-500 italic">Loading...</div>}
      {r.status === 'missing' && <div className="text-xs text-neutral-500 italic">This saved loadout no longer exists.</div>}
      {r.status === 'unknown-mob' && <div className="text-xs text-neutral-500 italic">Mob data unavailable.</div>}
      {r.status === 'ok' && (
        <>
          <div className="grid grid-cols-2 gap-x-2 text-[11px] text-neutral-700">
            <span>Initial Damage</span>
            <span className="text-right font-mono">{round1(r.finalDamage.initialDamage)}</span>
            <span>Additive Multiplier</span>
            <span className="text-right font-mono">x{round4(r.finalDamage.additiveMultiplier)}</span>
            {r.finalDamage.weaponBonusPercent !== 0 && (
              <>
                <span>Weapon Bonus</span>
                <span className="text-right font-mono">x{round4(r.finalDamage.weaponBonusMultiplier)}</span>
              </>
            )}
            <span>Multiplicative</span>
            <span className="text-right font-mono">{round4(r.finalDamage.multiplicativeMultiplier)}x</span>
          </div>
          <div className="flex items-baseline justify-between border-t border-neutral-400 pt-1 mt-1">
            <span className="text-xs font-bold text-black">Final Damage</span>
            <span className="text-xl font-mono font-bold text-black">{r.finalDamage.finalDamage.toLocaleString()}</span>
          </div>
        </>
      )}
    </div>
  );
}

// Side-by-side Final Damage / (Base) Stats comparison of two loadouts (Current Build and/or any
// saved loadout, see lib/savedLoadouts.js) against the app's shared target mob selection —
// avoids swapping the live build back and forth or duplicating the browser tab just to compare numbers.
export default function Compare() {
  const navigate = useNavigate();
  const build = useBuild();
  const { itemData } = useItemData();
  const [savedLoadouts] = useState(loadSavedLoadoutsFromStorage);
  const [selectionA, setSelectionAState] = useState(() => loadInitialSelection(SELECTION_A_KEY, false));
  const [selectionB, setSelectionBState] = useState(() => loadInitialSelection(SELECTION_B_KEY, true));

  function setSelectionA(value) {
    setSelectionAState(value);
    localStorage.setItem(SELECTION_A_KEY, value);
  }
  function setSelectionB(value) {
    setSelectionBState(value);
    localStorage.setItem(SELECTION_B_KEY, value);
  }

  const currentState = useCurrentBuildState(build);
  const sideA = useLoadoutResult(selectionA, itemData, currentState, savedLoadouts);
  const sideB = useLoadoutResult(selectionB, itemData, currentState, savedLoadouts);

  function sideLabel(selection) {
    if (selection === 'current') return 'Current Build';
    return savedLoadouts.find((l) => l.id === selection)?.name || 'Unknown loadout';
  }

  const labelA = sideLabel(selectionA);
  const labelB = sideLabel(selectionB);
  const targetMobs = build.targetMobs;

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <PageHeader title="Compare Loadouts" />

      <div className="w-full max-w-[1100px] flex flex-col gap-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <LoadoutSelect label="Loadout A" value={selectionA} onChange={(e) => setSelectionA(e.target.value)} savedLoadouts={savedLoadouts} />
          <LoadoutSelect label="Loadout B" value={selectionB} onChange={(e) => setSelectionB(e.target.value)} savedLoadouts={savedLoadouts} />
        </div>

        {savedLoadouts.length === 0 && (
          <div className={`${panel} p-3 text-xs text-neutral-700`}>
            Both sides show your Current Build for now — save a build from the{' '}
            <button className="underline cursor-pointer font-bold" onClick={() => navigate('/')}>
              📁 Loadouts
            </button>{' '}
            panel on the home screen to compare it here.
          </div>
        )}

        {targetMobs.length === 0 ? (
          <div className={`${panel} p-4 flex flex-col gap-2`}>
            <div className={sectionTitle}>Final Damage</div>
            <div className="text-xs text-neutral-600 italic">
              No target selected —{' '}
              <button className="underline cursor-pointer" onClick={() => navigate('/target-mob')}>
                pick a mob
              </button>{' '}
              to compare Final Damage.
            </div>
          </div>
        ) : (
          targetMobs.map((name) => {
            const types = MOB_TYPES[name] || null;
            const a = computeSideMobResult(sideA, name);
            const b = computeSideMobResult(sideB, name);
            const delta = a.status === 'ok' && b.status === 'ok' ? b.finalDamage.finalDamage - a.finalDamage.finalDamage : null;
            const deltaPct = delta != null && a.finalDamage.finalDamage !== 0 ? (delta / a.finalDamage.finalDamage) * 100 : null;
            return (
              <div key={name} className={`${panel} p-4 flex flex-col gap-2`}>
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <span className="text-[13px] font-bold text-black tracking-wide">{name}</span>
                  {types && (
                    <div className="flex flex-wrap gap-1.5">
                      {types.map((t) => {
                        const meta = MOB_TYPE_SYMBOLS[t];
                        return (
                          <span key={t} className="text-[10px] font-mono" style={{ color: meta.color }}>
                            {meta.symbol} {t}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <MobResultCard label={labelA} r={a} />
                  <MobResultCard label={labelB} r={b} />
                </div>
                {delta != null && (
                  <div
                    className={`text-center text-sm font-mono font-bold pt-2 mt-1 border-t-2 border-neutral-500 ${
                      delta > 0 ? 'text-green-700' : delta < 0 ? 'text-red-700' : 'text-neutral-600'
                    }`}
                  >
                    {labelB} vs {labelA}: {delta > 0 ? '+' : ''}
                    {delta.toLocaleString()} ({deltaPct > 0 ? '+' : ''}
                    {round1(deltaPct)}%)
                  </div>
                )}
              </div>
            );
          })
        )}

        <div className={`${panel} p-3 flex flex-col gap-1.5`}>
          <div className={sectionTitle}>(Base) Stats</div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 text-[12px] text-black">
            <span></span>
            <span className="font-bold text-[10px] uppercase text-neutral-600 text-right truncate max-w-[120px]">{labelA}</span>
            <span className="font-bold text-[10px] uppercase text-neutral-600 text-right truncate max-w-[120px]">{labelB}</span>
            {BASE_STAT_KEYS.map((key) => {
              const a = displayedStat(sideA, key);
              const b = displayedStat(sideB, key);
              return (
                <Fragment key={key}>
                  <span>
                    <Keyworded text={STAT_LABELS[key].label} />
                  </span>
                  <span className="text-right font-mono">{a != null ? formatStatValue(key, Math.round(a * 10) / 10) : '—'}</span>
                  <span className="text-right font-mono">{b != null ? formatStatValue(key, Math.round(b * 10) / 10) : '—'}</span>
                </Fragment>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { key: 'A', selection: selectionA, side: sideA, label: labelA },
            { key: 'B', selection: selectionB, side: sideB, label: labelB },
          ].map(({ key, side, label }) => (
            <button
              key={key}
              type="button"
              disabled={!side.state}
              className="text-[11px] underline text-neutral-300 disabled:text-neutral-600 disabled:no-underline disabled:cursor-not-allowed cursor-pointer text-left"
              onClick={() => {
                build.loadFullState(side.state);
                navigate('/damage-sources');
              }}
            >
              View full breakdown for {label} →
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

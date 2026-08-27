import { useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useItemData } from '../context/ItemDataContext';
import { collectDamageSources, FABLED_REFORGE_ID } from '../lib/damageSources';
import { computeFinalDamage, computeDpsBreakdown, DPS_HITS_PER_SECOND } from '../lib/finalDamage';
import { FABLED_CRIT_BONUS_MAX_PERCENT } from '../lib/reforges';
import { MOB_TYPES } from '../lib/mobTypes';
import { MOB_TYPE_SYMBOLS } from '../lib/damageSymbols';
import { STAT_LABELS, formatStatValue } from '../lib/reforgeData';
import { BASE_STAT_KEYS, Keyworded, round1, round4 } from '../lib/damageFormat';
import { decodeLoadoutCode } from '../lib/loadoutCode';
import { loadSavedLoadoutsFromStorage, useSavedLoadoutHelmetPreviews } from '../lib/savedLoadouts';
import { formatItemName } from '../lib/mcText';
import PageHeader from '../components/PageHeader';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';
const sectionTitle = 'text-[13px] font-bold text-black uppercase tracking-wide pb-1 mb-0.5 border-b border-neutral-500/40';

const SELECTIONS_KEY = 'hexCompareSelections';
const MIN_COMPARE_SLOTS = 2;
// ponytail: fixed cap for grid readability, not a hard technical limit — raise if users actually want more.
const MAX_COMPARE_SLOTS = 6;

// Second slot defaults to the first saved loadout (not Current Build again) so a first-time
// visit doesn't show a pointless "Current vs Current" comparison — the first slot always
// defaults to Current Build.
function loadInitialSelections() {
  const stored = localStorage.getItem(SELECTIONS_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length >= MIN_COMPARE_SLOTS) return parsed;
    } catch {
      // fall through to defaults
    }
  }
  const saved = loadSavedLoadoutsFromStorage();
  return ['current', saved.length > 0 ? saved[0].id : 'current'];
}

// Snapshots the live build into the same shape decodeLoadoutCode() produces for a saved
// loadout, memoized so its identity only changes when the underlying build state actually does
// (collectDamageSources runs off this identity — see useLoadoutResults below).
function useCurrentBuildState(build) {
  return useMemo(
    () => ({
      loadout: build.loadout,
      playerStats: build.playerStats,
      attributes: build.attributes,
      miscStats: build.miscStats,
      godPotionActive: build.godPotionActive,
      godPotionMixin: build.godPotionMixin,
      useDungeonizedStats: build.useDungeonizedStats,
      useMasterMode: build.useMasterMode,
      mageMode: build.mageMode,
      mobHpPercent: build.mobHpPercent,
      infernalCrimsonStacks: build.infernalCrimsonStacks,
      swarmMobs: build.swarmMobs,
      comboKills: build.comboKills,
      legionPlayers: build.legionPlayers,
      blazeCrimsonIsle: build.blazeCrimsonIsle,
      bestiaryMaxedMobs: build.bestiaryMaxedMobs,
    }),
    [
      build.loadout,
      build.playerStats,
      build.attributes,
      build.miscStats,
      build.godPotionActive,
      build.godPotionMixin,
      build.useDungeonizedStats,
      build.useMasterMode,
      build.mageMode,
      build.mobHpPercent,
      build.infernalCrimsonStacks,
      build.swarmMobs,
      build.comboKills,
      build.legionPlayers,
      build.blazeCrimsonIsle,
      build.bestiaryMaxedMobs,
    ],
  );
}

// Resolves every slot's selection (each either 'current' or a saved-loadout id) into
// { state, result, missing }, running the same collectDamageSources() pipeline
// DamageSources.jsx uses for each. A single hook over the whole selections array (rather than
// one hook call per slot) since the array's length is dynamic — React's rules of hooks forbid
// calling a hook a variable number of times. Results are cached by selection value, so two
// slots pointing at the same loadout (including two both left on 'current') share one
// computation instead of duplicating it. Per-key tokens guard against a stale async resolution
// (e.g. rapid selection changes) overwriting a newer one.
function useLoadoutResults(selections, itemData, currentState, savedLoadouts) {
  const [resultsByKey, setResultsByKey] = useState({});
  const tokensRef = useRef({});

  useEffect(() => {
    let cancelled = false;
    for (const selection of selections) {
      const entry = selection === 'current' ? null : savedLoadouts.find((l) => l.id === selection) || null;
      const missing = selection !== 'current' && !entry;
      if (missing) {
        setResultsByKey((prev) => ({ ...prev, [selection]: { state: null, result: null, missing: true } }));
        continue;
      }

      const token = (tokensRef.current[selection] = (tokensRef.current[selection] || 0) + 1);
      (async () => {
        const state =
          selection === 'current'
            ? currentState
            : await decodeLoadoutCode(entry.code, itemData).catch((err) => {
                console.error('Failed to decode saved loadout for comparison:', err);
                return null;
              });
        if (cancelled || tokensRef.current[selection] !== token) return;
        if (!state) {
          setResultsByKey((prev) => ({ ...prev, [selection]: { state: null, result: null, missing: false } }));
          return;
        }
        const result = await collectDamageSources(
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
          state.bestiaryMaxedMobs,
          state.godPotionMixin,
        );
        if (cancelled || tokensRef.current[selection] !== token) return;
        setResultsByKey((prev) => ({ ...prev, [selection]: { state, result, missing: false } }));
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [selections, itemData, currentState, savedLoadouts]);

  return selections.map((s) => resultsByKey[s] || { state: null, result: null, missing: false });
}

// `result` and `state` land in state together (see useLoadoutResults above), so there's a render
// or two — right after switching a slot's selection — where the map still holds no entry yet for
// the new key. Treat that exactly like "still loading" rather than reading off a null `state`.
function computeSideMobResult(side, mobName) {
  if (side.missing) return { status: 'missing' };
  if (!side.result || !side.state) return { status: 'loading' };
  const types = MOB_TYPES[mobName] || null;
  if (!types) return { status: 'unknown-mob' };
  const mob = { name: mobName, types };
  const finalDamage = computeFinalDamage(side.result, mob, side.state.useDungeonizedStats, side.state.useMasterMode);

  // Fabled's crit-hit-chance bonus is randomized per hit — main figure stays at the "no bonus" baseline, second figure shows the real max (same treatment as DamageSources.jsx).
  const hasFabledBonus = side.result.multiplicative.some((e) => e.id === FABLED_REFORGE_ID);
  const finalDamageWithFabledMax = hasFabledBonus
    ? computeFinalDamage(
        {
          ...side.result,
          multiplicative: side.result.multiplicative.map((e) =>
            e.id === FABLED_REFORGE_ID ? { ...e, value: 1 + FABLED_CRIT_BONUS_MAX_PERCENT / 100 } : e,
          ),
        },
        mob,
        side.state.useDungeonizedStats,
        side.state.useMasterMode,
      )
    : null;

  // DPS Mode (see finalDamage.js's computeDpsBreakdown) — computed unconditionally alongside
  // Final Damage since it's cheap and the toggle only decides which one renders.
  const dps = computeDpsBreakdown(side.result, mob, side.state.loadout, side.state.useDungeonizedStats, side.state.useMasterMode);

  return { status: 'ok', finalDamage, finalDamageWithFabledMax, dps };
}

function displayedStat(side, key, isMythologicalTarget) {
  if (!side.result || !side.state) return null;
  if (!side.state.useDungeonizedStats) {
    return isMythologicalTarget ? side.result.mythologicalBaseStats[key] : side.result.baseStats[key];
  }
  if (side.state.useMasterMode) {
    return isMythologicalTarget ? side.result.mythologicalMasterDungeonizedBaseStats[key] : side.result.masterDungeonizedBaseStats[key];
  }
  return isMythologicalTarget ? side.result.mythologicalDungeonizedBaseStats[key] : side.result.dungeonizedBaseStats[key];
}

// `helmetPreview` per option is a formatted item name | '' (no helmet) | undefined (still
// decoding) — same convention as lib/savedLoadouts.js's useSavedLoadoutHelmetPreviews, appended
// to each option's label since a native <select> can't render an icon inside <option>.
function previewSuffix(preview) {
  if (preview === undefined) return '';
  return preview ? ` — ⛑️ ${preview}` : ' — (no helmet)';
}

function LoadoutSelect({ label, value, onChange, savedLoadouts, currentHelmetPreview, helmetPreviews, onRemove }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[11px] font-bold text-neutral-300 uppercase tracking-wide whitespace-nowrap w-20">{label}</label>
      <select value={value} onChange={onChange} className={`${panel} min-w-0 text-sm px-2 py-1.5 text-black cursor-pointer flex-1`}>
        <option value="current">{`Current Build${previewSuffix(currentHelmetPreview)}`}</option>
        {savedLoadouts.map((l) => (
          <option key={l.id} value={l.id}>
            {`${l.name}${previewSuffix(helmetPreviews[l.id])}`}
          </option>
        ))}
      </select>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title="Remove this loadout from the comparison"
          className="shrink-0 w-7 h-7 flex items-center justify-center bg-neutral-800 text-white cursor-pointer hover:brightness-110"
        >
          ✕
        </button>
      )}
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
            <span className="text-xs font-bold text-black">Final Damage{r.finalDamageWithFabledMax ? ' (Fabled)' : ''}</span>
            <span className="text-xl font-mono font-bold text-black">
              {r.finalDamageWithFabledMax
                ? `${r.finalDamage.finalDamage.toLocaleString()} ~ ${r.finalDamageWithFabledMax.finalDamage.toLocaleString()}`
                : r.finalDamage.finalDamage.toLocaleString()}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function DpsResultCard({ label, r }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] font-bold text-neutral-700 uppercase tracking-wide truncate">{label}</div>
      {r.status === 'loading' && <div className="text-xs text-neutral-500 italic">Loading...</div>}
      {r.status === 'missing' && <div className="text-xs text-neutral-500 italic">This saved loadout no longer exists.</div>}
      {r.status === 'unknown-mob' && <div className="text-xs text-neutral-500 italic">Mob data unavailable.</div>}
      {r.status === 'ok' && (
        <>
          <div className="grid grid-cols-2 gap-x-2 text-[11px] text-neutral-700">
            <span>Melee ({round1(r.dps.meleeHitsPerSecond)}/s)</span>
            <span className="text-right font-mono">{Math.round(r.dps.melee).toLocaleString()}</span>
            <span>Venomous ({DPS_HITS_PER_SECOND.venomous}/s)</span>
            <span className="text-right font-mono">{Math.round(r.dps.venomous).toLocaleString()}</span>
            <span>Thunderlord ({DPS_HITS_PER_SECOND.thunderlord}/s)</span>
            <span className="text-right font-mono">{Math.round(r.dps.thunderlord).toLocaleString()}</span>
            <span>Fire Aspect ({DPS_HITS_PER_SECOND.fireAspect}/s)</span>
            <span className="text-right font-mono">{Math.round(r.dps.fireAspect).toLocaleString()}</span>
            <span>Crimson Swipe ({DPS_HITS_PER_SECOND.crimsonSwipe}/s)</span>
            <span className="text-right font-mono">{Math.round(r.dps.crimsonSwipe).toLocaleString()}</span>
          </div>
          <div className="flex items-baseline justify-between border-t border-neutral-400 pt-1 mt-1">
            <span className="text-xs font-bold text-black">Total DPS</span>
            <span className="text-xl font-mono font-bold text-black">{Math.round(r.dps.total).toLocaleString()}</span>
          </div>
        </>
      )}
    </div>
  );
}

// Side-by-side (or N-way) Final Damage / (Base) Stats comparison of loadouts (Current Build
// and/or any saved loadout, see lib/savedLoadouts.js) against the app's shared target mob
// selection — avoids swapping the live build back and forth or duplicating the browser tab just
// to compare numbers. Starts with 2 slots; every extra slot's delta is shown against slot 0 (the
// first slot) as a baseline, the same way slot B was always compared against slot A before.
export default function Compare() {
  const navigate = useNavigate();
  const build = useBuild();
  const { itemData, loading: itemDataLoading } = useItemData();
  const [savedLoadouts] = useState(loadSavedLoadoutsFromStorage);
  const [selections, setSelectionsState] = useState(loadInitialSelections);

  function setSelections(next) {
    setSelectionsState(next);
    localStorage.setItem(SELECTIONS_KEY, JSON.stringify(next));
  }
  function setSelectionAt(index, value) {
    const next = [...selections];
    next[index] = value;
    setSelections(next);
  }
  function addSlot() {
    if (selections.length >= MAX_COMPARE_SLOTS) return;
    setSelections([...selections, 'current']);
  }
  function removeSlot(index) {
    if (selections.length <= MIN_COMPARE_SLOTS) return;
    setSelections(selections.filter((_, i) => i !== index));
  }

  const currentState = useCurrentBuildState(build);
  const sides = useLoadoutResults(selections, itemData, currentState, savedLoadouts);
  const helmetPreviews = useSavedLoadoutHelmetPreviews(savedLoadouts, itemData, true, itemDataLoading);
  const currentHelmetName = build.loadout.helmet?.item?.name;
  const currentHelmetPreview = currentHelmetName ? formatItemName(currentHelmetName) : '';

  function sideLabel(selection) {
    if (selection === 'current') return 'Current Build';
    return savedLoadouts.find((l) => l.id === selection)?.name || 'Unknown loadout';
  }

  const labels = selections.map(sideLabel);
  const slotLetters = selections.map((_, i) => String.fromCharCode(65 + i));
  const targetMobs = build.targetMobs;
  // Same "applies to at least one selected mob" treatment as DamageSources.jsx — the (Base) Stats
  // panel below is one shared block per loadout side, not per-mob.
  const isMythologicalTarget = targetMobs.some((name) => (MOB_TYPES[name] || []).includes('Mythological'));

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <PageHeader
        title="Compare Loadouts"
        right={
          <button
            type="button"
            onClick={build.toggleDpsMode}
            className={`${panel} px-4 py-2 cursor-pointer flex items-center gap-2 text-sm font-bold text-black transition-[filter] ${
              build.dpsMode ? 'hover:brightness-110' : 'brightness-50'
            }`}
          >
            DPS
          </button>
        }
      />

      <div className="w-full max-w-[1100px] flex flex-col gap-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {selections.map((selection, i) => (
            <LoadoutSelect
              key={i}
              label={`Loadout ${slotLetters[i]}`}
              value={selection}
              onChange={(e) => setSelectionAt(i, e.target.value)}
              savedLoadouts={savedLoadouts}
              currentHelmetPreview={currentHelmetPreview}
              helmetPreviews={helmetPreviews}
              onRemove={selections.length > MIN_COMPARE_SLOTS ? () => removeSlot(i) : null}
            />
          ))}
        </div>

        {selections.length < MAX_COMPARE_SLOTS && (
          <button
            type="button"
            onClick={addSlot}
            className="self-start text-[12px] font-bold px-3 py-1.5 bg-neutral-800 text-white cursor-pointer hover:brightness-110"
          >
            + Compare More
          </button>
        )}

        {savedLoadouts.length === 0 && (
          <div className={`${panel} p-3 text-xs text-neutral-700`}>
            Every slot shows your Current Build for now — save a build from the{' '}
            <button className="underline cursor-pointer font-bold" onClick={() => navigate('/')}>
              📁 Loadouts
            </button>{' '}
            panel on the home screen to compare it here.
          </div>
        )}

        {targetMobs.length === 0 ? (
          <div className={`${panel} p-4 flex flex-col gap-2`}>
            <div className={sectionTitle}>{build.dpsMode ? 'DPS' : 'Final Damage'}</div>
            <div className="text-xs text-neutral-600 italic">
              No target selected —{' '}
              <button className="underline cursor-pointer" onClick={() => navigate('/target-mob')}>
                pick a mob
              </button>{' '}
              to compare {build.dpsMode ? 'DPS' : 'Final Damage'}.
            </div>
          </div>
        ) : (
          targetMobs.map((name) => {
            const types = MOB_TYPES[name] || null;
            const results = sides.map((side) => computeSideMobResult(side, name));
            const baseline = results[0];
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {results.map((r, i) =>
                    build.dpsMode ? (
                      <DpsResultCard key={i} label={labels[i]} r={r} />
                    ) : (
                      <MobResultCard key={i} label={labels[i]} r={r} />
                    ),
                  )}
                </div>
                {results.slice(1).map((r, i) => {
                  const idx = i + 1;
                  const baselineValue =
                    baseline.status === 'ok' ? (build.dpsMode ? Math.round(baseline.dps.total) : baseline.finalDamage.finalDamage) : null;
                  const value = r.status === 'ok' ? (build.dpsMode ? Math.round(r.dps.total) : r.finalDamage.finalDamage) : null;
                  const delta = baselineValue != null && value != null ? value - baselineValue : null;
                  const deltaPct = delta != null && baselineValue !== 0 ? (delta / baselineValue) * 100 : null;
                  if (delta == null) return null;
                  return (
                    <div
                      key={idx}
                      className={`text-center text-sm font-mono font-bold pt-2 mt-1 border-t-2 border-neutral-500 ${
                        delta > 0 ? 'text-green-700' : delta < 0 ? 'text-red-700' : 'text-neutral-600'
                      }`}
                    >
                      {labels[idx]} vs {labels[0]}: {delta > 0 ? '+' : ''}
                      {delta.toLocaleString()} ({deltaPct > 0 ? '+' : ''}
                      {round1(deltaPct)}%)
                    </div>
                  );
                })}
              </div>
            );
          })
        )}

        <div className={`${panel} p-3 flex flex-col gap-1.5 overflow-x-auto`}>
          <div className={sectionTitle}>(Base) Stats{isMythologicalTarget ? ' (Mythological)' : ''}</div>
          <div
            className="grid gap-x-3 gap-y-1 text-[12px] text-black"
            style={{ gridTemplateColumns: `1fr repeat(${selections.length}, auto)` }}
          >
            <span></span>
            {labels.map((label, i) => (
              <span key={i} className="font-bold text-[10px] uppercase text-neutral-600 text-right truncate max-w-[120px]">
                {label}
              </span>
            ))}
            {BASE_STAT_KEYS.map((key) => (
              <Fragment key={key}>
                <span>
                  <Keyworded text={STAT_LABELS[key].label} />
                </span>
                {sides.map((side, i) => {
                  const value = displayedStat(side, key, isMythologicalTarget);
                  return (
                    <span key={i} className="text-right font-mono">
                      {value != null ? formatStatValue(key, Math.round(value * 10) / 10) : '—'}
                    </span>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sides.map((side, i) => (
            <button
              key={i}
              type="button"
              disabled={!side.state}
              className="text-[11px] underline text-neutral-300 disabled:text-neutral-600 disabled:no-underline disabled:cursor-not-allowed cursor-pointer text-left"
              onClick={() => {
                build.loadFullState(side.state);
                navigate('/damage-sources');
              }}
            >
              View full breakdown for {labels[i]} →
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

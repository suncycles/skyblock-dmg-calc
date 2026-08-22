import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useItemData } from '../context/ItemDataContext';
import { runOptimizer, applyOptimizerResult, OPTIMIZER_MODES, OPTIMIZER_GEAR_SLOTS, hasCuratedData } from '../lib/optimizer';
import { buildAccessoryCandidates, buildGenericMpCandidates, evaluateAccessoryCandidates } from '../lib/accessoryOptimizer';
import { ARMOR_SLOT_LABELS } from '../lib/armorSlots';
import { EQUIPMENT_SLOT_LABELS } from '../lib/equipmentSlots';
import { MOB_TYPES } from '../lib/mobTypes';
import { round1, round3Sig } from '../lib/damageFormat';
import PageHeader from '../components/PageHeader';
import WeaponIcon from '../components/WeaponIcon';
import { getItemCornerBadge } from '../lib/itemCornerBadge';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';
const sectionTitle = 'text-[13px] font-bold text-black uppercase tracking-wide pb-1 mb-0.5 border-b border-neutral-500/40';

const SLOT_LABELS = { ...ARMOR_SLOT_LABELS, ...EQUIPMENT_SLOT_LABELS, pet: 'Pet' };

const CATEGORY_COLORS = {
  Enchant: '#4ade80',
  'Ultimate Enchant': '#22d3ee',
  'Power Stone': '#a78bfa',
  Stars: '#fb923c',
  Reforge: '#60a5fa',
  Recombobulator: '#818cf8',
  'Pet Item': '#f472b6',
  'New Accessory': '#4ade80',
  Recombobulate: '#818cf8',
  'Perfect Gemstones': '#a78bfa',
  'Magical Power (generic)': '#facc15',
  'Full Set': '#fb7185',
};

// User-specified: reaching 82% Bonus Attack Speed is Slayer's single highest priority — shown as
// prominent context here rather than special-cased into the ranked list's sort order (confirmed).
const SLAYER_ATTACK_SPEED_TARGET = 82;

const EMPTY_STATE = { status: 'idle', baselineValue: 0, bonusAttackSpeed: 0, slots: {}, otherResults: [] };

function UpgradeRow({ result, onSwapIn }) {
  if (!result) {
    return <div className="px-3 py-2 text-xs text-neutral-600 italic">No upgrades available.</div>;
  }
  const badge = result.itemId && getItemCornerBadge(result.itemId, result.slot, { special: result.special });
  return (
    <button
      type="button"
      onClick={() => onSwapIn(result)}
      title="Click to equip this upgrade"
      className="w-full flex items-center gap-2 px-3 py-2 bg-[#8b8b8b]/40 hover:bg-[#8b8b8b]/70 border border-black/30 cursor-pointer text-left transition-colors"
    >
      {result.itemId && (
        <div className="relative shrink-0 w-6 h-6">
          <WeaponIcon id={result.itemId} material={result.material} alt="" className="w-6 h-6 pixelated" />
          {badge && (
            <span className="absolute -bottom-0.5 -right-0.5 text-[7px] font-bold text-white bg-black/80 leading-none px-[2px] rounded-[1px]">
              {badge}
            </span>
          )}
        </div>
      )}
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[13px] text-black truncate">{result.label}</span>
        <span className="text-[10px] text-neutral-700">
          Cost: {result.cost.toLocaleString()} coins · Ratio: {result.ratio != null ? round1(result.ratio) : '—'}
        </span>
      </div>
      <span className="text-sm font-mono font-bold text-green-700 whitespace-nowrap">+{round3Sig(result.percentIncrease)}%</span>
    </button>
  );
}

// Damage Increase Optimizer — brute-forces/curated-list-evaluates real gear/enchant/pet/power
// alternatives against the current loadout. See lib/optimizer.js for the full evaluation engine
// and its documented assumptions, and lib/pricing.js for how real coin costs are looked up.
// One dedicated slot per gear piece, showing only the immediate next tier's best candidate (click
// to equip); non-slot-tiered categories (Enchant/Ultimate Enchant/Power Stone/Stars) list
// separately below since every real option there still shows.
export default function Optimizer() {
  const navigate = useNavigate();
  const build = useBuild();
  const { itemData, loading: itemDataLoading } = useItemData();
  const [mode, setMode] = useState('slayer');
  const [state, setState] = useState(EMPTY_STATE);
  const tokenRef = useRef(0);

  const mobName = build.targetMobs[0] || null;
  const mobTypes = mobName ? MOB_TYPES[mobName] : null;
  // Real accessory bag list, persisted from whichever Hypixel import last ran (see
  // lib/hypixelImport.js) — null means no import has ever happened, distinct from an import that
  // found zero accessories. No separate fetch here: reuses whatever's already on the loadout.
  const ownedAccessories = build.loadout.accessory?.modifiers?.ownedAccessories ?? null;

  useEffect(() => {
    if (itemDataLoading || !mobName || !mobTypes) {
      setState({ ...EMPTY_STATE, status: 'no-target' });
      return;
    }
    const token = ++tokenRef.current;
    setState((prev) => ({ ...prev, status: 'loading' }));
    runOptimizer(build.loadout, itemData, build, mode, { name: mobName, types: mobTypes }).then((result) => {
      if (tokenRef.current === token) setState({ status: 'ok', ...result });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    build.loadout,
    build.playerStats,
    build.attributes,
    build.miscStats,
    build.godPotionActive,
    build.mobHpPercent,
    build.infernalCrimsonStacks,
    build.swarmMobs,
    build.comboKills,
    build.legionPlayers,
    build.blazeCrimsonIsle,
    itemData,
    itemDataLoading,
    mode,
    mobName,
  ]);

  const [mpResult, setMpResult] = useState(null);
  const mpTokenRef = useRef(0);
  useEffect(() => {
    if (itemDataLoading || !mobName || !mobTypes) {
      setMpResult(null);
      return;
    }
    // No real account on file — still show Magical Power's real DPS effect, just as generic
    // "+10/+20/... MP" steps (unknown cost, not tied to any specific real accessory) instead of
    // real missing/upgradeable ones.
    const candidates = ownedAccessories
      ? itemData.accessoryFamilies && buildAccessoryCandidates(ownedAccessories, itemData.accessoryFamilies)
      : buildGenericMpCandidates();
    if (!candidates) {
      setMpResult(null);
      return;
    }
    const token = ++mpTokenRef.current;
    evaluateAccessoryCandidates(build.loadout, itemData, build, mode, { name: mobName, types: mobTypes }, candidates).then((result) => {
      if (mpTokenRef.current === token) setMpResult(result);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [build.loadout, build.attributes, itemData, itemDataLoading, mode, mobName, mobTypes]);

  // Magical Power candidates merge into the same "Other Upgrades" ranked list as every
  // brute-forced category from runOptimizer, rather than a separate section — one consistent
  // ranked list, per user direction. Sort toggle: "increase" is straightforward %DPS; "ratio" is
  // real damage-per-coin (see lib/pricing.js) — null only for genuinely unpriced results (free
  // reforges, generic MP sweeps), which sink to the bottom under "ratio".
  const [sortBy, setSortBy] = useState('increase');
  const combinedOtherResults = [...state.otherResults, ...(mpResult?.results || [])].sort((a, b) => {
    if (sortBy === 'ratio') {
      if (a.ratio == null && b.ratio == null) return b.percentIncrease - a.percentIncrease;
      if (a.ratio == null) return 1;
      if (b.ratio == null) return -1;
      return b.ratio - a.ratio;
    }
    return b.percentIncrease - a.percentIncrease;
  });

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <PageHeader title="Damage Optimizer" />
      <div className="w-full max-w-[700px] flex flex-col gap-3">
        <div className={`${panel} p-3 flex flex-col gap-2`}>
          <div className={sectionTitle}>Optimize For</div>
          <div className="grid grid-cols-2 gap-2">
            {OPTIMIZER_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={`${panel} px-3 py-2 text-sm font-bold text-black cursor-pointer transition-[filter] ${
                  mode === m.id ? 'hover:brightness-110' : 'brightness-50'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          {!hasCuratedData(mode) && (
            <div className="text-[11px] text-neutral-700 italic">
              Armor/Pet progression isn't configured for this mode yet — only Enchant/Ultimate Enchant/Power Stone/Stars
              suggestions show below.
            </div>
          )}
        </div>

        {!ownedAccessories ? (
          mobName &&
          mobTypes && (
            <div className={`${panel} p-3 text-[11px] text-neutral-700 italic`}>
              No Hypixel import on file — Magical Power suggestions below are generic +10 steps (unknown cost), not real
              accessories. Import from Hypixel to see actual missing/upgradeable ones instead.
            </div>
          )
        ) : (
          mobName &&
          mobTypes && (
            <div className={`${panel} p-3 text-[11px] text-neutral-700`}>
              {mpResult
                ? `Magical Power: ${mpResult.currentMp} (${ownedAccessories.length} accessories on file)`
                : `Evaluating ${ownedAccessories.length} real accessories for Magical Power upgrades...`}
            </div>
          )
        )}

        {mode === 'slayer' && state.status === 'ok' && (
          <div className={`${panel} p-3 flex items-center justify-between`}>
            <span className="text-[12px] font-bold text-black uppercase tracking-wide">Bonus Attack Speed (highest priority)</span>
            <span
              className={`text-lg font-mono font-bold ${state.bonusAttackSpeed >= SLAYER_ATTACK_SPEED_TARGET ? 'text-green-700' : 'text-red-700'}`}
            >
              {round1(state.bonusAttackSpeed)}%{' '}
              {state.bonusAttackSpeed < SLAYER_ATTACK_SPEED_TARGET && (
                <span className="text-xs font-normal">(target: {SLAYER_ATTACK_SPEED_TARGET}%)</span>
              )}
            </span>
          </div>
        )}

        {state.status === 'no-target' ? (
          <div className={`${panel} p-4 flex flex-col gap-2`}>
            <div className={sectionTitle}>Upgrades</div>
            <div className="text-xs text-neutral-600 italic">
              No target selected —{' '}
              <button className="underline cursor-pointer" onClick={() => navigate('/target-mob')}>
                pick a mob
              </button>{' '}
              to run the optimizer.
            </div>
          </div>
        ) : state.status === 'loading' ? (
          <div className={`${panel} p-4 text-xs text-neutral-600 italic`}>Evaluating candidates...</div>
        ) : (
          <>
            <div className={`${panel} p-3 flex flex-col gap-2`}>
              <div className={sectionTitle}>Upgrades by Slot</div>
              {OPTIMIZER_GEAR_SLOTS.filter((slot) => state.slots[slot])
                .sort((a, b) => state.slots[b].percentIncrease - state.slots[a].percentIncrease)
                .map((slot) => (
                  <div key={slot} className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-700">{SLOT_LABELS[slot]}</span>
                    <UpgradeRow result={state.slots[slot]} onSwapIn={(r) => applyOptimizerResult(build, r)} />
                  </div>
                ))}
              {OPTIMIZER_GEAR_SLOTS.every((slot) => !state.slots[slot]) && (
                <div className="px-3 py-2 text-xs text-neutral-600 italic">No upgrades available in any slot.</div>
              )}
            </div>

            {combinedOtherResults.length > 0 && (
              <div className={`${panel} p-3 flex flex-col gap-1.5`}>
                <div className="flex items-center justify-between pb-1 mb-0.5 border-b border-neutral-500/40">
                  <span className="text-[13px] font-bold text-black uppercase tracking-wide">Other Upgrades</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setSortBy('increase')}
                      className={`px-2 py-0.5 text-[10px] font-bold cursor-pointer ${
                        sortBy === 'increase' ? 'bg-[#8fbf3f] text-black' : 'bg-black/20 text-neutral-700 hover:bg-black/30'
                      }`}
                    >
                      Highest Increase
                    </button>
                    <button
                      type="button"
                      onClick={() => setSortBy('ratio')}
                      title="Damage increase per coin — ranks candidates by DPS gained per coin spent"
                      className={`px-2 py-0.5 text-[10px] font-bold cursor-pointer ${
                        sortBy === 'ratio' ? 'bg-[#8fbf3f] text-black' : 'bg-black/20 text-neutral-700 hover:bg-black/30'
                      }`}
                    >
                      Best Value
                    </button>
                  </div>
                </div>
                {combinedOtherResults.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => applyOptimizerResult(build, r)}
                    title="Click to equip this upgrade"
                    className="flex items-center justify-between gap-2 py-1.5 px-2 hover:bg-[#8b8b8b]/40 border-b border-neutral-500/20 last:border-0 cursor-pointer text-left transition-colors"
                  >
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: CATEGORY_COLORS[r.category] || '#999999' }}>
                        {r.category} — {r.slot}
                      </span>
                      <span className="text-[13px] text-black truncate">{r.label}</span>
                      <span className="text-[10px] text-neutral-700">
                        Cost: {r.cost.toLocaleString()} coins · Ratio: {r.ratio != null ? round1(r.ratio) : '—'}
                      </span>
                    </div>
                    <span className="text-sm font-mono font-bold text-green-700 whitespace-nowrap">+{round3Sig(r.percentIncrease)}%</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useBuild } from '../context/BuildContext';
import { useItemData } from '../context/ItemDataContext';
import { runOptimizer, applyOptimizerResult, OPTIMIZER_MODES, OPTIMIZER_GEAR_SLOTS, hasCuratedData } from '../lib/optimizer';
import { buildAccessoryCandidates, buildGenericMpCandidates, evaluateAccessoryCandidates } from '../lib/accessoryOptimizer';
import { ARMOR_SLOT_LABELS } from '../lib/armorSlots';
import { EQUIPMENT_SLOT_LABELS } from '../lib/equipmentSlots';
import { MOB_TYPES } from '../lib/mobTypes';
import { round1, round3Sig } from '../lib/damageFormat';
import { getItemCornerBadge } from '../lib/itemCornerBadge';
import WeaponIcon from './WeaponIcon';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';
const sectionTitle = 'text-[12px] font-bold text-black uppercase tracking-wide pb-1 mb-0.5 border-b border-neutral-500/40';

const SLOT_LABELS = { ...ARMOR_SLOT_LABELS, ...EQUIPMENT_SLOT_LABELS, pet: 'Pet' };

const CATEGORY_COLORS = {
  Armor: '#facc15',
  Pet: '#f472b6',
  Enchant: '#4ade80',
  'Ultimate Enchant': '#22d3ee',
  'Power Stone': '#a78bfa',
  Stars: '#fb923c',
  Reforge: '#60a5fa',
  Recombobulator: '#818cf8',
  'New Accessory': '#4ade80',
  Recombobulate: '#818cf8',
  'Perfect Gemstones': '#a78bfa',
  'Magical Power (generic)': '#facc15',
  'Full Set': '#fb7185',
};

const SLAYER_ATTACK_SPEED_TARGET = 82;
const EMPTY_STATE = { status: 'idle', baselineValue: 0, bonusAttackSpeed: 0, slots: {}, otherResults: [] };

function UpgradeRow({ result, onSwapIn }) {
  if (!result) {
    return <div className="px-2 py-1.5 text-[11px] text-neutral-600 italic">No upgrades available.</div>;
  }
  const badge = result.itemId && getItemCornerBadge(result.itemId, result.slot, { special: result.special });
  return (
    <button
      type="button"
      onClick={() => onSwapIn(result)}
      title="Click to equip this upgrade"
      className="w-full flex items-center gap-2 px-2 py-1.5 bg-[#8b8b8b]/40 hover:bg-[#8b8b8b]/70 border border-black/30 cursor-pointer text-left transition-colors"
    >
      {result.itemId && (
        <div className="relative shrink-0 w-5 h-5">
          <WeaponIcon id={result.itemId} material={result.material} alt="" className="w-5 h-5 pixelated" />
          {badge && (
            <span className="absolute -bottom-0.5 -right-0.5 text-[6px] font-bold text-white bg-black/80 leading-none px-[2px] rounded-[1px]">
              {badge}
            </span>
          )}
        </div>
      )}
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[11px] text-black truncate">{result.label}</span>
        <span className="text-[9px] text-neutral-700">
          Cost: {result.cost.toLocaleString()} · Ratio: {result.ratio != null ? round3Sig(result.ratio) : '—'}
        </span>
      </div>
      <span className="text-[11px] font-mono font-bold text-green-700 whitespace-nowrap">+{round1(result.percentIncrease)}%</span>
    </button>
  );
}

// "Recommended Upgrades" panel on the main Loadout screen (Landing.jsx) — a live view of
// lib/optimizer.js's engine with a click-to-equip "swap-in" row per result. Clicking a row calls
// applyOptimizerResult, which mutates the real loadout via the same BuildContext functions the
// item pickers use; the effect below is keyed on build.loadout, so it re-runs automatically
// afterward and the just-applied upgrade naturally drops out of the list (it's now the baseline)
// — no separate "remove from list" bookkeeping needed.
//
// Always rendered (shown by default, not hidden behind a toggle) — a fixed right-side sidebar at
// the `lg` breakpoint and up (verified live against this page's actual centered content at 1024px
// — a 280px fixed sidebar plus its own margins comfortably clears the centered max-w-[700px] grid
// at that width), and an ordinary in-flow block below it on narrower/mobile layouts — Landing.jsx
// places this component right after the gear grid specifically so that in-flow position lands
// directly below it.
//
// One dedicated row per gear slot (Helmet/Chestplate/Leggings/Boots/Necklace/Cloak/Belt/Gloves/
// Pet) showing only the immediate next tier's best candidate, or "No upgrades available" — plus a
// secondary "Other Upgrades" list for the non-slot-tiered categories (Enchant/Ultimate Enchant/
// Power Stone/Stars/Magical Power/accessories), which aren't tiered so every real option found
// still shows, all ranked together by % increase (mirrors Optimizer.jsx's combined ranked list).
export default function OptimizerSidebar() {
  const build = useBuild();
  const { itemData, loading: itemDataLoading } = useItemData();
  const [mode, setMode] = useState('slayer');
  const [state, setState] = useState(EMPTY_STATE);
  const tokenRef = useRef(0);

  const mobName = build.targetMobs[0] || null;
  const mobTypes = mobName ? MOB_TYPES[mobName] : null;
  // Real accessory bag list, persisted from whichever Hypixel import last ran — null means no
  // import has ever happened, distinct from an import that found zero accessories. Same source
  // Optimizer.jsx reads; no separate fetch here.
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

  // Magical Power/accessory candidates merge into the same "Other Upgrades" ranked list as every
  // brute-forced category from runOptimizer (same treatment as Optimizer.jsx) — one consistent
  // list sorted by DPS-per-coin ratio, not a separate section. No sort toggle here (unlike
  // Optimizer.jsx) — this compact sidebar just always shows best value first.
  const [mpResult, setMpResult] = useState(null);
  const mpTokenRef = useRef(0);
  useEffect(() => {
    if (itemDataLoading || !mobName || !mobTypes) {
      setMpResult(null);
      return;
    }
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

  const combinedOtherResults = [...state.otherResults, ...(mpResult?.results || [])].sort((a, b) => {
    if (a.ratio == null && b.ratio == null) return b.percentIncrease - a.percentIncrease;
    if (a.ratio == null) return 1;
    if (b.ratio == null) return -1;
    return b.ratio - a.ratio;
  });

  return (
    <div className="flex flex-col gap-2 w-full max-w-[700px] mt-4 lg:mt-0 lg:fixed lg:right-4 lg:top-20 lg:w-[280px] lg:max-w-none lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
      <div className={`${panel} p-2 flex flex-col gap-1.5`}>
        <div className={sectionTitle}>Recommended Upgrades</div>
        <div className="grid grid-cols-2 gap-1">
          {OPTIMIZER_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`${panel} px-2 py-1 text-[10px] font-bold text-black cursor-pointer transition-[filter] ${
                mode === m.id ? 'hover:brightness-110' : 'brightness-50'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {!hasCuratedData(mode) && (
          <div className="text-[10px] text-neutral-700 italic">Armor/Pet progression not configured for this mode yet.</div>
        )}
        {mode === 'slayer' && state.status === 'ok' && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-black uppercase tracking-wide">Atk Speed</span>
            <span className={`font-mono font-bold ${state.bonusAttackSpeed >= SLAYER_ATTACK_SPEED_TARGET ? 'text-green-700' : 'text-red-700'}`}>
              {round1(state.bonusAttackSpeed)}% {state.bonusAttackSpeed < SLAYER_ATTACK_SPEED_TARGET && `(target ${SLAYER_ATTACK_SPEED_TARGET}%)`}
            </span>
          </div>
        )}
      </div>

      {state.status === 'no-target' && (
        <div className={`${panel} p-2 text-[11px] text-neutral-600 italic`}>Pick a target mob to see recommended upgrades.</div>
      )}
      {state.status === 'loading' && <div className={`${panel} p-2 text-[11px] text-neutral-600 italic`}>Evaluating...</div>}

      {state.status === 'ok' && (
        <div className={`${panel} p-1.5 flex flex-col gap-1.5`}>
          {OPTIMIZER_GEAR_SLOTS.filter((slot) => state.slots[slot])
            .sort((a, b) => state.slots[b].percentIncrease - state.slots[a].percentIncrease)
            .map((slot) => (
              <div key={slot} className="flex flex-col gap-0.5">
                <span className="text-[9px] font-bold uppercase tracking-wide text-neutral-700">{SLOT_LABELS[slot]}</span>
                <UpgradeRow result={state.slots[slot]} onSwapIn={(r) => applyOptimizerResult(build, r)} />
              </div>
            ))}
          {OPTIMIZER_GEAR_SLOTS.every((slot) => !state.slots[slot]) && (
            <div className="px-2 py-1.5 text-[11px] text-neutral-600 italic">No upgrades available.</div>
          )}
        </div>
      )}

      {state.status === 'ok' && combinedOtherResults.length > 0 && (
        <div className={`${panel} p-1.5 flex flex-col gap-1`}>
          <div className={sectionTitle}>Other Upgrades</div>
          {combinedOtherResults.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => applyOptimizerResult(build, r)}
              title="Click to equip this upgrade"
              className="flex items-center justify-between gap-2 px-2 py-1.5 bg-[#8b8b8b]/40 hover:bg-[#8b8b8b]/70 border border-black/30 cursor-pointer text-left transition-colors"
            >
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: CATEGORY_COLORS[r.category] || '#999999' }}>
                  {r.category}
                </span>
                <span className="text-[11px] text-black truncate">{r.label}</span>
                <span className="text-[9px] text-neutral-700">
                  Cost: {r.cost.toLocaleString()} · Ratio: {r.ratio != null ? round3Sig(r.ratio) : '—'}
                </span>
              </div>
              <span className="text-[12px] font-mono font-bold text-green-700 whitespace-nowrap">+{round1(r.percentIncrease)}%</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

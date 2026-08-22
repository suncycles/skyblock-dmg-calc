import { useEffect, useRef, useState } from 'react';
import { useBuild } from '../context/BuildContext';
import { useItemData } from '../context/ItemDataContext';
import { runOptimizer, applyOptimizerResult, OPTIMIZER_MODES, OPTIMIZER_GEAR_SLOTS, hasCuratedData } from '../lib/optimizer';
import { buildAccessoryCandidates, buildGenericMpCandidates, evaluateAccessoryCandidates } from '../lib/accessoryOptimizer';
import { ARMOR_SLOT_LABELS } from '../lib/armorSlots';
import { EQUIPMENT_SLOT_LABELS } from '../lib/equipmentSlots';
import { MOB_TYPES } from '../lib/mobTypes';
import { round1 } from '../lib/damageFormat';
import { getItemCornerBadge } from '../lib/itemCornerBadge';
import NumberInput from './NumberInput';
import WeaponIcon from './WeaponIcon';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';
const sectionTitle = 'text-[12px] font-bold text-black uppercase tracking-wide pb-1 mb-0.5 border-b border-neutral-500/40';

// Desktop-only floating panel: matches the `lg` breakpoint this component already switches to
// `position: fixed` at (see the outer div's className) — dragging/resizing below that width would
// fight the in-flow mobile layout, so both are no-ops there.
const DESKTOP_BREAKPOINT_PX = 1024;
const POSITION_KEY = 'hexOptimizerSidebarPos';
const SIZE_KEY = 'hexOptimizerSidebarSize';

const SLOT_LABELS = { ...ARMOR_SLOT_LABELS, ...EQUIPMENT_SLOT_LABELS, pet: 'Pet' };

const CATEGORY_COLORS = {
  Weapon: '#f87171',
  Armor: '#38bdf8',
  Equipment: '#fbbf24',
  Pet: '#2dd4bf',
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

const SLAYER_ATTACK_SPEED_TARGET = 82;
const EMPTY_STATE = { status: 'idle', baselineValue: 0, bonusAttackSpeed: 0, slots: {}, otherResults: [] };

// Ranks by real DPS-per-coin (see lib/pricing.js) so the most coin-efficient upgrades lead;
// unpriceable ('?') results sink to the bottom rather than being treated as worthless. No toggle
// here (unlike Optimizer.jsx) — this compact sidebar always shows best value first.
function compareResults(a, b) {
  if (a.ratio == null && b.ratio == null) return b.percentIncrease - a.percentIncrease;
  if (a.ratio == null) return 1;
  if (b.ratio == null) return -1;
  return b.ratio - a.ratio;
}

// One shared row style for every candidate — gear-slot picks (Weapon/Armor/Equipment/Pet) and the
// brute-forced categories (Enchant/Reforge/Stars/...) alike — now that they all rank together in
// one list instead of two separate sections.
function UpgradeRow({ result, onSwapIn }) {
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
        <span className="text-[8px] font-bold uppercase tracking-wide" style={{ color: CATEGORY_COLORS[result.category] || '#999999' }}>
          {result.category} — {SLOT_LABELS[result.slot] || result.slot}
        </span>
        <span className="text-[11px] text-black truncate">{result.label}</span>
        <span className="text-[9px] text-neutral-700">Cost: {result.cost.toLocaleString()}</span>
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
// at that width, so the loadout/damage grid stays centered regardless of where this floats), and
// an ordinary in-flow block below it on narrower/mobile layouts — Landing.jsx places this
// component right after the gear grid specifically so that in-flow position lands directly below
// it. Desktop-only (see DESKTOP_BREAKPOINT_PX), the panel is also a real floating window: drag the
// title bar to reposition it (mousedown/mousemove tracking, no library — see handleDragStart) and
// drag its bottom-right corner to resize it (native CSS `resize: both`, no JS needed for the
// interaction itself). Both position and size persist to localStorage via a ResizeObserver plus a
// plain state write, same "remember it for next time" treatment other build preferences get.
//
// Every real candidate — gear-slot picks (Weapon/Armor/Equipment/Pet) and the brute-forced
// categories (Enchant/Ultimate Enchant/Power Stone/Stars/Magical Power/accessories) alike — ranks
// together in one list by real DPS-per-coin ratio (mirrors Optimizer.jsx's "Best Value" ranking),
// rather than a separate "by slot" section capped to one pick per slot. No sort toggle here
// (unlike Optimizer.jsx) — this compact sidebar just always shows best value first.
export default function OptimizerSidebar() {
  const build = useBuild();
  const { itemData, loading: itemDataLoading } = useItemData();
  const [mode, setMode] = useState('slayer');
  const [state, setState] = useState(EMPTY_STATE);
  const tokenRef = useRef(0);

  // Floating position/size (desktop only) — null position means "use the default fixed spot"
  // (right-4/top-20, via the outer div's own classes) until the user actually drags it once.
  const containerRef = useRef(null);
  const [floatPos, setFloatPos] = useState(null);
  const [floatSize, setFloatSize] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= DESKTOP_BREAKPOINT_PX);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    function handleResize() {
      setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT_PX);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    try {
      const storedPos = localStorage.getItem(POSITION_KEY);
      if (storedPos) setFloatPos(JSON.parse(storedPos));
      const storedSize = localStorage.getItem(SIZE_KEY);
      if (storedSize) setFloatSize(JSON.parse(storedSize));
    } catch {
      // Corrupt/stale localStorage value — fall back to the default position/size.
    }
  }, []);

  function handleDragStart(e) {
    if (!isDesktop || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setIsDragging(true);
    e.preventDefault();
  }

  useEffect(() => {
    if (!isDragging) return;
    function handleMove(e) {
      const next = {
        left: Math.max(0, Math.min(e.clientX - dragOffsetRef.current.x, window.innerWidth - 40)),
        top: Math.max(0, Math.min(e.clientY - dragOffsetRef.current.y, window.innerHeight - 40)),
      };
      setFloatPos(next);
    }
    function handleUp() {
      setIsDragging(false);
    }
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging]);

  useEffect(() => {
    if (floatPos) localStorage.setItem(POSITION_KEY, JSON.stringify(floatPos));
  }, [floatPos]);

  // Resizing itself is native CSS (`resize: both` on the container, desktop-only) — this just
  // observes the resulting size so it persists across reloads the same way position does.
  useEffect(() => {
    if (!containerRef.current || !isDesktop) return;
    const el = containerRef.current;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      const next = { width: Math.round(width), height: Math.round(height) };
      setFloatSize(next);
      localStorage.setItem(SIZE_KEY, JSON.stringify(next));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isDesktop]);

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

  const slotResults = OPTIMIZER_GEAR_SLOTS.flatMap((slot) => state.slots[slot] || []);
  // maxBudget of 0 means "no limit" (default, unset) — see BuildContext.jsx. Unpriced ('?')
  // candidates always stay shown; only a confirmed over-budget real cost gets filtered out.
  const withinBudget = (r) => !build.maxBudget || typeof r.cost !== 'number' || r.cost <= build.maxBudget;
  const combinedResults = [...slotResults, ...state.otherResults, ...(mpResult?.results || [])].filter(withinBudget).sort(compareResults);

  // Once the user drags the panel, its own left/top/width/height override the default fixed
  // spot (right-4/top-20/w-280) via inline style — CSS classes alone can't express "wherever the
  // user last put it". Both only ever apply at the `lg` breakpoint (isDesktop); below that this
  // stays the ordinary in-flow mobile block it always was, untouched by any stored position/size.
  const floatingPositionClasses = floatPos ? 'lg:fixed' : 'lg:fixed lg:right-4 lg:top-20';
  const desktopStyle = isDesktop
    ? {
        ...(floatPos ? { left: floatPos.left, top: floatPos.top, right: 'auto' } : {}),
        ...(floatSize ? { width: floatSize.width, height: floatSize.height } : {}),
      }
    : undefined;

  return (
    <div
      ref={containerRef}
      className={`flex flex-col gap-2 w-full max-w-[700px] mt-4 lg:mt-0 ${floatingPositionClasses} lg:w-[280px] lg:max-w-none lg:max-h-[calc(100vh-6rem)] lg:min-w-[220px] lg:min-h-[200px] lg:resize lg:overflow-auto`}
      style={desktopStyle}
    >
      <div className={`${panel} p-2 flex flex-col gap-1.5`}>
        <div className={`${sectionTitle} lg:cursor-move select-none`} onMouseDown={handleDragStart} title="Drag to reposition">
          Recommended Upgrades
        </div>
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
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="sidebar-max-budget" className="text-[10px] font-bold text-black uppercase tracking-wide">
            Max Budget
          </label>
          <NumberInput
            id="sidebar-max-budget"
            value={build.maxBudget}
            onChange={build.setMaxBudget}
            min={0}
            step={1000000}
            placeholder="No limit"
            className={`${panel} px-1.5 py-0.5 text-[11px] text-black w-28 text-right`}
          />
        </div>
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
          {combinedResults.length > 0 ? (
            combinedResults.map((r, i) => <UpgradeRow key={i} result={r} onSwapIn={(res) => applyOptimizerResult(build, res)} />)
          ) : (
            <div className="px-2 py-1.5 text-[11px] text-neutral-600 italic">
              {build.maxBudget ? 'No upgrades available within budget.' : 'No upgrades available.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

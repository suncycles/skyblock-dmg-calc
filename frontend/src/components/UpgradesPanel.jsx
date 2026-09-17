import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useItemData } from '../context/ItemDataContext';
import {
  runOptimizer,
  applyOptimizerResult,
  OPTIMIZER_MODES,
  OPTIMIZER_GEAR_SLOTS,
  OPTIMIZER_BUILD_KEYS,
  AUTO_OPTIMIZER_MODE,
  hasCuratedData,
  resolveOptimizerMode,
  loadOptimizerModeOverride,
  saveOptimizerModeOverride,
} from '../lib/optimizer';
import { buildAccessoryCandidates, buildGenericMpCandidates, evaluateAccessoryCandidates } from '../lib/accessoryOptimizer';
import { ARMOR_SLOT_LABELS } from '../lib/armorSlots';
import { EQUIPMENT_SLOT_LABELS } from '../lib/equipmentSlots';
import { MOB_TYPES } from '../lib/mobTypes';
import { round1, round3Sig, formatCoinsPerPercent, formatCoinsShort } from '../lib/damageFormat';
import { getItemCornerBadge } from '../lib/itemCornerBadge';
import { ENCHANTED_BOOK_ICON, getGemstoneIcon } from '../lib/icons';
import NumberInput from './NumberInput';
import WeaponIcon from './WeaponIcon';

// The Recommended Upgrades panel — ONE implementation for both places it appears: the column docked
// beside the gear board on Landing (variant="column") and the standalone /optimizer page
// (variant="page"). It used to be two copies (OptimizerSidebar.jsx and Optimizer.jsx) that had to
// change in lockstep and didn't — the same black-on-black contrast bug shipped on both. It also
// used to be a draggable floating window; it's in normal page flow now (user-specified 2026-09-14),
// so it never covers the board and needs no window manager of its own.

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';
const sectionTitle = 'text-[13px] font-bold text-white uppercase tracking-wide pb-1 mb-0.5 border-b border-neutral-500/40';
// Explicit white-with-opacity throughout, never `text-black/NN`: index.css relights bare
// `.text-black` for the dark theme, but an opacity-suffixed class doesn't match that selector and
// renders black on the dark panel.
const groupLabel = 'text-[11px] font-bold text-white/60 shrink-0';
const badge = 'px-1.5 rounded-sm bg-[#8fbf3f] text-[10px] font-mono font-bold shrink-0';
const BADGE_TEXT = { color: '#11150c' };

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
  'Potato Books': '#fcd34d',
  'Pet Item': '#f472b6',
  Gemstone: '#e879f9',
  'New Accessory': '#4ade80',
  'Accessory Upgrade': '#34d399',
  Recombobulate: '#818cf8',
  'Perfect Gemstones': '#a78bfa',
  'Magical Power (generic)': '#facc15',
  'Full Set': '#fb7185',
  Attribute: '#c084fc',
};

// User-specified: reaching 82% Bonus Attack Speed is Slayer's single highest priority — shown as
// context here rather than special-cased into the ranking's sort order (confirmed).
const SLAYER_ATTACK_SPEED_TARGET = 82;

const EMPTY_STATE = { status: 'idle', baselineValue: 0, bonusAttackSpeed: 0, slots: {}, otherResults: [] };

// Each run brute-forces hundreds of candidate loadouts, and the dependencies include sliders and
// free-typed numbers that change many times a second while being edited — so runs are debounced,
// with a token guarding against a stale run landing after a newer one.
const RUN_DEBOUNCE_MS = 200;

// "ratio" (real DPS-per-coin, see lib/pricing.js) sinks unpriceable ('?') results to the bottom
// rather than treating them as worthless; "increase" ignores cost and ranks by raw % gained.
function compareResults(a, b, sortBy) {
  if (sortBy === 'ratio') {
    if (a.ratio == null && b.ratio == null) return b.percentIncrease - a.percentIncrease;
    if (a.ratio == null) return 1;
    if (b.ratio == null) return -1;
    return b.ratio - a.ratio;
  }
  return b.percentIncrease - a.percentIncrease;
}

// A two-state toggle. The ON state sets its text colour inline: the relighting rule above would
// otherwise put near-white text on this light-green fill, about 1.9:1.
function Chip({ active, onClick, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`px-2 py-0.5 text-[11px] font-bold rounded-sm cursor-pointer transition-colors border ${
        active ? 'bg-[#8fbf3f] border-[#b6e06a]' : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/20 hover:text-white'
      }`}
      style={active ? BADGE_TEXT : undefined}
    >
      {children}
    </button>
  );
}

// One row per candidate, whatever produced it. Both figures are the same swap measured two ways: the
// % is relative to the current build, the flat number is the raw gain in the mode's own metric —
// a big % on a small baseline and a small % on a large one look identical without it.
function UpgradeRow({ result, onSwapIn, onSkip, baselineValue, showPercent, showFlat }) {
  const flatIncrease = typeof result.value === 'number' && typeof baselineValue === 'number' ? result.value - baselineValue : null;
  const cornerBadge = result.itemId && getItemCornerBadge(result.itemId, result.slot, { special: result.special });
  const isEnchant = result.category === 'Enchant' || result.category === 'Ultimate Enchant';
  const coinsPerPercent = formatCoinsPerPercent(result.cost, result.percentIncrease);
  let icon = null;
  if (result.category === 'Gemstone') icon = <img src={getGemstoneIcon(result.gem, result.tier)} alt="" className="w-6 h-6 pixelated" />;
  else if (result.category === 'Master Stars') icon = <img src="/images/manual/master_star.webp" alt="" className="w-6 h-6 pixelated" />;
  else if (result.itemId || result.material) icon = <WeaponIcon id={result.itemId} material={result.material} alt="" className="w-6 h-6 pixelated" />;
  else if (isEnchant) icon = <img src={ENCHANTED_BOOK_ICON} alt="" className="w-6 h-6 pixelated" />;
  return (
    <div className="group w-full flex items-stretch bg-[#8b8b8b]/40 hover:bg-[#8b8b8b]/70 border border-white/10 transition-colors">
      <button
        type="button"
        onClick={() => onSwapIn(result)}
        title="Click to equip this upgrade"
        className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 cursor-pointer text-left"
      >
        {icon && (
          <div className="relative shrink-0 w-6 h-6">
            {icon}
            {cornerBadge && (
              <span className="absolute -bottom-0.5 -right-0.5 text-[7px] font-bold text-white bg-black/80 leading-none px-[2px] rounded-[1px]">
                {cornerBadge}
              </span>
            )}
          </div>
        )}
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: CATEGORY_COLORS[result.category] || '#999999' }}>
            {result.category} — {SLOT_LABELS[result.slot] || result.slot}
          </span>
          <span className="text-[12px] text-white truncate">{result.label}</span>
          <span className="text-[10px] text-white/65">
            {/* Three states, worded apart: a real price, a confirmed "costs nothing", and no price
                data at all — a bare "Cost: ?" read as a bug rather than as "unpriced". */}
            {typeof result.cost !== 'number' || !Number.isFinite(result.cost)
              ? 'Cost: unpriced'
              : result.cost === 0
                ? 'Cost: free'
                : `Cost: ${formatCoinsShort(result.cost)}${coinsPerPercent ? ` · ${coinsPerPercent}/%` : ''}`}
          </span>
          {/* Every new accessory needs a bag slot; when none is free its price is already inside the
              Cost above, so this line says where that money went (lib/accessorySlots.js). */}
          {result.slotNote && <span className="text-[10px] text-amber-300/80 truncate">{result.slotNote}</span>}
        </div>
        <span className="flex flex-col items-end leading-tight whitespace-nowrap">
          {/* 3 significant figures: at 1 decimal every sub-0.05% candidate collapsed to "+0.0%",
              exactly where the ranking is tightest (user-specified 2026-09-10). */}
          {showPercent && <span className="text-[12px] font-mono font-bold text-green-400">+{round3Sig(result.percentIncrease)}%</span>}
          {showFlat && flatIncrease != null && (
            <span className="text-[11px] font-mono text-green-400">+{Math.round(flatIncrease).toLocaleString()}</span>
          )}
        </span>
        <span className="hidden group-hover:inline text-[10px] font-bold uppercase text-white whitespace-nowrap">Equip</span>
      </button>
      <button
        type="button"
        onClick={() => onSkip(result)}
        title="Skip — hide this suggestion for now"
        className="shrink-0 px-2 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/15 cursor-pointer border-l border-white/15"
      >
        ✕
      </button>
    </div>
  );
}

export default function UpgradesPanel({ variant = 'column' }) {
  const navigate = useNavigate();
  const build = useBuild();
  const { itemData, loading: itemDataLoading } = useItemData();

  const mobName = build.targetMobs[0] || null;
  const mobTypes = mobName ? MOB_TYPES[mobName] : null;

  // "Auto" follows what the page is already showing — the Mage/Dungeon/DPS toggles and the target —
  // so this list can't quietly optimize for a different kind of content than the damage number
  // beside it. An explicit pick is kept, and remembered, as an override.
  const [override, setOverrideState] = useState(loadOptimizerModeOverride);
  const setOverride = (next) => {
    setOverrideState(next);
    saveOptimizerModeOverride(next);
  };
  const autoMode = resolveOptimizerMode(build, mobTypes);
  const mode = override === AUTO_OPTIMIZER_MODE ? autoMode : override;
  const modeLabel = (id) => OPTIMIZER_MODES.find((m) => m.id === id)?.label || id;

  // Real accessory bag list from the last Hypixel import — null means no import has ever happened,
  // distinct from an import that found zero accessories.
  const ownedAccessories = build.loadout.accessory?.modifiers?.ownedAccessories ?? null;
  // One dependency per build field runOptimizer reads — see OPTIMIZER_BUILD_KEYS.
  const optimizerBuildDeps = OPTIMIZER_BUILD_KEYS.map((key) => build[key]);

  const [state, setState] = useState(EMPTY_STATE);
  const tokenRef = useRef(0);
  useEffect(() => {
    if (itemDataLoading || !mobName || !mobTypes) {
      setState({ ...EMPTY_STATE, status: 'no-target' });
      return;
    }
    setState((prev) => ({ ...prev, status: 'loading' }));
    const handle = setTimeout(() => {
      const token = ++tokenRef.current;
      runOptimizer(build.loadout, itemData, build, mode, { name: mobName, types: mobTypes }).then((result) => {
        if (tokenRef.current === token) setState({ status: 'ok', ...result });
      });
    }, RUN_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // Spreading OPTIMIZER_BUILD_KEYS keeps this in lockstep with what runOptimizer actually reads;
    // the array's length is constant (a module constant), which is all React requires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...optimizerBuildDeps, itemData, itemDataLoading, mode, mobName]);

  const [mpResult, setMpResult] = useState(null);
  const mpTokenRef = useRef(0);
  useEffect(() => {
    if (itemDataLoading || !mobName || !mobTypes) {
      setMpResult(null);
      return;
    }
    // No account on file — still show Magical Power's real effect as generic "+N MP" steps.
    const candidates = ownedAccessories
      ? itemData.accessoryFamilies && buildAccessoryCandidates(ownedAccessories, itemData.accessoryFamilies)
      : buildGenericMpCandidates();
    if (!candidates) {
      setMpResult(null);
      return;
    }
    const handle = setTimeout(() => {
      const token = ++mpTokenRef.current;
      evaluateAccessoryCandidates(build.loadout, itemData, build, mode, { name: mobName, types: mobTypes }, candidates).then((result) => {
        if (mpTokenRef.current === token) setMpResult(result);
      });
    }, RUN_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [build.loadout, build.attributes, itemData, itemDataLoading, mode, mobName, mobTypes]);

  const [sortBy, setSortBy] = useState('ratio');
  const [showPercent, setShowPercent] = useState(true);
  const [showFlat, setShowFlat] = useState(false);
  // Free upgrades cost time, not coins — they'd sit permanently atop Best Value on an infinite
  // ratio. Off by default: the common question is "what should I buy next".
  const [showFree, setShowFree] = useState(false);
  // ✕ hides a suggestion for the rest of this visit; not persisted.
  const [skippedKeys, setSkippedKeys] = useState(() => new Set());
  // Empty = no filter.
  const [selectedCategories, setSelectedCategories] = useState(() => new Set());
  const toggleCategory = (category) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };
  const resultKey = (r) => `${r.category}:${r.slot}:${r.label}`;

  const slotResults = OPTIMIZER_GEAR_SLOTS.flatMap((slot) => state.slots[slot] || []);
  // maxBudget 0 = no limit. Unpriced ('?') candidates always stay: their real cost might be free or
  // just unverified, so hiding them would be a false negative.
  const withinBudget = (r) => !build.maxBudget || typeof r.cost !== 'number' || r.cost <= build.maxBudget;
  const unfilteredResults = [...slotResults, ...state.otherResults, ...(mpResult?.results || [])]
    .filter(withinBudget)
    .filter((r) => !skippedKeys.has(resultKey(r)));
  const availableCategories = [...new Set(unfilteredResults.map((r) => r.category))].sort();
  // A real numeric 0 is free; '?' is unpriced and stays with the paid list.
  const isFree = (r) => r.cost === 0;
  const freeCount = unfilteredResults.filter(isFree).length;
  const combinedResults = unfilteredResults
    .filter((r) => (showFree ? true : !isFree(r)))
    .filter((r) => selectedCategories.size === 0 || selectedCategories.has(r.category))
    .sort((a, b) => compareResults(a, b, sortBy));
  const activeFilterCount = selectedCategories.size + (build.maxBudget ? 1 : 0);
  const idSuffix = variant;

  return (
    <div className={`${panel} p-3 flex flex-col gap-2`}>
      <div className={sectionTitle}>Recommended Upgrades</div>

      <div className="flex items-center gap-2">
        <label htmlFor={`upgrades-mode-${idSuffix}`} className={groupLabel}>
          For
        </label>
        <select
          id={`upgrades-mode-${idSuffix}`}
          value={override}
          onChange={(e) => setOverride(e.target.value)}
          className="flex-1 min-w-0 px-2 py-1 text-[12px] font-bold bg-black text-white border-2 border-neutral-700 cursor-pointer"
        >
          <option value={AUTO_OPTIMIZER_MODE}>Auto — {modeLabel(autoMode)}</option>
          {OPTIMIZER_MODES.filter((m) => !m.disabled).map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="text-[10px] text-white/55 -mt-1">
        {override === AUTO_OPTIMIZER_MODE
          ? 'Follows the Mage / Dungeon / DPS toggles and your target.'
          : 'Pinned — choose Auto to follow the page toggles again.'}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className={groupLabel}>Sort</span>
          <Chip active={sortBy === 'ratio'} onClick={() => setSortBy('ratio')} title="Damage gained per coin spent">
            Value
          </Chip>
          <Chip active={sortBy === 'increase'} onClick={() => setSortBy('increase')} title="Highest raw % increase, ignoring cost">
            Increase
          </Chip>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={groupLabel}>Show</span>
          <Chip active={showPercent} onClick={() => setShowPercent((v) => !v)} title="Show the % increase on each row">
            % increase
          </Chip>
          <Chip active={showFlat} onClick={() => setShowFlat((v) => !v)} title="Show the flat increase on each row">
            Flat
          </Chip>
        </div>
      </div>

      {/* The one control people miss, so it's a full bordered row that lights up when on. */}
      <label
        className={`flex items-center gap-2 px-2 py-1.5 rounded-sm border cursor-pointer transition-colors ${
          showFree ? 'bg-[#8fbf3f]/25 border-[#8fbf3f]' : 'bg-white/5 border-white/20 hover:bg-white/10'
        }`}
      >
        <input
          type="checkbox"
          checked={showFree}
          onChange={(e) => setShowFree(e.target.checked)}
          className="w-4 h-4 accent-[#8fbf3f] cursor-pointer shrink-0"
        />
        <span className="text-[12px] font-bold text-white">Show 0-cost upgrades</span>
        {freeCount > 0 && (
          <span className={`ml-auto ${badge}`} style={BADGE_TEXT}>
            {freeCount}
          </span>
        )}
      </label>

      {/* Native <details> — a disclosure with zero JS. Budget and category filters are set rarely,
          so they fold away and the results start higher; the count says when any are active. */}
      <details className="group rounded-sm border border-white/20 bg-white/5">
        <summary className="flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className="text-[9px] text-white/70 transition-transform group-open:rotate-90">
            ▶
          </span>
          <span className="text-[12px] font-bold text-white">Filters</span>
          {activeFilterCount > 0 && (
            <span className={`ml-auto ${badge}`} style={BADGE_TEXT}>
              {activeFilterCount}
            </span>
          )}
        </summary>
        <div className="flex flex-col gap-2 px-2 pb-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={`upgrades-budget-${idSuffix}`} className={groupLabel}>
              Max budget
            </label>
            <NumberInput
              id={`upgrades-budget-${idSuffix}`}
              value={build.maxBudget}
              onChange={build.setMaxBudget}
              min={0}
              step={1000000}
              allowSuffix
              placeholder="No limit"
              className="w-28 px-1.5 py-0.5 text-[12px] bg-black text-white border-2 border-neutral-700 text-right"
            />
          </div>
          {availableCategories.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1">
              {availableCategories.map((category) => {
                const picked = selectedCategories.has(category);
                const color = CATEGORY_COLORS[category] || '#777777';
                return (
                  <button
                    key={category}
                    type="button"
                    aria-pressed={picked}
                    onClick={() => toggleCategory(category)}
                    title={picked ? `Click to remove ${category} from the filter` : `Click to filter to just ${category}`}
                    className={`pl-1 pr-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide cursor-pointer rounded-sm border-l-[3px] transition-colors ${
                      picked ? 'text-white' : 'text-white/75 hover:text-white'
                    }`}
                    style={{ borderLeftColor: color, backgroundColor: picked ? color : 'rgba(255,255,255,0.10)' }}
                  >
                    {category}
                  </button>
                );
              })}
              {selectedCategories.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedCategories(new Set())}
                  className="px-1.5 py-0.5 text-[10px] font-bold uppercase text-white/70 hover:text-white cursor-pointer underline"
                >
                  Clear
                </button>
              )}
            </div>
          ) : (
            <div className="text-[10px] text-white/55 italic">Category filters appear once there are results to filter.</div>
          )}
        </div>
      </details>

      {!hasCuratedData(mode) && <div className="text-[10px] text-white/55 italic">Armor/Pet progression isn't configured for this mode yet.</div>}

      {mode === 'slayer' && state.status === 'ok' && (
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-bold text-white uppercase tracking-wide">Atk Speed</span>
          <span className={`font-mono font-bold ${state.bonusAttackSpeed >= SLAYER_ATTACK_SPEED_TARGET ? 'text-green-400' : 'text-red-400'}`}>
            {round1(state.bonusAttackSpeed)}% {state.bonusAttackSpeed < SLAYER_ATTACK_SPEED_TARGET && `(target ${SLAYER_ATTACK_SPEED_TARGET}%)`}
          </span>
        </div>
      )}

      {variant === 'page' && mobName && mobTypes && (
        <div className="text-[11px] text-white/65 italic">
          {!ownedAccessories
            ? 'No Hypixel import on file: Import from Hypixel to see actual missing/upgradeable accessories.'
            : mpResult
              ? `Magical Power: ${mpResult.currentMp} (${ownedAccessories.length} accessories on file)`
              : `Evaluating ${ownedAccessories.length} real accessories for Magical Power upgrades...`}
        </div>
      )}

      {state.status === 'no-target' && (
        <div className="text-[12px] text-white/70 italic">
          No target selected —{' '}
          <button type="button" className="underline cursor-pointer text-white" onClick={() => navigate('/target-mob')}>
            pick a mob
          </button>{' '}
          to see recommendations.
        </div>
      )}
      {state.status === 'loading' && <div className="text-[12px] text-white/70 italic">Evaluating...</div>}
      {state.status === 'ok' && (
        <div className="flex flex-col gap-1">
          {combinedResults.length > 0 ? (
            combinedResults.map((r) => (
              <UpgradeRow
                key={resultKey(r)}
                result={r}
                baselineValue={state.baselineValue}
                showPercent={showPercent}
                showFlat={showFlat}
                onSwapIn={(res) => applyOptimizerResult(build, res)}
                onSkip={(res) => setSkippedKeys((prev) => new Set(prev).add(resultKey(res)))}
              />
            ))
          ) : (
            <div className="px-2 py-1.5 text-[12px] text-white/65 italic">
              {selectedCategories.size > 0
                ? 'No upgrades match the selected filter.'
                : build.maxBudget
                  ? 'No upgrades available within budget.'
                  : 'No upgrades available.'}
            </div>
          )}
        </div>
      )}

      {/* A footnote now rather than a banner above the list: it still says the important thing —
          this ranks single swaps against the current build, not a full plan — without pushing the
          results below the fold. */}
      <div className="flex items-start gap-1.5 text-[10px] leading-snug text-amber-300/90 pt-1.5 border-t border-white/10">
        <span aria-hidden="true" className="shrink-0 leading-none pt-px">
          ⚠
        </span>
        <span>Recommendations are not necessarily indicative of the most optimal option.</span>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useItemData } from '../context/ItemDataContext';
import {
  runOptimizer,
  applyOptimizerResult,
  OPTIMIZER_MODES,
  OPTIMIZER_GEAR_SLOTS,
  hasCuratedData,
  loadOptimizerMode,
  saveOptimizerMode,
} from '../lib/optimizer';
import { buildAccessoryCandidates, buildGenericMpCandidates, evaluateAccessoryCandidates } from '../lib/accessoryOptimizer';
import { ARMOR_SLOT_LABELS } from '../lib/armorSlots';
import { EQUIPMENT_SLOT_LABELS } from '../lib/equipmentSlots';
import { MOB_TYPES } from '../lib/mobTypes';
import { round1, round3Sig, formatCoinsPerPercent, formatCoinsShort } from '../lib/damageFormat';
import PageHeader from '../components/PageHeader';
import WeaponIcon from '../components/WeaponIcon';
import NumberInput from '../components/NumberInput';
import { getItemCornerBadge } from '../lib/itemCornerBadge';
import { ENCHANTED_BOOK_ICON, getGemstoneIcon } from '../lib/icons';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';
const sectionTitle = 'text-[13px] font-bold text-black uppercase tracking-wide pb-1 mb-0.5 border-b border-neutral-500/40';

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
// prominent context here rather than special-cased into the ranked list's sort order (confirmed).
const SLAYER_ATTACK_SPEED_TARGET = 82;

const EMPTY_STATE = { status: 'idle', baselineValue: 0, bonusAttackSpeed: 0, slots: {}, otherResults: [] };

// Shared ranking for both "Upgrades by Slot" and "Other Upgrades" — "ratio" (real DPS-per-coin,
// see lib/pricing.js) ranks unpriceable ('?') results last rather than treating them as worthless;
// "increase" ignores cost entirely.
function compareResults(a, b, sortBy) {
  if (sortBy === 'ratio') {
    if (a.ratio == null && b.ratio == null) return b.percentIncrease - a.percentIncrease;
    if (a.ratio == null) return 1;
    if (b.ratio == null) return -1;
    return b.ratio - a.ratio;
  }
  return b.percentIncrease - a.percentIncrease;
}

// One shared row style for every candidate — gear-slot picks (Weapon/Armor/Equipment/Pet) and the
// brute-forced categories (Enchant/Reforge/Stars/...) alike — now that they all rank together in
// one list instead of two separate sections. Shows an icon when the candidate is a real catalog
// item (`itemId` set); brute-forced categories without one just show the category/slot label.
function UpgradeRow({ result, onSwapIn, onSkip }) {
  const badge = result.itemId && getItemCornerBadge(result.itemId, result.slot, { special: result.special });
  const isEnchant = result.category === 'Enchant' || result.category === 'Ultimate Enchant';
  const isGemstone = result.category === 'Gemstone';
  const isMasterStar = result.category === 'Master Stars';
  const coinsPerPercent = formatCoinsPerPercent(result.cost, result.percentIncrease);
  return (
    <div className="w-full flex items-stretch bg-[#8b8b8b]/40 hover:bg-[#8b8b8b]/70 border border-black/30 transition-colors">
      <button
        type="button"
        onClick={() => onSwapIn(result)}
        title="Click to equip this upgrade"
        className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 cursor-pointer text-left"
      >
        {isGemstone ? (
          <div className="relative shrink-0 w-6 h-6">
            <img src={getGemstoneIcon(result.gem, result.tier)} alt="" className="w-6 h-6 pixelated" />
          </div>
        ) : isMasterStar ? (
          <div className="relative shrink-0 w-6 h-6">
            <img src="/images/manual/master_star.webp" alt="" className="w-6 h-6 pixelated" />
          </div>
        ) : result.itemId || result.material ? (
          <div className="relative shrink-0 w-6 h-6">
            <WeaponIcon id={result.itemId} material={result.material} alt="" className="w-6 h-6 pixelated" />
            {badge && (
              <span className="absolute -bottom-0.5 -right-0.5 text-[7px] font-bold text-white bg-black/80 leading-none px-[2px] rounded-[1px]">
                {badge}
              </span>
            )}
          </div>
        ) : (
          isEnchant && (
            <div className="relative shrink-0 w-6 h-6">
              <img src={ENCHANTED_BOOK_ICON} alt="" className="w-6 h-6 pixelated" />
            </div>
          )
        )}
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: CATEGORY_COLORS[result.category] || '#999999' }}>
            {result.category} — {SLOT_LABELS[result.slot] || result.slot}
          </span>
          <span className="text-[13px] text-black truncate">{result.label}</span>
          <span className="text-[10px] text-neutral-700">
            Cost: {formatCoinsShort(result.cost)} coins{coinsPerPercent && ` · ${coinsPerPercent} coins/%`}
          </span>
        </div>
        <span className="text-sm font-mono font-bold text-green-500 whitespace-nowrap">+{round3Sig(result.percentIncrease)}%</span>
      </button>
      <button
        type="button"
        onClick={() => onSkip(result)}
        title="Skip — hide this suggestion for now"
        className="shrink-0 px-2.5 flex items-center justify-center text-neutral-700 hover:text-black hover:bg-black/15 cursor-pointer border-l border-black/20"
      >
        ✕
      </button>
    </div>
  );
}

// Damage Increase Optimizer — brute-forces/curated-list-evaluates real gear/enchant/pet/power
// alternatives against the current loadout. See lib/optimizer.js for the full evaluation engine
// and its documented assumptions, and lib/pricing.js for how real coin costs are looked up.
// Every real candidate — gear-slot picks (Weapon/Armor/Equipment/Pet) and the brute-forced
// categories (Enchant/Ultimate Enchant/Power Stone/Stars/...) alike — ranks together in one list,
// per user direction, rather than a separate "by slot" section capped to one pick per slot.
export default function Optimizer() {
  const navigate = useNavigate();
  const build = useBuild();
  const { itemData, loading: itemDataLoading } = useItemData();
  const [mode, setModeState] = useState(loadOptimizerMode);
  const setMode = (next) => {
    setModeState(next);
    saveOptimizerMode(next);
  };
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
    setState((prev) => ({ ...prev, status: 'loading' }));
    // Debounced: this recomputes by brute-forcing hundreds of candidate loadouts, so firing it on
    // every keystroke of a stat/mob-HP/etc. input (this effect's deps include the whole loadout and
    // several free-typed numeric fields) would queue up several full runs back to back. tokenRef
    // still guards against a stale run's result landing after a newer one.
    const handle = setTimeout(() => {
      const token = ++tokenRef.current;
      runOptimizer(build.loadout, itemData, build, mode, { name: mobName, types: mobTypes }).then((result) => {
        if (tokenRef.current === token) setState({ status: 'ok', ...result });
      });
    }, 200);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    build.loadout,
    build.playerStats,
    build.attributes,
    build.miscStats,
    build.godPotionActive,
    build.godPotionMixin,
    build.mobHpPercent,
    build.mobHpSelections,
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
    const handle = setTimeout(() => {
      const token = ++mpTokenRef.current;
      evaluateAccessoryCandidates(build.loadout, itemData, build, mode, { name: mobName, types: mobTypes }, candidates).then((result) => {
        if (mpTokenRef.current === token) setMpResult(result);
      });
    }, 200);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [build.loadout, build.attributes, itemData, itemDataLoading, mode, mobName, mobTypes]);

  // Every real candidate — gear-slot picks, Magical Power, and every brute-forced category from
  // runOptimizer — merges into one ranked list, per user direction. Defaults to "ratio" (best
  // coin-efficiency first) so the player's most coin-efficient sources of damage lead by default;
  // "increase" is available via the toggle for raw %DPS ranking.
  const [sortBy, setSortBy] = useState('ratio');
  // "Skip" (UpgradeRow's ✕) just hides a suggestion from view for the rest of this visit — it
  // doesn't change anything about the loadout or the candidate itself, so a plain key set (not
  // persisted, and never touched by the optimizer re-running) is enough; the same suggestion
  // reappears on a fresh page load or once it's no longer computed at all. Keyed by
  // category/slot/label since results have no stable id of their own across recomputes.
  const [skippedKeys, setSkippedKeys] = useState(() => new Set());
  const resultKey = (r) => `${r.category}:${r.slot}:${r.label}`;
  const slotResults = OPTIMIZER_GEAR_SLOTS.flatMap((slot) => state.slots[slot] || []);
  // maxBudget of 0 means "no limit" (default, unset). A real-priced candidate over budget is
  // dropped; unpriced ('?') candidates always stay — their real cost might be free (a
  // blacksmith-rolled reforge) or just unverified, so hiding them would be a false negative.
  const withinBudget = (r) => !build.maxBudget || typeof r.cost !== 'number' || r.cost <= build.maxBudget;
  const combinedResults = [...slotResults, ...state.otherResults, ...(mpResult?.results || [])]
    .filter(withinBudget)
    .filter((r) => !skippedKeys.has(resultKey(r)))
    .sort((a, b) => compareResults(a, b, sortBy));

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
                disabled={m.disabled}
                onClick={() => !m.disabled && setMode(m.id)}
                title={m.disabled ? `${m.label} — not selectable yet` : m.label}
                className={`${panel} px-3 py-2 flex items-center justify-center gap-2 text-sm font-bold text-black transition-[filter] ${
                  m.disabled ? 'opacity-40 cursor-not-allowed' : mode === m.id ? 'cursor-pointer hover:brightness-110' : 'cursor-pointer brightness-50'
                }`}
              >
                {m.icon && <img src={m.icon} alt="" className="w-5 h-5 pixelated shrink-0" />}
                <span className="truncate">{m.label}</span>
              </button>
            ))}
          </div>
          {!hasCuratedData(mode) && (
            <div className="text-[11px] text-neutral-700 italic">
              Armor/Pet progression isn't configured for this mode yet — only Enchant/Ultimate Enchant/Power Stone/Stars
              suggestions show below.
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="optimizer-max-budget" className="text-[11px] font-bold text-black uppercase tracking-wide">
              Max Budget
            </label>
            <NumberInput
              id="optimizer-max-budget"
              value={build.maxBudget}
              onChange={build.setMaxBudget}
              min={0}
              step={1000000}
              allowSuffix
              placeholder="No limit"
              className={`${panel} px-2 py-1 text-sm text-black w-40 text-right`}
            />
          </div>
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
          <div className={`${panel} p-3 flex flex-col gap-1.5`}>
            <div className="flex items-center justify-between pb-1 mb-0.5 border-b border-neutral-500/40">
              <span className="text-[13px] font-bold text-black uppercase tracking-wide">Recommended Upgrades</span>
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
            {combinedResults.length > 0 ? (
              combinedResults.map((r) => (
                <UpgradeRow
                  key={resultKey(r)}
                  result={r}
                  onSwapIn={(res) => applyOptimizerResult(build, res)}
                  onSkip={(res) => setSkippedKeys((prev) => new Set(prev).add(resultKey(res)))}
                />
              ))
            ) : (
              <div className="px-3 py-2 text-xs text-neutral-600 italic">
                {build.maxBudget ? 'No upgrades available within budget.' : 'No upgrades available.'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

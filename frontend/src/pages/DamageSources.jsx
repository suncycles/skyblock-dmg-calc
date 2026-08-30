import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useItemData } from '../context/ItemDataContext';
import { collectDamageSources } from '../lib/damageSources';
import {
  computeFinalDamage,
  computeAbilityDamage,
  computeMageStaffBeamDamage,
  computeDpsBreakdown,
  DPS_HITS_PER_SECOND,
} from '../lib/finalDamage';
import { ABILITY_DAMAGE_TABLE } from '../lib/abilityDamage';
import {
  VANQUISHED_SET_ID,
  countSetPieces,
  INFERNAL_CRIMSON_SET,
  INFERNAL_CRIMSON_MIN_PIECES,
  INFERNAL_CRIMSON_MAX_STACKS,
} from '../lib/armorSetBonuses';
import { ARMOR_SLOTS } from '../lib/armorSlots';
import { FABLED_REFORGE_ID } from '../lib/damageSources';
import { FABLED_CRIT_BONUS_MAX_PERCENT } from '../lib/reforges';
import { MOB_TYPES } from '../lib/mobTypes';
import { FINAL_DESTINATION_STRENGTH, FINAL_DESTINATION_ATTACK_SPEED } from '../lib/armorSetBonuses';
import { STAT_LABELS, formatStatValue } from '../lib/reforgeData';
import { MOB_TYPE_SYMBOLS, STAT_SYMBOLS } from '../lib/damageSymbols';
import { BASE_STAT_KEYS, Keyworded, round1, round4 } from '../lib/damageFormat';
import NumberInput from '../components/NumberInput';
import PageHeader from '../components/PageHeader';
import { decodeLoadoutCode } from '../lib/loadoutCode';
import { loadSavedLoadoutsFromStorage } from '../lib/savedLoadouts';
import { useConfirmDialog } from '../context/ConfirmDialogContext';

// recharts (+ its d3 submodules) is a genuinely heavy dependency used only by this one chart —
// dynamically imported so it's fetched/parsed only when DPS mode is actually toggled on, not on
// every visit to this page (the far more common case is the plain Final Damage view).
const DpsByHitGraph = lazy(() => import('../components/DpsByHitGraph'));

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';
// Small-caps "eyebrow" header shared by every panel on this page (Section's own title plus the
// few one-off panels below it) so the dense stat page reads as consistently-structured sections
// instead of a pile of bolded labels at varying sizes.
const sectionTitle = 'text-[13px] font-bold text-black uppercase tracking-wide pb-1 mb-0.5 border-b border-neutral-500/40';

// Final Destination's Ender-only Strength/Attack Speed (see finalDamage.js's selectBaseStats) —
// mirrored here so the (Base) Stats panel's displayed total/breakdown matches what Final Damage
// actually used, same reason as isEnderTarget above.
const FINAL_DESTINATION_BONUS_BY_KEY = { strength: FINAL_DESTINATION_STRENGTH, bonus_attack_speed: FINAL_DESTINATION_ATTACK_SPEED };

// Which stat the Enrichments count currently applies to — see damageSources.js's Enrichments source line.
const ENRICHMENT_TYPES = [
  { key: 'strength', label: 'Strength', ...STAT_SYMBOLS.Strength },
  { key: 'crit_damage', label: 'Crit Damage', ...STAT_SYMBOLS['Crit Damage'] },
  { key: 'crit_chance', label: 'Crit Chance', ...STAT_SYMBOLS['Crit Chance'] },
  { key: 'intelligence', label: 'Intelligence', ...STAT_SYMBOLS.Intelligence },
  { key: 'none', label: 'None', symbol: '✕', color: '#666666' },
];

function Section({ title, subtitle, children, empty }) {
  return (
    <div className={`${panel} p-3 flex flex-col gap-1.5`}>
      <div className={sectionTitle}>{title}</div>
      {subtitle && <div className="text-[11px] text-neutral-700 leading-snug mt-0.5 mb-1">{subtitle}</div>}
      {children.length === 0 ? <div className="text-xs text-neutral-600 italic">{empty}</div> : children}
    </div>
  );
}

// Cross-loadout damage-source breakdown: (Base) stats, non-conditional/conditional % additive damage,
// Nx multiplicative sources, and a collapsed-by-default situational list for sources not resolvable to a fixed value.
// `embedded` (used by pages/Landing.jsx to merge the gear and damage-calculation screens into one
// page) skips the standalone page's PageHeader/full-screen sizing and the "Optimize damage" link
// (Landing.jsx already has both a header and its own OptimizerSidebar) — everything else renders
// identically either way, including the Mage/DPS toggles, now inline instead of in PageHeader's
// `right` slot so they're the same markup in both contexts.
export default function DamageSources({ embedded = false }) {
  const navigate = useNavigate();
  const {
    loadout,
    playerStats,
    targetMobs,
    toggleTargetMob,
    godPotionActive,
    godPotionMixin,
    useDungeonizedStats,
    toggleUseDungeonizedStats,
    useMasterMode,
    toggleUseMasterMode,
    mageMode,
    toggleMageMode,
    dpsMode,
    toggleDpsMode,
    attributes,
    miscStats,
    setMiscStat,
    mobHpPercent,
    setMobHpPercent,
    infernalCrimsonStacks,
    setInfernalCrimsonStacks,
    swarmMobs,
    setSwarmMobs,
    comboKills,
    setComboKills,
    legionPlayers,
    setLegionPlayers,
    blazeCrimsonIsle,
    toggleBlazeCrimsonIsle,
    bestiaryMaxedMobs,
    setAccessoryMagicalPower,
    setAccessoryEnrichmentCount,
    setAccessoryEnrichmentType,
    loadFullState,
  } = useBuild();
  const { itemData } = useItemData();
  const { confirmDialog, alertDialog } = useConfirmDialog();
  const [result, setResult] = useState(null);
  const [showSituational, setShowSituational] = useState(false);
  const [expandedStat, setExpandedStat] = useState(null);
  const [savedLoadouts] = useState(loadSavedLoadoutsFromStorage);
  const tokenRef = useRef(0);

  // Swaps in a saved loadout without leaving this page — loadFullState updates BuildContext's
  // `loadout` (and everything else this page reads), which the recalculation effect below is
  // already keyed off of, so Final Damage/(Base) Stats recompute automatically.
  async function handleSwapLoadout(e) {
    const id = e.target.value;
    e.target.value = '';
    if (!id) return;
    const entry = savedLoadouts.find((l) => l.id === id);
    if (!entry) return;
    if (!(await confirmDialog(`Load "${entry.name}"? This will replace your current build.`))) return;
    try {
      const decoded = await decodeLoadoutCode(entry.code, itemData);
      loadFullState(decoded);
    } catch (err) {
      console.error('Failed to load saved loadout:', err);
      await alertDialog('Could not load this saved loadout.');
    }
  }

  const hasInfernalCrimsonStacks = countSetPieces(loadout, ARMOR_SLOTS, INFERNAL_CRIMSON_SET) >= INFERNAL_CRIMSON_MIN_PIECES;
  const weaponUltimateId = loadout.weapon?.modifiers?.ultimateEnchantment?.id?.toLowerCase();
  const hasSwarmEnchant = weaponUltimateId === 'ultimate_swarm';
  const hasComboEnchant = weaponUltimateId === 'ultimate_combo';
  // Legion is an armor enchant (Helmet/Chestplate/Leggings/Boots/Carnival Mask), not a weapon one.
  const hasLegionEnchant = [...ARMOR_SLOTS, 'weapon'].some(
    (slot) => loadout[slot]?.modifiers?.ultimateEnchantment?.id?.toLowerCase() === 'ultimate_legion',
  );
  const hasBlazePet = loadout.pet?.item?.petId === 'BLAZE';
  // Whether any currently-selected target is Mythological-typed — same "applies to at least one
  // selected mob" treatment as appliedToAnyMob below. Drives the (Base) Stats panel's Challenger's/
  // Mythos doubled-stat display, since that panel is one shared block, not per-mob.
  const isMythologicalTarget = targetMobs.some((name) => (MOB_TYPES[name] || []).includes('Mythological'));
  // Same "applies to at least one selected mob" treatment, for Final Destination's Ender-only
  // Strength/Attack Speed (see finalDamage.js's selectBaseStats — the real Final Damage number
  // already reflects this per-mob; this just keeps the (Base) Stats panel's displayed total and
  // source breakdown consistent with it rather than silently disagreeing).
  const isEnderTarget = targetMobs.some((name) => (MOB_TYPES[name] || []).includes('Ender'));

  useEffect(() => {
    const token = ++tokenRef.current;
    setResult(null);
    collectDamageSources(
      loadout,
      itemData,
      playerStats,
      godPotionActive,
      attributes,
      miscStats,
      mobHpPercent,
      infernalCrimsonStacks,
      useDungeonizedStats,
      swarmMobs,
      comboKills,
      legionPlayers,
      blazeCrimsonIsle,
      bestiaryMaxedMobs,
      godPotionMixin,
    ).then((r) => {
      if (tokenRef.current === token) setResult(r);
    });
  }, [
    loadout,
    itemData,
    playerStats,
    godPotionActive,
    godPotionMixin,
    attributes,
    miscStats,
    mobHpPercent,
    infernalCrimsonStacks,
    useDungeonizedStats,
    swarmMobs,
    bestiaryMaxedMobs,
    comboKills,
    legionPlayers,
    blazeCrimsonIsle,
  ]);

  // Vanquished's 1.1x hidden bonus is shown alongside the real, unboosted number rather than
  // silently folded in. hasVanquishedBonus here just means "the set is worn" (cheap short-circuit
  // for whether to bother computing the comparison at all) — the bonus itself only actually procs
  // against Inferno Demonlord (see armorSetBonuses.js), checked per-mob below via appliedIds.
  const hasVanquishedBonus = result?.multiplicative.some((e) => e.id === VANQUISHED_SET_ID) ?? false;
  const withoutVanquishedResult =
    result && hasVanquishedBonus
      ? { ...result, multiplicative: result.multiplicative.filter((e) => e.id !== VANQUISHED_SET_ID) }
      : null;

  // Fabled's crit-hit-chance bonus is randomized per hit — main figure stays at the "no bonus" baseline, second figure shows the real max.
  const hasFabledBonus = result?.multiplicative.some((e) => e.id === FABLED_REFORGE_ID) ?? false;
  const withFabledMaxResult = hasFabledBonus
    ? {
        ...result,
        multiplicative: result.multiplicative.map((e) =>
          e.id === FABLED_REFORGE_ID ? { ...e, value: 1 + FABLED_CRIT_BONUS_MAX_PERCENT / 100 } : e,
        ),
      }
    : null;

  // Final Damage is computed independently per selected mob, so a build can be checked across several targets at once.
  const mobResults = result
    ? targetMobs.map((name) => {
        const types = MOB_TYPES[name] || null;
        if (!types)
          return {
            name,
            types: null,
            finalDamage: null,
            finalDamageWithoutVanquished: null,
            finalDamageWithFabledMax: null,
          };
        const mob = { name, types };
        const finalDamage = computeFinalDamage(result, mob, useDungeonizedStats, useMasterMode);
        // Vanquished's hidden bonus only actually procs against Inferno Demonlord (see
        // armorSetBonuses.js) — hasVanquishedBonus alone just means the set is worn; check
        // appliedIds too so the comparison row doesn't show two identical numbers for every
        // other target.
        return {
          name,
          types,
          finalDamage,
          finalDamageWithoutVanquished:
            hasVanquishedBonus && finalDamage.appliedIds.has(VANQUISHED_SET_ID)
              ? computeFinalDamage(withoutVanquishedResult, mob, useDungeonizedStats, useMasterMode)
              : null,
          finalDamageWithFabledMax: hasFabledBonus
            ? computeFinalDamage(withFabledMaxResult, mob, useDungeonizedStats, useMasterMode)
            : null,
        };
      })
    : [];

  // Dimming (Row's `applied` prop) reads as "applies to at least one selected mob"; undefined when no mob is selected.
  const appliedToAnyMob =
    mobResults.length > 0
      ? mobResults.reduce((set, r) => {
          if (r.finalDamage) for (const id of r.finalDamage.appliedIds) set.add(id);
          return set;
        }, new Set())
      : null;

  // Mage Mode: same per-mob loop, but via the Ability Damage formula instead of melee Final
  // Damage. hasAbilityWeapon distinguishes "no ability data for this weapon" from "no target
  // selected" — computeAbilityDamage itself returns null in that case.
  const hasAbilityWeapon = !!ABILITY_DAMAGE_TABLE[loadout.weapon?.item?.id];
  // Mage Staff "Beam" isn't gated on hasAbilityWeapon — it's a cut of melee Final Damage, not the
  // weapon's own ability, so it applies even when the equipped weapon has no ABILITY_DAMAGE_TABLE
  // entry. mobResults[idx] lines up 1:1 with targetMobs[idx] (mobResults is computed unconditionally
  // above over the same array/order), so it's safe to zip by index instead of a name lookup.
  const abilityMobResults =
    mageMode && result
      ? targetMobs.map((name, idx) => {
          const types = MOB_TYPES[name] || null;
          if (!types) return { name, types: null, abilityDamage: null, beamDamage: null, beamDamageWithFabledMax: null };
          const mob = { name, types };
          const meleeFinalDamage = mobResults[idx]?.finalDamage?.finalDamage;
          const meleeFinalDamageWithFabledMax = mobResults[idx]?.finalDamageWithFabledMax?.finalDamage;
          return {
            name,
            types,
            abilityDamage: computeAbilityDamage(result, mob, loadout, useDungeonizedStats, useMasterMode),
            beamDamage:
              meleeFinalDamage != null
                ? computeMageStaffBeamDamage(result, mob, meleeFinalDamage, useDungeonizedStats, useMasterMode)
                : null,
            // Beam is a cut of melee Final Damage, so Fabled's randomized crit bonus (see
            // finalDamageWithFabledMax above) carries through the same way — a second "up to"
            // figure, not folded into the baseline Beam number.
            beamDamageWithFabledMax:
              meleeFinalDamageWithFabledMax != null
                ? computeMageStaffBeamDamage(result, mob, meleeFinalDamageWithFabledMax, useDungeonizedStats, useMasterMode)
                : null,
          };
        })
      : [];

  // Mage Mode's own applied-ids set — needed because ability-only multiplicative sources (e.g.
  // Implosion Belt, Loving reforge) never appear in the melee `multiplicative` list that
  // `appliedToAnyMob` above is built from, so they'd always read as "not applied" there even
  // when genuinely active. Mirrors appliedToAnyMob's shape, sourced from computeAbilityDamage.
  const abilityAppliedToAnyMob =
    abilityMobResults.length > 0
      ? abilityMobResults.reduce((set, r) => {
          if (r.abilityDamage) for (const id of r.abilityDamage.appliedIds) set.add(id);
          return set;
        }, new Set())
      : null;

  // (Base) Stats shows Intelligence/Ability Damage (the Ability Damage formula's own inputs) plus
  // Damage/Strength/Crit Damage (relevant to the Mage Staff Beam's underlying melee Final Damage)
  // in Mage Mode, and hides Intelligence/Ability Damage otherwise — the two modes describe
  // different damage pipelines, so showing every stat from both at once would just be noise.
  const MAGE_MODE_STAT_KEYS = new Set(['damage', 'intelligence', 'ability_damage', 'strength', 'crit_damage']);
  const visibleStatKeys = mageMode
    ? BASE_STAT_KEYS.filter((k) => MAGE_MODE_STAT_KEYS.has(k))
    : BASE_STAT_KEYS.filter((k) => k !== 'intelligence' && k !== 'ability_damage');

  return (
    <div className={embedded ? 'w-full flex flex-col items-center' : 'min-h-screen flex flex-col items-center p-4'}>
      {!embedded && <PageHeader title="Damage Sources" />}

      <div className="w-full max-w-[700px] mb-1 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleMageMode}
            className={`${panel} px-4 py-2 cursor-pointer flex items-center gap-2 text-sm font-bold text-black transition-[filter] ${
              mageMode ? 'hover:brightness-110' : 'brightness-50'
            }`}
          >
            <img src="/images/manual/mage_mode.png" alt="" className="w-5 h-5" />
            <Keyworded text="Mage" />
          </button>
          <button
            type="button"
            onClick={toggleUseDungeonizedStats}
            className={`${panel} px-4 py-2 cursor-pointer flex items-center gap-2 text-sm font-bold text-black transition-[filter] ${
              useDungeonizedStats ? 'hover:brightness-110' : 'brightness-50'
            }`}
          >
            <img src="/images/manual/catacombs.webp" alt="" className="w-5 h-5" />
            Dungeon
          </button>
          <button
            type="button"
            onClick={toggleUseMasterMode}
            disabled={!useDungeonizedStats}
            className={`${panel} px-4 py-2 flex items-center gap-2 text-sm font-bold text-black transition-[filter] ${
              !useDungeonizedStats
                ? 'opacity-40 cursor-not-allowed'
                : useMasterMode
                  ? 'cursor-pointer hover:brightness-110'
                  : 'cursor-pointer brightness-50'
            }`}
          >
            <img src="/images/manual/master_catacombs.webp" alt="" className="w-5 h-5" />
            Master
          </button>
          <button
            type="button"
            onClick={toggleDpsMode}
            className={`${panel} px-4 py-2 cursor-pointer flex items-center gap-2 text-sm font-bold text-black transition-[filter] ${
              dpsMode ? 'hover:brightness-110' : 'brightness-50'
            }`}
          >
            DPS
          </button>
        </div>
        {!embedded && (
          <button
            type="button"
            className="text-[11px] underline text-neutral-300 cursor-pointer whitespace-nowrap"
            onClick={() => navigate('/optimizer')}
          >
            🧮 Optimize damage →
          </button>
        )}
      </div>

      {savedLoadouts.length > 0 && (
        <div className="w-full max-w-[700px] mb-3 flex items-center gap-2">
          <label htmlFor="swap-loadout" className="text-[11px] font-bold text-neutral-300 uppercase tracking-wide whitespace-nowrap">
            Swap Loadout
          </label>
          <select
            id="swap-loadout"
            defaultValue=""
            onChange={handleSwapLoadout}
            className={`${panel} text-sm px-2 py-1.5 text-black cursor-pointer`}
          >
            <option value="" disabled>
              Select a saved loadout...
            </option>
            {savedLoadouts.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="ml-auto text-[11px] underline text-neutral-300 cursor-pointer whitespace-nowrap"
            onClick={() => navigate('/compare')}
          >
            ⚖️ Compare loadouts →
          </button>
        </div>
      )}

      {!result ? (
        <div className="w-full max-w-[700px] flex flex-col gap-3">
          {[88, 140, 60].map((h, i) => (
            <div key={i} className={`${panel} animate-pulse`} style={{ height: h }} />
          ))}
        </div>
      ) : (
        <div className="w-full max-w-[700px] flex flex-col gap-3">
          {targetMobs.length === 0 ? (
            <div className={`${panel} p-4 flex flex-col gap-2`}>
              <div className={sectionTitle}>Final Damage</div>
              <div className="text-xs text-neutral-600 italic">
                No target selected —{' '}
                <button className="underline cursor-pointer" onClick={() => navigate('/target-mob')}>
                  pick a mob
                </button>{' '}
                to compute Final Damage.
              </div>
            </div>
          ) : dpsMode ? (
            mobResults.map((mobResult) => {
              const { name, types } = mobResult;
              const dps = computeDpsBreakdown(result, { name, types }, loadout, useDungeonizedStats, useMasterMode);
              // Mage Beam fires alongside every melee hit (real mechanic, not Mage-Mode-specific
              // in-game) — only added into this page's own Total DPS while Mage Mode is also
              // toggled on, since that's when a staff/beam build's real damage output matters here
              // (user-confirmed 2026-08-28). computeDpsBreakdown's own `total` deliberately excludes
              // it, so every other DPS-mode consumer (Optimizer's Slayer/Diana/Dungeon-Archer
              // metric, etc.) is unaffected.
              const totalDps = dps.total + (mageMode ? dps.beam : 0);
              return (
                <div key={name} className={`${panel} p-4 flex flex-col gap-2`}>
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="text-[13px] font-bold text-black tracking-wide">{name}</span>
                    <div className="flex items-center gap-2">
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
                      <button
                        className="text-[10px] px-1.5 py-0.5 bg-neutral-800 text-white cursor-pointer hover:brightness-110"
                        onClick={() => toggleTargetMob(name)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  {!types ? (
                    <div className="text-xs text-neutral-600 italic">"{name}" is no longer in the mob data.</div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[12px] text-neutral-700">
                        <span>Melee DPS ({round1(dps.meleeHitsPerSecond)}/s)</span>
                        <span className="text-right font-mono">{Math.round(dps.melee).toLocaleString()}</span>
                        {/* Proc rows are only shown when they're actually contributing — most loadouts
                            don't have Venomous/Thunderlord/Fire Aspect/Crimson Swipe active, and a wall
                            of "0" rows was just clutter (user-specified 2026-08-29). */}
                        {dps.venomous > 0 && (
                          <>
                            <span>Venomous DPS ({DPS_HITS_PER_SECOND.venomous}/s)</span>
                            <span className="text-right font-mono">{Math.round(dps.venomous).toLocaleString()}</span>
                          </>
                        )}
                        {dps.thunderlord > 0 && (
                          <>
                            <span>Thunderlord DPS ({DPS_HITS_PER_SECOND.thunderlord}/s)</span>
                            <span className="text-right font-mono">{Math.round(dps.thunderlord).toLocaleString()}</span>
                          </>
                        )}
                        {dps.fireAspect > 0 && (
                          <>
                            <span>Fire Aspect DPS ({DPS_HITS_PER_SECOND.fireAspect}/s)</span>
                            <span className="text-right font-mono">{Math.round(dps.fireAspect).toLocaleString()}</span>
                          </>
                        )}
                        {dps.crimsonSwipe > 0 && (
                          <>
                            <span>Crimson Swipe DPS ({DPS_HITS_PER_SECOND.crimsonSwipe}/s)</span>
                            <span className="text-right font-mono">{Math.round(dps.crimsonSwipe).toLocaleString()}</span>
                          </>
                        )}
                        {mageMode && dps.beam > 0 && (
                          <>
                            <span>Mage Beam DPS ({round1(dps.meleeHitsPerSecond)}/s)</span>
                            <span className="text-right font-mono">{Math.round(dps.beam).toLocaleString()}</span>
                          </>
                        )}
                      </div>
                      {mageMode && (
                        <div className="text-[10px] italic text-neutral-600">
                          Total DPS includes Mage Beam damage, since Mage Mode is on.
                        </div>
                      )}
                      <div className="flex items-baseline justify-between border-t-2 border-neutral-500 pt-2 mt-1">
                        <span className="text-sm font-bold text-black">Total DPS</span>
                        <span className="text-2xl font-mono font-bold text-black">{Math.round(totalDps).toLocaleString()}</span>
                      </div>
                      {(() => {
                        const appliedIds = [...(mobResult.finalDamage?.appliedIds || [])];
                        const hasFirstStrike = appliedIds.some((id) => id.toLowerCase().endsWith('-first_strike'));
                        const hasTripleStrike = appliedIds.some((id) => id.toLowerCase().endsWith('-triple_strike'));
                        // Real weapons can't carry both (different enchant categories) — if data
                        // somehow has both, Triple Strike's longer 3-hit window wins.
                        const firstHitBoostCount = hasTripleStrike ? 3 : hasFirstStrike ? 1 : 0;
                        const boostedMeleeFinalDamage = mobResult.finalDamage?.finalDamage || 0;
                        const meleeBoostDelta = (boostedMeleeFinalDamage - dps.meleeFinalDamage) * dps.meleeHitsPerSecond;
                        return (
                          <Suspense fallback={<div className="h-[204px]" />}>
                            <DpsByHitGraph
                              perStackVenomousDamage={dps.venomousProc?.finalDamage || 0}
                              steadyOtherDps={totalDps - dps.venomous}
                              meleeBoostDelta={meleeBoostDelta}
                              firstHitBoostCount={firstHitBoostCount}
                              hasVenomous={!!dps.venomousProc}
                            />
                          </Suspense>
                        );
                      })()}
                    </>
                  )}
                </div>
              );
            })
          ) : mageMode ? (
            abilityMobResults.map(({ name, types, abilityDamage, beamDamage, beamDamageWithFabledMax }) => (
              <div key={name} className={`${panel} p-4 flex flex-col gap-2`}>
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <span className="text-[13px] font-bold text-black tracking-wide">{name}</span>
                  <div className="flex items-center gap-2">
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
                    <button
                      className="text-[10px] px-1.5 py-0.5 bg-neutral-800 text-white cursor-pointer hover:brightness-110"
                      onClick={() => toggleTargetMob(name)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                {!types ? (
                  <div className="text-xs text-neutral-600 italic">"{name}" is no longer in the mob data.</div>
                ) : (
                  <>
                    {!hasAbilityWeapon ? (
                      <div className="text-xs text-neutral-600 italic">
                        <Keyworded text="No known Ability Damage data for the equipped weapon — Mage Mode only covers a hand-curated list of staffs/wands/dungeon swords for now." />
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[12px] text-neutral-700">
                          <span>
                            <Keyworded text="Base Ability Damage" />
                          </span>
                          <span className="text-right font-mono">{abilityDamage.baseDamage.toLocaleString()}</span>
                          <span>Catacombs Stats Boost</span>
                          <span className="text-right font-mono">
                            +{round1(abilityDamage.catacombsBoostPercent)}% (x{round4(abilityDamage.catacombsBoostMultiplier)})
                          </span>
                          <span>Ability Scaling</span>
                          <span className="text-right font-mono">{abilityDamage.scaling}</span>
                          <span>
                            <Keyworded text="Ability Damage" /> (stat)
                          </span>
                          <span className="text-right font-mono">+{round1(abilityDamage.abilityDamageStat)}%</span>
                          <span>Initial Damage</span>
                          <span className="text-right font-mono">{round1(abilityDamage.initialDamage)}</span>
                          <span>Additive Multiplier</span>
                          <span className="text-right font-mono">
                            +{round1(abilityDamage.additivePercent)}% (x{round4(abilityDamage.additiveMultiplier)})
                          </span>
                          <span>Multiplicative Multiplier</span>
                          <span className="text-right font-mono">{round4(abilityDamage.multiplicativeMultiplier)}x</span>
                        </div>
                        <div className="flex items-baseline justify-between border-t-2 border-neutral-500 pt-2 mt-1">
                          <span className="text-sm font-bold text-black">Final Damage (Ability)</span>
                          <span className="text-2xl font-mono font-bold text-black">{abilityDamage.finalDamage.toLocaleString()}</span>
                        </div>
                      </>
                    )}
                    {beamDamage && (
                      <div
                        className={`flex items-baseline justify-between ${hasAbilityWeapon ? '' : 'border-t-2 border-neutral-500 pt-2 mt-1'}`}
                      >
                        <span className="text-sm font-bold text-black">Final Damage (Beam{beamDamageWithFabledMax ? ', Fabled' : ''})</span>
                        <span className="text-2xl font-mono font-bold text-black">
                          {beamDamageWithFabledMax
                            ? `${beamDamage.finalDamage.toLocaleString()} ~ ${beamDamageWithFabledMax.finalDamage.toLocaleString()}`
                            : beamDamage.finalDamage.toLocaleString()}
                        </span>
                      </div>
                    )}
                    {useDungeonizedStats && (
                      <div className="text-[10px] italic text-neutral-600">
                        Mob Defense is currently not implemented but will be coming soon
                      </div>
                    )}
                  </>
                )}
              </div>
            ))
          ) : (
            mobResults.map(({ name, types, finalDamage, finalDamageWithoutVanquished, finalDamageWithFabledMax }) => (
              <div key={name} className={`${panel} p-4 flex flex-col gap-2`}>
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <span className="text-[13px] font-bold text-black tracking-wide">{name}</span>
                  <div className="flex items-center gap-2">
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
                    <button
                      className="text-[10px] px-1.5 py-0.5 bg-neutral-800 text-white cursor-pointer hover:brightness-110"
                      onClick={() => toggleTargetMob(name)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                {!types ? (
                  <div className="text-xs text-neutral-600 italic">"{name}" is no longer in the mob data.</div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[12px] text-neutral-700">
                      <span>Initial Damage</span>
                      <span className="text-right font-mono">{round1(finalDamage.initialDamage)}</span>
                      <span>Additive Multiplier</span>
                      <span className="text-right font-mono">
                        +{round1(finalDamage.additivePercent)}% (x{round4(finalDamage.additiveMultiplier)})
                      </span>
                      {finalDamage.weaponBonusPercent !== 0 && (
                        <>
                          <span>Weapon Bonus Multiplier</span>
                          <span className="text-right font-mono">
                            +{round1(finalDamage.weaponBonusPercent)}% (x{round4(finalDamage.weaponBonusMultiplier)})
                          </span>
                        </>
                      )}
                      <span>Multiplicative Multiplier</span>
                      <span className="text-right font-mono">{round4(finalDamage.multiplicativeMultiplier)}x</span>
                      {finalDamage.bonusModifiers !== 0 && (
                        <>
                          <span>Bonus Modifiers</span>
                          <span className="text-right font-mono">+{round1(finalDamage.bonusModifiers)}</span>
                        </>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 border-t-2 border-neutral-500 pt-2 mt-1">
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm font-bold text-black">
                          Final Damage{finalDamageWithFabledMax ? ' (Fabled)' : ''}
                          {finalDamageWithoutVanquished ? ' (with Vanquished)' : ''}
                        </span>
                        <span className="text-2xl font-mono font-bold text-black">
                          {finalDamageWithFabledMax
                            ? `${finalDamage.finalDamage.toLocaleString()} ~ ${finalDamageWithFabledMax.finalDamage.toLocaleString()}`
                            : finalDamage.finalDamage.toLocaleString()}
                          {result.overloadBonusPercent > 0 &&
                            ` ☆ ${Math.floor(finalDamage.finalDamage * (1 + result.overloadBonusPercent / 100)).toLocaleString()}`}
                        </span>
                      </div>
                      {finalDamageWithoutVanquished && (
                        <div className="flex items-baseline justify-between">
                          <span className="text-xs text-neutral-700">Final Damage (without Vanquished)</span>
                          <span className="text-base font-mono text-neutral-700">
                            {finalDamageWithoutVanquished.finalDamage.toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                    {useDungeonizedStats && (
                      <div className="text-[10px] italic text-neutral-600">
                        Mob Defense is currently not implemented but will be coming soon
                      </div>
                    )}
                  </>
                )}
              </div>
            ))
          )}

          {/* Stacks to one column below sm — side by side, MISC's stat labels wrapped onto 3
              lines each and became hard to scan on phone-width viewports. */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-start">
            <div className="flex-1">
              <Section
                title={`(Base) Stats${useDungeonizedStats ? (useMasterMode ? ' (Dungeonized, Master)' : ' (Dungeonized)') : ''}${isMythologicalTarget ? ' (Mythological)' : ''}`}
                subtitle="Click a stat to see where it comes from."
                empty=""
              >
                {visibleStatKeys.map((key) => {
                  const isExpanded = expandedStat === key;
                  const baseDisplayed = !useDungeonizedStats
                    ? isMythologicalTarget
                      ? result.mythologicalBaseStats[key]
                      : result.baseStats[key]
                    : useMasterMode
                      ? isMythologicalTarget
                        ? result.mythologicalMasterDungeonizedBaseStats[key]
                        : result.masterDungeonizedBaseStats[key]
                      : isMythologicalTarget
                        ? result.mythologicalDungeonizedBaseStats[key]
                        : result.dungeonizedBaseStats[key];
                  const finalDestinationBonus =
                    result.hasFinalDestinationFullSet && isEnderTarget ? FINAL_DESTINATION_BONUS_BY_KEY[key] || 0 : 0;
                  const displayed = baseDisplayed + finalDestinationBonus;
                  const sources = finalDestinationBonus
                    ? [
                        ...result.baseStatSources[key],
                        {
                          label: 'Final Destination (Full Set)',
                          value: finalDestinationBonus,
                          dungeonizedValue: finalDestinationBonus,
                          masterDungeonizedValue: finalDestinationBonus,
                        },
                      ]
                    : result.baseStatSources[key];
                  return (
                    <div key={key}>
                      <div
                        className="flex justify-between text-[13px] text-black cursor-pointer hover:underline"
                        onClick={() => setExpandedStat(isExpanded ? null : key)}
                      >
                        <span>
                          <Keyworded text={STAT_LABELS[key].label} />:
                        </span>
                        <span className="font-mono">{formatStatValue(key, Math.round(displayed * 10) / 10)}</span>
                      </div>
                      {isExpanded && (
                        <div className="flex flex-col gap-0.5 mt-1 mb-1.5 pl-3 border-l-2 border-neutral-400">
                          {sources.length === 0 ? (
                            <div className="text-[11px] text-neutral-600 italic">No sources.</div>
                          ) : (
                            sources.map((s) => {
                              const sourceValue = !useDungeonizedStats
                                ? s.value
                                : useMasterMode
                                  ? s.masterDungeonizedValue
                                  : s.dungeonizedValue;
                              return (
                                <div key={s.label} className="flex justify-between text-[12px] text-neutral-700">
                                  <span>{s.label}</span>
                                  <span className="font-mono">{formatStatValue(key, Math.round(sourceValue * 10) / 10)}</span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </Section>
            </div>

            <div className={`${panel} p-3 flex flex-col gap-2 w-full sm:w-[200px] sm:shrink-0`}>
              <div className={sectionTitle}>Misc</div>
              <div className="text-[11px] text-neutral-700 leading-snug -mt-1 mb-1">Any missing stats compared to in-game.</div>
              <label className="flex flex-col gap-0.5 text-[12px] text-black" htmlFor="misc-strength">
                <span>
                  <Keyworded text="Strength" />
                </span>
                <NumberInput
                  id="misc-strength"
                  min={null}
                  value={miscStats.strength}
                  onChange={(num) => setMiscStat('strength', num)}
                  className="w-full px-2 py-1 text-sm bg-black text-white border-2 border-neutral-700 text-center"
                />
              </label>
              <label className="flex flex-col gap-0.5 text-[12px] text-black" htmlFor="misc-crit-damage">
                <span>
                  <Keyworded text="Crit Damage" />
                </span>
                <NumberInput
                  id="misc-crit-damage"
                  min={null}
                  value={miscStats.crit_damage}
                  onChange={(num) => setMiscStat('crit_damage', num)}
                  className="w-full px-2 py-1 text-sm bg-black text-white border-2 border-neutral-700 text-center"
                />
              </label>
              {mageMode && (
                <label className="flex flex-col gap-0.5 text-[12px] text-black" htmlFor="misc-intelligence">
                  <span>
                    <Keyworded text="Intelligence" />
                  </span>
                  <NumberInput
                    id="misc-intelligence"
                    min={null}
                    value={miscStats.intelligence}
                    onChange={(num) => setMiscStat('intelligence', num)}
                    className="w-full px-2 py-1 text-sm bg-black text-white border-2 border-neutral-700 text-center"
                  />
                </label>
              )}
              {hasInfernalCrimsonStacks && (
                <label className="flex flex-col gap-0.5 text-[12px] text-black" htmlFor="infernal-crimson-stacks">
                  <span className="flex justify-between">
                    <span>⑊ Stacks</span>
                    <span className="font-mono">{infernalCrimsonStacks}</span>
                  </span>
                  <input
                    id="infernal-crimson-stacks"
                    type="range"
                    min="1"
                    max={INFERNAL_CRIMSON_MAX_STACKS}
                    step="1"
                    value={infernalCrimsonStacks}
                    onChange={(e) => setInfernalCrimsonStacks(e.target.value)}
                    className="w-full"
                  />
                  <span className="text-[10px] text-neutral-600 italic">Infernal Crimson (2+ pieces), +10%/stack</span>
                </label>
              )}
              {hasSwarmEnchant && (
                <label className="flex flex-col gap-0.5 text-[12px] text-black" htmlFor="swarm-mobs">
                  <span className="flex justify-between">
                    <span>Swarm Mobs</span>
                    <span className="font-mono">{swarmMobs}</span>
                  </span>
                  <input
                    id="swarm-mobs"
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={swarmMobs}
                    onChange={(e) => setSwarmMobs(e.target.value)}
                    className="w-full"
                  />
                </label>
              )}
              {hasComboEnchant && (
                <label className="flex flex-col gap-0.5 text-[12px] text-black" htmlFor="combo-kills">
                  <span className="flex justify-between">
                    <span>Combo Kills</span>
                    <span className="font-mono">{comboKills}</span>
                  </span>
                  <input
                    id="combo-kills"
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={comboKills}
                    onChange={(e) => setComboKills(e.target.value)}
                    className="w-full"
                  />
                </label>
              )}
              {hasLegionEnchant && (
                <label className="flex items-center justify-between gap-1.5 text-[12px] text-black" htmlFor="legion-players">
                  <span>Legion Players</span>
                  <NumberInput
                    id="legion-players"
                    max={20}
                    value={legionPlayers}
                    onChange={setLegionPlayers}
                    className="w-16 px-2 py-1 text-sm bg-black text-white border-2 border-neutral-700 text-center"
                  />
                </label>
              )}
              {hasBlazePet && (
                <label className="flex items-start gap-1.5 text-[12px] leading-tight text-black" htmlFor="blaze-crimson-isle">
                  <input
                    id="blaze-crimson-isle"
                    type="checkbox"
                    checked={blazeCrimsonIsle}
                    onChange={toggleBlazeCrimsonIsle}
                    className="mt-0.5 shrink-0"
                  />
                  <span>In Crimson Isle</span>
                </label>
              )}
              <label className="flex flex-col gap-0.5 text-[12px] text-black" htmlFor="mob-hp-percent">
                <span className="flex justify-between">
                  <span>Mob HP%</span>
                  <span className="font-mono">{mobHpPercent}%</span>
                </span>
                <input
                  id="mob-hp-percent"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={mobHpPercent}
                  onChange={(e) => setMobHpPercent(e.target.value)}
                  className="w-full"
                />
                <span className="text-[10px] text-neutral-600 italic">Execute/Prosecute/First Strike/Triple-Strike</span>
              </label>
            </div>
          </div>

          <div className={`${panel} p-3 flex items-center gap-3`}>
            <div className="text-[13px] font-bold text-black uppercase tracking-wide">Magical Power</div>
            <span className="font-mono text-[13px] text-black">{loadout.accessory?.modifiers?.magicalPower || 0}</span>
            <div className="flex gap-1.5 ml-auto">
              {[5, 10, 20, 50].map((amount) => (
                <button
                  key={amount}
                  type="button"
                  className="text-[12px] px-2.5 py-1 rounded bg-neutral-800 text-white hover:bg-neutral-700 transition-colors cursor-pointer"
                  onClick={() => setAccessoryMagicalPower((loadout.accessory?.modifiers?.magicalPower || 0) + amount)}
                >
                  +{amount}
                </button>
              ))}
            </div>
          </div>

          <div className={`${panel} p-3 flex flex-col gap-2`}>
            <div className="flex items-center gap-3">
              <div className="text-[13px] font-bold text-black uppercase tracking-wide">Enrichments</div>
              <span className="font-mono text-[13px] text-black">{loadout.accessory?.modifiers?.enrichmentCount || 0}</span>
              <div className="flex gap-1.5 ml-auto">
                {[1, 5].map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    className="text-[12px] px-2.5 py-1 rounded bg-neutral-800 text-white hover:bg-neutral-700 transition-colors cursor-pointer"
                    onClick={() => setAccessoryEnrichmentCount((loadout.accessory?.modifiers?.enrichmentCount || 0) + amount)}
                  >
                    +{amount}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {ENRICHMENT_TYPES.map(({ key, label, symbol, color }) => {
                const active = (loadout.accessory?.modifiers?.enrichmentType || 'none') === key;
                return (
                  <button
                    key={key}
                    type="button"
                    title={label}
                    aria-label={label}
                    onClick={() => setAccessoryEnrichmentType(key)}
                    className={`w-8 h-8 flex items-center justify-center text-base font-bold rounded border-2 cursor-pointer transition-[filter] ${
                      active ? 'border-black bg-white' : 'border-neutral-600 bg-neutral-300 brightness-75 hover:brightness-90'
                    }`}
                    style={{ color }}
                  >
                    {symbol}
                  </button>
                );
              })}
            </div>
          </div>

          <Section
            title="Non-conditional % Additive Damage"
            subtitle={mageMode ? 'Only Ability Damage-eligible sources are shown while in Mage Mode.' : undefined}
            empty="None equipped."
          >
            {(mageMode ? result.additiveNonConditional.filter((e) => e.abilityEligible) : result.additiveNonConditional).map((e) => (
              <Row key={e.id} left={e.label} right={`+${round1(e.value)}%`} source={e.source} />
            ))}
          </Section>

          <Section
            title="Conditional % Additive Damage"
            subtitle={
              mageMode
                ? 'Only applies against the listed target(s). Only Ability Damage-eligible sources are shown while in Mage Mode.'
                : 'Only applies against the listed target(s).'
            }
            empty="None equipped."
          >
            {(mageMode ? result.additiveConditional.filter((e) => e.abilityEligible) : result.additiveConditional)
              .filter((e) => !appliedToAnyMob || appliedToAnyMob.has(e.id))
              .map((e) => (
                <Row
                  key={e.id}
                  left={e.label}
                  right={
                    <>
                      +{round1(e.value)}% to <Keyworded text={e.conditionLabel || e.condition} />
                    </>
                  }
                  source={e.source}
                  applied={appliedToAnyMob ? appliedToAnyMob.has(e.id) : undefined}
                />
              ))}
          </Section>

          <Section
            title="Multiplicative Damage Sources"
            subtitle={mageMode ? 'Only Ability Damage-eligible sources are shown while in Mage Mode.' : undefined}
            empty="None equipped."
          >
            {(mageMode ? result.abilityMultiplicative : result.multiplicative).map((e) => {
              const activeSet = mageMode ? abilityAppliedToAnyMob : appliedToAnyMob;
              return (
                <Row
                  key={e.id}
                  left={e.label}
                  right={
                    <>
                      {round4(e.value)}x{e.condition && (
                        <>
                          {' '}
                          to <Keyworded text={e.conditionLabel || e.condition} />
                        </>
                      )}
                    </>
                  }
                  source={e.source}
                  applied={activeSet ? activeSet.has(e.id) : undefined}
                />
              );
            })}
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

// `applied` is only meaningful once a target mob is selected — undefined renders normally, false dims the row.
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

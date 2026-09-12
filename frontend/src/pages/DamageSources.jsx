import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuild , DPS_KINDS } from '../context/BuildContext';
import { useItemData } from '../context/ItemDataContext';
import { collectDamageSources } from '../lib/damageSources';
import {
  computeFinalDamage,
  computeAbilityDamage,
  computeMageStaffBeamDamage,
  computeDpsBreakdown,
  simulateHitByHit,
  DPS_HITS_PER_SECOND,
} from '../lib/finalDamage';
import { resolveStartingHp, getFloorOptions, getTierOptions } from '../lib/mobHp';
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
import { anyMiningIslandTarget } from '../lib/miningIslands';
import { computeMobDefense, computeMobDefenseMultiplier } from '../lib/mobDefenses';
import { FINAL_DESTINATION_STRENGTH, FINAL_DESTINATION_ATTACK_SPEED } from '../lib/armorSetBonuses';
import { STAT_LABELS, formatStatValue } from '../lib/reforgeData';
import { MOB_TYPE_SYMBOLS, STAT_SYMBOLS } from '../lib/damageSymbols';
import { BASE_STAT_KEYS, Keyworded, round1, round4 } from '../lib/damageFormat';
import {
  DUNGEON_BLESSINGS,
  BLESSING_MIN_LEVEL,
  BLESSING_MAX_LEVEL,
  MIMIC_SHARD_MAX_LEVEL,
  FORBIDDEN_BLESSING_MAX_LEVEL,
  computeBlessingMultiplier,
} from '../lib/dungeonBlessing';
import { masterSkullStrengthMultiplier } from '../lib/masterSkull';
import NumberInput from '../components/NumberInput';
import PageHeader from '../components/PageHeader';
import { decodeLoadoutCode } from '../lib/loadoutCode';
import { loadSavedLoadoutsFromStorage } from '../lib/savedLoadouts';
import { useConfirmDialog } from '../context/ConfirmDialogContext';

// recharts (+ its d3 submodules) is a genuinely heavy dependency used only by this one chart —
// dynamically imported so it's fetched/parsed only when DPS mode is actually toggled on, not on
// every visit to this page (the far more common case is the plain Final Damage view).
const HitSimulationGraph = lazy(() => import('../components/HitSimulationGraph'));

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

// The four offensive stats worth glancing at mid-build, shown in the sticky readout on Landing.
// symbolName bridges STAT_LABELS' internal key to STAT_SYMBOLS' display-name key, which has no
// 'Bonus Attack Speed' entry (see lib/damageSymbols.js's own note on that alias).
const STICKY_STAT_KEYS = [
  { key: 'strength', symbolName: 'Strength' },
  { key: 'crit_chance', symbolName: 'Crit Chance' },
  { key: 'crit_damage', symbolName: 'Crit Damage' },
  { key: 'bonus_attack_speed', symbolName: 'Attack Speed' },
];

// Which stat the Enrichments count currently applies to — see damageSources.js's Enrichments source line.
const ENRICHMENT_TYPES = [
  { key: 'strength', label: 'Strength', ...STAT_SYMBOLS.Strength },
  { key: 'crit_damage', label: 'Crit Damage', ...STAT_SYMBOLS['Crit Damage'] },
  { key: 'crit_chance', label: 'Crit Chance', ...STAT_SYMBOLS['Crit Chance'] },
  { key: 'intelligence', label: 'Intelligence', ...STAT_SYMBOLS.Intelligence },
  { key: 'bonus_attack_speed', label: 'Attack Speed', ...STAT_SYMBOLS['Attack Speed'] },
  { key: 'none', label: 'None', symbol: '✕', color: '#666666' },
];

// The mob's real Defense stat and the final multiplier it applies (lib/mobDefenses.js) — shown
// only when it's actually non-zero, which is the handful of Catacombs mobs with a published
// number (and, for most of those, only in Master Mode). Replaces a stale "not implemented yet"
// notice that survived the feature actually shipping.
function MobDefenseNote({ name, types, masterMode }) {
  const mob = { name, types };
  const defense = computeMobDefense(mob, masterMode);
  if (!defense) return null;
  return (
    <div className="text-[11px] text-neutral-700 flex items-baseline justify-between border-t border-neutral-500/40 pt-1 mt-0.5">
      <span>Mob Defense ({defense.toLocaleString()})</span>
      <span className="font-mono">{round4(computeMobDefenseMultiplier(mob, masterMode))}x</span>
    </div>
  );
}

// The Mob HP% slider was removed (user-specified 2026-09-05), so every figure on this page is
// computed at full HP — see BuildContext's PINNED_MOB_HP_PERCENT, which keeps the Optimizer in
// agreement. That also means First Strike/Triple Strike always apply, which the Final Damage
// headline now says out loud (meleeDamageQualifiers).
const MOB_HP_PERCENT = 100;

// The blessing effectiveness readout only ever needs 2dp (1.815 max, 1.2 minimum).
const round2 = (n) => Math.round(n * 100) / 100;

// The MISC panel's values reach the calculation on an explicit Apply press, not a timer
// (user-specified 2026-09-10, replacing the 3s debounce that came before it). These are the
// free-typed stat fields and dragged sliders, so recalculating per keystroke queued a full
// collectDamageSources pass each time — but a timer meant the page silently changed under you
// three seconds after you stopped, with no way to say "now". A button makes the commit moment
// yours. The panel's own controls always show the live value, so typing stays responsive; only the
// copy feeding the calculation waits for the press. The Blaze checkbox stays outside this: it's a
// discrete toggle with no "still editing" state to confirm.
function useConfirmedValues(live) {
  const [applied, setApplied] = useState(live);
  // Compared by serialising — this is five small numbers plus one flat object, and `live` is a
  // fresh object every render, so an identity check would always read dirty.
  const dirty = JSON.stringify(live) !== JSON.stringify(applied);
  return [applied, () => setApplied(live), dirty];
}

// Qualifiers that belong in the Final Damage headline. Fabled means the figure is a range (its
// crit bonus is randomized per hit); First Strike/Triple Strike mean the number is an OPENING hit
// and won't repeat — worth naming, since with the Mob HP% slider gone every result is computed at
// full HP, which is exactly when those two apply (see damageSources.js's firstHitOnly gate).
const FIRST_HIT_LABELS = [
  { suffix: '-first_strike', label: 'First Strike' },
  { suffix: '-triple_strike', label: 'Triple Strike' },
];

function meleeDamageQualifiers(finalDamage, hasFabledRange) {
  const parts = [];
  if (hasFabledRange) parts.push('Fabled');
  const applied = finalDamage?.appliedIds ? [...finalDamage.appliedIds].map((id) => id.toLowerCase()) : [];
  for (const { suffix, label } of FIRST_HIT_LABELS) {
    if (applied.some((id) => id.endsWith(suffix))) parts.push(label);
  }
  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

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
export default function DamageSources({ embedded = false, hideSticky = false }) {
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
    dpsKind,
    setDpsKind,
    toggleDpsMode,
    attributes,
    miscStats,
    setMiscStat,
    mobHpSelections,
    setMobHpSelection,
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
    maxedCollectionsCount,
    blessing,
    essencePerks,
    setBlessingLevel,
    setPaulBuff,
    setAccessoryMagicalPower,
    setAccessoryEnrichmentCount,
    setAccessoryEnrichmentType,
    loadFullState,
  } = useBuild();
  const { itemData } = useItemData();
  const { confirmDialog, alertDialog } = useConfirmDialog();
  const resultsRef = useRef(null); // scroll target for the sticky headline readout below

  const [result, setResult] = useState(null);
  const [showSituational, setShowSituational] = useState(false);
  const [expandedStat, setExpandedStat] = useState(null);
  const [savedLoadouts] = useState(loadSavedLoadoutsFromStorage);
  const tokenRef = useRef(0);

  // Applied-on-confirm copies of every MISC-panel value that feeds collectDamageSources — see
  // useConfirmedValues. Bundled into one snapshot so a single Apply press commits the whole panel.
  const [appliedMisc, applyMisc, miscDirty] = useConfirmedValues({
    miscStats,
    infernalCrimsonStacks,
    swarmMobs,
    comboKills,
    legionPlayers,
    blessing,
  });
  const settledMiscStats = appliedMisc.miscStats;
  const settledInfernalCrimsonStacks = appliedMisc.infernalCrimsonStacks;
  const settledSwarmMobs = appliedMisc.swarmMobs;
  const settledComboKills = appliedMisc.comboKills;
  const settledLegionPlayers = appliedMisc.legionPlayers;
  const settledBlessing = appliedMisc.blessing;

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
  // Blaze pet's "In Crimson Isle" bonus (BLAZE_CRIMSON_ISLE_PERCENT) is real-life gated on the
  // player's actual location, which this app doesn't model — but Infernal/Magmatic-typed mobs are
  // only ever fought there, so targeting one is a real, non-guessed signal to turn the bonus on
  // automatically rather than relying on the player to remember the manual checkbox (user-specified
  // 2026-09-01). OR'd with the manual toggle rather than replacing it — a manual "on" still counts
  // for non-Infernal/Magmatic targets fought on Crimson Isle for other reasons.
  // Same shape as isCrimsonIsleTarget below — a target-derived gate, computed here because
  // collectDamageSources never sees the mob itself. See lib/miningIslands.js.
  const isMiningIslandTarget = anyMiningIslandTarget(targetMobs);

  const isCrimsonIsleTarget = targetMobs.some((name) => {
    const types = MOB_TYPES[name] || [];
    return types.includes('Infernal') || types.includes('Magmatic');
  });
  const effectiveBlazeCrimsonIsle = blazeCrimsonIsle || isCrimsonIsleTarget;

  useEffect(() => {
    setResult(null);
    // Debounced like Optimizer.jsx's own recompute effect — this fires on every keystroke of a
    // free-typed stat/attribute field (this effect's deps include several), so an undebounced call
    // queues up a full collectDamageSources pass per keystroke instead of one after typing settles
    // (user-specified 2026-09-02, following a performance audit). The 200ms cleanup below also
    // means React StrictMode's dev-only mount→cleanup→mount double-invoke cancels the first
    // timeout before it ever fires, instead of running the real pipeline twice on every mount.
    const handle = setTimeout(() => {
      const token = ++tokenRef.current;
      collectDamageSources(
        loadout,
        itemData,
        playerStats,
        godPotionActive,
        attributes,
        settledMiscStats,
        MOB_HP_PERCENT,
        settledInfernalCrimsonStacks,
        useDungeonizedStats,
        settledSwarmMobs,
        settledComboKills,
        settledLegionPlayers,
        effectiveBlazeCrimsonIsle,
        bestiaryMaxedMobs,
        godPotionMixin,
        maxedCollectionsCount,
        settledBlessing,
        essencePerks,
        isMiningIslandTarget,
      ).then((r) => {
        if (tokenRef.current === token) setResult(r);
      });
    }, 200);
    return () => clearTimeout(handle);
  }, [
    loadout,
    itemData,
    playerStats,
    godPotionActive,
    godPotionMixin,
    attributes,
    settledMiscStats,
    settledInfernalCrimsonStacks,
    useDungeonizedStats,
    settledSwarmMobs,
    bestiaryMaxedMobs,
    settledComboKills,
    settledLegionPlayers,
    settledBlessing,
    essencePerks,
    effectiveBlazeCrimsonIsle,
    isMiningIslandTarget,
    maxedCollectionsCount,
  ]);

  // A second sources object, fixed at mobHpPercent=100 regardless of the (Base) Stats panel's own
  // slider — only fetched in DPS mode, where the hit-by-hit graph needs First Strike/Triple
  // Strike's opening-hit-only entry to actually be present (collectEnchantEntries only includes
  // it when mobHpPercent===100) so simulateHitByHit can gate it per-hit itself, independent of
  // whatever % the slider happens to be showing right now.
  const [resultAt100, setResultAt100] = useState(null);
  const tokenAt100Ref = useRef(0);
  useEffect(() => {
    if (!dpsMode) return;
    // Same 200ms debounce as the main result effect above, same reason.
    const handle = setTimeout(() => {
      const token = ++tokenAt100Ref.current;
      collectDamageSources(
        loadout,
        itemData,
        playerStats,
        godPotionActive,
        attributes,
        settledMiscStats,
        100,
        settledInfernalCrimsonStacks,
        useDungeonizedStats,
        settledSwarmMobs,
        settledComboKills,
        settledLegionPlayers,
        blazeCrimsonIsle,
        bestiaryMaxedMobs,
        godPotionMixin,
        maxedCollectionsCount,
        settledBlessing,
        essencePerks,
        isMiningIslandTarget,
      ).then((r) => {
        if (tokenAt100Ref.current === token) setResultAt100(r);
      });
    }, 200);
    return () => clearTimeout(handle);
  }, [
    dpsMode,
    loadout,
    itemData,
    playerStats,
    godPotionActive,
    godPotionMixin,
    attributes,
    settledMiscStats,
    settledInfernalCrimsonStacks,
    useDungeonizedStats,
    settledSwarmMobs,
    bestiaryMaxedMobs,
    settledComboKills,
    settledLegionPlayers,
    settledBlessing,
    essencePerks,
    blazeCrimsonIsle,
    isMiningIslandTarget,
    maxedCollectionsCount,
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

  // Which of the six precomputed base-stat tables the current Dungeonized/Master/Mythological
  // toggles select. Extracted so the sticky readout's stat strip and the (Base) Stats panel can't
  // drift apart — both read the same number for a given stat key.
  function selectDisplayedStat(key) {
    if (!result) return 0;
    if (!useDungeonizedStats) return isMythologicalTarget ? result.mythologicalBaseStats[key] : result.baseStats[key];
    if (useMasterMode)
      return isMythologicalTarget ? result.mythologicalMasterDungeonizedBaseStats[key] : result.masterDungeonizedBaseStats[key];
    return isMythologicalTarget ? result.mythologicalDungeonizedBaseStats[key] : result.dungeonizedBaseStats[key];
  }

  // Headline for the sticky readout (embedded/Landing only). Damage has always recalculated
  // live, but the number sat ~1.5 screens below the gear grid, so editing gear and reading its
  // effect were never on screen at the same time — every change cost a scroll down and back.
  // Reuses the numbers already computed above rather than re-deriving anything.
  const stickyHeadline = (() => {
    if (targetMobs.length === 0 || !result) return null;
    if (mageMode) {
      const r = abilityMobResults[0];
      if (!r) return null;
      if (hasAbilityWeapon && r.abilityDamage) {
        return { mob: r.name, label: 'Ability', value: r.abilityDamage.finalDamage.toLocaleString() };
      }
      if (r.beamDamage) {
        return { mob: r.name, label: 'Beam', value: r.beamDamage.finalDamage.toLocaleString() };
      }
      return null;
    }
    const r = mobResults[0];
    if (!r || !r.finalDamage) return null;
    return {
      mob: r.name,
      label: `Final Damage${meleeDamageQualifiers(r.finalDamage, !!r.finalDamageWithFabledMax)}`,
      value: r.finalDamageWithFabledMax
        ? `${r.finalDamage.finalDamage.toLocaleString()} ~ ${r.finalDamageWithFabledMax.finalDamage.toLocaleString()}`
        : r.finalDamage.finalDamage.toLocaleString(),
    };
  })();

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
          {/* The three outputs are alternatives, not layers — see BuildContext's DPS_KINDS. Only
              shown while the DPS view is on, since it says nothing about Final Damage. */}
          {dpsMode && (
            <div className={`${panel} flex items-center`} role="group" aria-label="DPS output">
              {DPS_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setDpsKind(kind)}
                  aria-pressed={dpsKind === kind}
                  className={`px-3 py-2 text-sm font-bold cursor-pointer capitalize transition-[filter] ${
                    dpsKind === kind ? 'text-black' : 'text-black/45 hover:text-black/70'
                  }`}
                >
                  {kind}
                </button>
              ))}
            </div>
          )}
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
        <div ref={resultsRef} className="w-full max-w-[700px] flex flex-col gap-3">
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
              const { name, types, finalDamage, finalDamageWithFabledMax } = mobResult;
              const dps = computeDpsBreakdown(result, { name, types }, loadout, useDungeonizedStats, useMasterMode);

              // A mob with more than one possible starting HP (a Catacombs trash mob spawning on
              // several floors, or a Slayer/Mythological boss with several tiers) can't resolve a
              // real number without knowing which — this picker supplies that choice (persisted
              // per-mob in BuildContext, so Optimizer's own resolveStartingHp call for the same mob
              // sees it too). A mob with only one floor/tier (or a flat HP) never shows one;
              // there's nothing to pick. Computed here (not just inside the graph below) so the
              // real fight simulation is available to the Total DPS headline too.
              let pickerOptions = null;
              let isFloorPicker = false;
              let selection = '';
              let sim = null;
              if (types) {
                const floorOptions = getFloorOptions(name, useMasterMode);
                const tierOptions = getTierOptions(name);
                isFloorPicker = !!(floorOptions && floorOptions.length > 1);
                pickerOptions = isFloorPicker
                  ? floorOptions.map((f) => ({ value: f, label: `Floor ${f}` }))
                  : tierOptions && tierOptions.length > 1
                    ? tierOptions.map((t) => ({ value: t.label, label: t.label }))
                    : null;
                selection = mobHpSelections[name] || '';
                const startingHp = resolveStartingHp(name, useMasterMode, selection);
                const simSources = startingHp ? resultAt100 : result;
                if (simSources) {
                  sim = simulateHitByHit(simSources, { name, types }, loadout, startingHp, MOB_HP_PERCENT, useDungeonizedStats, useMasterMode);
                }
              }

              // Once a real starting HP is known, Total DPS shows the true average across the whole
              // simulated fight (Venomous stacking up, Execute/Prosecute ramping with real draining
              // HP%, First Strike/Triple Strike's opening bonus) instead of a fixed-snapshot number
              // — same reason lib/optimizer.js's ranking metric switched to this (user-specified
              // 2026-09-01): computeDpsBreakdown prices Venomous at a permanent single stack, i.e.
              // literal first-hit conditions, understating it by up to 40x once stacks build.
              // Beam REPLACES the melee hit rather than stacking on top of it (user-specified
              // 2026-09-11) — it used to be added into the melee total whenever Mage Mode was on,
              // which double-counted a staff build. The procs (Venomous/Thunderlord/Fire Aspect/
              // Crimson Swipe) stay either way: they fire per hit, whichever kind of hit it is.
              //
              // Beam reports the steady state rather than the simulated average, because the two
              // aren't interchangeable terms: the simulation's number is a whole-fight average with
              // Venomous stacking and Execute ramping baked in, so subtracting a steady-state melee
              // figure out of it would be arithmetic across two different bases. Beam itself never
              // ramps (it doesn't scale with HP% or stacks), so there's nothing to simulate for it.
              // Procs (Venomous/Thunderlord/Fire Aspect/Crimson Swipe) ride on a melee swing or a
              // beam proc, never on an arrow (user-specified 2026-09-11).
              const showProcs = dpsKind !== 'bow';
              let totalDps;
              if (dpsKind === 'bow') {
                // Bow DPS is the volley at a bow's own fire rate and nothing else — no procs, no
                // simulation (it has no Venomous/Execute ramp to average over).
                totalDps = dps.bow;
              } else if (dpsKind === 'beam') {
                totalDps = dps.total - dps.melee + dps.beam;
              } else {
                totalDps = dps.total;
                if (sim?.hasRealHp) {
                  const totalDealt = sim.hits.reduce((sum, h) => sum + h.totalDamage, 0);
                  const elapsedSeconds = sim.totalHits != null ? sim.timeToKillSeconds : sim.hits.length / sim.meleeHitsPerSecond;
                  if (elapsedSeconds > 0) totalDps = totalDealt / elapsedSeconds;
                }
              }
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
                        {/* Melee vs Arrow are mutually exclusive labels for the same DPS source — a
                            real loadout only ever has one weapon equipped, never both at once
                            (user-specified 2026-09-01). Duplex isn't a separate hit, just a
                            multiplier on this same volley, so its bonus is shown as its own line
                            broken back out of `melee` rather than double-counted. */}
                        <span>
                          {dpsKind === 'bow' ? 'Arrow' : dps.isBowWeapon ? 'Arrow' : 'Melee'} DPS (
                          {round1(dpsKind === 'bow' ? dps.bowShotsPerSecond : dps.meleeHitsPerSecond)}/s)
                        </span>
                        <span className="text-right font-mono">
                          {Math.round(
                            dpsKind === 'bow' ? dps.bow - dps.duplexBonusDps * (dps.bowShotsPerSecond / dps.meleeHitsPerSecond) : dps.melee - dps.duplexBonusDps,
                          ).toLocaleString()}
                        </span>
                        {dps.duplexLevel > 0 && (
                          <>
                            <span>Duplex DPS ({round1(dpsKind === 'bow' ? dps.bowShotsPerSecond : dps.meleeHitsPerSecond)}/s)</span>
                            <span className="text-right font-mono">
                              {Math.round(
                                dpsKind === 'bow' ? dps.duplexBonusDps * (dps.bowShotsPerSecond / dps.meleeHitsPerSecond) : dps.duplexBonusDps,
                              ).toLocaleString()}
                            </span>
                          </>
                        )}
                        {/* Procs belong to Melee and Beam only, never Bow (user-specified 2026-09-11)
                            — `showProcs` gates all four, and the same rule has to hold when Bow DPS
                            itself gets modelled, not just for these display rows.
                            Within Melee/Beam they're still only shown when actually contributing:
                            most loadouts have none of them active, and a wall of "0" rows was just
                            clutter (user-specified 2026-08-29). */}
                        {showProcs && dps.venomous > 0 && (
                          <>
                            <span>
                              Venomous DPS ({DPS_HITS_PER_SECOND.venomous}/s)
                              {/* Names the real mob mechanic cutting this to a fraction (Inferno
                                  Demonlord's Hellion Shield), so a tiny number doesn't read as a bug. */}
                              {dps.venomousProc?.reductionLabel && ` (${dps.venomousProc.reductionLabel})`}
                            </span>
                            <span className="text-right font-mono">{Math.round(dps.venomous).toLocaleString()}</span>
                          </>
                        )}
                        {showProcs && dps.thunderlord > 0 && (
                          <>
                            <span>Thunderlord DPS ({DPS_HITS_PER_SECOND.thunderlord}/s)</span>
                            <span className="text-right font-mono">{Math.round(dps.thunderlord).toLocaleString()}</span>
                          </>
                        )}
                        {showProcs && dps.fireAspect > 0 && (
                          <>
                            <span>Fire Aspect DPS ({DPS_HITS_PER_SECOND.fireAspect}/s)</span>
                            <span className="text-right font-mono">{Math.round(dps.fireAspect).toLocaleString()}</span>
                          </>
                        )}
                        {showProcs && dps.crimsonSwipe > 0 && (
                          <>
                            <span>Crimson Swipe DPS ({DPS_HITS_PER_SECOND.crimsonSwipe}/s)</span>
                            <span className="text-right font-mono">{Math.round(dps.crimsonSwipe).toLocaleString()}</span>
                          </>
                        )}
                        {dpsKind === 'beam' && dps.beam > 0 && (
                          <>
                            <span>Mage Beam DPS ({round1(dps.meleeHitsPerSecond)}/s)</span>
                            <span className="text-right font-mono">{Math.round(dps.beam).toLocaleString()}</span>
                          </>
                        )}
                      </div>
                      {dpsKind === 'beam' && (
                        <div className="text-[10px] italic text-neutral-600">
                          Total DPS counts Mage Beam in place of the {dps.isBowWeapon ? 'Arrow' : 'Melee'} hit, not on top of it — and
                          reports the steady state rather than the fight average.
                        </div>
                      )}
                      {sim?.hasRealHp && dpsKind === 'melee' && (
                        <div className="text-[10px] italic text-neutral-600">
                          Total DPS is the real fight average (Venomous/Execute-Prosecute ramp up over
                          the fight) — the per-source lines above are a first-hit snapshot, so they
                          won't sum to this exactly.
                        </div>
                      )}
                      <div className="flex flex-col gap-1 border-t-2 border-neutral-500 pt-2 mt-1">
                        {/* The per-hit melee number the non-DPS view headlines, repeated here: DPS
                            mode otherwise only showed rates, so there was nowhere to read what one
                            swing actually hits for. Melee only — Venomous/Fire Aspect/Thunderlord/
                            Crimson Swipe are separate procs and already have their own DPS rows. */}
                        {finalDamage && (
                          <div className="flex items-baseline justify-between">
                            <span className="text-sm font-bold text-black">
                              Damage{meleeDamageQualifiers(finalDamage, !!finalDamageWithFabledMax)}
                            </span>
                            <span className="text-lg font-mono font-bold text-black">
                              {finalDamageWithFabledMax
                                ? `${finalDamage.finalDamage.toLocaleString()} ~ ${finalDamageWithFabledMax.finalDamage.toLocaleString()}`
                                : finalDamage.finalDamage.toLocaleString()}
                            </span>
                          </div>
                        )}
                        <div className="flex items-baseline justify-between">
                          <span className="text-sm font-bold text-black">
                            Total DPS
                            {dpsKind !== 'melee' && <span className="ml-1 font-normal capitalize text-neutral-600">({dpsKind})</span>}
                          </span>
                          {/* Bow DPS is real now (its own Attack Speed breakpoints, no procs — see
                              finalDamage.js), but only means anything with a bow actually equipped:
                              the same volley fired at bow rates off a sword build is a number for a
                              loadout nobody has. */}
                          {dpsKind === 'bow' && !dps.isBowWeapon ? (
                            <span className="text-sm font-bold text-neutral-600 italic">No bow equipped</span>
                          ) : (
                            <span className="text-2xl font-mono font-bold text-black">{Math.round(totalDps).toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                      {pickerOptions && (
                        <div className="flex items-center gap-2 text-[11px]">
                          <label htmlFor={`mob-hp-select-${name}`} className="font-bold text-neutral-700 uppercase tracking-wide">
                            {isFloorPicker ? 'Floor' : 'Tier'}
                          </label>
                          <select
                            id={`mob-hp-select-${name}`}
                            value={selection}
                            onChange={(e) => setMobHpSelection(name, e.target.value)}
                            className="px-1.5 py-0.5 bg-black text-white text-[11px] cursor-pointer border-2 border-neutral-700"
                          >
                            <option value="">Pick to use real HP</option>
                            {pickerOptions.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      {sim && (
                        <Suspense fallback={<div className="h-[224px]" />}>
                          <HitSimulationGraph
                            hits={sim.hits}
                            hasRealHp={sim.hasRealHp}
                            mobName={name}
                            totalHits={sim.totalHits}
                            timeToKillSeconds={sim.timeToKillSeconds}
                            exceededSimCap={sim.exceededSimCap}
                            maxDps={sim.maxDps}
                            minDps={sim.minDps}
                          />
                        </Suspense>
                      )}
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
                    <MobDefenseNote name={name} types={types} masterMode={useMasterMode} />
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
                          Final Damage{meleeDamageQualifiers(finalDamage, !!finalDamageWithFabledMax)}
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
                    <MobDefenseNote name={name} types={types} masterMode={useMasterMode} />
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
                  const baseDisplayed = selectDisplayedStat(key);
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
                <label
                  className="flex items-start gap-1.5 text-[12px] leading-tight text-black"
                  htmlFor="blaze-crimson-isle"
                  title={isCrimsonIsleTarget ? 'Turned on automatically — target is Infernal/Magmatic' : undefined}
                >
                  <input
                    id="blaze-crimson-isle"
                    type="checkbox"
                    checked={effectiveBlazeCrimsonIsle}
                    disabled={isCrimsonIsleTarget}
                    onChange={toggleBlazeCrimsonIsle}
                    className="mt-0.5 shrink-0 disabled:opacity-70"
                  />
                  <span>
                    In Crimson Isle
                    {isCrimsonIsleTarget && <span className="text-neutral-600 italic"> (auto)</span>}
                  </span>
                </label>
              )}
              {/* Dungeon Blessings are a Catacombs-run thing, so the whole block only exists while
                  the Dungeon toggle is on (user-specified 2026-09-10). The two effectiveness
                  inputs above the sliders are read-only: they come from the account on import
                  (Mimic Shard level, Forbidden Blessing perk), not from typing. */}
              {useDungeonizedStats && (
                <>
                  <div className="border-t border-neutral-500/40 pt-2 mt-1 text-[11px] font-bold text-black uppercase tracking-wide">
                    Dungeon Blessings
                  </div>
                  <label className="flex items-start gap-1.5 text-[12px] leading-tight text-black" htmlFor="paul-buff">
                    <input id="paul-buff" type="checkbox" checked={!!blessing.paulBuff} onChange={(e) => setPaulBuff(e.target.checked)} className="mt-0.5 shrink-0" />
                    <span>Paul Buff</span>
                  </label>
                  <div className="text-[10px] text-neutral-600 leading-snug">
                    Effectiveness ×{round2(computeBlessingMultiplier(blessing, attributes))}
                    <span className="italic">
                      {' '}
                      (Mimic {attributes.mimic || 0}/{MIMIC_SHARD_MAX_LEVEL} · Forbidden {blessing.forbiddenBlessingLevel}/
                      {FORBIDDEN_BLESSING_MAX_LEVEL})
                    </span>
                  </div>
                  <div className="text-[10px] text-neutral-600 leading-snug">
                    Master Skull ×{masterSkullStrengthMultiplier(blessing.masterSkullTier)}
                    <span className="italic"> (Tier {blessing.masterSkullTier || '—'}, Strength only)</span>
                  </div>
                  {DUNGEON_BLESSINGS.map((b) => (
                    <label key={b.id} className="flex flex-col gap-0.5 text-[12px] text-black" htmlFor={`blessing-${b.id}`}>
                      <span className="flex justify-between">
                        <span>{b.label}</span>
                        <span className="font-mono">{blessing.levels[b.id]}</span>
                      </span>
                      <input
                        id={`blessing-${b.id}`}
                        type="range"
                        min={BLESSING_MIN_LEVEL}
                        max={BLESSING_MAX_LEVEL}
                        step="1"
                        value={blessing.levels[b.id]}
                        onChange={(e) => setBlessingLevel(b.id, e.target.value)}
                        className="w-full"
                      />
                    </label>
                  ))}
                </>
              )}
              {/* Always rendered, not only while dirty — a button that appears out of nowhere the
                  first time you type is worse than one that's visibly waiting, and a stable slot
                  keeps the panel from reflowing mid-edit. */}
              <button
                type="button"
                onClick={applyMisc}
                disabled={!miscDirty}
                className={`mt-1 w-full px-2 py-1.5 text-[12px] font-bold cursor-pointer transition-colors ${
                  miscDirty
                    ? 'bg-green-400 text-black hover:brightness-110'
                    : 'bg-neutral-800 text-neutral-500 cursor-default'
                }`}
              >
                {miscDirty ? 'Apply changes' : 'Applied'}
              </button>
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

      {/* Bottom-LEFT, not a full-width bar: keeps clear of GlobalFooter's bottom-right cluster and
          OptimizerSidebar's lg:right-4 rail. Only on Landing (`embedded`) — the standalone
          /damage-sources page already has these numbers at the top of the viewport. */}
      {embedded && stickyHeadline && !hideSticky && (
        <button
          type="button"
          onClick={() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="opaque-panel fixed bottom-2 left-2 z-30 max-w-[calc(100vw-1rem)] flex items-baseline gap-2 px-3 py-2 text-left cursor-pointer bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black hover:brightness-110"
          title="Jump to the full damage breakdown"
        >
          <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-700 shrink-0">
            {stickyHeadline.label}
            <span className="block font-normal normal-case tracking-normal truncate">vs {stickyHeadline.mob}</span>
          </span>
          <span className="text-lg font-mono font-bold text-black whitespace-nowrap">{stickyHeadline.value}</span>
          {/* The offensive stats a player actually checks while swapping gear. Dropped below `sm`
              where the pill has no room; the full (Base) Stats panel is one tap away regardless. */}
          <span className="hidden sm:flex items-baseline gap-2 pl-2 ml-1 border-l border-neutral-500/50 text-[10px] font-mono text-neutral-700">
            {STICKY_STAT_KEYS.map(({ key, symbolName }) => {
              const meta = STAT_SYMBOLS[symbolName];
              return (
                <span key={key} style={{ color: meta.color }} title={STAT_LABELS[key].label}>
                  {meta.symbol} {formatStatValue(key, Math.round(selectDisplayedStat(key) * 10) / 10)}
                </span>
              );
            })}
          </span>
        </button>
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

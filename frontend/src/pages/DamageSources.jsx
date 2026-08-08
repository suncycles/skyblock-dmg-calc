import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useItemData } from '../context/ItemDataContext';
import { collectDamageSources } from '../lib/damageSources';
import { computeFinalDamage, computeAbilityDamage } from '../lib/finalDamage';
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
import { STAT_LABELS, formatStatValue } from '../lib/reforgeData';
import { MOB_TYPE_SYMBOLS } from '../lib/damageSymbols';
import { BASE_STAT_KEYS, Keyworded, round1, round4 } from '../lib/damageFormat';
import NumberInput from '../components/NumberInput';
import PageHeader from '../components/PageHeader';
import { decodeLoadoutCode } from '../lib/loadoutCode';
import { loadSavedLoadoutsFromStorage } from '../lib/savedLoadouts';
import { useConfirmDialog } from '../context/ConfirmDialogContext';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';
// Small-caps "eyebrow" header shared by every panel on this page (Section's own title plus the
// few one-off panels below it) so the dense stat page reads as consistently-structured sections
// instead of a pile of bolded labels at varying sizes.
const sectionTitle = 'text-[13px] font-bold text-black uppercase tracking-wide pb-1 mb-0.5 border-b border-neutral-500/40';

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
export default function DamageSources() {
  const navigate = useNavigate();
  const {
    loadout,
    playerStats,
    targetMobs,
    toggleTargetMob,
    godPotionActive,
    useDungeonizedStats,
    toggleUseDungeonizedStats,
    useMasterMode,
    toggleUseMasterMode,
    mageMode,
    toggleMageMode,
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
    setAccessoryMagicalPower,
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
    ).then((r) => {
      if (tokenRef.current === token) setResult(r);
    });
  }, [
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
  ]);

  // Vanquished's 1.1x hidden bonus is shown alongside the real, unboosted number rather than silently folded in.
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
          return { name, types: null, finalDamage: null, finalDamageWithoutVanquished: null, finalDamageWithFabledMax: null };
        const mob = { name, types };
        return {
          name,
          types,
          finalDamage: computeFinalDamage(result, mob, useDungeonizedStats, useMasterMode),
          finalDamageWithoutVanquished: hasVanquishedBonus
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
  const abilityMobResults =
    mageMode && result
      ? targetMobs.map((name) => {
          const types = MOB_TYPES[name] || null;
          if (!types) return { name, types: null, abilityDamage: null };
          const mob = { name, types };
          return { name, types, abilityDamage: computeAbilityDamage(result, mob, loadout, playerStats, useDungeonizedStats, useMasterMode) };
        })
      : [];

  // (Base) Stats only shows Intelligence/Ability Damage in Mage Mode, and hides them otherwise —
  // the two modes describe different damage pipelines, so showing both sets at once is just noise.
  const visibleStatKeys = mageMode
    ? BASE_STAT_KEYS.filter((k) => k === 'intelligence' || k === 'ability_damage')
    : BASE_STAT_KEYS.filter((k) => k !== 'intelligence' && k !== 'ability_damage');

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <PageHeader
        title="Damage Sources"
        right={
          <button
            type="button"
            onClick={toggleMageMode}
            className={`${panel} px-4 py-2 cursor-pointer flex items-center gap-2 text-sm font-bold text-black transition-[filter] ${
              mageMode ? 'hover:brightness-110' : 'brightness-50'
            }`}
          >
            <img src="/images/manual/mage_mode.png" alt="" className="w-5 h-5" />
            <Keyworded text="Ability Damage" />
          </button>
        }
      />

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
          ) : mageMode ? (
            abilityMobResults.map(({ name, types, abilityDamage }) => (
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
                ) : !hasAbilityWeapon ? (
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
                      <span>Ability Scaling</span>
                      <span className="text-right font-mono">{abilityDamage.scaling}</span>
                      <span>Initial Damage</span>
                      <span className="text-right font-mono">{round1(abilityDamage.initialDamage)}</span>
                      <span>Additive Multiplier</span>
                      <span className="text-right font-mono">
                        +{round1(abilityDamage.additivePercent)}% (x{round4(abilityDamage.additiveMultiplier)})
                      </span>
                      <span>Multiplicative Multiplier</span>
                      <span className="text-right font-mono">{round4(abilityDamage.multiplicativeMultiplier)}x</span>
                    </div>
                    <div className="flex flex-col gap-1 border-t-2 border-neutral-500 pt-2 mt-1">
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm font-bold text-black">Final Damage (Ability)</span>
                        <span className="text-2xl font-mono font-bold text-black">{abilityDamage.finalDamage.toLocaleString()}</span>
                      </div>
                    </div>
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
                          Final Damage{finalDamageWithoutVanquished ? ' (with Vanquished)' : ''}
                        </span>
                        <span className="text-2xl font-mono font-bold text-black">
                          {finalDamage.finalDamage.toLocaleString()}
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
                      {finalDamageWithFabledMax && (
                        <div className="flex items-baseline justify-between">
                          <span className="text-xs text-neutral-700">
                            Final Damage (Fabled, up to +{FABLED_CRIT_BONUS_MAX_PERCENT}%)
                          </span>
                          <span className="text-base font-mono text-neutral-700">
                            {finalDamage.finalDamage.toLocaleString()} ~ {finalDamageWithFabledMax.finalDamage.toLocaleString()}
                          </span>
                        </div>
                      )}
                      {result.overloadBonusPercent > 0 && (
                        <div className="flex items-baseline justify-between">
                          <span className="text-xs text-neutral-700">
                            Overload Damage (Mega Crit, +{result.overloadBonusPercent}%)
                          </span>
                          <span className="text-base font-mono text-neutral-700">
                            {Math.floor(finalDamage.finalDamage * (1 + result.overloadBonusPercent / 100)).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))
          )}

          <div className="flex gap-3 items-start">
            <div className="flex-1">
              <Section
                title={`(Base) Stats${useDungeonizedStats ? (useMasterMode ? ' (Dungeonized, Master)' : ' (Dungeonized)') : ''}`}
                subtitle="Click a stat to see where it comes from."
                empty=""
              >
                {visibleStatKeys.map((key) => {
                  const sources = result.baseStatSources[key];
                  const isExpanded = expandedStat === key;
                  const displayed = !useDungeonizedStats
                    ? result.baseStats[key]
                    : useMasterMode
                      ? result.masterDungeonizedBaseStats[key]
                      : result.dungeonizedBaseStats[key];
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
                            sources.map((s) => (
                              <div key={s.label} className="flex justify-between text-[12px] text-neutral-700">
                                <span>{s.label}</span>
                                <span className="font-mono">{formatStatValue(key, Math.round(s.value * 10) / 10)}</span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </Section>
            </div>

            <div className={`${panel} p-3 flex flex-col gap-2 w-[200px] shrink-0`}>
              <div className={sectionTitle}>Misc</div>
              <div className="text-[11px] text-neutral-700 leading-snug -mt-1 mb-1">Everything else (Slayer rewards, talisman bonuses, etc).</div>
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
              <button
                type="button"
                onClick={toggleUseDungeonizedStats}
                className={`${panel} px-3 py-2 cursor-pointer flex items-center gap-2 text-[12px] font-bold text-black transition-[filter] ${
                  useDungeonizedStats ? 'hover:brightness-110' : 'brightness-50'
                }`}
              >
                <img src="/images/manual/catacombs.webp" alt="" className="w-5 h-5 shrink-0" />
                Dungeon
              </button>
              <button
                type="button"
                onClick={toggleUseMasterMode}
                disabled={!useDungeonizedStats}
                className={`${panel} px-3 py-2 flex items-center gap-2 text-[12px] font-bold text-black transition-[filter] ${
                  !useDungeonizedStats
                    ? 'opacity-40 cursor-not-allowed'
                    : useMasterMode
                      ? 'cursor-pointer hover:brightness-110'
                      : 'cursor-pointer brightness-50'
                }`}
              >
                <img src="/images/manual/master_catacombs.webp" alt="" className="w-5 h-5 shrink-0" />
                Master
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
                    +{round1(e.value)}% to <Keyworded text={e.conditionLabel || e.condition} />
                  </>
                }
                source={e.source}
                applied={appliedToAnyMob ? appliedToAnyMob.has(e.id) : undefined}
              />
            ))}
          </Section>

          <Section
            title="Weapon Damage Bonus"
            subtitle="The equipped weapon's '+X% damage' ability"
            empty="None equipped."
          >
            {[...result.weaponBonusNonConditional, ...result.weaponBonusConditional].map((e) => (
              <Row
                key={e.id}
                left={e.label}
                right={
                  e.condition ? (
                    <>
                      +{round1(e.value)}% to <Keyworded text={e.conditionLabel || e.condition} />
                    </>
                  ) : (
                    `+${round1(e.value)}%`
                  )
                }
                source={e.source}
                applied={appliedToAnyMob ? appliedToAnyMob.has(e.id) : undefined}
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
                applied={appliedToAnyMob ? appliedToAnyMob.has(e.id) : undefined}
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

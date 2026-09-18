import { useEffect, useState } from 'react';
import { useBuild } from '../context/BuildContext';
import { useItemData } from '../context/ItemDataContext';
import {
  DUNGEON_BLESSINGS,
  BLESSING_MIN_LEVEL,
  BLESSING_MAX_LEVEL,
  computeBlessingMultiplier,
  MIMIC_SHARD_MAX_LEVEL,
  FORBIDDEN_BLESSING_MAX_LEVEL,
} from '../lib/dungeonBlessing';
import { masterSkullStrengthMultiplier } from '../lib/masterSkull';
import {
  RAGNAROCK_STRENGTH_MULTIPLIER,
  SWORD_OF_BAD_HEALTH_STRENGTH,
  WEIRDER_TUBA_STATS,
  findRagnarock,
  computeRagnarockStrength,
} from '../lib/buffs';
import PageHeader from '../components/PageHeader';

const translucentPanel =
  'bg-[#c6c6c6]/75 backdrop-blur-[1px] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';
const sectionLabel = 'text-[11px] font-bold text-black uppercase tracking-wide border-b border-neutral-500/40 pb-1';

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

// Buff/Blessing — reached from the board tile of the same name, which shows in every mode.
// Item buffs (lib/buffs.js) apply everywhere; the Dungeon Blessing
// controls only appear while the Dungeon toggle is on, because blessings only exist inside a
// Catacombs run. Edits apply as you make them, like every other edit page.
export default function DungeonBlessings() {
  const {
    blessing,
    attributes,
    setPaulBuff,
    setBlessingLevel,
    useDungeonizedStats,
    buffs,
    setBuff,
    importedWeapons,
    loadout,
    playerStats,
    maxedCollectionsCount,
    essencePerks,
  } = useBuild();
  const { itemData } = useItemData();

  // The Ragnarock's own Strength decides the buff, so it's worked out from the real axe — the same
  // helper lib/damageSources.js uses, so the figure here is the one the damage number gets.
  const ragnarock = findRagnarock(importedWeapons, loadout);
  const [ragnarockStrength, setRagnarockStrength] = useState(null);
  useEffect(() => {
    if (!ragnarock || !itemData) {
      setRagnarockStrength(null);
      return undefined;
    }
    let cancelled = false;
    computeRagnarockStrength(ragnarock, loadout, itemData, playerStats, maxedCollectionsCount, essencePerks).then((strength) => {
      if (!cancelled) setRagnarockStrength(strength);
    });
    return () => {
      cancelled = true;
    };
  }, [ragnarock, loadout, itemData, playerStats, maxedCollectionsCount, essencePerks]);
  const ragnarockHasChimera = ragnarock?.modifiers?.ultimateEnchantment?.id?.toLowerCase() === 'ultimate_chimera';

  const buffRows = [
    {
      id: 'ragnarock',
      label: 'Ragnarock',
      disabled: !ragnarock,
      detail: !ragnarock
        ? 'No Ragnarock in your last import'
        : ragnarockStrength == null
          ? 'Working out your axe’s Strength…'
          : `+${round1(ragnarockStrength * RAGNAROCK_STRENGTH_MULTIPLIER)} Strength (${RAGNAROCK_STRENGTH_MULTIPLIER}x your axe’s ${round1(ragnarockStrength)}${ragnarockHasChimera ? ', Chimera included' : ''})`,
    },
    { id: 'swordOfBadHealth', label: 'Sword of Bad Health', detail: `+${SWORD_OF_BAD_HEALTH_STRENGTH} Strength` },
    {
      id: 'weirderTuba',
      label: 'Weirder Tuba',
      detail: `+${WEIRDER_TUBA_STATS.strength} Strength, +${WEIRDER_TUBA_STATS.crit_damage} Crit Damage, +${WEIRDER_TUBA_STATS.bonus_attack_speed} Bonus Attack Speed`,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center p-4 relative">
      <PageHeader title="Buff/Blessing" />

      <div className={`${translucentPanel} w-full max-w-[500px] p-6 flex flex-col gap-4`}>
        <div className={sectionLabel}>Buffs</div>
        {buffRows.map((b) => (
          <label
            key={b.id}
            className={`flex items-start gap-2 text-sm text-black ${b.disabled ? 'opacity-60' : 'cursor-pointer'}`}
            htmlFor={`buff-${b.id}`}
          >
            <input
              id={`buff-${b.id}`}
              type="checkbox"
              checked={!!buffs?.[b.id] && !b.disabled}
              disabled={b.disabled}
              onChange={(e) => setBuff(b.id, e.target.checked)}
              className="w-4 h-4 mt-0.5 shrink-0"
            />
            <span className="flex flex-col">
              <span>{b.label}</span>
              <span className="text-[12px] text-neutral-600">{b.detail}</span>
            </span>
          </label>
        ))}

        <div className={`${sectionLabel} mt-2`}>Dungeon Blessings</div>
        {!useDungeonizedStats ? (
          <div className="text-[12px] text-neutral-600 italic">Turn on the Dungeon toggle to set Dungeon Blessings.</div>
        ) : (
          <>
            <label className="flex items-center gap-2 text-sm text-black" htmlFor="paul-buff">
              <input
                id="paul-buff"
                type="checkbox"
                checked={!!blessing.paulBuff}
                onChange={(e) => setPaulBuff(e.target.checked)}
                className="w-4 h-4 shrink-0"
              />
              <span>Paul Buff</span>
            </label>

            {/* Read-only: both come from the account on import (Mimic Shard level, Forbidden Blessing
                perk), editable on the Player Levels page — not typed here. */}
            <div className="flex flex-col gap-1 text-[12px] text-neutral-700 leading-snug">
              <div>
                Effectiveness x{round2(computeBlessingMultiplier(blessing, attributes))}
                <span className="italic">
                  {' '}
                  (Mimic {attributes.mimic || 0}/{MIMIC_SHARD_MAX_LEVEL} &middot; Forbidden {blessing.forbiddenBlessingLevel}/
                  {FORBIDDEN_BLESSING_MAX_LEVEL})
                </span>
              </div>
              <div>
                Master Skull x{masterSkullStrengthMultiplier(blessing.masterSkullTier)}
                <span className="italic"> (Tier {blessing.masterSkullTier || '—'}, Strength only)</span>
              </div>
            </div>

            {DUNGEON_BLESSINGS.map((b) => (
              <label key={b.id} className="flex flex-col gap-1 text-sm text-black" htmlFor={`blessing-${b.id}`}>
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
      </div>
    </div>
  );
}

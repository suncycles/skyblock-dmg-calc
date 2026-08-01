import { useMemo, useState } from 'react';
import { useBuild } from '../context/BuildContext';
import { useTooltip } from '../context/TooltipContext';
import { MOB_TYPES } from '../lib/mobTypes';
import { getMobIconDataUri, getMobModelIcon } from '../lib/mobIcons';
import PageHeader from '../components/PageHeader';
import PageBackground from '../components/PageBackground';

const ALL_MOB_NAMES = Object.keys(MOB_TYPES).sort((a, b) => a.localeCompare(b));

// Picking the mob(s) Final Damage is computed against. Each tile shows a spawn-egg icon for the
// mob's classified vanilla entity (no real head/skin data exists for named mobs). Click toggles a
// mob in/out of the multi-select target list.
export default function TargetMobPicker() {
  const { targetMobs, toggleTargetMob } = useBuild();
  const { showTooltip, hideTooltip } = useTooltip();
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_MOB_NAMES;
    return ALL_MOB_NAMES.filter((name) => name.toLowerCase().includes(q));
  }, [query]);

  function handleHover(name, e) {
    const types = MOB_TYPES[name] || [];
    showTooltip([`§d§l${name}`, `§7Types: §f${types.join(', ')}`], e.currentTarget);
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-4 relative">
      <PageBackground />
      <PageHeader title="SkyDmg — Target Mobs" />

      <div className="w-full max-w-[700px] flex flex-col gap-2.5">
        <div className="text-xs text-neutral-300">
          Click a mob to add/remove it from your targets. Final Damage is computed against every selected mob.
          {targetMobs.length > 0 && <span className="text-neutral-100"> ({targetMobs.length} selected)</span>}
        </div>
        <input
          type="text"
          placeholder="Search mobs..."
          autoComplete="off"
          autoFocus
          className="w-full text-sm px-2.5 py-2 bg-neutral-900 text-neutral-100 border border-neutral-600 outline-none focus:border-neutral-400"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {visible.length === 0 ? (
          <div className="text-sm text-neutral-300 italic">No mobs match "{query}".</div>
        ) : (
          <div className="grid grid-cols-6 gap-1.5">
            {visible.map((name) => {
              const selected = targetMobs.includes(name);
              return (
                <div
                  key={name}
                  className={`relative flex flex-col items-center gap-1 aspect-[3/4] border p-1.5 cursor-pointer overflow-hidden backdrop-blur-[1px] ${
                    selected
                      ? 'bg-green-400/60 border-green-700 hover:bg-green-300/70'
                      : 'bg-neutral-500/50 border-neutral-700 hover:bg-neutral-400/60'
                  }`}
                  onClick={() => toggleTargetMob(name)}
                  onMouseEnter={(e) => handleHover(name, e)}
                  onMouseLeave={hideTooltip}
                >
                  <div className="flex-1 w-full min-h-0 flex items-center justify-center">
                    <img
                      src={getMobModelIcon(name) || getMobIconDataUri(name)}
                      alt={name}
                      className="max-w-full max-h-full object-contain pixelated"
                    />
                  </div>
                  <div className="w-full shrink-0 text-center text-[9px] leading-tight truncate text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                    {name}
                  </div>
                  {selected && (
                    <span className="absolute top-0.5 right-0.5 text-[10px] leading-none text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                      ✓
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

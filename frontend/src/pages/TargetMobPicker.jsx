import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useTooltip } from '../context/TooltipContext';
import { MOB_TYPES } from '../lib/mobTypes';
import { getMobIconDataUri } from '../lib/mobIcons';
import { SLOT_TEXTURES } from '../lib/icons';

const ALL_MOB_NAMES = Object.keys(MOB_TYPES).sort((a, b) => a.localeCompare(b));

// Picking the mob(s) lib/finalDamage.js computes Final Damage against — a
// chest-GUI-style grid, matching every other picker in the app, rather
// than the flat search list this used to be. Mobs have no unique head/
// skin asset anywhere in this app's data (NEU-REPO only covers items),
// so each tile shows a Minecraft-style "spawn egg" icon for the mob's
// classified underlying vanilla entity instead (see lib/mobIcons.js) —
// approximate, not exact art, but far more scannable than plain text
// across 211 entries. Click toggles a mob in/out of the multi-select
// target list (BuildContext's targetMobs) rather than picking one and
// navigating away.
export default function TargetMobPicker() {
  const navigate = useNavigate();
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
    <div className="min-h-screen flex flex-col items-center p-4">
      <header className="w-full max-w-[700px] mb-4 flex items-center gap-3">
        <button
          className="text-sm px-3 py-1.5 cursor-pointer bg-neutral-800 text-white hover:brightness-110"
          onClick={() => navigate('/')}
        >
          <img src={SLOT_TEXTURES.close} alt="" className="w-4 h-4 inline-block mr-1 align-[-2px]" />
          Back
        </button>
        <h1 className="text-xl font-bold">The Hex — Target Mobs</h1>
      </header>

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
          <div className="grid grid-cols-8 gap-1.5">
            {visible.map((name) => {
              const selected = targetMobs.includes(name);
              return (
                <div
                  key={name}
                  className={`relative flex flex-col items-center justify-center gap-1 aspect-square border p-1.5 cursor-pointer overflow-hidden ${
                    selected
                      ? 'bg-green-400 border-green-700 hover:bg-green-300'
                      : 'bg-neutral-500 border-neutral-700 hover:bg-neutral-400'
                  }`}
                  onClick={() => toggleTargetMob(name)}
                  onMouseEnter={(e) => handleHover(name, e)}
                  onMouseLeave={hideTooltip}
                >
                  <img src={getMobIconDataUri(name)} alt={name} className="w-[60%] h-[60%] object-contain pixelated" />
                  <div className="w-full text-center text-[9px] leading-tight truncate text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
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

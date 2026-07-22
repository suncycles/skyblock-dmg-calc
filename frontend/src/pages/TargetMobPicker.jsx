import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { MOB_TYPES } from '../lib/mobTypes';
import { MOB_TYPE_SYMBOLS } from '../lib/damageSymbols';
import { SLOT_TEXTURES } from '../lib/icons';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

const ALL_MOB_NAMES = Object.keys(MOB_TYPES).sort((a, b) => a.localeCompare(b));

function TypePills({ types }) {
  return (
    <div className="flex flex-wrap gap-1">
      {types.map((t) => {
        const meta = MOB_TYPE_SYMBOLS[t];
        return (
          <span key={t} className="text-[11px] font-mono" style={{ color: meta.color }}>
            {meta.symbol} {t}
          </span>
        );
      })}
    </div>
  );
}

// Picking the mob lib/finalDamage.js computes Final Damage against — a
// plain search-and-scroll list rather than the chest-GUI grid other
// pickers use, since mobs have no icon assets (see lib/mobTypes.js's
// MOB_TYPES, scraped from the wiki's Mob Types/List page) and a flat list
// with each mob's type pills visible is more scannable for 211 entries
// than a paginated grid would be.
export default function TargetMobPicker() {
  const navigate = useNavigate();
  const { setTargetMob } = useBuild();
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_MOB_NAMES;
    return ALL_MOB_NAMES.filter((name) => name.toLowerCase().includes(q));
  }, [query]);

  function handleSelect(name) {
    setTargetMob(name);
    navigate('/');
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
        <h1 className="text-xl font-bold">The Hex — Target Mob</h1>
      </header>

      <div className="w-full max-w-[700px] flex flex-col gap-2.5">
        <input
          type="text"
          placeholder="Search mobs..."
          autoComplete="off"
          autoFocus
          className="w-full text-sm px-2.5 py-2 bg-neutral-900 text-neutral-100 border border-neutral-600 outline-none focus:border-neutral-400"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className={`${panel} max-h-[60vh] overflow-y-auto`}>
          {visible.length === 0 ? (
            <div className="p-3 text-sm text-black italic">No mobs match "{query}".</div>
          ) : (
            visible.map((name) => (
              <div
                key={name}
                className="flex items-center justify-between gap-3 px-3 py-1.5 border-b border-neutral-500 last:border-b-0 cursor-pointer hover:bg-neutral-300"
                onClick={() => handleSelect(name)}
              >
                <span className="text-sm font-bold text-black whitespace-nowrap">{name}</span>
                <TypePills types={MOB_TYPES[name]} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

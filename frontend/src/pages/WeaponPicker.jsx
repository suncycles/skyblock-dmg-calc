import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useItemData } from '../context/ItemDataContext';
import { useBuild } from '../context/BuildContext';
import WeaponIcon from '../components/WeaponIcon';
import { formatItemName } from '../lib/mcText';

// Starred (max-reforge-stat) items carry a leading Hypixel custom-font glyph
// before the name (e.g. " Daedalus Blade" for the starred variant of
// "Daedalus Blade") — strip any such leading non-alphanumeric run so search
// still matches on the real first letter of the name.
function stripLeadingSymbol(name) {
  return name.replace(/^[^A-Za-z0-9]+/, '');
}

export default function WeaponPicker() {
  const { itemData, loading, error } = useItemData();
  const { selectWeapon } = useBuild();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return itemData.weapons
      .filter((w) => w.name && stripLeadingSymbol(w.name).toLowerCase().startsWith(q))
      .slice(0, 8);
  }, [query, itemData.weapons]);

  function handleSelect(weapon) {
    selectWeapon(weapon);
    navigate('/hex');
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <header className="w-full max-w-[700px] mb-4">
        <h1 className="text-xl font-bold">The Hex</h1>
      </header>

      <div className="w-full max-w-[700px]">
        <div className="relative mb-2.5">
          <input
            type="text"
            placeholder="Search weapons..."
            autoComplete="off"
            className="w-full text-sm px-2.5 py-2 bg-neutral-900 text-neutral-100 border border-neutral-600 outline-none focus:border-neutral-400"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setDropdownOpen(true);
            }}
            onFocus={() => setDropdownOpen(true)}
            onBlur={() => setDropdownOpen(false)}
          />
          {dropdownOpen && query.trim() && (
            <div className="absolute top-full left-0 right-0 z-10 max-h-64 overflow-y-auto bg-neutral-900 border border-neutral-600 border-t-0">
              {matches.length === 0 ? (
                <div className="px-2.5 py-1.5 text-sm text-neutral-400">No matching weapons.</div>
              ) : (
                matches.map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 text-sm cursor-pointer hover:bg-neutral-700"
                    onMouseDown={() => handleSelect(w)}
                  >
                    <WeaponIcon id={w.id} material={w.material} alt={w.name} className="w-5 h-5 object-contain pixelated" />
                    <span>{formatItemName(w.name)}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-center">Loading weapons from API...</div>
        ) : error ? (
          <div className="text-center text-red-400">
            Failed to load weapons. <br />
            <small>{error}</small>
          </div>
        ) : itemData.weapons.length === 0 ? (
          <div className="text-center">No weapons found.</div>
        ) : (
          <div className="grid grid-cols-8 gap-1.5">
            {itemData.weapons.map((w) => (
              <div
                key={w.id}
                className="flex flex-col items-center justify-center gap-1 aspect-square bg-neutral-500 border border-neutral-700 p-1.5 cursor-pointer hover:bg-neutral-400 overflow-hidden"
                onClick={() => handleSelect(w)}
              >
                <WeaponIcon id={w.id} material={w.material} alt={w.name} className="w-[60%] h-[60%] object-contain pixelated" />
                <div className="w-full text-center text-[10px] truncate">{formatItemName(w.name)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

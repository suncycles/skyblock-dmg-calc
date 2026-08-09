import { useMemo, useState } from 'react';
import WeaponIcon from '../components/WeaponIcon';
import PageHeader from '../components/PageHeader';
import { formatItemName } from '../lib/mcText';

// Strips a starred item's leading Hypixel custom-font glyph so search still matches on the real first letter.
function stripLeadingSymbol(name) {
  return name.replace(/^[^A-Za-z0-9]+/, '');
}

// Same bordered chest-GUI look used everywhere else (panels, back buttons) — reused here so
// these pickers pick up the same theme overrides instead of a plain generic grey palette.
const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';
const slotBase =
  'flex flex-col items-center justify-center gap-1 bg-[#8b8b8b]/80 shadow-[inset_2px_2px_0_0_#373737,inset_-2px_-2px_0_0_#ffffff]';
// Fewer columns on narrow screens — at a fixed 8 columns, cells (and their name labels) shrink
// to illegible slivers on phone-width viewports. Widens back to 8 once there's room for it.
const gridPanel =
  'grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5 bg-[#c6c6c6]/60 backdrop-blur-[1px] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black p-1.5';
// Loading skeleton: same slot grid as the real results, just pulsing and empty, so the layout
// doesn't jump once items arrive — a placeholder shape instead of a plain "Loading..." line.
const SKELETON_SLOT_COUNT = 32;

// Generic search-box-plus-full-grid item picker, shared by weapon/armor pickers. Knows nothing about BuildContext or routing.
export default function ItemPicker({ items, title, placeholder, loading, error, onSelect, onBack }) {
  const [query, setQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items.filter((w) => w.name && stripLeadingSymbol(w.name).toLowerCase().includes(q)).slice(0, 8);
  }, [query, items]);

  return (
    <div className="min-h-screen flex flex-col items-center p-4 relative">
      <PageHeader title={title} onBack={onBack} />

      <div className="w-full max-w-[700px]">
        <div className="relative mb-2.5">
          <input
            type="text"
            placeholder={placeholder}
            autoComplete="off"
            className={`${panel} w-full text-sm px-3 py-2 !border-0 text-black placeholder-black/50 outline-none`}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setDropdownOpen(true);
            }}
            onFocus={() => setDropdownOpen(true)}
            onBlur={() => setDropdownOpen(false)}
          />
          {dropdownOpen && query.trim() && (
            <div className={`${panel} search-dropdown absolute top-full left-0 right-0 z-10 max-h-64 overflow-y-auto !border-t-0`}>
              {matches.length === 0 ? (
                <div className="px-2.5 py-1.5 text-sm text-black/70">No matching items.</div>
              ) : (
                matches.map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 text-sm text-black cursor-pointer hover:brightness-110"
                    onMouseDown={() => onSelect(w)}
                  >
                    <WeaponIcon
                      id={w.id}
                      material={w.material}
                      alt={w.name}
                      className="w-5 h-5 object-contain pixelated"
                      color={w.color}
                    />
                    <span>{formatItemName(w.name)}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className={gridPanel}>
            {Array.from({ length: SKELETON_SLOT_COUNT }).map((_, i) => (
              <div key={i} className={`${slotBase} aspect-square animate-pulse`} />
            ))}
          </div>
        ) : error ? (
          <div className={`${panel} p-6 flex flex-col items-center gap-1.5 text-center`}>
            <span className="text-2xl">⚠️</span>
            <div className="text-sm font-bold text-black">Failed to load items</div>
            <div className="text-xs text-black/70">{error}</div>
          </div>
        ) : items.length === 0 ? (
          <div className={`${panel} p-6 flex flex-col items-center gap-1.5 text-center`}>
            <span className="text-2xl">🔍</span>
            <div className="text-sm font-bold text-black">No items found</div>
          </div>
        ) : (
          <div className={gridPanel}>
            {items.map((w) => (
              <div
                key={w.id}
                className={`${slotBase} aspect-square p-1.5 cursor-pointer hover:brightness-110 overflow-hidden`}
                onClick={() => onSelect(w)}
              >
                <WeaponIcon
                  id={w.id}
                  material={w.material}
                  alt={w.name}
                  className="w-[60%] h-[60%] object-contain pixelated"
                  color={w.color}
                />
                <div className="w-full text-center text-[10px] text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] truncate">
                  {formatItemName(w.name)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

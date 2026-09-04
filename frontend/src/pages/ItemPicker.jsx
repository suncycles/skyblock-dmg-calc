import { useMemo, useState } from 'react';
import WeaponIcon from '../components/WeaponIcon';
import PageHeader from '../components/PageHeader';
import { useTooltip } from '../context/TooltipContext';
import { formatItemName, rarityColorCode, MC_COLORS } from '../lib/mcText';

// Strips a starred item's leading Hypixel custom-font glyph so search still matches on the real first letter.
function stripLeadingSymbol(name) {
  return name.replace(/^[^A-Za-z0-9]+/, '');
}

// NEU-REPO categories are SHOUTED ("DUNGEON SWORD") — title-cased for the filter chips only.
function formatCategory(category) {
  return category.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
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
// Above this many distinct categories the chip row is more noise than filter (and the catalog
// almost certainly isn't category-shaped for that picker) — pets/pet items have none at all.
const MAX_CATEGORY_CHIPS = 10;

// Same toggleable pill as TargetMobPicker's location chips, reused so both pickers filter the
// same way.
function CategoryChip({ label, count, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[11px] px-2 py-1 rounded cursor-pointer border transition-colors whitespace-nowrap ${
        active
          ? 'bg-green-400 text-black border-green-700 font-semibold'
          : 'bg-black/30 text-neutral-200 border-neutral-600 hover:bg-black/50 hover:text-white'
      }`}
    >
      {label} <span className="opacity-60">{count}</span>
    </button>
  );
}

// Generic search-box-plus-full-grid item picker, shared by weapon/armor/equipment/pet pickers.
// Knows nothing about BuildContext or routing. Search and the category chips both filter the
// grid itself (an earlier version filtered only an 8-row dropdown, leaving all 206 weapons
// sitting behind it), and every tile shows the item's own pristine catalog tooltip on hover —
// choosing between four same-prefix items whose names all truncate to "Aspect of th…" was
// otherwise guesswork.
export default function ItemPicker({ items, title, placeholder, loading, error, onSelect, onBack }) {
  const [query, setQuery] = useState('');
  const [activeCategories, setActiveCategories] = useState(() => new Set());
  const { showTooltip, hideTooltip, handleTapOrActivate, guardHover } = useTooltip();

  // Derived from whatever catalog this picker was handed, so no caller needs to configure it.
  const categories = useMemo(() => {
    const counts = new Map();
    for (const item of items) {
      if (!item.category) continue;
      counts.set(item.category, (counts.get(item.category) || 0) + 1);
    }
    if (counts.size < 2 || counts.size > MAX_CATEGORY_CHIPS) return [];
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q && activeCategories.size === 0) return items;
    return items.filter((item) => {
      if (q && !(item.name && stripLeadingSymbol(item.name).toLowerCase().includes(q))) return false;
      if (activeCategories.size > 0 && !activeCategories.has(item.category)) return false;
      return true;
    });
  }, [items, query, activeCategories]);

  function toggleCategory(category) {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  // The item's own bundled catalog lore — the pristine, unmodified stats, which is exactly what
  // you want while choosing. (An equipped item's full modifier-aware tooltip lives on Landing/Hex.)
  function handleHover(item, e) {
    showTooltip([`§${rarityColorCode(item.tier)}§l${formatItemName(item.name)}`, ...(item.lore || [])], e.currentTarget);
  }

  const hasFilters = query.trim().length > 0 || activeCategories.size > 0;

  return (
    <div className="min-h-screen flex flex-col items-center p-4 relative">
      <PageHeader title={title} onBack={onBack} />

      <div className="w-full max-w-[700px] flex flex-col gap-2">
        <input
          type="text"
          placeholder={placeholder}
          autoComplete="off"
          className={`${panel} w-full text-sm px-3 py-2 !border-0 text-black placeholder-black/50 outline-none`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {categories.map(([category, count]) => (
              <CategoryChip
                key={category}
                label={formatCategory(category)}
                count={count}
                active={activeCategories.has(category)}
                onClick={() => toggleCategory(category)}
              />
            ))}
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="flex items-center justify-between text-xs text-neutral-300">
            <span>
              {visible.length} of {items.length} shown
            </span>
            {hasFilters && (
              <button
                type="button"
                className="text-[11px] px-2 py-0.5 rounded border border-neutral-600 bg-black/30 hover:bg-black/50 hover:text-white cursor-pointer"
                onClick={() => {
                  setQuery('');
                  setActiveCategories(new Set());
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        )}

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
        ) : visible.length === 0 ? (
          <div className={`${panel} p-6 flex flex-col items-center gap-1.5 text-center`}>
            <span className="text-2xl">🔍</span>
            <div className="text-sm font-bold text-black">No items found</div>
            {hasFilters && <div className="text-xs text-black/70">Try clearing the search or category filters.</div>}
          </div>
        ) : (
          <div className={gridPanel}>
            {visible.map((w) => (
              <div
                key={w.id}
                className={`${slotBase} aspect-square p-1.5 cursor-pointer hover:brightness-110 overflow-hidden`}
                onClick={handleTapOrActivate(w.id, (e) => handleHover(w, e), () => onSelect(w))}
                onMouseEnter={guardHover((e) => handleHover(w, e))}
                onMouseLeave={guardHover(hideTooltip)}
              >
                <WeaponIcon
                  id={w.id}
                  material={w.material}
                  alt={w.name}
                  className="w-[60%] h-[60%] object-contain pixelated"
                  color={w.color}
                />
                <div
                  className="w-full text-center text-[10px] drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] truncate"
                  style={{ color: MC_COLORS[rarityColorCode(w.tier)] || '#ffffff' }}
                >
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

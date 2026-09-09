import { useMemo, useState } from 'react';
import { useBuild } from '../context/BuildContext';
import { useTooltip } from '../context/TooltipContext';
import { MOB_TYPES, ALL_MOB_TYPES, MOB_TYPE_COUNTS } from '../lib/mobTypes';
import { MOB_LOCATIONS, ALL_LOCATIONS, LOCATION_COUNTS } from '../lib/mobLocations';
import { MOB_TYPE_SYMBOLS } from '../lib/damageSymbols';
import { getMobIconDataUri, getMobModelIcon } from '../lib/mobIcons';
import PageHeader from '../components/PageHeader';

const ALL_MOB_NAMES = Object.keys(MOB_TYPES).sort((a, b) => a.localeCompare(b));

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

// Toggleable filter pill — same shape as ThemeSwitcher's theme buttons, shared by both the
// location and type filter rows. `symbol` is the type's own Bestiary glyph (mob types have one,
// locations don't), rendered in its real color so the chips read the same way the type does
// everywhere else in the app — the tooltip, the Damage Sources breakdown, the tile badges.
function FilterChip({ label, count, active, symbol, onClick }) {
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
      {symbol && (
        <span style={{ color: active ? undefined : symbol.color }} className="mr-0.5">
          {symbol.symbol}
        </span>
      )}
      {label} <span className="opacity-60">{count}</span>
    </button>
  );
}

// One collapsible row of filter chips. Both rows collapse independently: 22 locations and 24
// types expanded at once would push the search box and the whole mob grid below the fold.
function FilterSection({ title, expanded, onToggle, activeCount, children }) {
  return (
    <>
      <button
        type="button"
        className="flex items-center gap-1.5 text-[11px] font-bold text-black uppercase tracking-wide cursor-pointer"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="text-[9px]">{expanded ? '▾' : '▸'}</span>
        {title}
        {activeCount > 0 && <span className="normal-case font-normal text-black/60">({activeCount})</span>}
      </button>
      {expanded && <div className="flex flex-wrap gap-1.5">{children}</div>}
    </>
  );
}

// Picking the mob(s) Final Damage is computed against. A location filter panel (same source
// data/grouping as docs/mob-types-reference.html's Bestiary-location chips) sits above the
// search box so narrowing by zone happens before typing a name — clicking chips retroactively
// filters the grid below, same click-to-toggle interaction as the reference page's filters, just
// with mob icons instead of table rows. Each tile shows a spawn-egg icon for the mob's classified
// vanilla entity when no real head/skin render exists. Click toggles a mob in/out of the
// multi-select target list.
export default function TargetMobPicker() {
  const { targetMobs, toggleTargetMob } = useBuild();
  const { showTooltip, hideTooltip, handleTapOrActivate, guardHover } = useTooltip();
  const [query, setQuery] = useState('');
  const [activeLocations, setActiveLocations] = useState(() => new Set());
  const [activeTypes, setActiveTypes] = useState(() => new Set());
  // Both collapsed by default — expanded, the 22 location and 24 type chips push the search box
  // and mob grid well below the fold on mobile. Active filters still show as a count on the
  // collapsed header, so a narrowed grid is never unexplained.
  const [locationsExpanded, setLocationsExpanded] = useState(false);
  const [typesExpanded, setTypesExpanded] = useState(false);

  const toggleIn = (setter) => (value) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  const toggleLocation = toggleIn(setActiveLocations);
  const toggleType = toggleIn(setActiveTypes);

  function clearFilters() {
    setActiveLocations(new Set());
    setActiveTypes(new Set());
    setQuery('');
  }

  // Within one filter group the chips are OR'd (a mob in ANY selected location/type qualifies);
  // across groups they're AND'd, so "Catacombs" + "Undead" narrows to undead mobs in the
  // Catacombs rather than widening to everything matching either.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ALL_MOB_NAMES.filter((name) => {
      if (q && !name.toLowerCase().includes(q)) return false;
      if (activeLocations.size > 0) {
        const locs = MOB_LOCATIONS[name] || [];
        if (!locs.some((loc) => activeLocations.has(loc))) return false;
      }
      if (activeTypes.size > 0) {
        const types = MOB_TYPES[name] || [];
        if (!types.some((type) => activeTypes.has(type))) return false;
      }
      return true;
    });
  }, [query, activeLocations, activeTypes]);

  function handleHover(name, e) {
    const types = MOB_TYPES[name] || [];
    const locations = MOB_LOCATIONS[name] || [];
    const lines = [`§d§l${name}`, `§7Types: §f${types.join(', ') || 'Undocumented'}`];
    lines.push(`§7Location: §f${locations.join(', ') || 'Unknown'}`);
    showTooltip(lines, e.currentTarget);
  }

  const hasFilters = activeLocations.size > 0 || activeTypes.size > 0 || query.length > 0;

  return (
    <div className="min-h-screen flex flex-col items-center p-4 relative">
      <PageHeader title="Target Mobs" backLabel="Confirm" />

      <div className="w-full max-w-[700px] flex flex-col gap-2.5">
        <div className="text-xs text-neutral-300">
          Click a mob to add/remove it from your targets. Final Damage is computed against every selected mob.
          {targetMobs.length > 0 && <span className="text-neutral-100"> ({targetMobs.length} selected)</span>}
        </div>

        <div className={`${panel} p-2.5 flex flex-col gap-2`}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-2 min-w-0">
              <FilterSection
                title="Filter by Location"
                expanded={locationsExpanded}
                onToggle={() => setLocationsExpanded((v) => !v)}
                activeCount={activeLocations.size}
              >
                {ALL_LOCATIONS.map((loc) => (
                  <FilterChip
                    key={loc}
                    label={loc}
                    count={LOCATION_COUNTS[loc]}
                    active={activeLocations.has(loc)}
                    onClick={() => toggleLocation(loc)}
                  />
                ))}
              </FilterSection>
              <FilterSection
                title="Filter by Type"
                expanded={typesExpanded}
                onToggle={() => setTypesExpanded((v) => !v)}
                activeCount={activeTypes.size}
              >
                {ALL_MOB_TYPES.map((type) => (
                  <FilterChip
                    key={type}
                    label={type}
                    count={MOB_TYPE_COUNTS[type]}
                    symbol={MOB_TYPE_SYMBOLS[type]}
                    active={activeTypes.has(type)}
                    onClick={() => toggleType(type)}
                  />
                ))}
              </FilterSection>
            </div>
            {hasFilters && (
              <button
                type="button"
                className="text-[11px] underline text-black cursor-pointer whitespace-nowrap shrink-0"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            )}
          </div>
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
        <div className="text-[11px] text-neutral-400">
          {visible.length} of {ALL_MOB_NAMES.length} mobs shown
        </div>

        {visible.length === 0 ? (
          <div className="text-sm text-neutral-300 italic">No mobs match the current filters.</div>
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
                  onClick={handleTapOrActivate(name, (e) => handleHover(name, e), () => toggleTargetMob(name))}
                  onMouseEnter={guardHover((e) => handleHover(name, e))}
                  onMouseLeave={guardHover(hideTooltip)}
                >
                  {MOB_TYPES[name]?.includes('Boss') && (
                    <span
                      className="absolute top-0.5 left-0.5 text-[10px] leading-none text-red-500 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]"
                      title="Boss"
                    >
                      ☠
                    </span>
                  )}
                  <div className="flex-1 w-full min-h-0 flex items-center justify-center">
                    <img
                      src={getMobModelIcon(name) || getMobIconDataUri(name)}
                      alt={name}
                      loading="lazy"
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

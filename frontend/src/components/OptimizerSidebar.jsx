import { useEffect, useRef, useState } from 'react';
import { useBuild } from '../context/BuildContext';
import { useItemData } from '../context/ItemDataContext';
import {
  runOptimizer,
  applyOptimizerResult,
  OPTIMIZER_MODES,
  OPTIMIZER_GEAR_SLOTS,
  hasCuratedData,
  loadOptimizerMode,
  saveOptimizerMode,
} from '../lib/optimizer';
import { buildAccessoryCandidates, buildGenericMpCandidates, evaluateAccessoryCandidates } from '../lib/accessoryOptimizer';
import { ARMOR_SLOT_LABELS } from '../lib/armorSlots';
import { EQUIPMENT_SLOT_LABELS } from '../lib/equipmentSlots';
import { MOB_TYPES } from '../lib/mobTypes';
import { round1, formatCoinsPerPercent, formatCoinsShort } from '../lib/damageFormat';
import { getItemCornerBadge } from '../lib/itemCornerBadge';
import { ENCHANTED_BOOK_ICON, getGemstoneIcon } from '../lib/icons';
import NumberInput from './NumberInput';
import WeaponIcon from './WeaponIcon';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';
const sectionTitle = 'text-[12px] font-bold text-black uppercase tracking-wide pb-1 mb-0.5 border-b border-neutral-500/40';

// Desktop-only floating panel: matches the `lg` breakpoint this component already switches to
// `position: fixed` at (see the outer div's className) — dragging/resizing below that width would
// fight the in-flow mobile layout, so both are no-ops there.
const DESKTOP_BREAKPOINT_PX = 1024;
const POSITION_KEY = 'hexOptimizerSidebarPos';
const SIZE_KEY = 'hexOptimizerSidebarSize';
// How much of the panel must stay on-screen at minimum — keeps a corner always reachable to drag
// back even if a saved position/viewport combination would otherwise push it fully off-screen.
const MIN_VISIBLE_PX = 40;
// Matches the lg:min-w-[220px]/lg:min-h-[200px] classes on the container — kept as JS constants
// too since the resize handles below need to clamp against them mid-gesture, not just via CSS.
const MIN_WIDTH_PX = 220;
const MIN_HEIGHT_PX = 200;
// Gap kept between the panel and the exact viewport edge when dragging/resizing against it.
const EDGE_MARGIN_PX = 8;

// Keeps the panel's full box (given its real current width/height) on-screen within `viewport` —
// used both live during a drag and to re-clamp a stored/previous position after the window itself
// shrinks (e.g. the user resizes their browser, or a position saved on a bigger monitor loads on a
// smaller one).
function clampPosition(left, top, width, height, viewport) {
  const maxLeft = Math.max(0, viewport.width - Math.max(MIN_VISIBLE_PX, width));
  const maxTop = Math.max(0, viewport.height - Math.max(MIN_VISIBLE_PX, height));
  return { left: Math.min(Math.max(0, left), maxLeft), top: Math.min(Math.max(0, top), maxTop) };
}

// index.css applies a site-wide `zoom: 1.15` to <html> — mouse coordinates (clientX/clientY),
// getBoundingClientRect(), and window.innerWidth/innerHeight all report the POST-zoom rendered
// pixel space, while el.offsetLeft/offsetWidth and anything written to el.style.left/width are
// interpreted in the PRE-zoom CSS px space. Every drag/resize handler below does its math in the
// pre-zoom space (matching offsetLeft/offsetWidth/style writes), so any zoomed-space input has to
// be divided by this factor first — otherwise the panel visibly jumps by ~15% the moment a drag or
// resize starts.
function getPageZoom() {
  const z = parseFloat(getComputedStyle(document.documentElement).zoom);
  return z > 0 ? z : 1;
}

// Resize handles, one per edge + corner (8 total) — each drags one or two of the box's 4 edges,
// with the OPPOSITE edge staying anchored in place (the standard "resize from any side" behavior:
// e.g. dragging the left edge rightward shrinks the box by moving its left edge in, while its
// right edge doesn't move). Horizontal and vertical are independent, so a corner handle's effect
// is just its two edges' effects combined — see the `dir.includes(...)` checks below.
const RESIZE_HANDLES = [
  { dir: 'n', className: 'lg:absolute lg:top-0 lg:left-2 lg:right-2 lg:h-1.5 lg:cursor-ns-resize' },
  { dir: 's', className: 'lg:absolute lg:bottom-0 lg:left-2 lg:right-2 lg:h-1.5 lg:cursor-ns-resize' },
  { dir: 'w', className: 'lg:absolute lg:left-0 lg:top-2 lg:bottom-2 lg:w-1.5 lg:cursor-ew-resize' },
  { dir: 'e', className: 'lg:absolute lg:right-0 lg:top-2 lg:bottom-2 lg:w-1.5 lg:cursor-ew-resize' },
  { dir: 'nw', className: 'lg:absolute lg:top-0 lg:left-0 lg:w-3 lg:h-3 lg:cursor-nwse-resize' },
  { dir: 'ne', className: 'lg:absolute lg:top-0 lg:right-0 lg:w-3 lg:h-3 lg:cursor-nesw-resize' },
  { dir: 'sw', className: 'lg:absolute lg:bottom-0 lg:left-0 lg:w-3 lg:h-3 lg:cursor-nesw-resize' },
  { dir: 'se', className: 'lg:absolute lg:bottom-0 lg:right-0 lg:w-4 lg:h-4 lg:cursor-nwse-resize' },
];

// All 8 handles were invisible 1.5-3px strips whose only cue was a cursor change on hover, so
// nothing about the panel looked resizable until you happened to graze an edge. Every handle now
// lights up on hover, and the bottom-right corner carries a permanently visible gripper — the same
// three diagonal ticks a native <textarea> uses, which reads as "drag to resize" without a label.
const HANDLE_HOVER = 'lg:transition-colors lg:hover:bg-black/25';
const CORNER_GRIP_STYLE = {
  backgroundImage:
    'linear-gradient(135deg, transparent 0 45%, rgba(0,0,0,0.5) 45% 55%, transparent 55% 70%, rgba(0,0,0,0.5) 70% 80%, transparent 80%)',
};

// Horizontal half of a resize: 'e' grows/shrinks the right edge (left stays put, capped so the
// right edge never crosses the viewport edge); 'w' grows/shrinks the left edge by keeping the
// RIGHT edge anchored — the box's right edge = start.left + start.width never moves, so left is
// solved from however much width is left over once it's clamped to the minimum.
function resizeHorizontal(dir, start, dx, viewportWidth) {
  if (dir.includes('e')) {
    const width = Math.min(Math.max(MIN_WIDTH_PX, start.width + dx), viewportWidth - start.left - EDGE_MARGIN_PX);
    return { left: start.left, width };
  }
  if (dir.includes('w')) {
    const left = Math.min(Math.max(0, start.left + dx), start.left + start.width - MIN_WIDTH_PX);
    return { left, width: start.left + start.width - left };
  }
  return { left: start.left, width: start.width };
}

// Vertical mirror of resizeHorizontal — 's' anchors the top edge, 'n' anchors the bottom edge.
function resizeVertical(dir, start, dy, viewportHeight) {
  if (dir.includes('s')) {
    const height = Math.min(Math.max(MIN_HEIGHT_PX, start.height + dy), viewportHeight - start.top - EDGE_MARGIN_PX);
    return { top: start.top, height };
  }
  if (dir.includes('n')) {
    const top = Math.min(Math.max(0, start.top + dy), start.top + start.height - MIN_HEIGHT_PX);
    return { top, height: start.top + start.height - top };
  }
  return { top: start.top, height: start.height };
}

const SLOT_LABELS = { ...ARMOR_SLOT_LABELS, ...EQUIPMENT_SLOT_LABELS, pet: 'Pet' };

const CATEGORY_COLORS = {
  Weapon: '#f87171',
  Armor: '#38bdf8',
  Equipment: '#fbbf24',
  Pet: '#2dd4bf',
  Enchant: '#4ade80',
  'Ultimate Enchant': '#22d3ee',
  'Power Stone': '#a78bfa',
  Stars: '#fb923c',
  Reforge: '#60a5fa',
  Recombobulator: '#818cf8',
  'Pet Item': '#f472b6',
  Gemstone: '#e879f9',
  'New Accessory': '#4ade80',
  'Accessory Upgrade': '#34d399',
  Recombobulate: '#818cf8',
  'Perfect Gemstones': '#a78bfa',
  'Magical Power (generic)': '#facc15',
  'Full Set': '#fb7185',
  Attribute: '#c084fc',
};

const SLAYER_ATTACK_SPEED_TARGET = 82;
const EMPTY_STATE = { status: 'idle', baselineValue: 0, bonusAttackSpeed: 0, slots: {}, otherResults: [] };

// Same two rankings as Optimizer.jsx's own toggle: "ratio" (real DPS-per-coin, see lib/pricing.js)
// sinks unpriceable ('?') results to the bottom rather than treating them as worthless; "increase"
// ignores cost entirely and ranks by raw % DPS gained.
function compareResults(a, b, sortBy) {
  if (sortBy === 'ratio') {
    if (a.ratio == null && b.ratio == null) return b.percentIncrease - a.percentIncrease;
    if (a.ratio == null) return 1;
    if (b.ratio == null) return -1;
    return b.ratio - a.ratio;
  }
  return b.percentIncrease - a.percentIncrease;
}

// One shared row style for every candidate — gear-slot picks (Weapon/Armor/Equipment/Pet) and the
// brute-forced categories (Enchant/Reforge/Stars/...) alike — now that they all rank together in
// one list instead of two separate sections.
function UpgradeRow({ result, onSwapIn, onSkip }) {
  const badge = result.itemId && getItemCornerBadge(result.itemId, result.slot, { special: result.special });
  const isEnchant = result.category === 'Enchant' || result.category === 'Ultimate Enchant';
  const isGemstone = result.category === 'Gemstone';
  const isMasterStar = result.category === 'Master Stars';
  const coinsPerPercent = formatCoinsPerPercent(result.cost, result.percentIncrease);
  return (
    <div className="group w-full flex items-stretch bg-[#8b8b8b]/40 hover:bg-[#8b8b8b]/70 border border-black/30 transition-colors">
      <button
        type="button"
        onClick={() => onSwapIn(result)}
        title="Click to equip this upgrade"
        className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 cursor-pointer text-left"
      >
        {isGemstone ? (
          <div className="relative shrink-0 w-5 h-5">
            <img src={getGemstoneIcon(result.gem, result.tier)} alt="" className="w-5 h-5 pixelated" />
          </div>
        ) : isMasterStar ? (
          <div className="relative shrink-0 w-5 h-5">
            <img src="/images/manual/master_star.webp" alt="" className="w-5 h-5 pixelated" />
          </div>
        ) : result.itemId || result.material ? (
          <div className="relative shrink-0 w-5 h-5">
            <WeaponIcon id={result.itemId} material={result.material} alt="" className="w-5 h-5 pixelated" />
            {badge && (
              <span className="absolute -bottom-0.5 -right-0.5 text-[6px] font-bold text-white bg-black/80 leading-none px-[2px] rounded-[1px]">
                {badge}
              </span>
            )}
          </div>
        ) : (
          isEnchant && (
            <div className="relative shrink-0 w-5 h-5">
              <img src={ENCHANTED_BOOK_ICON} alt="" className="w-5 h-5 pixelated" />
            </div>
          )
        )}
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[8px] font-bold uppercase tracking-wide" style={{ color: CATEGORY_COLORS[result.category] || '#999999' }}>
            {result.category} — {SLOT_LABELS[result.slot] || result.slot}
          </span>
          <span className="text-[11px] text-black truncate">{result.label}</span>
          <span className="text-[9px] text-neutral-700">
            {/* A bare "Cost: ?" read as a bug rather than as "we have no price for this". */}
            {typeof result.cost === 'number' && Number.isFinite(result.cost)
              ? `Cost: ${formatCoinsShort(result.cost)}${coinsPerPercent ? ` · ${coinsPerPercent}/%` : ''}`
              : 'Cost: unpriced'}
          </span>
        </div>
        <span className="text-[11px] font-mono font-bold text-green-500 whitespace-nowrap">+{round1(result.percentIncrease)}%</span>
        <span className="hidden group-hover:inline text-[9px] font-bold uppercase text-black whitespace-nowrap">Equip</span>
      </button>
      <button
        type="button"
        onClick={() => onSkip(result)}
        title="Skip — hide this suggestion for now"
        className="shrink-0 px-2 flex items-center justify-center text-neutral-700 hover:text-black hover:bg-black/15 cursor-pointer border-l border-black/20"
      >
        ✕
      </button>
    </div>
  );
}

// "Recommended Upgrades" panel on the main Loadout screen (Landing.jsx) — a live view of
// lib/optimizer.js's engine with a click-to-equip "swap-in" row per result. Clicking a row calls
// applyOptimizerResult, which mutates the real loadout via the same BuildContext functions the
// item pickers use; the effect below is keyed on build.loadout, so it re-runs automatically
// afterward and the just-applied upgrade naturally drops out of the list (it's now the baseline)
// — no separate "remove from list" bookkeeping needed.
//
// Always rendered (shown by default, not hidden behind a toggle) — a fixed right-side sidebar at
// the `lg` breakpoint and up, and an ordinary in-flow block below it on narrower/mobile layouts.
// Being position: fixed means it never pushes the loadout/damage grid via normal document flow —
// but Landing.jsx's own wrapper used to ALSO reserve a static lg:pr-[320px] for it, which kept the
// grid centered only while the panel stayed docked at its default spot. Now that it's a real
// floating window the user can drag anywhere, that reservation just left permanent dead space on
// the right regardless of where the panel actually was — removed, so the grid centers on the full
// page width like everything else. Landing.jsx places this
// component right after the gear grid specifically so that in-flow position lands directly below
// it. Desktop-only (see DESKTOP_BREAKPOINT_PX), the panel is also a real floating window: drag the
// title bar to reposition it, or any of its 8 edge/corner handles (see RESIZE_HANDLES) to resize
// it from any side — mousedown/mousemove tracking, no library. Both write straight to the DOM
// during the actual gesture rather than through React state on every event — with 40+ candidate
// rows, re-rendering all of them on every mousemove tick was the real source of past jankiness —
// and only commit one final setFloatPos/setFloatSize on mouseup. Defaults to a 66vh-tall box at
// the default right-4/top-32 spot until dragged or resized for the first time. (top-32, not the
// original top-20: at that height the panel's own title bar — the drag surface, and now the thing
// carrying the grip glyph that advertises it — sat underneath Landing's Loadout toolbar at every
// viewport narrower than ~1500px, hiding the affordance exactly where it needed to be seen.)
//
// Every real candidate — gear-slot picks (Weapon/Armor/Equipment/Pet) and the brute-forced
// categories (Enchant/Ultimate Enchant/Power Stone/Stars/Magical Power/accessories) alike — ranks
// together in one list, rather than a separate "by slot" section capped to one pick per slot.
// Same Best Value / Highest Increase sort toggle as Optimizer.jsx, just abbreviated for the
// panel's width; defaults to Best Value (real DPS-per-coin ratio).
export default function OptimizerSidebar() {
  const build = useBuild();
  const { itemData, loading: itemDataLoading } = useItemData();
  const [mode, setModeState] = useState(loadOptimizerMode);
  const setMode = (next) => {
    setModeState(next);
    saveOptimizerMode(next);
  };
  const [state, setState] = useState(EMPTY_STATE);
  const [sortBy, setSortBy] = useState('ratio');
  // "Skip" (UpgradeRow's ✕) just hides a suggestion from view for the rest of this visit — see
  // Optimizer.jsx's identical treatment for the full-page version of this same list.
  const [skippedKeys, setSkippedKeys] = useState(() => new Set());
  // Empty = no filter (show every category) — see Optimizer.jsx's identical treatment.
  const [selectedCategories, setSelectedCategories] = useState(() => new Set());
  const toggleCategory = (category) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };
  const resultKey = (r) => `${r.category}:${r.slot}:${r.label}`;
  const tokenRef = useRef(0);

  // Floating position/size (desktop only) — null position means "use the default fixed spot"
  // (right-4/top-20, via the outer div's own classes) until the user actually drags it once.
  const containerRef = useRef(null);
  const [floatPos, setFloatPos] = useState(null);
  const [floatSize, setFloatSize] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= DESKTOP_BREAKPOINT_PX);
  // Tracked separately from isDesktop (which only flips at the lg breakpoint) so the panel
  // re-clamps back on-screen on any real window resize, not just one that crosses 1024px.
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  }));
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    function handleResize() {
      // isDesktop compares against the raw (zoomed) width — that's what the CSS `lg:` breakpoint's
      // own min-width media query checks too. viewportSize feeds clampPosition/desktopStyle, which
      // work in pre-zoom space (see getPageZoom above), so it needs the conversion.
      const zoom = getPageZoom();
      setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT_PX);
      setViewportSize({ width: window.innerWidth / zoom, height: window.innerHeight / zoom });
    }
    // Re-checks once on mount (not just on future resize events) — the lazy useState initializer
    // above can catch window.innerWidth at a moment before the viewport's real size is settled,
    // and with no window resize afterward (the common case — most users never resize mid-session)
    // nothing would ever correct a bad initial read, silently disabling floating/dragging entirely.
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Re-clamps a floated position back on-screen whenever the viewport shrinks (browser window
  // resized smaller, or a position saved on a bigger screen loading on a smaller one) — otherwise
  // the panel could end up partly or fully unreachable with no on-screen handle left to drag it
  // back by. Uses the panel's real current box (post any resize), not just its stored size.
  useEffect(() => {
    if (!floatPos || !containerRef.current || !isDesktop) return;
    const el = containerRef.current;
    const clamped = clampPosition(floatPos.left, floatPos.top, el.offsetWidth, el.offsetHeight, viewportSize);
    if (clamped.left !== floatPos.left || clamped.top !== floatPos.top) {
      el.style.left = `${clamped.left}px`;
      el.style.top = `${clamped.top}px`;
      setFloatPos(clamped);
    }
    // Only depends on the primitives that should actually trigger a re-clamp (viewport changing,
    // or floatPos itself changing — e.g. first loading from storage). Safe from looping: this only
    // calls setFloatPos when the position genuinely needs correcting, and re-running against an
    // already-clamped position is then a no-op.
  }, [viewportSize, isDesktop, floatPos]);

  useEffect(() => {
    try {
      const storedPos = localStorage.getItem(POSITION_KEY);
      if (storedPos) setFloatPos(JSON.parse(storedPos));
      const storedSize = localStorage.getItem(SIZE_KEY);
      if (storedSize) setFloatSize(JSON.parse(storedSize));
    } catch {
      // Corrupt/stale localStorage value — fall back to the default position/size.
    }
  }, []);

  const dragSizeRef = useRef({ width: 0, height: 0 });

  function handleDragStart(e) {
    if (!isDesktop || !containerRef.current) return;
    const el = containerRef.current;
    const zoom = getPageZoom();
    // offsetLeft/offsetWidth, not getBoundingClientRect — both are pre-zoom CSS px, the same space
    // el.style.left/width writes use, unlike getBoundingClientRect/clientX (see getPageZoom above).
    dragOffsetRef.current = { x: e.clientX / zoom - el.offsetLeft, y: e.clientY / zoom - el.offsetTop };
    dragSizeRef.current = { width: el.offsetWidth, height: el.offsetHeight };
    setIsDragging(true);
    e.preventDefault();
  }

  // Mutates the panel's position directly on the DOM during the drag instead of going through
  // React state on every mousemove — this list can be 40+ rows long, and re-rendering all of them
  // on every single pixel of mouse movement is what actually made dragging feel glitchy/laggy.
  // React only gets a single, final setFloatPos on mouseup, to persist and for the next render.
  // Clamped against the panel's own real width/height (captured once at drag-start) so the whole
  // box — not just its top-left corner — stays forced within the page, not just partially on it.
  useEffect(() => {
    if (!isDragging || !containerRef.current) return;
    const el = containerRef.current;
    const zoom = getPageZoom();
    let latest = null;
    function handleMove(e) {
      const { width, height } = dragSizeRef.current;
      const next = clampPosition(e.clientX / zoom - dragOffsetRef.current.x, e.clientY / zoom - dragOffsetRef.current.y, width, height, {
        width: window.innerWidth / zoom,
        height: window.innerHeight / zoom,
      });
      latest = next;
      el.style.left = `${next.left}px`;
      el.style.top = `${next.top}px`;
      el.style.right = 'auto';
    }
    function handleUp() {
      setIsDragging(false);
      if (!latest) return;
      // Re-clamps once more against the panel's actual settled box before committing/persisting —
      // a safety net in case its real size ever drifted from what was captured at drag-start (a
      // row's content changing mid-drag, etc.), so what gets saved is always genuinely on-screen.
      const settled = clampPosition(latest.left, latest.top, el.offsetWidth, el.offsetHeight, {
        width: window.innerWidth / zoom,
        height: window.innerHeight / zoom,
      });
      el.style.left = `${settled.left}px`;
      el.style.top = `${settled.top}px`;
      setFloatPos(settled);
    }
    // Dragging over ordinary page content (item labels, etc.) would otherwise highlight text as
    // the cursor sweeps past it — same reasoning the resize effect below applies to itself.
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging]);

  useEffect(() => {
    if (floatPos) localStorage.setItem(POSITION_KEY, JSON.stringify(floatPos));
  }, [floatPos]);

  useEffect(() => {
    if (floatSize) localStorage.setItem(SIZE_KEY, JSON.stringify(floatSize));
  }, [floatSize]);

  // Resizing from any of the 8 handles (see RESIZE_HANDLES) — same "direct DOM write during the
  // gesture, one real commit on mouseup" pattern as dragging, and for the same reason: this list
  // can be 40+ rows, and re-rendering all of them on every mousemove is what made this feel
  // glitchy before. Unlike the earlier native `resize: both` attempt, this is fully our own JS on
  // both ends of the gesture, so floatSize/floatPos can go straight into the controlled style (see
  // desktopStyle below) without anything else concurrently fighting over the same DOM properties.
  const resizeDirRef = useRef(null);
  const resizeStartRef = useRef({ left: 0, top: 0, width: 0, height: 0, mouseX: 0, mouseY: 0 });
  const [isResizing, setIsResizing] = useState(false);

  function handleResizeStart(dir) {
    return function (e) {
      if (!isDesktop || !containerRef.current) return;
      const el = containerRef.current;
      // offsetLeft/offsetTop, not getBoundingClientRect — pre-zoom CSS px, same space as the
      // style.left/top/width/height writes below (see getPageZoom above).
      resizeDirRef.current = dir;
      resizeStartRef.current = {
        left: el.offsetLeft,
        top: el.offsetTop,
        width: el.offsetWidth,
        height: el.offsetHeight,
        mouseX: e.clientX,
        mouseY: e.clientY,
      };
      setIsResizing(true);
      e.preventDefault();
    };
  }

  useEffect(() => {
    if (!isResizing || !containerRef.current) return;
    const el = containerRef.current;
    const dir = resizeDirRef.current;
    const zoom = getPageZoom();
    let latest = null;
    function handleMove(e) {
      const start = resizeStartRef.current;
      const dx = (e.clientX - start.mouseX) / zoom;
      const dy = (e.clientY - start.mouseY) / zoom;
      const h = resizeHorizontal(dir, start, dx, window.innerWidth / zoom);
      const v = resizeVertical(dir, start, dy, window.innerHeight / zoom);
      const next = { left: h.left, top: v.top, width: h.width, height: v.height };
      latest = next;
      el.style.left = `${next.left}px`;
      el.style.top = `${next.top}px`;
      el.style.right = 'auto';
      el.style.width = `${next.width}px`;
      el.style.height = `${next.height}px`;
    }
    function handleUp() {
      setIsResizing(false);
      if (!latest) return;
      setFloatPos({ left: latest.left, top: latest.top });
      setFloatSize({ width: Math.round(latest.width), height: Math.round(latest.height) });
    }
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isResizing]);

  const mobName = build.targetMobs[0] || null;
  const mobTypes = mobName ? MOB_TYPES[mobName] : null;
  // Real accessory bag list, persisted from whichever Hypixel import last ran — null means no
  // import has ever happened, distinct from an import that found zero accessories. Same source
  // Optimizer.jsx reads; no separate fetch here.
  const ownedAccessories = build.loadout.accessory?.modifiers?.ownedAccessories ?? null;

  useEffect(() => {
    if (itemDataLoading || !mobName || !mobTypes) {
      setState({ ...EMPTY_STATE, status: 'no-target' });
      return;
    }
    const token = ++tokenRef.current;
    setState((prev) => ({ ...prev, status: 'loading' }));
    runOptimizer(build.loadout, itemData, build, mode, { name: mobName, types: mobTypes }).then((result) => {
      if (tokenRef.current === token) setState({ status: 'ok', ...result });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    build.loadout,
    build.playerStats,
    build.attributes,
    build.miscStats,
    build.godPotionActive,
    build.godPotionMixin,
    build.mobHpPercent,
    build.mobHpSelections,
    build.infernalCrimsonStacks,
    build.swarmMobs,
    build.comboKills,
    build.legionPlayers,
    build.blazeCrimsonIsle,
    itemData,
    itemDataLoading,
    mode,
    mobName,
  ]);

  const [mpResult, setMpResult] = useState(null);
  const mpTokenRef = useRef(0);
  useEffect(() => {
    if (itemDataLoading || !mobName || !mobTypes) {
      setMpResult(null);
      return;
    }
    const candidates = ownedAccessories
      ? itemData.accessoryFamilies && buildAccessoryCandidates(ownedAccessories, itemData.accessoryFamilies)
      : buildGenericMpCandidates();
    if (!candidates) {
      setMpResult(null);
      return;
    }
    const token = ++mpTokenRef.current;
    evaluateAccessoryCandidates(build.loadout, itemData, build, mode, { name: mobName, types: mobTypes }, candidates).then((result) => {
      if (mpTokenRef.current === token) setMpResult(result);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [build.loadout, build.attributes, itemData, itemDataLoading, mode, mobName, mobTypes]);

  const slotResults = OPTIMIZER_GEAR_SLOTS.flatMap((slot) => state.slots[slot] || []);
  // maxBudget of 0 means "no limit" (default, unset) — see BuildContext.jsx. Unpriced ('?')
  // candidates always stay shown; only a confirmed over-budget real cost gets filtered out.
  const withinBudget = (r) => !build.maxBudget || typeof r.cost !== 'number' || r.cost <= build.maxBudget;
  const unfilteredResults = [...slotResults, ...state.otherResults, ...(mpResult?.results || [])]
    .filter(withinBudget)
    .filter((r) => !skippedKeys.has(resultKey(r)));
  // Only offer chips for categories actually present right now — see Optimizer.jsx.
  const availableCategories = [...new Set(unfilteredResults.map((r) => r.category))].sort();
  const combinedResults = unfilteredResults
    .filter((r) => selectedCategories.size === 0 || selectedCategories.has(r.category))
    .sort((a, b) => compareResults(a, b, sortBy));

  // Once the user drags/resizes the panel, its own left/top/width/height override the default
  // fixed spot (right-4/top-20/w-280/h-66vh) via inline style — CSS classes alone can't express
  // "wherever the user last put it". Both only ever apply at the `lg` breakpoint (isDesktop);
  // below that this stays the ordinary in-flow mobile block it always was, untouched by any
  // stored position/size. Safe to drive width/height straight from state here (unlike the earlier
  // native `resize: both` version) since nothing outside our own drag/resize handlers ever touches
  // those DOM properties concurrently — see the resize effect above.
  //
  // maxWidth/maxHeight are a backstop for the "forced within the page" guarantee — the resize
  // handles' own math already clamps against the viewport live, but this also covers a restored
  // size from a bigger screen no longer fitting a smaller one. A small margin keeps the panel from
  // ever touching the exact edge.
  const desktopStyle =
    isDesktop && floatPos
      ? {
          left: floatPos.left,
          top: floatPos.top,
          right: 'auto',
          ...(floatSize ? { width: floatSize.width, height: floatSize.height } : {}),
          maxWidth: `${Math.max(MIN_VISIBLE_PX, viewportSize.width - floatPos.left - EDGE_MARGIN_PX)}px`,
          maxHeight: `${Math.max(MIN_VISIBLE_PX, viewportSize.height - floatPos.top - EDGE_MARGIN_PX)}px`,
        }
      : undefined;

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col gap-2 w-full max-w-[700px] mt-4 lg:mt-0 max-h-[60vh] overflow-y-auto ${
        state.status === 'loading' || state.status === 'ok' ? 'min-h-[60vh]' : ''
      } ${floatPos ? 'lg:fixed' : 'lg:fixed lg:right-4 lg:top-32'} lg:w-[280px] lg:h-[66vh] lg:max-w-[calc(100vw-2rem)] lg:max-h-[calc(100vh-6rem)] lg:min-w-[220px] lg:min-h-[200px] lg:overflow-auto`}
      style={desktopStyle}
    >
      {isDesktop &&
        RESIZE_HANDLES.map(({ dir, className }) => (
          <div
            key={dir}
            className={`${className} ${HANDLE_HOVER}`}
            style={{ zIndex: dir.length === 2 ? 2 : 1, ...(dir === 'se' ? CORNER_GRIP_STYLE : null) }}
            title="Drag to resize"
            onMouseDown={handleResizeStart(dir)}
          />
        ))}
      {/* opaque-panel: this is a floating window the user drags over the gear grid and the damage
          breakdown — glass here means their text reads through this panel's own. */}
      <div className={`${panel} opaque-panel p-2 flex flex-col gap-1.5`}>
        {/* Title and sort buttons stack rather than share a line: at the panel's 280px default the
            two competed for width, and adding the grip glyph tipped the title into truncating
            ("RECOMMENDED UPGRA..."). Stacking also makes the top row read as a real title bar,
            which is half the point of the grip. The whole block is the drag surface; the buttons
            stop propagation so clicking one doesn't start a drag. */}
        <div
          className={`${sectionTitle} flex flex-col gap-1 lg:cursor-move select-none`}
          onMouseDown={handleDragStart}
          title="Drag to move this window — drag its edges or corners to resize"
        >
          <span className="flex items-center gap-1.5 min-w-0">
            {/* Standard drag-grip glyph (braille dots), desktop-only since the panel is an ordinary
                in-flow block below the breakpoint. */}
            {isDesktop && (
              <span className="text-[13px] leading-none text-neutral-600 shrink-0" aria-hidden="true">
                ⠿
              </span>
            )}
            <span className="truncate">Recommended Upgrades</span>
          </span>
          <div className="flex gap-1 justify-end" onMouseDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setSortBy('increase')}
              title="Highest raw % DPS increase"
              className={`px-1 py-0.5 text-[8px] font-bold normal-case cursor-pointer ${
                sortBy === 'increase' ? 'bg-[#8fbf3f] text-black' : 'bg-black/20 text-neutral-700 hover:bg-black/30'
              }`}
            >
              Increase
            </button>
            <button
              type="button"
              onClick={() => setSortBy('ratio')}
              title="Damage increase per coin — ranks candidates by DPS gained per coin spent"
              className={`px-1 py-0.5 text-[8px] font-bold normal-case cursor-pointer ${
                sortBy === 'ratio' ? 'bg-[#8fbf3f] text-black' : 'bg-black/20 text-neutral-700 hover:bg-black/30'
              }`}
            >
              Value
            </button>
          </div>
        </div>
        {/* One-click apply is this panel's most useful feature and nothing said so — the rows read
            as a static readout, and the ✕ means "hide this suggestion" while ✕ everywhere else in
            the app means "remove this item". */}
        <div className="text-[10px] text-neutral-700">Click a row to equip it · ✕ hides a suggestion</div>
        <div className="grid grid-cols-2 gap-1">
          {OPTIMIZER_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={m.disabled}
              onClick={() => !m.disabled && setMode(m.id)}
              title={m.disabled ? `${m.label} — not selectable yet` : m.label}
              className={`${panel} px-2 py-1 flex items-center justify-center gap-1 text-[10px] font-bold text-black transition-[filter] ${
                m.disabled ? 'opacity-40 cursor-not-allowed' : mode === m.id ? 'cursor-pointer hover:brightness-110' : 'cursor-pointer brightness-50'
              }`}
            >
              {m.icon && <img src={m.icon} alt="" className="w-4 h-4 pixelated shrink-0" />}
              <span className="truncate">{m.label}</span>
            </button>
          ))}
        </div>
        {!hasCuratedData(mode) && (
          <div className="text-[10px] text-neutral-700 italic">Armor/Pet progression not configured for this mode yet.</div>
        )}
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="sidebar-max-budget" className="text-[10px] font-bold text-black uppercase tracking-wide">
            Max Budget
          </label>
          <NumberInput
            id="sidebar-max-budget"
            value={build.maxBudget}
            onChange={build.setMaxBudget}
            min={0}
            step={1000000}
            allowSuffix
            placeholder="No limit"
            className={`${panel} px-1.5 py-0.5 text-[11px] text-black w-28 text-right`}
          />
        </div>
        {mode === 'slayer' && state.status === 'ok' && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-black uppercase tracking-wide">Atk Speed</span>
            <span className={`font-mono font-bold ${state.bonusAttackSpeed >= SLAYER_ATTACK_SPEED_TARGET ? 'text-green-700' : 'text-red-700'}`}>
              {round1(state.bonusAttackSpeed)}% {state.bonusAttackSpeed < SLAYER_ATTACK_SPEED_TARGET && `(target ${SLAYER_ATTACK_SPEED_TARGET}%)`}
            </span>
          </div>
        )}
      </div>

      {state.status === 'no-target' && (
        <div className={`${panel} p-2 text-[11px] text-neutral-600 italic`}>Pick a target mob to see recommended upgrades.</div>
      )}
      {state.status === 'loading' && <div className={`${panel} p-2 text-[11px] text-neutral-600 italic`}>Evaluating...</div>}

      {state.status === 'ok' && (
        <div className={`${panel} p-1.5 flex flex-col gap-1.5`}>
          {availableCategories.length > 1 && (
            <div className="flex flex-wrap items-center gap-1">
              {availableCategories.map((category) => {
                const active = selectedCategories.size === 0 || selectedCategories.has(category);
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => toggleCategory(category)}
                    title={selectedCategories.has(category) ? `Click to remove ${category} from the filter` : `Click to filter to just ${category}`}
                    className="px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide normal-case cursor-pointer transition-opacity"
                    style={{
                      color: '#fff',
                      backgroundColor: selectedCategories.has(category) ? CATEGORY_COLORS[category] || '#999999' : 'rgba(0,0,0,0.12)',
                      opacity: active ? 1 : 0.5,
                    }}
                  >
                    {category}
                  </button>
                );
              })}
              {selectedCategories.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedCategories(new Set())}
                  className="px-1 py-0.5 text-[8px] font-bold uppercase text-neutral-700 hover:text-black cursor-pointer underline"
                >
                  Clear
                </button>
              )}
            </div>
          )}
          {combinedResults.length > 0 ? (
            combinedResults.map((r) => (
              <UpgradeRow
                key={resultKey(r)}
                result={r}
                onSwapIn={(res) => applyOptimizerResult(build, res)}
                onSkip={(res) => setSkippedKeys((prev) => new Set(prev).add(resultKey(res)))}
              />
            ))
          ) : (
            <div className="px-2 py-1.5 text-[11px] text-neutral-600 italic">
              {selectedCategories.size > 0
                ? 'No upgrades match the selected filter.'
                : build.maxBudget
                  ? 'No upgrades available within budget.'
                  : 'No upgrades available.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

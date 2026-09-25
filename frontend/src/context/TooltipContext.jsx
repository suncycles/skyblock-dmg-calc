import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { parseMinecraftLine } from '../lib/mcText';
import McTooltipLines from '../components/McTooltipLines';

const TooltipContext = createContext(null);

// True on devices with no real hover input (touch/tap-only) - gates every hover-preview
// interaction in the app over to "tap to preview, tap again to activate" (see
// handleTapOrActivate/guardHover below) instead of an immediate, unpreviewable click. A real
// mouse/trackpad always reads false here, so hover-capable clients are completely unaffected.
export function isTouchDevice() {
  return typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;
}

export function TooltipProvider({ children }) {
  const [tooltip, setTooltip] = useState(null); // { lines, point } | null
  const location = useLocation();
  // Which tap-primed target (an arbitrary caller-chosen key, e.g. a gear slot name) currently has
  // its tooltip open awaiting a confirm tap, and the DOM node that opened it - refs, not state,
  // since they're only ever read/written imperatively inside event handlers, never render.
  const primedKeyRef = useRef(null);
  const primedAnchorRef = useRef(null);
  // The latest pointer position, tracked passively so showTooltip - called from a caller's
  // onMouseEnter with an anchor element rather than the event - can open the tooltip at the cursor
  // instead of at the anchor's bounding box, which on a wide grid cell is far from the pointer.
  const pointerPosRef = useRef({ x: 0, y: 0 });
  useEffect(() => {
    function onPointerMove(e) {
      const point = e.touches?.[0] || e;
      pointerPosRef.current = { x: point.clientX, y: point.clientY };
    }
    document.addEventListener('mousemove', onPointerMove);
    // mouseout and mouseover too, in the capture phase. React doesn't derive onMouseEnter from
    // mousemove: moving between elements it derives both onMouseLeave and onMouseEnter from the
    // `mouseout` of the element being left, using `mouseover` only when entering from outside the
    // window, and the browser dispatches both before mousemove. Tracking mousemove alone therefore
    // left showTooltip reading the previous position. Both events carry the new coordinates, and
    // capture runs ahead of React's own listener.
    document.addEventListener('mouseout', onPointerMove, true);
    document.addEventListener('mouseover', onPointerMove, true);
    document.addEventListener('touchstart', onPointerMove);
    document.addEventListener('touchmove', onPointerMove);
    return () => {
      document.removeEventListener('mousemove', onPointerMove);
      document.removeEventListener('mouseout', onPointerMove, true);
      document.removeEventListener('mouseover', onPointerMove, true);
      document.removeEventListener('touchstart', onPointerMove);
      document.removeEventListener('touchmove', onPointerMove);
    };
  }, []);

  const showTooltip = useCallback((rawLines, anchorEl) => {
    if (!anchorEl) return;
    setTooltip({
      lines: rawLines.map(parseMinecraftLine),
      point: pointerPosRef.current,
    });
  }, []);

  const hideTooltip = useCallback(() => {
    primedKeyRef.current = null;
    primedAnchorRef.current = null;
    setTooltip(null);
  }, []);

  // Clears the tooltip on route change, since a click that navigates away skips the natural mouseleave.
  useEffect(() => {
    hideTooltip();
  }, [location.pathname, hideTooltip]);

  // Tapping anywhere outside the currently tap-primed element dismisses its tooltip without
  // activating it. Capture phase so this runs before the tapped element's own onClick - a tap
  // that lands on a DIFFERENT tap-aware element still reaches that element's own handler
  // afterward (as ITS first tap), since this has already cleared the stale primed key by then.
  useEffect(() => {
    function onDocumentClick(e) {
      if (!primedKeyRef.current) return;
      if (primedAnchorRef.current && primedAnchorRef.current.contains(e.target)) return;
      hideTooltip();
    }
    document.addEventListener('click', onDocumentClick, true);
    return () => document.removeEventListener('click', onDocumentClick, true);
  }, [hideTooltip]);

  // Wraps a hover-preview handler and a click-activate handler so touch devices get "tap to
  // preview, tap again to activate": the first tap on `key` shows the preview and swallows the
  // activate action, a second tap on that SAME key (or the outside-tap listener above) lets it
  // through / dismisses instead. On hover-capable devices this just calls `activateFn` on every
  // click, exactly like a plain onClick would.
  const handleTapOrActivate = useCallback(
    (key, showFn, activateFn) => (e) => {
      if (!isTouchDevice()) {
        activateFn?.(e);
        return;
      }
      if (primedKeyRef.current === key) {
        hideTooltip();
        activateFn?.(e);
        return;
      }
      primedKeyRef.current = key;
      primedAnchorRef.current = e.currentTarget;
      showFn?.(e);
    },
    [hideTooltip],
  );

  // Skips a hover handler entirely on touch devices, so whatever synthetic mouseenter/mouseleave
  // a touch browser sends alongside a real tap can't double-trigger the preview/dismiss logic
  // handleTapOrActivate already owns there. Hover-capable devices call `handler` unchanged.
  const guardHover = useCallback((handler) => (e) => {
    if (isTouchDevice()) return;
    handler?.(e);
  }, []);

  return (
    <TooltipContext.Provider value={{ showTooltip, hideTooltip, handleTapOrActivate, guardHover }}>
      {children}
      {tooltip && <TooltipEl lines={tooltip.lines} point={tooltip.point} />}
    </TooltipContext.Provider>
  );
}

// Minecraft's own offset for item tooltips: up and to the right of the pointer, close enough to
// read as attached while staying out from under it.
const CURSOR_OFFSET_X = 12;
const CURSOR_OFFSET_Y = -12;
const EDGE_MARGIN = 4;

// index.css zooms the whole page (html { zoom: var(--page-zoom) }). Pointer coordinates arrive in
// zoomed screen pixels, but a position: fixed element's left/top are CSS pixels the zoom scales
// again, so an unconverted clientX places the tooltip proportionally further out the further right
// or down the pointer is. Read live rather than hardcoded, so it can't drift from the stylesheet.
export function pageZoom() {
  const z = parseFloat(getComputedStyle(document.documentElement).zoom);
  return z > 0 ? z : 1;
}

function TooltipEl({ lines, point }) {
  const elRef = useRef(null);

  useLayoutEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const zoom = pageZoom();
    // Everything here is in unzoomed CSS pixels: pointer and viewport divided by the zoom, and the
    // element measured with offsetWidth/offsetHeight (layout size, unlike getBoundingClientRect).
    function place(clientX, clientY) {
      const x = clientX / zoom;
      const y = clientY / zoom;
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      let left = x + CURSOR_OFFSET_X;
      if (left + width > window.innerWidth / zoom - EDGE_MARGIN) left = x - width - CURSOR_OFFSET_X;
      let top = y + CURSOR_OFFSET_Y;
      if (top + height > window.innerHeight / zoom - EDGE_MARGIN) top = window.innerHeight / zoom - height - EDGE_MARGIN;
      el.style.left = `${Math.max(EDGE_MARGIN, left)}px`;
      el.style.top = `${Math.max(EDGE_MARGIN, top)}px`;
    }
    // Before paint, so the tooltip never flashes at its unplaced position.
    place(point.x, point.y);
    // Then follows the pointer while open: opening where the pointer entered and staying there left
    // it far from the cursor on a big tile. Written straight to the element rather than through
    // state, since this fires on every mousemove and the content doesn't change.
    function onMove(e) {
      place(e.clientX, e.clientY);
    }
    document.addEventListener('mousemove', onMove);
    return () => document.removeEventListener('mousemove', onMove);
  }, [point, lines]);

  return (
    <div ref={elRef} className="mc-tooltip">
      <McTooltipLines parsedLines={lines} />
    </div>
  );
}

export function useTooltip() {
  const ctx = useContext(TooltipContext);
  if (!ctx) throw new Error('useTooltip must be used within TooltipProvider');
  return ctx;
}

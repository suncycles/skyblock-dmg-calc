import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { parseMinecraftLine } from '../lib/mcText';
import McTooltipLines from '../components/McTooltipLines';

const TooltipContext = createContext(null);

// True on devices with no real hover input (touch/tap-only) — gates every hover-preview
// interaction in the app over to "tap to preview, tap again to activate" (see
// handleTapOrActivate/guardHover below) instead of an immediate, unpreviewable click. A real
// mouse/trackpad always reads false here, so hover-capable clients are completely unaffected.
export function isTouchDevice() {
  return typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;
}

export function TooltipProvider({ children }) {
  const [tooltip, setTooltip] = useState(null); // { lines, anchorRect } | null
  const location = useLocation();
  // Which tap-primed target (an arbitrary caller-chosen key, e.g. a gear slot name) currently has
  // its tooltip open awaiting a confirm tap, and the DOM node that opened it — refs, not state,
  // since they're only ever read/written imperatively inside event handlers, never render.
  const primedKeyRef = useRef(null);
  const primedAnchorRef = useRef(null);

  const showTooltip = useCallback((rawLines, anchorEl) => {
    if (!anchorEl) return;
    setTooltip({
      lines: rawLines.map(parseMinecraftLine),
      anchorRect: anchorEl.getBoundingClientRect(),
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
  // activating it. Capture phase so this runs before the tapped element's own onClick — a tap
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
      {tooltip && <TooltipEl lines={tooltip.lines} anchorRect={tooltip.anchorRect} />}
    </TooltipContext.Provider>
  );
}

function TooltipEl({ lines, anchorRect }) {
  const elRef = useRef(null);
  const [pos, setPos] = useState({ left: anchorRect.right + 8, top: anchorRect.top });

  useLayoutEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let left = anchorRect.right + 8;
    if (left + rect.width > window.innerWidth) {
      left = anchorRect.left - rect.width - 8;
    }
    let top = anchorRect.top;
    if (top + rect.height > window.innerHeight) {
      top = window.innerHeight - rect.height - 4;
    }
    setPos({ left: Math.max(4, left), top: Math.max(4, top) });
  }, [anchorRect, lines]);

  return (
    <div ref={elRef} className="mc-tooltip" style={{ left: pos.left, top: pos.top }}>
      <McTooltipLines parsedLines={lines} />
    </div>
  );
}

export function useTooltip() {
  const ctx = useContext(TooltipContext);
  if (!ctx) throw new Error('useTooltip must be used within TooltipProvider');
  return ctx;
}

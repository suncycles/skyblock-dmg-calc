import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { parseMinecraftLine } from '../lib/mcText';

const TooltipContext = createContext(null);

export function TooltipProvider({ children }) {
  const [tooltip, setTooltip] = useState(null); // { lines, anchorRect } | null
  const location = useLocation();

  const showTooltip = useCallback((rawLines, anchorEl) => {
    if (!anchorEl) return;
    setTooltip({
      lines: rawLines.map(parseMinecraftLine),
      anchorRect: anchorEl.getBoundingClientRect(),
    });
  }, []);

  const hideTooltip = useCallback(() => setTooltip(null), []);

  // A route change can happen without a natural mouseleave on the anchor
  // (e.g. a click that navigates away) — never leave a stale tooltip up.
  useEffect(() => {
    setTooltip(null);
  }, [location.pathname]);

  return (
    <TooltipContext.Provider value={{ showTooltip, hideTooltip }}>
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
      {lines.map((segments, i) => (
        <div key={i}>
          {segments.length === 0
            ? ' '
            : segments.map((seg, j) => (
                <span
                  key={j}
                  style={{
                    color: seg.color,
                    fontWeight: seg.bold ? 'bold' : undefined,
                    fontStyle: seg.italic ? 'italic' : undefined,
                    textDecoration:
                      [seg.underline && 'underline', seg.strikethrough && 'line-through']
                        .filter(Boolean)
                        .join(' ') || undefined,
                  }}
                >
                  {seg.text}
                </span>
              ))}
        </div>
      ))}
    </div>
  );
}

export function useTooltip() {
  const ctx = useContext(TooltipContext);
  if (!ctx) throw new Error('useTooltip must be used within TooltipProvider');
  return ctx;
}

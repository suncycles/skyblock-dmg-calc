import { useEffect, useRef, useState } from 'react';
import { useItemData } from '../context/ItemDataContext';

// __BUILD_TIME__ is injected by vite.config.js's `define` at build time — a fixed instant, not "now".
const deployTime = new Date(__BUILD_TIME__).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// Bottom-right dev-artifact cluster, mounted once at the App root (see App.jsx). Item-data cache
// status/Refresh used to live inline in Hex.jsx's own header (the only page that showed it) —
// centralized here instead so it's visible (and refreshable) from anywhere, alongside the
// build-time footer that already lived here.
//
// Collapsed to a single "i" bubble by default (user-specified 2026-09-08): this is diagnostics, not
// content, and expanded it was a persistent two-line block of small print parked over the bottom
// corner of every page — the same corner the Recommended Upgrades window and the sticky damage
// readout both occupy. Click to expand to the full text, click again (or anywhere outside, or Esc)
// to put it away. Carries its own solid background either way: it had none originally, so the text
// painted directly on whatever it sat over — measured on Landing, six strings from the upgrades
// list ("Cost: 436K - 12.7K/%", "Pet Item", ...) collided with it.
export default function GlobalFooter() {
  const { status, refresh } = useItemData();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  // Dismiss on outside click / Esc, the way any small popover should — without this the panel
  // stays open across navigation and re-covers the corner it was collapsed to get out of.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="fixed bottom-1.5 right-2 z-30 flex flex-col items-end gap-1 select-none">
      {open && (
        <div className="flex flex-col items-end gap-0.5 px-2 py-1 rounded bg-[rgb(16,17,22)] text-[10px] text-neutral-500 max-w-[calc(100vw-2rem)]">
          <div className="flex items-center gap-2">
            <span className="text-right">{status}</span>
            <button className="underline hover:text-neutral-300 cursor-pointer shrink-0" onClick={refresh}>
              Refresh
            </button>
          </div>
          <span>Latest deploy: {deployTime}</span>
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? 'Hide build info' : 'Show build info'}
        title="Item data & build info"
        onClick={() => setOpen((v) => !v)}
        className={`w-5 h-5 shrink-0 flex items-center justify-center rounded-full bg-[rgb(16,17,22)] text-[11px] font-bold italic leading-none cursor-pointer transition-colors ${
          open ? 'text-neutral-300' : 'text-neutral-500 hover:text-neutral-300'
        }`}
      >
        i
      </button>
    </div>
  );
}

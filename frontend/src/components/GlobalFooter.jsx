import { useItemData } from '../context/ItemDataContext';

// __BUILD_TIME__ is injected by vite.config.js's `define` at build time — a fixed instant, not "now".
const deployTime = new Date(__BUILD_TIME__).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// Bottom-right dev-artifact cluster, mounted once at the App root (see App.jsx). Item-data cache
// status/Refresh used to live inline in Hex.jsx's own header (the only page that showed it) —
// centralized here instead so it's visible (and refreshable) from anywhere, alongside the
// build-time footer that already lived here.
export default function GlobalFooter() {
  const { status, refresh } = useItemData();

  return (
    <div className="fixed bottom-1.5 right-2 z-30 flex flex-col items-end gap-0.5 text-[10px] text-neutral-500 select-none">
      <div className="flex items-center gap-2 pointer-events-auto">
        <span>{status}</span>
        <button className="underline hover:text-neutral-300 cursor-pointer" onClick={refresh}>
          Refresh
        </button>
      </div>
      <span className="pointer-events-none">Latest deploy: {deployTime}</span>
    </div>
  );
}

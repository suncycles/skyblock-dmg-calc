import { Link, useLocation } from 'react-router-dom';
import { getPageLabel } from '../lib/pageTitles';

// Single persistent top bar, mounted once at the App root (see App.jsx) so it's present on every
// route without each page re-declaring it. Deliberately a plain modern navbar rather than the
// chunky Minecraft chest-GUI bevel used everywhere below it — the contrast reads as "app chrome"
// vs. "in-game panel". Tints itself via the same --glass-tint CSS var every other themed panel
// uses (see index.css's per-theme html[data-theme] blocks), so it automatically re-colors with
// the active zone theme without needing its own theme-switch logic.
export default function TopBar() {
  const { pathname } = useLocation();
  const pageLabel = getPageLabel(pathname);

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-[rgba(10,11,15,0.55)] border-b border-white/10">
      <div className="max-w-[900px] mx-auto px-4 h-12 flex items-center gap-2.5">
        <Link
          to="/"
          className="flex items-center gap-2 text-[15px] font-extrabold tracking-tight text-white hover:opacity-80 transition-opacity shrink-0"
        >
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'rgb(var(--glass-tint))' }} />
          SkyDmg
        </Link>
        {pageLabel && (
          <>
            <span className="text-white/25 text-sm select-none">/</span>
            <span className="text-[13px] font-medium text-white/65 truncate">{pageLabel}</span>
          </>
        )}
        <nav className="ml-auto flex items-center gap-4 text-[12px] font-medium shrink-0">
          <Link to="/credits" className="text-white/50 hover:text-white transition-colors">
            Credits
          </Link>
        </nav>
      </div>
    </header>
  );
}

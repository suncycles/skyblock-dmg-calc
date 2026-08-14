import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getPageLabel } from '../lib/pageTitles';
import { ENTRY_DISMISSED_KEY } from '../lib/entryScreen';

const MENU_LINKS = [
  { to: '/tutorial', label: 'Tutorial', icon: '/images/manual/tutorial_icon.png' },
  { to: '/examples', label: 'Examples', icon: '/images/manual/Armor_Stand.png' },
  { to: '/resources', label: 'Calculations', icon: '/images/manual/calculations_icon.png' },
];

// Single persistent top bar, mounted once at the App root (see App.jsx) so it's present on every
// route without each page re-declaring it. Deliberately a plain modern navbar rather than the
// chunky Minecraft chest-GUI bevel used everywhere below it — the contrast reads as "app chrome"
// vs. "in-game panel". Tints itself via the same --glass-tint CSS var every other themed panel
// uses (see index.css's per-theme html[data-theme] blocks), so it automatically re-colors with
// the active zone theme without needing its own theme-switch logic.
export default function TopBar() {
  const { pathname } = useLocation();
  const pageLabel = getPageLabel(pathname);
  const [menuOpen, setMenuOpen] = useState(false);

  // Closes the drawer on any navigation (a menu link, the brand, or Back/browser nav) rather than
  // requiring every nav item to remember to close it itself.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // The brand link's target ("/") is Landing.jsx, which shows the username-entry gate instead of
  // the loadout grid until that gate's been dismissed once this tab (see EntryScreen.jsx). Without
  // this, clicking the brand from a fresh/direct page load re-shows that entry prompt instead of
  // acting like a "home" button back to the actual build screen.
  function handleBrandClick() {
    sessionStorage.setItem(ENTRY_DISMISSED_KEY, '1');
  }

  return (
    <>
      {/* fixed (not sticky) — sticky's top:0 still lets the bar get dragged along during
          rubber-band overscroll past the top of the page, briefly revealing blank space above it
          since it's the very first element in the document. fixed pins it to the viewport
          regardless of scroll/overscroll; App.jsx adds matching top padding to the routed content
          below to compensate for the space this no longer reserves in normal flow. */}
      <header className="fixed top-0 inset-x-0 z-40 backdrop-blur-xl bg-[rgba(10,11,15,0.55)] border-b border-white/10">
        <div className="max-w-[900px] mx-auto px-4 h-12 flex items-center gap-2.5">
          <button
            type="button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="shrink-0 -ml-1.5 w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer"
          >
            <StackIcon open={menuOpen} />
          </button>
          <Link
            to="/"
            onClick={handleBrandClick}
            className="flex items-center gap-2 text-[15px] font-extrabold tracking-tight text-white hover:opacity-80 transition-opacity shrink-0"
          >
            <img src="/icons/favicon.webp" alt="" className="w-[18px] h-[18px] shrink-0 pixelated" />
            SkyDmg
          </Link>
          {pageLabel && (
            <>
              <span className="text-white/25 text-sm select-none">/</span>
              <span className="text-[13px] font-medium text-white/65 truncate">{pageLabel}</span>
            </>
          )}
          <nav className="ml-auto flex items-center gap-4 text-[12px] font-medium shrink-0">
            {pathname === '/damage-sources' ? (
              <span className="text-white/30 cursor-default">Damage</span>
            ) : (
              <Link to="/damage-sources" className="text-white/50 hover:text-white transition-colors">
                Damage
              </Link>
            )}
            {pathname === '/credits' ? (
              <span className="text-white/30 cursor-default">Credits</span>
            ) : (
              <Link to="/credits" className="text-white/50 hover:text-white transition-colors">
                Credits
              </Link>
            )}
          </nav>
        </div>
      </header>

      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px]"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-50 h-full w-72 max-w-[80vw] backdrop-blur-xl bg-[rgba(10,11,15,0.85)] border-r border-white/10 shadow-[8px_0_24px_rgba(0,0,0,0.4)] transition-transform duration-300 ease-out ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-12 px-4 flex items-center justify-between border-b border-white/10">
          <span className="text-[13px] font-bold uppercase tracking-wide text-white/70">Menu</span>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="w-7 h-7 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>
        <nav className="p-2 flex flex-col gap-0.5">
          {MENU_LINKS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[14px] font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <img src={item.icon} alt="" className="w-5 h-5 shrink-0 pixelated" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
    </>
  );
}

function StackIcon({ open }) {
  if (open) {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 4L14 14M14 4L4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.5 4.5H15.5M2.5 9H15.5M2.5 13.5H15.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

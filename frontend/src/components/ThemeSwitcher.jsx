import { useEffect, useState } from 'react';
import { THEMES, THEME_STORAGE_KEY, loadInitialTheme } from '../lib/themes';

// Temporary/draft: a bottom-left theme picker mounted once at the App root so it floats over
// every route. Applies the choice as data-theme on <html>, which index.css's override blocks
// key off of. Meant for quickly comparing GUI reskins live, not as a permanent settings UI.
export default function ThemeSwitcher() {
  const [theme, setTheme] = useState(loadInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  return (
    <div className="fixed bottom-1 left-2 z-50 flex flex-wrap-reverse items-center gap-1 max-w-[280px] pointer-events-auto">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setTheme(t.id)}
          className={`text-[10px] px-2 py-1 rounded cursor-pointer border transition-colors ${
            theme === t.id
              ? 'bg-white text-black border-white font-semibold'
              : 'bg-black/40 text-neutral-300 border-neutral-600 hover:bg-black/60 hover:text-white'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

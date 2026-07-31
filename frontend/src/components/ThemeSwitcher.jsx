import { THEMES } from '../lib/themes';
import { useTheme } from '../context/ThemeContext';

// Temporary/draft: a bottom-left theme picker mounted once at the App root so it floats over
// every route. Reads/writes the shared ThemeContext (also driven automatically by Landing's
// zone-matched theme, see lib/background.js) so the two never fall out of sync. Meant for
// quickly comparing GUI reskins live, not as a permanent settings UI.
export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

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

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { THEME_STORAGE_KEY, loadInitialTheme } from '../lib/themes';

// Single source of truth for the active GUI theme (see lib/themes.js), driven by the zone-matched
// auto theme (lib/background.js) — reads/writes through here so it never drifts out of sync with
// the actual data-theme attribute on <html>.
const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(loadInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = useCallback((next) => setThemeState(next), []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

// GUI reskins, auto-selected by lib/background.js to match the current zone/boss backdrop.
// "classic" is the original Minecraft chest-GUI look (no override) — everything else is applied
// by index.css's [data-theme="..."] blocks, which hijack the handful of Tailwind utility classes
// every page's chest-GUI chrome shares (slot/panel backgrounds, bevel borders, the
// equipped/selected highlight, the primary CTA button).
export const THEMES = [
  { id: 'classic', label: 'Classic' },
  { id: 'slate', label: 'Slate' },
  { id: 'parchment', label: 'Parchment' },
  { id: 'forest', label: 'Forest' },
  { id: 'frost', label: 'Frost' },
  { id: 'aurora', label: 'Aurora' },
  { id: 'nova', label: 'Nova' },
  { id: 'inferno', label: 'Inferno' },
];

export const THEME_STORAGE_KEY = 'skydmgTheme';

export function loadInitialTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return THEMES.some((t) => t.id === stored) ? stored : 'classic';
}

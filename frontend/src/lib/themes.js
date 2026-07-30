// Draft GUI reskins, switchable live via components/ThemeSwitcher.jsx. "classic" is the
// original Minecraft chest-GUI look (no override) — everything else is applied by
// index.css's [data-theme="..."] blocks, which hijack the handful of Tailwind utility
// classes every page's chest-GUI chrome shares (slot/panel backgrounds, bevel borders,
// the equipped/selected highlight, the primary CTA button). This is a deliberately
// low-invasion way to preview reskins across all ~20 pages at once without touching each
// page's markup — if one sticks, it should get promoted to real shared CSS custom
// properties/components instead of this override layer.
export const THEMES = [
  { id: 'classic', label: 'Classic' },
  { id: 'slate', label: 'Slate' },
  { id: 'parchment', label: 'Parchment' },
  { id: 'mono', label: 'Mono' },
  { id: 'forest', label: 'Forest' },
  { id: 'frost', label: 'Frost' },
  { id: 'ink', label: 'Ink' },
];

export const THEME_STORAGE_KEY = 'skydmgTheme';

export function loadInitialTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return THEMES.some((t) => t.id === stored) ? stored : 'classic';
}

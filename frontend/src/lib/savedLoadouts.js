// Shared localStorage-backed saved-loadouts list — used by Landing's Loadouts panel and by
// DamageSources' in-page loadout swapper, so both read/write the exact same storage key/shape.
export const SAVED_LOADOUTS_KEY = 'skydmgSavedLoadouts';

export function loadSavedLoadoutsFromStorage() {
  try {
    const raw = localStorage.getItem(SAVED_LOADOUTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

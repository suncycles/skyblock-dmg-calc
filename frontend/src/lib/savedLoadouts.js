import { useEffect, useState } from 'react';
import { decodeLoadoutCode } from './loadoutCode';
import { formatItemName } from './mcText';

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

// entry.id -> formatted Helmet name | '' (no helmet) | undefined (not decoded yet) — a saved
// loadout's code only holds item ids, so a preview needs a real decode per entry rather than
// just reading entry.name. Decoded lazily (only while `enabled`), since it's otherwise pure
// wasted work on every page load. Shared by Landing's Loadouts panel and Compare's loadout
// picker so both show the exact same preview for the same saved loadout.
// `itemDataLoading` must be threaded in from ItemDataContext: decoding against the still-EMPTY
// placeholder itemData (before its fetch resolves) silently finds no gear and caches a permanent
// wrong '' for that entry.id, since a cached id is never retried once ItemData finishes loading.
export function useSavedLoadoutHelmetPreviews(savedLoadouts, itemData, enabled, itemDataLoading) {
  const [previews, setPreviews] = useState({});

  useEffect(() => {
    if (!enabled || itemDataLoading) return;
    const pending = savedLoadouts.filter((entry) => !(entry.id in previews));
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates = {};
      for (const entry of pending) {
        try {
          const decoded = await decodeLoadoutCode(entry.code, itemData);
          const helmetName = decoded.loadout?.helmet?.item?.name;
          updates[entry.id] = helmetName ? formatItemName(helmetName) : '';
        } catch {
          updates[entry.id] = '';
        }
      }
      if (!cancelled) setPreviews((prev) => ({ ...prev, ...updates }));
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, savedLoadouts, itemData, previews, itemDataLoading]);

  return previews;
}

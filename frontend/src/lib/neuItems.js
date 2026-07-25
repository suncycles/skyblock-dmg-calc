// Fetches and caches real item lore for one-off tooltip lookups (reforge stones, upgrade items) directly from NEU-REPO by item id.

const NEU_ITEMS_BASE = 'https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/items';

const itemCache = new Map(); // itemId -> Promise<{displayname, lore} | null>

export function fetchNeuItem(itemId) {
  if (!itemId) return Promise.resolve(null);
  if (itemCache.has(itemId)) return itemCache.get(itemId);

  const promise = (async () => {
    try {
      const res = await fetch(`${NEU_ITEMS_BASE}/${encodeURIComponent(itemId.toUpperCase())}.json`);
      if (!res.ok) return null;
      const data = await res.json();
      return { displayname: data.displayname || null, lore: data.lore || [] };
    } catch {
      return null;
    }
  })();

  itemCache.set(itemId, promise);
  return promise;
}

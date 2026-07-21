/* Real item lore for one-off tooltip lookups (reforge stones like Dragon
   Claw/Wither Blood, upgrade items like The Art of War), sourced directly
   from NEU-REPO's item files (items/{ITEM_ID}.json) — same
   on-demand-fetch-with-cache pattern as enchantEffects.js's per-enchant
   lookups, and for the same reason: a handful of small, cacheable,
   on-demand lookups (only the item currently being hovered) don't need
   the worker's offline-preprocessing treatment.

   Matched by each feature's own real NEU-REPO internalname/item id (e.g.
   "DRAGON_CLAW", "THE_ART_OF_WAR") — not by whatever effect the item
   grants, since that's derived data, not the physical item's own
   identity. */

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

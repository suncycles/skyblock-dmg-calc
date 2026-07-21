/* Real reforge-stone item lore (Dragon Claw, Wither Blood, etc.), sourced
   directly from NEU-REPO's item files (items/{STONE_ID}.json) — same
   on-demand-fetch-with-cache pattern as enchantEffects.js's per-enchant
   lookups, and for the same reason: a handful of small, cacheable,
   on-demand lookups (only the stone currently being hovered) don't need
   the worker's offline-preprocessing treatment.

   Matched by stoneId (e.g. "DRAGON_CLAW"), which worker/src/index.js
   already carries per reforge-stone entry as each stone's real NEU-REPO
   internalName/item id — not by reforge name (e.g. "Fabled"), since
   that's the effect it grants, not the physical item's own identity. */

const NEU_ITEMS_BASE = 'https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/items';

const itemCache = new Map(); // stoneId -> Promise<{displayname, lore} | null>

export function fetchReforgeStoneItem(stoneId) {
  if (!stoneId) return Promise.resolve(null);
  if (itemCache.has(stoneId)) return itemCache.get(stoneId);

  const promise = (async () => {
    try {
      const res = await fetch(`${NEU_ITEMS_BASE}/${encodeURIComponent(stoneId.toUpperCase())}.json`);
      if (!res.ok) return null;
      const data = await res.json();
      return { displayname: data.displayname || null, lore: data.lore || [] };
    } catch {
      return null;
    }
  })();

  itemCache.set(stoneId, promise);
  return promise;
}

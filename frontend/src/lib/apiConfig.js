// Shared Cloudflare Worker origin (see worker/src/index.js) — the single source of truth for
// item/enchant/reforge/pet data plus the Hypixel import proxy. Used by both ItemDataContext.jsx
// (item catalog fetch/refresh) and lib/hypixelImport.js (the "import my gear" feature).
export const WORKER_BASE_URL = 'https://dmg-calc-cache.mich536ael.workers.dev';

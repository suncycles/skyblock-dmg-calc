// Cloudflare Pages Function — intercepts /loadout/:code so link-unfurling bots (Discord, Slack,
// Twitter) see the real gear list, since they never execute the SPA's client-side JS and would
// otherwise only see index.html's generic static <meta> tags. Real browser visits get the same
// rewritten HTML; React Router still owns the route once hydration kicks in, unaffected by the
// extra meta content.
//
// Reuses decodeLoadoutCode() as-is (same embedded-blob-or-KV-short-id resolution, v1/v2 format
// support) rather than re-implementing the decompression here — it's plain Web Standard APIs
// (CompressionStream/atob/fetch), no DOM/React dependency, so it runs unmodified in this runtime.
import { decodeLoadoutCode } from '../../src/lib/loadoutCode.js';
import { WORKER_BASE_URL } from '../../src/lib/apiConfig.js';

const GEAR_SLOT_ORDER = ['weapon', 'helmet', 'chestplate', 'leggings', 'boots', 'necklace', 'cloak', 'belt', 'gloves'];

function buildGearLines(loadout) {
  const lines = [];
  for (const slot of GEAR_SLOT_ORDER) {
    const entry = loadout[slot];
    if (!entry?.item) continue;
    const reforge = entry.modifiers?.reforge;
    lines.push(reforge ? `${reforge} ${entry.item.name}` : entry.item.name);
  }
  return lines;
}

// HTMLRewriter's setAttribute() escapes the value itself, so no manual HTML-escaping needed here.
class MetaContentRewriter {
  constructor(title, description, url) {
    this.title = title;
    this.description = description;
    this.url = url;
  }
  element(el) {
    const prop = el.getAttribute('property') || el.getAttribute('name');
    if (prop === 'og:title' || prop === 'twitter:title') el.setAttribute('content', this.title);
    else if (prop === 'og:description' || prop === 'twitter:description') el.setAttribute('content', this.description);
    else if (prop === 'og:url') el.setAttribute('content', this.url);
  }
}

export async function onRequestGet(context) {
  const { request, params, env } = context;
  const shell = await env.ASSETS.fetch(request);

  let title = 'SkyDmg Loadout';
  let description = 'A Hypixel Skyblock loadout built with SkyDmg — tap to view.';

  try {
    const itemData = await fetch(`${WORKER_BASE_URL}/api/items`).then((r) => r.json());
    const state = await decodeLoadoutCode(params.code, itemData);
    const lines = buildGearLines(state.loadout);
    if (lines.length > 0) description = lines.join('\n');
  } catch {
    // Invalid/expired code, or the item-data fetch failed — fall back to the generic copy above
    // rather than breaking the page for a preview-only feature.
  }

  return new HTMLRewriter().on('meta', new MetaContentRewriter(title, description, request.url)).transform(shell);
}

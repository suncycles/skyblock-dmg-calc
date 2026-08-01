/* Minecraft/Skyblock §-color-code parsing. Color table is vanilla Minecraft's 16 §-codes
   plus one app-only extension ('p', below). Rarity colors are Hypixel Skyblock's own. */

export const MC_COLORS = {
  0: '#000000', 1: '#0000aa', 2: '#00aa00', 3: '#00aaaa',
  4: '#aa0000', 5: '#aa00aa', 6: '#ffaa00', 7: '#aaaaaa',
  8: '#555555', 9: '#5555ff', a: '#55ff55', b: '#55ffff',
  c: '#ff5555', d: '#ff55ff', e: '#ffff55', f: '#ffffff',
  // 'p' is separate from 'd' to prevent color-collision with Gemstone stats.
  p: '#ff55fe',
  // 'q' is Master Stars' dungeonize-difference annotation — not a vanilla MC color.
  q: '#1d213d',
};

export const RARITY_COLORS = {
  common: 'f', uncommon: 'a', rare: '9', epic: '5', legendary: '6',
  mythic: 'd', divine: 'b', supreme: '4', special: 'c', very_special: 'c', admin: '4',
};

export function rarityColorCode(tier) {
  return RARITY_COLORS[(tier || 'common').toLowerCase()] || 'f';
}

// CSS filter for a rarity-colored glow around an icon's own alpha shape (drop-shadow, not a
// box — so it hugs the item's silhouette instead of drawing a rectangle behind it). Used on
// equipped-slot icons so the glow tracks the item's rarity and updates automatically whenever
// that rarity changes (recomb, star upgrades, etc.) since it's recomputed on every render.
export function rarityGlowFilter(tier) {
  if (!tier) return undefined;
  const hex = MC_COLORS[rarityColorCode(tier)];
  return `drop-shadow(0 0 3px ${hex}) drop-shadow(0 0 6px ${hex})`;
}

// Max-stat "starred" items lead with a glyph from Hypixel's own font (tofu in a browser) — swapped for a real renderable symbol.
const STARRED_GLYPH = '';
export function formatItemName(name) {
  if (!name) return name;
  return name.replace(STARRED_GLYPH, '⚕');
}

// Parses a §-formatted line into {text, color, bold, italic, underline, strikethrough} segments. Framework-agnostic.
export function parseMinecraftLine(text) {
  const segments = [];
  let color = MC_COLORS[7];
  let bold = false, italic = false, underline = false, strikethrough = false;
  let buffer = '';

  function flush() {
    if (!buffer) return;
    segments.push({ text: buffer, color, bold, italic, underline, strikethrough });
    buffer = '';
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '§' && i + 1 < text.length) {
      flush();
      const code = text[i + 1].toLowerCase();
      if (MC_COLORS[code]) {
        color = MC_COLORS[code];
        bold = italic = underline = strikethrough = false;
      } else if (code === 'l') bold = true;
      else if (code === 'o') italic = true;
      else if (code === 'n') underline = true;
      else if (code === 'm') strikethrough = true;
      else if (code === 'r') {
        color = MC_COLORS[7];
        bold = italic = underline = strikethrough = false;
      }
      i++;
      continue;
    }
    buffer += ch;
  }
  flush();
  return segments;
}

/* Minecraft/Skyblock §-color-code parsing. Color table is vanilla
   Minecraft's 16 §-codes. Rarity colors are Hypixel Skyblock's, verified
   against NEU-REPO's own constants/misc.json "tier_colors" (the same
   data source the worker pulls from). */

export const MC_COLORS = {
  0: '#000000', 1: '#0000aa', 2: '#00aa00', 3: '#00aaaa',
  4: '#aa0000', 5: '#aa00aa', 6: '#ffaa00', 7: '#aaaaaa',
  8: '#555555', 9: '#5555ff', a: '#55ff55', b: '#55ffff',
  c: '#ff5555', d: '#ff55ff', e: '#ffff55', f: '#ffffff',
};

export const RARITY_COLORS = {
  common: 'f', uncommon: 'a', rare: '9', epic: '5', legendary: '6',
  mythic: 'd', divine: 'b', supreme: '4', special: 'c', very_special: 'c', admin: '4',
};

export function rarityColorCode(tier) {
  return RARITY_COLORS[(tier || 'common').toLowerCase()] || 'f';
}

// Hypixel renders max-stat "starred" items with a leading glyph from its own
// bundled font (U+E068, Private Use Area) — without that font it shows as
// tofu/nothing in a browser, so swap it for a real, renderable symbol
// wherever an item name is displayed as plain text.
const STARRED_GLYPH = '';
export function formatItemName(name) {
  if (!name) return name;
  return name.replace(STARRED_GLYPH, '⚕');
}

// Parses a single line of real Minecraft §-formatted text (colors 0-9a-f,
// plus l/o/n/m for bold/italic/underline/strikethrough, r to reset) into
// an array of {text, color, bold, italic, underline, strikethrough}
// segments. A color code resets active formatting, matching vanilla
// behavior. Framework-agnostic — callers render the segments.
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

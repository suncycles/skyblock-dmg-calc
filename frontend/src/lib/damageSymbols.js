// Symbol + color for every stat/mob-type keyword the Damage Sources page
// can mention, so any occurrence gets a colored glyph prefixed in front of
// it. Colors reuse lib/mcText.js's real Minecraft §-code hex palette
// (this app's existing convention) rather than inventing new ones.
//
// Stat symbols/colors are exactly as given. Mob type symbols are sourced
// from the Hypixel Skyblock wiki's Template:MobType (the real per-type
// glyph + §-color Hypixel itself uses in the in-game Bestiary) wherever
// not explicitly overridden below — cross-checking confirmed nearly every
// given color already matches Hypixel's real in-game color for that type.
// Two deliberate exceptions:
//  - Skeletal: real glyph is 🦴 (an actual color emoji, can't be
//    recolored via CSS) — substituted with † to stay a plain, colorable
//    glyph while keeping the death/bones association alongside Wither's
//    ☠ and Undead's ༕.
//  - Glacial: real in-game color is white, identical to Frozen's — kept
//    distinct here (light blue) since both types can appear in this UI
//    and would otherwise be visually indistinguishable.
// Construct's "light grey" isn't one of the 16 vanilla §-codes (its real
// in-game color is the same plain grey as Airborne) — given its own
// slightly lighter custom hex to stay distinguishable from Airborne/
// Skeletal's grey.

import { MC_COLORS } from './mcText';

export const STAT_SYMBOLS = {
  Health: { symbol: '❤', color: MC_COLORS.c },
  Defense: { symbol: '❈', color: MC_COLORS['5'] },
  'True Defense': { symbol: '❂', color: MC_COLORS.f },
  Strength: { symbol: '❁', color: MC_COLORS.c },
  'Crit Chance': { symbol: '☣', color: MC_COLORS['9'] },
  'Crit Damage': { symbol: '☠', color: MC_COLORS['9'] },
  'Attack Speed': { symbol: '⚔', color: MC_COLORS.e },
  Ferocity: { symbol: '⫽', color: MC_COLORS.c },
  Intelligence: { symbol: '✎', color: MC_COLORS.b },
};

export const MOB_TYPE_SYMBOLS = {
  Airborne: { symbol: '✈', color: MC_COLORS['7'] },
  Animal: { symbol: '☮', color: MC_COLORS.a },
  // U+FE0E forces text (not color-emoji) presentation — verified by canvas
  // pixel-sampling that ⚓ alone, of all 32 glyphs in this file, otherwise
  // renders with its own fixed color regardless of CSS `color`. Same fix
  // Hypixel's own wiki template already applies to Construct's ⚙.
  Aquatic: { symbol: '⚓︎', color: MC_COLORS['9'] },
  Arcane: { symbol: '♃', color: MC_COLORS['5'] },
  Arthropod: { symbol: 'Ж', color: MC_COLORS['4'] },
  Construct: { symbol: '⚙', color: '#cccccc' },
  Cubic: { symbol: '⧈', color: MC_COLORS.a },
  Elusive: { symbol: '⌕', color: MC_COLORS.d },
  Ender: { symbol: '⊙', color: MC_COLORS['5'] },
  Frozen: { symbol: '❆', color: MC_COLORS.f },
  Glacial: { symbol: '❅', color: MC_COLORS.b },
  Humanoid: { symbol: '✰', color: MC_COLORS.e },
  Infernal: { symbol: '♨', color: MC_COLORS['4'] },
  Magmatic: { symbol: '♆', color: MC_COLORS.c },
  Mythological: { symbol: '✿', color: MC_COLORS['2'] },
  Pest: { symbol: 'ൠ', color: MC_COLORS['2'] },
  Shielded: { symbol: '⛨', color: MC_COLORS.e },
  Skeletal: { symbol: '†', color: MC_COLORS['7'] },
  Spooky: { symbol: '☽', color: MC_COLORS['6'] },
  Subterranean: { symbol: '⸕', color: MC_COLORS['6'] },
  Undead: { symbol: '༕', color: MC_COLORS['2'] },
  Wither: { symbol: '☠', color: MC_COLORS['8'] },
  Woodland: { symbol: '⸙', color: MC_COLORS['2'] },
};

export const KEYWORD_SYMBOLS = { ...STAT_SYMBOLS, ...MOB_TYPE_SYMBOLS };

// Text this app renders elsewhere sometimes spells a keyword differently
// than its canonical form above (lib/reforgeData.js's STAT_LABELS already
// shortens "Bonus Attack Speed" to "Attack Speed" for base-stat display,
// but real NEU-REPO enchant lore may still spell it out in full).
const ALIASES = { 'Bonus Attack Speed': 'Attack Speed' };

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Longest-name-first so multi-word keywords ("True Defense", "Crit
// Chance") are matched as one unit rather than a shorter keyword
// partially matching inside them.
const ALL_NAMES = [...Object.keys(KEYWORD_SYMBOLS), ...Object.keys(ALIASES)].sort((a, b) => b.length - a.length);
const KEYWORD_RE = new RegExp(`\\b(${ALL_NAMES.map(escapeRegExp).join('|')})\\b`, 'gi');
const LOOKUP = new Map(ALL_NAMES.map((name) => [name.toLowerCase(), ALIASES[name] || name]));

// Splits text into a mix of plain strings and {keyword, matchedText}
// pieces for a component to render with the keyword's symbol/color.
// matchedText preserves the source's original casing; keyword is the
// canonical name used to look up KEYWORD_SYMBOLS.
export function splitKeywords(text) {
  if (!text) return [text];
  const parts = [];
  let lastIndex = 0;
  for (const match of text.matchAll(KEYWORD_RE)) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push({ keyword: LOOKUP.get(match[0].toLowerCase()), matchedText: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

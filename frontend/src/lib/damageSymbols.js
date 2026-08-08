// Symbol + color for every stat/mob-type keyword the Damage Sources page can mention, so any
// occurrence gets a colored glyph prefixed in front of it. Mob type symbols/colors are
// sourced from Hypixel's own in-game Bestiary glyphs, with 3 deliberate deviations: Skeletal
// uses † instead of the real 🦴 emoji (can't be recolored via CSS); Glacial is kept a distinct
// light blue instead of matching Frozen's white so the two stay visually distinguishable;
// Construct gets its own light grey instead of matching Airborne's, for the same reason.

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
  'Ability Damage': { symbol: '꩜', color: MC_COLORS.c },
};

export const MOB_TYPE_SYMBOLS = {
  Airborne: { symbol: '✈', color: MC_COLORS['7'] },
  Animal: { symbol: '☮', color: MC_COLORS.a },
  // U+FE0E forces text (not color-emoji) presentation, so CSS `color` actually applies.
  Aquatic: { symbol: '⚓︎', color: MC_COLORS['9'] },
  Arcane: { symbol: '♃', color: MC_COLORS['5'] },
  Arthropod: { symbol: 'Ж', color: MC_COLORS['4'] },
  Boss: { symbol: '♛', color: MC_COLORS['6'] },
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

// Alternate spellings this app sees elsewhere for a canonical keyword above.
const ALIASES = { 'Bonus Attack Speed': 'Attack Speed' };

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Longest-name-first so multi-word keywords match as one unit rather than a shorter keyword matching inside them.
const ALL_NAMES = [...Object.keys(KEYWORD_SYMBOLS), ...Object.keys(ALIASES)].sort((a, b) => b.length - a.length);
const KEYWORD_RE = new RegExp(`\\b(${ALL_NAMES.map(escapeRegExp).join('|')})\\b`, 'gi');
const LOOKUP = new Map(ALL_NAMES.map((name) => [name.toLowerCase(), ALIASES[name] || name]));

// Splits text into plain strings and {keyword, matchedText} pieces for rendering with the keyword's symbol/color.
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

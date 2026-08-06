// Shared display helpers for damage-result pages (DamageSources.jsx, Compare.jsx) — kept in one
// place so both pages format numbers and stat keywords identically.

import { splitKeywords, KEYWORD_SYMBOLS } from './damageSymbols';

export const BASE_STAT_KEYS = [
  'damage',
  'strength',
  'crit_chance',
  'crit_damage',
  'intelligence',
  'ability_damage',
  'bonus_attack_speed',
  'ferocity',
];

// Prefixes every stat/mob-type keyword mention with its colored glyph (lib/damageSymbols.js).
export function Keyworded({ text }) {
  return splitKeywords(text).map((part, i) =>
    typeof part === 'string' ? (
      <span key={i}>{part}</span>
    ) : (
      <span key={i} style={{ color: KEYWORD_SYMBOLS[part.keyword].color }}>
        {KEYWORD_SYMBOLS[part.keyword].symbol} {part.matchedText}
      </span>
    ),
  );
}

export function round1(n) {
  return Math.round(n * 10) / 10;
}

// Multiplicative sources can be much finer-grained than 1-decimal % entries (Skyblock Level is +0.0001x/level).
export function round4(n) {
  return Math.round(n * 10000) / 10000;
}

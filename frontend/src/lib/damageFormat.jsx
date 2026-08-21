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

// 3 significant figures (not a fixed decimal count) — for "+X% DPS" optimizer text, where a
// small candidate's real increase (e.g. 0.512%) needs more decimal precision to stay meaningful
// than a large one (373%) does.
export function round3Sig(n) {
  if (!n) return 0;
  const magnitude = Math.floor(Math.log10(Math.abs(n)));
  const factor = Math.pow(10, 2 - magnitude);
  return Math.round(n * factor) / factor;
}

// Multiplicative sources can be much finer-grained than 1-decimal % entries (Skyblock Level is +0.0001x/level).
export function round4(n) {
  return Math.round(n * 10000) / 10000;
}

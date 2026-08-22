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

// Abbreviates a coin amount at the million/billion/trillion scale (3 significant figures via
// round3Sig, e.g. 1,599,994.7 -> "1.6M", 210,263,467 -> "210M") — below a million it's just the
// plain comma-formatted number, since "0.05M" reads worse than "50,000". Non-numeric input (the
// '?' unpriced sentinel) passes through unchanged rather than throwing.
export function formatCoinsShort(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return String(n);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${sign}${round3Sig(abs / 1e12)}T`;
  if (abs >= 1e9) return `${sign}${round3Sig(abs / 1e9)}B`;
  if (abs >= 1e6) return `${sign}${round3Sig(abs / 1e6)}M`;
  return n.toLocaleString();
}

// Coins spent per 1% real damage increase — the inverse of the Optimizer's internal sort ratio
// (percentIncrease/cost), shown instead since that raw ratio reads as an unreadable tiny decimal
// (e.g. 4.48e-8) across a cost range spanning single coins to billions. Coins-per-percent stays a
// plain, familiar coin amount at any scale, same as every other price already on screen — and the
// sort itself is untouched, this is display-only. Returns null when cost isn't a real number
// (the '?' unpriced sentinel) or percentIncrease isn't positive.
export function formatCoinsPerPercent(cost, percentIncrease) {
  if (typeof cost !== 'number' || !(percentIncrease > 0)) return null;
  return formatCoinsShort(Math.round(cost / percentIncrease));
}

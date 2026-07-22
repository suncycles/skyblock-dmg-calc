// Shorthand number parsing for large-value text inputs (Coins Consumed,
// Price Paid at Dark Auction, Coins in Bank, etc) — "1b" -> 1e9, "100m"
// -> 1e8, "5k" -> 5000, matching the k/m/b/t shorthand players already
// use when talking about Skyblock coin amounts. A plain number with no
// suffix parses the same as before.
const SUFFIX_MULTIPLIERS = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };

export function parseShorthandNumber(input) {
  if (input == null) return 0;
  const str = String(input).trim().toLowerCase().replace(/,/g, '');
  if (!str) return 0;
  const match = /^(-?[\d.]+)\s*([kmbt])?$/.exec(str);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  if (Number.isNaN(num)) return 0;
  const suffix = match[2];
  return Math.round(suffix ? num * SUFFIX_MULTIPLIERS[suffix] : num);
}

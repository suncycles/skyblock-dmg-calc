import { mergeStatIntoBase } from './statLines';

/* Weapon-specific ability mechanics that don't fit the generic Books/
   Gemstones/Reforges pipeline — each is a single player-supplied number
   (Bestiary tiers, Dark Auction price paid, purse coins) that scales a
   bonus baked into that weapon's own real NEU-REPO lore. Only these
   seven ids ever show the Special button; every other weapon has none
   of these mechanics.

   Midas' Sword/Staff's "Greed" ability scales via a piecewise curve
   Hypixel has never officially published (community wikis disagree on
   the exact breakpoints) — approximated here as linear from 0 coins/0
   bonus to the price cap/max bonus, both endpoints verified directly
   from each item's own NEU-REPO lore. Daedalus Blade and Emerald
   Blade's formulas are stated outright in their own lore and applied
   exactly. */

const SPECIAL_COLOR = 'b'; // aqua — distinct from Books (e), Art of War (6), Reforges (9), Gemstones (d)

export const SPECIAL_WEAPON_CONFIG = {
  DAEDALUS_AXE: {
    kind: 'bestiary',
    perTierDamagePercent: 1,
    perTierMagicFind: 0.2,
    inputLabel: 'Combined Mythological Bestiary Tiers',
  },
  STARRED_DAEDALUS_AXE: {
    kind: 'bestiary',
    perTierDamagePercent: 1.5,
    perTierMagicFind: 0.3,
    inputLabel: 'Combined Mythological Bestiary Tiers',
  },
  MIDAS_SWORD: {
    kind: 'midasSword',
    maxBonus: 120,
    priceCap: 50_000_000,
    inputLabel: 'Price Paid at Dark Auction (coins)',
  },
  STARRED_MIDAS_SWORD: {
    kind: 'midasSword',
    maxBonus: 225,
    priceCap: 250_000_000,
    inputLabel: 'Price Paid at Dark Auction (coins)',
  },
  MIDAS_STAFF: {
    kind: 'midasStaff',
    maxBonus: 26_000,
    priceCap: 100_000_000,
    inputLabel: 'Price Paid at Dark Auction (coins)',
  },
  STARRED_MIDAS_STAFF: {
    kind: 'midasStaff',
    maxBonus: 34_000,
    priceCap: 500_000_000,
    inputLabel: 'Price Paid at Dark Auction (coins)',
  },
  EMERALD_BLADE: {
    kind: 'emeraldBlade',
    purseCap: 2_000_000_000,
    inputLabel: 'Coins in Purse',
  },
  // Not a weapon at all (it's the real LEGENDARY HELMET "Crown of
  // Avarice"), but its "Overindulgence" ability is the exact same
  // single-free-form-number-scales-a-live-lore-value shape as the seven
  // weapons above, so it reuses this whole mechanism rather than a
  // separate one. Its own lore states the formula outright: +2.5 Magic
  // Find and +0.015x (1.5%) Damage per digit of Coins Consumed (verified
  // directly from NEU-REPO — 0 coins consumed shows "+1x Damage"/"+0
  // Magic Find" in the item's own pristine lore, i.e. digit count of 0
  // coins is 0, not 1).
  CROWN_OF_AVARICE: {
    kind: 'crownOfAvarice',
    magicFindPerDigit: 2.5,
    damagePercentPerDigit: 1.5,
    inputLabel: 'Coins Consumed',
  },
};

export function getSpecialConfig(weaponId) {
  return (weaponId && SPECIAL_WEAPON_CONFIG[weaponId]) || null;
}

function linearBonus(value, cap, maxBonus) {
  const clamped = Math.max(0, Math.min(value || 0, cap));
  return cap > 0 ? Math.round((clamped / cap) * maxBonus) : 0;
}

export function computeSpecialBonus(config, value) {
  if (!config) return 0;
  const v = Math.max(0, value || 0);
  switch (config.kind) {
    case 'bestiary':
      return +(v * config.perTierDamagePercent).toFixed(1);
    case 'midasSword':
    case 'midasStaff':
      return linearBonus(v, config.priceCap, config.maxBonus);
    case 'emeraldBlade':
      return +(2.5 * Math.min(v, config.purseCap) ** 0.25).toFixed(1);
    case 'crownOfAvarice':
      // Digit count of coins consumed — 0 has 0 digits, matching the
      // item's own pristine "+1x Damage"/"+0 Magic Find" lore at 0.
      return v === 0 ? 0 : Math.floor(Math.log10(v)) + 1;
    default:
      return 0;
  }
}

// Crown of Avarice's two per-digit bonuses, derived from the digit count
// computeSpecialBonus already returns for it — split out since (unlike
// every other special kind here) it drives two independently-formatted
// lore lines instead of one.
export function crownOfAvariceStats(config, digits) {
  return {
    magicFind: +(digits * config.magicFindPerDigit).toFixed(2),
    damageMultiplier: +(1 + (digits * config.damagePercentPerDigit) / 100).toFixed(3),
  };
}

// Unlike Daedalus Blade/Emerald Blade/Crown of Avarice, Midas Sword/
// Staff's real NEU-REPO lore has no live "Price Paid" counter line at all
// — just static text explaining the mechanic. Inserted here as its own
// blank-line-bounded paragraph right before the "This item can be
// reforged!" footer, matching where those other items' own live-counter
// paragraphs sit, with the same comma-grouped number formatting their
// lore already uses for coin amounts (e.g. "50,000,000").
function insertPriceCounterLine(lore, value) {
  const reforgeIdx = lore.findIndex((l) => l.includes('This item can be reforged'));
  const line = `§7Price Paid: §6${Math.max(0, value || 0).toLocaleString('en-US')}`;
  const insertAt = reforgeIdx > 0 && lore[reforgeIdx - 1] === '' ? reforgeIdx - 1 : reforgeIdx;
  if (insertAt === -1) return [...lore, '', line];
  return [...lore.slice(0, insertAt), '', line, ...lore.slice(insertAt)];
}

// Daedalus Blade and Emerald Blade's own NEU-REPO lore already ships a
// "live value" line seeded at 0 (Daedalus's "Bestiary Tiers: 0" block,
// Emerald Blade's "Current Damage Bonus: 0.0") — patched in place so the
// tooltip reads exactly like the real item would.
export function applySpecialToLore(lore, weaponId, value) {
  const config = getSpecialConfig(weaponId);
  if (!config || !lore) return lore;
  const bonus = computeSpecialBonus(config, value);

  if (config.kind === 'bestiary') {
    const magicFind = +(Math.max(0, value || 0) * config.perTierMagicFind).toFixed(1);
    return lore.map((line) => {
      if (line.includes('Bestiary Tiers:')) return line.replace(/§3\d+$/, `§3${Math.max(0, value || 0)}`);
      // The real lore embeds a private-use-area icon glyph right after the
      // number (e.g. "+0% Damage") — matching on adjacency (regex
      // \s*, or a literal "+0 ") misses it, so just check both substrings
      // are present anywhere on the line instead.
      if (line.includes('+0%') && line.includes('Damage')) return line.replace('+0%', `+${bonus}%`);
      if (line.includes('+0') && line.includes('Magic Find')) return line.replace('+0', `+${magicFind}`);
      return line;
    });
  }

  if (config.kind === 'emeraldBlade') {
    return lore.map((line) =>
      line.includes('Current Damage Bonus:') ? line.replace(/[\d.]+$/, bonus.toFixed(1)) : line,
    );
  }

  if (config.kind === 'midasSword') {
    const withCounter = insertPriceCounterLine(lore, value);
    if (!bonus) return withCounter;
    // Merged directly into the base Damage/Strength numbers (not an
    // appended "(+X)" annotation) — Greed's bonus is described in the
    // item's own lore as part of what the sword's stats *are* at a given
    // price paid, not an external buff layered on top.
    const insertIdx = withCounter.indexOf('');
    return mergeStatIntoBase(withCounter, { damage: bonus, strength: bonus }, insertIdx);
  }

  if (config.kind === 'midasStaff') {
    const withCounter = insertPriceCounterLine(lore, value);
    if (!bonus) return withCounter;
    const insertIdx = withCounter.indexOf('');
    // No pre-existing "Ability Damage" base line to merge into (Midas
    // Staff's lore doesn't have one), so this is inserted directly as the
    // value itself, same "it's just the base now" treatment as the sword.
    const line = `§7Ability Damage Bonus: §${SPECIAL_COLOR}+${bonus}`;
    if (insertIdx === -1) return [...withCounter, line];
    return [...withCounter.slice(0, insertIdx), line, ...withCounter.slice(insertIdx)];
  }

  if (config.kind === 'crownOfAvarice') {
    const digits = bonus;
    if (!digits) return lore; // pristine lore already reads Coins Consumed: 0 / +1x Damage / +0 Magic Find
    const { magicFind, damageMultiplier } = crownOfAvariceStats(config, digits);
    return lore.map((line) => {
      if (line.includes('Coins Consumed:')) return line.replace(/§6\d+$/, `§6${Math.max(0, value || 0)}`);
      if (line.includes('+1x') && line.includes('Damage')) return line.replace('+1x', `+${damageMultiplier}x`);
      if (line.includes('+0') && line.includes('Magic Find')) return line.replace('+0', `+${magicFind}`);
      return line;
    });
  }

  return lore;
}

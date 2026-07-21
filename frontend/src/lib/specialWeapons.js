import { annotateStatLines } from './statLines';

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
    default:
      return 0;
  }
}

// Daedalus Blade and Emerald Blade's own NEU-REPO lore already ships a
// "live value" line seeded at 0 (Daedalus's "Bestiary Tiers: 0" block,
// Emerald Blade's "Current Damage Bonus: 0.0") — patched in place so the
// tooltip reads exactly like the real item would. Midas Sword/Staff have
// no such line: Sword's bonus applies to stats the lore already lists
// (or omits when 0, e.g. Strength) via the same annotateStatLines helper
// Books/Reforges use; Staff's is Ability Damage, which isn't a stat line
// at all, so it gets a new inserted line instead.
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
    if (!bonus) return lore;
    const insertIdx = lore.indexOf('');
    return annotateStatLines(lore, { damage: bonus, strength: bonus }, SPECIAL_COLOR, insertIdx);
  }

  if (config.kind === 'midasStaff') {
    if (!bonus) return lore;
    const insertIdx = lore.indexOf('');
    const line = `§7Ability Damage Bonus: §${SPECIAL_COLOR}+${bonus}`;
    if (insertIdx === -1) return [...lore, line];
    return [...lore.slice(0, insertIdx), line, ...lore.slice(insertIdx)];
  }

  return lore;
}

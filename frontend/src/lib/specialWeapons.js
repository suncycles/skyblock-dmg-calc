import { mergeStatIntoBase } from './statLines';

/* Weapon-specific ability mechanics that don't fit the generic Books/Gemstones/Reforges
   pipeline — each is a single player-supplied number that scales a bonus baked into that
   weapon's own real NEU-REPO lore. Only these ids show the Special button.

   Midas' Sword/Staff's Greed ability is approximated as linear from 0 coins/0 bonus to the
   price cap/max bonus (Hypixel has never published the real piecewise curve). Daedalus
   Blade and Emerald Blade's formulas are stated outright in their own lore. */

const SPECIAL_COLOR = 'b'; // aqua — distinct from Books (e), Art of War (6), Reforges (9), Gemstones (d)

// Daedalus Blade's Taming-level Damage bonus (its pet-stat-copy half isn't modeled).
const DAEDALUS_TAMING_DAMAGE_PER_LEVEL = { DAEDALUS_AXE: 4, STARRED_DAEDALUS_AXE: 5 };

export function computeDaedalusTamingBonus(itemId, tamingLevel) {
  const rate = DAEDALUS_TAMING_DAMAGE_PER_LEVEL[itemId];
  if (!rate || !tamingLevel) return {};
  return { damage: rate * tamingLevel };
}

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
  // Not a weapon (it's the LEGENDARY HELMET Crown of Avarice), but its Overindulgence
  // ability is the same single-number-scales-a-lore-value shape, so it reuses this mechanism.
  CROWN_OF_AVARICE: {
    kind: 'crownOfAvarice',
    magicFindPerDigit: 2.5,
    damagePercentPerDigit: 1.5,
    inputLabel: 'Coins Consumed',
  },
  // David's Cloak has no published Strength formula — modeled as a direct player-entered value.
  DAVIDS_CLOAK: {
    kind: 'flatStrength',
    max: 50,
    inputLabel: 'Base Strength Adjustment',
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
      // Digit count of coins consumed — 0 has 0 digits.
      return v === 0 ? 0 : Math.floor(Math.log10(v)) + 1;
    case 'flatStrength':
      return Math.min(v, config.max);
    default:
      return 0;
  }
}

// Crown of Avarice's two per-digit bonuses, derived from the digit count computeSpecialBonus returns.
export function crownOfAvariceStats(config, digits) {
  return {
    magicFind: +(digits * config.magicFindPerDigit).toFixed(2),
    damageMultiplier: +(1 + (digits * config.damagePercentPerDigit) / 100).toFixed(3),
  };
}

// Midas Sword/Staff's lore has no live "Price Paid" counter — inserted as its own paragraph before the "This item can be reforged!" footer.
function insertPriceCounterLine(lore, value) {
  const reforgeIdx = lore.findIndex((l) => l.includes('This item can be reforged'));
  const line = `§7Price Paid: §6${Math.max(0, value || 0).toLocaleString('en-US')}`;
  const insertAt = reforgeIdx > 0 && lore[reforgeIdx - 1] === '' ? reforgeIdx - 1 : reforgeIdx;
  if (insertAt === -1) return [...lore, '', line];
  return [...lore.slice(0, insertAt), '', line, ...lore.slice(insertAt)];
}

// Patches each weapon's own live-value lore line in place (Daedalus's Bestiary Tiers, Emerald Blade's Current Damage Bonus, etc.).
export function applySpecialToLore(lore, weaponId, value) {
  const config = getSpecialConfig(weaponId);
  if (!config || !lore) return lore;
  const bonus = computeSpecialBonus(config, value);

  if (config.kind === 'bestiary') {
    const magicFind = +(Math.max(0, value || 0) * config.perTierMagicFind).toFixed(1);
    return lore.map((line) => {
      if (line.includes('Bestiary Tiers:')) return line.replace(/§3\d+$/, `§3${Math.max(0, value || 0)}`);
      // Real lore embeds a glyph right after the number — match on substring presence rather than adjacency.
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
    // Merged into the base Damage/Strength numbers, not an appended annotation.
    const insertIdx = withCounter.indexOf('');
    return mergeStatIntoBase(withCounter, { damage: bonus, strength: bonus }, insertIdx);
  }

  if (config.kind === 'midasStaff') {
    const withCounter = insertPriceCounterLine(lore, value);
    if (!bonus) return withCounter;
    const insertIdx = withCounter.indexOf('');
    // No pre-existing "Ability Damage" line to merge into — inserted directly as the base value.
    const line = `§7Ability Damage Bonus: §${SPECIAL_COLOR}+${bonus}`;
    if (insertIdx === -1) return [...withCounter, line];
    return [...withCounter.slice(0, insertIdx), line, ...withCounter.slice(insertIdx)];
  }

  if (config.kind === 'flatStrength') {
    if (!bonus) return lore;
    // No pristine Strength line on David's Cloak — inserted as a brand-new base-stat line.
    return mergeStatIntoBase(lore, { strength: bonus }, lore.indexOf(''));
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

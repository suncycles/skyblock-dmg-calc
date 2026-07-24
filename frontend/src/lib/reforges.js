import { annotateStatLines, mergeStatIntoBase } from './statLines';
import { getReforgeStatBonus } from './reforgeData';
import { computeAncientReforgeCritDamage } from './playerStats';

// §9 (blue) — distinct from Gemstones' pink and Books' green.
export const REFORGE_COLOR = '9';

// The Ancient reforge's real per-rarity reforgeStats table (fetched live
// from NEU-REPO's constants/reforgestones.json) has a stray crit_damage
// number for COMMON only (a stale snapshot artifact) and nothing for the
// other 5 rarities — its actual mechanic, per its own reforgeAbility
// text, is +1 Crit Damage per Catacombs level at every rarity, so that
// static field is always overridden with the real dynamic value here.
const ANCIENT_REFORGE_NAME = 'Ancient';

// Fabled (Dragon Claw stone, any Sword) — real reforgeAbility text
// (reforgestones.json, fetched this session): "Critical hits have a
// chance to deal up to §a15% §7extra damage." Fixed at every rarity
// (unlike Fabled's own strength/crit-damage table, which does scale by
// rarity and is already handled generically via reforgeStats above).
export const FABLED_REFORGE_NAME = 'Fabled';
export const FABLED_CRIT_BONUS_MAX_PERCENT = 15;

// Fabled's crit-damage-chance bonus makes a hit's real output damage a
// range, not a fixed number — reflected as a short explainer block
// appended at the very bottom of the tooltip (after everything else,
// including the recomb/rarity lines) stating it as a Final-Damage-style
// range. The item's own "Damage:" stat line is left untouched (it's the
// weapon's real base stat, not a live value Fabled changes) — the range
// is purely a Final Damage concern, computed separately in
// lib/damageSources.js/DamageSources.jsx via the multiplicative bucket.
export function applyFabledToLore(lore, reforgeName) {
  if (reforgeName !== FABLED_REFORGE_NAME) return lore;
  const factor = 1 + FABLED_CRIT_BONUS_MAX_PERCENT / 100;

  const explainer = [
    '',
    '§6Fabled Bonus',
    '§7Critical hits have a chance to deal up to',
    `§a+${FABLED_CRIT_BONUS_MAX_PERCENT}% §7extra damage §7(${factor}x).`,
    `§7Final Damage: §a(0% boost) ~ (+${FABLED_CRIT_BONUS_MAX_PERCENT}% boost)`,
  ];
  const insertAt = lore.findIndex((l) => l.includes('This item can be reforged'));
  if (insertAt === -1) return [...lore, ...explainer];
  const cut = insertAt > 0 && lore[insertAt - 1] === '' ? insertAt - 1 : insertAt;
  return [...lore.slice(0, cut), ...explainer, ...lore.slice(cut)];
}

export function applyReforgeToLore(lore, reforgeName, reforge, itemTier, insertBeforeLineIdx, catacombsLevel) {
  if (!reforge) return lore;
  const bonus = { ...getReforgeStatBonus(reforge, itemTier) };

  if (reforgeName === ANCIENT_REFORGE_NAME) {
    const critDamage = computeAncientReforgeCritDamage(catacombsLevel);
    if (critDamage > 0) bonus.crit_damage = critDamage;
    else delete bonus.crit_damage;
  }

  if (Object.keys(bonus).length === 0) return lore;
  // Merged directly into the item's own base stat number (a reforged
  // item's real tooltip shows its TOTAL stat, reforge bonus included, not
  // a separate modifier — same "improves the base stats" treatment as
  // Stars/Gemstones) — the reforge's own delta is still called out with
  // its usual blue "(+X)" annotation on top, purely for visibility; by
  // the time this runs every bonus key already has a real line to
  // annotate (mergeStatIntoBase created one if the item didn't have it
  // pristinely), so this never needs to synthesize a line itself.
  const merged = mergeStatIntoBase(lore, bonus, insertBeforeLineIdx);
  return annotateStatLines(merged, bonus, REFORGE_COLOR, insertBeforeLineIdx);
}

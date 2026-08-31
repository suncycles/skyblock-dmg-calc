import { annotateStatLines, mergeStatIntoBase } from './statLines';
import { getReforgeStatBonus } from './reforgeData';
import { computeAncientReforgeCritDamage, computeWitheredReforgeStrength } from './playerStats';
import { LOVING_REFORGE_NAME } from './abilityDamage';

// §9 (blue) — distinct from Gemstones' pink and Books' green.
export const REFORGE_COLOR = '9';

// The Ancient reforge's real mechanic is +1 Crit Damage per Catacombs level at every
// rarity — its bundled reforgeStats table is a stale snapshot, so always overridden here.
const ANCIENT_REFORGE_NAME = 'Ancient';

// Withered (Wither Blood stone): flat per-rarity Strength (its bundled reforgeStats table is
// correct) PLUS a separate "Withered Bonus" of +1 Strength/Catacombs level, stacked on top.
const WITHERED_REFORGE_NAME = 'Withered';

// Fabled (Dragon Claw stone, any Sword): "Critical hits have a chance to deal up to +15% extra damage," fixed at every rarity.
export const FABLED_REFORGE_NAME = 'Fabled';
export const FABLED_CRIT_BONUS_MAX_PERCENT = 15;

// Fabled's crit-chance bonus makes real output damage a range, not a fixed number — shown as
// an explainer block at the bottom of the tooltip. The item's own "Damage:" line is left
// untouched; the range itself is computed separately via the multiplicative bucket.
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

// The real stat bonus a given reforge grants on a given item — every name-specific override
// (Ancient/Withered/Loving) lives here so both applyReforgeToLore and anything else that needs to
// know "what does this reforge actually give" (lib/hypixelImport.js, recovering a live-imported
// item's pristine pre-reforge base — see its own comment) share one answer.
export function computeReforgeStatBonus(reforgeName, reforge, itemTier, catacombsLevel) {
  if (!reforge) return {};
  const bonus = { ...getReforgeStatBonus(reforge, itemTier) };

  if (reforgeName === ANCIENT_REFORGE_NAME) {
    const critDamage = computeAncientReforgeCritDamage(catacombsLevel);
    if (critDamage > 0) bonus.crit_damage = critDamage;
    else delete bonus.crit_damage;
  }

  if (reforgeName === WITHERED_REFORGE_NAME) {
    const witheredBonus = computeWitheredReforgeStrength(catacombsLevel);
    if (witheredBonus > 0) bonus.strength = (bonus.strength || 0) + witheredBonus;
  }

  // Loving's bundled reforgeStats table lists a flat "+5 Ability Damage" stat, but that's really
  // a 1.05x Ability Damage multiplier — applied separately via abilityMultiplicative
  // (lib/damageSources.js) so it stacks correctly on top of any other real Ability Damage stat
  // instead of just summing with it. Stripped here so it isn't double-counted as a base stat.
  if (reforgeName === LOVING_REFORGE_NAME) delete bonus.ability_damage;

  return bonus;
}

export function applyReforgeToLore(lore, reforgeName, reforge, itemTier, insertBeforeLineIdx, catacombsLevel) {
  if (!reforge) return lore;
  const bonus = computeReforgeStatBonus(reforgeName, reforge, itemTier, catacombsLevel);
  if (Object.keys(bonus).length === 0) return lore;
  // Merged into the item's own base stat number, annotated with the delta on top for visibility.
  const merged = mergeStatIntoBase(lore, bonus, insertBeforeLineIdx);
  return annotateStatLines(merged, bonus, REFORGE_COLOR, insertBeforeLineIdx);
}

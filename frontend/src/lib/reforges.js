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

// Some Pet Items grant a percentage boost to one or all of a pet's own
// combat stats (e.g. "Antique Remedies": "Increases the pet's Strength
// by 80%.", "Minos Relic": "Increases all pet stats by 33.3%.") rather
// than an XP/coin boost. Parsed from the item's own real NEU-REPO lore
// (already bundled in itemData.petItems — no extra fetch needed) so the
// boosted value can be applied before the pet's own lore gets its
// {STAT_NAME} placeholders filled in (see lib/petData.js).
//
// Maps the stat name as it appears in a pet item's lore sentence to the
// matching raw NEU stat key computeAllPetStats already produces (e.g.
// "Strength" -> "STRENGTH") — deliberately a small fixed table rather
// than reusing reforgeData's STAT_LABELS, since pet stats are keyed by
// petnums.json's own uppercase names directly, not this app's lowercase
// internal keys.
const PET_STAT_NAME_TO_KEY = {
  strength: 'STRENGTH',
  health: 'HEALTH',
  defense: 'DEFENSE',
  intelligence: 'INTELLIGENCE',
  ferocity: 'FEROCITY',
  speed: 'SPEED',
  'crit chance': 'CRIT_CHANCE',
  'crit damage': 'CRIT_DAMAGE',
  'magic find': 'MAGIC_FIND',
  'true defense': 'TRUE_DEFENSE',
  'attack speed': 'BONUS_ATTACK_SPEED',
};

function stripToPlainText(loreLines) {
  return loreLines
    .join(' ')
    .replace(/§./g, '')
    .replace(/[^\x00-\x7F]/g, '') // drop decorative glyphs
    .replace(/\s+/g, ' ')
    .trim();
}

// Returns { type: 'all', percent } | { type: 'single', statKey, percent }
// | null (a pure XP/coin/cosmetic pet item, or any phrasing this doesn't
// recognize — left unparsed rather than guessed, same judgment call as
// lib/enchantStats.js's Cayenne case).
export function parsePetItemStatBoost(lore) {
  if (!lore || lore.length === 0) return null;
  const text = stripToPlainText(lore);

  let m = /Increases all pet stats by ([\d.]+)%/i.exec(text);
  if (m) return { type: 'all', percent: parseFloat(m[1]) };

  m = /Increases (?:the |this )?pet'?s\s+([A-Za-z ]+?)\s+by\s+([\d.]+)%/i.exec(text);
  if (m) {
    const statKey = PET_STAT_NAME_TO_KEY[m[1].trim().toLowerCase()];
    if (statKey) return { type: 'single', statKey, percent: parseFloat(m[2]) };
  }

  return null;
}

// Splits lore into blank-line-bounded paragraphs, same shape every pet
// item's lore is authored in (an intro paragraph, the effect paragraph,
// a "right-click to give it this item" paragraph, then the rarity tag).
function splitIntoParagraphs(lore) {
  const paragraphs = [];
  let current = [];
  for (const line of lore) {
    if (line === '') {
      paragraphs.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  paragraphs.push(current);
  return paragraphs;
}

// Pulls out just the paragraph describing the item's actual effect (the
// "Increases the pet's Strength by 80%." block, real lines/colors as
// NEU-REPO wrote them) — skips the generic "Pet Items can boost pets..."
// intro and the "Right-click on your summoned pet..." footer every pet
// item's lore also carries, which aren't specific to this one. Covers
// both real phrasings ("Increases ... by X%" and "Grants +X ..."); falls
// back to null (nothing shown) for anything else rather than guessing.
export function extractPetItemEffectLines(lore) {
  if (!lore || lore.length === 0) return null;
  const paragraph = splitIntoParagraphs(lore).find((p) =>
    p.some((line) => /Increases|Grants/i.test(line.replace(/§./g, ''))),
  );
  return paragraph && paragraph.length > 0 ? paragraph : null;
}

// Applies a parsed boost to a computed stats map (uppercase NEU keys ->
// numeric value, see lib/petData.js's computeAllPetStats). Multiplies
// rather than adds — the real bonus is a percentage of the pet's own
// current stat, not a flat number like a reforge/book bonus.
export function applyPetItemStatBoost(stats, boost) {
  if (!boost) return stats;
  const factor = 1 + boost.percent / 100;
  const result = { ...stats };
  if (boost.type === 'all') {
    for (const key of Object.keys(result)) {
      result[key] = Math.round(result[key] * factor * 10) / 10;
    }
  } else if (result[boost.statKey] !== undefined) {
    result[boost.statKey] = Math.round(result[boost.statKey] * factor * 10) / 10;
  }
  return result;
}

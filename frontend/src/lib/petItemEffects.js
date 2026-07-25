// Some Pet Items grant a % boost to one or all of a pet's own combat stats (e.g. "Increases
// the pet's Strength by 80%.") rather than an XP/coin boost — parsed from the item's own
// real lore before the pet's own {STAT_NAME} placeholders get filled in (see lib/petData.js).

// Maps a pet item's lore stat name to petnums.json's own uppercase stat key.
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

// Returns { type: 'all', percent } | { type: 'single', statKey, percent } | null (a pure XP/coin/cosmetic pet item, or unrecognized phrasing).
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

// Splits lore into blank-line-bounded paragraphs (intro, effect, footer, rarity tag).
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

// Pulls out just the paragraph describing the item's effect, skipping the generic intro/footer paragraphs every pet item's lore also carries.
export function extractPetItemEffectLines(lore) {
  if (!lore || lore.length === 0) return null;
  const paragraph = splitIntoParagraphs(lore).find((p) =>
    p.some((line) => /Increases|Grants/i.test(line.replace(/§./g, ''))),
  );
  return paragraph && paragraph.length > 0 ? paragraph : null;
}

// Applies a parsed boost to a computed stats map — multiplies (a % of the pet's own current stat) rather than adds.
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

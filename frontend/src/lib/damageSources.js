import { STAT_LABELS } from './reforgeData';
import { buildFullItemTooltipLines } from './itemTooltip';
import { REFORGE_COLOR, FABLED_REFORGE_NAME, FABLED_CRIT_BONUS_MAX_PERCENT } from './reforges';
import { BOOKS_COLOR } from './books';
import { GEMSTONE_COLOR } from './gemstones';
import { fetchEnchantLevels, extractDescriptionLines, titleCaseEnchantId, toRoman } from './enchantEffects';
import { getSpecialConfig, computeSpecialBonus, crownOfAvariceStats } from './specialWeapons';
import { formatItemName } from './mcText';
import { ARMOR_SLOTS, ARMOR_SLOT_LABELS } from './armorSlots';
import { EQUIPMENT_SLOTS, EQUIPMENT_SLOT_LABELS } from './equipmentSlots';
import {
  FINAL_DESTINATION_SET,
  FINAL_DESTINATION_STRENGTH,
  FINAL_DESTINATION_ENDER_DAMAGE_PERCENT,
  VANQUISHED_SET,
  VANQUISHED_SET_MULTIPLIER,
  VANQUISHED_SET_ID,
  MONSTER_HUNTER_SET,
  MONSTER_HUNTER_MULTIPLIER,
  MONSTER_RAIDER_SET,
  MONSTER_RAIDER_MULTIPLIER,
  hasFullSet,
} from './armorSetBonuses';
import {
  petLoreItemId,
  computeAllPetStats,
  computeOtherNums,
  substitutePetLore,
  getMaxPetLevel,
  applyGoldenDragonShiningScales,
  applyEnderDragonSuperior,
  DRAGONS_GREED_MAX_STRENGTH_PERCENT,
} from './petData';
import { parsePetItemStatBoost, applyPetItemStatBoost } from './petItemEffects';
import { fetchNeuItem } from './neuItems';
import {
  computeCombatLevelBonus,
  computeSkyblockLevelMultiplier,
  computeSkyblockLevelStrengthBonus,
  computeForagingStrengthBonus,
  BASE_CRIT_CHANCE,
  BASE_CRIT_DAMAGE,
} from './playerStats';
import { computeAccessoryTotalStats } from './accessoryPowers';
import { ENCHANT_ID_MOB_TYPES } from './mobTypes';
import {
  GOD_POTION_STRENGTH_POTION,
  GOD_POTION_CRIT_CHANCE,
  GOD_POTION_CRIT_DAMAGE,
  GOD_POTION_SPIRIT_CRIT_DAMAGE,
  GOD_POTION_ARCHERY_DAMAGE,
  JERRY_CANDY_STRENGTH,
  isBowEquipped,
} from './godPotion';
import {
  RULER_RATE,
  RULER_ATTRIBUTES,
  ECHO_OF_RULER_RATE,
  ECHO_OF_ELEMENTAL_RATE,
  ELEMENTAL_STRENGTH_RATE,
  STRENGTH_ELEMENTAL_ATTRIBUTES,
  DEADEYE_RATE,
  WARRIOR_RATE,
  ELITE_RATE,
  UNLIMITED_POWER_RATE,
  UNLIMITED_ENERGY_RATE,
  ALMIGHTY_RATE,
  DOMINANCE_RATE,
  computeEchoBoost,
} from './attributes';

// Elite's boss/miniboss condition, scoped to the 5 real Slayer bosses (no boss/miniboss flag exists on mobs).
const ELITE_BOSS_MOBS = ['Inferno Demonlord', 'Voidgloom Seraph', 'Revenant Horror', 'Tarantula Broodfather', 'Sven Packmaster'];

// Marker id for Fabled's randomized crit-damage bonus — pushed at 1x so the headline Final
// Damage stays the no-bonus baseline; DamageSources.jsx uses this id to compute the +15% max range.
export const FABLED_REFORGE_ID = 'fabled-reforge-crit-bonus';

/* Aggregates every damage-relevant stat/bonus across the loadout into: base stats (summed),
   % additive damage split into non-conditional vs conditional, a separate weaponBonus pair
   for the equipped weapon's own "+X% damage" abilities, multiplicative sources, and a
   situational list for formula-based sources with no fixed value. Coverage is pattern-based
   against real NEU-REPO phrasings; anything mentioning "damage" that doesn't match a known
   pattern lands in situational rather than being dropped. */

const GEAR_SLOTS = ['weapon', ...ARMOR_SLOTS, ...EQUIPMENT_SLOTS];
const SLOT_LABELS = { weapon: 'Weapon', ...ARMOR_SLOT_LABELS, ...EQUIPMENT_SLOT_LABELS };
const TRACKED_STATS = ['damage', 'strength', 'crit_chance', 'crit_damage'];

// Real Slayer-reward weapons (identified by their own "Combat Wisdom" stat line) — the set Habanero Tactics' bonus requires.
const SLAYER_WEAPON_IDS = new Set([
  'ATOMSPLIT_KATANA',
  'VOIDEDGE_KATANA',
  'VORPAL_KATANA',
  'AXE_OF_THE_SHREDDED',
  'REAPER_SWORD',
  'SHAMAN_SWORD',
  'POOCH_SWORD',
  'BURSTFIRE_DAGGER',
  'BURSTMAW_DAGGER',
  'FIREDUST_DAGGER',
  'HEARTFIRE_DAGGER',
  'HEARTMAW_DAGGER',
  'MAWDUST_DAGGER',
  'SCORPION_FOIL',
  'STING',
  'TARANTULA_FANG',
]);

// Habanero Tactics: +20%/25% damage with Slayer weapons at level IV/V (5%/level), stacks per armor piece.
const HABANERO_TACTICS_PERCENT_PER_LEVEL = 5;

// Weapons whose bonus is computed elsewhere (merged into base stats, or hardcoded below) —
// excluded here so the generic ability-text scan doesn't double up.
const SPECIAL_SCAN_EXCLUDE_IDS = new Set([
  'DAEDALUS_AXE',
  'STARRED_DAEDALUS_AXE',
  'MIDAS_SWORD',
  'STARRED_MIDAS_SWORD',
  'MIDAS_STAFF',
  'STARRED_MIDAS_STAFF',
  'EMERALD_BLADE',
  'WARDEN_HELMET',
  // Slayer-line weapons — hardcoded in SLAYER_TIER_BONUSES instead.
  'ATOMSPLIT_KATANA',
  'VOIDWALKER_KATANA',
  'VOIDEDGE_KATANA',
  'VORPAL_KATANA',
  'REVENANT_SWORD',
  'REAPER_SWORD',
  'AXE_OF_THE_SHREDDED',
  'RECLUSE_FANG',
  'TARANTULA_FANG',
  'SCORPION_FOIL',
  'STING',
]);

// Warden Helmet's Brute Force ability, assumed at its real max boost (+160%) since Speed isn't tracked.
const WARDEN_HELMET_BRUTE_FORCE_PERCENT = 160;

// Each tiered Slayer weapon's own damage bonus against its line's mob family, applied as an
// independent (1 + bonusPercent/100) factor rather than an additive contribution. Hardcoded
// (and excluded from the generic scan) rather than resolved automatically: the Katana line's
// real mob list doesn't match any single Mob Type, the Spider line's phrasing breaks the
// scan's regex, and the Zombie line is included here too just so all 11 tiers share one table.
// `condition` is a Mob Type string, or the full ATOMSPLIT_MOBS list for the Katana line.
const ATOMSPLIT_MOBS = [
  'Enderman',
  'Zealot',
  'Zealot Bruiser',
  'Voidgloom Seraph',
  'Fels',
  'Special Zealot',
  'Voidling Fanatic',
  'Voidling Extremist',
];

const SLAYER_TIER_BONUSES = {
  VOIDWALKER_KATANA: { bonusPercent: 150, condition: ATOMSPLIT_MOBS, conditionLabel: 'Endermen' },
  VOIDEDGE_KATANA: { bonusPercent: 200, condition: ATOMSPLIT_MOBS, conditionLabel: 'Endermen' },
  VORPAL_KATANA: { bonusPercent: 250, condition: ATOMSPLIT_MOBS, conditionLabel: 'Endermen' },
  ATOMSPLIT_KATANA: { bonusPercent: 300, condition: ATOMSPLIT_MOBS, conditionLabel: 'Endermen' },

  REVENANT_SWORD: { bonusPercent: 150, condition: 'Undead' },
  REAPER_SWORD: { bonusPercent: 200, condition: 'Undead' },
  AXE_OF_THE_SHREDDED: { bonusPercent: 250, condition: 'Undead' },

  RECLUSE_FANG: { bonusPercent: 150, condition: 'Arthropod' },
  TARANTULA_FANG: { bonusPercent: 200, condition: 'Arthropod' },
  SCORPION_FOIL: { bonusPercent: 250, condition: 'Arthropod' },
  STING: { bonusPercent: 300, condition: 'Arthropod' },
};

// Crown of Avarice's Celebration variant ships permanently maxed (Coins Consumed already at cap) — its own damage multiplier.
const CROWN_OF_AVARICE_CELEBRATION_MULTIPLIER = 1.15;

function stripToPlain(lines) {
  return (Array.isArray(lines) ? lines.join(' ') : lines)
    .replace(/§./g, '')
    .replace(/[^\x00-\x7F]/g, '') // drop decorative/PUA glyphs
    .replace(/\s+/g, ' ')
    .trim();
}

function splitParagraphs(lore) {
  const paragraphs = [];
  let current = [];
  for (const line of lore || []) {
    if (line === '') {
      paragraphs.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  paragraphs.push(current);
  return paragraphs.filter((p) => p.length > 0);
}

// Strips a paragraph's leading ability-name header line (e.g. "Ability: Name") before damage-text matching.
function stripLeadingHeaderLine(lines) {
  if (!lines || lines.length < 2) return lines;
  const first = lines[0].replace(/§./g, '').trim();
  const looksLikeHeader = !/[\d%]/.test(first) && !/damage|mobs/i.test(first);
  return looksLikeHeader ? lines.slice(1) : lines;
}

// True if a paragraph is the item/pet's own stat block (starts with "Label: value") — excluded from ability-text scanning.
function isStatBlockParagraph(paragraph) {
  if (!paragraph || paragraph.length === 0) return false;
  return /^[A-Za-z ]+:\s*[+-]?[\d.]/.test(paragraph[0].replace(/§./g, '').trim());
}

function cleanTargetText(raw) {
  return raw
    .replace(/\bmobs?\b/gi, '')
    .replace(/\s*,?\s*and\s+/gi, ', ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^,|,$/g, '')
    .trim();
}

// ---------------------------------------------------------------------
// Base stats: reuses buildFullItemTooltipLines (the single source of truth for an item's
// tooltip) rather than re-deriving numbers from gemstones/reforges/books/statLines/starring
// separately. Every "(+X)" in a tooltip line is a genuinely additional amount not already in
// the leading number, except Reforges/Books/Gemstones which also echo their own already-
// merged delta for display — excluded here to avoid double-counting.
function sumStatFromTooltipLines(finalLines, label) {
  const labelRe = new RegExp(`^${label}:`);
  const finalLine = finalLines.find((l) => labelRe.test(l.replace(/§./g, '').trim()));
  if (!finalLine) return 0;
  const plain = finalLine.replace(/§./g, '');
  const afterLabelPlain = plain.slice(plain.indexOf(':') + 1);
  const leadingMatch = /^\s*([+-]?[\d.]+)/.exec(afterLabelPlain);
  const base = leadingMatch ? parseFloat(leadingMatch[1]) : 0;

  const rawAfterLabel = finalLine.slice(finalLine.indexOf(':') + 1);
  const annotationRe = /§([0-9a-fk-orp])\(([+-]?[\d.]+)%?\)/g;
  const parenNums = [...rawAfterLabel.matchAll(annotationRe)]
    .filter((m) => m[1] !== REFORGE_COLOR && m[1] !== BOOKS_COLOR && m[1] !== GEMSTONE_COLOR)
    .map((m) => parseFloat(m[2]));

  return base + parenNums.reduce((a, b) => a + b, 0);
}

// Chimera enchant: copies 20%/level of the active pet's Strength/Crit Chance/Crit Damage, stacked on top of the pet's own contribution.
const CHIMERA_PERCENT_PER_LEVEL = 20;

// Adds to a base stat's running total and records the source for DamageSources.jsx's
// per-stat breakdown, merging entries that share a label into one running total.
function addBaseStat(out, statKey, value, label) {
  if (!value) return;
  out.baseStats[statKey] += value;
  const list = out.baseStatSources[statKey];
  const existing = list.find((e) => e.label === label);
  if (existing) existing.value += value;
  else list.push({ label, value });
}

async function collectBaseStats(loadout, itemData, catacombsLevel, tamingLevel, out) {
  // Computed first so Chimera (found while scanning enchants below) can copy the pet's final stats.
  let petStats = { STRENGTH: 0, CRIT_CHANCE: 0, CRIT_DAMAGE: 0 };
  if (loadout.pet) {
    const { item: pet, modifiers } = loadout.pet;
    const maxLevel = getMaxPetLevel(pet.petId);
    const levels = itemData.pets?.[pet.petId]?.[pet.tier];
    let stats = computeAllPetStats(levels, modifiers.level, maxLevel);
    stats = applyGoldenDragonShiningScales(pet.petId, stats, modifiers.goldCollection);
    const petItemId = modifiers.petItem;
    const petItem = petItemId ? (itemData.petItems || []).find((i) => i.id === petItemId) : null;
    const boost = petItem ? parsePetItemStatBoost(petItem.lore) : null;
    stats = applyPetItemStatBoost(stats, boost);
    const otherNums = computeOtherNums(levels, modifiers.level, maxLevel);
    stats = applyEnderDragonSuperior(pet.petId, pet.tier, stats, otherNums);
    petStats = stats;
    addBaseStat(out, 'strength', stats.STRENGTH || 0, 'Pet');
    addBaseStat(out, 'crit_chance', stats.CRIT_CHANCE || 0, 'Pet');
    addBaseStat(out, 'crit_damage', stats.CRIT_DAMAGE || 0, 'Pet');
  }

  for (const slot of GEAR_SLOTS) {
    const equipped = loadout[slot];
    if (!equipped) continue;
    const slotLabel = SLOT_LABELS[slot];
    const lines = await buildFullItemTooltipLines(equipped.item, equipped.modifiers, itemData, catacombsLevel, tamingLevel);
    for (const statKey of TRACKED_STATS) {
      addBaseStat(out, statKey, sumStatFromTooltipLines(lines, STAT_LABELS[statKey].label), slotLabel);
    }
    // Emerald Blade's bonus lives on its own "Current Damage Bonus:" line, not a "Damage:" stat line.
    if (equipped.item.id === 'EMERALD_BLADE') {
      const config = getSpecialConfig(equipped.item.id);
      addBaseStat(out, 'damage', computeSpecialBonus(config, equipped.modifiers.special), slotLabel);
    }

    const chimera = [
      ...(equipped.modifiers.hexEnchantments || []),
      ...(equipped.modifiers.ultimateEnchantment ? [equipped.modifiers.ultimateEnchantment] : []),
    ].find((e) => e.id.toLowerCase() === 'ultimate_chimera');
    if (chimera) {
      const fraction = (chimera.level * CHIMERA_PERCENT_PER_LEVEL) / 100;
      const chimeraLabel = `${slotLabel} (Chimera)`;
      addBaseStat(out, 'strength', (petStats.STRENGTH || 0) * fraction, chimeraLabel);
      addBaseStat(out, 'crit_chance', (petStats.CRIT_CHANCE || 0) * fraction, chimeraLabel);
      addBaseStat(out, 'crit_damage', (petStats.CRIT_DAMAGE || 0) * fraction, chimeraLabel);
    }
  }

  if (loadout.accessory) {
    const { item, modifiers } = loadout.accessory;
    const accessoryStats = computeAccessoryTotalStats(item.id, modifiers.magicalPower, modifiers.tuning);
    addBaseStat(out, 'strength', accessoryStats.strength || 0, 'Accessory');
    addBaseStat(out, 'crit_chance', accessoryStats.crit_chance || 0, 'Accessory');
    addBaseStat(out, 'crit_damage', accessoryStats.crit_damage || 0, 'Accessory');
  }
}

// ---------------------------------------------------------------------
// Enchants: parses each applied enchant's real per-level lore for a %-damage bonus, either
// conditional (Smite-style) or not. Giant Killer's per-missing-HP rate gets its capped value;
// anything else of that shape (e.g. Execute) has no fixed value and goes to situational.
const PERCENT_TO_TARGET_RE = /Increases\s+(?:melee\s+|ranged\s+)?damage\s+dealt(?:\s+to\s+(.+?))?\s+by\s+\+?([\d.]+)%/i;
const PER_TARGET_STAT_RE =
  /Increases\s+damage\s+dealt\s+by\s+\+?([\d.]+)%\s+for\s+each\s+(?:percent|%)\s+of\s+(.+?)(?:,?\s+up\s+to\s+\+?([\d.]+)%)?\.?\s*$/i;

// One For All: fixed +500% weapon damage, hardcoded since its lore phrasing doesn't match the generic regexes.
const ONE_FOR_ALL_DAMAGE_PERCENT = 500;

// First Strike/Triple Strike only apply on the first hit(s) of a fight — modeled as active only at 100% mob HP.
const FIRST_HIT_ENCHANT_IDS = new Set(['first_strike', 'triple_strike']);

async function collectEnchantEntries(entries, itemLabel, slotLabel, enchantsMeta, out, mobHpPercent) {
  for (const entry of entries) {
    if (entry.id.toLowerCase() === 'ultimate_one_for_all') {
      out.additiveNonConditional.push({
        id: `${slotLabel}-${entry.id}`,
        label: 'One For All',
        source: `${itemLabel} (${slotLabel})`,
        value: ONE_FOR_ALL_DAMAGE_PERCENT,
      });
      continue;
    }

    const levels = await fetchEnchantLevels(entry.id, enchantsMeta);
    const levelData = levels.find((l) => l.level === entry.level);
    if (!levelData) continue;
    const text = stripToPlain(extractDescriptionLines(levelData.lore));
    const name = `${titleCaseEnchantId(entry.id)} ${toRoman(entry.level)}`;
    const source = `${itemLabel} (${slotLabel})`;
    const id = `${slotLabel}-${entry.id}`;

    // Checked first since PER_TARGET_STAT_RE's shape is a superset of PERCENT_TO_TARGET_RE's.
    let m = PER_TARGET_STAT_RE.exec(text);
    if (m) {
      const ratePerLevel = parseFloat(m[1]);
      const basis = m[2].trim();
      const cap = m[3] != null ? parseFloat(m[3]) : null;
      const key = entry.id.toLowerCase();
      // Execute scales off missing HP, Prosecute off current HP; each level's real per-point rate is used directly.
      if (key === 'execute' || key === 'prosecute') {
        const hpBasis = key === 'execute' ? 100 - mobHpPercent : mobHpPercent;
        const value = Math.round(ratePerLevel * hpBasis * 100) / 100;
        if (value > 0) {
          out.additiveNonConditional.push({ id, label: `${name} (at ${mobHpPercent}% HP)`, source, value });
        }
      } else if (key === 'giant_killer' && cap != null) {
        out.additiveNonConditional.push({ id, label: name, source, value: cap });
      } else {
        out.situational.push({ id, label: name, source, note: text, formula: { kind: 'per-target-stat', basis, ratePerLevel, cap } });
      }
      continue;
    }

    m = PERCENT_TO_TARGET_RE.exec(text);
    if (m) {
      const value = parseFloat(m[2]);
      if (m[1]) {
        // Prefers the canonical Mob Type name over the enchant's own lore text (a few tooltips are stale).
        const mobTypes = ENCHANT_ID_MOB_TYPES[entry.id.toLowerCase()];
        const condition = mobTypes ? mobTypes.join(', ') : cleanTargetText(m[1]);
        out.additiveConditional.push({ id, label: name, source, value, condition });
      } else if (FIRST_HIT_ENCHANT_IDS.has(entry.id.toLowerCase())) {
        // Only counted at 100% mob HP.
        if (mobHpPercent === 100) {
          out.additiveNonConditional.push({ id, label: `${name} (first hit, 100% HP)`, source, value });
        }
      } else {
        out.additiveNonConditional.push({ id, label: name, source, value });
      }
      continue;
    }

    if (/damage/i.test(text)) {
      out.situational.push({ id, label: name, source, note: text, formula: null });
    }
  }
}

// ---------------------------------------------------------------------
// Item/pet ability text: two real damage-bonus phrasings — object-last ("deals +X% damage to
// Y") and subject-first ("Y mobs take Nx damage"). A third shape, "Y mobs DEAL Nx damage," is
// an incoming-damage penalty rather than a player bonus, so it's excluded entirely.
const INCOMING_DAMAGE_RE = /[^.]+?\s+mobs?\s+deals?\s+\+?[\d.]+x\s+damage/i;
// "to X" and "against X" are the same mechanic; the trailing "mobs" suffix is optional.
const DEALS_TO_TARGET_RE = /deals?\s+\+?([\d.]+)%\s+(?:more\s+)?damage\s+(?:to|against)\s+([^.]+?)(?:\s+mobs?)?(?=[.]|$)/i;
const SUBJECT_MULTIPLIER_RE = /([^.]+?)\s+mobs?\s+takes?\s+\+?([\d.]+)x\s+damage/i;
const DEALS_FLAT_RE = /deals?\s+\+?([\d.]+)%\s+(?:more\s+)?damage\b/i;

function matchDamageParagraph(text) {
  if (INCOMING_DAMAGE_RE.test(text)) return null;

  let m = SUBJECT_MULTIPLIER_RE.exec(text);
  if (m) return { bucket: 'multiplicative', value: parseFloat(m[2]), condition: cleanTargetText(m[1]) };

  m = DEALS_TO_TARGET_RE.exec(text);
  if (m) return { bucket: 'additiveConditional', value: parseFloat(m[1]), condition: cleanTargetText(m[2]) };

  m = DEALS_FLAT_RE.exec(text);
  if (m) return { bucket: 'additiveNonConditional', value: parseFloat(m[1]) };

  if (/damage/i.test(text)) return { bucket: 'situational', note: text };
  return null;
}

// `asWeaponBonus`: routes a weapon-slot "+X% damage" match into the weaponBonus buckets instead of the general additive ones.
function pushParagraphMatch(out, text, label, source, id, asWeaponBonus) {
  const match = matchDamageParagraph(text);
  if (!match) return;
  if (match.bucket === 'situational') {
    out.situational.push({ id, label, source, note: match.note, formula: null });
  } else if (match.bucket === 'multiplicative') {
    out.multiplicative.push({ id, label, source, value: match.value, condition: match.condition });
  } else if (match.bucket === 'additiveConditional') {
    const bucket = asWeaponBonus ? out.weaponBonusConditional : out.additiveConditional;
    bucket.push({ id, label, source, value: match.value, condition: match.condition });
  } else {
    const bucket = asWeaponBonus ? out.weaponBonusNonConditional : out.additiveNonConditional;
    bucket.push({ id, label, source, value: match.value });
  }
}

function scanItemAbilityText(lore, label, source, out, idPrefix, asWeaponBonus) {
  splitParagraphs(lore)
    .filter((p) => !isStatBlockParagraph(p))
    .forEach((p, idx) =>
      pushParagraphMatch(out, stripToPlain(stripLeadingHeaderLine(p)), label, source, `${idPrefix}-${idx}`, asWeaponBonus),
    );
}

// ---------------------------------------------------------------------
// Special-mechanic weapons already have their bonus computed from the player's entered value (lib/specialWeapons.js) — read directly rather than re-parsed from lore.
function collectSpecialMechanicEntries(item, modifiers, itemLabel, slotLabel, out) {
  const config = getSpecialConfig(item.id);
  if (!config) return;
  const bonus = computeSpecialBonus(config, modifiers.special);
  if (!bonus) return;

  if (config.kind === 'bestiary') {
    // Daedalus Blade's Bestiary bonus: the weapon's own damage bonus, Mythological-only.
    out.weaponBonusConditional.push({
      id: `${item.id}-special`,
      label: `${itemLabel} (Bestiary)`,
      source: slotLabel,
      value: bonus,
      condition: 'Mythological',
    });
  } else if (config.kind === 'crownOfAvarice') {
    const { damageMultiplier } = crownOfAvariceStats(config, bonus);
    // Coins Consumed's damage multiplier applies to all mobs; only its Magic Find bonus is Mythological-only.
    out.multiplicative.push({
      id: `${item.id}-special`,
      label: `${itemLabel} (Coins Consumed)`,
      source: slotLabel,
      value: damageMultiplier,
    });
  }
  // midasSword/midasStaff are already merged into base stats — nothing more to add.
}

// ---------------------------------------------------------------------
// Pet: base Strength/Crit Chance/Crit Damage handled in collectBaseStats above; this covers
// the pet's own ability text (e.g. Ender Dragon's End Strike, via the generic scan) plus
// Golden Dragon's Legendary Treasure (%damage per million bank coins, capped).
const GOLDEN_DRAGON_TREASURE_RE =
  /Gain\s+\+?([\d.]+)%\s+damage\s+for\s+every\s+million\s+coins\s+in\s+your\s+bank\.?\s*(?:\(Max\s+\+?([\d.]+)%\))?/i;

async function collectPetEntries(loadout, itemData, out) {
  if (!loadout.pet) return;
  const { item: pet, modifiers } = loadout.pet;
  const loreId = petLoreItemId(pet.petId, pet.tier);
  const rawLoreData = await fetchNeuItem(loreId);
  if (!rawLoreData || !rawLoreData.lore || rawLoreData.lore.length === 0) return;

  const maxLevel = getMaxPetLevel(pet.petId);
  const levels = itemData.pets?.[pet.petId]?.[pet.tier];
  const stats = computeAllPetStats(levels, modifiers.level, maxLevel);
  const otherNums = computeOtherNums(levels, modifiers.level, maxLevel);
  const substituted = substitutePetLore(rawLoreData.lore, modifiers.level, stats, otherNums);
  const paragraphs = splitParagraphs(substituted).filter((p) => !isStatBlockParagraph(p));

  const petLabel = formatItemName(pet.name);
  const source = `${petLabel} (Pet)`;

  paragraphs.forEach((p, idx) => {
    const text = stripToPlain(p);
    if (!text) return;

    if (pet.petId === 'GOLDEN_DRAGON') {
      const m = GOLDEN_DRAGON_TREASURE_RE.exec(text);
      if (m) {
        const rate = parseFloat(m[1]);
        const cap = m[2] != null ? parseFloat(m[2]) : null;
        const bankCoins = Math.max(0, modifiers.bankCoins || 0);
        let value = (bankCoins / 1_000_000) * rate;
        if (cap != null) value = Math.min(value, cap);
        if (value > 0) {
          out.additiveNonConditional.push({ id: 'golden-dragon-legendary-treasure', label: 'Legendary Treasure', source, value });
        }
        return; // handled — don't also generic-scan this paragraph
      }
    }

    pushParagraphMatch(out, stripToPlain(stripLeadingHeaderLine(p)), petLabel, source, `pet-${idx}`);
  });
}

// ---------------------------------------------------------------------
// Account-wide Attributes (lib/attributes.js), read from BuildContext state rather than the
// loadout. The Echo chain is computed once and applied to every Ruler/Strength-Elemental
// attribute's value before it's pushed/summed.
function collectAttributeEntries(attributes, loadout, out) {
  if (!attributes) return;

  const echoOfRulerBoost = computeEchoBoost(ECHO_OF_RULER_RATE, attributes.echo_of_ruler, attributes.echo_of_echoes);
  const echoOfElementalBoost = computeEchoBoost(ECHO_OF_ELEMENTAL_RATE, attributes.echo_of_elemental, attributes.echo_of_echoes);

  for (const { id, name, mobType } of RULER_ATTRIBUTES) {
    const level = attributes[id] || 0;
    if (!level) continue;
    const base = RULER_RATE * level;
    const value = base * (1 + echoOfRulerBoost / 100);
    out.additiveConditional.push({ id: `attr-${id}`, label: name, source: 'Attribute', value, condition: mobType });
  }

  // Folded into one "Attributes" base-stat source line.
  for (const { id } of STRENGTH_ELEMENTAL_ATTRIBUTES) {
    const level = attributes[id] || 0;
    if (!level) continue;
    const base = ELEMENTAL_STRENGTH_RATE * level;
    addBaseStat(out, 'strength', base * (1 + echoOfElementalBoost / 100), 'Attributes');
  }

  const deadeyeLevel = attributes.deadeye || 0;
  if (deadeyeLevel && isBowEquipped(loadout)) {
    out.additiveNonConditional.push({ id: 'attr-deadeye', label: 'Deadeye', source: 'Attribute', value: DEADEYE_RATE * deadeyeLevel });
  }

  // Warrior is Deadeye's inverse: any non-bow weapon.
  const warriorLevel = attributes.warrior || 0;
  if (warriorLevel && !isBowEquipped(loadout)) {
    out.additiveNonConditional.push({ id: 'attr-warrior', label: 'Warrior', source: 'Attribute', value: WARRIOR_RATE * warriorLevel });
  }

  const eliteLevel = attributes.elite || 0;
  if (eliteLevel) {
    out.additiveConditional.push({
      id: 'attr-elite',
      label: 'Elite',
      source: 'Attribute',
      value: ELITE_RATE * eliteLevel,
      condition: ELITE_BOSS_MOBS.join(', '),
      // Displayed condition text; matching still uses the real boss names above.
      conditionLabel: 'bosses and minibosses',
    });
  }

  const dominanceLevel = attributes.dominance || 0;
  if (dominanceLevel) {
    out.additiveNonConditional.push({ id: 'attr-dominance', label: 'Dominance', source: 'Attribute', value: DOMINANCE_RATE * dominanceLevel });
  }

  // Unlimited Power/Energy apply last, as a true multiplier on the fully-summed Strength/Crit
  // Damage — baked into baseStats directly rather than left for finalDamage.js to apply.
  // Almighty boosts both, same keyword-matching mechanism as the Echo chain.
  const almightyBoost = ALMIGHTY_RATE * (attributes.almighty || 0);
  const unlimitedPowerPercent = UNLIMITED_POWER_RATE * (attributes.unlimited_power || 0) * (1 + almightyBoost / 100);
  const unlimitedEnergyPercent = UNLIMITED_ENERGY_RATE * (attributes.unlimited_energy || 0) * (1 + almightyBoost / 100);
  addBaseStat(out, 'strength', out.baseStats.strength * (unlimitedPowerPercent / 100), 'Unlimited Power');
  addBaseStat(out, 'crit_damage', out.baseStats.crit_damage * (unlimitedEnergyPercent / 100), 'Unlimited Energy');
}

// ---------------------------------------------------------------------
export async function collectDamageSources(loadout, itemData, playerStats, godPotionActive, attributes, miscStats, mobHpPercent = 100) {
  const out = {
    baseStats: { damage: 0, strength: 0, crit_chance: 0, crit_damage: 0 },
    baseStatSources: { damage: [], strength: [], crit_chance: [], crit_damage: [] },
    additiveNonConditional: [],
    additiveConditional: [],
    // The equipped weapon's own "+X% damage" ability bonuses — kept separate from the
    // additive pool since they apply as their own independent factor (see lib/finalDamage.js).
    weaponBonusNonConditional: [],
    weaponBonusConditional: [],
    multiplicative: [],
    situational: [],
  };

  await collectBaseStats(loadout, itemData, playerStats?.catacombsLevel, playerStats?.tamingLevel, out);
  addBaseStat(out, 'strength', computeForagingStrengthBonus(playerStats?.foragingLevel), 'Foraging Level');
  addBaseStat(out, 'strength', computeSkyblockLevelStrengthBonus(playerStats?.skyblockLevel), 'Skyblock Level');
  // Real Hypixel base stats before any gear.
  addBaseStat(out, 'crit_chance', BASE_CRIT_CHANCE, 'Base');
  addBaseStat(out, 'crit_damage', BASE_CRIT_DAMAGE, 'Base');
  // Player-entered "everything else" total.
  addBaseStat(out, 'strength', miscStats?.strength || 0, 'Misc');
  addBaseStat(out, 'crit_damage', miscStats?.crit_damage || 0, 'Misc');

  // God Potion's aggregate-stat pieces plus Archery IV's bow-only damage bonus.
  if (godPotionActive) {
    addBaseStat(out, 'strength', GOD_POTION_STRENGTH_POTION + JERRY_CANDY_STRENGTH, 'God Potion');
    addBaseStat(out, 'crit_chance', GOD_POTION_CRIT_CHANCE, 'God Potion');
    addBaseStat(out, 'crit_damage', GOD_POTION_CRIT_DAMAGE + GOD_POTION_SPIRIT_CRIT_DAMAGE, 'God Potion');
    if (isBowEquipped(loadout)) {
      out.additiveNonConditional.push({
        id: 'god-potion-archery',
        label: 'God Potion (Archery IV)',
        source: 'Player',
        value: GOD_POTION_ARCHERY_DAMAGE,
      });
    }
  }

  // Dragon's Greed: assumed always active at its real max (+5% Strength), applied to the fully-summed Strength total so far.
  if (loadout.pet?.item?.petId === 'GOLDEN_DRAGON') {
    addBaseStat(
      out,
      'strength',
      out.baseStats.strength * (DRAGONS_GREED_MAX_STRENGTH_PERCENT / 100),
      "Dragon's Greed (assumed max)",
    );
  }

  // Griffin's Sacred Strength: +% Strength scaled by pet level, assumed always active (HP isn't tracked), applied to the player's whole Strength total.
  if (loadout.pet?.item?.petId === 'GRIFFIN') {
    const { item: pet, modifiers: petModifiers } = loadout.pet;
    const levels = itemData.pets?.[pet.petId]?.[pet.tier];
    const otherNums = computeOtherNums(levels, petModifiers.level, getMaxPetLevel(pet.petId));
    const sacredStrengthPercent = otherNums[0] || 0;
    if (sacredStrengthPercent) {
      addBaseStat(out, 'strength', out.baseStats.strength * (sacredStrengthPercent / 100), 'Sacred Strength (assumed active)');
    }
  }

  const combatLevelBonus = computeCombatLevelBonus(playerStats?.combatLevel);
  if (combatLevelBonus) {
    out.additiveNonConditional.push({ id: 'combat-level', label: 'Combat Level', source: 'Player', value: combatLevelBonus });
  }

  const skyblockLevelMultiplier = computeSkyblockLevelMultiplier(playerStats?.skyblockLevel);
  if (skyblockLevelMultiplier !== 1) {
    out.multiplicative.push({ id: 'skyblock-level', label: 'Skyblock Level', source: 'Player', value: skyblockLevelMultiplier });
  }

  for (const slot of GEAR_SLOTS) {
    const equipped = loadout[slot];
    if (!equipped) continue;
    const itemLabel = formatItemName(equipped.item.name);
    const slotLabel = SLOT_LABELS[slot];

    const enchantEntries = [
      ...(equipped.modifiers.hexEnchantments || []),
      ...(equipped.modifiers.ultimateEnchantment ? [equipped.modifiers.ultimateEnchantment] : []),
    ];
    if (enchantEntries.length > 0) {
      await collectEnchantEntries(enchantEntries, itemLabel, slotLabel, itemData.enchants, out, mobHpPercent);
    }

    if (!SPECIAL_SCAN_EXCLUDE_IDS.has(equipped.item.id)) {
      // Only the weapon slot's ability text is treated as a weapon-bonus.
      scanItemAbilityText(equipped.item.lore, itemLabel, slotLabel, out, `${slot}-ability`, slot === 'weapon');
    }

    collectSpecialMechanicEntries(equipped.item, equipped.modifiers, itemLabel, slotLabel, out);

    if (equipped.item.id === 'WARDEN_HELMET') {
      out.additiveNonConditional.push({
        id: 'warden-helmet-brute-force',
        label: 'Brute Force (assumed max)',
        source: slotLabel,
        value: WARDEN_HELMET_BRUTE_FORCE_PERCENT,
      });
    }

    const tierBonus = SLAYER_TIER_BONUSES[equipped.item.id];
    if (tierBonus) {
      const conditionLabel = tierBonus.conditionLabel || tierBonus.condition;
      const condition = Array.isArray(tierBonus.condition) ? tierBonus.condition.join(', ') : tierBonus.condition;
      const idBase = equipped.item.id.toLowerCase().replace(/_/g, '-');
      out.weaponBonusConditional.push({
        id: `${idBase}-tier-bonus`,
        label: `${itemLabel} (${conditionLabel})`,
        source: slotLabel,
        value: tierBonus.bonusPercent,
        condition,
        conditionLabel,
      });
    }

    if (equipped.item.id === 'CROWN_OF_AVARICE_CELEBRATION') {
      out.multiplicative.push({
        id: 'crown-of-avarice-celebration',
        label: `${itemLabel} (Coins Consumed, fixed max)`,
        source: slotLabel,
        value: CROWN_OF_AVARICE_CELEBRATION_MULTIPLIER,
      });
    }

    if (slot === 'weapon' && equipped.modifiers.reforge === FABLED_REFORGE_NAME) {
      out.multiplicative.push({
        id: FABLED_REFORGE_ID,
        label: `${itemLabel} (Fabled Crit Bonus, up to +${FABLED_CRIT_BONUS_MAX_PERCENT}%)`,
        source: slotLabel,
        value: 1,
      });
    }
  }

  // Habanero Tactics: summed across armor, only applied with a real Slayer weapon equipped.
  if (loadout.weapon?.item?.id && SLAYER_WEAPON_IDS.has(loadout.weapon.item.id)) {
    let habaneroPercent = 0;
    for (const slot of ARMOR_SLOTS) {
      const enchant = loadout[slot]?.modifiers?.ultimateEnchantment;
      if (enchant && enchant.id.toLowerCase() === 'ultimate_habanero_tactics') {
        habaneroPercent += enchant.level * HABANERO_TACTICS_PERCENT_PER_LEVEL;
      }
    }
    if (habaneroPercent > 0) {
      out.additiveNonConditional.push({
        id: 'habanero-tactics',
        label: 'Habanero Tactics (Slayer weapon)',
        source: 'Armor',
        value: habaneroPercent,
      });
    }
  }

  // Full-set bonuses, checked positionally against the exact 4 real pieces.
  if (hasFullSet(loadout, ARMOR_SLOTS, FINAL_DESTINATION_SET)) {
    addBaseStat(out, 'strength', FINAL_DESTINATION_STRENGTH, 'Final Destination (Full Set)');
    out.additiveConditional.push({
      id: 'final-destination-set-ender',
      label: 'Final Destination (Full Set)',
      source: 'Armor',
      value: FINAL_DESTINATION_ENDER_DAMAGE_PERCENT,
      condition: 'Ender',
    });
  }

  if (hasFullSet(loadout, EQUIPMENT_SLOTS, VANQUISHED_SET)) {
    out.multiplicative.push({
      id: VANQUISHED_SET_ID,
      label: 'Vanquished (Full Set, Hidden Bonus)',
      source: 'Equipment',
      value: VANQUISHED_SET_MULTIPLIER,
    });
  }

  if (hasFullSet(loadout, ARMOR_SLOTS, MONSTER_HUNTER_SET)) {
    out.multiplicative.push({
      id: 'monster-hunter-hidden-bonus',
      label: 'Monster Hunter Hidden Bonus',
      source: 'Armor',
      value: MONSTER_HUNTER_MULTIPLIER,
    });
  } else if (hasFullSet(loadout, ARMOR_SLOTS, MONSTER_RAIDER_SET)) {
    out.multiplicative.push({
      id: 'monster-raider-hidden-bonus',
      label: 'Monster Raider Hidden Bonus',
      source: 'Armor',
      value: MONSTER_RAIDER_MULTIPLIER,
    });
  }


  await collectPetEntries(loadout, itemData, out);

  collectAttributeEntries(attributes, loadout, out);

  return out;
}

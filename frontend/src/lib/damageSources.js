import { STAT_LABELS } from './reforgeData';
import { buildFullItemTooltipLines } from './itemTooltip';
import { fetchEnchantLevels, extractDescriptionLines, titleCaseEnchantId, toRoman } from './enchantEffects';
import { getSpecialConfig, computeSpecialBonus, crownOfAvariceStats } from './specialWeapons';
import { formatItemName } from './mcText';
import { ARMOR_SLOTS, ARMOR_SLOT_LABELS } from './armorSlots';
import { EQUIPMENT_SLOTS, EQUIPMENT_SLOT_LABELS } from './equipmentSlots';
import {
  petLoreItemId,
  computeAllPetStats,
  computeOtherNums,
  substitutePetLore,
  getMaxPetLevel,
  applyGoldenDragonShiningScales,
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

/* Aggregates every damage-relevant stat/bonus across the whole loadout
   (weapon + 4 armor + 4 equipment + pet) into one categorized breakdown:
   base stats (Damage/Strength/Crit Chance/Crit Damage, summed), % damage
   bonuses split into non-conditional (Sharpness, Giant Killer at its
   capped/"100% uptime" value) vs conditional (Smite -> Wither/Undead/
   Skeletal, item abilities like "+50% damage to Wither mobs"),
   multiplicative sources (Crown of Avarice's Nx), and a situational list
   for formula-based sources with no fixed value (Execute's %-per-missing-
   HP, or any "damage"-mentioning text that didn't match a known pattern)
   — excluded from the totals but kept structured (formula/basis/rate) so
   a future mob-HP simulator can resolve them without re-deriving anything.

   Coverage is pattern-based against real, verified NEU-REPO phrasings,
   not a hand-curated table of every enchant/item — see the regexes below
   for exactly what's recognized. Anything mentioning "damage" that isn't
   recognized lands in `situational` with its raw text shown rather than
   being silently dropped; anything not mentioning "damage" at all (pure
   Ferocity/Defense-shred/utility effects) is out of scope entirely. */

const GEAR_SLOTS = ['weapon', ...ARMOR_SLOTS, ...EQUIPMENT_SLOTS];
const SLOT_LABELS = { weapon: 'Weapon', ...ARMOR_SLOT_LABELS, ...EQUIPMENT_SLOT_LABELS };
const TRACKED_STATS = ['damage', 'strength', 'crit_chance', 'crit_damage'];

// Fully handled by collectBaseStats/collectSpecialMechanicEntries below
// (their bonus is either merged into base stats already, per last
// session's work, or computed exactly from the real player-entered
// value) — excluded from the generic ability-text scan so the same
// mechanic doesn't also get loosely re-parsed a second time.
const SPECIAL_SCAN_EXCLUDE_IDS = new Set([
  'DAEDALUS_AXE',
  'STARRED_DAEDALUS_AXE',
  'MIDAS_SWORD',
  'STARRED_MIDAS_SWORD',
  'MIDAS_STAFF',
  'STARRED_MIDAS_STAFF',
  'EMERALD_BLADE',
  'WARDEN_HELMET',
  'ATOMSPLIT_KATANA',
]);

// Warden Helmet's "Brute Force" ability ("Halves your +25 Speed but
// grants +20% base weapon damage for every +25 Speed") scales with
// however much Speed the player stacks — no fixed value, and this app
// has no aggregate Speed total to derive it from. Per instruction,
// assumed always at its max real-game boost (8 stacks = +160%) rather
// than left unresolved in situational.
const WARDEN_HELMET_BRUTE_FORCE_PERCENT = 160;

// Atomsplit Katana's real lore reads "Deal +300% damage to Endermen." —
// the generic ability-text scan would auto-resolve "Endermen" to just
// the single mob named "Enderman" (lib/mobTypes.js's resolveMobKey),
// missing the real Ender-dungeon "Enderman family" the weapon is
// actually built to counter. Hardcoded to the full real mob list per
// instruction, since there's no Mob Type covering exactly this set
// (Ender-typed mobs include plenty this weapon doesn't affect, e.g.
// Voidgloom Seraph's own summons). Per instruction, modeled as a 3x
// multiplicative boost rather than +300% additive — the in-game tooltip
// phrasing ("+300% damage") is considered misleading/poorly written for
// what the ability actually does.
const ATOMSPLIT_KATANA_DAMAGE_MULTIPLIER = 3;
const ATOMSPLIT_KATANA_MOBS = [
  'Enderman',
  'Zealot',
  'Zealot Bruiser',
  'Voidgloom Seraph',
  'Fels',
  'Special Zealot',
  'Voidling Fanatic',
  'Voidling Extremist',
];

// Crown of Avarice's "Celebration" skin (raffle/giveaway cosmetic
// variant, real NEU-REPO id CROWN_OF_AVARICE_CELEBRATION) ships with a
// fixed "Coins Consumed: 61,000,000,000" already baked into its own
// pristine lore — well past the base item's 1B perk-change cap, i.e.
// permanently maxed rather than a player-tracked counter. SPECIAL_
// WEAPON_CONFIG (lib/specialWeapons.js) only covers the base
// CROWN_OF_AVARICE id, so this variant got no bonus at all before —
// hardcoded here to its own real max value ("+1.15x Damage").
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

// Ability paragraphs almost always lead with a header line before the
// actual effect text — weapons/armor use "§6Ability: Name" (Crown of
// Avarice: "Ability: Overindulgence"), pets just the bare name (Golden
// Dragon: "Legendary Treasure", Ender Dragon: "End Strike") — left in,
// that header text ends up glued onto the front of a subject-first "X
// mobs deal Nx damage" condition capture, since the whole paragraph is
// joined into one string before matching. A header line never itself
// contains a digit/"%"/"damage"/"mobs" (the only things any regex below
// matches on), so dropping any such leading line can't lose information
// either pattern would have used.
function stripLeadingHeaderLine(lines) {
  if (!lines || lines.length < 2) return lines;
  const first = lines[0].replace(/§./g, '').trim();
  const looksLikeHeader = !/[\d%]/.test(first) && !/damage|mobs/i.test(first);
  return looksLikeHeader ? lines.slice(1) : lines;
}

// A stat-block paragraph (item's own Damage/Strength/Gemstones/etc, or a
// pet's own Strength/Crit Chance/Crit Damage block) always leads with a
// "Label: value" line — detected by shape rather than assumed to always
// be paragraph 0, since pets have an unrelated "Combat Pet" paragraph
// before their real stat block. Filtered out of ability-text scanning so
// e.g. a pet's own "Crit Damage: +50%" stat line can't trip the generic
// "mentions damage" situational catch-all below.
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
// Base stats: reuses buildFullItemTooltipLines (already the single
// source of truth for "what does this item's tooltip actually show",
// tested throughout this session) rather than re-deriving numbers from
// each of gemstones.js/reforges.js/books.js/statLines.js/starring.js
// separately. Every modifier annotates a stat line as either its own new
// "Label: +X (+X)" line (when the item had no such line pristinely — the
// leading number IS the first modifier's own value, already echoed as
// its first parenthetical too) or appends "(+X)" to an existing line —
// so the two cases need different summing to avoid double-counting a
// synthesized line's leading number against its own first annotation.
function sumStatFromTooltipLines(finalLines, pristineLore, label) {
  const labelRe = new RegExp(`^${label}:`);
  const finalLine = finalLines.find((l) => labelRe.test(l.replace(/§./g, '').trim()));
  if (!finalLine) return 0;
  const plain = finalLine.replace(/§./g, '');
  const afterLabel = plain.slice(plain.indexOf(':') + 1);
  const existedPristinely = (pristineLore || []).some((l) => labelRe.test(l.replace(/§./g, '').trim()));
  const parenNums = [...afterLabel.matchAll(/\(([+-]?[\d.]+)%?\)/g)].map((m) => parseFloat(m[1]));

  if (!existedPristinely) {
    // A synthesized line usually looks like annotateStatLines' "value
    // (value)" (the leading number is a display-only duplicate of the
    // one real bonus, so only the paren copy is summed) — but
    // mergeStatIntoBase's own synthesized lines (e.g. Daedalus Blade's
    // Taming-level Damage, which has no pristine "Damage:" line to
    // begin with) are just "value" with no paren at all. Fall back to
    // the leading number only when there's no paren to prefer, so
    // neither shape is silently dropped nor double-counted.
    if (parenNums.length > 0) return parenNums.reduce((a, b) => a + b, 0);
    const leadingMatch = /^\s*([+-]?[\d.]+)/.exec(afterLabel);
    return leadingMatch ? parseFloat(leadingMatch[1]) : 0;
  }
  const leadingMatch = /^\s*([+-]?[\d.]+)/.exec(afterLabel);
  const base = leadingMatch ? parseFloat(leadingMatch[1]) : 0;
  return base + parenNums.reduce((a, b) => a + b, 0);
}

// Chimera ultimate enchant — real NEU-REPO lore (fetched this session):
// "Copies 20%/40%/60%/80%/100% of your active pet's stats" at levels
// I-V respectively, i.e. a flat 20% per level. Applied here (rather than
// collectEnchantEntries' generic ability-text scan, which can't turn a
// "copies pet stats" sentence into a %-damage entry) as a SEPARATE
// addition on top of the pet's own normal contribution above — the
// enchant genuinely stacks a partial second copy of the pet's stats, it
// doesn't replace anything.
const CHIMERA_PERCENT_PER_LEVEL = 20;

// Records WHERE a (Base) Stats number came from, not just the total —
// out.baseStatSources[statKey] is a {label, value} list DamageSources.jsx
// shows when a stat row is clicked. Contributions sharing a label (e.g.
// every Ruler/Strength-Elemental attribute folding into one "Attributes"
// line) are merged into a running total rather than one row each, same
// "grouped, not itemized per-enchant" granularity the user asked for.
function addBaseStat(out, statKey, value, label) {
  if (!value) return;
  out.baseStats[statKey] += value;
  const list = out.baseStatSources[statKey];
  const existing = list.find((e) => e.label === label);
  if (existing) existing.value += value;
  else list.push({ label, value });
}

async function collectBaseStats(loadout, itemData, catacombsLevel, tamingLevel, out) {
  // Computed up front (rather than after the gear loop) so Chimera,
  // found while scanning a weapon's applied enchants below, can copy a
  // percentage of the pet's own final (post-item-boost) stats.
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
      addBaseStat(out, statKey, sumStatFromTooltipLines(lines, equipped.item.lore, STAT_LABELS[statKey].label), slotLabel);
    }
    // Emerald Blade's ability bonus is shown under its own "Current
    // Damage Bonus:" line, not a "Damage:" stat line, so the generic
    // label-matching above can't see it.
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
// Enchants: real per-level lore fetched the same way itemTooltip.js's
// computeEnchantStatBonuses already does. Two known formula shapes,
// verified directly against NEU-REPO this session:
//  - "Increases [melee/ranged] damage dealt [to X] by Y%" (Sharpness has
//    no target -> non-conditional; Smite/Bane of Arthropods/Cubism/Ender
//    Slayer name one or more targets -> conditional, one shared % across
//    all of them, not a separate % per target).
//  - "Increases damage dealt by Y% for each percent of <basis>[, up to
//    Z%]" (Giant Killer has an explicit cap; Execute has the same shape
//    with no cap). Only Giant Killer gets a resolved value here (its cap,
//    per the "100% uptime" instruction) — anything else matching this
//    shape has no natural fixed value and goes to situational, structured
//    for a future mob-HP simulator to resolve exactly.
const PERCENT_TO_TARGET_RE = /Increases\s+(?:melee\s+|ranged\s+)?damage\s+dealt(?:\s+to\s+(.+?))?\s+by\s+\+?([\d.]+)%/i;
const PER_TARGET_STAT_RE =
  /Increases\s+damage\s+dealt\s+by\s+\+?([\d.]+)%\s+for\s+each\s+(?:percent|%)\s+of\s+(.+?)(?:,?\s+up\s+to\s+\+?([\d.]+)%)?\.?\s*$/i;

// One For All — real NEU-REPO lore (fetched this session): "Removes all
// other enchants but increases your weapon damage by 500%." A single
// fixed level (no I/II/... scaling), phrased as "weapon damage" rather
// than the "damage dealt [to X]" shape every other %-damage enchant
// uses, so it can't be picked up by either regex below — hardcoded
// instead of extending those patterns for one enchant. The "removes all
// other enchants" half is already handled at the UI layer (see
// computeConflictingEntries in lib/enchantEffects.js).
const ONE_FOR_ALL_DAMAGE_PERCENT = 500;

async function collectEnchantEntries(entries, itemLabel, slotLabel, enchantsMeta, out) {
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

    // Checked first: PERCENT_TO_TARGET_RE's "damage dealt by Y%" prefix
    // is a structural subset of this pattern's own "damage dealt by Y%
    // for each percent of..." text, so Giant Killer/Execute would
    // otherwise match it first and get their per-point rate treated as
    // if it were the whole (non-conditional) bonus.
    let m = PER_TARGET_STAT_RE.exec(text);
    if (m) {
      const ratePerLevel = parseFloat(m[1]);
      const basis = m[2].trim();
      const cap = m[3] != null ? parseFloat(m[3]) : null;
      if (entry.id.toLowerCase() === 'giant_killer' && cap != null) {
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
        // Prefer the canonical Mob Type name(s) over whatever the lore
        // text itself says — most of these 9 enchants already say the
        // type name verbatim (Hypixel rewrote them when Mob Types
        // shipped), but Cubism's tooltip is still the old hand-written
        // mob enumeration and never got updated. This keeps all 9
        // consistent regardless of which text style Hypixel currently uses.
        const mobTypes = ENCHANT_ID_MOB_TYPES[entry.id.toLowerCase()];
        const condition = mobTypes ? mobTypes.join(', ') : cleanTargetText(m[1]);
        out.additiveConditional.push({ id, label: name, source, value, condition });
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
// Item/pet ability text: two real phrasings for the same "bonus damage
// vs a mob category" mechanic, verified against Necron's Blade-family
// weapons (object-last: "Deals +50% damage to Wither mobs") and a
// subject-first "X mobs take Nx damage" shape (the player dealing more
// damage TO those mobs).
//
// "X mobs DEAL Nx damage", despite the superficially similar shape, means
// the opposite: those mobs deal that damage TO THE PLAYER — an incoming-
// damage penalty, not a player damage-output source. Verified directly:
// Crown of Avarice's own lore says "Mythological mobs deal 1.5x damage"
// for the exact same mechanic Crown of Greed spells out unambiguously as
// "but you take 1.25x damage from them". Excluded entirely (not even
// shown as situational — it isn't a damage-dealt source at all, so it's
// out of this tool's scope rather than merely unresolved).
const INCOMING_DAMAGE_RE = /[^.]+?\s+mobs?\s+deals?\s+\+?[\d.]+x\s+damage/i;
// "to X mobs" (Necron's Blade family) and "against X" (Demonslayer
// Gauntlet: "Deal +10% damage against Blazes.") are the same mechanic —
// the target isn't always suffixed with the generic word "mobs" (a
// specific plural mob name like "Blazes" stands alone), so that suffix
// is optional, bounded by a lookahead to the next period/end of string
// rather than consumed, so it doesn't get pulled into the captured name.
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

function pushParagraphMatch(out, text, label, source, id) {
  const match = matchDamageParagraph(text);
  if (!match) return;
  if (match.bucket === 'situational') {
    out.situational.push({ id, label, source, note: match.note, formula: null });
  } else if (match.bucket === 'multiplicative') {
    out.multiplicative.push({ id, label, source, value: match.value, condition: match.condition });
  } else if (match.bucket === 'additiveConditional') {
    out.additiveConditional.push({ id, label, source, value: match.value, condition: match.condition });
  } else {
    out.additiveNonConditional.push({ id, label, source, value: match.value });
  }
}

function scanItemAbilityText(lore, label, source, out, idPrefix) {
  splitParagraphs(lore)
    .filter((p) => !isStatBlockParagraph(p))
    .forEach((p, idx) => pushParagraphMatch(out, stripToPlain(stripLeadingHeaderLine(p)), label, source, `${idPrefix}-${idx}`));
}

// ---------------------------------------------------------------------
// Special-mechanic weapons (lib/specialWeapons.js) already have their
// bonus correctly computed as a real number from the player's entered
// value — pulled directly here rather than re-derived by regex over
// static lore text, to avoid drift/double-counting.
function collectSpecialMechanicEntries(item, modifiers, itemLabel, slotLabel, out) {
  const config = getSpecialConfig(item.id);
  if (!config) return;
  const bonus = computeSpecialBonus(config, modifiers.special);
  if (!bonus) return;

  if (config.kind === 'bestiary') {
    out.additiveConditional.push({
      id: `${item.id}-special`,
      label: `${itemLabel} (Bestiary)`,
      source: slotLabel,
      value: bonus,
      condition: 'Mythological',
    });
  } else if (config.kind === 'crownOfAvarice') {
    const { damageMultiplier } = crownOfAvariceStats(config, bonus);
    // Real lore: "...deal +0.015x Damage for each digit of Coins
    // consumed" and "Grants +2.5 Magic Find against Mythological mobs"
    // read as one clause but are two separate mechanics — the damage
    // multiplier applies to all mobs; only the (unmodeled) Magic Find
    // bonus is Mythological-restricted.
    out.multiplicative.push({
      id: `${item.id}-special`,
      label: `${itemLabel} (Coins Consumed)`,
      source: slotLabel,
      value: damageMultiplier,
    });
  }
  // midasSword/midasStaff: already merged into base stats (see
  // lib/statLines.js's mergeStatIntoBase) — nothing more to add.
}

// ---------------------------------------------------------------------
// Pet: base Strength/Crit Chance/Crit Damage handled in collectBaseStats
// above; this covers the pet's own ability text (e.g. Ender Dragon's
// "End Strike: Deal 200% more damage to Ender mobs", picked up by the
// same generic scan as items) plus Golden Dragon's "Legendary Treasure"
// (%damage per million bank coins, capped) — its rate/cap are already-
// substituted real numbers straight from the pet's own lore (the
// {3}%/{4}% placeholders lib/petData.js's substitutePetLore already
// fills in for the current level), not hardcoded, so they track the
// equipped Golden Dragon's real level automatically.
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
// Attributes (lib/attributes.js) — account-wide, not tied to any equipped
// item, so this reads straight from BuildContext's `attributes` state
// rather than the loadout. The Echo chain is computed once up front
// (Echo of Ruler/Echo of Elemental are each boosted by Echo of Echoes,
// never by themselves) and applied to every Ruler/Strength-Elemental
// attribute's own value before it's pushed/summed — see
// lib/attributes.js's computeEchoBoost for the verified formula.
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

  // Folded into one "Attributes" base-stat source line rather than one
  // per Elemental attribute — see addBaseStat.
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

  // Warrior is Deadeye's exact inverse condition — "melee damage" means
  // any equipped weapon that isn't a bow, reusing the same isBowEquipped
  // check already established for that split.
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
      condition: 'Bosses, Miniboss',
    });
  }

  const dominanceLevel = attributes.dominance || 0;
  if (dominanceLevel) {
    out.additiveNonConditional.push({ id: 'attr-dominance', label: 'Dominance', source: 'Attribute', value: DOMINANCE_RATE * dominanceLevel });
  }

  // Unlimited Power/Energy apply after everything else — a true
  // multiplier on the fully-summed Strength/Crit Damage (every source
  // above, including this function's own Ruler/Elemental contributions)
  // — baked directly into baseStats itself (as its own "Unlimited Power"/
  // "Unlimited Energy" source line) rather than kept as a separate
  // percent for lib/finalDamage.js to apply on top; that way the (Base)
  // Stats total shown in Damage Sources already reflects it. Almighty
  // ('Your "Unlimited" Attributes are +5%-50% stronger') is the same
  // keyword-matching relative-boost mechanism as the Echo chain, just
  // targeting both Unlimited attributes directly instead of a family —
  // it isn't itself named "Echo" so Echo of Echoes doesn't boost it back.
  const almightyBoost = ALMIGHTY_RATE * (attributes.almighty || 0);
  const unlimitedPowerPercent = UNLIMITED_POWER_RATE * (attributes.unlimited_power || 0) * (1 + almightyBoost / 100);
  const unlimitedEnergyPercent = UNLIMITED_ENERGY_RATE * (attributes.unlimited_energy || 0) * (1 + almightyBoost / 100);
  addBaseStat(out, 'strength', out.baseStats.strength * (unlimitedPowerPercent / 100), 'Unlimited Power');
  addBaseStat(out, 'crit_damage', out.baseStats.crit_damage * (unlimitedEnergyPercent / 100), 'Unlimited Energy');
}

// ---------------------------------------------------------------------
export async function collectDamageSources(loadout, itemData, playerStats, godPotionActive, attributes) {
  const out = {
    baseStats: { damage: 0, strength: 0, crit_chance: 0, crit_damage: 0 },
    baseStatSources: { damage: [], strength: [], crit_chance: [], crit_damage: [] },
    additiveNonConditional: [],
    additiveConditional: [],
    multiplicative: [],
    situational: [],
  };

  await collectBaseStats(loadout, itemData, playerStats?.catacombsLevel, playerStats?.tamingLevel, out);
  addBaseStat(out, 'strength', computeForagingStrengthBonus(playerStats?.foragingLevel), 'Foraging Level');
  addBaseStat(out, 'strength', computeSkyblockLevelStrengthBonus(playerStats?.skyblockLevel), 'Skyblock Level');
  // Every player starts with these two stats before any gear at all —
  // real Hypixel base stats, unlike Damage/Strength which start at 0.
  addBaseStat(out, 'crit_chance', BASE_CRIT_CHANCE, 'Base');
  addBaseStat(out, 'crit_damage', BASE_CRIT_DAMAGE, 'Base');

  // God Potion — a flat on/off toggle, not a level. Only the pieces this
  // app tracks as aggregate base stats (Strength/Crit Chance/Crit
  // Damage) are wired in; see lib/godPotion.js for what's excluded and
  // why. Archery IV's bow damage is a genuine %-damage bonus (not a raw
  // stat), so it's itemized in additiveNonConditional like every other
  // enchant/ability — but only when a bow is actually equipped, since
  // it's conditional on the player's own weapon, not the target mob.
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

  // Golden Dragon's "Dragon's Greed" — assumed always active at its real
  // max (+5% Strength, see lib/petData.js) since this app has no
  // aggregate Magic Find total to scale it off of. Applied as a flat %
  // boost on the fully-summed Strength total so far (gear/pet/accessory/
  // Foraging/Skyblock Level/God Potion), added as its own base-stat
  // source line — computed here rather than inside collectBaseStats so
  // it captures the player's full Strength, not just the pet's own.
  if (loadout.pet?.item?.petId === 'GOLDEN_DRAGON') {
    addBaseStat(
      out,
      'strength',
      out.baseStats.strength * (DRAGONS_GREED_MAX_STRENGTH_PERCENT / 100),
      "Dragon's Greed (assumed max)",
    );
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
      await collectEnchantEntries(enchantEntries, itemLabel, slotLabel, itemData.enchants, out);
    }

    if (!SPECIAL_SCAN_EXCLUDE_IDS.has(equipped.item.id)) {
      scanItemAbilityText(equipped.item.lore, itemLabel, slotLabel, out, `${slot}-ability`);
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

    if (equipped.item.id === 'ATOMSPLIT_KATANA') {
      out.multiplicative.push({
        id: 'atomsplit-katana-endermen',
        label: `${itemLabel} (Endermen family)`,
        source: slotLabel,
        value: ATOMSPLIT_KATANA_DAMAGE_MULTIPLIER,
        condition: ATOMSPLIT_KATANA_MOBS.join(', '),
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
  }

  await collectPetEntries(loadout, itemData, out);

  collectAttributeEntries(attributes, loadout, out);

  return out;
}

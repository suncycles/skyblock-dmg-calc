import { STAT_LABELS } from './reforgeData';
import { buildFullItemTooltipLines } from './itemTooltip';
import {
  sumStatFromTooltipLines,
  sumDungeonizedStatFromTooltipLines,
  sumMasterDungeonizedStatFromTooltipLines,
} from './dungeonize';
import { FABLED_REFORGE_NAME, FABLED_CRIT_BONUS_MAX_PERCENT } from './reforges';
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
  INFERNAL_CRIMSON_SET,
  INFERNAL_CRIMSON_MIN_PIECES,
  INFERNAL_CRIMSON_PERCENT_PER_STACK,
  STRONG_DRAGON_SET,
  STRONG_DRAGON_ASPECT_WEAPON_IDS,
  STRONG_DRAGON_DAMAGE_BONUS,
  SUPERIOR_DRAGON_SET,
  SUPERIOR_DRAGON_STAT_BOOST_PERCENT,
  TUXEDO_TIERS,
  MAGMA_LORD_SET,
  MAGMA_LORD_MULTIPLIER_PER_PIECE,
  THUNDER_SET,
  THUNDER_MULTIPLIER_PER_PIECE,
  LAVA_SEA_CREATURE_ARMOR_MULTIPLIER,
  LAVA_SEA_CREATURE_ARMOR_PIECES,
  hasFullSet,
  countSetPieces,
  hasAnyEquippedId,
} from './armorSetBonuses';
import {
  petLoreItemId,
  computeAllPetStats,
  computeOtherNums,
  substitutePetLore,
  getMaxPetLevel,
  applyGoldenDragonShiningScales,
  applyLionPrimalForce,
  applyAnkylosaurusMax,
  DRAGONS_GREED_MAX_STRENGTH_PERCENT,
} from './petData';
import { parsePetItemStatBoost, applyPetItemStatBoost } from './petItemEffects';
import { fetchNeuItem } from './neuItems';
import {
  computeCombatLevelBonus,
  computeSkyblockLevelMultiplier,
  computeSkyblockLevelStrengthBonus,
  computeForagingStrengthBonus,
  computeAlchemyIntelligenceBonus,
  computeEnchantingIntelligenceBonus,
  computeEnchantingAbilityDamageBonus,
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
  ELEMENTAL_INTELLIGENCE_RATE,
  INTELLIGENCE_ELEMENTAL_ATTRIBUTES,
  DEADEYE_RATE,
  WARRIOR_RATE,
  ELITE_RATE,
  UNLIMITED_POWER_RATE,
  UNLIMITED_ENERGY_RATE,
  MAXIMAL_TORMENT_RATE,
  ALMIGHTY_RATE,
  DOMINANCE_RATE,
  ATTACK_SPEED_SHARD_RATE,
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
const TRACKED_STATS = [
  'damage',
  'strength',
  'crit_chance',
  'crit_damage',
  'intelligence',
  'ability_damage',
  'bonus_attack_speed',
  'ferocity',
];

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
  // Pooch Sword — its "+200% Damage against Wolves" line sits directly above two unrelated
  // Animal-mob clauses with no blank line between them, so the generic scan's target-text
  // capture bleeds across all three; hardcoded in POOCH_SWORD_WOLF_DAMAGE_PERCENT instead.
  'POOCH_SWORD',
  // Blaze Slayer daggers — each has two "Deal Nx damage to Y mobs" clauses stacked in one
  // paragraph, a phrasing ("Deal Nx damage to Y", not "Y mobs take Nx damage") the generic
  // scan's regexes don't match at all; hardcoded in DAGGER_MOB_MULTIPLIERS instead.
  'BURSTFIRE_DAGGER',
  'BURSTMAW_DAGGER',
  'FIREDUST_DAGGER',
  'HEARTFIRE_DAGGER',
  'HEARTMAW_DAGGER',
  'MAWDUST_DAGGER',
]);

// Each Blaze Slayer dagger's own two-mob-type multipliers (real lore, both clauses).
// Firedust-vs-Infernal and Twilight-vs-Skeletal are overridden to 1.25x — the lore's stated
// 1.2x/1.1x is a known in-game bug; the real applied multiplier is 1.25x for both.
const DAGGER_MOB_MULTIPLIERS = {
  FIREDUST_DAGGER: [
    { multiplier: 1.25, condition: 'Infernal' },
    { multiplier: 1.1, condition: 'Wither' },
  ],
  BURSTFIRE_DAGGER: [
    { multiplier: 1.5, condition: 'Infernal' },
    { multiplier: 1.2, condition: 'Wither' },
  ],
  HEARTFIRE_DAGGER: [
    { multiplier: 2, condition: 'Infernal' },
    { multiplier: 1.5, condition: 'Wither' },
  ],
  MAWDUST_DAGGER: [
    { multiplier: 1.5, condition: 'Infernal' },
    { multiplier: 1.25, condition: 'Skeletal' },
  ],
  BURSTMAW_DAGGER: [
    { multiplier: 2.5, condition: 'Infernal' },
    { multiplier: 1.5, condition: 'Skeletal' },
  ],
  HEARTMAW_DAGGER: [
    { multiplier: 3.5, condition: 'Infernal' },
    { multiplier: 2, condition: 'Skeletal' },
  ],
};

// Pooch Sword's "+200% Damage against Wolves" — see SPECIAL_SCAN_EXCLUDE_IDS above for why
// this can't go through the generic ability-text scan. "Wolves" covers every wolf-family mob,
// same list as mobModelIcons.json's wolf.png mapping.
const POOCH_SWORD_WOLF_DAMAGE_PERCENT = 200;
const WOLF_FAMILY_MOBS = [
  'Glacite Mutt',
  'Howling Spirit',
  'Pack Spirit',
  'Soul of the Alpha',
  'Sven Alpha',
  'Sven Follower',
  'Sven Packmaster',
  'Wolf',
];

// Warden Helmet's Brute Force ability, assumed fully active, also maxes out at 161% rather than 160%.
const WARDEN_HELMET_BRUTE_FORCE_PERCENT = 161;

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
// separately. sumStatFromTooltipLines (imported from lib/dungeonize.js, the canonical
// implementation) reads the settled current total, excluding Reforge/Books/Gemstone/
// Dungeonize/Master Star annotations — each of those echoes an amount already reflected
// elsewhere rather than adding on top, so folding them in here would double-count. In
// particular, Dungeonize's dark-grey annotation must stay excluded from this "normal" total:
// it's a standalone replacement total (see dungeonizeDelta below), not an addition, and must
// only ever reach display via dungeonizedBaseStats when "Toggle Dungeon Stats" is on.

// Chimera enchant: copies 20%/level of the active pet's Strength/Crit Chance/Crit Damage, stacked on top of the pet's own contribution.
const CHIMERA_PERCENT_PER_LEVEL = 20;
// Manticore Claw gloves: same "copy the equipped pet's Strength/Crit Chance/Crit Damage" mechanic
// as Chimera, but a flat 10% (not level-scaled).
const MANTICORE_CLAW_PERCENT = 10;
// Skeleton pet: +75% additive Damage when a bow is equipped, doubled to +150% when the
// "Toggle Dungeon Stats" switch is on.
const SKELETON_ARROW_BONUS_PERCENT = 75;
// Ankylosaurus pet: assumed always at its real max, ignoring its actual "Unyielding"/"Clubbed
// Tail" perks per instruction.
// Lion's King of the Jungle (Legendary only, assumed always active): 1.5% additive Damage per pet level.
const KING_OF_THE_JUNGLE_PERCENT_PER_LEVEL = 1.5;
// Blaze pet's "In Crimson Isle" toggle: +10% final multiplier on Strength/Crit Chance/Crit
// Damage, same mechanism as Unlimited Power/Energy (see collectFinalStatBoosts below).
const BLAZE_CRIMSON_ISLE_PERCENT = 10;
// Ender Dragon's Legendary-only Superior perk: real max is 0.1%/level, capped at 10% at level
// 100 — assumed always at that real max rather than scaled by the pet's actual level, same
// "assumed max" treatment as Ankylosaurus/King of the Jungle above. Applied as a final
// multiplier on the fully-summed (Base) Stats (see finalMultiplierStats below), not on the
// pet's own stat block — a per-pet-stat multiply there would double-count against this.
const ENDER_DRAGON_SUPERIOR_PERCENT = 10;
// Renowned reforge (armor): +1% final multiplier on Strength/Crit Chance/Crit Damage per
// equipped piece with this reforge.
const RENOWNED_PERCENT_PER_PIECE = 1;
const RENOWNED_REFORGE_NAME = 'Renowned';
// Ultimate Legion: boost% = legionPlayers × 0.07 × enchant level (max level 5 → 0.35%/player).
const LEGION_PERCENT_PER_PLAYER_PER_LEVEL = 0.07;
// Ultimate Swarm/Combo: per-enchant-level additive-damage-per-stack percentages.
const SWARM_PERCENT_BY_LEVEL = [null, 2, 4, 6, 8, 10];
const COMBO_PERCENT_BY_LEVEL = [null, 1, 2, 3, 4, 5];

// Tarantula/Primordial Helmet's "Radioactive" extra bonus: flat Crit Damage per 10 Strength
// (real lore: "Grants +1/+1.5 Crit Damage per 10 Strength. (Max 1,000 Strength)"), read off the
// fully-summed final Strength total (after every other Strength-boosting source, including the
// final-multiplier stat-boost stage) since that's what a real player's own Strength stat reads.
const RADIOACTIVE_CRIT_DAMAGE_PER_10_STRENGTH = { TARANTULA_HELMET: 1, PRIMORDIAL_HELMET: 1.5 };
const RADIOACTIVE_MAX_STRENGTH = 1000;

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

async function collectBaseStats(loadout, itemData, catacombsLevel, tamingLevel, generalsMedallionDigits, out) {
  // Computed first so Chimera (found while scanning enchants below) can copy the pet's final stats.
  let petStats = { STRENGTH: 0, CRIT_CHANCE: 0, CRIT_DAMAGE: 0 };
  out.enderDragonSuperiorPercent = 0;
  out.firstPounceFactor = 1;
  if (loadout.pet) {
    const { item: pet, modifiers } = loadout.pet;
    const maxLevel = getMaxPetLevel(pet.petId);
    const levels = itemData.pets?.[pet.petId]?.[pet.tier];
    let stats = computeAllPetStats(levels, modifiers.level, maxLevel);
    stats = applyGoldenDragonShiningScales(pet.petId, stats, modifiers.goldCollection);
    const statsBeforePetItem = stats;
    const petItemId = modifiers.petItem;
    const petItem = petItemId ? (itemData.petItems || []).find((i) => i.id === petItemId) : null;
    let boost = petItem ? parsePetItemStatBoost(petItem.lore) : null;
    // T-Rex's Tyrant perk: scales the pet item's own Combat-stat boost by (1 + pet level%/100)
    // — e.g. level 100 doubles it, level 50 gives x1.5. Applied before the boost is folded in.
    const isTyrant = !!(boost && pet.petId === 'TYRANNOSAURUS');
    if (isTyrant) {
      const tyrantFactor = 1 + (modifiers.level || 0) / 100;
      boost = { ...boost, percent: boost.percent * tyrantFactor };
    }
    stats = applyPetItemStatBoost(stats, boost);
    // Surfaced as its own breakdown line (not silently folded into "Pet") so the Tyrant scaling
    // is actually visible/verifiable rather than just changing the combined pet total.
    let petItemDeltas = null;
    if (boost) {
      petItemDeltas = {};
      for (const key of ['STRENGTH', 'CRIT_CHANCE', 'CRIT_DAMAGE']) {
        petItemDeltas[key] = (stats[key] || 0) - (statsBeforePetItem[key] || 0);
      }
    }
    const otherNums = computeOtherNums(levels, modifiers.level, maxLevel);

    // Ender Dragon's Legendary Superior perk — stashed for collectFinalStatBoosts to apply as a
    // final multiplier on the fully-summed (Base) Stats, not the pet's own stat block.
    if (pet.petId === 'ENDER_DRAGON' && pet.tier === 'LEGENDARY') {
      out.enderDragonSuperiorPercent = ENDER_DRAGON_SUPERIOR_PERCENT;
    }

    // Ankylosaurus: assumed always at its real max (+500 Strength), ignoring its actual
    // "Unyielding"/"Clubbed Tail" perks per instruction.
    stats = applyAnkylosaurusMax(pet.petId, stats);

    // Lion's First Pounce: multiplies First Strike/Triple Strike's bonus — Rare 1.8x, Epic/Legendary 2x.
    if (pet.petId === 'LION') {
      if (pet.tier === 'RARE') out.firstPounceFactor = 1.8;
      else if (pet.tier === 'EPIC' || pet.tier === 'LEGENDARY') out.firstPounceFactor = 2;
    }

    // Lion's Primal Force: flat Strength (shown on the pet's own stats too, see petData.js) +
    // Damage add (Damage isn't a real pet stat, so it's only added here), scaled via otherNums[0].
    if (pet.petId === 'LION') {
      const primalForce = otherNums?.[0] || 0;
      stats = applyLionPrimalForce(pet.petId, stats, otherNums);
      addBaseStat(out, 'damage', primalForce, 'Lion (Primal Force)');
      // King of the Jungle (Legendary only, assumed always active): 1.5% * pet level unconditional additive Damage.
      if (pet.tier === 'LEGENDARY') {
        const kingOfTheJungle = KING_OF_THE_JUNGLE_PERCENT_PER_LEVEL * (modifiers.level || 0);
        if (kingOfTheJungle) {
          out.additiveNonConditional.push({
            id: 'lion-king-of-the-jungle',
            label: 'Lion (King of the Jungle, assumed active)',
            source: 'Pet',
            value: kingOfTheJungle,
          });
        }
      }
    }

    // T-Rex's Close Combat: assumed always active, scales with real pet level (not forced max).
    if (pet.petId === 'TYRANNOSAURUS') {
      const closeCombat = modifiers.level || 0;
      if (closeCombat) {
        out.additiveNonConditional.push({
          id: 'trex-close-combat',
          label: 'T-Rex (Close Combat, assumed active)',
          source: 'Pet',
          value: closeCombat,
        });
      }
    }

    petStats = stats;
    // `stats` here already includes every species perk applied above (Ankylosaurus, Lion's
    // Primal Force, ...) plus the pet item boost — subtract just the isolated pet-item delta
    // (not the stale pre-species-perk snapshot) so those flat additions aren't dropped.
    addBaseStat(out, 'strength', (stats.STRENGTH || 0) - (petItemDeltas?.STRENGTH || 0), 'Pet');
    addBaseStat(out, 'crit_chance', (stats.CRIT_CHANCE || 0) - (petItemDeltas?.CRIT_CHANCE || 0), 'Pet');
    addBaseStat(out, 'crit_damage', (stats.CRIT_DAMAGE || 0) - (petItemDeltas?.CRIT_DAMAGE || 0), 'Pet');
    if (petItemDeltas) {
      const petItemLabel = isTyrant ? `Pet Item (${petItem.name}, Tyrant)` : `Pet Item (${petItem.name})`;
      if (petItemDeltas.STRENGTH) addBaseStat(out, 'strength', petItemDeltas.STRENGTH, petItemLabel);
      if (petItemDeltas.CRIT_CHANCE) addBaseStat(out, 'crit_chance', petItemDeltas.CRIT_CHANCE, petItemLabel);
      if (petItemDeltas.CRIT_DAMAGE) addBaseStat(out, 'crit_damage', petItemDeltas.CRIT_DAMAGE, petItemLabel);
    }
  }

  // Legendary Blaze pet doubles the Hot/Fuming Potato Book bonus on both weapons and armor.
  const potatoBookDoubled = loadout.pet?.item?.petId === 'BLAZE' && loadout.pet?.item?.tier === 'LEGENDARY';

  for (const slot of GEAR_SLOTS) {
    const equipped = loadout[slot];
    if (!equipped) continue;
    const slotLabel = SLOT_LABELS[slot];
    const lines = await buildFullItemTooltipLines(
      equipped.item,
      equipped.modifiers,
      itemData,
      catacombsLevel,
      tamingLevel,
      undefined,
      undefined,
      generalsMedallionDigits,
      undefined,
      potatoBookDoubled,
    );
    for (const statKey of TRACKED_STATS) {
      const label = STAT_LABELS[statKey].label;
      const normal = sumStatFromTooltipLines(lines, label);
      addBaseStat(out, statKey, normal, slotLabel);
      // Falls back to `normal` itself when the item isn't dungeonized, so the toggle never
      // leaves a stat missing — see lib/dungeonize.js's own fallback behavior.
      out.dungeonizeDelta[statKey] += sumDungeonizedStatFromTooltipLines(lines, label) - normal;
      out.masterDungeonizeDelta[statKey] += sumMasterDungeonizedStatFromTooltipLines(lines, label) - normal;
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

    // Manticore Claw gloves: same "copy the equipped pet's Combat stats" mechanic as Chimera, flat 10%.
    if (equipped.item.id === 'MANTICORE_CLAW') {
      const fraction = MANTICORE_CLAW_PERCENT / 100;
      const label = `${slotLabel} (Manticore Claw)`;
      addBaseStat(out, 'strength', (petStats.STRENGTH || 0) * fraction, label);
      addBaseStat(out, 'crit_chance', (petStats.CRIT_CHANCE || 0) * fraction, label);
      addBaseStat(out, 'crit_damage', (petStats.CRIT_DAMAGE || 0) * fraction, label);
    }
  }

  if (loadout.accessory?.item) {
    const { item, modifiers } = loadout.accessory;
    // Includes each Stone Power's flat "Unique Power Bonus" (e.g. Bizarre's +5 Ability Damage,
    // Hurtful's +15 Bonus Attack Speed) alongside its MP-scaled base stats and Tuning — see
    // lib/accessoryPowers.js's computeAccessoryTotalStats. Only forwards the stats this file
    // actually tracks; Powers can also grant health/defense/speed/true_defense (e.g. Pleasant,
    // Buttery), which have no slot in out.baseStats since they're not damage-relevant.
    const accessoryStats = computeAccessoryTotalStats(item.id, modifiers.magicalPower, modifiers.tuning);
    for (const statKey of ['strength', 'crit_chance', 'crit_damage', 'intelligence', 'ability_damage', 'bonus_attack_speed', 'ferocity']) {
      addBaseStat(out, statKey, accessoryStats[statKey] || 0, 'Accessory');
    }
  }
}

// ---------------------------------------------------------------------
// Enchants: parses each applied enchant's real per-level lore for a %-damage bonus, either
// conditional (Smite-style) or not. Giant Killer's per-missing-HP rate gets its capped value;
// anything else of that shape (e.g. Execute) has no fixed value and goes to situational.
// "dealt" is optional and "bow " is an allowed prefix — Power V's real lore is "Increases bow
// damage by 40%," which has neither "dealt" nor a "to <target>" clause.
const PERCENT_TO_TARGET_RE = /Increases\s+(?:melee\s+|ranged\s+|bow\s+)?damage(?:\s+dealt)?(?:\s+to\s+(.+?))?\s+by\s+\+?([\d.]+)%/i;
const PER_TARGET_STAT_RE =
  /Increases\s+damage\s+dealt\s+by\s+\+?([\d.]+)%\s+for\s+each\s+(?:percent|%)\s+of\s+(.+?)(?:,?\s+up\s+to\s+\+?([\d.]+)%)?\.?\s*$/i;

// One For All: fixed +500% weapon damage, hardcoded since its lore phrasing doesn't match the generic regexes.
const ONE_FOR_ALL_DAMAGE_PERCENT = 500;

// Overload's real per-level lore: "...dealing 10%/20%/30%/40%/50% extra damage" at levels I-V.
const OVERLOAD_DAMAGE_PERCENT_PER_LEVEL = 10;

// First Strike/Triple Strike only apply on the first hit(s) of a fight — modeled as active only at 100% mob HP.
const FIRST_HIT_ENCHANT_IDS = new Set(['first_strike', 'triple_strike']);

async function collectEnchantEntries(entries, itemLabel, slotLabel, enchantsMeta, out, mobHpPercent, swarmMobs, comboKills, legionPlayers, firstPounceFactor = 1) {
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

    // Ultimate Swarm/Combo: per-enchant-level %/stack × the player-entered stack count (Misc panel).
    const key = entry.id.toLowerCase();
    if (key === 'ultimate_swarm' || key === 'ultimate_combo') {
      const perLevelTable = key === 'ultimate_swarm' ? SWARM_PERCENT_BY_LEVEL : COMBO_PERCENT_BY_LEVEL;
      const stacks = key === 'ultimate_swarm' ? swarmMobs : comboKills;
      const perStack = perLevelTable[entry.level];
      if (perStack) {
        out.additiveNonConditional.push({
          id: `${slotLabel}-${entry.id}`,
          label: `${titleCaseEnchantId(entry.id)} ${toRoman(entry.level)} (${stacks} ${key === 'ultimate_swarm' ? 'Mobs' : 'Kills'})`,
          source: `${itemLabel} (${slotLabel})`,
          value: perStack * stacks,
        });
      }
      continue;
    }

    // Ultimate Legion: boost% = legionPlayers × 0.07 × enchant level — final multiplier, not additive.
    if (key === 'ultimate_legion') {
      out.legionEnchantLevel = entry.level;
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
          out.additiveNonConditional.push({ id, label: `${name} (at ${mobHpPercent}% HP)`, source, value, abilityEligible: true });
        }
      } else if (key === 'giant_killer' && cap != null) {
        out.additiveNonConditional.push({ id, label: name, source, value: cap, abilityEligible: true });
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
        // Mage Mode only counts the 7 real type-bane enchants (Smite/Ender Slayer/Bane of
        // Arthropods/Smoldering/Cubism/Impaling/Arcane) toward Ability Damage — mobTypes being
        // set means entry.id is one of those, since it's the same ENCHANT_ID_MOB_TYPES map.
        out.additiveConditional.push({ id, label: name, source, value, condition, abilityEligible: !!mobTypes });
      } else if (FIRST_HIT_ENCHANT_IDS.has(entry.id.toLowerCase())) {
        // Only counted at 100% mob HP. Lion's First Pounce scales this up (see collectBaseStats).
        if (mobHpPercent === 100) {
          const boosted = value * firstPounceFactor;
          const label = firstPounceFactor > 1 ? `${name} (first hit, 100% HP, Lion First Pounce)` : `${name} (first hit, 100% HP)`;
          out.additiveNonConditional.push({ id, label, source, value: boosted });
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
// "Every Nth strike/hit, deal +X% damage" (Tarantula/Primordial armor's Octodexterity set
// bonus) is a periodic proc, not a per-hit bonus — the generic "deals +X% damage" match below
// can't tell the difference and was wrongly counting it as flat unconditional additive damage
// on every equipped piece (all 4 pieces of each set repeat this same paragraph). Deliberately
// not modeled at all (not even as a situational note) — excluded entirely, same as
// INCOMING_DAMAGE_RE above.
const PERIODIC_PROC_RE = /\bevery\s+\d+(?:st|nd|rd|th)\s+(?:strike|hit)\b/i;
// "to X" and "against X" are the same mechanic; the trailing "mobs" suffix is optional.
const DEALS_TO_TARGET_RE = /deals?\s+\+?([\d.]+)%\s+(?:more\s+)?damage\s+(?:to|against)\s+([^.]+?)(?:\s+mobs?)?(?=[.]|$)/i;
const SUBJECT_MULTIPLIER_RE = /([^.]+?)\s+mobs?\s+takes?\s+\+?([\d.]+)x\s+damage/i;
const DEALS_FLAT_RE = /deals?\s+\+?([\d.]+)%\s+(?:more\s+)?damage\b/i;

function matchDamageParagraph(text) {
  if (INCOMING_DAMAGE_RE.test(text)) return null;
  if (PERIODIC_PROC_RE.test(text)) return null;

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
// `abilityEligible`: tags the pushed entry so Mage Mode's Ability Damage additive multiplier (finalDamage.js's
// computeAbilityDamage) also counts it — only set true by callers that know this specific paragraph is one of the
// hand-verified ability-eligible sources (see collectPetEntries).
function pushParagraphMatch(out, text, label, source, id, asWeaponBonus, abilityEligible) {
  const match = matchDamageParagraph(text);
  if (!match) return;
  if (match.bucket === 'situational') {
    out.situational.push({ id, label, source, note: match.note, formula: null });
  } else if (match.bucket === 'multiplicative') {
    out.multiplicative.push({ id, label, source, value: match.value, condition: match.condition });
  } else if (match.bucket === 'additiveConditional') {
    const bucket = asWeaponBonus ? out.weaponBonusConditional : out.additiveConditional;
    bucket.push({ id, label, source, value: match.value, condition: match.condition, abilityEligible });
  } else {
    const bucket = asWeaponBonus ? out.weaponBonusNonConditional : out.additiveNonConditional;
    bucket.push({ id, label, source, value: match.value, abilityEligible });
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

// Pets whose own ability text is a real per-hit damage bonus in the "deals +X% damage to Y
// mobs" shape Mage Mode's ability formula counts — verified directly against NEU-REPO item
// lore: Ender Dragon's End Strike (+X% vs Ender), Zombie's Rotten Blade (+X% vs Undead), Wither
// Skeleton's Wither Blood (+X% vs Wither). Every other pet's ability text either isn't a damage
// bonus at all or (like Golden Dragon's Legendary Treasure, handled separately below) isn't in
// this shape, so this is an explicit allowlist rather than a blanket "all pets" flag.
const ABILITY_ELIGIBLE_PET_IDS = new Set(['ENDER_DRAGON', 'ZOMBIE', 'WITHER_SKELETON']);

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
          out.additiveNonConditional.push({
            id: 'golden-dragon-legendary-treasure',
            label: 'Legendary Treasure',
            source,
            value,
            abilityEligible: true,
          });
        }
        return; // handled — don't also generic-scan this paragraph
      }
    }

    pushParagraphMatch(
      out,
      stripToPlain(stripLeadingHeaderLine(p)),
      petLabel,
      source,
      `pet-${idx}`,
      false,
      ABILITY_ELIGIBLE_PET_IDS.has(pet.petId),
    );
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

  // Folded into one "Attributes" base-stat source line. Echo of Elemental boosts the whole
  // Elemental family — both the Strength-granting and Intelligence-granting attributes.
  for (const { id } of STRENGTH_ELEMENTAL_ATTRIBUTES) {
    const level = attributes[id] || 0;
    if (!level) continue;
    const base = ELEMENTAL_STRENGTH_RATE * level;
    addBaseStat(out, 'strength', base * (1 + echoOfElementalBoost / 100), 'Attributes');
  }
  for (const { id } of INTELLIGENCE_ELEMENTAL_ATTRIBUTES) {
    const level = attributes[id] || 0;
    if (!level) continue;
    const base = ELEMENTAL_INTELLIGENCE_RATE * level;
    addBaseStat(out, 'intelligence', base * (1 + echoOfElementalBoost / 100), 'Attributes');
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

  // Attack Speed shard ("Inferno Demonlord") — always-active, feeds Bonus Attack Speed directly
  // rather than a % damage source, same treatment as the Elemental families above.
  const attackSpeedLevel = attributes.attack_speed || 0;
  if (attackSpeedLevel) {
    addBaseStat(out, 'bonus_attack_speed', ATTACK_SPEED_SHARD_RATE * attackSpeedLevel, 'Attributes');
  }

  // Unlimited Power/Energy/Torrent apply last, as a true multiplier on the fully-summed
  // Strength/Crit Damage/Intelligence — baked into baseStats directly rather than left for
  // finalDamage.js to apply. Almighty boosts all three; Echo of Echoes in turn boosts Almighty
  // itself, same chained-boost mechanism as Echo of Ruler/Echo of Elemental above.
  const almightyBoost = computeEchoBoost(ALMIGHTY_RATE, attributes.almighty, attributes.echo_of_echoes);
  const unlimitedPowerPercent = UNLIMITED_POWER_RATE * (attributes.unlimited_power || 0) * (1 + almightyBoost / 100);
  const unlimitedEnergyPercent = UNLIMITED_ENERGY_RATE * (attributes.unlimited_energy || 0) * (1 + almightyBoost / 100);
  const maximalTormentPercent = MAXIMAL_TORMENT_RATE * (attributes.maximal_torment || 0) * (1 + almightyBoost / 100);
  addBaseStat(out, 'strength', out.baseStats.strength * (unlimitedPowerPercent / 100), 'Unlimited Power');
  addBaseStat(out, 'crit_damage', out.baseStats.crit_damage * (unlimitedEnergyPercent / 100), 'Unlimited Energy');
  addBaseStat(out, 'intelligence', out.baseStats.intelligence * (maximalTormentPercent / 100), 'Unlimited Torment');
}

// ---------------------------------------------------------------------
export async function collectDamageSources(
  loadout,
  itemData,
  playerStats,
  godPotionActive,
  attributes,
  miscStats,
  mobHpPercent = 100,
  infernalCrimsonStacks = 1,
  useDungeonizedStats = false,
  swarmMobs = 1,
  comboKills = 1,
  legionPlayers = 0,
  blazeCrimsonIsle = false,
) {
  const out = {
    baseStats: Object.fromEntries(TRACKED_STATS.map((key) => [key, 0])),
    baseStatSources: Object.fromEntries(TRACKED_STATS.map((key) => [key, []])),
    // Gear-only deltas (dungeonized/master total minus normal total, summed across equipped
    // items) folded into baseStats at the very end to produce dungeonizedBaseStats/
    // masterDungeonizedBaseStats — kept separate from baseStats since player-level bonuses
    // computed off the running baseStats total (Dragon's Greed, Sacred Strength, etc.) shouldn't
    // themselves be re-scaled by Dungeonize.
    dungeonizeDelta: Object.fromEntries(TRACKED_STATS.map((key) => [key, 0])),
    masterDungeonizeDelta: Object.fromEntries(TRACKED_STATS.map((key) => [key, 0])),
    additiveNonConditional: [],
    additiveConditional: [],
    // The equipped weapon's own "+X% damage" ability bonuses — kept separate from the
    // additive pool since they apply as their own independent factor (see lib/finalDamage.js).
    weaponBonusNonConditional: [],
    weaponBonusConditional: [],
    multiplicative: [],
    situational: [],
    overloadBonusPercent: 0,
  };

  await collectBaseStats(loadout, itemData, playerStats?.catacombsLevel, playerStats?.tamingLevel, playerStats?.generalsMedallionDigits, out);
  addBaseStat(out, 'strength', computeForagingStrengthBonus(playerStats?.foragingLevel), 'Foraging Level');
  addBaseStat(out, 'strength', computeSkyblockLevelStrengthBonus(playerStats?.skyblockLevel), 'Skyblock Level');
  addBaseStat(out, 'intelligence', computeAlchemyIntelligenceBonus(playerStats?.alchemyLevel), 'Alchemy Level');
  addBaseStat(out, 'intelligence', computeEnchantingIntelligenceBonus(playerStats?.enchantingLevel), 'Enchanting Level');
  addBaseStat(out, 'ability_damage', computeEnchantingAbilityDamageBonus(playerStats?.enchantingLevel), 'Enchanting Level');
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
      await collectEnchantEntries(
        enchantEntries,
        itemLabel,
        slotLabel,
        itemData.enchants,
        out,
        mobHpPercent,
        swarmMobs,
        comboKills,
        legionPlayers,
        out.firstPounceFactor,
      );
    }

    // Overload (bow-only): its flat Crit Damage/Crit Chance grant already merges into the
    // weapon's own base stats via the generic enchant-stat-bonus pipeline (itemTooltip.js) —
    // this is just the separate "Mega Crit" guaranteed-proc display, +10%/level extra damage.
    if (slot === 'weapon' && isBowEquipped(loadout)) {
      const overloadEntry = enchantEntries.find((e) => e.id.toLowerCase() === 'overload');
      if (overloadEntry) {
        out.overloadBonusPercent = OVERLOAD_DAMAGE_PERCENT_PER_LEVEL * overloadEntry.level;
      }
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

    if (equipped.item.id === 'POOCH_SWORD') {
      out.weaponBonusConditional.push({
        id: 'pooch-sword-wolf-damage',
        label: `${itemLabel} (against Wolves)`,
        source: slotLabel,
        value: POOCH_SWORD_WOLF_DAMAGE_PERCENT,
        condition: WOLF_FAMILY_MOBS.join(', '),
        conditionLabel: 'Wolves',
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

    const daggerMultipliers = DAGGER_MOB_MULTIPLIERS[equipped.item.id];
    if (daggerMultipliers) {
      const idBase = equipped.item.id.toLowerCase().replace(/_/g, '-');
      for (const { multiplier, condition } of daggerMultipliers) {
        out.multiplicative.push({
          id: `${idBase}-${condition.toLowerCase()}`,
          label: `${itemLabel} (${condition})`,
          source: slotLabel,
          value: multiplier,
          condition,
        });
      }
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

  const magmaLordPieces = countSetPieces(loadout, ARMOR_SLOTS, MAGMA_LORD_SET);
  if (magmaLordPieces > 0) {
    out.multiplicative.push({
      id: 'magma-lord-armor',
      label: `Magma Lord Armor (${magmaLordPieces} piece${magmaLordPieces > 1 ? 's' : ''})`,
      source: 'Armor',
      value: MAGMA_LORD_MULTIPLIER_PER_PIECE ** magmaLordPieces,
      condition: 'Magmatic',
    });
  }

  const thunderPieces = countSetPieces(loadout, ARMOR_SLOTS, THUNDER_SET);
  if (thunderPieces > 0) {
    out.multiplicative.push({
      id: 'thunder-armor',
      label: `Thunder Armor (${thunderPieces} piece${thunderPieces > 1 ? 's' : ''})`,
      source: 'Armor',
      value: THUNDER_MULTIPLIER_PER_PIECE ** thunderPieces,
      condition: 'Magmatic',
    });
  }

  for (const { slot, id, label } of LAVA_SEA_CREATURE_ARMOR_PIECES) {
    if (loadout[slot]?.item?.id === id) {
      out.multiplicative.push({
        id: `lava-sea-creature-${slot}`,
        label,
        source: 'Armor',
        value: LAVA_SEA_CREATURE_ARMOR_MULTIPLIER,
        condition: 'Lava Sea Creatures',
      });
    }
  }

  if (
    hasFullSet(loadout, ARMOR_SLOTS, STRONG_DRAGON_SET) &&
    STRONG_DRAGON_ASPECT_WEAPON_IDS.includes(loadout.weapon?.item?.id)
  ) {
    addBaseStat(out, 'damage', STRONG_DRAGON_DAMAGE_BONUS, 'Strong Dragon (Full Set) + Aspect Weapon');
  }

  if (countSetPieces(loadout, ARMOR_SLOTS, INFERNAL_CRIMSON_SET) >= INFERNAL_CRIMSON_MIN_PIECES) {
    out.additiveNonConditional.push({
      id: 'infernal-crimson-stacks',
      label: `Infernal Crimson (${infernalCrimsonStacks} Stacks)`,
      source: 'Armor',
      value: infernalCrimsonStacks * INFERNAL_CRIMSON_PERCENT_PER_STACK,
    });
  }

  if (isBowEquipped(loadout) && loadout.pet?.item?.petId === 'SKELETON') {
    const skeletonArrowBonus = useDungeonizedStats ? SKELETON_ARROW_BONUS_PERCENT * 2 : SKELETON_ARROW_BONUS_PERCENT;
    out.additiveNonConditional.push({
      id: 'skeleton-arrow-boost',
      label: `Skeleton${useDungeonizedStats ? ' (Dungeon Stats)' : ''}`,
      source: 'Pet',
      value: skeletonArrowBonus,
    });
  }

  for (const tier of TUXEDO_TIERS) {
    if (hasAnyEquippedId(loadout, ARMOR_SLOTS, tier.ids)) {
      out.additiveNonConditional.push({
        id: `tuxedo-${tier.name.toLowerCase()}`,
        label: `${tier.name} Tuxedo`,
        source: 'Armor',
        value: tier.damagePercent,
      });
    }
  }

  await collectPetEntries(loadout, itemData, out);

  collectAttributeEntries(attributes, loadout, out);

  // Final-multiplier "stat boost" perks: applied last, on the fully-summed combat-stat totals
  // only (never Damage) — same mechanism as Unlimited Power/Energy above. Extended to
  // Intelligence/Ability Damage/Bonus Attack Speed/Ferocity alongside Strength/Crit Chance/Crit
  // Damage, since these are all genuine "combat stat boost" perks (Renowned, Ender Dragon
  // Superior, Blaze Crimson Isle, Legion, Superior Dragon) rather than damage-specific ones.
  const finalMultiplierStats = [
    'strength',
    'crit_chance',
    'crit_damage',
    'intelligence',
    'ability_damage',
    'bonus_attack_speed',
    'ferocity',
  ];

  // Every active source's percent is computed off the SAME pre-boost snapshot and summed, not
  // chained against the running (already-boosted) total — so Renowned +1% and a hypothetical
  // +1% source add up to a flat +2% of the original total, not 1.01 * 1.01. Each source still
  // gets its own labeled entry in the (Base) Stats breakdown.
  const preBoostBaseStats = { ...out.baseStats };
  const statBoostSources = [];

  if (hasFullSet(loadout, ARMOR_SLOTS, SUPERIOR_DRAGON_SET)) {
    statBoostSources.push({ percent: SUPERIOR_DRAGON_STAT_BOOST_PERCENT, label: 'Superior Dragon (Full Set)' });
  }

  if (out.enderDragonSuperiorPercent) {
    statBoostSources.push({ percent: out.enderDragonSuperiorPercent, label: 'Ender Dragon (Superior)' });
  }

  if (blazeCrimsonIsle && loadout.pet?.item?.petId === 'BLAZE') {
    statBoostSources.push({ percent: BLAZE_CRIMSON_ISLE_PERCENT, label: 'Blaze (In Crimson Isle)' });
  }

  const renownedPieces = [...ARMOR_SLOTS, ...EQUIPMENT_SLOTS].filter(
    (slot) => loadout[slot]?.modifiers?.reforge === RENOWNED_REFORGE_NAME,
  ).length;
  if (renownedPieces) {
    statBoostSources.push({ percent: renownedPieces * RENOWNED_PERCENT_PER_PIECE, label: 'Renowned' });
  }

  if (out.legionEnchantLevel && legionPlayers) {
    statBoostSources.push({
      percent: legionPlayers * LEGION_PERCENT_PER_PLAYER_PER_LEVEL * out.legionEnchantLevel,
      label: 'Legion',
    });
  }

  for (const { percent, label } of statBoostSources) {
    for (const statKey of finalMultiplierStats) {
      addBaseStat(out, statKey, preBoostBaseStats[statKey] * (percent / 100), label);
    }
  }

  // Tarantula/Primordial Helmet's Radioactive bonus — reads the truly final Strength total
  // (after the stat-boost stage above), same as a real player's own Strength stat would.
  const radioactiveRate = RADIOACTIVE_CRIT_DAMAGE_PER_10_STRENGTH[loadout.helmet?.item?.id];
  if (radioactiveRate) {
    const cappedStrength = Math.min(out.baseStats.strength, RADIOACTIVE_MAX_STRENGTH);
    addBaseStat(out, 'crit_damage', (cappedStrength / 10) * radioactiveRate, 'Radioactive');
  }

  out.dungeonizedBaseStats = {};
  out.masterDungeonizedBaseStats = {};
  for (const statKey of TRACKED_STATS) {
    out.dungeonizedBaseStats[statKey] = out.baseStats[statKey] + out.dungeonizeDelta[statKey];
    out.masterDungeonizedBaseStats[statKey] = out.baseStats[statKey] + out.masterDungeonizeDelta[statKey];
  }

  return out;
}

import { computeBuffGrants, computeRagnarockStrength, findRagnarock } from './buffs';
import { STAT_LABELS } from './reforgeData';
import { computeItemStatTotals } from './itemStatTotals';
import { computeCatacombsBoostPercent } from './dungeonize';
import { FABLED_REFORGE_NAME, FABLED_CRIT_BONUS_MAX_PERCENT } from './reforges';
import {
  IMPLOSION_BELT_ID,
  IMPLOSION_BELT_ABILITY_MULTIPLIER,
  IMPLOSION_BELT_WEAPON_IDS,
  LOVING_REFORGE_NAME,
  LOVING_ABILITY_DAMAGE_MULTIPLIER,
} from './abilityDamage';
import { fetchEnchantLevels, extractDescriptionLines, titleCaseEnchantId, toRoman, getVenomousDamagePercent } from './enchantEffects';
import { getSpecialConfig, computeSpecialBonus, crownOfAvariceStats } from './specialWeapons';
import { formatItemName } from './mcText';
import { ARMOR_SLOTS, ARMOR_SLOT_LABELS } from './armorSlots';
import { EQUIPMENT_SLOTS, EQUIPMENT_SLOT_LABELS } from './equipmentSlots';
import {
  FINAL_DESTINATION_SET,
  FINAL_DESTINATION_ENDER_DAMAGE_PERCENT,
  VANQUISHED_SET,
  VANQUISHED_SET_MULTIPLIER,
  VANQUISHED_SET_ID,
  VANQUISHED_SET_CONDITION,
  MONSTER_HUNTER_SET,
  MONSTER_HUNTER_MULTIPLIER,
  MONSTER_RAIDER_SET,
  MONSTER_RAIDER_MULTIPLIER,
  SKELETON_MASTER_SET,
  SKELETON_MASTER_PER_PIECE_MULTIPLIER,
  SKELETON_MASTER_FULL_SET_MULTIPLIER,
  SKELETON_MASTER_FULL_SET_PIECES,
  INFERNAL_CRIMSON_SET,
  INFERNAL_CRIMSON_MIN_PIECES,
  INFERNAL_CRIMSON_PERCENT_PER_STACK,
  INFERNAL_CRIMSON_MAX_STACKS,
  STRONG_DRAGON_SET,
  STRONG_DRAGON_ASPECT_WEAPON_IDS,
  STRONG_DRAGON_DAMAGE_BONUS,
  SUPERIOR_DRAGON_SET,
  SUPERIOR_DRAGON_STAT_BOOST_PERCENT,
  TUXEDO_SLOTS,
  TUXEDO_TIERS,
  MAGMA_LORD_SET,
  MAGMA_LORD_NECKLACE_ID,
  MAGMA_LORD_PERCENT_PER_PIECE,
  THUNDER_SET,
  THUNDER_NECKLACE_ID,
  THUNDER_PERCENT_PER_PIECE,
  LAVA_SEA_CREATURE_ARMOR_PERCENT,
  LAVA_SEA_CREATURE_ARMOR_PIECES,
  REAPER_ARMOR_SLOTS,
  REAPER_ARMOR_SET,
  REAPER_ARMOR_UNDEAD_PERCENT,
  MYTHOLOGICAL_STAT_DOUBLE_IDS,
  hasFullSet,
  countSetPieces,
  MAXOR_SET,
  MAXOR_ARROW_DAMAGE_PERCENT_PER_PIECE,
} from './armorSetBonuses';
import {
  petLoreItemId,
  computeAllPetStats,
  computeOtherNums,
  computeBasePetStats,
  substitutePetLore,
  getMaxPetLevel,
  applyGoldenDragonShiningScales,
  applyLionPrimalForce,
  computeAnkylosaurusStrength,
  DRAGONS_GREED_MAX_STRENGTH_PERCENT,
  computeItemChimeraBonus,
  petItemStatContext,
  computeManticoreClawBonus,
  applyTierBoost,
} from './petData';
import { parsePetItemStatBoost, applyPetItemStatBoost } from './petItemEffects';
import { combinePlayerDefense } from './playerDefense';
import { fetchNeuItem } from './neuItems';
import {
  computeCombatLevelBonus,
  computeSkyblockLevelMultiplier,
  computeSkyblockLevelStrengthBonus,
  computeForagingStrengthBonus,
  computeAlchemyIntelligenceBonus,
  computeEnchantingIntelligenceBonus,
  computeEnchantingAbilityDamageBonus,
  computeTarantulaSlayerCritDamageBonus,
  computeBlazeSlayerStrengthBonus,
  computeCombatLevelCritChanceBonus,
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
  GOD_POTION_MIXINS,
  dungeonPotionEffects,
  godPotionMixinCritDamage,
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
import { computeBlessingEffects, computeBlessingMultiplier } from './dungeonBlessing';
import {
  MINING_ISLAND_BOOST_STATS,
  MINING_ISLANDS_LABEL,
  MITHRIL_GOLEM_PET_ID,
  lonesomeMinerPercent,
  mithrilGolemPercent,
} from './miningIslands';
import { computeFlatPerkStats, computeBanePercent, BANE_PERK } from './essencePerks';
import { masterSkullStrengthPercent } from './masterSkull';

// Elite's boss/miniboss condition, scoped to the 5 real Slayer bosses (no boss/miniboss flag exists on mobs).
const ELITE_BOSS_MOBS = ['Inferno Demonlord', 'Voidgloom Seraph', 'Revenant Horror', 'Tarantula Broodfather', 'Sven Packmaster'];

// Marker id for Fabled's randomized crit-damage bonus, pushed at 1x so the headline Final Damage
// stays the no-bonus baseline; DamageSources.jsx uses it to compute the +15% max range.
export const FABLED_REFORGE_ID = 'fabled-reforge-crit-bonus';

/* Aggregates every damage-relevant stat and bonus across the loadout into: base stats (summed),
   % additive damage split into non-conditional and conditional, a separate weaponBonus pair for the
   weapon's own "+X% damage" abilities, multiplicative sources, and a situational list for
   formula-based sources with no fixed value. Matching is pattern-based against NEU-REPO phrasings;
   anything mentioning "damage" that matches no pattern lands in situational rather than dropping. */

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

// Item lore is not scanned generically for ability text: every weapon/armor damage-%-vs-mob-type
// bonus is hardcoded at its own definition site below (DAGGER_MOB_MULTIPLIERS,
// ADDITIVE_MOB_MULTIPLIERS, WITHER_BLADE_DAMAGE_MULTIPLIER, POOCH_SWORD_WOLF_DAMAGE_PERCENT,
// SEA_CREATURE_WHIP_MULTIPLIERS, the set-bonus block). Items with damage-shaped ability text that
// isn't hardcoded (Livid Dagger, Ancient Cloak, Shadow Assassin Cloak) are left unmodeled rather
// than guessed. Pet ability text still goes through the paragraph scan below
// (matchDamageParagraph/pushParagraphMatch).

// Each Blaze Slayer dagger's two mob-type multipliers. Firedust-vs-Infernal and
// Twilight-vs-Skeletal apply 1.25x, not the 1.2x/1.1x their lore states.
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
  // Demonslayer Gauntlet (gloves rather than a dagger, same {itemId: [{multiplier, condition}]}
  // shape): "Deal 1.15x damage against Infernal Mobs". Ability-eligible, unlike the daggers above.
  DEMONLORD_GAUNTLET: [{ multiplier: 1.15, condition: 'Infernal', abilityEligible: true }],
  // End Sword, Spider Sword and Prismarine Blade: multiplicative mob-type bonuses. Prismarine Blade
  // has no mob-type restriction.
  END_SWORD: [{ multiplier: 2, condition: 'Ender' }],
  SPIDER_SWORD: [{ multiplier: 2, condition: 'Arthropod' }],
  PRISMARINE_BLADE: [{ multiplier: 3 }],
};

// Flat additive mob-type bonuses, hardcoded like the multiplicative table above. Prismarine Bow's
// condition names Squid/Guardian/Elder Guardian in full; only Squid resolves in this app's mob
// catalog today, and the others take effect automatically if they are added.
const ADDITIVE_MOB_MULTIPLIERS = {
  DEATH_BOW: [{ value: 100, condition: 'Undead' }],
  SUPER_UNDEAD_BOW: [{ value: 100, condition: 'Undead' }],
  UNDEAD_BOW: [{ value: 100, condition: 'Undead' }],
  UNDEAD_SWORD: [{ value: 100, condition: 'Undead' }],
  WITHER_BOW: [{ value: 100, condition: 'Wither' }],
  PRISMARINE_BOW: [{ value: 300, condition: 'Squid, Guardian, Elder Guardian' }],
};

// The 4 Wither Blades (Hyperion/Astraea/Valkyrie/Scylla) carry "Deals +50% damage to Wither mobs",
// which functions as a flat 1.5x multiplier rather than a +50% that sums with other weapon bonuses,
// so it goes to the multiplicative bucket.
const WITHER_BLADE_DAMAGE_MULTIPLIER = 1.5;
const WITHER_BLADE_WEAPON_IDS = new Set(['HYPERION', 'ASTRAEA', 'VALKYRIE', 'SCYLLA']);

// Necron's Blade (Unrefined) carries the same line but is not a Wither Blade, so it keeps the +50%
// weaponBonusConditional treatment — equivalent while it is the only source.
const NECRON_BLADE_WITHER_DAMAGE_PERCENT = 50;

// Pooch Sword's "+200% Damage against Wolves" applies as a flat 2x rather than the 3x its text
// implies, so it sits in the multiplicative bucket. "Wolves" covers the whole wolf family, the same
// list as mobModelIcons.json's wolf.png mapping.
const POOCH_SWORD_WOLF_DAMAGE_MULTIPLIER = 2;
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

// Warden Helmet's Brute Force, assumed fully active: +161% to the additive multiplier.
const WARDEN_HELMET_BRUTE_FORCE_PERCENT = 161;

// Flaming Flay and Soul Whip's "Deals Nx damage to Sea Creatures". "Sea Creatures" is a condition
// token conditionMatchesMob (lib/finalDamage.js) resolves against the full SEA_CREATURE_MOBS roster.
const SEA_CREATURE_WHIP_MULTIPLIERS = {
  FLAMING_FLAY: 3,
  SOUL_WHIP: 2,
};

// Each tiered Slayer weapon's bonus against its own line's mob family, applied as an independent
// (1 + bonusPercent/100) factor rather than an additive contribution. `condition` is a Mob Type
// string, or the full ATOMSPLIT_MOBS list for the Katana line.
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
  // Scorpion Foil's +250% applies as a 3.5x multiplier like its tier-mates, rather than the flat
  // additive % it used to.
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

// Base stats come from computeItemStatTotals (lib/itemStatTotals.js), the canonical per-item stat
// computation the tooltip renderer also uses, rather than being re-derived from
// gemstones/reforges/books/starring or parsed back out of rendered text. `nonDungeonStarred` is the
// normal total; dungeonStarred/masterStarred equal it unless the item's own modifiers.dungeonized is
// set, and reach display only through dungeonizedBaseStats.

// Chimera and Manticore Claw copy a cut of the active pet's stats onto the item's own lore
// (computeItemChimeraBonus/computeManticoreClawBonus in petData.js); their fractions live there.
// Skeleton pet: +0.1% additive Damage per level, reaching +75% at level 100 with a bow equipped,
// doubled while Dungeon Stats are on.
const SKELETON_ARROW_BONUS_MIN_PERCENT = 0.1;
const SKELETON_ARROW_BONUS_MAX_PERCENT = 75;
// Ankylosaurus is assumed at its max, ignoring its Unyielding and Clubbed Tail perks.
// Lion's King of the Jungle (Legendary only, assumed active): 1.5% additive Damage per pet level.
const KING_OF_THE_JUNGLE_PERCENT_PER_LEVEL = 1.5;
// Blaze pet's "In Crimson Isle" toggle: +10% final multiplier on Strength/Crit Chance/Crit
// Damage, same mechanism as Unlimited Power/Energy (see collectFinalStatBoosts below).
const BLAZE_CRIMSON_ISLE_PERCENT = 10;
// Ender Dragon's Legendary Superior perk: 0.1% per level to 10% at level 100, assumed at that max.
// Applied as a final multiplier on the summed base stats (finalMultiplierStats) rather than on the
// pet's own stat block, which would double-count.
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

// Tarantula/Primordial Helmet's Radioactive bonus: +1/+1.5 Crit Damage per 10 Strength, capped at
// 1,000 Strength, read off the fully-summed Strength total after every other source.
const RADIOACTIVE_CRIT_DAMAGE_PER_10_STRENGTH = { TARANTULA_HELMET: 1, PRIMORDIAL_HELMET: 1.5 };
const RADIOACTIVE_MAX_STRENGTH = 1000;

// Adds to a base stat's running total and records the source for DamageSources.jsx's per-stat
// breakdown, merging entries that share a label. `dungeonizedValue`/`masterDungeonizedValue` default
// to `value`, which is correct for every non-gear source; only the per-item gear loop and the
// Chimera/Manticore pass supply real dungeonized amounts.
function addBaseStat(out, statKey, value, label, dungeonizedValue = value, masterDungeonizedValue = dungeonizedValue) {
  if (!value) return;
  out.baseStats[statKey] += value;
  const list = out.baseStatSources[statKey];
  const existing = list.find((e) => e.label === label);
  if (existing) {
    existing.value += value;
    existing.dungeonizedValue += dungeonizedValue;
    existing.masterDungeonizedValue += masterDungeonizedValue;
  } else {
    list.push({ label, value, dungeonizedValue, masterDungeonizedValue });
  }
}

// A stat's running total in all three toggle states, plus the same three with Challenger's/Mythos'
// Mythological doubling folded in (MYTHOLOGICAL_STAT_DOUBLE_IDS). Every delta is populated by the
// time a final-stage source runs, since collectBaseStats writes them all and runs first.
function currentStatTotals(out, statKey) {
  const dungeonized = out.baseStats[statKey] + out.dungeonizeDelta[statKey];
  const master = out.baseStats[statKey] + out.masterDungeonizeDelta[statKey];
  return {
    normal: out.baseStats[statKey],
    dungeonized,
    master,
    mythological: out.baseStats[statKey] + out.mythologicalDelta[statKey],
    mythologicalDungeonized: dungeonized + out.mythologicalDungeonizeDelta[statKey],
    mythologicalMaster: master + out.mythologicalMasterDungeonizeDelta[statKey],
  };
}

// Records a final-stage stat addition across every toggle state: writes the labeled breakdown entry
// and bumps the dungeonize/master/mythological deltas, so the addition survives each toggle instead
// of showing in the breakdown but vanishing from the total. `mythological*` values default to the
// plain ones for callers with no Mythological-aware amount.
function addFinalStatValue(
  out,
  statKey,
  value,
  dungeonizedValue,
  masterDungeonizedValue,
  label,
  mythologicalValue = value,
  mythologicalDungeonizedValue = dungeonizedValue,
  mythologicalMasterValue = masterDungeonizedValue,
) {
  addBaseStat(out, statKey, value, label, dungeonizedValue, masterDungeonizedValue);
  out.dungeonizeDelta[statKey] += dungeonizedValue - value;
  out.masterDungeonizeDelta[statKey] += masterDungeonizedValue - value;
  // Only the increment from the larger Mythological-doubled base belongs here: the addBaseStat call
  // above already feeds baseStats, which mythologicalBaseStats includes.
  out.mythologicalDelta[statKey] += mythologicalValue - value;
  out.mythologicalDungeonizeDelta[statKey] += mythologicalDungeonizedValue - dungeonizedValue;
  out.mythologicalMasterDungeonizeDelta[statKey] += mythologicalMasterValue - masterDungeonizedValue;
}

// `percent`% of `base` (a currentStatTotals()-shaped object), covering every final-stage stat boost:
// Unlimited Power/Energy/Torment, Superior Dragon, Ender Dragon Superior, Renowned, Legion and Blaze
// Crimson Isle. Each multiplies the player's CURRENT total, which under Dungeon/Master is the
// boosted one, and likewise against the Mythological-doubled total when one is in play.
function addPercentStatBoost(out, statKey, percent, label, base) {
  if (!percent) return;
  addFinalStatValue(
    out,
    statKey,
    base.normal * (percent / 100),
    base.dungeonized * (percent / 100),
    base.master * (percent / 100),
    label,
    base.mythological * (percent / 100),
    base.mythologicalDungeonized * (percent / 100),
    base.mythologicalMaster * (percent / 100),
  );
}

// Challenger's/Mythos "Mythos' Might" doubling (MYTHOLOGICAL_STAT_DOUBLE_IDS). Computed once per
// item here, folded into a parallel mythologicalBaseStats total, and selected by finalDamage.js's
// selectBaseStats only when the mob has that type — so the doubling never reaches the toggle-only
// baseStats the Base Stats display and Compare page read. itemTooltip.js consumes the same id set
// separately, to show the doubled number on the item's tooltip.

// Tabasco's flat weapon-Damage bonus is gated on having no Dragon pet equipped: Rose, Golden or
// Ender Dragon.
const TABASCO_DRAGON_PET_IDS = new Set(['ROSE_DRAGON', 'GOLDEN_DRAGON', 'ENDER_DRAGON']);

// Blazetekk™ Ham Radio + Bluetooth/Bluertooth Ring: the flat Damage bonus is applied in the main
// collectDamageSources body, being a player-level bonus rather than a per-slot one.
const BLAZETEKK_HAM_RADIO_BLUETOOTH_DAMAGE = 3;
const BLAZETEKK_HAM_RADIO_BLUERTOOTH_DAMAGE = 4;

// The ONLY definition of what Chimera/Manticore Claw copy is petData.js's computeBasePetStats,
// which this delegates to rather than re-deriving. Do not reimplement the "curve + Shining Scales
// + Primal Force" logic here; changing the scope of "base stats" means changing
// computeBasePetStats, and this call picks it up.
async function collectBaseStats(loadout, itemData, catacombsLevel, tamingLevel, wolfSlayerLevel, generalsMedallionDigits, out, maxedCollectionsCount, essencePerks) {
  let basePetStats = { STRENGTH: 0, CRIT_CHANCE: 0, CRIT_DAMAGE: 0, BONUS_ATTACK_SPEED: 0 };
  out.enderDragonSuperiorPercent = 0;
  out.firstPounceFactor = 1;
  if (loadout.pet) {
    const { item: pet, modifiers } = loadout.pet;
    const maxLevel = getMaxPetLevel(pet.petId);
    const levels = itemData.pets?.[pet.petId]?.[pet.tier];
    const otherNums = computeOtherNums(levels, modifiers.level, maxLevel);
    let stats = computeAllPetStats(levels, modifiers.level, maxLevel);
    stats = applyGoldenDragonShiningScales(pet.petId, stats, modifiers.goldCollection);
    // computeBasePetStats does its own pet-item lookup and Primal Force application (petData.js)
    // rather than deriving from this file's `stats`, which keeps building the player's full Pet
    // total for the rest of this function. Primal Force stays after the pet item's boost, so a
    // %-based boost never multiplies its flat add.
    basePetStats = computeBasePetStats(loadout, itemData, essencePerks);
    const statsBeforePetItem = stats;
    const petItemId = modifiers.petItem;
    const petItem = petItemId ? (itemData.petItems || []).find((i) => i.id === petItemId) : null;
    let boost = petItem ? parsePetItemStatBoost(petItem.lore) : null;
    // T-Rex's Tyrant scales the pet item's Combat-stat boost by (1 + pet level%/100), applied before
    // the boost is folded in. Only %-based boosts scale; a flat grant has no `.percent`.
    const isTyrant = !!(boost && boost.type !== 'flat' && pet.petId === 'TYRANNOSAURUS');
    if (isTyrant) {
      const tyrantFactor = 1 + (modifiers.level || 0) / 100;
      boost = { ...boost, percent: boost.percent * tyrantFactor };
    }
    stats = applyPetItemStatBoost(stats, boost);
    // Its own breakdown line rather than folded into "Pet", so the Tyrant scaling stays visible.
    let petItemDeltas = null;
    if (boost) {
      petItemDeltas = {};
      for (const key of ['STRENGTH', 'CRIT_CHANCE', 'CRIT_DAMAGE', 'BONUS_ATTACK_SPEED']) {
        petItemDeltas[key] = (stats[key] || 0) - (statsBeforePetItem[key] || 0);
      }
    }
    // Ender Dragon's Superior perk, stashed for collectFinalStatBoosts to apply as a final
    // multiplier on the summed base stats rather than on the pet's own block.
    if (pet.petId === 'ENDER_DRAGON' && pet.tier === 'LEGENDARY') {
      out.enderDragonSuperiorPercent = ENDER_DRAGON_SUPERIOR_PERCENT;
    }

    // Ankylosaurus's Armored Tank is NOT applied here: it converts the player's Defense into
    // Strength, and Defense isn't known until the gear loop below has run. It's added in
    // collectDamageSources instead, as its own base-stat line — see computeAnkylosaurusStrength.
    out.petOtherNums = otherNums;

    // Lion's First Pounce: multiplies First Strike/Triple Strike's bonus — Rare 1.8x, Epic/Legendary 2x.
    if (pet.petId === 'LION') {
      if (pet.tier === 'RARE') out.firstPounceFactor = 1.8;
      else if (pet.tier === 'EPIC' || pet.tier === 'LEGENDARY') out.firstPounceFactor = 2;
    }

    // Lion's Primal Force: flat Strength (already in basePetStats above) plus a Damage add, which
    // isn't a pet stat and so is only applied here, scaled via otherNums[0].
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

    // Wither Skeleton's Wither Blood: +level% additive damage against Wither mobs, 1:1 with pet
    // level. Ability-eligible, so it counts toward Mage Mode's Ability Damage.
    if (pet.petId === 'WITHER_SKELETON') {
      const witherBlood = modifiers.level || 0;
      if (witherBlood) {
        out.additiveConditional.push({
          id: 'wither-skeleton-wither-blood',
          label: 'Wither Skeleton (Wither Blood)',
          source: 'Pet',
          value: witherBlood,
          condition: 'Wither',
          abilityEligible: true,
        });
      }
    }

    // `stats` already includes every species perk above plus the pet item's boost, so only the
    // isolated pet-item delta is subtracted; the pre-perk snapshot would drop those flat additions.
    addBaseStat(out, 'strength', (stats.STRENGTH || 0) - (petItemDeltas?.STRENGTH || 0), 'Pet');
    addBaseStat(out, 'crit_chance', (stats.CRIT_CHANCE || 0) - (petItemDeltas?.CRIT_CHANCE || 0), 'Pet');
    addBaseStat(out, 'crit_damage', (stats.CRIT_DAMAGE || 0) - (petItemDeltas?.CRIT_DAMAGE || 0), 'Pet');
    addBaseStat(out, 'bonus_attack_speed', (stats.BONUS_ATTACK_SPEED || 0) - (petItemDeltas?.BONUS_ATTACK_SPEED || 0), 'Pet');
    if (petItemDeltas) {
      const petItemLabel = isTyrant ? `Pet Item (${petItem.name}, Tyrant)` : `Pet Item (${petItem.name})`;
      if (petItemDeltas.STRENGTH) addBaseStat(out, 'strength', petItemDeltas.STRENGTH, petItemLabel);
      if (petItemDeltas.CRIT_CHANCE) addBaseStat(out, 'crit_chance', petItemDeltas.CRIT_CHANCE, petItemLabel);
      if (petItemDeltas.CRIT_DAMAGE) addBaseStat(out, 'crit_damage', petItemDeltas.CRIT_DAMAGE, petItemLabel);
      if (petItemDeltas.BONUS_ATTACK_SPEED) addBaseStat(out, 'bonus_attack_speed', petItemDeltas.BONUS_ATTACK_SPEED, petItemLabel);
    }
  }

  // The equipped pet's effects on gear stats (lib/petData.js): a Legendary Blaze doubles Hot/Fuming
  // Potato Books, and a Rare+ Blaze's Bling Armor scales Blaze/Frozen Blaze Armor's raw base stats.
  // Every computeItemStatTotals call below gets both — the Chimera/Manticore ones included, since
  // their totals are diffed against the base totals and a missing input would show up as a delta.
  const { potatoBookDoubled, blingArmorPercent } = petItemStatContext(loadout.pet, itemData);

  // The armor half of the player's Defense (lib/playerDefense.js) — never displayed, and read by
  // exactly one thing: Ankylosaurus's Armored Tank. Summed off the totals this loop already
  // computes rather than by a second pass over the four pieces, which every Optimizer candidate
  // would have paid for.
  out.armorDefense = 0;

  for (const slot of GEAR_SLOTS) {
    const equipped = loadout[slot];
    if (!equipped) continue;
    const slotLabel = SLOT_LABELS[slot];
    const totals = await computeItemStatTotals(equipped.item, equipped.modifiers, itemData, {
      catacombsLevel,
      tamingLevel,
      wolfSlayerLevel,
      generalsMedallionDigits,
      potatoBookDoubled,
      blingArmorPercent,
      maxedCollectionsCount,
      essencePerks,
    });
    // Armor only: equipment and accessories carry Defense too.
    if (ARMOR_SLOTS.includes(slot)) out.armorDefense += totals.defense?.nonDungeonStarred || 0;
    for (const statKey of TRACKED_STATS) {
      const t = totals[statKey];
      // dungeonStarred/masterStarred fall back to nonDungeonStarred itself when the item isn't
      // dungeonized, so the toggle never leaves a stat missing — see lib/itemStatTotals.js.
      addBaseStat(out, statKey, t.nonDungeonStarred, slotLabel, t.dungeonStarred, t.masterStarred);
      out.dungeonizeDelta[statKey] += t.dungeonStarred - t.nonDungeonStarred;
      out.masterDungeonizeDelta[statKey] += t.masterStarred - t.nonDungeonStarred;
      if (MYTHOLOGICAL_STAT_DOUBLE_IDS.has(equipped.item.id)) {
        out.mythologicalDelta[statKey] += t.nonDungeonStarred;
        out.mythologicalDungeonizeDelta[statKey] += t.dungeonStarred;
        out.mythologicalMasterDungeonizeDelta[statKey] += t.masterStarred;
      }
    }
    // Mage Mode's fixed "Base Ability Damage" constant (lib/abilityDamage.js's ABILITY_DAMAGE_TABLE,
    // e.g. Hyperion's 10000) is not a lore stat line, so Dungeonize's annotation path never scales
    // it. It scales by the GENERAL Catacombs Stats Boost (lib/dungeonize.js's
    // computeCatacombsBoostPercent), unlike the "Ability Damage" STAT, which uses the curve-less
    // formula — see CLAUDE.md. Stashed here for the weapon slot so computeAbilityDamage applies
    // `table.base * (1 + boost/100)`. Gated on the page's Dungeon toggle rather than the weapon's own
    // dungeonized flag, so Catacombs Level and General's Medallion still apply to a weapon that was
    // never Dungeonized; stars and Master Stars still come from the weapon's own modifiers.
    if (slot === 'weapon') {
      out.abilityBaseDamageBoost = computeCatacombsBoostPercent(
        catacombsLevel,
        equipped.modifiers.dungeonizeOldCurve,
        equipped.modifiers.stars,
        generalsMedallionDigits,
        equipped.modifiers.masterStars,
      );
    }
    // Emerald Blade's bonus lives on its own "Current Damage Bonus:" line, not a "Damage:" stat line.
    if (equipped.item.id === 'EMERALD_BLADE') {
      const config = getSpecialConfig(equipped.item.id);
      addBaseStat(out, 'damage', computeSpecialBonus(config, equipped.modifiers.special), slotLabel);
    }

    // Tabasco: flat weapon Damage equal to its level (II grants +2, III grants +3; there is no level
    // I and III is the max) unless the equipped pet is a Rose, Golden or Ender Dragon.
    const tabasco = (equipped.modifiers.hexEnchantments || []).find((e) => e.id.toLowerCase() === 'tabasco');
    if (tabasco && !TABASCO_DRAGON_PET_IDS.has(loadout.pet?.item?.petId)) {
      addBaseStat(out, 'damage', tabasco.level, `${slotLabel} (Tabasco)`);
    }

    // Chimera (ultimate enchant, any slot) and Manticore Claw (gloves) each copy a cut of the active
    // pet's stats onto this item's lore, computed by a second computeItemStatTotals call and diffed
    // against `totals`, so the delta carries this item's own Catacombs Stats Boost. Each gets its own
    // call, so an item carrying both attributes each to its own breakdown line.
    const chimeraBonus = computeItemChimeraBonus(equipped, basePetStats);
    if (chimeraBonus) {
      const chimeraTotals = await computeItemStatTotals(equipped.item, equipped.modifiers, itemData, {
        catacombsLevel,
        tamingLevel,
        wolfSlayerLevel,
        chimeraBonus,
        essencePerks,
        generalsMedallionDigits,
        potatoBookDoubled,
        blingArmorPercent,
        maxedCollectionsCount,
      });
      const chimeraLabel = `${slotLabel} (Chimera)`;
      for (const statKey of TRACKED_STATS) {
        const t = totals[statKey];
        const ct = chimeraTotals[statKey];
        const delta = ct.nonDungeonStarred - t.nonDungeonStarred;
        if (!delta) continue;
        const dungeonizedDelta = ct.dungeonStarred - t.dungeonStarred;
        const masterDungeonizedDelta = ct.masterStarred - t.masterStarred;
        addBaseStat(out, statKey, delta, chimeraLabel, dungeonizedDelta, masterDungeonizedDelta);
        out.dungeonizeDelta[statKey] += dungeonizedDelta - delta;
        out.masterDungeonizeDelta[statKey] += masterDungeonizedDelta - delta;
      }
    }

    const manticoreBonus = computeManticoreClawBonus(equipped, basePetStats);
    if (manticoreBonus) {
      const manticoreTotals = await computeItemStatTotals(equipped.item, equipped.modifiers, itemData, {
        catacombsLevel,
        tamingLevel,
        wolfSlayerLevel,
        generalsMedallionDigits,
        manticoreClawBonus: manticoreBonus,
        potatoBookDoubled,
        blingArmorPercent,
        maxedCollectionsCount,
      });
      const manticoreLabel = `${slotLabel} (Manticore Claw)`;
      for (const statKey of TRACKED_STATS) {
        const t = totals[statKey];
        const mt = manticoreTotals[statKey];
        const delta = mt.nonDungeonStarred - t.nonDungeonStarred;
        if (!delta) continue;
        const dungeonizedDelta = mt.dungeonStarred - t.dungeonStarred;
        const masterDungeonizedDelta = mt.masterStarred - t.masterStarred;
        addBaseStat(out, statKey, delta, manticoreLabel, dungeonizedDelta, masterDungeonizedDelta);
        out.dungeonizeDelta[statKey] += dungeonizedDelta - delta;
        out.masterDungeonizeDelta[statKey] += masterDungeonizedDelta - delta;
      }
    }
  }

  if (loadout.accessory?.item) {
    const { item, modifiers } = loadout.accessory;
    // Includes each Stone Power's flat Unique Power Bonus (Bizarre's +5 Ability Damage, Hurtful's
    // +15 Bonus Attack Speed) alongside its MP-scaled base stats and Tuning — see
    // lib/accessoryPowers.js's computeAccessoryTotalStats. Only the stats this file tracks are
    // forwarded; Powers can also grant health/defense/speed/true_defense.
    const accessoryStats = computeAccessoryTotalStats(item.id, modifiers.magicalPower, modifiers.tuning);
    for (const statKey of ['strength', 'crit_chance', 'crit_damage', 'intelligence', 'ability_damage', 'bonus_attack_speed', 'ferocity']) {
      addBaseStat(out, statKey, accessoryStats[statKey] || 0, 'Accessory');
    }
  }

  // Each owned accessory's own stat line (Shark Tooth Necklace's Strength, Red Claw's Crit Damage),
  // computed by the worker from Accessory Bag lore at import and applied unconditionally, like raw
  // Magical Power: no Accessory Power has to be selected for them to count.
  if (loadout.accessory?.modifiers?.individualAccessoryStats) {
    for (const [statKey, value] of Object.entries(loadout.accessory.modifiers.individualAccessoryStats)) {
      if (value) addBaseStat(out, statKey, value, 'Accessories');
    }
  }

  // Enrichments: a manually tracked count of bag items enriched for one stat, since the stat can be
  // re-rolled per item (BuildContext's setAccessoryEnrichmentCount/setAccessoryEnrichmentType).
  // Applies without an Accessory Power selected. Rates: +1 Strength/Crit Damage/Crit Chance, +2
  // Intelligence, +0.5 Bonus Attack Speed. 'none' and untracked stats contribute nothing.
  const enrichmentCount = loadout.accessory?.modifiers?.enrichmentCount || 0;
  const enrichmentType = loadout.accessory?.modifiers?.enrichmentType;
  const ENRICHMENT_RATE_PER_STAT = { strength: 1, crit_damage: 1, crit_chance: 1, intelligence: 2, bonus_attack_speed: 0.5 };
  if (enrichmentCount > 0 && ENRICHMENT_RATE_PER_STAT[enrichmentType]) {
    addBaseStat(out, enrichmentType, enrichmentCount * ENRICHMENT_RATE_PER_STAT[enrichmentType], 'Enrichments');
  }
}

// ---------------------------------------------------------------------
// Enchants: parses each applied enchant's per-level lore for a %-damage bonus, conditional
// (Smite-style) or not. Giant Killer and Titan Killer's per-target-stat rate uses their capped
// value; other rate-shaped enchants (Execute/Prosecute) have no fixed value and go to situational.
// "dealt" is optional and "bow " an allowed prefix, since Power V reads "Increases bow damage by 40%".
const PERCENT_TO_TARGET_RE = /Increases\s+(?:melee\s+|ranged\s+|bow\s+)?damage(?:\s+dealt)?(?:\s+to\s+(.+?))?\s+by\s+\+?([\d.]+)%/i;
// Two phrasings for "rate scales with a target's stat": "for each percent of <stat>"
// (Execute/Prosecute/Giant Killer) and "for every 100 <stat>" (Titan Killer), matched by
// alternation. Without the second, Titan Killer falls through to PERCENT_TO_TARGET_RE and parses as
// a flat, uncapped rate.
const PER_TARGET_STAT_RE =
  /Increases\s+damage\s+dealt\s+by\s+\+?([\d.]+)%\s+for\s+(?:each\s+(?:percent|%)\s+of|every\s+\d+)\s+(.+?)(?:,?\s+up\s+to\s+\+?([\d.]+)%)?\.?\s*$/i;

// One For All: fixed +500% weapon damage, hardcoded since its lore phrasing doesn't match the generic regexes.
const ONE_FOR_ALL_DAMAGE_PERCENT = 500;

// Overload's real per-level lore: "...dealing 10%/20%/30%/40%/50% extra damage" at levels I-V.
const OVERLOAD_DAMAGE_PERCENT_PER_LEVEL = 10;

// First Strike/Triple Strike only apply on the first hit(s) of a fight — modeled as active only at 100% mob HP.
const FIRST_HIT_ENCHANT_IDS = new Set(['first_strike', 'triple_strike']);

// Fire Aspect and Thunderlord's per-level lore ("dealing 9% of your damage per second." / "dealing
// 60% of the hit's damage."), parsed separately from PERCENT_TO_TARGET_RE's phrasing.
const ENCHANT_PROC_PERCENT_RE = {
  fire_aspect: /dealing\s+([\d.]+)%\s+of\s+your\s+damage/i,
  thunderlord: /dealing\s+([\d.]+)%\s+of\s+the\s+hit'?s\s+damage/i,
};

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

    // Venomous/Fire Aspect/Thunderlord: procs whose damage is a % of a separately computed number
    // (lib/finalDamage.js's computeVenomousProcDamage/computeEnchantProcDamage), stashed on `out`
    // rather than pushed into a bucket here.
    if (key === 'venomous') {
      const percent = getVenomousDamagePercent(entry.level);
      if (percent != null) out.venomousProc = { id, label: name, source, level: entry.level, percent };
      continue;
    }
    if (key === 'fire_aspect' || key === 'thunderlord') {
      const m = ENCHANT_PROC_PERCENT_RE[key].exec(text);
      if (m) {
        const proc = { id, label: name, source, level: entry.level, percent: parseFloat(m[1]) };
        if (key === 'fire_aspect') out.fireAspectProc = proc;
        else out.thunderlordProc = proc;
      }
      continue;
    }

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
        // Stashed unconditionally, not only when value > 0, so simulateHitByHit can recompute it at
        // each hit's own mob HP% rather than the static slider value this was baked at.
        out.executeProsecuteRate = { id, label: name, source, type: key, ratePerLevel };
        if (value > 0) {
          out.additiveNonConditional.push({ id, label: `${name} (at ${mobHpPercent}% HP)`, source, value, abilityEligible: true });
        }
      } else if (key === 'giant_killer' && cap != null) {
        out.additiveNonConditional.push({ id, label: name, source, value: cap, abilityEligible: true });
      } else {
        // Titan Killer lands here rather than in the giant_killer branch: its value depends on the
        // target's defense, which no mob in this app models, so assuming its cap would invent a
        // number. It contributes nothing until per-mob defense values exist.
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
        // Mage Mode counts only the 7 type-bane enchants toward Ability Damage; mobTypes being set
        // means entry.id is one of them, from the same ENCHANT_ID_MOB_TYPES map.
        out.additiveConditional.push({ id, label: name, source, value, condition, abilityEligible: !!mobTypes });
      } else if (FIRST_HIT_ENCHANT_IDS.has(entry.id.toLowerCase())) {
        // Counted only at 100% mob HP; Lion's First Pounce scales it (see collectBaseStats).
        // firstHitOnly excludes these from DPS's steady-state hit (computeDpsBreakdown): First Strike
        // fires on the opening hit and Triple Strike on the first three.
        if (mobHpPercent === 100) {
          const boosted = value * firstPounceFactor;
          const label = firstPounceFactor > 1 ? `${name} (first hit, 100% HP, Lion First Pounce)` : `${name} (first hit, 100% HP)`;
          out.additiveNonConditional.push({ id, label, source, value: boosted, firstHitOnly: true });
        }
      } else {
        out.additiveNonConditional.push({ id, label: name, source, value });
      }
      continue;
    }

    // No catch-all: an enchant whose lore merely contains "damage" (Feather Falling reduces fall
    // damage) is not a damage source, so one this function can't reduce to a number contributes
    // nothing.
  }
}

// ---------------------------------------------------------------------
// Pet ability text (Zombie's Rotten Blade, Ender Dragon's End Strike — see ABILITY_ELIGIBLE_PET_IDS
// below): two damage-bonus phrasings, object-last ("deals +X% damage to Y") and subject-first
// ("Y mobs take Nx damage"). "Y mobs DEAL Nx damage" is an incoming-damage penalty and is excluded.
const INCOMING_DAMAGE_RE = /[^.]+?\s+mobs?\s+deals?\s+\+?[\d.]+x\s+damage/i;
// "Every Nth strike/hit, deal +X% damage" (Tarantula/Primordial armor's Octodexterity) is a periodic
// proc rather than a per-hit bonus, and the generic match below cannot tell the two apart — every
// piece repeats the paragraph, so it would count four times. Excluded entirely, like INCOMING_DAMAGE_RE.
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

  // No situational catch-all, as in collectEnchantEntries: a pet paragraph that mentions damage
  // without a parseable number (the Ender Dragon buffing Aspect of the Dragons) is not a source.
  return null;
}

// `abilityEligible` tags the entry so Mage Mode's Ability Damage multiplier (computeAbilityDamage)
// counts it. Set only by callers that know the paragraph is one of the verified ability-eligible
// sources (see collectPetEntries). Pet-only.
function pushParagraphMatch(out, text, label, source, id, abilityEligible) {
  const match = matchDamageParagraph(text);
  if (!match) return;
  if (match.bucket === 'multiplicative') {
    out.multiplicative.push({ id, label, source, value: match.value, condition: match.condition });
  } else if (match.bucket === 'additiveConditional') {
    out.additiveConditional.push({ id, label, source, value: match.value, condition: match.condition, abilityEligible });
  } else {
    out.additiveNonConditional.push({ id, label, source, value: match.value, abilityEligible });
  }
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

// Pets whose ability text is a per-hit damage bonus in the "deals +X% damage to Y mobs" shape Mage
// Mode's ability formula counts: Ender Dragon's End Strike (+X% vs Ender) and Zombie's Rotten Blade
// (+X% vs Undead). Wither Skeleton's Wither Blood is hardcoded in collectBaseStats instead. An
// explicit allowlist, since every other pet's ability text either isn't a damage bonus or isn't in
// this shape (Golden Dragon's Legendary Treasure is handled separately below).
const ABILITY_ELIGIBLE_PET_IDS = new Set(['ENDER_DRAGON', 'ZOMBIE']);

// collectPetEntries' output depends only on (petId, tier, name, level, bankCoins); every other input
// is stable for the session. The optimizer evaluates hundreds of candidates that share one pet, and
// the NEU lore substitution plus paragraph scan measured ~35% of collectDamageSources' per-call
// time, so the result is memoized by that key and replayed into `out` on a hit.
const petEntriesCache = new Map();

async function collectPetEntries(loadout, itemData, out) {
  if (!loadout.pet) return;
  const { item: pet, modifiers } = loadout.pet;
  const cacheKey = `${pet.petId}:${pet.tier}:${pet.name}:${modifiers.level}:${modifiers.bankCoins || 0}`;
  let cached = petEntriesCache.get(cacheKey);
  if (!cached) {
    cached = (async () => {
      const localOut = { additiveNonConditional: [], additiveConditional: [], multiplicative: [], situational: [] };
      await collectPetEntriesInto(pet, modifiers, itemData, localOut);
      return localOut;
    })();
    petEntriesCache.set(cacheKey, cached);
  }
  const entries = await cached;
  out.additiveNonConditional.push(...entries.additiveNonConditional);
  out.additiveConditional.push(...entries.additiveConditional);
  out.multiplicative.push(...entries.multiplicative);
  out.situational.push(...entries.situational);
}

async function collectPetEntriesInto(pet, modifiers, itemData, out) {
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
      ABILITY_ELIGIBLE_PET_IDS.has(pet.petId),
    );
  });
}

// ---------------------------------------------------------------------
// Account-wide Attributes (lib/attributes.js), read from BuildContext state rather than the
// loadout. The Echo chain is computed once and applied to every Ruler/Strength-Elemental
// attribute's value before it's pushed/summed.
function collectAttributeEntries(attributes, loadout, out, useDungeonizedStats, blessing, essencePerks, buffGrants = []) {
  if (!attributes) return;

  const echoOfRulerBoost = computeEchoBoost(ECHO_OF_RULER_RATE, attributes.echo_of_ruler, attributes.echo_of_echoes);
  const echoOfElementalBoost = computeEchoBoost(ECHO_OF_ELEMENTAL_RATE, attributes.echo_of_elemental, attributes.echo_of_echoes);

  for (const { id, name, mobType } of RULER_ATTRIBUTES) {
    const level = attributes[id] || 0;
    if (!level) continue;
    const base = RULER_RATE * level;
    const value = base * (1 + echoOfRulerBoost / 100);
    out.additiveConditional.push({ id: `attr-${id}`, label: name, source: 'Attribute', value, condition: mobType, abilityEligible: true });
  }

  // Folded into one "Attributes" base-stat line. Echo of Elemental boosts the whole Elemental
  // family, both the Strength- and Intelligence-granting attributes.
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
    out.additiveNonConditional.push({
      id: 'attr-dominance',
      label: 'Dominance',
      source: 'Attribute',
      value: DOMINANCE_RATE * dominanceLevel,
      abilityEligible: true,
    });
  }

  // Attack Speed shard ("Inferno Demonlord") — always-active, feeds Bonus Attack Speed directly
  // rather than a % damage source, same treatment as the Elemental families above.
  const attackSpeedLevel = attributes.attack_speed || 0;
  if (attackSpeedLevel) {
    addBaseStat(out, 'bonus_attack_speed', ATTACK_SPEED_SHARD_RATE * attackSpeedLevel, 'Attributes');
  }

  // Essence-shop perks (lib/essencePerks.js) are permanent account-wide stats, so they land before
  // the run-scoped blessings and before Unlimited Power's final multiplier. The Catacombs (Undead
  // essence) ones are gated on the Dungeon toggle inside computeFlatPerkStats.
  for (const entry of computeFlatPerkStats(essencePerks, useDungeonizedStats)) {
    addBaseStat(out, entry.stat, entry.value, entry.label);
  }
  const banePercent = computeBanePercent(essencePerks);
  if (banePercent > 0) {
    out.additiveConditional.push({
      id: 'essence-perk-bane',
      label: `${BANE_PERK.name} (${banePercent}% vs Arachnids)`,
      source: 'Essence Shop',
      value: banePercent,
      condition: BANE_PERK.condition,
      abilityEligible: true,
    });
  }

  // Item buffs — Ragnarock, Sword of Bad Health, Weirder Tuba (lib/buffs.js). Flat grants in every
  // mode, placed with the other flat grants: before the Dungeon Blessings' percentages, Master Skull
  // and Unlimited Power below, so those scale a buff's Strength like any other flat Strength.
  for (const grant of buffGrants) addBaseStat(out, grant.stat, grant.value, grant.label);

  // Dungeon Blessings (lib/dungeonBlessing.js) are Catacombs-run buffs, so they apply only while the
  // Dungeon toggle is on. Every flat grant lands before any percentage, so a blessing's own %
  // compounds on its flat grant and on the other blessings'. Placed ahead of Unlimited Power, which
  // stays the last multiplier.
  if (useDungeonizedStats) {
    const blessingEffects = computeBlessingEffects(blessing?.levels, computeBlessingMultiplier(blessing, attributes));
    for (const effect of blessingEffects) {
      for (const [statKey, amount] of Object.entries(effect.flat)) addBaseStat(out, statKey, amount, effect.label);
    }
    for (const effect of blessingEffects) {
      for (const [statKey, percent] of Object.entries(effect.percent)) {
        addPercentStatBoost(out, statKey, percent, effect.label, currentStatTotals(out, statKey));
      }
    }

    // Master Skull's Strength multiplier, applied straight after the blessings and off the running
    // total so the two compound rather than summing: tier 7 with a Power 5 blessing is 1.10 * 1.15,
    // not 1 + 0.10 + 0.15. Scoped to the Dungeon toggle alongside the blessings it multiplies with.
    const skullPercent = masterSkullStrengthPercent(blessing?.masterSkullTier);
    if (skullPercent > 0) {
      addPercentStatBoost(out, 'strength', skullPercent, `Master Skull Tier ${blessing.masterSkullTier}`, currentStatTotals(out, 'strength'));
    }
  }

  // Unlimited Power/Energy/Torrent apply last, as true multipliers on the fully-summed
  // Strength/Crit Damage/Intelligence, baked into baseStats rather than left to finalDamage.js.
  // Almighty boosts all three, and Echo of Echoes boosts Almighty, the same chained mechanism as
  // Echo of Ruler and Echo of Elemental above.
  const almightyBoost = computeEchoBoost(ALMIGHTY_RATE, attributes.almighty, attributes.echo_of_echoes);
  const unlimitedPowerPercent = UNLIMITED_POWER_RATE * (attributes.unlimited_power || 0) * (1 + almightyBoost / 100);
  const unlimitedEnergyPercent = UNLIMITED_ENERGY_RATE * (attributes.unlimited_energy || 0) * (1 + almightyBoost / 100);
  const maximalTormentPercent = MAXIMAL_TORMENT_RATE * (attributes.maximal_torment || 0) * (1 + almightyBoost / 100);
  addPercentStatBoost(out, 'strength', unlimitedPowerPercent, 'Unlimited Power', currentStatTotals(out, 'strength'));
  addPercentStatBoost(out, 'crit_damage', unlimitedEnergyPercent, 'Unlimited Energy', currentStatTotals(out, 'crit_damage'));
  addPercentStatBoost(out, 'intelligence', maximalTormentPercent, 'Unlimited Torment', currentStatTotals(out, 'intelligence'));

  // Terminator divides Crit Chance by 4: a x0.25 multiplier on the fully-summed Crit Chance, applied
  // at the same final stage as Unlimited Power, so it runs after every other Crit Chance source.
  if (loadout.weapon?.item?.id === 'TERMINATOR') {
    addPercentStatBoost(out, 'crit_chance', -75, 'Terminator (Divides Crit Chance by 4)', currentStatTotals(out, 'crit_chance'));
  }
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
  infernalCrimsonStacks = INFERNAL_CRIMSON_MAX_STACKS,
  useDungeonizedStats = false,
  swarmMobs = 1,
  comboKills = 1,
  legionPlayers = 0,
  blazeCrimsonIsle = false,
  bestiaryMaxedMobs = null,
  godPotionMixin = 'none',
  maxedCollectionsCount = 0,
  // One trailing object rather than four more positional slots on an already-long list —
  // { levels: {power,time,stone,wisdom}, forbiddenBlessingLevel, masterSkullTier, paulBuff }.
  // See lib/dungeonBlessing.js; only read while useDungeonizedStats is on.
  blessing = null,
  // The account's Essence-shop perk levels, {perkKey: level} — see lib/essencePerks.js. Imported
  // only, never typed; null for a manually-built loadout.
  essencePerks = null,
  // Whether the selected target lives on a Mining Island (lib/miningIslands.js). Derived from the
  // target mob at the call site and passed in, exactly as blazeCrimsonIsle above is — this
  // function never receives the mob itself.
  onMiningIsland = false,
  // Account-wide pet OWNERSHIP, not the equipped pet — a Jellyfish in the pet menu upgrades the
  // Dungeon Potion from Tier VII to Jellyfish VII (see lib/godPotion.js).
  hasJellyfishPet = false,
  // Player-applied debuffs on the TARGET — { iceSpray, lastBreath, lethality }, see
  // lib/mobDebuffs.js. Nothing here touches the player's own stats, so this is stashed on the
  // result untouched for finalDamage.js to apply alongside the mob's own Defense/Damage
  // Reduction, exactly as isGriffinPet below is.
  debuffs = null,
  // Item buffs — { ragnarock, swordOfBadHealth, weirderTuba } toggles, see lib/buffs.js.
  buffs = null,
  // The last import's weapon inventory ({item, modifiers} entries) — only read to find the
  // Ragnarock whose own Strength its buff copies.
  importedWeapons = null,
) {
  // A held Tier Boost raises the pet's rarity. Resolved once here, so every pet read below — its
  // stat curve, rarity-gated perks, lore, and the petEntriesCache key — sees the boosted rarity.
  loadout = { ...loadout, pet: applyTierBoost(loadout.pet, itemData) };
  const out = {
    // Applies in every mode: the Debuffs tile is shown whether or not the Dungeon toggle is on, and a
    // visible control that silently did nothing outside a dungeon would be a trap.
    debuffs,
    // Stashed so finalDamage.js's computeFinalDamage (which only receives `sources`/`mob`, not
    // the full loadout) can check weapon-specific target restrictions — see DAGGER_LINE_WEAPON_IDS.
    weaponId: loadout.weapon?.item?.id ?? null,
    // Stashed the same way, so computeFinalDamage/computeAbilityDamage can look up the target
    // mob's Damage Reduction (lib/mobDefenses.js — Mythological mobs are 100% immune without a
    // Griffin pet equipped) without needing the full loadout themselves.
    isGriffinPet: loadout.pet?.item?.petId === 'GRIFFIN',
    // Stashed unchanged, being mob-independent, so finalDamage.js's selectBaseStats can apply the
    // per-mob Bestiary Strength bonus (lib/bestiaryStrength.js) once the target is known. Added after
    // the statsMultiplier stage, so it is never itself boosted by Superior Dragon or Unlimited Power.
    bestiaryMaxedMobs,
    // Stashed the same way: Final Destination's Vivacious Darkness set bonus (its Strength and Attack
    // Speed, not only the +100% Ender damage line) applies only against Ender-type mobs, so
    // selectBaseStats adds it once the target is known.
    hasFinalDestinationFullSet: hasFullSet(loadout, ARMOR_SLOTS, FINAL_DESTINATION_SET),
    baseStats: Object.fromEntries(TRACKED_STATS.map((key) => [key, 0])),
    baseStatSources: Object.fromEntries(TRACKED_STATS.map((key) => [key, []])),
    // Gear-only deltas (dungeonized/master total minus normal total, summed across equipped items),
    // folded into baseStats at the end to produce dungeonizedBaseStats/masterDungeonizedBaseStats.
    // Kept separate so player-level bonuses computed off the running total (Dragon's Greed, Sacred
    // Strength) aren't re-scaled by Dungeonize.
    dungeonizeDelta: Object.fromEntries(TRACKED_STATS.map((key) => [key, 0])),
    masterDungeonizeDelta: Object.fromEntries(TRACKED_STATS.map((key) => [key, 0])),
    // Mythos' Might (MYTHOLOGICAL_STAT_DOUBLE_IDS): the same "delta on top of each of the three
    // totals" shape as dungeonizeDelta/masterDungeonizeDelta, folded into the three mythological
    // totals at the end.
    mythologicalDelta: Object.fromEntries(TRACKED_STATS.map((key) => [key, 0])),
    mythologicalDungeonizeDelta: Object.fromEntries(TRACKED_STATS.map((key) => [key, 0])),
    mythologicalMasterDungeonizeDelta: Object.fromEntries(TRACKED_STATS.map((key) => [key, 0])),
    // Weapon-only Catacombs Stats Boost percentage for computeAbilityDamage's Base Ability Damage
    // scaling — see the `abilityBaseDamageBoost` assignment in collectBaseStats. 0 when the equipped
    // weapon isn't dungeonized, so the toggle never leaves it undefined.
    abilityBaseDamageBoost: { withoutMaster: 0, withMaster: 0 },
    additiveNonConditional: [],
    additiveConditional: [],
    // The equipped weapon's own "+X% damage" ability bonuses — kept separate from the
    // additive pool since they apply as their own independent factor (see lib/finalDamage.js).
    weaponBonusNonConditional: [],
    weaponBonusConditional: [],
    multiplicative: [],
    // Mage Mode's own multiplicative bucket, separate from `multiplicative` rather than filtered out
    // of it: most of that list (armor set bonuses, Crown of Avarice) doesn't apply to Ability Damage,
    // and a shared flag would risk an ability-only bonus (Implosion Belt) leaking into melee Final
    // Damage's loop, which doesn't check one.
    abilityMultiplicative: [],
    situational: [],
    overloadBonusPercent: 0,
    // Venomous/Fire Aspect/Thunderlord proc data ({id, label, source, level, percent}), null when
    // not equipped — see lib/finalDamage.js's computeVenomousProcDamage/computeEnchantProcDamage.
    venomousProc: null,
    fireAspectProc: null,
    thunderlordProc: null,
    executeProsecuteRate: null,
  };

  await collectBaseStats(
    loadout,
    itemData,
    playerStats?.catacombsLevel,
    playerStats?.tamingLevel,
    playerStats?.wolfSlayerLevel,
    playerStats?.generalsMedallionDigits,
    out,
    maxedCollectionsCount,
    // Reaches the reforge bonus (Two-Headed Strike) and the pet's raw base stats (Infused Dragon)
    // — see lib/essencePerks.js.
    essencePerks,
  );
  // The player's Defense, and the only thing in this app that reads it: Ankylosaurus's Armored
  // Tank converts a share of it into Strength (lib/petData.js's computeAnkylosaurusStrength).
  // Computed here rather than inside collectBaseStats because it needs that function's finished
  // armor total AND the Mining Level / God Potion / Unlimited Fortitude inputs, which only this
  // scope has. Deliberately never added to baseStats — Defense itself is invisible to the user.
  out.playerDefense = combinePlayerDefense(out.armorDefense, playerStats, attributes, godPotionActive);
  if (loadout.pet?.item?.petId === 'ANKYLOSAURUS') {
    const armoredTank = computeAnkylosaurusStrength(out.playerDefense, out.petOtherNums);
    addBaseStat(out, 'strength', armoredTank, 'Ankylosaurus (Armored Tank)');
  }
  addBaseStat(out, 'strength', computeForagingStrengthBonus(playerStats?.foragingLevel), 'Foraging Level');
  addBaseStat(out, 'strength', computeSkyblockLevelStrengthBonus(playerStats?.skyblockLevel), 'Skyblock Level');
  addBaseStat(out, 'intelligence', computeAlchemyIntelligenceBonus(playerStats?.alchemyLevel), 'Alchemy Level');
  addBaseStat(out, 'intelligence', computeEnchantingIntelligenceBonus(playerStats?.enchantingLevel), 'Enchanting Level');
  addBaseStat(out, 'ability_damage', computeEnchantingAbilityDamageBonus(playerStats?.enchantingLevel), 'Enchanting Level');
  addBaseStat(out, 'crit_damage', computeTarantulaSlayerCritDamageBonus(playerStats?.tarantulaSlayerLevel), 'Tarantula Slayer Level');
  addBaseStat(out, 'strength', computeBlazeSlayerStrengthBonus(playerStats?.blazeSlayerLevel), 'Blaze Slayer Level');
  addBaseStat(out, 'crit_chance', computeCombatLevelCritChanceBonus(playerStats?.combatLevel), 'Combat Level');

  // Blazetekk™ Ham Radio carries no Damage line itself: Bluetooth Ring's lore adds +3 Damage to it
  // and Bluertooth Ring's +4 (their separate "+1/+2 Damage if 6+ players on island" bonus is a
  // different mechanic, not modeled). Ham Radio ownership has no import signal — it is a placed or
  // inventory item rather than equipped gear — so it is a manual toggle on the Levels page
  // (playerStats.blazetekkHamRadio). Ring ownership does have one, via ownedAccessories.
  if (playerStats?.blazetekkHamRadio) {
    const ownedAccessories = loadout.accessory?.modifiers?.ownedAccessories || [];
    const radioBonus = ownedAccessories.some((a) => a.id === 'BLUERTOOTH_RING')
      ? BLAZETEKK_HAM_RADIO_BLUERTOOTH_DAMAGE
      : ownedAccessories.some((a) => a.id === 'BLUETOOTH_RING')
        ? BLAZETEKK_HAM_RADIO_BLUETOOTH_DAMAGE
        : 0;
    if (radioBonus) addBaseStat(out, 'damage', radioBonus, 'Blazetekk Ham Radio');
  }

  // Real Hypixel base stats before any gear.
  addBaseStat(out, 'crit_chance', BASE_CRIT_CHANCE, 'Base');
  addBaseStat(out, 'crit_damage', BASE_CRIT_DAMAGE, 'Base');
  // Player-entered "everything else" total.
  addBaseStat(out, 'strength', miscStats?.strength || 0, 'Misc');
  addBaseStat(out, 'crit_damage', miscStats?.crit_damage || 0, 'Misc');
  addBaseStat(out, 'intelligence', miscStats?.intelligence || 0, 'Misc');

  // One potion toggle, two different potions: inside a dungeon the God Potion is replaced by the
  // weaker, mixin-less Dungeon Potion — never both at once. See lib/godPotion.js's
  // DUNGEON_POTION_TIERS.
  if (godPotionActive && useDungeonizedStats) {
    const tier = dungeonPotionEffects(hasJellyfishPet);
    const label = `Dungeon Potion (${tier.label})`;
    addBaseStat(out, 'strength', tier.strength, label);
    addBaseStat(out, 'crit_chance', tier.critChance, label);
    addBaseStat(out, 'crit_damage', tier.critDamage, label);
    if (isBowEquipped(loadout)) {
      out.additiveNonConditional.push({ id: 'dungeon-potion-arrow', label: `${label} Arrow Damage`, source: 'Player', value: tier.arrowDamage });
    }
  } else if (godPotionActive) {
    addBaseStat(out, 'strength', GOD_POTION_STRENGTH_POTION + JERRY_CANDY_STRENGTH, 'God Potion');
    addBaseStat(out, 'crit_chance', GOD_POTION_CRIT_CHANCE, 'God Potion');
    addBaseStat(out, 'crit_damage', GOD_POTION_CRIT_DAMAGE + GOD_POTION_SPIRIT_CRIT_DAMAGE, 'God Potion');
    const mixinCritDamage = godPotionMixinCritDamage(godPotionMixin);
    if (mixinCritDamage) addBaseStat(out, 'crit_damage', mixinCritDamage, `God Potion (${GOD_POTION_MIXINS[godPotionMixin].label} Mixin)`);
    if (isBowEquipped(loadout)) {
      out.additiveNonConditional.push({
        id: 'god-potion-archery',
        label: 'God Potion (Archery IV)',
        source: 'Player',
        value: GOD_POTION_ARCHERY_DAMAGE,
      });
    }
  }

  // Griffin's Sacred Strength: +% Strength scaled by pet level, assumed always active since HP isn't
  // tracked. Computed here, where itemData and pet level are in scope, but stashed on `out` and
  // applied alongside Dragon's Greed in the shared final-stage stat-boost loop.
  out.sacredStrengthPercent = 0;
  if (loadout.pet?.item?.petId === 'GRIFFIN') {
    const { item: pet, modifiers: petModifiers } = loadout.pet;
    const levels = itemData.pets?.[pet.petId]?.[pet.tier];
    const otherNums = computeOtherNums(levels, petModifiers.level, getMaxPetLevel(pet.petId));
    out.sacredStrengthPercent = otherNums[0] || 0;
  }

  const combatLevelBonus = computeCombatLevelBonus(playerStats?.combatLevel);
  if (combatLevelBonus) {
    out.additiveNonConditional.push({
      id: 'combat-level',
      label: 'Combat Level',
      source: 'Player',
      value: combatLevelBonus,
      abilityEligible: true,
    });
  }

  const skyblockLevelMultiplier = computeSkyblockLevelMultiplier(playerStats?.skyblockLevel);
  if (skyblockLevelMultiplier !== 1) {
    const skyblockLevelEntry = { id: 'skyblock-level', label: 'Skyblock Level', source: 'Player', value: skyblockLevelMultiplier };
    out.multiplicative.push(skyblockLevelEntry);
    // Applies identically to Ability Damage.
    out.abilityMultiplicative.push(skyblockLevelEntry);
  }

  // Implosion Belt: a 1.25x multiplier on Hyperion/Spirit Sceptre/Yeti Sword's Ability Damage only,
  // never melee Final Damage, hence abilityMultiplicative. Surfaced as an inactive situational note
  // when the belt and weapon aren't both equipped, so the bonus isn't invisible.
  if (loadout.belt?.item?.id === IMPLOSION_BELT_ID && IMPLOSION_BELT_WEAPON_IDS.has(loadout.weapon?.item?.id)) {
    out.abilityMultiplicative.push({
      id: 'implosion-belt',
      label: 'Implosion Belt',
      source: 'Belt',
      value: IMPLOSION_BELT_ABILITY_MULTIPLIER,
    });
  } else if (IMPLOSION_BELT_WEAPON_IDS.has(loadout.weapon?.item?.id)) {
    // Only worth surfacing while an Implosion-family weapon is equipped, where it is an actionable
    // "equip the belt for +25%". Shown unconditionally it appeared on bow builds, where the belt
    // cannot apply.
    out.situational.push({
      id: 'implosion-belt-inactive',
      label: 'Implosion Belt',
      source: 'Ability Damage',
      note: `Not currently active — equipping the Implosion Belt alongside this weapon would add a +${Math.round((IMPLOSION_BELT_ABILITY_MULTIPLIER - 1) * 100)}% Ability Damage multiplier.`,
      formula: null,
    });
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

    // Overload (bow only): its flat Crit Damage/Crit Chance grant already reaches the weapon's base
    // stats through the generic enchant-stat pipeline (itemTooltip.js). This is the separate
    // "Mega Crit" guaranteed-proc display, +10% extra damage per level.
    if (slot === 'weapon' && isBowEquipped(loadout)) {
      const overloadEntry = enchantEntries.find((e) => e.id.toLowerCase() === 'overload');
      if (overloadEntry) {
        out.overloadBonusPercent = OVERLOAD_DAMAGE_PERCENT_PER_LEVEL * overloadEntry.level;
      }
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
      out.multiplicative.push({
        id: 'pooch-sword-wolf-damage',
        label: `${itemLabel} (against Wolves)`,
        source: slotLabel,
        value: POOCH_SWORD_WOLF_DAMAGE_MULTIPLIER,
        condition: WOLF_FAMILY_MOBS.join(', '),
        conditionLabel: 'Wolves',
      });
    }

    const seaCreatureMultiplier = SEA_CREATURE_WHIP_MULTIPLIERS[equipped.item.id];
    if (seaCreatureMultiplier) {
      out.multiplicative.push({
        id: `${equipped.item.id.toLowerCase()}-sea-creature`,
        label: `${itemLabel} (against Sea Creatures)`,
        source: slotLabel,
        value: seaCreatureMultiplier,
        condition: 'Sea Creatures',
      });
    }

    if (WITHER_BLADE_WEAPON_IDS.has(equipped.item.id)) {
      out.multiplicative.push({
        id: 'wither-blade-damage',
        label: `${itemLabel} (against Wither mobs)`,
        source: slotLabel,
        value: WITHER_BLADE_DAMAGE_MULTIPLIER,
        condition: 'Wither',
      });
    }

    if (equipped.item.id === 'NECRON_BLADE') {
      out.weaponBonusConditional.push({
        id: 'necron-blade-wither-damage',
        label: `${itemLabel} (against Wither mobs)`,
        source: slotLabel,
        value: NECRON_BLADE_WITHER_DAMAGE_PERCENT,
        condition: 'Wither',
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
      for (const { multiplier, condition, abilityEligible } of daggerMultipliers) {
        const entry = {
          id: condition ? `${idBase}-${condition.toLowerCase()}` : idBase,
          label: condition ? `${itemLabel} (${condition})` : itemLabel,
          source: slotLabel,
          value: multiplier,
          condition,
        };
        out.multiplicative.push(entry);
        if (abilityEligible) out.abilityMultiplicative.push(entry);
      }
    }

    const additiveMobMultipliers = ADDITIVE_MOB_MULTIPLIERS[equipped.item.id];
    if (additiveMobMultipliers) {
      const idBase = equipped.item.id.toLowerCase().replace(/_/g, '-');
      for (const { value, condition } of additiveMobMultipliers) {
        out.additiveConditional.push({
          id: `${idBase}-${condition.toLowerCase()}`,
          label: `${itemLabel} (${condition})`,
          source: slotLabel,
          value,
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

    // Loving: a 1.05x Ability Damage multiplier rather than the flat stat its bundled reforgeStats
    // table implies (stripped from the base-stat merge in lib/reforges.js) — see abilityDamage.js.
    if (slot === 'chestplate' && equipped.modifiers.reforge === LOVING_REFORGE_NAME) {
      out.abilityMultiplicative.push({
        id: 'loving-reforge-ability-damage',
        label: `${itemLabel} (Loving)`,
        source: slotLabel,
        value: LOVING_ABILITY_DAMAGE_MULTIPLIER,
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

  // Full-set bonuses, checked positionally against the exact 4 pieces. Final Destination's
  // Strength/Attack Speed are not applied here: the whole Vivacious Darkness bonus activates only
  // against Ender-type mobs, so selectBaseStats applies it once the target is known.
  if (hasFullSet(loadout, ARMOR_SLOTS, FINAL_DESTINATION_SET)) {
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
      condition: VANQUISHED_SET_CONDITION,
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

  // Skeleton Master: 1.05x per piece plus a separate 1.25x at 4 pieces (armorSetBonuses.js).
  // Bow-only, so it is skipped for a melee weapon rather than pushed as a conditional — the
  // condition is on the equipped weapon, not the target, which is what additiveConditional covers.
  // Shown as two lines because they are two effects: one number would hide that 3 pieces gets the
  // per-piece stacking but not the set bonus.
  // Maxor's: +5% additive arrow damage per piece, same bow-only gate, shown as one line with the
  // piece count since it scales smoothly with no separate full-set step.
  const maxorPieces = countSetPieces(loadout, ARMOR_SLOTS, MAXOR_SET);
  if (maxorPieces > 0 && isBowEquipped(loadout)) {
    out.additiveNonConditional.push({
      id: 'maxor-arrow-damage',
      label: `Maxor's (${maxorPieces}/${MAXOR_SET.length} pieces)`,
      source: 'Armor',
      value: maxorPieces * MAXOR_ARROW_DAMAGE_PERCENT_PER_PIECE,
    });
  }

  const skeletonMasterPieces = countSetPieces(loadout, ARMOR_SLOTS, SKELETON_MASTER_SET);
  if (skeletonMasterPieces > 0 && isBowEquipped(loadout)) {
    out.multiplicative.push({
      id: 'skeleton-master-per-piece',
      label: `Skeleton Master (${skeletonMasterPieces}/${SKELETON_MASTER_FULL_SET_PIECES} pieces)`,
      source: 'Armor',
      value: SKELETON_MASTER_PER_PIECE_MULTIPLIER ** skeletonMasterPieces,
    });
    if (skeletonMasterPieces >= SKELETON_MASTER_FULL_SET_PIECES) {
      out.multiplicative.push({
        id: 'skeleton-master-full-set',
        label: 'Skeleton Master (Full Set)',
        source: 'Armor',
        value: SKELETON_MASTER_FULL_SET_MULTIPLIER,
      });
    }
  }

  // Magma Lord/Thunder/Taurus-Flaming-Moogma: flat melee-only additive damage against Magmatic,
  // not Ability Damage-eligible, unlike the Implosion Belt and Loving reforge above.
  const magmaLordPieces =
    countSetPieces(loadout, ARMOR_SLOTS, MAGMA_LORD_SET) + (loadout.necklace?.item?.id === MAGMA_LORD_NECKLACE_ID ? 1 : 0);
  if (magmaLordPieces > 0) {
    out.additiveConditional.push({
      id: 'magma-lord-armor',
      label: `Magma Lord Armor (${magmaLordPieces} piece${magmaLordPieces > 1 ? 's' : ''})`,
      source: 'Armor',
      value: MAGMA_LORD_PERCENT_PER_PIECE * magmaLordPieces,
      condition: 'Magmatic',
    });
  }

  const thunderPieces =
    countSetPieces(loadout, ARMOR_SLOTS, THUNDER_SET) + (loadout.necklace?.item?.id === THUNDER_NECKLACE_ID ? 1 : 0);
  if (thunderPieces > 0) {
    out.additiveConditional.push({
      id: 'thunder-armor',
      label: `Thunder Armor (${thunderPieces} piece${thunderPieces > 1 ? 's' : ''})`,
      source: 'Armor',
      value: THUNDER_PERCENT_PER_PIECE * thunderPieces,
      condition: 'Magmatic',
    });
  }

  for (const { slot, id, label } of LAVA_SEA_CREATURE_ARMOR_PIECES) {
    if (loadout[slot]?.item?.id === id) {
      out.additiveConditional.push({
        id: `lava-sea-creature-${slot}`,
        label,
        source: 'Armor',
        value: LAVA_SEA_CREATURE_ARMOR_PERCENT,
        condition: 'Magmatic',
      });
    }
  }

  // Reaper Armor's "Trolling The Reaper" — a real full-set bonus, hardcoded here.
  if (hasFullSet(loadout, REAPER_ARMOR_SLOTS, REAPER_ARMOR_SET)) {
    out.additiveConditional.push({
      id: 'reaper-armor',
      label: 'Reaper Armor (Full Set)',
      source: 'Armor',
      value: REAPER_ARMOR_UNDEAD_PERCENT,
      condition: 'Undead',
    });
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
    const level = Math.min(100, Math.max(1, loadout.pet.modifiers.level || 1));
    const basePercent =
      SKELETON_ARROW_BONUS_MIN_PERCENT +
      ((level - 1) / 99) * (SKELETON_ARROW_BONUS_MAX_PERCENT - SKELETON_ARROW_BONUS_MIN_PERCENT);
    const skeletonArrowBonus = useDungeonizedStats ? basePercent * 2 : basePercent;
    out.additiveNonConditional.push({
      id: 'skeleton-arrow-boost',
      label: `Skeleton${useDungeonizedStats ? ' (Dungeon Stats)' : ''}`,
      source: 'Pet',
      value: Math.round(skeletonArrowBonus * 10) / 10,
    });
  }

  for (const tier of TUXEDO_TIERS) {
    if (hasFullSet(loadout, TUXEDO_SLOTS, tier.ids)) {
      out.additiveNonConditional.push({
        id: `tuxedo-${tier.name.toLowerCase()}`,
        label: `${tier.name} Tuxedo`,
        source: 'Armor',
        value: tier.damagePercent,
      });
    }
  }

  await collectPetEntries(loadout, itemData, out);

  // Item buffs (lib/buffs.js). Ragnarock's grant is worked out from the axe itself, so that pipeline
  // call is paid for only while its buff is on.
  const ragnarockStrength = buffs?.ragnarock
    ? await computeRagnarockStrength(findRagnarock(importedWeapons, loadout), loadout, itemData, playerStats, maxedCollectionsCount, essencePerks)
    : 0;
  collectAttributeEntries(attributes, loadout, out, useDungeonizedStats, blessing, essencePerks, computeBuffGrants(buffs, ragnarockStrength));

  // Final-multiplier stat-boost perks, applied last on the fully-summed combat-stat totals and never
  // on Damage — the same mechanism as Unlimited Power above. Covers Strength, Crit Chance, Crit
  // Damage, Intelligence, Ability Damage, Bonus Attack Speed and Ferocity, since Renowned, Ender
  // Dragon Superior, Blaze Crimson Isle, Legion and Superior Dragon are combat-stat boosts rather
  // than damage-specific ones.
  const finalMultiplierStats = [
    'strength',
    'crit_chance',
    'crit_damage',
    'intelligence',
    'ability_damage',
    'bonus_attack_speed',
    'ferocity',
  ];

  // Every active source's percent is computed off the same pre-boost snapshot and summed rather than
  // chained against the running total, so two +1% sources add to +2% of the original rather than
  // 1.01 * 1.01. Each source still gets its own labelled breakdown entry. Snapshotting all three
  // toggle states before the loop keeps that flat-sum behaviour correct in Dungeon and Master modes.
  const preBoostTotals = Object.fromEntries(finalMultiplierStats.map((key) => [key, currentStatTotals(out, key)]));
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

  // Both Mining Island boosts — the HotM perk and the pet ability — share a target check and raise
  // the same two stats, so they sit together, each with its own labelled row.
  if (onMiningIsland) {
    const lonesomeMiner = lonesomeMinerPercent(playerStats?.lonesomeMinerLevel);
    if (lonesomeMiner > 0) {
      statBoostSources.push({
        percent: lonesomeMiner,
        label: `Lonesome Miner ${playerStats.lonesomeMinerLevel} (On ${MINING_ISLANDS_LABEL})`,
        stats: MINING_ISLAND_BOOST_STATS,
      });
    }
    if (loadout.pet?.item?.petId === MITHRIL_GOLEM_PET_ID) {
      const golem = mithrilGolemPercent(loadout.pet?.modifiers?.level);
      if (golem > 0) {
        statBoostSources.push({
          percent: golem,
          label: `Mithril Golem (On ${MINING_ISLANDS_LABEL})`,
          stats: MINING_ISLAND_BOOST_STATS,
        });
      }
    }
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

  // Golden Dragon's Dragon's Greed, assumed active at its max (+5% Strength). Strength-only via
  // `stat`, unlike the other sources here, which apply across all of finalMultiplierStats.
  if (loadout.pet?.item?.petId === 'GOLDEN_DRAGON') {
    statBoostSources.push({ percent: DRAGONS_GREED_MAX_STRENGTH_PERCENT, label: "Dragon's Greed (assumed max)", stat: 'strength' });
  }

  // Griffin's Sacred Strength, also Strength-only; its percent was computed earlier.
  if (out.sacredStrengthPercent) {
    statBoostSources.push({ percent: out.sacredStrengthPercent, label: 'Sacred Strength (assumed active)', stat: 'strength' });
  }

  // `stat`/`stats` narrow a source to one or a few of finalMultiplierStats; omitting both means all
  // of them, which is the common case here.
  for (const { percent, label, stat, stats } of statBoostSources) {
    for (const statKey of stats || (stat ? [stat] : finalMultiplierStats)) {
      addPercentStatBoost(out, statKey, percent, label, preBoostTotals[statKey]);
    }
  }

  // Tarantula/Primordial Helmet's Radioactive bonus reads the final Strength total, after the
  // stat-boost stage above, as a player's own Strength stat does — including the Dungeon/Master
  // total and its own 1,000 cap while the toggle is on.
  const radioactiveRate = RADIOACTIVE_CRIT_DAMAGE_PER_10_STRENGTH[loadout.helmet?.item?.id];
  if (radioactiveRate) {
    const strengthTotals = currentStatTotals(out, 'strength');
    const factor = radioactiveRate / 10;
    addFinalStatValue(
      out,
      'crit_damage',
      Math.min(strengthTotals.normal, RADIOACTIVE_MAX_STRENGTH) * factor,
      Math.min(strengthTotals.dungeonized, RADIOACTIVE_MAX_STRENGTH) * factor,
      Math.min(strengthTotals.master, RADIOACTIVE_MAX_STRENGTH) * factor,
      'Radioactive',
      Math.min(strengthTotals.mythological, RADIOACTIVE_MAX_STRENGTH) * factor,
      Math.min(strengthTotals.mythologicalDungeonized, RADIOACTIVE_MAX_STRENGTH) * factor,
      Math.min(strengthTotals.mythologicalMaster, RADIOACTIVE_MAX_STRENGTH) * factor,
    );
  }

  out.dungeonizedBaseStats = {};
  out.masterDungeonizedBaseStats = {};
  out.mythologicalBaseStats = {};
  out.mythologicalDungeonizedBaseStats = {};
  out.mythologicalMasterDungeonizedBaseStats = {};
  for (const statKey of TRACKED_STATS) {
    out.dungeonizedBaseStats[statKey] = out.baseStats[statKey] + out.dungeonizeDelta[statKey];
    out.masterDungeonizedBaseStats[statKey] = out.baseStats[statKey] + out.masterDungeonizeDelta[statKey];
    out.mythologicalBaseStats[statKey] = out.baseStats[statKey] + out.mythologicalDelta[statKey];
    out.mythologicalDungeonizedBaseStats[statKey] = out.dungeonizedBaseStats[statKey] + out.mythologicalDungeonizeDelta[statKey];
    out.mythologicalMasterDungeonizedBaseStats[statKey] = out.masterDungeonizedBaseStats[statKey] + out.mythologicalMasterDungeonizeDelta[statKey];
  }

  return out;
}

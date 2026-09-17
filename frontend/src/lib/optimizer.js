// Damage Increase Optimizer: evaluates gear/enchant/pet/power alternatives against the current
// loadout, one change at a time, and ranks each improvement by % damage increase. Coin cost comes
// from lib/pricing.js and gives every result a `ratio` of % increase per coin.
//
// Candidates come in two kinds:
// - Curated progressions (weapons, armor, equipment, pets): hand-authored worst-to-best tiers per
//   mode. Every tier from the current one onward is evaluated. Kuudra-family armor never skips a
//   power tier and only unlocks the next once the current piece is fully starred (see
//   evaluateItemSlotCandidates' maxIndexOverride). A slot may have several independent chains —
//   weapons per Slayer type, the two Mage helmet lines — see resolveChainsToWalk.
// - Brute force over enumerable catalogs: enchant levels, ultimate enchants, Power Stones, Stars,
//   Pet Items, weapon/equipment Reforges, and Gemstones.

import { collectDamageSources } from './damageSources';
import { computeAbilityDamage, computeDpsBreakdown, simulateHitByHit, selectBaseStats, MAX_VENOMOUS_STACKS } from './finalDamage';
import { resolveStartingHp } from './mobHp';
import { ENCHANT_ID_MOB_TYPES } from './mobTypes';
import { ARMOR_SLOTS } from './armorSlots';
import { EQUIPMENT_SLOTS } from './equipmentSlots';
import {
  VANQUISHED_SET,
  FINAL_DESTINATION_SET,
  MYTHOS_ARMOR_SET,
  CHALLENGER_ARMOR_SET,
  hasFullSet,
  countSetPieces,
  INFERNAL_CRIMSON_SET,
  INFERNAL_CRIMSON_MIN_PIECES,
  INFERNAL_CRIMSON_MAX_STACKS,
} from './armorSetBonuses';
import { resolveGearSummary } from './hypixelImport';
import { lookupCandidateCost, enchantPrice } from './pricing';
import { emptyModifiers, emptyPetModifiers } from './defaultModifiers';
import {
  fetchEnchantLevels,
  isUltimateEnchant,
  titleCaseEnchantId,
  toRoman,
  getCategoryEnchantIds,
  resolveEnchantCategory,
  computeConflictingEntries,
} from './enchantEffects';
import { STONE_POWERS, DEFAULT_POWERS } from './accessoryPowers';
import { getMaxStarsForItem, isStarrableItem, MASTER_STAR_MIN_BASE_STARS, MAX_MASTER_STARS } from './starring';
import {
  RULER_ATTRIBUTES,
  STRENGTH_ELEMENTAL_ATTRIBUTES,
  INTELLIGENCE_ELEMENTAL_ATTRIBUTES,
  OTHER_ATTRIBUTES,
  getAttributeMaxLevel,
} from './attributes';
import { ARMOR_VARIANT_FAMILIES } from './armorVariants';
import { parseDungeonHead, diamondCounterpartFor, reforgeRarityFor } from './dungeonHeads';
import { FLAT_STAT_PERKS, BANE_PERK, INFUSED_DRAGON_PERK, TWO_HEADED_STRIKE_PERK } from './essencePerks';
import { FORBIDDEN_BLESSING_MAX_LEVEL } from './dungeonBlessing';
import {
  MAX_COMBAT_LEVEL,
  MAX_CATACOMBS_LEVEL,
  MAX_FORAGING_LEVEL,
  MAX_TAMING_LEVEL,
  MAX_ALCHEMY_LEVEL,
  MAX_ENCHANTING_LEVEL,
  MAX_MINING_LEVEL,
  MAX_WOLF_SLAYER_LEVEL,
  MAX_TARANTULA_SLAYER_LEVEL,
  MAX_BLAZE_SLAYER_LEVEL,
} from './playerStats';
import { isMiningIslandMob } from './miningIslands';

// Essence-shop perks that grant something, for the candidate loop below.
const ALL_ESSENCE_PERKS = [...FLAT_STAT_PERKS, BANE_PERK, INFUSED_DRAGON_PERK, TWO_HEADED_STRIKE_PERK];
import { derivePetDisplayName, getMaxPetLevel, MAX_GOLDEN_DRAGON_BANK_COINS, SHINING_SCALES_MAX_GOLD_COLLECTION } from './petData';
import { formatItemName } from './mcText';
import { canRecombobulate } from './recombobulator';
import { MAX_POTATO_BOOKS } from './books';
import { getApplicableReforges, isReforgeApplicable } from './reforgeData';
import { FABLED_REFORGE_NAME, FABLED_CRIT_BONUS_MAX_PERCENT } from './reforges';
import { getSpecialConfig } from './specialWeapons';
import { countGemstoneSlots, getAllowedGemsForSlotType } from './gemstones';
import { GEMSTONE_IDS, GEMSTONES, GEMSTONE_TIERS } from './gemstoneData';

export const OPTIMIZER_MODES = [
  { id: 'slayer', label: 'Slayer', icon: '/images/manual/slayer.webp' },
  { id: 'diana', label: 'Diana', icon: '/images/manual/diana.webp' },
  { id: 'mage', label: 'Mage' },
  { id: 'dungeon_archer', label: 'Dungeon / Archer' },
  { id: 'dungeon_mage_beam', label: 'Dungeon / Mage Beam' },
  { id: 'dungeon_mage_ability', label: 'Dungeon / Mage Ability' },
];

// Auto mode follows the page's own toggles and target: inside a dungeon Mage picks Beam while DPS
// is shown and Ability otherwise; outside one a Mythological target is Diana, anything else Slayer.
export const AUTO_OPTIMIZER_MODE = 'auto';

export function resolveOptimizerMode({ useDungeonizedStats, mageMode, dpsMode, dpsKind }, mobTypes) {
  if (useDungeonizedStats) {
    if (!mageMode) return 'dungeon_archer';
    return dpsMode && dpsKind === 'beam' ? 'dungeon_mage_beam' : 'dungeon_mage_ability';
  }
  if (mageMode) return 'mage';
  return mobTypes?.includes('Mythological') ? 'diana' : 'slayer';
}

// A pinned mode persists across reloads; any unrecognized value reads as auto.
const OPTIMIZER_MODE_OVERRIDE_KEY = 'hexOptimizerModeOverride';
const SELECTABLE_MODE_IDS = new Set(OPTIMIZER_MODES.filter((m) => !m.disabled).map((m) => m.id));

export function loadOptimizerModeOverride() {
  try {
    const stored = localStorage.getItem(OPTIMIZER_MODE_OVERRIDE_KEY);
    return stored && SELECTABLE_MODE_IDS.has(stored) ? stored : AUTO_OPTIMIZER_MODE;
  } catch {
    return AUTO_OPTIMIZER_MODE;
  }
}

export function saveOptimizerModeOverride(mode) {
  try {
    localStorage.setItem(OPTIMIZER_MODE_OVERRIDE_KEY, mode);
  } catch {
    // Storage blocked — the pick still holds for this visit.
  }
}

// The damage number each mode optimizes (lib/finalDamage.js): Slayer and Dungeon/Archer use melee
// Total DPS, Mage and Dungeon/Mage Ability use Ability Damage, Dungeon/Mage Beam uses the Mage
// Staff Beam number. Every Dungeon variant turns on Dungeonized Stats.
const MODE_CONFIG = {
  slayer: { useDungeonizedStats: false, metric: 'dps' },
  // Diana is overworld Mythological combat: melee Total DPS, no Dungeonized Stats.
  diana: { useDungeonizedStats: false, metric: 'dps' },
  mage: { useDungeonizedStats: false, metric: 'ability' },
  dungeon_archer: { useDungeonizedStats: true, metric: 'dps' },
  dungeon_mage_beam: { useDungeonizedStats: true, metric: 'beam' },
  dungeon_mage_ability: { useDungeonizedStats: true, metric: 'ability' },
};

// Ultimate Swarm mob count assumed while ranking: 5 for a Slayer fight, 1 for a Diana hunt.
// accessoryOptimizer.js assumes the same; the player's own build.swarmMobs is left alone.
const OPTIMIZER_SWARM_MOBS_BY_MODE = { slayer: 5, diana: 1 };
export function withOptimizerSwarmMobs(build, mode) {
  const swarmMobs = OPTIMIZER_SWARM_MOBS_BY_MODE[mode];
  return swarmMobs != null ? { ...build, swarmMobs } : build;
}

// useMasterMode is the live toggle rather than mode config: Master Stars, and every
// masterDungeonized stat, only show an effect while it is on.
export function getModeConfig(mode, useMasterMode = false) {
  return { ...(MODE_CONFIG[mode] || MODE_CONFIG.slayer), useMasterMode };
}

// Slayer helmet chain. "10m/100m/1b coin COA" is Crown of Avarice's Coins Consumed special value
// (lib/specialWeapons.js). Crimson is the only Kuudra family with Warden/Crown of Avarice
// equivalents, and its power tiers are separate rungs so one is offered at a time;
// Aurora/Fervor/Hollow run the same tiers without those two. Terror is excluded from Slayer armor.
const SLAYER_KUUDRA_FAMILIES = ARMOR_VARIANT_FAMILIES.filter((family) => family !== 'TERROR');
function kuudraHelmetTierChain(family) {
  return [
    [{ id: 'TARANTULA_HELMET' }],
    [{ id: `${family}_HELMET` }],
    [{ id: `HOT_${family}_HELMET` }],
    [{ id: `BURNING_${family}_HELMET` }],
    [{ id: `FIERY_${family}_HELMET` }],
    [{ id: `INFERNAL_${family}_HELMET` }],
  ];
}
const SLAYER_HELMET_PROGRESSION = {
  CRIMSON: [
    [{ id: 'TARANTULA_HELMET' }],
    [
      { id: 'CRIMSON_HELMET' },
      { id: 'PRIMORDIAL_HELMET' },
      { id: 'CROWN_OF_AVARICE', special: 10_000_000, label: 'Crown of Avarice (10m Coins Consumed)' },
    ],
    [{ id: 'HOT_CRIMSON_HELMET' }],
    [{ id: 'BURNING_CRIMSON_HELMET' }],
    [{ id: 'FIERY_CRIMSON_HELMET' }],
    [{ id: 'CROWN_OF_AVARICE', special: 100_000_000, label: 'Crown of Avarice (100m Coins Consumed)' }, { id: 'WARDEN_HELMET' }],
    [
      { id: 'CROWN_OF_AVARICE', special: 1_000_000_000, label: 'Crown of Avarice (1b Coins Consumed)' },
      { id: 'INFERNAL_CRIMSON_HELMET' },
    ],
  ],
  AURORA: kuudraHelmetTierChain('AURORA'),
  FERVOR: kuudraHelmetTierChain('FERVOR'),
  HOLLOW: kuudraHelmetTierChain('HOLLOW'),
};

// Chestplate/leggings/boots: Shadow Assassin -> Necron's Armor -> the family's power tiers, one
// named chain per family over a shared prefix.
function otherArmorProgression(slot) {
  const suffix = slot.toUpperCase();
  return Object.fromEntries(
    SLAYER_KUUDRA_FAMILIES.map((family) => [
      family,
      [
        [{ id: `SHADOW_ASSASSIN_${suffix}` }],
        [{ id: `POWER_WITHER_${suffix}` }],
        [{ id: `${family}_${suffix}` }],
        [{ id: `HOT_${family}_${suffix}` }],
        [{ id: `BURNING_${family}_${suffix}` }],
        [{ id: `FIERY_${family}_${suffix}` }],
        [{ id: `INFERNAL_${family}_${suffix}` }],
      ],
    ]),
  );
}

const SLAYER_ARMOR_PROGRESSION = {
  helmet: SLAYER_HELMET_PROGRESSION,
  chestplate: otherArmorProgression('chestplate'),
  leggings: otherArmorProgression('leggings'),
  boots: otherArmorProgression('boots'),
};

// Equipment: Ender 4-piece -> Molten 4-piece, then a per-slot branch. David's Cloak's Strength is a
// manual Special value, defaulted to its max (50, MYTHIC) so the candidate compares at best case.
const SLAYER_EQUIPMENT_PROGRESSION = {
  necklace: [[{ id: 'ENDER_NECKLACE' }], [{ id: 'MOLTEN_NECKLACE' }], [{ id: 'RIFT_NECKLACE_OUTSIDE' }]],
  cloak: [
    [{ id: 'ENDER_CLOAK' }],
    [{ id: 'MOLTEN_CLOAK' }],
    [{ id: 'DAVIDS_CLOAK', special: 50, rarityOverride: 'MYTHIC' }, { id: 'ANNIHILATION_CLOAK' }],
  ],
  belt: [[{ id: 'ENDER_BELT' }], [{ id: 'MOLTEN_BELT' }], [{ id: 'THE_PRIMORDIAL' }]],
  gloves: [
    [{ id: 'ENDER_GAUNTLET' }],
    [{ id: 'MOLTEN_BRACELET' }, { id: 'SOULWEAVER_GLOVES' }],
    [{ id: 'SHRIVELED_BRACELET' }, { id: 'DEMONLORD_GAUNTLET' }, { id: 'MANTICORE_CLAW' }],
  ],
};

// Slayer pets: one flat sidegrade tier, every pet compared against every other. Tiger and T-Rex
// (Tyrannosaurus) are separate pets.
const SLAYER_PET_PROGRESSION = [
  [
    { petId: 'GRIFFIN' },
    { petId: 'TYRANNOSAURUS' },
    { petId: 'TIGER' },
    { petId: 'ANKYLOSAURUS' },
    { petId: 'LION' },
    { petId: 'BLAZE' },
    { petId: 'ZOMBIE' },
    { petId: 'WITHER_SKELETON' },
    { petId: 'ENDER_DRAGON' },
    { petId: 'GOLDEN_DRAGON' },
  ],
];

// Diana: Griffin only — its Sacred Strength scales Strength with pet level.
const DIANA_PET_PROGRESSION = [[{ petId: 'GRIFFIN' }]];

// Slayer weapon rewards: one worst-to-best chain per Slayer type, independent of the others.
const SLAYER_WEAPON_PROGRESSION = {
  zombie: [[{ id: 'UNDEAD_SWORD' }], [{ id: 'REVENANT_SWORD' }], [{ id: 'REAPER_SWORD' }], [{ id: 'AXE_OF_THE_SHREDDED' }]],
  spider: [
    [{ id: 'SPIDER_SWORD' }],
    [{ id: 'RECLUSE_FANG' }],
    [{ id: 'TARANTULA_FANG' }],
    [{ id: 'SCORPION_FOIL' }],
    [{ id: 'STING' }],
  ],
  enderman: [[{ id: 'VOIDWALKER_KATANA' }], [{ id: 'VOIDEDGE_KATANA' }], [{ id: 'VORPAL_KATANA' }], [{ id: 'ATOMSPLIT_KATANA' }]],
  blaze_fire: [[{ id: 'FIREDUST_DAGGER' }], [{ id: 'BURSTFIRE_DAGGER' }], [{ id: 'HEARTFIRE_DAGGER' }]],
  blaze_maw: [[{ id: 'MAWDUST_DAGGER' }], [{ id: 'BURSTMAW_DAGGER' }], [{ id: 'HEARTMAW_DAGGER' }]],
  // Wolf Slayer's other reward weapon, Edible Mace, is an ability weapon and stays out of this chain.
  wolf: [[{ id: 'SHAMAN_SWORD' }], [{ id: 'POOCH_SWORD' }]],
};

// Diana armor and equipment: Slayer's chains with Challenger's/Mythos gear appended per slot.
// Mythos' Might doubles a piece's stats against Mythological targets (armorSetBonuses.js's
// MYTHOLOGICAL_STAT_DOUBLE_IDS). Appended to every family chain rather than standing alone, so an
// already-owned Kuudra piece reaches it — resolveChainsToWalk only walks matching chains.
function appendTierToEachChain(chainsByFamily, tier) {
  return Object.fromEntries(Object.entries(chainsByFamily).map(([family, chain]) => [family, [...chain, tier]]));
}
const MYTHOLOGICAL_ARMOR_TIER = {
  helmet: [{ id: 'CHALLENGER_HELMET' }, { id: 'MYTHOS_HELMET' }],
  chestplate: [{ id: 'CHALLENGER_CHESTPLATE' }, { id: 'MYTHOS_CHESTPLATE' }],
  leggings: [{ id: 'CHALLENGER_LEGGINGS' }, { id: 'MYTHOS_LEGGINGS' }],
  boots: [{ id: 'CHALLENGER_BOOTS' }, { id: 'MYTHOS_BOOTS' }],
};
const DIANA_ARMOR_PROGRESSION = Object.fromEntries(
  ARMOR_SLOTS.map((slot) => [slot, appendTierToEachChain(SLAYER_ARMOR_PROGRESSION[slot], MYTHOLOGICAL_ARMOR_TIER[slot])]),
);
const MYTHOLOGICAL_EQUIPMENT_TIER = {
  necklace: [{ id: 'CHALLENGER_NECKLACE' }, { id: 'MYTHOS_NECKLACE' }],
  cloak: [{ id: 'CHALLENGER_CLOAK' }, { id: 'MYTHOS_CLOAK' }],
  belt: [{ id: 'CHALLENGER_BELT' }, { id: 'MYTHOS_BELT' }],
  gloves: [{ id: 'CHALLENGER_BRACELET' }, { id: 'MYTHOS_BRACELET' }],
};
// Equipment chains are flat arrays rather than per-family dicts, so appending is direct.
const DIANA_EQUIPMENT_PROGRESSION = Object.fromEntries(
  EQUIPMENT_SLOTS.map((slot) => [slot, [...SLAYER_EQUIPMENT_PROGRESSION[slot], MYTHOLOGICAL_EQUIPMENT_TIER[slot]]]),
);

// Diana weapons: Sword of Revelations/Giant's Sword/Dark Claymore/Midas Sword sidegrades ->
// Daedalus Blade -> Starred Daedalus Blade. Midas Sword carries its forced Gilded reforge and
// Price Paid cap. Daedalus Blade's "Combined Mythological Bestiary Tiers" is live account data, so
// evaluateWeaponProgressionCandidates stamps it from build.combinedMythologicalBestiaryTiers.
const DIANA_WEAPON_PROGRESSION = {
  sword: [
    [{ id: 'SWORD_OF_REVELATIONS' }, { id: 'GIANTS_SWORD' }, { id: 'DARK_CLAYMORE' }, { id: 'MIDAS_SWORD', forcedReforge: 'Gilded', special: 50_000_000 }],
    [{ id: 'DAEDALUS_AXE' }],
    [{ id: 'STARRED_DAEDALUS_AXE' }],
  ],
};

// Slayer weapon suggestions are limited to the chains matching the target mob's type
// (lib/damageSymbols.js). Infernal maps to both dagger lines. Vampire has no chain, so a Vampire
// target yields no weapon suggestions.
const SLAYER_MOB_TYPE_TO_WEAPON_CHAINS = {
  Undead: ['zombie'],
  Arthropod: ['spider'],
  Ender: ['enderman'],
  Infernal: ['blaze_fire', 'blaze_maw'],
  Animal: ['wolf'],
};

// Dungeon/Archer weapons: every Bow-category weapon in one flat sidegrade tier, ordered by computed
// DPS rather than by a hand-authored list.
const DUNGEON_ARCHER_WEAPON_PROGRESSION = {
  bow: [
    [
      { id: 'BOW' },
      { id: 'MIRRORED_BOW' },
      { id: 'DECENT_BOW' },
      { id: 'PRISMARINE_BOW' },
      { id: 'SAVANA_BOW' },
      { id: 'WITHER_BOW' },
      { id: 'ARTISANAL_SHORTBOW' },
      { id: 'ENDER_BOW' },
      { id: 'BINGBOW' },
      { id: 'DRAGON_SHORTBOW' },
      { id: 'END_STONE_BOW' },
      { id: 'EXPLOSIVE_BOW' },
      { id: 'HURRICANE_BOW' },
      { id: 'JUJU_SHORTBOW' },
      { id: 'MAGMA_BOW' },
      { id: 'SCORPION_BOW' },
      { id: 'SLIME_BOW' },
      { id: 'SOULS_REBOUND' },
      { id: 'SPIDER_QUEENS_STINGER' },
      { id: 'STARRED_SPIDER_QUEENS_STINGER' },
      { id: 'SULPHUR_BOW' },
      { id: 'VENOMS_TOUCH' },
      { id: 'STARRED_VENOMS_TOUCH' },
      { id: 'MOSQUITO_BOW' },
      { id: 'RUNAANS_BOW' },
      { id: 'TERMINATOR' },
    ],
  ],
};

// Dungeon/Archer armor: Shadow Assassin -> Starred Shadow Assassin -> Necron's Armor on every slot,
// plus Frozen Blaze as a top sidegrade only while a Blaze pet is equipped (requiresPetId).
// Storm's/Goldor's/Maxor's are listed as alsoAtThisTier: they place the player at the wither tier
// without becoming suggestions, so wearing one doesn't restart the walk at Shadow Assassin.
const WITHER_ARMOR_PREFIXES = ['POWER_WITHER', 'WISE_WITHER', 'TANK_WITHER', 'SPEED_WITHER'];

function dungeonArcherArmorProgression(slot) {
  const suffix = slot.toUpperCase();
  return [
    [{ id: `SHADOW_ASSASSIN_${suffix}` }],
    [{ id: `STARRED_SHADOW_ASSASSIN_${suffix}` }],
    [
      { id: `POWER_WITHER_${suffix}`, alsoAtThisTier: WITHER_ARMOR_PREFIXES.map((p) => `${p}_${suffix}`) },
      { id: `FROZEN_BLAZE_${suffix}`, requiresPetId: 'BLAZE' },
    ],
  ];
}
const DUNGEON_ARCHER_ARMOR_PROGRESSION = Object.fromEntries(ARMOR_SLOTS.map((slot) => [slot, dungeonArcherArmorProgression(slot)]));

// Dungeon/Archer pets: Ender Dragon and Golden Dragon as one flat sidegrade tier.
const DUNGEON_ARCHER_PET_PROGRESSION = [[{ petId: 'ENDER_DRAGON' }, { petId: 'GOLDEN_DRAGON' }]];

// Mage progression, shared by Mage, Dungeon/Mage Beam and Dungeon/Mage Ability. Weapons are the
// exception: Beam scales off melee Final Damage, so it has its own chain below.
const MAGE_WEAPON_PROGRESSION = {
  staff: [
    [{ id: 'CRYPT_DREADLORD_SWORD' }],
    [
      { id: 'FROZEN_SCYTHE' },
      { id: 'BONZO_STAFF' },
      { id: 'GLACIAL_SCYTHE' },
      { id: 'BAT_WAND' }, // Spirit Sceptre
      { id: 'YETI_SWORD' },
      { id: 'MIDAS_STAFF' },
      { id: 'FIRE_VEIL_WAND' },
    ],
    [{ id: 'HYPERION' }],
  ],
};

// Dungeon/Mage Beam weapons: Giant's Sword and Midas Sword as sidegrades, Dark Claymore on top.
// Midas Sword forces Gilded, its item-exclusive reforge stone, and carries its Price Paid cap so
// its Greed bonus isn't compared at 0%.
const MAGE_BEAM_WEAPON_PROGRESSION = {
  sword: [
    [{ id: 'GIANTS_SWORD' }, { id: 'MIDAS_SWORD', forcedReforge: 'Gilded', special: 50_000_000 }],
    [{ id: 'DARK_CLAYMORE' }],
  ],
};

// Mage helmet: Wise Dragon -> Storm's/Aurora, with Aurora's own power tiers climbing past that
// shared rung. dungeonOnly drops Aurora in the Dungeon modes, leaving Storm's on top.
function mageArmorProgression(slot, { dungeonOnly = false } = {}) {
  const suffix = slot.toUpperCase();
  if (dungeonOnly) return [[{ id: `WISE_DRAGON_${suffix}` }], [{ id: `WISE_WITHER_${suffix}` }]]; // Storm's
  return [
    [{ id: `WISE_DRAGON_${suffix}` }],
    [{ id: `AURORA_${suffix}` }, { id: `WISE_WITHER_${suffix}` }], // Storm's
    [{ id: `HOT_AURORA_${suffix}` }],
    [{ id: `BURNING_AURORA_${suffix}` }],
    [{ id: `FIERY_AURORA_${suffix}` }],
    [{ id: `INFERNAL_AURORA_${suffix}` }],
  ];
}

// The helmet's second, independent chain: Dark/Shadow/Wither Goggles (see resolveChainsToWalk).
// Already Dungeon-tagged, so it is identical across the Mage progressions.
const MAGE_HELMET_PROGRESSION = {
  wise_dragon: mageArmorProgression('helmet'),
  goggles: [[{ id: 'DARK_GOGGLES' }], [{ id: 'SHADOW_GOGGLES' }], [{ id: 'WITHER_GOGGLES' }]],
};
const DUNGEON_MAGE_HELMET_PROGRESSION = {
  wise_dragon: mageArmorProgression('helmet', { dungeonOnly: true }),
  goggles: MAGE_HELMET_PROGRESSION.goggles,
};

const MAGE_ARMOR_PROGRESSION = {
  helmet: MAGE_HELMET_PROGRESSION,
  chestplate: mageArmorProgression('chestplate'),
  leggings: mageArmorProgression('leggings'),
  boots: mageArmorProgression('boots'),
};
// Dungeon/Mage Ability armor: as plain Mage, without Aurora.
const MAGE_ABILITY_ARMOR_PROGRESSION = {
  helmet: DUNGEON_MAGE_HELMET_PROGRESSION,
  chestplate: mageArmorProgression('chestplate', { dungeonOnly: true }),
  leggings: mageArmorProgression('leggings', { dungeonOnly: true }),
  boots: mageArmorProgression('boots', { dungeonOnly: true }),
};
// Dungeon/Mage Beam armor: Storm's only, one item per tier. Stars and Master Stars are evaluated
// separately and are the remaining upgrade path.
const MAGE_BEAM_ARMOR_PROGRESSION = {
  helmet: [[{ id: 'WISE_WITHER_HELMET' }]],
  chestplate: [[{ id: 'WISE_WITHER_CHESTPLATE' }]],
  leggings: [[{ id: 'WISE_WITHER_LEGGINGS' }]],
  boots: [[{ id: 'WISE_WITHER_BOOTS' }]],
};

// Balloon Snake and Rift Necklace are real sidegrades despite the rarity gap (RARE vs LEGENDARY,
// user-specified) — both always compared, not a strict tier order. Only necklace/belt have
// curated Mage picks; cloak/gloves fall through to the brute-forced categories, same as any
// other uncurated slot.
const MAGE_EQUIPMENT_PROGRESSION = {
  necklace: [[{ id: 'BALLOON_SNAKE' }, { id: 'RIFT_NECKLACE_OUTSIDE' }]],
  belt: [[{ id: 'IMPLOSION_BELT' }]],
};

// The curated dungeon equipment picks — user-specified 2026-09-11, and the ONLY equipment any
// dungeon mode suggests. Shared by all three (Archer, Mage Beam, Mage Ability) since the lines are
// the same; the two mage-only entries are layered on below rather than duplicated here.
//
// Each line carries its Starred variant as the tier ABOVE the base, in every dungeon mode: a
// Master Mode drop is a genuinely stronger item rather than a boosted copy (Bone Necklace Defense
// +35 -> Starred +45; Shadow Assassin Cloak EPIC Strength +20 -> Starred LEGENDARY +25). Soulweaver
// Gloves and Balloon Snake have no Starred form, which is why only the other three gain a tier.
//
// Bone Necklace stays on the list for every dungeon mode even though its base block offers only
// Crit Chance and so reads weak next to the rest (user-specified) — it is still the pick.
const DUNGEON_EQUIPMENT_PROGRESSION = {
  necklace: [[{ id: 'BONE_NECKLACE' }], [{ id: 'STARRED_BONE_NECKLACE' }]],
  cloak: [[{ id: 'SHADOW_ASSASSIN_CLOAK' }], [{ id: 'STARRED_SHADOW_ASSASSIN_CLOAK' }]],
  belt: [[{ id: 'ADAPTIVE_BELT' }], [{ id: 'STARRED_ADAPTIVE_BELT' }]],
  gloves: [[{ id: 'SOULWEAVER_GLOVES' }]],
};

// Balloon Snake is a mage-only sidegrade of the base necklace tier (RARE against Bone Necklace's
// EPIC — already confirmed a real sidegrade despite the rarity gap).
const MAGE_BEAM_EQUIPMENT_PROGRESSION = {
  ...DUNGEON_EQUIPMENT_PROGRESSION,
  necklace: [[{ id: 'BONE_NECKLACE' }, { id: 'BALLOON_SNAKE' }], [{ id: 'STARRED_BONE_NECKLACE' }]],
};

// Mage Ability adds the Implosion Belt, whose 1.25x is Ability Damage only (see abilityDamage.js) —
// which is exactly why it belongs here and in no other mode. Offered alongside Adaptive Belt rather
// than above it: they are different builds, not a progression.
const MAGE_ABILITY_EQUIPMENT_PROGRESSION = {
  ...MAGE_BEAM_EQUIPMENT_PROGRESSION,
  belt: [[{ id: 'ADAPTIVE_BELT' }, { id: 'IMPLOSION_BELT' }], [{ id: 'STARRED_ADAPTIVE_BELT' }]],
};

// User-specified: no clear universal best (situational, like Slayer's pet list) — all 4 real ids
// sit in one flat tier, always compared against each other.
const MAGE_PET_PROGRESSION = [[{ petId: 'GUARDIAN' }, { petId: 'CROW' }, { petId: 'SHEEP' }, { petId: 'GOLDEN_DRAGON' }]];

// Pet Items (Textbook, Minos Relic, Hephaestus Relic — user-specified as Mage-relevant) get no
// curated list here: evaluatePetItemCandidates already brute-forces every real pet item
// regardless of mode (see this file's header comment), so a hand-authored allowlist would only
// ever narrow that, not improve it — the optimizer already surfaces whichever of these (or
// anything else) is genuinely best for the equipped pet.

const ARMOR_PROGRESSION_BY_MODE = {
  slayer: SLAYER_ARMOR_PROGRESSION,
  diana: DIANA_ARMOR_PROGRESSION,
  mage: MAGE_ARMOR_PROGRESSION,
  dungeon_archer: DUNGEON_ARCHER_ARMOR_PROGRESSION,
  dungeon_mage_beam: MAGE_BEAM_ARMOR_PROGRESSION,
  dungeon_mage_ability: MAGE_ABILITY_ARMOR_PROGRESSION,
};
const EQUIPMENT_PROGRESSION_BY_MODE = {
  slayer: SLAYER_EQUIPMENT_PROGRESSION,
  diana: DIANA_EQUIPMENT_PROGRESSION,
  mage: MAGE_EQUIPMENT_PROGRESSION,
  dungeon_archer: DUNGEON_EQUIPMENT_PROGRESSION,
  dungeon_mage_beam: MAGE_BEAM_EQUIPMENT_PROGRESSION,
  dungeon_mage_ability: MAGE_ABILITY_EQUIPMENT_PROGRESSION,
};
// Dungeon/Archer: while a Catacombs boss head is worn, the only helmet suggested is that boss's own
// Diamond rank; already on Diamond leaves the slot empty. Applied by swapping the helmet chain
// rather than special-casing evaluateItemSlotCandidates, which every mode and slot shares.
function armorProgressionForMode(mode, loadout) {
  const progression = ARMOR_PROGRESSION_BY_MODE[mode];
  if (mode !== 'dungeon_archer' || !progression) return progression;
  const helmetId = loadout.helmet?.item?.id || null;
  if (!parseDungeonHead(helmetId)) return progression;
  const diamond = diamondCounterpartFor(helmetId);
  return { ...progression, helmet: diamond ? [[{ id: diamond }]] : [] };
}

const PET_PROGRESSION_BY_MODE = {
  slayer: SLAYER_PET_PROGRESSION,
  diana: DIANA_PET_PROGRESSION,
  mage: MAGE_PET_PROGRESSION,
  dungeon_archer: DUNGEON_ARCHER_PET_PROGRESSION,
  dungeon_mage_beam: MAGE_PET_PROGRESSION,
  dungeon_mage_ability: MAGE_PET_PROGRESSION,
};
const WEAPON_PROGRESSION_BY_MODE = {
  slayer: SLAYER_WEAPON_PROGRESSION,
  diana: DIANA_WEAPON_PROGRESSION,
  mage: MAGE_WEAPON_PROGRESSION,
  dungeon_archer: DUNGEON_ARCHER_WEAPON_PROGRESSION,
  dungeon_mage_beam: MAGE_BEAM_WEAPON_PROGRESSION,
  dungeon_mage_ability: MAGE_WEAPON_PROGRESSION,
};

export function hasCuratedData(mode) {
  return (
    !!WEAPON_PROGRESSION_BY_MODE[mode] ||
    !!ARMOR_PROGRESSION_BY_MODE[mode] ||
    !!EQUIPMENT_PROGRESSION_BY_MODE[mode] ||
    !!PET_PROGRESSION_BY_MODE[mode]
  );
}

// Coin cost per candidate (lib/pricing.js). '?' rather than 0 when no cost source covers this
// candidate, so it doesn't read as free beside rows with real numbers.
function withCost(result, itemData) {
  if (!result) return result;
  const cost = lookupCandidateCost(result, itemData);
  // A numeric 0 is a confirmed free cost (a Blacksmith reforge, a Power needing no stone); null is
  // unpriced. priceOf treats a 0 price as no price, so every 0 here is a deliberate return 0.
  const hasRealCost = typeof cost === 'number';
  return {
    ...result,
    cost: hasRealCost ? cost : '?',
    // Zero coins makes damage per coin unbounded; Infinity sorts free upgrades to the top of Best Value.
    ratio: hasRealCost ? (cost > 0 ? result.percentIncrease / cost : Infinity) : null,
  };
}

// Drops a candidate when another priced option in the same group — a higher or lower tier of the
// SAME option (the same gem in the same socket, the same enchant on the same item, the same
// attribute; see dominanceGroupKey) — costs no more, gains no less, and is strictly better on one
// axis. Unpriced ('?') candidates never dominate and are never dropped. groupKeyFn is required:
// there is no default group, so a slot's alternatives are never pruned against each other.
function dropDominated(results, groupKeyFn) {
  const byGroup = new Map();
  for (const r of results) {
    if (typeof r.cost !== 'number') continue; // unpriced — can't dominate, can't be judged dominated
    const key = groupKeyFn(r);
    if (key == null) continue; // not a recognized mutually-exclusive group — leave alone
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(r);
  }
  const dominated = new Set();
  for (const group of byGroup.values()) {
    for (const a of group) {
      const isDominated = group.some(
        (b) => b !== a && b.cost <= a.cost && b.percentIncrease >= a.percentIncrease && (b.cost < a.cost || b.percentIncrease > a.percentIncrease),
      );
      if (isDominated) dominated.add(a);
    }
  }
  return dominated.size ? results.filter((r) => !dominated.has(r)) : results;
}

// The group a candidate competes in, or null when it isn't a single-choice group. Most otherResults
// categories are independent of each other (a Sharpness upgrade and a Critical upgrade are both
// taken), and the accessory categories are evaluated in accessoryOptimizer.js instead.
export function dominanceGroupKey(result) {
  switch (result.category) {
    // Keyed by gem as well as socket: two gem types in one socket buy different stats, so which one
    // wins depends on the player's own Strength/Crit Damage. Only tiers of the same gem compete.
    case 'Gemstone': {
      const step = findStep(result.apply, 'setGemstone');
      return step ? `Gemstone:${step.slot}:${step.index}:${step.gem}` : null;
    }
    case 'Enchant':
    case 'Ultimate Enchant': {
      const step = findStep(result.apply, 'applyEnchant');
      return step ? `${result.category}:${step.slot}:${step.id}` : null;
    }
    case 'Attribute': {
      const step = findStep(result.apply, 'setAttributeLevel');
      return step ? `Attribute:${step.id}` : null;
    }
    case 'Essence Perk': {
      const step = findStep(result.apply, 'setEssencePerkLevel') || findStep(result.apply, 'setForbiddenBlessingLevel');
      return step ? `Essence Perk:${result.perkKey}` : null;
    }
    // One row per skill: only the immediate next level is ever offered.
    case 'Skill':
      return `Skill:${result.skillKey}`;
    case 'Potion':
      return `Potion:${result.potionKind}`;
    // No slot-level or single-choice groups: every group above compares levels or tiers of the same
    // option, so nothing here prunes independent alternatives.
    default:
      return null;
  }
}

function findStep(apply, type) {
  return (apply || []).find((s) => s.type === type);
}

// Whether the equipped item is already at this tier — its own id, or one of the equivalent lines a
// tier declares via `alsoAtThisTier`. Separate from evaluateTieredProgression's `isCurrent`, which
// stays id-based so an equivalent-but-different item is still offered the swap.
function candidateCoversId(candidate, currentId) {
  return candidate.id === currentId || !!candidate.alsoAtThisTier?.includes(currentId);
}

function findTierIndex(progression, matches) {
  for (let i = 0; i < progression.length; i++) {
    if (progression[i].some(matches)) return i;
  }
  return -1;
}

// A progression entry is either one flat chain (an array of tiers) or an object of named chains for
// a slot with several independent lines (weapons per Slayer type; the two Mage helmet lines). Only
// chains matching the equipped item are walked; if none match, every chain is walked from tier 0.
function resolveChainsToWalk(progression, currentId) {
  const chains = Array.isArray(progression) ? [progression] : Object.values(progression);
  const owned = chains.filter((chain) => findTierIndex(chain, (c) => candidateCoversId(c, currentId)) !== -1);
  return owned.length > 0 ? owned : chains;
}

// Walks every tier from the player's current position (tier 0 when unrecognized) upward, resolving
// each candidate through `evaluate` (null on a catalog miss, skipped) and keeping every improvement
// over baselineValue. Sidegrades within the current tier are evaluated too.
//
// `maxIndexOverride` caps that window at a tier index even when a later tier scores higher, so
// Kuudra power tiers are earned in order. evaluateItemSlotCandidates sets it to the current tier
// while that tier's stars aren't maxed, and to current+1 once they are. Other progressions pass
// no override.
async function evaluateTieredProgression(
  progression,
  currentIndex,
  isCurrent,
  baselineValue,
  evaluate,
  maxIndexOverride,
  alwaysIncludeLastTier,
) {
  const effectiveIndex = currentIndex === -1 ? 0 : currentIndex;
  const maxIndex = maxIndexOverride != null ? maxIndexOverride : progression.length - 1;
  const lastIndex = progression.length - 1;
  const indices = [];
  for (let i = effectiveIndex; i <= maxIndex && i < progression.length; i++) indices.push(i);
  // A chain's final tier can be independently obtainable (Diana's Challenger's/Mythos armor) rather
  // than another Kuudra step, so it is walked regardless of maxIndexOverride.
  if (alwaysIncludeLastTier && lastIndex > maxIndex && lastIndex >= effectiveIndex) indices.push(lastIndex);
  const evaluated = [];
  for (const i of indices) {
    const tierCandidates = progression[i].filter((c) => !(i === effectiveIndex && currentIndex !== -1 && isCurrent(c)));
    for (const candidate of tierCandidates) {
      const outcome = await evaluate(candidate);
      if (!outcome) continue;
      // A 0 baseline (Ability Damage from a weapon with no ability) has no % of baseline to compute;
      // scaling the raw value keeps a positive number that ranks candidates by what they add.
      const percentIncrease = baselineValue > 0 ? ((outcome.value - baselineValue) / baselineValue) * 100 : outcome.value * 100;
      if (percentIncrease > 0.001) evaluated.push({ ...outcome, percentIncrease });
    }
  }
  return evaluated;
}

// Runs the damage pipeline for one candidate loadout and reduces it to the mode's damage number,
// plus the raw sources (the baseline call reads Bonus Attack Speed off them).
//
// For the 'dps' metric against a mob with a known starting HP (lib/mobHp.js), that number is a
// fight average from lib/finalDamage.js's simulateHitByHit rather than a snapshot, so
// Execute/Prosecute's HP ramp and Venomous's stack ramp are priced. `sources` is then built at
// mobHpPercent=100 so the opening-hit entries exist for the simulation to gate per hit, and the
// window is the same 40 hits the graph shows. A mob with no known HP uses the fixed-mobHpPercent
// number. Ability and Beam metrics are unaffected.
export async function computeModeDamageAndSources(loadout, itemData, build, modeConfig, mob) {
  const startingHp =
    modeConfig.metric === 'dps'
      ? resolveStartingHp(mob?.name, modeConfig.useMasterMode, build.mobHpSelections?.[mob?.name])
      : null;
  const mobHpPercent = startingHp ? 100 : build.mobHpPercent;
  // An Infernal/Magmatic target turns the Blaze pet's Crimson Isle bonus on regardless of the manual
  // toggle, so every candidate is compared with it applied.
  const isCrimsonIsleTarget = !!mob?.types && (mob.types.includes('Infernal') || mob.types.includes('Magmatic'));
  const blazeCrimsonIsle = build.blazeCrimsonIsle || isCrimsonIsleTarget;
  // Derived by location: gates the Lonesome Miner perk and a Mithril Golem pet to Mining Island
  // targets (lib/miningIslands.js).
  const onMiningIsland = isMiningIslandMob(mob?.name);

  const sources = await collectDamageSources(
    loadout,
    itemData,
    build.playerStats,
    build.godPotionActive,
    build.attributes,
    build.miscStats,
    mobHpPercent,
    build.infernalCrimsonStacks,
    modeConfig.useDungeonizedStats,
    build.swarmMobs,
    build.comboKills,
    build.legionPlayers,
    blazeCrimsonIsle,
    build.bestiaryMaxedMobs,
    build.godPotionMixin,
    build.maxedCollectionsCount,
    build.blessing,
    build.essencePerks,
    onMiningIsland,
    build.hasJellyfishPet,
    build.debuffs,
    build.buffs,
    build.importedWeapons,
  );

  if (modeConfig.metric === 'ability') {
    const ability = computeAbilityDamage(sources, mob, loadout, modeConfig.useDungeonizedStats, modeConfig.useMasterMode);
    return { value: ability ? ability.finalDamage : 0, sources };
  }

  if (modeConfig.metric === 'beam') {
    // dps.beamProc is computed off the crit-weighted expected hit, so this metric reflects real Crit
    // Chance and Overload.
    const dps = computeDpsBreakdown(sources, mob, loadout, modeConfig.useDungeonizedStats, modeConfig.useMasterMode);
    return { value: dps.beamProc.finalDamage, sources };
  }

  // The hit-by-hit simulation only matters when something varies hit to hit: Execute/Prosecute or
  // Venomous. Without either, every iteration sees identical sources and the fight average equals
  // computeDpsBreakdown's steady number, so the 40x per-candidate cost is skipped.
  if (startingHp && (sources.executeProsecuteRate || sources.venomousProc)) {
    const sim = simulateHitByHit(
      sources,
      mob,
      loadout,
      startingHp,
      100,
      modeConfig.useDungeonizedStats,
      modeConfig.useMasterMode,
      MAX_VENOMOUS_STACKS,
      MAX_VENOMOUS_STACKS,
    );
    const totalDealt = sim.hits.reduce((sum, h) => sum + h.totalDamage, 0);
    return { value: sim.elapsedSeconds > 0 ? totalDealt / sim.elapsedSeconds : 0, sources };
  }

  const dps = computeDpsBreakdown(sources, mob, loadout, modeConfig.useDungeonizedStats, modeConfig.useMasterMode);
  return { value: dps.total, sources };
}

// The brute-force evaluators below never await I/O, so their loops would run as one long
// synchronous task and freeze the tab. Yielding on a real macrotask lets the browser paint and
// handle input between chunks.
const MAIN_THREAD_YIELD_INTERVAL_MS = 48;
let lastYieldAt = 0;
async function yieldToMainThread() {
  if (performance.now() - lastYieldAt < MAIN_THREAD_YIELD_INTERVAL_MS) return;
  lastYieldAt = performance.now();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

export async function computeModeDamage(loadout, itemData, build, modeConfig, mob) {
  await yieldToMainThread();
  return (await computeModeDamageAndSources(loadout, itemData, build, modeConfig, mob)).value;
}

// Shared by armor and equipment slots: identical shape, differing only in slot list, progression
// map and result category. A candidate carries over the equipped item's reforge, ultimate enchant,
// gemstones and recombobulator status, so the comparison is "same upgrades, different base item".
// Stars use the candidate's own max rather than the current count, normal enchants are left to
// their own evaluator, and rarityOverride (David's Cloak) compares at best case.
//
// Infernal Crimson's combo stacks need 2+ Infernal Crimson pieces and cap at 10. While the current
// loadout is below that threshold the player's stack slider carries no meaning, so a candidate that
// newly crosses it is evaluated at the mechanic's max. The baseline is never changed.
function withRealisticInfernalStacks(build, baselinePieces, candidateLoadout) {
  if (baselinePieces >= INFERNAL_CRIMSON_MIN_PIECES) return build;
  const candidatePieces = countSetPieces(candidateLoadout, ARMOR_SLOTS, INFERNAL_CRIMSON_SET);
  if (candidatePieces < INFERNAL_CRIMSON_MIN_PIECES) return build;
  return { ...build, infernalCrimsonStacks: INFERNAL_CRIMSON_MAX_STACKS };
}

// Gemstones carry over like reforge and recomb, but a candidate can have fewer sockets than the
// item it replaces, so carried gems are capped at the candidate's real slot count — otherwise the
// ranking counts a gem the candidate cannot hold.
function clipGemstonesToSlots(gemstones, resolved) {
  const slotCount = resolved?.gemstone_slots?.length || 0;
  return gemstones.slice(0, slotCount);
}

// Dungeon-mode candidates are compared with their Catacombs Boost applied: a candidate built from
// emptyModifiers() defaults to dungeonized:false and would otherwise lose the whole boost.
function withDungeonizedIfRelevant(modifiers, modeConfig) {
  if (modeConfig.useDungeonizedStats) modifiers.dungeonized = true;
  return modifiers;
}

// What of the equipped item's reforge and ultimate enchant the candidate can actually hold —
// selectItem drops both on a cross-family swap (Sword/Bow/Wand) or an item-exclusive reforge. The
// value and the apply steps both read this, so they cannot diverge. An unrecognised reforge name
// carries over unchanged.
export function carriedReforgeName(currentModifiers, item, itemData) {
  const name = currentModifiers?.reforge;
  if (!name) return null;
  const meta = itemData.reforges?.[name] || itemData.reforgeStones?.[name];
  if (!meta) return name;
  return isReforgeApplicable(meta, item) ? name : null;
}

export function carriedUltimateEnchantment(currentModifiers, item, itemData) {
  const ultimate = currentModifiers?.ultimateEnchantment;
  if (!ultimate?.id) return null;
  const ids = getCategoryEnchantIds(itemData.enchants, resolveEnchantCategory(item.category));
  const wanted = ultimate.id.toLowerCase();
  return ids.some((id) => id.toLowerCase() === wanted) ? ultimate : null;
}

async function evaluateItemSlotCandidates(loadout, itemData, build, modeConfig, mob, baselineValue, slots, progressionBySlot, category, mode) {
  if (!progressionBySlot) return [];
  const baselineInfernalPieces = countSetPieces(loadout, ARMOR_SLOTS, INFERNAL_CRIMSON_SET);
  const results = [];
  for (const slot of slots) {
    const progressionOrChains = progressionBySlot[slot];
    if (!progressionOrChains) continue;
    const currentModifiers = loadout[slot]?.modifiers;
    const currentItem = loadout[slot]?.item || null;
    const currentId = currentItem?.id || null;
    const slotResults = [];
    for (const progression of resolveChainsToWalk(progressionOrChains, currentId)) {
      const currentIndex = findTierIndex(progression, (c) => candidateCoversId(c, currentId));
      // Only a Kuudra-family piece restricts tier skipping: the next power tier unlocks once the
      // current tier's star cap is reached, so until then only that tier and its sidegrades are offered.
      let maxIndexOverride;
      let alwaysIncludeLastTier = false;
      const currentKuudraFamily =
        category === 'Armor' ? ARMOR_VARIANT_FAMILIES.find((family) => currentId?.includes(family)) || null : null;
      if (currentKuudraFamily) {
        const effectiveIndex = currentIndex === -1 ? 0 : currentIndex;
        const starsMaxed = currentIndex !== -1 && currentItem && (currentModifiers?.stars || 0) >= getMaxStarsForItem(currentItem);
        maxIndexOverride = starsMaxed ? effectiveIndex + 1 : effectiveIndex;
        // A chain's final tier can be independently obtainable (Diana's Challenger's/Mythos armor,
        // from the Mythological Ritual) rather than a Kuudra step. The no-skip rule applies within
        // the Kuudra family only, so that tier stays reachable from an early Kuudra tier.
        const lastTier = progression[progression.length - 1];
        alwaysIncludeLastTier = lastTier.some((c) => !ARMOR_VARIANT_FAMILIES.some((family) => c.id?.includes(family)));
      }
      const evaluateCandidate = async (candidate) => {
        // Frozen Blaze (Dungeon/Archer) is only a real sidegrade while a Blaze pet is equipped
        // (user-specified 2026-08-29) — any candidate can carry this gate, not just Frozen Blaze.
        if (candidate.requiresPetId && loadout.pet?.item?.petId !== candidate.requiresPetId) return null;
        const resolved = resolveGearSummary({ id: candidate.id }, itemData);
        if (!resolved) return null; // catalog lookup failed — skip rather than guess
        const modifiers = withDungeonizedIfRelevant(emptyModifiers(), modeConfig);
        if (candidate.special != null) modifiers.special = candidate.special;
        if (candidate.rarityOverride != null) modifiers.rarityOverride = candidate.rarityOverride;
        const carriedReforge = carriedReforgeName(currentModifiers, resolved, itemData);
        const carriedUltimate = carriedUltimateEnchantment(currentModifiers, resolved, itemData);
        if (carriedReforge) modifiers.reforge = carriedReforge;
        if (carriedUltimate) modifiers.ultimateEnchantment = carriedUltimate;
        // Same carry-over as reforge/ultimate enchant above, just missed when this evaluator was
        // first written — a candidate with real gemstones stripped off looked artificially worse
        // than the currently-equipped (gemmed) item, the exact same "understates the swap's true
        // value" bug stars had (user-confirmed 2026-08-23). Carried over, same as reforge/stars —
        // but clipped to the candidate's own real slot count (see clipGemstonesToSlots) rather
        // than blind, since a socket-count mismatch between old and new item can otherwise
        // overstate a candidate's value enough to flip a real downgrade into an apparent upgrade.
        if (currentModifiers?.gemstones?.length) modifiers.gemstones = clipGemstonesToSlots(currentModifiers.gemstones, resolved);
        if (currentModifiers?.recombobulated) modifiers.recombobulated = true;
        // The ranked value assumes a starrable candidate reaches its max stars, so a genuinely better
        // item at 0 stars isn't compared against a fully starred current item.
        const candidateMaxStars = isStarrableItem(resolved) ? getMaxStarsForItem(resolved) : 0;
        if (candidateMaxStars > 0) modifiers.stars = candidateMaxStars;
        const candidateLoadout = { ...loadout, [slot]: { item: resolved, modifiers } };
        const candidateBuild = withRealisticInfernalStacks(build, baselineInfernalPieces, candidateLoadout);
        const value = await computeModeDamage(candidateLoadout, itemData, candidateBuild, modeConfig, mob);
        // No star apply step: selectItem resets Kuudra armor to 0 stars and persists them otherwise.
        // Only the ranked value above needs the max-stars assumption.
        const apply = [{ type: 'selectItem', slot, item: resolved }];
        // Keeps the applied outcome matching what the ranked value assumed (withDungeonizedIfRelevant).
        if (modifiers.dungeonized) apply.push({ type: 'setDungeonized', slot, value: true });
        if (candidate.special != null) apply.push({ type: 'setSpecialValue', slot, value: candidate.special });
        if (candidate.rarityOverride != null) apply.push({ type: 'setRarityOverride', slot, tier: candidate.rarityOverride });
        if (carriedReforge) apply.push({ type: 'applyReforge', slot, name: carriedReforge });
        if (modifiers.gemstones.length) {
          modifiers.gemstones.forEach((g, index) => {
            if (g) apply.push({ type: 'setGemstone', slot, index, gem: g.gem, tier: g.tier });
          });
        }
        if (currentModifiers?.recombobulated) apply.push({ type: 'setRecombobulated', slot, value: true });
        if (carriedUltimate) {
          apply.push({
            type: 'applyEnchant',
            slot,
            id: carriedUltimate.id,
            level: carriedUltimate.level,
            maxLevel: carriedUltimate.maxLevel,
            removeIds: [],
          });
        }
        // A Kuudra tier-up is a craft that consumes the worn piece, so it is priced from its recipe
        // (Essence + Kuudra Teeth + coin fee) rather than the new tier's auction price. Which piece is
        // consumed is stashed for lib/pricing.js to price. Same-family swaps only — leaving the family
        // consumes nothing and is a plain purchase.
        const replaces =
          currentKuudraFamily && resolved.id !== currentId && resolved.id.includes(currentKuudraFamily)
            ? { itemId: currentId }
            : null;
        return {
          category,
          slot,
          label: candidate.label || formatItemName(resolved.name),
          itemId: resolved.id,
          material: resolved.material,
          special: candidate.special,
          value,
          replaces,
          apply,
        };
      };
      const evaluated = await evaluateTieredProgression(
        progression,
        currentIndex,
        (c) => c.id === currentId,
        baselineValue,
        evaluateCandidate,
        maxIndexOverride,
        alwaysIncludeLastTier,
      );
      slotResults.push(...evaluated);
      // Slayer only: the no-skip window covers Kuudra power tiers, but Warden, Primordial and Crown
      // of Avarice are separate helmets the Crimson chain lists as reference points. They are
      // evaluated from any Crimson tier, above or below, and kept only when they beat what is worn.
      // Applies from the chain's first Kuudra tier on: what precedes it (Tarantula Helmet) is the
      // route into Crimson, not an alternative to it. Duplicates are dropped by the dedupe below.
      if (mode === 'slayer' && currentKuudraFamily) {
        const isKuudra = (c) => ARMOR_VARIANT_FAMILIES.some((family) => c.id?.includes(family));
        const firstKuudraTier = progression.findIndex((tier) => tier.some(isKuudra));
        const tierLockExempt = progression.slice(Math.max(0, firstKuudraTier)).flat().filter((c) => !isKuudra(c));
        slotResults.push(...(await evaluateTieredProgression([tierLockExempt], -1, () => false, baselineValue, evaluateCandidate)));
      }
    }
    // Named chains share prefix tiers (every family's helmet chain starts at Tarantula Helmet, other
    // slots at Shadow Assassin -> Necron's Armor), so a shared step would be evaluated once per
    // matching chain. Deduped by item id plus special value, keeping Crown of Avarice's tiers apart.
    const seenKeys = new Set();
    for (const r of slotResults) {
      const key = `${r.itemId}:${r.special ?? ''}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      results.push(r);
    }
  }
  return results;
}

// Vanquished (Equipment), Final Destination (Armor) and Mythos'/Challenger's (Armor) only pay off
// with every piece worn (armorSetBonuses.js's hasFullSet), and swapping one piece at a time can lose
// damage outright by breaking the set bonus the removed piece was contributing. So each is a single
// candidate that swaps every slot at once, carrying over each slot's own reforge and ultimate
// enchant. Vanquished and Final Destination are offered in Slayer only, Mythos'/Challenger's in
// Diana only.
const FULL_SET_CANDIDATES = [
  {
    category: 'Full Set',
    label: 'Vanquished Equipment (Full Set)',
    slots: EQUIPMENT_SLOTS,
    idsBySlot: { necklace: 'VANQUISHED_MAGMA_NECKLACE', cloak: 'VANQUISHED_GHAST_CLOAK', belt: 'VANQUISHED_BLAZE_BELT', gloves: 'VANQUISHED_GLOWSTONE_GAUNTLET' },
    setIds: VANQUISHED_SET,
    slayerOnly: true,
  },
  {
    category: 'Full Set',
    label: 'Final Destination Armor (Full Set)',
    slots: ARMOR_SLOTS,
    idsBySlot: { helmet: 'FINAL_DESTINATION_HELMET', chestplate: 'FINAL_DESTINATION_CHESTPLATE', leggings: 'FINAL_DESTINATION_LEGGINGS', boots: 'FINAL_DESTINATION_BOOTS' },
    setIds: FINAL_DESTINATION_SET,
    slayerOnly: true,
  },
  {
    category: 'Full Set',
    label: "Challenger's Armor (Full Set)",
    slots: ARMOR_SLOTS,
    idsBySlot: { helmet: 'CHALLENGER_HELMET', chestplate: 'CHALLENGER_CHESTPLATE', leggings: 'CHALLENGER_LEGGINGS', boots: 'CHALLENGER_BOOTS' },
    setIds: CHALLENGER_ARMOR_SET,
    dianaOnly: true,
  },
  {
    category: 'Full Set',
    label: 'Mythos Armor (Full Set)',
    slots: ARMOR_SLOTS,
    idsBySlot: { helmet: 'MYTHOS_HELMET', chestplate: 'MYTHOS_CHESTPLATE', leggings: 'MYTHOS_LEGGINGS', boots: 'MYTHOS_BOOTS' },
    setIds: MYTHOS_ARMOR_SET,
    dianaOnly: true,
  },
];

// `mode` is the raw id rather than modeConfig, since 'diana' and 'slayer' resolve to an identical
// config: each set is restricted to the content that drops it.
async function evaluateFullSetCandidates(loadout, itemData, build, modeConfig, mob, mode) {
  const results = [];
  for (const set of FULL_SET_CANDIDATES) {
    if (set.dianaOnly && mode !== 'diana') continue;
    if (set.slayerOnly && mode !== 'slayer') continue;
    if (hasFullSet(loadout, set.slots, set.setIds)) continue; // already wearing it — nothing to suggest
    const candidateLoadout = { ...loadout };
    const apply = [];
    let allResolved = true;
    for (const slot of set.slots) {
      const resolved = resolveGearSummary({ id: set.idsBySlot[slot] }, itemData);
      if (!resolved) {
        allResolved = false;
        break;
      }
      const currentModifiers = loadout[slot]?.modifiers;
      const modifiers = withDungeonizedIfRelevant(emptyModifiers(), modeConfig);
      const carriedReforge = carriedReforgeName(currentModifiers, resolved, itemData);
      if (carriedReforge) modifiers.reforge = carriedReforge;
      const carriedUltimate = carriedUltimateEnchantment(currentModifiers, resolved, itemData);
      if (carriedUltimate) modifiers.ultimateEnchantment = carriedUltimate;
      // Clipped to the candidate's own slot count (clipGemstonesToSlots).
      if (currentModifiers?.gemstones?.length) modifiers.gemstones = clipGemstonesToSlots(currentModifiers.gemstones, resolved);
      if (currentModifiers?.recombobulated) modifiers.recombobulated = true;
      candidateLoadout[slot] = { item: resolved, modifiers };
      apply.push({ type: 'selectItem', slot, item: resolved });
      // Keeps the applied outcome matching the ranked value (withDungeonizedIfRelevant).
      if (modifiers.dungeonized) apply.push({ type: 'setDungeonized', slot, value: true });
      if (carriedReforge) apply.push({ type: 'applyReforge', slot, name: carriedReforge });
      if (modifiers.gemstones.length) {
        modifiers.gemstones.forEach((g, index) => {
          if (g) apply.push({ type: 'setGemstone', slot, index, gem: g.gem, tier: g.tier });
        });
      }
      if (currentModifiers?.recombobulated) apply.push({ type: 'setRecombobulated', slot, value: true });
      if (carriedUltimate) {
        apply.push({
          type: 'applyEnchant',
          slot,
          id: carriedUltimate.id,
          level: carriedUltimate.level,
          maxLevel: carriedUltimate.maxLevel,
          removeIds: [],
        });
      }
    }
    if (!allResolved) continue; // catalog lookup failed — skip rather than guess
    const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
    results.push({ category: set.category, slot: set.slots.join('/'), label: set.label, value, apply });
  }
  return results;
}

// Weapon choice: several independent chains (SLAYER_WEAPON_PROGRESSION) target the same 'weapon'
// slot, one per Slayer reward track. Once the current weapon is recognized in one chain only that
// chain is walked, so the tracks never cross-suggest; when it matches none, every chain is walked
// from tier 0. Same comparison and apply shape as evaluateItemSlotCandidates, without a slot-keyed
// progression map.
async function evaluateWeaponProgressionCandidates(loadout, itemData, build, modeConfig, mob, mode, baselineValue) {
  let chains = WEAPON_PROGRESSION_BY_MODE[mode];
  if (!chains) return [];
  if (mode === 'slayer') {
    const allowedKeys = new Set((mob?.types || []).flatMap((t) => SLAYER_MOB_TYPE_TO_WEAPON_CHAINS[t] || []));
    chains = Object.fromEntries(Object.entries(chains).filter(([key]) => allowedKeys.has(key)));
    if (Object.keys(chains).length === 0) return [];
  }
  const currentModifiers = loadout.weapon?.modifiers;
  const currentId = loadout.weapon?.item?.id || null;
  const results = [];
  for (const progression of resolveChainsToWalk(chains, currentId)) {
    const currentIndex = findTierIndex(progression, (c) => c.id === currentId);
    const evaluated = await evaluateTieredProgression(progression, currentIndex, (c) => c.id === currentId, baselineValue, async (candidate) => {
      const resolved = resolveGearSummary({ id: candidate.id }, itemData);
      if (!resolved) return null; // catalog lookup failed — skip rather than guess
      // Carries over the current weapon's reforge and ultimate enchant, as evaluateItemSlotCandidates
      // does. `forcedReforge` (Midas Sword's Gilded) replaces that carry-over with the item-exclusive
      // reforge. `special` gives the candidate its own best-case value (Midas Sword's Price Paid cap);
      // Daedalus Blade's 'bestiary' kind has no static value, so it reads
      // build.combinedMythologicalBestiaryTiers, capped at the item's own max.
      const modifiers = withDungeonizedIfRelevant(emptyModifiers(), modeConfig);
      // A forced reforge belongs to the candidate, so it applies by construction; a carried-over one
      // is checked against the new weapon (carriedReforgeName).
      const reforgeName = candidate.forcedReforge || carriedReforgeName(currentModifiers, resolved, itemData);
      if (reforgeName) modifiers.reforge = reforgeName;
      const bestiaryTiersConfig = getSpecialConfig(candidate.id);
      const specialValue =
        bestiaryTiersConfig?.kind === 'bestiary'
          ? Math.min(build.combinedMythologicalBestiaryTiers || 0, bestiaryTiersConfig.max)
          : candidate.special;
      if (specialValue != null) modifiers.special = specialValue;
      const carriedUltimate = carriedUltimateEnchantment(currentModifiers, resolved, itemData);
      if (carriedUltimate) modifiers.ultimateEnchantment = carriedUltimate;
      // Clipped to the candidate's own slot count (clipGemstonesToSlots).
      if (currentModifiers?.gemstones?.length) modifiers.gemstones = clipGemstonesToSlots(currentModifiers.gemstones, resolved);
      if (currentModifiers?.recombobulated) modifiers.recombobulated = true;
      // A starrable weapon candidate is ranked at its max stars, as evaluateItemSlotCandidates does.
      const candidateMaxStars = isStarrableItem(resolved) ? getMaxStarsForItem(resolved) : 0;
      if (candidateMaxStars > 0) modifiers.stars = candidateMaxStars;
      const candidateLoadout = { ...loadout, weapon: { item: resolved, modifiers } };
      const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
      // No star apply step: a weapon is never Kuudra armor, so selectItem persists the current stars,
      // clamped to the candidate's cap. Only the ranked value assumes max stars.
      const apply = [{ type: 'selectItem', slot: 'weapon', item: resolved }];
      // Keeps the applied outcome matching the ranked value (withDungeonizedIfRelevant).
      if (modifiers.dungeonized) apply.push({ type: 'setDungeonized', slot: 'weapon', value: true });
      if (reforgeName) apply.push({ type: 'applyReforge', slot: 'weapon', name: reforgeName });
      if (specialValue != null) apply.push({ type: 'setSpecialValue', slot: 'weapon', value: specialValue });
      if (modifiers.gemstones.length) {
        modifiers.gemstones.forEach((g, index) => {
          if (g) apply.push({ type: 'setGemstone', slot: 'weapon', index, gem: g.gem, tier: g.tier });
        });
      }
      if (currentModifiers?.recombobulated) apply.push({ type: 'setRecombobulated', slot: 'weapon', value: true });
      if (carriedUltimate) {
        apply.push({
          type: 'applyEnchant',
          slot: 'weapon',
          id: carriedUltimate.id,
          level: carriedUltimate.level,
          maxLevel: carriedUltimate.maxLevel,
          removeIds: [],
        });
      }
      return {
        category: 'Weapon',
        slot: 'weapon',
        label: formatItemName(resolved.name),
        itemId: resolved.id,
        material: resolved.material,
        special: specialValue,
        value,
        apply,
      };
    });
    results.push(...evaluated);
  }
  return results;
}

// Pet candidates are compared at max rarity and max level. Golden Dragon's Legendary Treasure and
// Shining Scales are the exception: they scale off the account's bank balance and Gold collection,
// so the imported values are used, falling back to 0/0 without an import.
async function evaluatePetCandidates(loadout, itemData, build, modeConfig, mob, mode, baselineValue) {
  const progression = PET_PROGRESSION_BY_MODE[mode];
  if (!progression) return [];
  const currentPetId = loadout.pet?.item?.petId || null;
  const currentIndex = findTierIndex(progression, (c) => c.petId === currentPetId);
  return evaluateTieredProgression(progression, currentIndex, (c) => c.petId === currentPetId, baselineValue, async (candidate) => {
    const petCatalog = itemData.pets?.[candidate.petId];
    if (!petCatalog) return null; // catalog lookup failed — skip rather than guess
    const tiers = Object.keys(petCatalog);
    const tier = tiers.includes('LEGENDARY') ? 'LEGENDARY' : tiers[tiers.length - 1];
    const petItem = { id: `${candidate.petId}_${tier}`, petId: candidate.petId, name: derivePetDisplayName(candidate.petId), tier, material: 'BONE' };
    const carriedBankCoins = loadout.pet?.modifiers?.bankCoins || 0;
    const carriedGoldCollection = loadout.pet?.modifiers?.goldCollection || 0;
    const candidateLoadout = {
      ...loadout,
      pet: {
        item: petItem,
        modifiers: {
          ...emptyPetModifiers(),
          level: getMaxPetLevel(candidate.petId),
          petItem: loadout.pet?.modifiers?.petItem || null,
          bankCoins: carriedBankCoins,
          goldCollection: carriedGoldCollection,
        },
      },
    };
    const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
    // Golden Dragon draws its strength from account state, so it gets two rows: this one at the
    // player's real bank and gold, and evaluateMaxGoldenDragonCandidate's at the ceiling. The apply
    // steps pin those values, since selectItem hands a freshly picked Golden Dragon maxed ones.
    const isGoldenDragon = candidate.petId === 'GOLDEN_DRAGON';
    return {
      category: 'Pet',
      slot: 'pet',
      label: isGoldenDragon
        ? `${derivePetDisplayName(candidate.petId)} [Uses your Bank and Gold]`
        : `${derivePetDisplayName(candidate.petId)} (${tier})`,
      itemId: candidate.petId,
      material: 'BONE',
      value,
      apply: [
        { type: 'selectItem', slot: 'pet', item: petItem },
        ...(isGoldenDragon
          ? [
              { type: 'setPetBankCoins', slot: 'pet', value: carriedBankCoins },
              { type: 'setPetGoldCollection', slot: 'pet', value: carriedGoldCollection },
            ]
          : []),
      ],
    };
  });
}

// The second Golden Dragon row: the same pet with bank balance and Gold collection maxed, offered in
// every mode. Deliberately unpriced — banking a billion coins isn't a purchase.
async function evaluateMaxGoldenDragonCandidate(loadout, itemData, build, modeConfig, mob, baselineValue) {
  const petCatalog = itemData.pets?.GOLDEN_DRAGON;
  if (!petCatalog) return [];
  const tiers = Object.keys(petCatalog);
  const tier = tiers.includes('LEGENDARY') ? 'LEGENDARY' : tiers[tiers.length - 1];
  const petItem = {
    id: `GOLDEN_DRAGON_${tier}`,
    petId: 'GOLDEN_DRAGON',
    name: derivePetDisplayName('GOLDEN_DRAGON'),
    tier,
    material: 'BONE',
  };
  const modifiers = {
    ...emptyPetModifiers(),
    level: getMaxPetLevel('GOLDEN_DRAGON'),
    petItem: loadout.pet?.modifiers?.petItem || null,
    bankCoins: MAX_GOLDEN_DRAGON_BANK_COINS,
    goldCollection: SHINING_SCALES_MAX_GOLD_COLLECTION,
  };
  const value = await computeModeDamage({ ...loadout, pet: { item: petItem, modifiers } }, itemData, build, modeConfig, mob);
  const percentIncrease = baselineValue > 0 ? ((value - baselineValue) / baselineValue) * 100 : value * 100;
  if (!(percentIncrease > 0.001)) return [];
  return [
    {
      category: 'Pet',
      slot: 'pet',
      label: `${derivePetDisplayName('GOLDEN_DRAGON')} [Max]`,
      itemId: 'GOLDEN_DRAGON',
      material: 'BONE',
      value,
      percentIncrease,
      unpriced: true,
      apply: [
        { type: 'selectItem', slot: 'pet', item: petItem },
        { type: 'setPetBankCoins', slot: 'pet', value: MAX_GOLDEN_DRAGON_BANK_COINS },
        { type: 'setPetGoldCollection', slot: 'pet', value: SHINING_SCALES_MAX_GOLD_COLLECTION },
      ],
    },
  ];
}

// Brute-forces the next level of each enchant already on the weapon. Enchants that aren't equipped
// are left to the evaluators below, since enchant-slot availability isn't modeled.
async function evaluateEnchantCandidates(loadout, itemData, build, modeConfig, mob) {
  const weapon = loadout.weapon;
  if (!weapon) return [];
  const results = [];
  for (const enchant of weapon.modifiers.hexEnchantments || []) {
    const levels = await fetchEnchantLevels(enchant.id, itemData.enchants);
    if (levels.length === 0) continue;
    const maxLevel = Math.max(...levels.map((l) => l.level));
    if (enchant.level >= maxLevel) continue;
    const nextLevel = enchant.level + 1;
    const newEnchants = (weapon.modifiers.hexEnchantments || []).map((e) =>
      e.id === enchant.id ? { ...e, level: nextLevel, maxLevel } : e,
    );
    const candidateLoadout = { ...loadout, weapon: { ...weapon, modifiers: { ...weapon.modifiers, hexEnchantments: newEnchants } } };
    const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
    results.push({
      category: 'Enchant',
      slot: 'weapon',
      label: `${titleCaseEnchantId(enchant.id)} ${toRoman(nextLevel)}`,
      value,
      apply: [{ type: 'applyEnchant', slot: 'weapon', id: enchant.id, level: nextLevel, maxLevel, removeIds: [] }],
    });
  }
  return results;
}

// Recommends a type-bane enchant (Smite/Ender Slayer/Bane of Arthropods/Smoldering/Cubism/Impaling/
// Arcane — mobTypes.js's ENCHANT_ID_MOB_TYPES) that isn't equipped and whose mob-type condition
// matches the target. Separate from evaluateMissingEnchantCandidates below because only the one bane
// relevant to the target is offered. Recommended at the enchant's own max level.
async function evaluateMissingTypeBaneEnchantCandidates(loadout, itemData, build, modeConfig, mob) {
  const weapon = loadout.weapon;
  if (!weapon || !mob?.types?.length) return [];
  const category = resolveEnchantCategory(weapon.item.category);
  const categoryIds = new Set(getCategoryEnchantIds(itemData.enchants, category).map((id) => id.toLowerCase()));
  const equippedIds = new Set((weapon.modifiers.hexEnchantments || []).map((e) => e.id.toLowerCase()));
  const results = [];
  for (const [id, types] of Object.entries(ENCHANT_ID_MOB_TYPES)) {
    if (equippedIds.has(id) || !categoryIds.has(id) || !types.some((t) => mob.types.includes(t))) continue;
    const levels = await fetchEnchantLevels(id, itemData.enchants);
    if (levels.length === 0) continue;
    const maxLevel = Math.max(...levels.map((l) => l.level));
    const removeIds = computeConflictingEntries(id, weapon.item.lore, weapon.modifiers).map((e) => e.id);
    const newEnchants = [
      ...(weapon.modifiers.hexEnchantments || []).filter((e) => !removeIds.includes(e.id)),
      { id, level: maxLevel },
    ];
    // computeConflictingEntries includes One For All's own id when it is the current ultimate, so the
    // ultimate slot is cleared here too: filtering hexEnchantments alone would leave its +500% stacked
    // with the new enchant, which the game doesn't allow.
    const ultimateEnchantment =
      weapon.modifiers.ultimateEnchantment && removeIds.includes(weapon.modifiers.ultimateEnchantment.id)
        ? null
        : weapon.modifiers.ultimateEnchantment;
    const candidateLoadout = {
      ...loadout,
      weapon: { ...weapon, modifiers: { ...weapon.modifiers, hexEnchantments: newEnchants, ultimateEnchantment } },
    };
    const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
    results.push({
      category: 'Enchant',
      slot: 'weapon',
      label: `${titleCaseEnchantId(id)} ${toRoman(maxLevel)}`,
      value,
      apply: [{ type: 'applyEnchant', slot: 'weapon', id, level: maxLevel, maxLevel, removeIds }],
    });
  }
  return results;
}

// Recommends any other unequipped hex enchant applicable to the weapon's category, excluding the
// type-banes above. No curated "good ones" list: every candidate is measured against the pipeline, so
// an irrelevant one computes no gain and is filtered downstream. Conflicts come from real lore,
// including One For All's removal when it is the current ultimate.
async function evaluateMissingEnchantCandidates(loadout, itemData, build, modeConfig, mob) {
  const weapon = loadout.weapon;
  if (!weapon) return [];
  const category = resolveEnchantCategory(weapon.item.category);
  const equippedIds = new Set((weapon.modifiers.hexEnchantments || []).map((e) => e.id.toLowerCase()));
  const baneIds = new Set(Object.keys(ENCHANT_ID_MOB_TYPES));
  const candidateIds = getCategoryEnchantIds(itemData.enchants, category).filter(
    (id) => !isUltimateEnchant(id) && !equippedIds.has(id.toLowerCase()) && !baneIds.has(id.toLowerCase()),
  );

  const results = [];
  for (const id of candidateIds) {
    const levels = await fetchEnchantLevels(id, itemData.enchants);
    if (levels.length === 0) continue;
    const maxLevel = Math.max(...levels.map((l) => l.level));
    const levelData = levels.find((l) => l.level === maxLevel);
    const removeIds = computeConflictingEntries(id, levelData.lore, weapon.modifiers).map((e) => e.id);
    const newEnchants = [
      ...(weapon.modifiers.hexEnchantments || []).filter((e) => !removeIds.includes(e.id)),
      { id, level: maxLevel },
    ];
    // Clears One For All as the bane evaluator does: removeIds carries its id, but the ultimate slot
    // needs clearing separately.
    const ultimateEnchantment =
      weapon.modifiers.ultimateEnchantment && removeIds.includes(weapon.modifiers.ultimateEnchantment.id)
        ? null
        : weapon.modifiers.ultimateEnchantment;
    const candidateLoadout = {
      ...loadout,
      weapon: { ...weapon, modifiers: { ...weapon.modifiers, hexEnchantments: newEnchants, ultimateEnchantment } },
    };
    const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
    results.push({
      category: 'Enchant',
      slot: 'weapon',
      label: `${titleCaseEnchantId(id)} ${toRoman(maxLevel)}`,
      value,
      apply: [{ type: 'applyEnchant', slot: 'weapon', id, level: maxLevel, maxLevel, removeIds }],
    });
  }
  return results;
}

// One For All's flat +500% weapon damage beats any single enchant swap, so the incremental
// evaluators above can never displace it: dropping it to add one enchant is always a loss, even when
// a full enchant loadout would win. This finds the cheapest loadout that does win:
//  1. Rank every priced enchant applicable to this weapon (hex enchants + non-OFA ultimates) by
//     standalone %DPS per coin from a bare baseline. The ordering is a heuristic, not load-bearing.
//  2. Add them most-efficient-first, resolving each addition's "Conflicts:" lore against what is
//     already picked and re-measuring the cumulative total against the pipeline after each addition —
//     never assumed additive, since some enchants land in a multiplicative bucket.
//  3. Stop as soon as the total crosses One For All's value, keeping the cheapest crossing found.
// Approximate rather than provably cheapest. Runs only when One For All is the weapon's current
// ultimate, and for every metric except 'ability', where One For All contributes nothing.
async function evaluateCheapestOneForAllAlternative(loadout, itemData, build, modeConfig, mob, baselineValue) {
  const weapon = loadout.weapon;
  if (!weapon || modeConfig.metric === 'ability') return [];
  if ((weapon.modifiers.ultimateEnchantment?.id || '').toLowerCase() !== 'ultimate_one_for_all') return [];

  const category = resolveEnchantCategory(weapon.item.category);
  const allIds = getCategoryEnchantIds(itemData.enchants, category);
  const itemPrices = itemData.costs?.itemPrices || {};

  // Bare reference: no ultimate, no hex enchants, so every candidate is measured on a common basis.
  const bareModifiers = { ...weapon.modifiers, ultimateEnchantment: null, hexEnchantments: [] };
  const bareValue = await computeModeDamage({ ...loadout, weapon: { ...weapon, modifiers: bareModifiers } }, itemData, build, modeConfig, mob);

  // Applies one pick (id + level, hex or ultimate) to `modifiers`, resolving "Conflicts:" lore and
  // stripping any existing entry for the same id — a paid level replaces that id's free pick rather
  // than stacking with it.
  function applyPick(modifiers, pick) {
    const removeIds = computeConflictingEntries(pick.id, pick.lore, modifiers).map((e) => e.id);
    const hexEnchantments = pick.isUltimate
      ? modifiers.hexEnchantments.filter((e) => !removeIds.includes(e.id))
      : [...modifiers.hexEnchantments.filter((e) => !removeIds.includes(e.id) && e.id !== pick.id), { id: pick.id, level: pick.level, maxLevel: pick.maxLevel }];
    const ultimateEnchantment = pick.isUltimate
      ? { id: pick.id, level: pick.level, maxLevel: pick.maxLevel }
      : modifiers.ultimateEnchantment && removeIds.includes(modifiers.ultimateEnchantment.id)
        ? null
        : modifiers.ultimateEnchantment;
    return { ...modifiers, hexEnchantments, ultimateEnchantment };
  }

  // Phase 1: every level of every id, tested once against the bare baseline rather than max level
  // only — a top level can cost far more for barely more damage.
  const perIdLevels = new Map();
  for (const id of allIds) {
    if (id.toLowerCase() === 'ultimate_one_for_all') continue;
    // Combo is never recommended: its value depends on a per-fight kill streak this app has no fixed
    // assumption for.
    if (id.toLowerCase() === 'ultimate_combo') continue;
    const levels = await fetchEnchantLevels(id, itemData.enchants);
    if (levels.length === 0) continue;
    const maxLevel = Math.max(...levels.map((l) => l.level));
    const isUltimate = isUltimateEnchant(id);

    // A level with no market price is treated as free rather than excluded. Per-level effects only
    // grow, so only the highest free level is worth testing; every paid level is tested on its own.
    const priced = levels.map((l) => ({ ...l, cost: enchantPrice(itemPrices, id, l.level) }));
    const freeLevels = priced.filter((l) => l.cost == null);
    const highestFree = freeLevels.length > 0 ? freeLevels.reduce((a, b) => (b.level > a.level ? b : a)) : null;
    const testLevels = [...(highestFree ? [highestFree] : []), ...priced.filter((l) => l.cost != null)];

    const results = [];
    for (const levelData of testLevels) {
      const level = levelData.level;
      const testModifiers = {
        ...bareModifiers,
        ultimateEnchantment: isUltimate ? { id, level, maxLevel } : null,
        hexEnchantments: isUltimate ? [] : [{ id, level, maxLevel }],
      };
      const value = await computeModeDamage({ ...loadout, weapon: { ...weapon, modifiers: testModifiers } }, itemData, build, modeConfig, mob);
      const marginal = value - bareValue;
      if (marginal <= 0) continue;
      results.push({ id, level, maxLevel, cost: levelData.cost, marginal, lore: levelData.lore, isUltimate });
    }
    if (results.length > 0) perIdLevels.set(id, results);
  }

  // Phase 2: each id's free tier is taken unconditionally when it adds value, before the paid ranking
  // — otherwise a free level's unbounded efficiency crowds out the paid levels that carry the real
  // gains.
  let currentModifiers = bareModifiers;
  let currentValue = bareValue;
  for (const [id, results] of perIdLevels) {
    const free = results.find((r) => r.cost == null);
    if (!free) continue;
    currentModifiers = applyPick(currentModifiers, free);
    currentValue = await computeModeDamage({ ...loadout, weapon: { ...weapon, modifiers: currentModifiers } }, itemData, build, modeConfig, mob);
  }

  // Phase 3: priced levels compete on cost-efficiency, measured as the increment over the same id's
  // free tier from phase 2, since a paid level replaces that pick rather than stacking with it.
  const paidCandidates = [];
  for (const [id, results] of perIdLevels) {
    const freeMarginal = Math.max(0, ...results.filter((r) => r.cost == null).map((r) => r.marginal));
    let best = null;
    for (const r of results) {
      if (r.cost == null) continue;
      const incremental = r.marginal - freeMarginal;
      if (incremental <= 0) continue; // this paid level isn't even better than what's already free
      const efficiency = incremental / r.cost;
      if (!best || efficiency > best.efficiency) best = { ...r, efficiency };
    }
    if (best) paidCandidates.push(best);
  }
  paidCandidates.sort((a, b) => b.efficiency - a.efficiency);

  for (const c of paidCandidates) {
    if (currentValue > baselineValue) break;
    currentModifiers = applyPick(currentModifiers, c);
    currentValue = await computeModeDamage({ ...loadout, weapon: { ...weapon, modifiers: currentModifiers } }, itemData, build, modeConfig, mob);
  }

  // Phase 4: each id was collapsed to one best-efficiency level above, so a further upgrade of an id
  // already picked (Sharpness VII after VI) never got a second look. Offers each picked id's next
  // level, tested against the current state so interactions with the other picks are reflected,
  // until the threshold is crossed or no id has a further upgrade.
  let progressed = currentValue <= baselineValue;
  while (currentValue <= baselineValue && progressed) {
    progressed = false;
    let bestUpgrade = null;
    for (const [id, results] of perIdLevels) {
      const currentEntry =
        currentModifiers.ultimateEnchantment?.id === id ? currentModifiers.ultimateEnchantment : currentModifiers.hexEnchantments.find((e) => e.id === id);
      const currentLevel = currentEntry?.level ?? 0;
      for (const r of results) {
        if (r.level <= currentLevel || r.cost == null) continue; // not a further upgrade, or already covered as free
        const testModifiers = applyPick(currentModifiers, r);
        const value = await computeModeDamage({ ...loadout, weapon: { ...weapon, modifiers: testModifiers } }, itemData, build, modeConfig, mob);
        const gain = value - currentValue;
        if (gain <= 0) continue;
        const efficiency = gain / r.cost;
        if (!bestUpgrade || efficiency > bestUpgrade.efficiency) bestUpgrade = { testModifiers, value, efficiency };
      }
    }
    if (bestUpgrade) {
      currentModifiers = bestUpgrade.testModifiers;
      currentValue = bestUpgrade.value;
      progressed = true;
    }
  }

  if (currentValue <= baselineValue) return []; // exhausted every real candidate — nothing beats it here

  // Rebuilt from the final winning state rather than the walk's history, so a pick later removed by
  // a conflict leaves no stale entry. Only the first step clears One For All; the final picks are
  // mutually non-conflicting by construction.
  const finalEntries = [...(currentModifiers.ultimateEnchantment ? [currentModifiers.ultimateEnchantment] : []), ...currentModifiers.hexEnchantments];
  const labels = finalEntries.map((e) => `${titleCaseEnchantId(e.id)} ${toRoman(e.level)}`);
  const applySteps = finalEntries.map((e, i) => ({
    type: 'applyEnchant',
    slot: 'weapon',
    id: e.id,
    level: e.level,
    maxLevel: e.maxLevel,
    removeIds: i === 0 ? ['ultimate_one_for_all'] : [],
  }));

  return [
    {
      category: 'Enchant Set',
      slot: 'weapon',
      label: `Re-enchant instead of One For All (${labels.length}): ${labels.join(', ')}`,
      value: currentValue,
      apply: applySteps,
    },
  ];
}

// Brute-forces every ultimate enchant applicable to the weapon's category, at its max level, as an
// alternative to the equipped one. Removes whatever computeConflictingEntries says the item would
// lose — most importantly One For All's "removes every other enchant" rule, which both the damage
// number and the swap-in action's removeIds depend on.
async function evaluateUltimateEnchantCandidates(loadout, itemData, build, modeConfig, mob, mode) {
  const weapon = loadout.weapon;
  if (!weapon) return [];
  const category = resolveEnchantCategory(weapon.item.category);
  const ids = getCategoryEnchantIds(itemData.enchants, category).filter(isUltimateEnchant);
  const currentId = weapon.modifiers.ultimateEnchantment?.id?.toLowerCase() || null;
  const results = [];
  for (const id of ids) {
    if (id.toLowerCase() === currentId) continue;
    // One For All is never recommended for Diana.
    if (mode === 'diana' && id.toLowerCase() === 'ultimate_one_for_all') continue;
    // Combo is never recommended in any mode: its value depends on a per-fight kill streak this app
    // has no fixed assumption for.
    if (id.toLowerCase() === 'ultimate_combo') continue;
    const levels = await fetchEnchantLevels(id, itemData.enchants);
    if (levels.length === 0) continue;
    const maxLevel = Math.max(...levels.map((l) => l.level));
    const removeIds = computeConflictingEntries(id, weapon.item.lore, weapon.modifiers).map((e) => e.id);
    const candidateLoadout = {
      ...loadout,
      weapon: {
        ...weapon,
        modifiers: {
          ...weapon.modifiers,
          ultimateEnchantment: { id, level: maxLevel, maxLevel },
          hexEnchantments: (weapon.modifiers.hexEnchantments || []).filter((e) => !removeIds.includes(e.id)),
        },
      },
    };
    const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
    results.push({
      category: 'Ultimate Enchant',
      slot: 'weapon',
      label: `${titleCaseEnchantId(id)} ${toRoman(maxLevel)}`,
      value,
      apply: [{ type: 'applyEnchant', slot: 'weapon', id, level: maxLevel, maxLevel, removeIds }],
    });
  }
  return results;
}

// The same brute force as evaluateUltimateEnchantCandidates, for equipment (Necklace/Cloak/Belt/
// Gloves) rather than the weapon. Covers every equipment ultimate enchant, not just "The One".
async function evaluateEquipmentUltimateEnchantCandidates(loadout, itemData, build, modeConfig, mob) {
  const results = [];
  for (const slot of EQUIPMENT_SLOTS) {
    const equipped = loadout[slot];
    if (!equipped?.item) continue;
    const category = resolveEnchantCategory(equipped.item.category);
    const ids = getCategoryEnchantIds(itemData.enchants, category).filter(isUltimateEnchant);
    const currentId = equipped.modifiers.ultimateEnchantment?.id?.toLowerCase() || null;
    for (const id of ids) {
      if (id.toLowerCase() === currentId) continue;
      const levels = await fetchEnchantLevels(id, itemData.enchants);
      if (levels.length === 0) continue;
      const maxLevel = Math.max(...levels.map((l) => l.level));
      const removeIds = computeConflictingEntries(id, equipped.item.lore, equipped.modifiers).map((e) => e.id);
      const candidateLoadout = {
        ...loadout,
        [slot]: {
          ...equipped,
          modifiers: {
            ...equipped.modifiers,
            ultimateEnchantment: { id, level: maxLevel, maxLevel },
            hexEnchantments: (equipped.modifiers.hexEnchantments || []).filter((e) => !removeIds.includes(e.id)),
          },
        },
      };
      const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
      results.push({
        category: 'Ultimate Enchant',
        slot,
        label: `${titleCaseEnchantId(id)} ${toRoman(maxLevel)}`,
        value,
        apply: [{ type: 'applyEnchant', slot, id, level: maxLevel, maxLevel, removeIds }],
      });
    }
  }
  return results;
}

// Slayer considers only these 7 Power Stones; every other one is excluded from the pool rather than
// ranked low, as evaluateGemstoneCandidates' RELEVANT_GEMS_BY_METRIC does. They are sidegrades, so
// the flat brute force below needs no tier structure.
const SLAYER_POWER_STONE_IDS = new Set(['BLOODY', 'ITCHY', 'SCORCHING', 'SHADED', 'SILKY', 'STRONG', 'HURTFUL']);

// Brute-forces every Power Stone (lib/accessoryPowers.js's STONE_POWERS) against the selected one,
// narrowed to SLAYER_POWER_STONE_IDS for Slayer and Diana.
const POWER_STONE_RESTRICTED_MODES = new Set(['slayer', 'diana']);
async function evaluatePowerStoneCandidates(loadout, itemData, build, modeConfig, mob, mode) {
  if (!loadout.accessory?.item) return [];
  const currentId = loadout.accessory.item.id;
  // DEFAULT_POWERS (Fortuitous, Warrior, the Intermediate tier) need no stone and are always in the
  // pool, including in the modes whose stone list is narrowed.
  const candidatePowers = POWER_STONE_RESTRICTED_MODES.has(mode)
    ? [...DEFAULT_POWERS, ...STONE_POWERS.filter((p) => SLAYER_POWER_STONE_IDS.has(p.id))]
    : [...DEFAULT_POWERS, ...STONE_POWERS];
  const results = [];
  for (const power of candidatePowers) {
    if (power.id === currentId) continue;
    // Same {id, name, iconId, material} shape AccessoryPowerPicker.jsx's own selectItem call uses.
    const powerItem = { id: power.id, name: power.name, iconId: power.sourceItemId || null, material: power.sourceItemId ? 'SKULL' : 'BOOK' };
    const candidateLoadout = { ...loadout, accessory: { ...loadout.accessory, item: { ...loadout.accessory.item, id: power.id, name: power.name } } };
    const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
    results.push({
      category: 'Power Stone',
      slot: 'accessory',
      label: power.name,
      itemId: power.sourceItemId || null,
      material: power.sourceItemId ? 'SKULL' : 'BOOK',
      value,
      apply: [{ type: 'selectItem', slot: 'accessory', item: powerItem }],
    });
  }
  return results;
}

// Every Crimson armor power tier (Basic/Hot/Burning/Fiery/Infernal), 5 tiers x 4 pieces. Crimson's
// 10/15-star range is a per-star grind, so it is starred one level at a time below rather than
// jumped to max.
const CRIMSON_ARMOR_RE = /^(?:INFERNAL_|HOT_|BURNING_|FIERY_)?CRIMSON_(?:HELMET|CHESTPLATE|LEGGINGS|BOOTS)$/;

// Brute-forces starring the weapon and every equipped armor piece up to its max (lib/starring.js's
// getMaxStarsForItem). Non-Crimson items get a single jump-to-max suggestion; Crimson armor gets
// only the immediate next star, matching its one-tier-at-a-time progression.
async function evaluateStarsCandidates(loadout, itemData, build, modeConfig, mob) {
  const results = [];
  for (const slot of ['weapon', ...ARMOR_SLOTS]) {
    const equipped = loadout[slot];
    if (!equipped?.item) continue;
    const maxStars = getMaxStarsForItem(equipped.item);
    const currentStars = equipped.modifiers.stars || 0;
    if (currentStars >= maxStars) continue;
    const starLevels = CRIMSON_ARMOR_RE.test(equipped.item.id) ? [currentStars + 1] : [maxStars];
    for (const stars of starLevels) {
      const candidateLoadout = { ...loadout, [slot]: { ...equipped, modifiers: { ...equipped.modifiers, stars } } };
      const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
      results.push({
        category: 'Stars',
        slot,
        label: `${formatItemName(equipped.item.name)} — ${stars}✩`,
        // Per-item id, so lib/pricing.js can look up the cumulative star cost without the loadout.
        itemId: equipped.item.id,
        value,
        apply: [{ type: 'setStarCount', slot, count: stars }],
      });
    }
  }
  return results;
}

// Master Stars: Catacombs-only, unlocked per piece at 5 base stars (MASTER_STAR_MIN_BASE_STARS) and
// capped at 5, offered one at a time.
// They only pay out while Master Mode is on (lib/finalDamage.js's selectBaseStats), so candidates
// are valued with Master Mode forced on and measured against runOptimizer's matching
// `masterModeBaselineValue` — a non-Master baseline would credit one star with the whole mode's boost.
async function evaluateMasterStarsCandidates(loadout, itemData, build, modeConfig, mob) {
  if (!modeConfig.useDungeonizedStats) return [];
  const masterConfig = { ...modeConfig, useMasterMode: true };
  const results = [];
  // Weapon and equipment take Master Stars exactly as armour does: isStarrableItem accepts any
  // DUNGEON category and MASTER_STAR_MIN_BASE_STARS isn't armour-restricted, so only this slot list
  // decides which slots are offered them.
  for (const slot of ['weapon', ...ARMOR_SLOTS, ...EQUIPMENT_SLOTS]) {
    const equipped = loadout[slot];
    if (!equipped?.item || !isStarrableItem(equipped.item)) continue;
    // Master Stars exist only on a dungeonized copy — lib/itemStatTotals.js computes a masterStarred
    // total only when the item's dungeonized flag is set.
    if (!equipped.modifiers.dungeonized) continue;
    if ((equipped.modifiers.stars || 0) < MASTER_STAR_MIN_BASE_STARS) continue;
    const currentMasterStars = equipped.modifiers.masterStars || 0;
    if (currentMasterStars >= MAX_MASTER_STARS) continue;
    const masterStars = currentMasterStars + 1;
    const candidateLoadout = { ...loadout, [slot]: { ...equipped, modifiers: { ...equipped.modifiers, masterStars } } };
    const value = await computeModeDamage(candidateLoadout, itemData, build, masterConfig, mob);
    results.push({
      category: 'Master Stars',
      slot,
      label: `${formatItemName(equipped.item.name)} — Master Star ${masterStars}`,
      itemId: equipped.item.id,
      value,
      apply: [{ type: 'setMasterStarCount', slot, count: masterStars }],
    });
  }
  return results;
}

// Pet Items: brute-forced against the full catalog (worker/src/data/petItems.json). No relevance
// allowlist is needed — lib/petItemEffects.js's parsePetItemStatBoost reads combat-stat boosts from
// lore, so an XP or cosmetic item computes no increase and is filtered out below.
async function evaluatePetItemCandidates(loadout, itemData, build, modeConfig, mob) {
  const pet = loadout.pet;
  if (!pet?.item) return [];
  const currentPetItemId = pet.modifiers?.petItem || null;
  const results = [];
  for (const petItem of itemData.petItems || []) {
    if (petItem.id === currentPetItemId) continue;
    const candidateLoadout = { ...loadout, pet: { ...pet, modifiers: { ...pet.modifiers, petItem: petItem.id } } };
    const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
    results.push({
      category: 'Pet Item',
      slot: 'pet',
      label: `${derivePetDisplayName(pet.item.petId)} — ${formatItemName(petItem.name)}`,
      itemId: petItem.id,
      material: petItem.material,
      value,
      apply: [{ type: 'setPetItem', slot: 'pet', petItemId: petItem.id }],
    });
  }
  return results;
}

// Armor reforges: a curated worst -> best progression (Pure/Fierce -> Renowned/Ancient), names and
// itemTypes from NEU-REPO's reforges.json and reforgestones.json. Equipment and weapon reforges are
// brute-forced instead, since their applicable sets differ per item and have no single order.
const ARMOR_REFORGE_PROGRESSION = [
  [{ name: 'Pure' }, { name: 'Fierce' }],
  [{ name: 'Renowned' }, { name: 'Ancient' }],
];

// A reforge changes the equipped item rather than swapping it, so results go to `otherResults`
// rather than the per-slot gear picker — same as Stars below.
async function evaluateArmorReforgeCandidates(loadout, itemData, build, modeConfig, mob, baselineValue) {
  const results = [];
  for (const slot of ARMOR_SLOTS) {
    const equipped = loadout[slot];
    if (!equipped?.item) continue;
    const currentName = equipped.modifiers.reforge || null;
    const currentIndex = findTierIndex(ARMOR_REFORGE_PROGRESSION, (c) => c.name === currentName);
    const evaluated = await evaluateTieredProgression(
      ARMOR_REFORGE_PROGRESSION,
      currentIndex,
      (c) => c.name === currentName,
      baselineValue,
      async (candidate) => {
        const candidateLoadout = { ...loadout, [slot]: { ...equipped, modifiers: { ...equipped.modifiers, reforge: candidate.name } } };
        const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
        return {
          category: 'Reforge',
          slot,
          label: `${formatItemName(equipped.item.name)} — ${candidate.name}`,
          value,
          apply: [{ type: 'applyReforge', slot, name: candidate.name }],
        };
      },
    );
    results.push(...evaluated);
  }
  return results;
}

// Weapon and equipment reforges: brute-forced against the full catalog (NEU-REPO's reforges.json +
// reforgestones.json, ~130 entries) via getApplicableReforges. Percent increase comes from
// runOptimizer's withPercent rather than being computed here, unlike armor's tiered walk above.
// Fabled's bonus is a random range ("up to +15% extra damage" on crits) rather than a fixed number,
// so a ranked comparison uses its midpoint: a 1.075x multiplier on the 0%-boost value.
const FABLED_MIDPOINT_MULTIPLIER = 1 + FABLED_CRIT_BONUS_MAX_PERCENT / 100 / 2;

// ...and only where a melee hit is measured. Fabled rides on critical hits, so it reaches the 'dps'
// metric directly and 'beam' proportionally (beam scales off the melee hit that procs it), but never
// Ability Damage, which never sees a weapon hit. Applied to candidate and baseline alike, which must
// agree or the Fabled<->other suggestions oscillate.
function fabledMultiplierFor(modeConfig) {
  return modeConfig.metric === 'ability' ? 1 : FABLED_MIDPOINT_MULTIPLIER;
}

// The same midpoint applies to the baseline when Fabled is already equipped: otherwise the baseline
// reads ~7.5% low against Fabled candidates, so every other reforge looks like an upgrade over it
// and Fabled looks like an upgrade right back.
function hasFabledReforgeEquipped(loadout) {
  return ['weapon', ...EQUIPMENT_SLOTS].some((slot) => loadout[slot]?.modifiers?.reforge === FABLED_REFORGE_NAME);
}

// Dungeon/Archer narrows equipment reforges to these 4 for speed — ~130 reforges across 4 slots on
// top of its 26-bow weapon pool is slow. The weapon slot stays fully brute-forced.
const DUNGEON_ARCHER_EQUIPMENT_REFORGE_NAMES = new Set(['Blended', 'Waxed', 'Menacing', 'Strengthened']);

async function evaluateWeaponAndEquipmentReforgeCandidates(loadout, itemData, build, modeConfig, mob, mode) {
  const results = [];
  for (const slot of ['weapon', ...EQUIPMENT_SLOTS]) {
    const equipped = loadout[slot];
    if (!equipped?.item) continue;
    const currentName = equipped.modifiers.reforge || null;
    let applicable = [
      ...getApplicableReforges(itemData.reforges, equipped.item),
      ...getApplicableReforges(itemData.reforgeStones, equipped.item),
    ];
    if (mode === 'dungeon_archer' && slot !== 'weapon') {
      applicable = applicable.filter((r) => DUNGEON_ARCHER_EQUIPMENT_REFORGE_NAMES.has(r.name));
    }
    for (const reforge of applicable) {
      if (reforge.name === currentName) continue;
      const candidateLoadout = { ...loadout, [slot]: { ...equipped, modifiers: { ...equipped.modifiers, reforge: reforge.name } } };
      let value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
      if (reforge.name === FABLED_REFORGE_NAME) value *= fabledMultiplierFor(modeConfig);
      results.push({
        category: 'Reforge',
        slot,
        label: `${formatItemName(equipped.item.name)} — ${reforge.name}`,
        value,
        apply: [{ type: 'applyReforge', slot, name: reforge.name }],
      });
    }
  }
  return results;
}

// A gemstone slot the catalog describes with no `costs` ships open and needs no unlocking (249 of
// 823 slots, 137 of them first sockets). A MISSING catalog entry is unknown rather than free and
// keeps lib/pricing.js's unpriced treatment.
export function gemstoneSlotShipsOpen(catalogSlot) {
  return !!catalogSlot && !catalogSlot.costs;
}

const GEMSTONE_TIER_LABELS = { rough: 'Rough', flawed: 'Flawed', fine: 'Fine', flawless: 'Flawless', perfect: 'Perfect' };

// Only the gems that feed each mode's optimized number: Jasper (Strength) and Onyx (Crit Damage) for
// melee DPS, Sapphire (Intelligence) for Ability Damage, and both Sapphire and Onyx for the Mage
// Staff Beam, whose formula is MeleeFinalDamage * (0.3 + 0.0009 * Intelligence). Keyed by
// modeConfig.metric, as every other mode-specific formula choice here is.
const RELEVANT_GEMS_BY_METRIC = {
  dps: ['JASPER', 'ONYX'],
  ability: ['SAPPHIRE'],
  beam: ['SAPPHIRE', 'ONYX'],
};
// Fine tier and up; GEMSTONE_TIERS is ascending, so this is everything from 'fine' onward.
const GEMSTONE_TIERS_FINE_UP = GEMSTONE_TIERS.slice(GEMSTONE_TIERS.indexOf('fine'));

// Gemstones: brute-forced per socket across armor and the weapon, over the gems and tiers relevant
// to the mode, narrowed again to what each socket's own slot type accepts (lib/gemstones.js's
// getAllowedGemsForSlotType). A socketed slot skips its own current (gem, tier), and is unlocked by
// construction. Equipment is excluded — 1 of 143 equipment items has a socket at all.
//
// A locked slot also needs its one-time unlock price (coins + specific gem items) on top of the
// gem's market price, stashed as `gemstoneOpen`/`gemstoneUnlockCost` for lib/pricing.js, since only
// this function knows which slots are open. `gemstoneSlotsUnlocked` reflects import data only; a
// fresh item defaults to every slot locked.
async function evaluateGemstoneCandidates(loadout, itemData, build, modeConfig, mob) {
  const relevantGems = RELEVANT_GEMS_BY_METRIC[modeConfig.metric] || [];
  const results = [];
  for (const slot of [...ARMOR_SLOTS, 'weapon']) {
    const equipped = loadout[slot];
    if (!equipped?.item) continue;
    const slotCount = countGemstoneSlots(equipped.item.lore);
    if (slotCount === 0) continue;
    const currentGemstones = equipped.modifiers.gemstones || [];
    const unlockedFlags = equipped.modifiers.gemstoneSlotsUnlocked || [];
    const catalogSlots = equipped.item.gemstone_slots || [];
    for (let index = 0; index < slotCount; index++) {
      const current = currentGemstones[index];
      const allowedGems = getAllowedGemsForSlotType(catalogSlots[index]?.slot_type).filter((g) => relevantGems.includes(g));
      if (allowedGems.length === 0) continue;
      // A slot the catalog describes with no `costs` ships open. A missing catalogSlots entry stays
      // unknown and keeps the unpriced treatment; unpriced results are exempt from dropDominated, so
      // that distinction is what stops two identical sockets disagreeing about the same gem.
      const gemstoneOpen = !!current || !!unlockedFlags[index] || gemstoneSlotShipsOpen(catalogSlots[index]);
      const gemstoneUnlockCost = gemstoneOpen ? null : (itemData.costs?.gemstoneUnlockCosts?.[`${equipped.item.id}_${index}`] ?? null);
      for (const gem of allowedGems) {
        for (const tier of GEMSTONE_TIERS_FINE_UP) {
          if (current && current.gem === gem && current.tier === tier) continue;
          const newGemstones = currentGemstones.slice();
          newGemstones[index] = { gem, tier };
          const candidateLoadout = { ...loadout, [slot]: { ...equipped, modifiers: { ...equipped.modifiers, gemstones: newGemstones } } };
          const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
          results.push({
            category: 'Gemstone',
            slot,
            label: `${formatItemName(equipped.item.name)} — Slot ${index + 1}: ${GEMSTONE_TIER_LABELS[tier]} ${GEMSTONES[gem].label}`,
            gem,
            tier,
            value,
            gemstoneOpen,
            gemstoneUnlockCost,
            apply: [{ type: 'setGemstone', slot, index, gem, tier }],
          });
        }
      }
    }
  }
  return results;
}

// Essence-shop perks (lib/essencePerks.js), one candidate per perk at max level: the intermediate
// levels are the same purchase split up, and listing each would bury every other category. Cost is
// the essence ladder from the account's current level to max, resolved by lib/pricing.js.
//
// Forbidden Blessing grants no stat of its own but scales every Dungeon Blessing, so it is a real
// upgrade while blessings are active and scores 0 otherwise. It lives in `build.blessing` rather
// than the perk map, so it has its own candidate shape.
async function evaluateEssencePerkCandidates(loadout, itemData, build, modeConfig, mob) {
  const perks = build.essencePerks || {};
  const results = [];

  for (const perk of ALL_ESSENCE_PERKS) {
    const current = Math.max(0, Math.min(perk.maxLevel, Math.floor(Number(perks[perk.key]) || 0)));
    if (current >= perk.maxLevel) continue;
    const candidateBuild = { ...build, essencePerks: { ...perks, [perk.key]: perk.maxLevel } };
    const value = await computeModeDamage(loadout, itemData, candidateBuild, modeConfig, mob);
    results.push({
      category: 'Essence Perk',
      slot: 'accessory',
      label: `${perk.name} ${current} → ${perk.maxLevel}`,
      perkKey: perk.key,
      fromLevel: current,
      toLevel: perk.maxLevel,
      value,
      apply: [{ type: 'setEssencePerkLevel', key: perk.key, level: perk.maxLevel }],
    });
  }

  const forbidden = Math.max(0, Math.min(FORBIDDEN_BLESSING_MAX_LEVEL, build.blessing?.forbiddenBlessingLevel || 0));
  if (forbidden < FORBIDDEN_BLESSING_MAX_LEVEL) {
    const candidateBuild = {
      ...build,
      blessing: { ...(build.blessing || {}), forbiddenBlessingLevel: FORBIDDEN_BLESSING_MAX_LEVEL },
    };
    const value = await computeModeDamage(loadout, itemData, candidateBuild, modeConfig, mob);
    results.push({
      category: 'Essence Perk',
      slot: 'accessory',
      label: `Forbidden Blessing ${forbidden} → ${FORBIDDEN_BLESSING_MAX_LEVEL}`,
      perkKey: 'forbidden_blessing',
      fromLevel: forbidden,
      toLevel: FORBIDDEN_BLESSING_MAX_LEVEL,
      value,
      apply: [{ type: 'setForbiddenBlessingLevel', level: FORBIDDEN_BLESSING_MAX_LEVEL }],
    });
  }
  return results;
}

// The potion rows. Inside a dungeon this is the Dungeon Potion, outside it the God Potion
// (lib/godPotion.js) — never both, so the branches are exclusive.
//
// Drinking is free either way, so it ranks with the Skill levels rather than on coins-per-percent,
// and the row is worth whatever the account can reach (Jellyfish VII for a Jellyfish owner).
//
// The two upgrade rows — the Jellyfish pet and the Spider Egg mixin — are measured potion-on in both
// directions; against a potion-off baseline either would be credited with the whole potion.
async function evaluatePotionCandidates(loadout, itemData, build, modeConfig, mob, baselineValue) {
  const results = [];
  const relativeToPotionOn = async (over) => {
    const withPot = { ...build, godPotionActive: true };
    const before = await computeModeDamage(loadout, itemData, withPot, modeConfig, mob);
    const after = await computeModeDamage(loadout, itemData, { ...withPot, ...over }, modeConfig, mob);
    return { before, percentIncrease: before > 0 ? ((after - before) / before) * 100 : 0 };
  };

  if (!modeConfig.useDungeonizedStats) {
    if (!build.godPotionActive) {
      const value = await computeModeDamage(loadout, itemData, { ...build, godPotionActive: true }, modeConfig, mob);
      results.push({
        category: 'Potion',
        slot: 'accessory',
        label: 'Use God Potion',
        potionKind: 'drink',
        value,
        freeUpgrade: true,
        apply: [{ type: 'setGodPotionActive', value: true }],
      });
    }
    // The mixin is a step up from a plain God Potion and applies the potion too, so clicking it from
    // a potion-off build lands both.
    if (build.godPotionMixin !== 'spider_egg') {
      const { percentIncrease } = await relativeToPotionOn({ godPotionMixin: 'spider_egg' });
      if (percentIncrease > 0.001) {
        results.push({
          category: 'Potion',
          slot: 'accessory',
          label: 'Use Spider Egg Mixin',
          potionKind: 'mixin',
          percentIncrease,
          value: baselineValue * (1 + percentIncrease / 100),
          apply: [
            { type: 'setGodPotionActive', value: true },
            { type: 'setGodPotionMixin', value: 'spider_egg' },
          ],
        });
      }
    }
    return results;
  }

  if (!build.godPotionActive) {
    const value = await computeModeDamage(loadout, itemData, { ...build, godPotionActive: true }, modeConfig, mob);
    results.push({
      category: 'Potion',
      slot: 'accessory',
      label: 'Drink Dungeon Pot',
      potionKind: 'drink',
      value,
      freeUpgrade: true,
      apply: [{ type: 'setGodPotionActive', value: true }],
    });
  }

  if (!build.hasJellyfishPet) {
    const { percentIncrease } = await relativeToPotionOn({ hasJellyfishPet: true });
    if (percentIncrease > 0.001) {
      results.push({
        category: 'Potion',
        slot: 'accessory',
        label: 'Jellyfish Pet',
        potionKind: 'jellyfish',
        itemId: 'JELLYFISH',
        material: 'BONE',
        // Already relative to the potion-on baseline, so runOptimizer must not recompute it.
        percentIncrease,
        value: baselineValue * (1 + percentIncrease / 100),
        apply: [{ type: 'setHasJellyfishPet', value: true }],
      });
    }
  }
  return results;
}

// Player levels cost time rather than coins, so they rank with the free upgrades, and only the
// immediate next level is offered. Which ones move damage isn't hardcoded: each is evaluated and the
// zero-gain ones fall out through the same percentIncrease filter as every other category.
const SKILL_LEVEL_CANDIDATES = [
  { key: 'combatLevel', name: 'Combat', max: MAX_COMBAT_LEVEL },
  { key: 'catacombsLevel', name: 'Catacombs', max: MAX_CATACOMBS_LEVEL },
  { key: 'foragingLevel', name: 'Foraging', max: MAX_FORAGING_LEVEL },
  { key: 'tamingLevel', name: 'Taming', max: MAX_TAMING_LEVEL },
  { key: 'alchemyLevel', name: 'Alchemy', max: MAX_ALCHEMY_LEVEL },
  { key: 'enchantingLevel', name: 'Enchanting', max: MAX_ENCHANTING_LEVEL },
  // Only moves damage with an Ankylosaurus equipped (it feeds Defense, which only that pet reads —
  // lib/playerDefense.js); the shared percentIncrease filter drops it for every other loadout.
  { key: 'miningLevel', name: 'Mining', max: MAX_MINING_LEVEL },
  { key: 'wolfSlayerLevel', name: 'Wolf Slayer', max: MAX_WOLF_SLAYER_LEVEL },
  { key: 'tarantulaSlayerLevel', name: 'Tarantula Slayer', max: MAX_TARANTULA_SLAYER_LEVEL },
  { key: 'blazeSlayerLevel', name: 'Blaze Slayer', max: MAX_BLAZE_SLAYER_LEVEL },
  // No cap — Skyblock Level keeps going, and it feeds a real Ability Damage multiplier.
  { key: 'skyblockLevel', name: 'Skyblock Level', max: null },
];

async function evaluateSkillLevelCandidates(loadout, itemData, build, modeConfig, mob) {
  const results = [];
  for (const skill of SKILL_LEVEL_CANDIDATES) {
    const current = Math.max(0, Math.floor(Number(build.playerStats?.[skill.key]) || 0));
    if (skill.max != null && current >= skill.max) continue;
    const next = current + 1;
    const candidateBuild = { ...build, playerStats: { ...build.playerStats, [skill.key]: next } };
    const value = await computeModeDamage(loadout, itemData, candidateBuild, modeConfig, mob);
    results.push({
      category: 'Skill',
      slot: 'accessory',
      label: `${skill.name} ${next}`,
      skillKey: skill.key,
      value,
      freeUpgrade: true,
      apply: [{ type: 'setPlayerLevel', key: skill.key, value: next }],
    });
  }
  return results;
}

// Every damage-relevant Attribute with a display name: attributes.js's four sources plus the four
// Echo ids, which attributes.js carries only as bare ATTRIBUTE_IDS strings.
const ECHO_ATTRIBUTES = [
  { id: 'echo_of_ruler', name: 'Echo of Ruler' },
  { id: 'echo_of_echoes', name: 'Echo of Echoes' },
  { id: 'echo_of_elemental', name: 'Echo of Elemental' },
  { id: 'echo_of_boxes', name: 'Echo of Boxes' },
];
const ALL_ATTRIBUTES = [
  ...RULER_ATTRIBUTES,
  ...ECHO_ATTRIBUTES,
  ...STRENGTH_ELEMENTAL_ATTRIBUTES,
  ...INTELLIGENCE_ELEMENTAL_ATTRIBUTES,
  ...OTHER_ATTRIBUTES,
];

// Attributes are compared at max level only — a level jump is bought as one stack of shards rather
// than ground out one at a time. Cost is the Worker-precomputed shard price x shards to max
// (worker/src/index.js's computeAttributeCosts, see lib/pricing.js's 'Attribute' case).
async function evaluateAttributeCandidates(loadout, itemData, build, modeConfig, mob) {
  const results = [];
  for (const attribute of ALL_ATTRIBUTES) {
    const currentLevel = build.attributes?.[attribute.id] || 0;
    const maxLevel = getAttributeMaxLevel(attribute.id);
    if (currentLevel >= maxLevel) continue;
    const candidateBuild = { ...build, attributes: { ...build.attributes, [attribute.id]: maxLevel } };
    const value = await computeModeDamage(loadout, itemData, candidateBuild, modeConfig, mob);
    results.push({
      category: 'Attribute',
      slot: 'attribute',
      label: `${attribute.name} — ${maxLevel}`,
      value,
      apply: [{ type: 'setAttributeLevel', id: attribute.id, level: maxLevel }],
    });
  }
  return results;
}

// Recombobulator 3000: a single choice — toggle it on — brute-forced across every weapon, armor and
// equipment slot below its rarity cap. A modifier change rather than a gear swap.
async function evaluateRecombobulatorCandidates(loadout, itemData, build, modeConfig, mob) {
  const results = [];
  for (const slot of ['weapon', ...ARMOR_SLOTS, ...EQUIPMENT_SLOTS]) {
    const equipped = loadout[slot];
    if (!equipped?.item || equipped.modifiers.recombobulated) continue;
    const baseTier = equipped.modifiers.rarityOverride || reforgeRarityFor(equipped.item.id, equipped.item.tier);
    if (!canRecombobulate(baseTier)) continue;
    const candidateLoadout = { ...loadout, [slot]: { ...equipped, modifiers: { ...equipped.modifiers, recombobulated: true } } };
    const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
    results.push({
      category: 'Recombobulator',
      slot,
      label: `${formatItemName(equipped.item.name)} — Recombobulator 3000`,
      value,
      apply: [{ type: 'toggleRecombobulated', slot }],
    });
  }
  return results;
}

// NEU-REPO lists 8 ultimates for the armor categories (Bank, Last Stand, Legion, No Pain No Gain,
// Wisdom, Habanero Tactics, Bobbin Time, Refrigerate — Habanero needs lib/enchantEffects.js's
// MISSING_CATEGORY_ENCHANTS patch). Only Habanero Tactics has a damage effect this formula can
// produce, so Slayer prunes to it rather than evaluating all 8 across 4 armor slots at every level.
const SLAYER_ARMOR_ULTIMATE_IDS = new Set(['ultimate_habanero_tactics']);

// Hot/Fuming Potato Books on the weapon: one candidate straight to the 15 cap, like the other
// brute-forced upgrades. Weapon only — a book's armor bonus is Health/Defense. `fromBooks` rides
// along because books 1-10 are Hot and 11-15 Fuming (lib/pricing.js).
async function evaluatePotatoBookCandidates(loadout, itemData, build, modeConfig, mob) {
  const weapon = loadout.weapon;
  const current = weapon?.modifiers?.books || 0;
  if (!weapon?.item || current >= MAX_POTATO_BOOKS) return [];
  const candidateLoadout = { ...loadout, weapon: { ...weapon, modifiers: { ...weapon.modifiers, books: MAX_POTATO_BOOKS } } };
  const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
  return [
    {
      category: 'Potato Books',
      slot: 'weapon',
      label: `${formatItemName(weapon.item.name)} — Potato Books ${current} → ${MAX_POTATO_BOOKS}`,
      value,
      fromBooks: current,
      apply: [{ type: 'setBookCount', slot: 'weapon', count: MAX_POTATO_BOOKS }],
    },
  ];
}

async function evaluateArmorUltimateEnchantCandidates(loadout, itemData, build, modeConfig, mob, mode) {
  const results = [];
  for (const slot of ARMOR_SLOTS) {
    const equipped = loadout[slot];
    if (!equipped?.item) continue;
    const category = resolveEnchantCategory(equipped.item.category);
    let ids = getCategoryEnchantIds(itemData.enchants, category).filter(isUltimateEnchant);
    if (mode === 'slayer') ids = ids.filter((id) => SLAYER_ARMOR_ULTIMATE_IDS.has(id.toLowerCase()));
    const current = equipped.modifiers.ultimateEnchantment;
    for (const id of ids) {
      const levels = await fetchEnchantLevels(id, itemData.enchants);
      if (levels.length === 0) continue;
      const maxLevel = Math.max(...levels.map((l) => l.level));
      for (const levelData of levels) {
        const level = levelData.level;
        if (current && current.id.toLowerCase() === id.toLowerCase() && level <= current.level) continue;
        // Same conflict resolution as the weapon evaluator: a no-op while Habanero Tactics is armor's
        // only ultimate, but correct if that changes.
        const removeIds = computeConflictingEntries(id, equipped.item.lore, equipped.modifiers).map((e) => e.id);
        const candidateLoadout = {
          ...loadout,
          [slot]: {
            ...equipped,
            modifiers: {
              ...equipped.modifiers,
              ultimateEnchantment: { id, level, maxLevel },
              hexEnchantments: (equipped.modifiers.hexEnchantments || []).filter((e) => !removeIds.includes(e.id)),
            },
          },
        };
        const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
        results.push({
          category: 'Ultimate Enchant',
          slot,
          label: `${formatItemName(equipped.item.name)} — ${titleCaseEnchantId(id)} ${toRoman(level)}`,
          value,
          apply: [{ type: 'applyEnchant', slot, id, level, maxLevel, removeIds }],
        });
      }
    }
  }
  return results;
}

// Dedicated-slot order for the sidebar's fixed layout, one slot each.
export const OPTIMIZER_GEAR_SLOTS = ['weapon', ...ARMOR_SLOTS, ...EQUIPMENT_SLOTS, 'pet'];

// Runs every evaluator, computes % increase against the current loadout's baseline and keeps the
// genuine upgrades. Two result shapes:
// - `slots`: one array per OPTIMIZER_GEAR_SLOTS slot, holding every candidate from that slot's
//   window (see evaluateTieredProgression) rather than a single best pick, so a tier with several
//   sidegrades shows each. Empty when the slot has nothing configured or nothing beats what's worn.
// - `otherResults`: the brute-forced, non-tiered categories (Enchant, Ultimate Enchant, Power
//   Stone, Stars), sorted by %.
// Every result carries `cost`/`ratio` via withCost and lib/pricing.js — a number when a cost source
// covers that candidate, '?'/null when none does.
// OPTIMIZER_BUILD_KEYS lists every `build` field runOptimizer READS, as opposed to the mutators
// applyOptimizerResult calls. React callers use it as their dependency list, so a new read must be
// added here or the panel silently ignores that input.
// scripts/verify-dungeon-and-enchant-behavior.mjs asserts it stays complete.
export const OPTIMIZER_BUILD_KEYS = [
  'loadout',
  'playerStats',
  'attributes',
  'miscStats',
  'godPotionActive',
  'godPotionMixin',
  'mobHpPercent',
  'mobHpSelections',
  'infernalCrimsonStacks',
  'swarmMobs',
  'comboKills',
  'legionPlayers',
  'blazeCrimsonIsle',
  'bestiaryMaxedMobs',
  'combinedMythologicalBestiaryTiers',
  'maxedCollectionsCount',
  'useMasterMode',
  'blessing',
  'essencePerks',
  'hasJellyfishPet',
  'debuffs',
  'buffs',
  'importedWeapons',
];

export async function runOptimizer(loadout, itemData, build, mode, mob) {
  build = withOptimizerSwarmMobs(build, mode);
  const modeConfig = getModeConfig(mode, build.useMasterMode);
  const { value: baselineValue, sources: baselineSources } = await computeModeDamageAndSources(loadout, itemData, build, modeConfig, mob);
  // Only the weapon/equipment Reforge comparison uses the Fabled-adjusted baseline: no other
  // category's candidates get a Fabled multiplier, so measuring them against an inflated baseline
  // would shrink or negate real upgrades.
  const reforgeBaselineValue = hasFabledReforgeEquipped(loadout) ? baselineValue * fabledMultiplierFor(modeConfig) : baselineValue;
  // Master Star candidates are valued with Master Mode forced on (evaluateMasterStarsCandidates), so
  // they need a baseline measured the same way, or one star is credited with the whole mode's boost.
  // Only computed when it can differ: outside a dungeon there are no Master Star candidates, and
  // inside one with Master Mode already on the two baselines are identical.
  const masterModeBaselineValue =
    modeConfig.useDungeonizedStats && !modeConfig.useMasterMode
      ? await computeModeDamage(loadout, itemData, build, { ...modeConfig, useMasterMode: true }, mob)
      : baselineValue;

  const [
    weapons,
    armor,
    equipment,
    pets,
    maxGoldenDragon,
    enchants,
    missingTypeBaneEnchants,
    missingEnchants,
    cheapestOneForAllAlternative,
    ultimates,
    armorUltimates,
    equipmentUltimates,
    powers,
    stars,
    masterStars,
    armorReforges,
    weaponAndEquipmentReforges,
    recombs,
    petItems,
    fullSets,
    gemstones,
    attributes,
    essencePerkUpgrades,
    skillLevels,
    dungeonPotion,
  ] = await Promise.all([
    evaluateWeaponProgressionCandidates(loadout, itemData, build, modeConfig, mob, mode, baselineValue),
    evaluateItemSlotCandidates(loadout, itemData, build, modeConfig, mob, baselineValue, ARMOR_SLOTS, armorProgressionForMode(mode, loadout), 'Armor', mode),
    evaluateItemSlotCandidates(
      loadout,
      itemData,
      build,
      modeConfig,
      mob,
      baselineValue,
      EQUIPMENT_SLOTS,
      EQUIPMENT_PROGRESSION_BY_MODE[mode],
      'Equipment',
    ),
    evaluatePetCandidates(loadout, itemData, build, modeConfig, mob, mode, baselineValue),
    evaluateMaxGoldenDragonCandidate(loadout, itemData, build, modeConfig, mob, baselineValue),
    evaluateEnchantCandidates(loadout, itemData, build, modeConfig, mob),
    evaluateMissingTypeBaneEnchantCandidates(loadout, itemData, build, modeConfig, mob),
    evaluateMissingEnchantCandidates(loadout, itemData, build, modeConfig, mob),
    evaluateCheapestOneForAllAlternative(loadout, itemData, build, modeConfig, mob, baselineValue),
    evaluateUltimateEnchantCandidates(loadout, itemData, build, modeConfig, mob, mode),
    evaluateArmorUltimateEnchantCandidates(loadout, itemData, build, modeConfig, mob, mode),
    evaluateEquipmentUltimateEnchantCandidates(loadout, itemData, build, modeConfig, mob),
    evaluatePowerStoneCandidates(loadout, itemData, build, modeConfig, mob, mode),
    evaluateStarsCandidates(loadout, itemData, build, modeConfig, mob),
    evaluateMasterStarsCandidates(loadout, itemData, build, modeConfig, mob),
    evaluateArmorReforgeCandidates(loadout, itemData, build, modeConfig, mob, baselineValue),
    evaluateWeaponAndEquipmentReforgeCandidates(loadout, itemData, build, modeConfig, mob, mode),
    evaluateRecombobulatorCandidates(loadout, itemData, build, modeConfig, mob),
    evaluatePotatoBookCandidates(loadout, itemData, build, modeConfig, mob),
    evaluatePetItemCandidates(loadout, itemData, build, modeConfig, mob),
    evaluateFullSetCandidates(loadout, itemData, build, modeConfig, mob, mode),
    evaluateGemstoneCandidates(loadout, itemData, build, modeConfig, mob),
    evaluateAttributeCandidates(loadout, itemData, build, modeConfig, mob),
    evaluateEssencePerkCandidates(loadout, itemData, build, modeConfig, mob),
    evaluateSkillLevelCandidates(loadout, itemData, build, modeConfig, mob),
    evaluatePotionCandidates(loadout, itemData, build, modeConfig, mob, baselineValue),
  ]);

  // Armor, equipment, pet and armor-reforge results already carry their own percentIncrease, since
  // evaluateTieredProgression needs it to decide whether to advance a tier. The non-tiered
  // categories below still need it computed here, with the same 0-baseline handling.
  const withPercentUsing = (list, base) =>
    list
      .map((r) => ({
        ...r,
        percentIncrease: base > 0 ? ((r.value - base) / base) * 100 : r.value * 100,
      }))
      .filter((r) => r.percentIncrease > 0.001);
  const withPercent = (list) => withPercentUsing(list, baselineValue);

  const slotCandidates = [...weapons, ...armor, ...equipment, ...pets, ...maxGoldenDragon];
  const slots = {};
  for (const slot of OPTIMIZER_GEAR_SLOTS) {
    slots[slot] = slotCandidates.filter((r) => r.slot === slot);
  }

  const otherResults = [
    ...withPercent([
      ...enchants,
      ...missingTypeBaneEnchants,
      ...missingEnchants,
      ...cheapestOneForAllAlternative,
      ...ultimates,
      ...armorUltimates,
      ...equipmentUltimates,
      ...powers,
      ...stars,
      ...recombs,
      ...petItems,
      ...fullSets,
      ...gemstones,
      ...attributes,
      ...essencePerkUpgrades,
      ...skillLevels,
      ...dungeonPotion.filter((r) => r.percentIncrease == null),
    ]),
    ...withPercentUsing(weaponAndEquipmentReforges, reforgeBaselineValue),
    ...dungeonPotion.filter((r) => r.percentIncrease != null),
    ...withPercentUsing(masterStars, masterModeBaselineValue),
    ...armorReforges,
  ].sort((a, b) => b.percentIncrease - a.percentIncrease);

  // Priced but never pruned: every gear alternative for a slot is shown, not only those no other
  // pick beats on both cost and % (see dropDominated).
  for (const slot of OPTIMIZER_GEAR_SLOTS) slots[slot] = slots[slot].map((r) => withCost(r, itemData));

  return {
    baselineValue,
    // The panel's Attack Speed readout, selected rather than raw: a Final Destination full set is
    // +20 against an Ender target, and inside a dungeon this is the Catacombs-scaled total.
    bonusAttackSpeed: selectBaseStats(baselineSources, modeConfig.useDungeonizedStats, modeConfig.useMasterMode, mob).bonus_attack_speed || 0,
    slots,
    otherResults: dropDominated(
      otherResults.map((r) => withCost(r, itemData)),
      dominanceGroupKey,
    ),
  };
}

// Executes one result's `apply` steps against a live BuildContext — the swap-in action. `build` must
// expose selectItem/applyEnchant/setSpecialValue/setStarCount. Steps run in order, since a Crown of
// Avarice candidate needs its item selected before its Special value can be set. Modifier setters
// pass `respectEditAll: false`: the Armor/Equipment Options "Edit All" broadcast is scoped to the
// Hex screen, not to a swap-in.
export function applyOptimizerResult(build, result) {
  for (const step of result.apply) {
    switch (step.type) {
      case 'selectItem':
        build.selectItem(step.slot, step.item);
        break;
      case 'applyEnchant':
        build.applyEnchant(step.slot, step.id, step.level, step.maxLevel, step.removeIds || [], false);
        break;
      case 'setSpecialValue':
        build.setSpecialValue(step.slot, step.value, false);
        break;
      case 'setRarityOverride':
        build.setRarityOverride(step.slot, step.tier, false);
        break;
      case 'setStarCount':
        build.setStarCount(step.slot, step.count, false);
        break;
      case 'setDungeonized':
        build.setDungeonized(step.slot, step.value);
        break;
      case 'setMasterStarCount':
        build.setMasterStars(step.slot, step.count, false);
        break;
      case 'setPetItem':
        build.setPetItem(step.petItemId);
        break;
      // Max Golden Dragon's two inputs (evaluateMaxGoldenDragonCandidate), applied so the swap-in
      // reproduces the number it was ranked at.
      case 'setPetBankCoins':
        build.setPetBankCoins(step.value);
        break;
      case 'setPetGoldCollection':
        build.setPetGoldCollection(step.value);
        break;
      // Essence-shop perks are otherwise import-only, but a clicked suggestion has to take effect.
      case 'setGodPotionActive':
        build.setGodPotionActive(step.value);
        break;
      case 'setGodPotionMixin':
        build.setGodPotionMixin(step.value);
        break;
      case 'setHasJellyfishPet':
        build.setHasJellyfishPet(step.value);
        break;
      case 'setPlayerLevel':
        build.setPlayerLevel(step.key, step.value);
        break;
      case 'setEssencePerkLevel':
        build.setEssencePerkLevel(step.key, step.level);
        break;
      case 'setForbiddenBlessingLevel':
        build.setForbiddenBlessingLevel(step.level);
        break;
      case 'setAccessoryMagicalPower':
        build.setAccessoryMagicalPower(step.mp);
        break;
      case 'setAccessoryTuning':
        build.setAccessoryTuning(step.tuning);
        break;
      case 'applyReforge':
        build.applyReforge(step.slot, step.name, false);
        break;
      case 'toggleRecombobulated':
        build.toggleRecombobulated(step.slot, false);
        break;
      case 'setBookCount':
        build.setBookCount(step.slot, step.count);
        break;
      case 'setRecombobulated':
        build.toggleRecombobulated(step.slot, false, step.value);
        break;
      case 'setGemstone':
        build.applyGemstone(step.slot, step.index, step.gem, step.tier, false);
        break;
      case 'setAttributeLevel':
        build.setAttributeLevel(step.id, step.level);
        break;
      case 'setOwnedAccessory':
        build.setOwnedAccessory(step.id, step.tier, step.recombobulated);
        break;
      case 'removeOwnedAccessory':
        build.removeOwnedAccessory(step.id);
        break;
      default:
        break;
    }
  }
}

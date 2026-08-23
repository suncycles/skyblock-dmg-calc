// Damage Increase Optimizer — evaluates real gear/enchant/pet/power alternatives against the
// player's CURRENT loadout, one change at a time, and ranks every real improvement by % damage
// increase. Real coin cost (lib/pricing.js, Worker-precomputed from SkyHelperBot/Prices — see
// worker/src/index.js's resolveCosts) is attached to every result below, giving `ratio`
// (% DPS increase per coin) a real value for the "Best Value" sort — see pages/Optimizer.jsx.
//
// Two kinds of candidates:
// - Curated progression lists (weapons, armor pieces, equipment, pets) — most of the catalog is
//   either irrelevant or has no modeled damage effect in this calculator, so these are
//   hand-authored worst-to-best tier lists, confirmed with the user. Slayer and Mage (including
//   Dungeon/Mage Beam and Dungeon/Mage Ability, which share Mage's curated gear) have one;
//   Dungeon-Archer only surfaces the brute-forced categories below until provided. Tiers are
//   ordered worst -> best; multiple entries in one tier are sidegrades — every sidegrade is
//   always evaluated (even the ones matching the player's current tier), since one may
//   numerically beat another despite being nominally "equal". Every tier from the player's
//   current position onward is walked and every genuine improvement offered — except real
//   Kuudra-family armor (base/Hot/Burning/Fiery/Infernal, any of the 5 real families — see
//   lib/armorVariants.js's ARMOR_VARIANT_FAMILIES), which is user-specified to never skip a power
//   tier AND to never skip ahead to the next tier before maxing the current one's stars: the next
//   tier only unlocks once the current piece hits its real star cap (e.g. base Crimson at 10✩ ->
//   Hot Crimson at 0✩), see evaluateItemSlotCandidates's `maxIndexOverride`.
//   A slot can also have more than one independent chain instead of one flat list — weapons
//   always have (SLAYER_WEAPON_PROGRESSION: each real Slayer type hands out its own chain, all
//   targeting the single 'weapon' slot), and Mage's helmet does too (the Wise Dragon/Storm's/
//   Aurora line and the separate Dark/Shadow/Wither Goggles line are both real, independent
//   tracks). See resolveChainsToWalk for the shared "walk the chain(s) the player already owns,
//   or every chain from scratch" rule both cases use.
// - Brute-forced against real, already-modeled data — enchant levels, ultimate enchant choice,
//   Power Stones, Stars, Pet Items, weapon/equipment Reforges, and Gemstones all have a small
//   enumerable real catalog this app's damage pipeline already fully understands, so every real
//   option is tested directly; no hand-authored list needed.

import { collectDamageSources } from './damageSources';
import { computeAbilityDamage, computeDpsBreakdown, computeMageStaffBeamDamage } from './finalDamage';
import { ARMOR_SLOTS } from './armorSlots';
import { EQUIPMENT_SLOTS } from './equipmentSlots';
import { VANQUISHED_SET, FINAL_DESTINATION_SET, hasFullSet } from './armorSetBonuses';
import { resolveGearSummary } from './hypixelImport';
import { lookupCandidateCost } from './pricing';
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
import { STONE_POWERS } from './accessoryPowers';
import { getMaxStarsForItem, isStarrableItem, MASTER_STAR_MIN_BASE_STARS, MAX_MASTER_STARS } from './starring';
import { ARMOR_VARIANT_FAMILIES } from './armorVariants';
import { derivePetDisplayName, getMaxPetLevel, SHINING_SCALES_MAX_GOLD_COLLECTION, MAX_GOLDEN_DRAGON_BANK_COINS } from './petData';
import { formatItemName } from './mcText';
import { canRecombobulate } from './recombobulator';
import { getApplicableReforges } from './reforgeData';
import { countGemstoneSlots } from './gemstones';
import { GEMSTONE_IDS, GEMSTONES, GEMSTONE_TIERS } from './gemstoneData';

export const OPTIMIZER_MODES = [
  { id: 'slayer', label: 'Slayer' },
  { id: 'mage', label: 'Mage' },
  { id: 'dungeon_archer', label: 'Dungeon / Archer' },
  { id: 'dungeon_mage_beam', label: 'Dungeon / Mage Beam' },
  { id: 'dungeon_mage_ability', label: 'Dungeon / Mage Ability' },
];

// Which real damage number each mode optimizes — reuses this app's existing melee DPS / Ability
// Damage / Mage Staff Beam pipelines rather than a new one (see finalDamage.js). Slayer and
// Dungeon/Archer optimize melee Total DPS. Mage optimizes Ability Damage. Dungeon/Mage splits into
// two modes (user-specified, 2026-08-22) since a real Mage build cares about one damage number or
// the other depending on playstyle, not both at once: Dungeon/Mage Beam optimizes the Mage Staff
// Beam number (computeMageStaffBeamDamage — always-on, scales off melee Final Damage +
// Intelligence), Dungeon/Mage Ability optimizes Ability Damage. All Dungeon variants turn on
// Dungeonized Stats.
const MODE_CONFIG = {
  slayer: { useDungeonizedStats: false, metric: 'dps' },
  mage: { useDungeonizedStats: false, metric: 'ability' },
  dungeon_archer: { useDungeonizedStats: true, metric: 'dps' },
  dungeon_mage_beam: { useDungeonizedStats: true, metric: 'beam' },
  dungeon_mage_ability: { useDungeonizedStats: true, metric: 'ability' },
};

// useMasterMode isn't part of a mode's own static config — it's the player's real, live "Master"
// toggle (build.useMasterMode, the same one DamageSources.jsx already reads to pick between
// finalDamage.js's dungeonized vs master-dungeonized base stats), so it has to come in per call
// rather than being hardcoded. Master Stars (see evaluateMasterStarsCandidates) only ever show a
// real effect when this is true — bug fixed 2026-08-22: every mode previously hardcoded this to
// false here, so the optimizer silently ignored the player's own Master toggle in every dungeonized
// mode, not just for Master Stars (any stat with a masterDungeonized variant was affected).
export function getModeConfig(mode, useMasterMode = false) {
  return { ...(MODE_CONFIG[mode] || MODE_CONFIG.slayer), useMasterMode };
}

// Real ids, confirmed against worker/src/data/armor.json. "10m/100m/1b coin COA" = Crown of
// Avarice's Coins Consumed special value at that tier — see lib/specialWeapons.js. Crimson is the
// only one of the 5 real Kuudra families (lib/armorVariants.js's ARMOR_VARIANT_FAMILIES) with a
// Warden/Crown of Avarice equivalent — its Hot/Burning/Fiery power tiers sit between the
// Basic-equivalent checkpoint (bare Crimson/Primordial/10m COA) and the Warden/100m-COA
// checkpoint, each its own tier (not a sidegrade group) so a real player is only ever offered one
// power tier at a time — Hot before Burning before Fiery before Infernal — matching
// lib/armorVariants.js's VARIANT_TIERS stat-confirmed ascending order. Flag if Hot/Burning/Fiery
// should rank differently against Warden/Crown of Avarice specifically; the within-family
// Hot<Burning<Fiery<Infernal order itself is confirmed. Aurora/Fervor/Hollow have no such
// extra step — their own chains are the same tiers minus Warden/CoA, one flat named chain per
// family (see resolveChainsToWalk; evaluateItemSlotCandidates dedupes the shared Tarantula Helmet
// tier-0 that every family's chain repeats).
// Terror is user-excluded from Slayer's armor progression (2026-08-23) — never offered as an
// upgrade here, though ARMOR_VARIANT_FAMILIES itself (icons, tier badges, gemstone slot counting,
// etc.) still covers it, since none of that is Slayer-specific.
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

// Chestplate/Leggings/Boots share the same chain shape ("other armor" in the user's spec):
// Shadow Assassin -> Necron's Armor (POWER_WITHER_*, confirmed with the user) -> the chosen Kuudra
// family's own Basic/Hot/Burning/Fiery/Infernal power tiers (see the helmet chain's note above for
// why these are split into individual tiers rather than one sidegrade group) — one named chain per
// family, same shared-prefix dedup as the helmet chain above.
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

// Equipment: Ender 4-piece -> Molten 4-piece uniformly, then each slot branches into its own
// further upgrade — user-specified, real ids confirmed against worker/src/data/equipment.json.
// David's Cloak's real Strength bonus is a manually-entered "Special" number (see
// specialWeapons.js) with no fixed rarity either — defaulted to its own real max (50, MYTHIC)
// for the same "compare a candidate at its real best-case" reason pet candidates are maxed above.
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

// User-specified: no clear universal "best" pet (situational — Golden Dragon is the general
// pick, but not strictly dominant), so all 10 real ids (confirmed against NEU-REPO's
// petnums.json) sit in one flat tier — every pet is always compared against every other,
// unlike the strict worst->best chains below. "Tiger" is a real, separate pet from T-Rex
// (Tyrannosaurus), not an alias for it.
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

// Slayer weapon reward lines — each Slayer type hands out its own fixed worst->best weapon
// chain, independent of every other chain (a Reaper Falchion isn't "better or worse" than a
// Scorpion Foil, they're for different Slayers). User-specified endpoints for all 4; ids
// confirmed real against worker/src/data/weapons.json. Zombie/Spider lines are fully
// user-specified. Enderman (katana) and the two Blaze (dagger) lines only had their endpoint
// given ("ends at Atomsplit Katana" / "ending at Pyrochaos/Deathripper") — the middle links
// below are inferred from real rarity progression (UNCOMMON->RARE->EPIC->LEGENDARY) and shared
// id roots (VOID*_KATANA; FIRE*_DAGGER vs MAW*_DAGGER, matching the existing Firedust/Twilight
// sibling-pair note above) — flag if this ordering is wrong.
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
  // Wolf Slayer also has a third real reward weapon, Edible Mace (RARE, Wolf Slayer 5) — an
  // ability/stun weapon rather than a stat-stick, user-excluded from this DPS progression.
  wolf: [[{ id: 'SHAMAN_SWORD' }], [{ id: 'POOCH_SWORD' }]],
};

// Mage progression (user-specified, 2026-08-22) — armor/equipment/pet shared by Mage, Dungeon/
// Mage Beam, and Dungeon/Mage Ability (same curated gear; differ only in which damage number they
// optimize, via MODE_CONFIG). Weapons are the exception: Dungeon/Mage Beam has its own distinct
// chain below (MAGE_BEAM_WEAPON_PROGRESSION) — Beam's damage comes from melee Final Damage, not
// the Ability Damage this weapon chain was built around, so a different set of weapons matters.
// Ids confirmed real against worker/src/data/weapons.json, armor.json, equipment.json, and
// NEU-REPO's petnums.json.
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

// Dungeon/Mage Beam's own weapon progression (user-specified, 2026-08-22): Giant's Sword and
// Midas Sword are sidegrades (both always evaluated — live testing found Giant's Sword actually
// outscoring a maxed Midas Sword for one real test account, so which one's genuinely better
// depends on the player's own stats, not a fixed order), Dark Claymore is the real top. All 3
// real, LEGENDARY Dungeon weapons. Midas Sword forces its own real reforge — Gilded, the Midas
// Jewel stone (NEU-REPO reforgestones.json — itemData.reforgeStones.Gilded, item-exclusive to
// Midas' Sword/Staff: +75/+75/+8 damage/strength/ability_damage at LEGENDARY, +90/+90/+10 at
// MYTHIC) — since it's the one reforge actually meant for this weapon, not whatever the player's
// previous weapon happened to have (see evaluateWeaponProgressionCandidates' `forcedReforge`
// handling). Also stamped with its own real Price Paid cap (special: 50_000_000, matching
// lib/specialWeapons.js's own priceCap for base MIDAS_SWORD) for the same "compare at real
// best-case" treatment David's Cloak already gets — without it, Midas Sword's own Greed ability
// bonus (its whole reason to use this weapon) would compare as if 0% invested.
const MAGE_BEAM_WEAPON_PROGRESSION = {
  sword: [
    [{ id: 'GIANTS_SWORD' }, { id: 'MIDAS_SWORD', forcedReforge: 'Gilded', special: 50_000_000 }],
    [{ id: 'DARK_CLAYMORE' }],
  ],
};

// Wise Dragon -> Storm's/Aurora(+ Aurora's own Hot/Burning/Fiery/Infernal power tiers, same
// per-power-tier treatment as Slayer's Crimson line) — Storm's has no power tiers of its own, so
// it sits as a sidegrade at the base-Aurora rung; Aurora's own tiers keep climbing above that
// alone, mirroring how the Slayer helmet chain treats Crimson/Primordial/Crown of Avarice.
// `dungeonOnly` (Dungeon/Mage Beam and Ability, user-specified 2026-08-22): Aurora isn't real
// Dungeon-tagged gear, so it's dropped entirely there — Storm's alone is the top of the line.
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

// Helmet has a second, fully independent chain — Dark/Shadow/Wither Goggles is a real, separate
// reward line from the Wise Dragon/Storm's/Aurora line above (user-specified: two chains, not one
// combined ladder) — see resolveChainsToWalk. Goggles are already real Dungeon-tagged gear, so
// this chain is identical for both the plain-Mage and Dungeon/Mage progressions below.
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
// Dungeon/Mage Ability's own armor progression — same shape as plain Mage, Aurora dropped throughout.
const MAGE_ABILITY_ARMOR_PROGRESSION = {
  helmet: DUNGEON_MAGE_HELMET_PROGRESSION,
  chestplate: mageArmorProgression('chestplate', { dungeonOnly: true }),
  leggings: mageArmorProgression('leggings', { dungeonOnly: true }),
  boots: mageArmorProgression('boots', { dungeonOnly: true }),
};
// Dungeon/Mage Beam has its own, much simpler armor progression (user-specified, 2026-08-22):
// Storm's is the only real armor pick — no Wise Dragon tier below it, no Aurora, no Goggles
// alternative — so each slot is a single one-item tier. The only further improvement past that is
// Stars/Master Stars (evaluateStarsCandidates/evaluateMasterStarsCandidates already run
// unconditionally on whatever's equipped, so nothing extra is needed to make that the real
// upgrade path — it's just what's left once there's no higher armor tier to suggest).
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

// Dungeon/Mage Beam's own equipment picks (user-specified, 2026-08-22) — all 4 slots covered,
// unlike plain Mage above. Bone Necklace/Balloon Snake are sidegrades; cloak/belt/gloves are each
// a single real pick. All real, EPIC Dungeon-tagged equipment (Balloon Snake RARE — already
// confirmed a real sidegrade despite the rarity gap, see MAGE_EQUIPMENT_PROGRESSION above).
const MAGE_BEAM_EQUIPMENT_PROGRESSION = {
  necklace: [[{ id: 'BONE_NECKLACE' }, { id: 'BALLOON_SNAKE' }]],
  cloak: [[{ id: 'SHADOW_ASSASSIN_CLOAK' }]],
  belt: [[{ id: 'ADAPTIVE_BELT' }]],
  gloves: [[{ id: 'SOULWEAVER_GLOVES' }]],
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
  mage: MAGE_ARMOR_PROGRESSION,
  dungeon_mage_beam: MAGE_BEAM_ARMOR_PROGRESSION,
  dungeon_mage_ability: MAGE_ABILITY_ARMOR_PROGRESSION,
};
const EQUIPMENT_PROGRESSION_BY_MODE = {
  slayer: SLAYER_EQUIPMENT_PROGRESSION,
  mage: MAGE_EQUIPMENT_PROGRESSION,
  dungeon_mage_beam: MAGE_BEAM_EQUIPMENT_PROGRESSION,
  dungeon_mage_ability: MAGE_EQUIPMENT_PROGRESSION,
};
const PET_PROGRESSION_BY_MODE = {
  slayer: SLAYER_PET_PROGRESSION,
  mage: MAGE_PET_PROGRESSION,
  dungeon_mage_beam: MAGE_PET_PROGRESSION,
  dungeon_mage_ability: MAGE_PET_PROGRESSION,
};
const WEAPON_PROGRESSION_BY_MODE = {
  slayer: SLAYER_WEAPON_PROGRESSION,
  mage: MAGE_WEAPON_PROGRESSION,
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

// Real coin cost (lib/pricing.js) per candidate — `'?'` (not `0`) when no real cost source exists
// for this specific candidate (Stars without upgrade_costs data, a free/blacksmith-rolled reforge,
// etc.), since a literal 0 would misleadingly read as "this is free" now that sibling rows show
// real numbers. `'?'.toLocaleString()` doesn't throw (strings have that method), so the existing
// render code needs no changes for this case.
function withCost(result, itemData) {
  if (!result) return result;
  const cost = lookupCandidateCost(result, itemData);
  const hasRealCost = typeof cost === 'number' && cost > 0;
  return { ...result, cost: hasRealCost ? cost : '?', ratio: hasRealCost ? result.percentIncrease / cost : null };
}

function findTierIndex(progression, matches) {
  for (let i = 0; i < progression.length; i++) {
    if (progression[i].some(matches)) return i;
  }
  return -1;
}

// A progression entry is either ONE flat chain (the common case — an array of tiers) or, for a
// slot with more than one real independent reward line (SLAYER_WEAPON_PROGRESSION's per-Slayer-
// type chains; Mage's helmet, which has both the Wise Dragon/Storm's/Aurora line and the separate
// Dark/Shadow/Wither Goggles line — user-specified, 2026-08-22), a plain object of named chains.
// Either way: if the player's current item is recognized in one or more of those chains, only
// those get walked; otherwise every chain is walked from tier 0. This used to be duplicated
// (weapons had their own copy of this exact selection logic) — shared here so the two can't drift.
function resolveChainsToWalk(progression, currentId) {
  const chains = Array.isArray(progression) ? [progression] : Object.values(progression);
  const owned = chains.filter((chain) => findTierIndex(chain, (c) => c.id === currentId) !== -1);
  return owned.length > 0 ? owned : chains;
}

// Walks every tier from the player's current position onward (tier 0 if unrecognized) — not just
// the nearest one — evaluating every real candidate via `evaluate` (resolves a candidate to
// `{value, ...}` or null on a catalog miss — skipped rather than guessed) and keeping every
// genuine improvement over `baselineValue` found anywhere in the remaining ladder. Sidegrades
// within the player's current tier are still evaluated too (per the "/" rule), everything else is
// a straightforward superset.
//
// `maxIndexOverride` (user-specified, Crimson-armor-only exception) narrows that window to at most
// this tier index — never further, even if a later tier scores a bigger % increase — so a real
// player earns each Crimson power tier in order (Hot before Burning before Fiery before Infernal)
// instead of the app suggesting a shortcut past the rung right in front of them. The caller
// (evaluateItemSlotCandidates) sets this to the current tier's own index while that tier's stars
// aren't yet maxed (no tier-up offered at all, just the next star — see evaluateStarsCandidates)
// and to current+1 once they are (the next tier unlocks, at 0 stars). Every other progression
// (weapons, non-Crimson armor, equipment, pets) passes no override and stays unrestricted.
async function evaluateTieredProgression(progression, currentIndex, isCurrent, baselineValue, evaluate, maxIndexOverride) {
  const effectiveIndex = currentIndex === -1 ? 0 : currentIndex;
  const maxIndex = maxIndexOverride != null ? maxIndexOverride : progression.length - 1;
  const evaluated = [];
  for (let i = effectiveIndex; i <= maxIndex && i < progression.length; i++) {
    const tierCandidates = progression[i].filter((c) => !(i === effectiveIndex && currentIndex !== -1 && isCurrent(c)));
    for (const candidate of tierCandidates) {
      const outcome = await evaluate(candidate);
      if (!outcome) continue;
      // A 0 baseline (e.g. Mage/Dungeon-Mage-Ability's Ability Damage metric, starting from a
      // weapon with no ability at all) has no real "% of baseline" to compute — dividing by 0
      // used to hardcode this to 0, silently discarding every real candidate no matter how much
      // Ability Damage it actually added (bug: Mage mode's weapon progression looked completely
      // empty starting from a non-ability weapon, the single most common Mage starting point).
      // Scaling the raw value directly keeps a real, positive number that both formats safely and
      // ranks candidates by how much Ability Damage they actually add, same as every other case.
      const percentIncrease = baselineValue > 0 ? ((outcome.value - baselineValue) / baselineValue) * 100 : outcome.value * 100;
      if (percentIncrease > 0.001) evaluated.push({ ...outcome, percentIncrease });
    }
  }
  return evaluated;
}

// Runs the full damage-source pipeline for one candidate loadout and reduces it to the mode's
// single damage number (melee Total DPS, or Ability Damage) plus the raw sources (needed once,
// for the baseline call, to also read Bonus Attack Speed).
export async function computeModeDamageAndSources(loadout, itemData, build, modeConfig, mob) {
  const sources = await collectDamageSources(
    loadout,
    itemData,
    build.playerStats,
    build.godPotionActive,
    build.attributes,
    build.miscStats,
    build.mobHpPercent,
    build.infernalCrimsonStacks,
    modeConfig.useDungeonizedStats,
    build.swarmMobs,
    build.comboKills,
    build.legionPlayers,
    build.blazeCrimsonIsle,
  );

  if (modeConfig.metric === 'ability') {
    const ability = computeAbilityDamage(sources, mob, loadout, modeConfig.useDungeonizedStats, modeConfig.useMasterMode);
    return { value: ability ? ability.finalDamage : 0, sources };
  }

  const dps = computeDpsBreakdown(sources, mob, loadout, modeConfig.useDungeonizedStats, modeConfig.useMasterMode);

  if (modeConfig.metric === 'beam') {
    const beam = computeMageStaffBeamDamage(sources, dps.meleeFinalDamage, modeConfig.useDungeonizedStats, modeConfig.useMasterMode);
    return { value: beam.finalDamage, sources };
  }

  return { value: dps.total, sources };
}

// The brute-force evaluators below call this hundreds of times in tight `for` loops; nothing in
// the pipeline actually awaits I/O, so those loops used to run as one unbroken synchronous main-
// thread task (measured: a 209ms optimizer run produced a single 145ms longtask with zero frames
// painted in between — the tab was fully frozen for the whole run). Yielding here periodically
// breaks that into chunks small enough for the browser to paint/handle input between them, without
// slowing the total wall-clock time much (setTimeout(0) is a real macrotask yield, not just a
// microtask tick like a bare `await` on non-Promise work would be).
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

// Shared by armor and equipment slots (both are "pick a real catalog item for this slot" —
// identical shape, only the slot list/progression map/result category differ). Candidates carry
// over the CURRENTLY equipped item's reforge and ultimate enchant (a real player immediately
// re-applies their reforge stone/book on a fresh upgrade, not left bare) — compares "same
// persistent upgrades, different base item" rather than a fully bare candidate against a
// decked-out current item, which used to understate a real upgrade's true value. Gemstones/normal
// enchants/stars are NOT carried (item-specific slot counts/categories, handled by their own
// dedicated evaluators). `rarityOverride` (David's Cloak) mirrors the same "compare at real
// best-case" treatment.
async function evaluateItemSlotCandidates(loadout, itemData, build, modeConfig, mob, baselineValue, slots, progressionBySlot, category) {
  if (!progressionBySlot) return [];
  const results = [];
  for (const slot of slots) {
    const progressionOrChains = progressionBySlot[slot];
    if (!progressionOrChains) continue;
    const currentModifiers = loadout[slot]?.modifiers;
    const currentItem = loadout[slot]?.item || null;
    const currentId = currentItem?.id || null;
    const slotResults = [];
    for (const progression of resolveChainsToWalk(progressionOrChains, currentId)) {
      const currentIndex = findTierIndex(progression, (c) => c.id === currentId);
      // User-specified exception: only while currently wearing a real Kuudra-family piece (base/
      // Hot/Burning/Fiery/Infernal armor from one of the 5 real families — see
      // lib/armorVariants.js's ARMOR_VARIANT_FAMILIES) does this slot's progression refuse to skip
      // a tier — every other armor line stays unrestricted like weapons/equipment/pets. The next
      // power tier only unlocks once the current one's real star cap is reached (e.g. base Crimson
      // at 10✩ -> Hot Crimson at 0✩); before that, only the current tier (its own sidegrades, if
      // any, per the "/" rule) is offered — the real next step is the next star, not a tier skip.
      let maxIndexOverride;
      if (category === 'Armor' && ARMOR_VARIANT_FAMILIES.some((family) => currentId?.includes(family))) {
        const effectiveIndex = currentIndex === -1 ? 0 : currentIndex;
        const starsMaxed = currentIndex !== -1 && currentItem && (currentModifiers?.stars || 0) >= getMaxStarsForItem(currentItem);
        maxIndexOverride = starsMaxed ? effectiveIndex + 1 : effectiveIndex;
      }
      const evaluated = await evaluateTieredProgression(
        progression,
        currentIndex,
        (c) => c.id === currentId,
        baselineValue,
        async (candidate) => {
          const resolved = resolveGearSummary({ id: candidate.id }, itemData);
          if (!resolved) return null; // catalog lookup failed — skip rather than guess
          const modifiers = emptyModifiers();
          if (candidate.special != null) modifiers.special = candidate.special;
          if (candidate.rarityOverride != null) modifiers.rarityOverride = candidate.rarityOverride;
          if (currentModifiers?.reforge) modifiers.reforge = currentModifiers.reforge;
          if (currentModifiers?.ultimateEnchantment) modifiers.ultimateEnchantment = currentModifiers.ultimateEnchantment;
          // Compare a starrable candidate at ITS real max stars, not bare — same "real best-case"
          // treatment as special/rarityOverride above (Crown of Avarice/David's Cloak) and pet
          // candidates elsewhere in this file. Without this, a candidate that's a genuinely better
          // item (e.g. Hot Crimson Helmet) but starts at 0 stars looks like a sidegrade or worse
          // against a currently-equipped item the player has already invested real stars into —
          // understating the swap's true value exactly the way the reforge/enchant carry-over
          // above already exists to prevent. Confirmed real regression case: Basic Crimson Helmet
          // at 10 stars vs Hot Crimson Helmet at 0 stars computed as a flat 0% "improvement",
          // silently hiding a genuine +3% once Hot is also compared at its own 10-star cap.
          const candidateMaxStars = isStarrableItem(resolved) ? getMaxStarsForItem(resolved) : 0;
          if (candidateMaxStars > 0) modifiers.stars = candidateMaxStars;
          const candidateLoadout = { ...loadout, [slot]: { item: resolved, modifiers } };
          const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
          const apply = [{ type: 'selectItem', slot, item: resolved }];
          if (candidate.special != null) apply.push({ type: 'setSpecialValue', slot, value: candidate.special });
          if (candidate.rarityOverride != null) apply.push({ type: 'setRarityOverride', slot, tier: candidate.rarityOverride });
          if (candidateMaxStars > 0) apply.push({ type: 'setStarCount', slot, count: candidateMaxStars });
          if (currentModifiers?.reforge) apply.push({ type: 'applyReforge', slot, name: currentModifiers.reforge });
          if (currentModifiers?.ultimateEnchantment) {
            apply.push({
              type: 'applyEnchant',
              slot,
              id: currentModifiers.ultimateEnchantment.id,
              level: currentModifiers.ultimateEnchantment.level,
              maxLevel: currentModifiers.ultimateEnchantment.maxLevel,
              removeIds: [],
            });
          }
          return {
            category,
            slot,
            label: candidate.label || formatItemName(resolved.name),
            itemId: resolved.id,
            material: resolved.material,
            special: candidate.special,
            value,
            apply,
          };
        },
        maxIndexOverride,
      );
      slotResults.push(...evaluated);
    }
    // Named chains can share prefix tiers (every Kuudra family's helmet chain starts at the same
    // Tarantula Helmet tier; every other Kuudra slot's chain starts at the same Shadow Assassin ->
    // Necron's Armor pair) — resolveChainsToWalk correctly walks every chain the current item is
    // found in, but a shared prefix step then gets evaluated once per matching chain. Dedupe by
    // real item id (+ special value, so Crown of Avarice's separate Coins Consumed tiers don't
    // collide) so a shared step only ever shows once.
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

// Vanquished (Equipment) and Final Destination (Armor) only pay off once EVERY piece is worn (see
// armorSetBonuses.js's hasFullSet) — evaluating one slot at a time like evaluateItemSlotCandidates
// does could never show a mid-swap piece's true value, since the set bonus doesn't activate until
// the last piece lands (the same "coarse per-point search can't see a lumpy payoff" problem
// lib/tuningOptimizer.js solves for Bonus Attack Speed's breakpoints). So each is its own single
// candidate that swaps every slot in the set at once, carrying over each existing slot's own
// reforge/ultimate enchant the same way evaluateItemSlotCandidates does. Runs unconditionally
// (not gated on a mode's curated progression) since neither set is mode-specific content.
const FULL_SET_CANDIDATES = [
  {
    category: 'Full Set',
    label: 'Vanquished Equipment (Full Set)',
    slots: EQUIPMENT_SLOTS,
    idsBySlot: { necklace: 'VANQUISHED_MAGMA_NECKLACE', cloak: 'VANQUISHED_GHAST_CLOAK', belt: 'VANQUISHED_BLAZE_BELT', gloves: 'VANQUISHED_GLOWSTONE_GAUNTLET' },
    setIds: VANQUISHED_SET,
  },
  {
    category: 'Full Set',
    label: 'Final Destination Armor (Full Set)',
    slots: ARMOR_SLOTS,
    idsBySlot: { helmet: 'FINAL_DESTINATION_HELMET', chestplate: 'FINAL_DESTINATION_CHESTPLATE', leggings: 'FINAL_DESTINATION_LEGGINGS', boots: 'FINAL_DESTINATION_BOOTS' },
    setIds: FINAL_DESTINATION_SET,
  },
];

async function evaluateFullSetCandidates(loadout, itemData, build, modeConfig, mob) {
  const results = [];
  for (const set of FULL_SET_CANDIDATES) {
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
      const modifiers = emptyModifiers();
      if (currentModifiers?.reforge) modifiers.reforge = currentModifiers.reforge;
      if (currentModifiers?.ultimateEnchantment) modifiers.ultimateEnchantment = currentModifiers.ultimateEnchantment;
      candidateLoadout[slot] = { item: resolved, modifiers };
      apply.push({ type: 'selectItem', slot, item: resolved });
      if (currentModifiers?.reforge) apply.push({ type: 'applyReforge', slot, name: currentModifiers.reforge });
      if (currentModifiers?.ultimateEnchantment) {
        apply.push({
          type: 'applyEnchant',
          slot,
          id: currentModifiers.ultimateEnchantment.id,
          level: currentModifiers.ultimateEnchantment.level,
          maxLevel: currentModifiers.ultimateEnchantment.maxLevel,
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

// Weapon item choice: unlike armor/equipment/pet, several independent chains (see
// SLAYER_WEAPON_PROGRESSION) all target the same single 'weapon' slot. Each real Slayer type's
// chain is its own reward track, not a tier of some universal "best weapon" ladder — a Reaper
// Falchion isn't "worse" than a Scorpion Foil, and (user-confirmed) a Pyrochaos Dagger isn't
// "worse" than a Deathripper Dagger despite Deathripper's higher raw damage; they're earned
// independently and are meaningfully different weapons. So once the player's current weapon is
// recognized as belonging to ONE of these chains, only that chain gets walked/suggested — the
// others never cross-suggest into it just because they happen to deal more damage. Only when the
// current weapon matches NONE of the mode's chains (no weapon yet, or one outside this curated
// list) do all chains get walked from tier 0, same bare-item comparison and apply shape as
// evaluateItemSlotCandidates above, just without a slot-keyed progression map.
async function evaluateWeaponProgressionCandidates(loadout, itemData, build, modeConfig, mob, mode, baselineValue) {
  const chains = WEAPON_PROGRESSION_BY_MODE[mode];
  if (!chains) return [];
  const currentModifiers = loadout.weapon?.modifiers;
  const currentId = loadout.weapon?.item?.id || null;
  const results = [];
  for (const progression of resolveChainsToWalk(chains, currentId)) {
    const currentIndex = findTierIndex(progression, (c) => c.id === currentId);
    const evaluated = await evaluateTieredProgression(progression, currentIndex, (c) => c.id === currentId, baselineValue, async (candidate) => {
      const resolved = resolveGearSummary({ id: candidate.id }, itemData);
      if (!resolved) return null; // catalog lookup failed — skip rather than guess
      // Same "carry over the current item's persistent upgrades" treatment as
      // evaluateItemSlotCandidates above — a real player re-applies their reforge/ultimate
      // enchant on a fresh weapon rather than leaving it bare. `forcedReforge` (Midas Sword's
      // Gilded) overrides that carry-over — the item-exclusive reforge it's actually meant to
      // have, not whatever unrelated reforge the player's previous weapon carried. `special`
      // (Midas Sword's own real Price Paid cap, same "compare at real best-case" treatment
      // evaluateItemSlotCandidates already gives David's Cloak) needed adding here too — without
      // it every weapon candidate defaulted to special:0, silently comparing a Greed-less Midas
      // Sword against everything else.
      const modifiers = emptyModifiers();
      const reforgeName = candidate.forcedReforge || currentModifiers?.reforge;
      if (reforgeName) modifiers.reforge = reforgeName;
      if (candidate.special != null) modifiers.special = candidate.special;
      if (currentModifiers?.ultimateEnchantment) modifiers.ultimateEnchantment = currentModifiers.ultimateEnchantment;
      // Same "compare at real best-case" fix as evaluateItemSlotCandidates — a starrable weapon
      // candidate (Hyperion, etc.) compared bare against a currently-equipped weapon the player
      // already starred understates the swap's true value the same way an unstarred Hot Crimson
      // Helmet did against a maxed Basic Crimson Helmet.
      const candidateMaxStars = isStarrableItem(resolved) ? getMaxStarsForItem(resolved) : 0;
      if (candidateMaxStars > 0) modifiers.stars = candidateMaxStars;
      const candidateLoadout = { ...loadout, weapon: { item: resolved, modifiers } };
      const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
      const apply = [{ type: 'selectItem', slot: 'weapon', item: resolved }];
      if (reforgeName) apply.push({ type: 'applyReforge', slot: 'weapon', name: reforgeName });
      if (candidate.special != null) apply.push({ type: 'setSpecialValue', slot: 'weapon', value: candidate.special });
      if (candidateMaxStars > 0) apply.push({ type: 'setStarCount', slot: 'weapon', count: candidateMaxStars });
      if (currentModifiers?.ultimateEnchantment) {
        apply.push({
          type: 'applyEnchant',
          slot: 'weapon',
          id: currentModifiers.ultimateEnchantment.id,
          level: currentModifiers.ultimateEnchantment.level,
          maxLevel: currentModifiers.ultimateEnchantment.maxLevel,
          removeIds: [],
        });
      }
      return {
        category: 'Weapon',
        slot: 'weapon',
        label: formatItemName(resolved.name),
        itemId: resolved.id,
        material: resolved.material,
        special: candidate.special,
        value,
        apply,
      };
    });
    results.push(...evaluated);
  }
  return results;
}

// Pet candidates default to max effectiveness — highest real rarity tier, max level, and (for
// Golden Dragon specifically, harmless no-op for every other pet) maxed Legendary Treasure/
// Shining Scales inputs (see petData.js's MAX_GOLDEN_DRAGON_BANK_COINS/
// SHINING_SCALES_MAX_GOLD_COLLECTION) — user-specified, so a candidate pet's real ceiling is what's
// compared, not its stats at 0/0.
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
    const candidateLoadout = {
      ...loadout,
      pet: {
        item: petItem,
        modifiers: {
          ...emptyPetModifiers(),
          level: getMaxPetLevel(candidate.petId),
          petItem: loadout.pet?.modifiers?.petItem || null,
          bankCoins: MAX_GOLDEN_DRAGON_BANK_COINS,
          goldCollection: SHINING_SCALES_MAX_GOLD_COLLECTION,
        },
      },
    };
    const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
    return {
      category: 'Pet',
      slot: 'pet',
      label: `${derivePetDisplayName(candidate.petId)} (${tier})`,
      itemId: candidate.petId,
      material: 'BONE',
      value,
      apply: [{ type: 'selectItem', slot: 'pet', item: petItem }],
    };
  });
}

// Brute-forces the next real level of every enchant already on the weapon (e.g. Sharpness 6 -> 7)
// — doesn't propose adding an enchant that isn't already equipped (enchant-slot availability
// isn't modeled anywhere in this app, so guessing whether a new slot is even free would be a real guess).
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

// Brute-forces every real ultimate enchant applicable to the weapon's category (at its own real
// max level) as a full alternative to whichever ultimate is currently equipped. Removes whatever
// computeConflictingEntries says the real item would lose — same conflict resolution the Hex
// enchant picker (pages/EnchantList.jsx) already applies, most importantly One For All's "removes
// every other enchant" rule: both the resulting damage number (candidateLoadout below) and the
// swap-in action's removeIds need this, or a One For All suggestion would silently keep double-
// counting Sharpness/etc.'s damage instead of actually replacing them.
async function evaluateUltimateEnchantCandidates(loadout, itemData, build, modeConfig, mob) {
  const weapon = loadout.weapon;
  if (!weapon) return [];
  const category = resolveEnchantCategory(weapon.item.category);
  const ids = getCategoryEnchantIds(itemData.enchants, category).filter(isUltimateEnchant);
  const currentId = weapon.modifiers.ultimateEnchantment?.id?.toLowerCase() || null;
  const results = [];
  for (const id of ids) {
    if (id.toLowerCase() === currentId) continue;
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

// User-specified (2026-08-23): Slayer only ever considers these 7 real Power Stones — every
// other real one (Warrior, Forceful, Sanguisuge, ...) is excluded outright rather than ranked low,
// same "narrow the real candidate pool, not the formula" treatment as evaluateGemstoneCandidates'
// RELEVANT_GEMS_BY_METRIC. Treated as sidegrades (no forced order) — the normal flat brute-force
// comparison below already does that, so no chain/tier structure is needed for them.
const SLAYER_POWER_STONE_IDS = new Set(['BLOODY', 'ITCHY', 'SCORCHING', 'SHADED', 'SILKY', 'STRONG', 'HURTFUL']);

// Brute-forces every real Power Stone (lib/accessoryPowers.js's STONE_POWERS — already fully
// modeled real stats, no hand-authored ranking needed) against whichever is currently selected —
// narrowed to SLAYER_POWER_STONE_IDS for Slayer mode specifically (see above).
async function evaluatePowerStoneCandidates(loadout, itemData, build, modeConfig, mob, mode) {
  if (!loadout.accessory?.item) return [];
  const currentId = loadout.accessory.item.id;
  const candidatePowers = mode === 'slayer' ? STONE_POWERS.filter((p) => SLAYER_POWER_STONE_IDS.has(p.id)) : STONE_POWERS;
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

// Every real Crimson armor power tier (Basic/Hot/Burning/Fiery/Infernal) — Crimson's 10/15-star
// range is a real, expensive-per-star grind (unlike a normal 5-star item), so it gets its own
// treatment below instead of a single jump-to-max suggestion. Verified real ids against
// worker/src/data/armor.json (exactly 20: 5 tiers x 4 pieces).
const CRIMSON_ARMOR_RE = /^(?:INFERNAL_|HOT_|BURNING_|FIERY_)?CRIMSON_(?:HELMET|CHESTPLATE|LEGGINGS|BOOTS)$/;

// Brute-forces starring the weapon and every equipped armor piece up to its real max (see
// lib/starring.js's getMaxStarsForItem) — covers the "infernal stars" step in the user's spec
// generically. Every non-Crimson item still gets one "jump straight to max" suggestion; Crimson
// armor (see CRIMSON_ARMOR_RE above) only ever offers the single immediate next star level —
// user-specified: showing every level up to max (or letting a high level like 6✩ outrank 5✩)
// defeats the point of a real one-star-at-a-time progression, same rule as the armor power tiers.
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
        // Real per-item id, so lib/pricing.js can look up the cumulative star cost (Worker-
        // precomputed from Hypixel's real upgrade_costs data) without needing the whole loadout.
        itemId: equipped.item.id,
        value,
        apply: [{ type: 'setStarCount', slot, count: stars }],
      });
    }
  }
  return results;
}

// Master Stars: a Catacombs-only upgrade (real effect is 0 outside dungeonized-stats modes, so
// skip the pointless computation there), unlocked per piece once it has 5 real stars
// (MASTER_STAR_MIN_BASE_STARS), capped at 5. User-specified: always offered one at a time per
// piece — same "don't let the app suggest a shortcut past the rung right in front of them" rule
// evaluateStarsCandidates already applies to Crimson armor's regular stars, just unconditional
// here rather than family-gated (Master Stars are individually significant upgrades regardless of
// armor family).
async function evaluateMasterStarsCandidates(loadout, itemData, build, modeConfig, mob) {
  if (!modeConfig.useDungeonizedStats) return [];
  const results = [];
  for (const slot of ARMOR_SLOTS) {
    const equipped = loadout[slot];
    if (!equipped?.item || !isStarrableItem(equipped.item)) continue;
    if ((equipped.modifiers.stars || 0) < MASTER_STAR_MIN_BASE_STARS) continue;
    const currentMasterStars = equipped.modifiers.masterStars || 0;
    if (currentMasterStars >= MAX_MASTER_STARS) continue;
    const masterStars = currentMasterStars + 1;
    const candidateLoadout = { ...loadout, [slot]: { ...equipped, modifiers: { ...equipped.modifiers, masterStars } } };
    const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
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

// Pet Items: brute-forced against the full real catalog (~88 entries, see worker/src/data/
// petItems.json) rather than curated — small enough to just test everything, and
// lib/petItemEffects.js's parsePetItemStatBoost already tells real combat-stat boosts (Strength,
// Crit Chance/Damage, etc.) apart from XP/coin/cosmetic ones from the item's own lore, so a pure
// XP-boost item naturally computes a ~0% increase and gets filtered out below same as any other
// non-improvement — no separate "is this combat-relevant" allowlist needed.
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

// Armor reforges: user-curated worst -> best progression (Pure/Fierce -> Renowned/Ancient),
// confirmed real names + real itemTypes against NEU-REPO's reforges.json (blacksmith)/
// reforgestones.json (stone). Equipment reforges are brute-forced instead (see
// evaluateEquipmentReforgeCandidates below, user-specified 2026-08-22) — armor keeps a hand-picked
// list since it has a real worst->best order; equipment's real applicable set differs per item
// (Bloodshot only fits Belts, etc.) so there's no one order to hand-author.
const ARMOR_REFORGE_PROGRESSION = [
  [{ name: 'Pure' }, { name: 'Fierce' }],
  [{ name: 'Renowned' }, { name: 'Ancient' }],
];

// Reforge is a modifier change on the item already equipped (not a gear swap), same treatment as
// Stars below — goes into `otherResults`, not the dedicated per-slot gear picker.
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

// Weapon/equipment reforges: brute-forced against the full real catalog (NEU-REPO's reforges.json
// + reforgestones.json, ~130 entries total) via getApplicableReforges — the same "small enumerable
// real catalog this app's damage pipeline already fully understands" pattern Enchants/Pet Items/
// Power Stones already use, not a hand-picked list (user-specified, 2026-08-22 for equipment; the
// weapon slot joined it 2026-08-23 — a sword has no single real worst->best reforge order the way
// armor does, same reason equipment isn't a curated list either). Percent increase isn't computed
// here — these go through runOptimizer's withPercent, same as every other true brute-force
// category, unlike armor's tiered walk above which computes its own while deciding whether to
// advance a tier.
async function evaluateWeaponAndEquipmentReforgeCandidates(loadout, itemData, build, modeConfig, mob) {
  const results = [];
  for (const slot of ['weapon', ...EQUIPMENT_SLOTS]) {
    const equipped = loadout[slot];
    if (!equipped?.item) continue;
    const currentName = equipped.modifiers.reforge || null;
    const applicable = [
      ...getApplicableReforges(itemData.reforges, equipped.item),
      ...getApplicableReforges(itemData.reforgeStones, equipped.item),
    ];
    for (const reforge of applicable) {
      if (reforge.name === currentName) continue;
      const candidateLoadout = { ...loadout, [slot]: { ...equipped, modifiers: { ...equipped.modifiers, reforge: reforge.name } } };
      const value = await computeModeDamage(candidateLoadout, itemData, build, modeConfig, mob);
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

const GEMSTONE_TIER_LABELS = { rough: 'Rough', flawed: 'Flawed', fine: 'Fine', flawless: 'Flawless', perfect: 'Perfect' };

// User-specified scope (2026-08-23): only the gem that actually feeds each mode's optimized
// number, not all 6 — Jasper (Strength)/Onyx (Crit Damage) for melee DPS (Slayer, Dungeon/
// Archer), Sapphire (Intelligence) for Ability Damage (Mage, Dungeon/Mage Ability), and both
// Sapphire + Onyx for Mage Staff Beam (its formula is MeleeFinalDamage * (0.3 + 0.0009 *
// Intelligence) — Beam depends on melee Final Damage too, hence Onyx alongside Sapphire). Keyed
// by modeConfig.metric ('dps'/'ability'/'beam') rather than the mode id directly since that's
// what actually determines gem relevance, and it's already how every other mode-specific formula
// choice in this file is keyed.
const RELEVANT_GEMS_BY_METRIC = {
  dps: ['JASPER', 'ONYX'],
  ability: ['SAPPHIRE'],
  beam: ['SAPPHIRE', 'ONYX'],
};
// User-specified: only Fine tier and up (Rough/Flawed excluded) — GEMSTONE_TIERS is already
// ascending, so this is everything from 'fine' onward.
const GEMSTONE_TIERS_FINE_UP = GEMSTONE_TIERS.slice(GEMSTONE_TIERS.indexOf('fine'));

// Gemstones: brute-forced against the real gem(s)/tiers relevant to the mode being optimized (see
// RELEVANT_GEMS_BY_METRIC/GEMSTONE_TIERS_FINE_UP above) per socket on every armor piece and the
// weapon — lib/gemstones.js's own comment confirms slot-type restrictions aren't modeled in this
// app (any of the 6 gems fits any slot in-game too), so the narrowing here is purely "which gem
// moves this mode's number," not a real slot restriction. An already-socketed slot skips only its
// own current (gem, tier) so the list never "suggests" what's already equipped there. Equipment is
// excluded (only 1 of 143 real equipment items has a gemstone slot at all) — user-specified scope
// was armor + sword.
async function evaluateGemstoneCandidates(loadout, itemData, build, modeConfig, mob) {
  const relevantGems = RELEVANT_GEMS_BY_METRIC[modeConfig.metric] || [];
  const results = [];
  for (const slot of [...ARMOR_SLOTS, 'weapon']) {
    const equipped = loadout[slot];
    if (!equipped?.item) continue;
    const slotCount = countGemstoneSlots(equipped.item.lore);
    if (slotCount === 0) continue;
    const currentGemstones = equipped.modifiers.gemstones || [];
    for (let index = 0; index < slotCount; index++) {
      const current = currentGemstones[index];
      for (const gem of relevantGems) {
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
            apply: [{ type: 'setGemstone', slot, index, gem, tier }],
          });
        }
      }
    }
  }
  return results;
}

// Recombobulator 3000: brute-forced (only ever one real choice — toggle it on) against every
// armor/equipment slot below its rarity cap. Also a modifier change, not a gear swap.
async function evaluateRecombobulatorCandidates(loadout, itemData, build, modeConfig, mob) {
  const results = [];
  for (const slot of [...ARMOR_SLOTS, ...EQUIPMENT_SLOTS]) {
    const equipped = loadout[slot];
    if (!equipped?.item || equipped.modifiers.recombobulated) continue;
    const baseTier = equipped.modifiers.rarityOverride || equipped.item.tier;
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

// NEU-REPO's per-category enchant lists carry 8 real ultimates for HELMET/CHESTPLATE/LEGGINGS/
// BOOTS (Bank, Last Stand, Legion, No Pain No Gain, Wisdom, Habanero Tactics, Bobbin Time,
// Refrigerate — Habanero itself needs lib/enchantEffects.js's MISSING_CATEGORY_ENCHANTS patch
// since NEU-REPO's own list omits it). User-verified from each one's real lore: only Habanero
// Tactics has a damage effect this calculator's formula can ever produce — the other 7 (coins on
// death, Defense/Vitality on a live low-HP trigger this static calculator has no equivalent of, XP
// orbs, banked-XP Intelligence, fishing, Mana-to-Defense) don't map to any tracked stat, and Legion's
// per-nearby-player bonus isn't a reliable value for solo/small-group Slayer grinding the way it
// would be for a full Dungeon party — so Slayer mode prunes straight to Habanero instead of paying
// for a full real-pipeline evaluation of all 8 (measured: this was the single most expensive
// evaluator in the whole optimizer, since it's brute-forced across all 4 armor slots × every real
// level found, not just next/max like the weapon evaluator below).
const SLAYER_ARMOR_ULTIMATE_IDS = new Set(['ultimate_habanero_tactics']);

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
        // Same conflict resolution as the weapon evaluator above — a no-op today (armor's only
        // real ultimate is Habanero Tactics, so there's nothing else to conflict with), but
        // correct if that ever changes instead of silently keeping a removed enchant's damage.
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

// Dedicated-slot order for the sidebar's fixed layout — one slot each, user-specified.
export const OPTIMIZER_GEAR_SLOTS = ['weapon', ...ARMOR_SLOTS, ...EQUIPMENT_SLOTS, 'pet'];

// Runs every evaluator, computes % increase against the current loadout's real baseline, keeps
// only genuine upgrades (positive delta). Two result shapes:
// - `slots`: one array per OPTIMIZER_GEAR_SLOTS slot — every real candidate from that slot's
//   current-tier-plus-immediate-next-tier window (see evaluateTieredProgression), not collapsed
//   to a single "best" pick. A tier with several real sidegrades (e.g. the helmet's Crimson/
//   Primordial/Crown of Avarice checkpoint) shows every one of them as its own option, letting the
//   player pick by cost or preference instead of the app silently deciding for them. Empty array
//   when the slot has nothing configured or nothing left beats the current item.
// - `otherResults`: the brute-forced, non-slot-tiered categories (Enchant/Ultimate Enchant/Power
//   Stone/Stars) — these aren't "tiered", so every real option found still shows, sorted by %.
// Every result also carries `cost`/`ratio` (damage-increase-per-coin) via withCost/lib/pricing.js
// — a real number when a coin cost source exists for that specific candidate, `'?'`/`null` when
// it doesn't (see lib/pricing.js for exactly which categories are/aren't priceable today).
export async function runOptimizer(loadout, itemData, build, mode, mob) {
  const modeConfig = getModeConfig(mode, build.useMasterMode);
  const { value: baselineValue, sources: baselineSources } = await computeModeDamageAndSources(loadout, itemData, build, modeConfig, mob);

  const [
    weapons,
    armor,
    equipment,
    pets,
    enchants,
    ultimates,
    armorUltimates,
    powers,
    stars,
    masterStars,
    armorReforges,
    weaponAndEquipmentReforges,
    recombs,
    petItems,
    fullSets,
    gemstones,
  ] = await Promise.all([
    evaluateWeaponProgressionCandidates(loadout, itemData, build, modeConfig, mob, mode, baselineValue),
    evaluateItemSlotCandidates(loadout, itemData, build, modeConfig, mob, baselineValue, ARMOR_SLOTS, ARMOR_PROGRESSION_BY_MODE[mode], 'Armor'),
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
    evaluateEnchantCandidates(loadout, itemData, build, modeConfig, mob),
    evaluateUltimateEnchantCandidates(loadout, itemData, build, modeConfig, mob),
    evaluateArmorUltimateEnchantCandidates(loadout, itemData, build, modeConfig, mob, mode),
    evaluatePowerStoneCandidates(loadout, itemData, build, modeConfig, mob, mode),
    evaluateStarsCandidates(loadout, itemData, build, modeConfig, mob),
    evaluateMasterStarsCandidates(loadout, itemData, build, modeConfig, mob),
    evaluateArmorReforgeCandidates(loadout, itemData, build, modeConfig, mob, baselineValue),
    evaluateWeaponAndEquipmentReforgeCandidates(loadout, itemData, build, modeConfig, mob),
    evaluateRecombobulatorCandidates(loadout, itemData, build, modeConfig, mob),
    evaluatePetItemCandidates(loadout, itemData, build, modeConfig, mob),
    evaluateFullSetCandidates(loadout, itemData, build, modeConfig, mob),
    evaluateGemstoneCandidates(loadout, itemData, build, modeConfig, mob),
  ]);

  // Armor/equipment/pet/armor-reforge results already carry their own real percentIncrease
  // (evaluateTieredProgression computes it while walking tiers, since it needs the value to decide
  // whether to advance) — only the non-tiered categories below (including weapon/equipment
  // reforges and gemstones, both true brute-forces, see evaluateWeaponAndEquipmentReforgeCandidates
  // / evaluateGemstoneCandidates) still need it computed here. Same 0-baseline handling as
  // evaluateTieredProgression (see its comment) — a hardcoded 0 used to silently discard every
  // real candidate whenever the mode's damage number started at exactly 0.
  const withPercent = (list) =>
    list
      .map((r) => ({
        ...r,
        percentIncrease: baselineValue > 0 ? ((r.value - baselineValue) / baselineValue) * 100 : r.value * 100,
      }))
      .filter((r) => r.percentIncrease > 0.001);

  const slotCandidates = [...weapons, ...armor, ...equipment, ...pets];
  const slots = {};
  for (const slot of OPTIMIZER_GEAR_SLOTS) {
    slots[slot] = slotCandidates.filter((r) => r.slot === slot);
  }

  const otherResults = [
    ...withPercent([
      ...enchants,
      ...ultimates,
      ...armorUltimates,
      ...powers,
      ...stars,
      ...masterStars,
      ...weaponAndEquipmentReforges,
      ...recombs,
      ...petItems,
      ...fullSets,
      ...gemstones,
    ]),
    ...armorReforges,
  ].sort((a, b) => b.percentIncrease - a.percentIncrease);

  for (const slot of OPTIMIZER_GEAR_SLOTS) slots[slot] = slots[slot].map((r) => withCost(r, itemData));

  return {
    baselineValue,
    bonusAttackSpeed: baselineSources.baseStats.bonus_attack_speed || 0,
    slots,
    otherResults: otherResults.map((r) => withCost(r, itemData)),
  };
}

// Executes one result's `apply` steps against a live BuildContext (see useBuild()) — the
// "swap-in" action. `build` must expose selectItem/applyEnchant/setSpecialValue/setStarCount
// (every one of them already used elsewhere in the app for the exact same mutations, just
// triggered from a picker page instead of here). Steps run in order since a Crown of Avarice
// candidate needs its item selected before its Special value can be set.
export function applyOptimizerResult(build, result) {
  for (const step of result.apply) {
    switch (step.type) {
      case 'selectItem':
        build.selectItem(step.slot, step.item);
        break;
      case 'applyEnchant':
        build.applyEnchant(step.slot, step.id, step.level, step.maxLevel, step.removeIds || []);
        break;
      case 'setSpecialValue':
        build.setSpecialValue(step.slot, step.value);
        break;
      case 'setRarityOverride':
        build.setRarityOverride(step.slot, step.tier);
        break;
      case 'setStarCount':
        build.setStarCount(step.slot, step.count);
        break;
      case 'setMasterStarCount':
        build.setMasterStars(step.slot, step.count);
        break;
      case 'setPetItem':
        build.setPetItem(step.petItemId);
        break;
      case 'setAccessoryMagicalPower':
        build.setAccessoryMagicalPower(step.mp);
        break;
      case 'setAccessoryTuning':
        build.setAccessoryTuning(step.tuning);
        break;
      case 'applyReforge':
        build.applyReforge(step.slot, step.name);
        break;
      case 'toggleRecombobulated':
        build.toggleRecombobulated(step.slot);
        break;
      case 'setGemstone':
        build.applyGemstone(step.slot, step.index, step.gem, step.tier);
        break;
      default:
        break;
    }
  }
}

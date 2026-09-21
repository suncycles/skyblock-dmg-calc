import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { isUltimateEnchant } from '../lib/enchantEffects';
import { computeTotalTuningPoints } from '../lib/accessoryPowers';
import { ATTRIBUTE_IDS, getAttributeMaxLevel } from '../lib/attributes';
import { MAX_MASTER_STARS, MASTER_STAR_MIN_BASE_STARS, getMaxStarsForItem } from '../lib/starring';
import { buildSlotEntry } from '../lib/slotSelection';
import { emptyModifiers, emptyPetModifiers, emptyAccessoryModifiers } from '../lib/defaultModifiers';
import { INFERNAL_CRIMSON_MAX_STACKS } from '../lib/armorSetBonuses';
import { getMaxPetLevel, SHINING_SCALES_MAX_GOLD_COLLECTION, MAX_GOLDEN_DRAGON_BANK_COINS } from '../lib/petData';
import {
  BLESSING_IDS,
  BLESSING_MIN_LEVEL,
  BLESSING_MAX_LEVEL,
  FORBIDDEN_BLESSING_MAX_LEVEL,
  emptyBlessingLevels,
} from '../lib/dungeonBlessing';
import { emptyDebuffs, LAST_BREATH_MAX_LEVEL, LETHALITY_MAX_STACKS } from '../lib/mobDebuffs';
import { emptyBuffs, BUFF_ITEMS } from '../lib/buffs';
import { MASTER_SKULL_MAX_TIER } from '../lib/masterSkull';
import { ARMOR_VARIANT_FAMILIES } from '../lib/armorVariants';
import { ARMOR_SLOTS } from '../lib/armorSlots';
import { EQUIPMENT_SLOTS } from '../lib/equipmentSlots';
import { countGemstoneSlots, getAllowedGemsForSlotType } from '../lib/gemstones';
import { isReforgeApplicable } from '../lib/reforgeData';
import { useItemData } from './ItemDataContext';
import { getSpecialConfig } from '../lib/specialWeapons';
import { MOB_LOCATIONS } from '../lib/mobLocations';
import { GOD_POTION_MIXINS } from '../lib/godPotion';
import { DEFAULT_DUNGEON_CLASS, MAX_DUNGEON_CLASS_LEVEL, isDungeonClassId } from '../lib/dungeonClass';

const CATACOMBS_LOCATION = 'The Catacombs';

const STORAGE_KEY = 'hexLoadout';
const PLAYER_STATS_KEY = 'hexPlayerStats';
const TARGET_MOB_KEY = 'hexTargetMob'; // legacy single-mob key, migrated once then unused
const TARGET_MOBS_KEY = 'hexTargetMobs';
const GOD_POTION_KEY = 'hexGodPotion';
const GOD_POTION_MIXIN_KEY = 'hexGodPotionMixin';
const USE_DUNGEONIZED_STATS_KEY = 'hexUseDungeonizedStats';
const USE_MASTER_MODE_KEY = 'hexUseMasterMode';
const MAGE_MODE_KEY = 'hexMageMode';
// The picked Catacombs class and its level (lib/dungeonClass.js). `hexMageMode` is kept as the
// migration source: a build saved before classes existed reads back as Mage or Healer/Tank, the
// two that compute what it did then.
const DUNGEON_CLASS_KEY = 'hexDungeonClass';
const DUNGEON_CLASS_LEVEL_KEY = 'hexDungeonClassLevel';
const DPS_MODE_KEY = 'hexDpsMode';
const DPS_KIND_KEY = 'hexDpsKind';
const HAS_JELLYFISH_PET_KEY = 'hexHasJellyfishPet';
const ATTRIBUTES_KEY = 'hexAttributes';
const MISC_STATS_KEY = 'hexMiscStats';
// Dungeon Blessings (lib/dungeonBlessing.js): the four per-run slider levels, the Paul checkbox,
// and the two account-wide effectiveness inputs the Hypixel import fills in.
const BLESSING_KEY = 'hexDungeonBlessing';
// Essence-shop perk levels, {perkKey: level} — imported from the account, never typed by hand.
const ESSENCE_PERKS_KEY = 'hexEssencePerks';
// Player-applied debuffs on the target (lib/mobDebuffs.js): Ice Spray, Last Breath, Lethality.
const DEBUFFS_KEY = 'hexMobDebuffs';
// Item buffs (lib/buffs.js): Ragnarock, Sword of Bad Health, Weirder Tuba — on/off toggles.
const BUFFS_KEY = 'hexBuffs';
const MOB_HP_PERCENT_KEY = 'hexMobHpPercent';
const MOB_HP_SELECTIONS_KEY = 'hexMobHpSelections';
const INFERNAL_CRIMSON_STACKS_KEY = 'hexInfernalCrimsonStacks';
const SWARM_MOBS_KEY = 'hexSwarmMobs';
const COMBO_KILLS_KEY = 'hexComboKills';
const LEGION_PLAYERS_KEY = 'hexLegionPlayers';
const BLAZE_CRIMSON_ISLE_KEY = 'hexBlazeCrimsonIsle';
const MAX_BUDGET_KEY = 'hexMaxBudget';
const LAST_GEAR_MODIFIERS_KEY = 'hexLastGearModifiers';
const EDIT_ALL_ARMOR_KEY = 'hexEditAllArmor';
const EDIT_ALL_EQUIPMENT_KEY = 'hexEditAllEquipment';
const BESTIARY_MAXED_MOBS_KEY = 'hexBestiaryMaxedMobs';
const COMBINED_MYTHOLOGICAL_BESTIARY_TIERS_KEY = 'hexCombinedMythologicalBestiaryTiers';
const MAXED_COLLECTIONS_COUNT_KEY = 'hexMaxedCollectionsCount';
const IMPORTED_WEAPONS_KEY = 'hexImportedWeapons';

export const MAX_SWARM_MOBS = 10;
export const MAX_COMBO_KILLS = 10;
export const MAX_LEGION_PLAYERS = 20;

const BuildContext = createContext(null);

// Loads the selected target mob names, migrating the legacy single-mob key into the array format.
function loadInitialTargetMobs() {
  const stored = localStorage.getItem(TARGET_MOBS_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed.filter((n) => typeof n === 'string');
    } catch (err) {
      console.error('Failed to parse saved target mobs:', err);
    }
    return [];
  }
  const legacy = localStorage.getItem(TARGET_MOB_KEY);
  return legacy ? [legacy] : [];
}

// Loads the God Potion on/off toggle (see lib/godPotion.js).
function loadInitialGodPotion() {
  return localStorage.getItem(GOD_POTION_KEY) === 'true';
}

// Loads the God Potion's selected Mixin (see lib/godPotion.js's GOD_POTION_MIXINS) — 'none' for
// anything unrecognized (a fresh browser, or a stale value from before this existed).
function loadInitialGodPotionMixin() {
  const stored = localStorage.getItem(GOD_POTION_MIXIN_KEY);
  return stored && GOD_POTION_MIXINS[stored] ? stored : 'none';
}

// Loads the Armor/Equipment Options screens' "Edit All" toggles (above the Helmet/Necklace
// slots) — while on, a modifier edit made to one piece via the Hex screen (enchants, gemstones,
// reforge, stars, special, recomb, Clean, ...) is broadcast to every other equipped piece in the
// same group. See updateSlotModifiers/setStarCount's `respectEditAll` param below.
function loadInitialEditAllArmor() {
  return localStorage.getItem(EDIT_ALL_ARMOR_KEY) === 'true';
}
function loadInitialEditAllEquipment() {
  return localStorage.getItem(EDIT_ALL_EQUIPMENT_KEY) === 'true';
}

// Loads the "Toggle Dungeon Stats" on/off switch (see lib/dungeonize.js).
function loadInitialUseDungeonizedStats() {
  return localStorage.getItem(USE_DUNGEONIZED_STATS_KEY) === 'true';
}

// Loads the "Toggle Master Mode" on/off switch — only meaningful alongside useDungeonizedStats.
function loadInitialUseMasterMode() {
  return localStorage.getItem(USE_MASTER_MODE_KEY) === 'true';
}

// Loads the "Mage Mode" on/off switch (see lib/abilityDamage.js) — reframes Damage Sources
// around the Ability Damage formula instead of melee/ranged Final Damage.
function loadInitialMageMode() {
  return localStorage.getItem(MAGE_MODE_KEY) === 'true';
}

// A stored class wins; without one, an old `hexMageMode` decides. Healer/Tank grants nothing, so a
// build that was never a Mage keeps the numbers it had.
function loadInitialDungeonClass() {
  const stored = localStorage.getItem(DUNGEON_CLASS_KEY);
  if (isDungeonClassId(stored)) return stored;
  return loadInitialMageMode() ? 'mage' : DEFAULT_DUNGEON_CLASS;
}

// One level per class, not one level overall: an account levels each class separately and an import
// brings all of them, so switching the picker shows that class's real level.
function loadInitialDungeonClassLevels() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DUNGEON_CLASS_LEVEL_KEY) || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // Unparseable or a pre-map single number — start empty rather than guessing which class it was.
  }
  return {};
}

function clampClassLevel(value) {
  return Math.max(0, Math.min(MAX_DUNGEON_CLASS_LEVEL, Number(value) || 0));
}

// Loads the "DPS Mode" on/off switch (see lib/finalDamage.js's computeDpsBreakdown) — reframes
// Damage Sources' Final Damage panel around per-second damage instead of a single per-hit number.
function loadInitialDpsMode() {
  return localStorage.getItem(DPS_MODE_KEY) === 'true';
}

// Which damage output the DPS view reports. These are alternatives rather than layers: a loadout
// swings a weapon or fires a bow, and a Mage staff's Beam replaces the melee hit rather than
// stacking on it. 'bow' is a declared placeholder, selectable and labelled unfinished, so the state
// exists without reporting a melee number under a bow heading.
export const DPS_KINDS = ['melee', 'beam', 'bow'];

function loadInitialDpsKind() {
  const stored = localStorage.getItem(DPS_KIND_KEY);
  return DPS_KINDS.includes(stored) ? stored : 'melee';
}

// The target's current HP% (0-100), used by Execute/Prosecute and to gate First Strike/Triple
// Strike. Pinned at 100 since the Mob HP% slider was removed: it was the only control that wrote
// this, so a stored or shared-loadout value would otherwise be stuck and disagree with the
// Optimizer, which reads the same field. The plumbing stays so a future control can write to it.
const PINNED_MOB_HP_PERCENT = 100;

function loadInitialMobHpPercent() {
  return PINNED_MOB_HP_PERCENT;
}

// Loads the per-mob Floor/Tier picks used to disambiguate a mob with more than one possible
// starting HP (a Catacombs trash mob spawning on several floors, or a Slayer/Mythological boss
// with several tiers — see lib/mobHp.js's getFloorOptions/getTierOptions/resolveStartingHp).
// Keyed by mob name; a mob whose HP is already unambiguous never gets an entry here.
function loadInitialMobHpSelections() {
  const stored = localStorage.getItem(MOB_HP_SELECTIONS_KEY);
  if (!stored) return {};
  try {
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    console.error('Failed to parse saved mob HP selections:', err);
    return {};
  }
}

// The Infernal Crimson combo-stack count (1-10, default 10, i.e. max stacks maintained). Applied
// once 2+ Infernal Crimson pieces are equipped — see lib/armorSetBonuses.js.
function loadInitialInfernalCrimsonStacks() {
  const stored = localStorage.getItem(INFERNAL_CRIMSON_STACKS_KEY);
  const parsed = stored != null ? Number(stored) : INFERNAL_CRIMSON_MAX_STACKS;
  return Number.isFinite(parsed) ? Math.max(1, Math.min(INFERNAL_CRIMSON_MAX_STACKS, parsed)) : INFERNAL_CRIMSON_MAX_STACKS;
}

// Loads the Ultimate Swarm "Swarm Mobs" count (1-10, default 1) — see lib/damageSources.js.
function loadInitialSwarmMobs() {
  const stored = localStorage.getItem(SWARM_MOBS_KEY);
  const parsed = stored != null ? Number(stored) : 1;
  return Number.isFinite(parsed) ? Math.max(1, Math.min(MAX_SWARM_MOBS, parsed)) : 1;
}

// Loads the Ultimate Combo "Combo Kills" count (1-10, default 1) — see lib/damageSources.js.
function loadInitialComboKills() {
  const stored = localStorage.getItem(COMBO_KILLS_KEY);
  const parsed = stored != null ? Number(stored) : 1;
  return Number.isFinite(parsed) ? Math.max(1, Math.min(MAX_COMBO_KILLS, parsed)) : 1;
}

// Loads the Ultimate Legion "Legion Players" count (0-20, default 0) — see lib/damageSources.js.
function loadInitialLegionPlayers() {
  const stored = localStorage.getItem(LEGION_PLAYERS_KEY);
  const parsed = stored != null ? Number(stored) : 0;
  return Number.isFinite(parsed) ? Math.max(0, Math.min(MAX_LEGION_PLAYERS, parsed)) : 0;
}

// Loads the Blaze pet's "In Crimson Isle" toggle.
function loadInitialBlazeCrimsonIsle() {
  return localStorage.getItem(BLAZE_CRIMSON_ISLE_KEY) === 'true';
}

// Mob names (matching lib/mobTypes.js's MOB_TYPES keys) the imported account has maxed the Bestiary
// on — see lib/bestiaryStrength.js. Import-only, with no manual editing UI.
function loadInitialBestiaryMaxedMobs() {
  try {
    const stored = localStorage.getItem(BESTIARY_MAXED_MOBS_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to parse saved bestiary maxed mobs:', err);
    return [];
  }
}

// Every weapon lib/hypixelImport.js's buildWeaponInventoryList found in the imported account's
// inventory, as {item, modifiers, location} entries in the same shape as loadout.weapon.
// Import-only, with no manual editing UI.
function loadInitialImportedWeapons() {
  try {
    const stored = localStorage.getItem(IMPORTED_WEAPONS_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to parse saved imported weapons:', err);
    return [];
  }
}

// Daedalus Blade's "Combined Mythological Bestiary Tiers" input
// (worker/src/index.js's computeCombinedMythologicalBestiaryTiers), independent of the equipped
// weapon so the Optimizer's Diana progression can stamp it onto a candidate the player doesn't own.
// An owned Daedalus Blade reads its own value from NBT lore on import instead.
function loadInitialCombinedMythologicalBestiaryTiers() {
  const stored = localStorage.getItem(COMBINED_MYTHOLOGICAL_BESTIARY_TIERS_KEY);
  const parsed = stored != null ? Number(stored) : 0;
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

// "The One" enchant's per-collection scaling input (worker/src/index.js's
// computeMaxedCollectionsCount), independent of any one owned item, so the Optimizer can evaluate
// applying or levelling The One on a Necklace that doesn't carry it yet.
function loadInitialMaxedCollectionsCount() {
  const stored = localStorage.getItem(MAXED_COLLECTIONS_COUNT_KEY);
  const parsed = stored != null ? Number(stored) : 0;
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

// The Optimizer's max coin budget (0 = unlimited). Priced candidates above it are filtered out of
// the ranked list; unpriced ('?') candidates always stay, since an unverified cost isn't a high one.
function loadInitialMaxBudget() {
  const stored = localStorage.getItem(MAX_BUDGET_KEY);
  const parsed = stored != null ? Number(stored) : 0;
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

// Loads the manually-entered "everything else" Strength/Crit Damage/Intelligence total (Fairy Souls, skill rewards, etc.).
function loadInitialEssencePerks() {
  const stored = localStorage.getItem(ESSENCE_PERKS_KEY);
  if (!stored) return {};
  try {
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.error('Failed to parse saved essence perks:', err);
    return {};
  }
}

function loadInitialBlessing() {
  const fallback = { levels: emptyBlessingLevels(), forbiddenBlessingLevel: 0, masterSkullTier: 0, paulBuff: false };
  const stored = localStorage.getItem(BLESSING_KEY);
  if (!stored) return fallback;
  try {
    const parsed = JSON.parse(stored);
    const levels = emptyBlessingLevels();
    for (const id of BLESSING_IDS) {
      const v = Math.floor(Number(parsed?.levels?.[id]) || 0);
      levels[id] = Math.max(BLESSING_MIN_LEVEL, Math.min(BLESSING_MAX_LEVEL, v));
    }
    return {
      levels,
      forbiddenBlessingLevel: Math.max(0, Math.min(FORBIDDEN_BLESSING_MAX_LEVEL, Math.floor(Number(parsed?.forbiddenBlessingLevel) || 0))),
      masterSkullTier: Math.max(0, Math.min(MASTER_SKULL_MAX_TIER, Math.floor(Number(parsed?.masterSkullTier) || 0))),
      paulBuff: !!parsed?.paulBuff,
    };
  } catch (err) {
    console.error('Failed to parse saved dungeon blessing state:', err);
    return fallback;
  }
}

function loadInitialBuffs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BUFFS_KEY) || 'null');
    return Object.fromEntries(BUFF_ITEMS.map((b) => [b.id, !!parsed?.[b.id]]));
  } catch (err) {
    console.error('Failed to parse saved item buffs:', err);
    return emptyBuffs();
  }
}

function loadInitialDebuffs() {
  const stored = localStorage.getItem(DEBUFFS_KEY);
  if (!stored) return emptyDebuffs();
  try {
    const parsed = JSON.parse(stored);
    return {
      iceSpray: !!parsed?.iceSpray,
      twilightPoison: !!parsed?.twilightPoison,
      lastBreath: Math.max(0, Math.min(LAST_BREATH_MAX_LEVEL, Math.floor(Number(parsed?.lastBreath) || 0))),
      lethality: Math.max(0, Math.min(LETHALITY_MAX_STACKS, Math.floor(Number(parsed?.lethality) || 0))),
    };
  } catch (err) {
    console.error('Failed to parse saved mob debuff state:', err);
    return emptyDebuffs();
  }
}

function loadInitialMiscStats() {
  const stored = localStorage.getItem(MISC_STATS_KEY);
  if (!stored) return { strength: 0, crit_damage: 0, intelligence: 0 };
  try {
    const parsed = JSON.parse(stored);
    return {
      strength: typeof parsed.strength === 'number' ? parsed.strength : 0,
      crit_damage: typeof parsed.crit_damage === 'number' ? parsed.crit_damage : 0,
      intelligence: typeof parsed.intelligence === 'number' ? parsed.intelligence : 0,
    };
  } catch (err) {
    console.error('Failed to parse saved misc stats:', err);
    return { strength: 0, crit_damage: 0, intelligence: 0 };
  }
}

// Loads account-wide Attribute levels (see lib/attributes.js), defaulting every known id to 0.
function loadInitialAttributes() {
  const defaults = Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, 0]));
  const stored = localStorage.getItem(ATTRIBUTES_KEY);
  if (!stored) return defaults;
  try {
    const parsed = JSON.parse(stored);
    for (const id of ATTRIBUTE_IDS) {
      if (typeof parsed[id] === 'number') defaults[id] = Math.max(0, Math.min(getAttributeMaxLevel(id), Math.floor(parsed[id])));
    }
    return defaults;
  } catch (err) {
    console.error('Failed to parse saved attributes:', err);
    return defaults;
  }
}

// Loads global player levels (Combat, Skyblock, Foraging, Catacombs, Taming, Wolf Slayer,
// General's Medallion digits — see lib/playerStats.js and lib/dungeonize.js).
function loadInitialPlayerStats() {
  const defaults = {
    combatLevel: 0,
    skyblockLevel: 0,
    foragingLevel: 0,
    catacombsLevel: 0,
    tamingLevel: 0,
    wolfSlayerLevel: 0,
    tarantulaSlayerLevel: 0,
    blazeSlayerLevel: 0,
    alchemyLevel: 0,
    enchantingLevel: 0,
    miningLevel: 0,
    lonesomeMinerLevel: 0,
    generalsMedallionDigits: 0,
    blazetekkHamRadio: false,
  };
  const stored = localStorage.getItem(PLAYER_STATS_KEY);
  if (!stored) return defaults;
  try {
    const parsed = JSON.parse(stored);
    return {
      combatLevel: typeof parsed.combatLevel === 'number' ? parsed.combatLevel : 0,
      skyblockLevel: typeof parsed.skyblockLevel === 'number' ? parsed.skyblockLevel : 0,
      foragingLevel: typeof parsed.foragingLevel === 'number' ? parsed.foragingLevel : 0,
      catacombsLevel: typeof parsed.catacombsLevel === 'number' ? parsed.catacombsLevel : 0,
      tamingLevel: typeof parsed.tamingLevel === 'number' ? parsed.tamingLevel : 0,
      wolfSlayerLevel: typeof parsed.wolfSlayerLevel === 'number' ? parsed.wolfSlayerLevel : 0,
      tarantulaSlayerLevel: typeof parsed.tarantulaSlayerLevel === 'number' ? parsed.tarantulaSlayerLevel : 0,
      blazeSlayerLevel: typeof parsed.blazeSlayerLevel === 'number' ? parsed.blazeSlayerLevel : 0,
      alchemyLevel: typeof parsed.alchemyLevel === 'number' ? parsed.alchemyLevel : 0,
      enchantingLevel: typeof parsed.enchantingLevel === 'number' ? parsed.enchantingLevel : 0,
      miningLevel: typeof parsed.miningLevel === 'number' ? parsed.miningLevel : 0,
      lonesomeMinerLevel: typeof parsed.lonesomeMinerLevel === 'number' ? parsed.lonesomeMinerLevel : 0,
      generalsMedallionDigits: typeof parsed.generalsMedallionDigits === 'number' ? parsed.generalsMedallionDigits : 0,
      blazetekkHamRadio: typeof parsed.blazetekkHamRadio === 'boolean' ? parsed.blazetekkHamRadio : false,
    };
  } catch (err) {
    console.error('Failed to parse saved player stats:', err);
    return defaults;
  }
}

// Loads the loadout — a sparse map, absent slot keys meaning nothing equipped there.
function loadInitial() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return {};
  try {
    const parsed = JSON.parse(stored);
    const next = {};
    for (const slot of Object.keys(parsed || {})) {
      const entry = parsed[slot];
      if (slot === 'accessory') {
        // Unlike every other slot, Accessory can be saved with no item (just a pre-entered
        // Magical Power waiting on a Power Stone pick) — item is intentionally optional here.
        if (typeof entry?.modifiers?.magicalPower !== 'number') continue;
        next[slot] = entry;
        continue;
      }
      // Discard entries saved under an older schema shape.
      if (!entry?.item) continue;
      if (slot === 'pet') {
        if (typeof entry?.modifiers?.level !== 'number') continue;
      } else {
        if (!Array.isArray(entry?.modifiers?.hexEnchantments)) continue;
        if (typeof entry?.modifiers?.books !== 'number') continue;
      }
      next[slot] = entry;
    }
    return next;
  } catch (err) {
    console.error('Failed to parse saved loadout:', err);
    return {};
  }
}

// Loads the "last modifiers seen per gear slot" stash — see removeSlot/selectItem below. Keyed by
// slot (weapon/helmet/.../gloves only, never pet or accessory), holding a plain modifiers object.
function loadInitialLastGearModifiers() {
  const stored = localStorage.getItem(LAST_GEAR_MODIFIERS_KEY);
  if (!stored) return {};
  try {
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.error('Failed to parse saved last-gear-modifiers stash:', err);
    return {};
  }
}

// Undo/redo history depth — bounds memory for a long session; well past what anyone would
// actually step back through by hand.
const MAX_LOADOUT_HISTORY = 50;

export function BuildProvider({ children }) {
  // BuildProvider is nested inside ItemDataProvider (App.jsx), so this is safe. selectItem uses it to
  // validate a carried-over reforge against the catalog without every caller passing it in.
  const { itemData } = useItemData();
  const [loadout, setLoadoutRaw] = useState(loadInitial);
  // Past and future loadout snapshots for Undo/Redo. Refs rather than state: every push and pop
  // happens in the same tick as a setLoadoutRaw call, so canUndo/canRedo read from them during a
  // render that is already happening.
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);

  // Every call site below calls `setLoadout(updater)`, function or value, exactly like the native
  // useState setter this replaces, so they all get Undo/Redo tracking without changes. A no-op
  // update — some updaters return `prev` unchanged — is caught by reference equality and not pushed.
  const setLoadout = useCallback((update) => {
    setLoadoutRaw((prev) => {
      const next = typeof update === 'function' ? update(prev) : update;
      if (next === prev) return prev;
      undoStackRef.current.push(prev);
      if (undoStackRef.current.length > MAX_LOADOUT_HISTORY) undoStackRef.current.shift();
      redoStackRef.current = [];
      return next;
    });
  }, []);

  // Undo/redo bypass the tracked `setLoadout` above (that would just push the current state back
  // onto its own undo stack) and move snapshots directly between the two stacks instead.
  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    setLoadoutRaw((prev) => {
      const previous = undoStackRef.current.pop();
      redoStackRef.current.push(prev);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(previous));
      return previous;
    });
  }, []);

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    setLoadoutRaw((prev) => {
      const next = redoStackRef.current.pop();
      undoStackRef.current.push(prev);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const canUndo = undoStackRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;

  // Doesn't need to trigger re-renders (only ever read at selectItem time), so a ref instead of
  // state — keeps removeSlot/selectItem's useCallback deps stable.
  const lastGearModifiersRef = useRef(loadInitialLastGearModifiers());
  const [playerStats, setPlayerStats] = useState(loadInitialPlayerStats);
  const [targetMobs, setTargetMobsState] = useState(loadInitialTargetMobs);
  const [godPotionActive, setGodPotionActiveState] = useState(loadInitialGodPotion);
  const [godPotionMixin, setGodPotionMixinState] = useState(loadInitialGodPotionMixin);
  const [editAllArmor, setEditAllArmorState] = useState(loadInitialEditAllArmor);
  const [editAllEquipment, setEditAllEquipmentState] = useState(loadInitialEditAllEquipment);
  const [useDungeonizedStats, setUseDungeonizedStatsState] = useState(loadInitialUseDungeonizedStats);
  const [useMasterMode, setUseMasterModeState] = useState(loadInitialUseMasterMode);
  const [dungeonClass, setDungeonClassState] = useState(loadInitialDungeonClass);
  const [dungeonClassLevels, setDungeonClassLevelsState] = useState(loadInitialDungeonClassLevels);
  const dungeonClassLevel = clampClassLevel(dungeonClassLevels[dungeonClass]);
  // Every existing Mage Mode consumer (the optimizer's resolveOptimizerMode, Compare, Accessory
  // Tuning, the share-link codec) reads this rather than the class id, so picking Mage keeps them
  // all working unchanged.
  const mageMode = dungeonClass === 'mage';
  const [dpsMode, setDpsModeState] = useState(loadInitialDpsMode);
  const [dpsKind, setDpsKindState] = useState(loadInitialDpsKind);
  // Pet OWNERSHIP, not the equipped pet — it upgrades the Dungeon Potion's tier from the menu.
  const [hasJellyfishPet, setHasJellyfishPetState] = useState(() => localStorage.getItem(HAS_JELLYFISH_PET_KEY) === 'true');
  const [attributes, setAttributesState] = useState(loadInitialAttributes);
  const [miscStats, setMiscStatsState] = useState(loadInitialMiscStats);
  const [blessing, setBlessingState] = useState(loadInitialBlessing);
  const [debuffs, setDebuffsState] = useState(loadInitialDebuffs);
  const [buffs, setBuffsState] = useState(loadInitialBuffs);
  const [essencePerks, setEssencePerksState] = useState(loadInitialEssencePerks);
  const [mobHpPercent, setMobHpPercentState] = useState(loadInitialMobHpPercent);
  const [mobHpSelections, setMobHpSelectionsState] = useState(loadInitialMobHpSelections);
  const [infernalCrimsonStacks, setInfernalCrimsonStacksState] = useState(loadInitialInfernalCrimsonStacks);
  const [swarmMobs, setSwarmMobsState] = useState(loadInitialSwarmMobs);
  const [comboKills, setComboKillsState] = useState(loadInitialComboKills);
  const [legionPlayers, setLegionPlayersState] = useState(loadInitialLegionPlayers);
  const [blazeCrimsonIsle, setBlazeCrimsonIsleState] = useState(loadInitialBlazeCrimsonIsle);
  const [bestiaryMaxedMobs, setBestiaryMaxedMobsState] = useState(loadInitialBestiaryMaxedMobs);
  const [importedWeapons, setImportedWeaponsState] = useState(loadInitialImportedWeapons);
  const [combinedMythologicalBestiaryTiers, setCombinedMythologicalBestiaryTiersState] = useState(
    loadInitialCombinedMythologicalBestiaryTiers,
  );
  const [maxedCollectionsCount, setMaxedCollectionsCountState] = useState(loadInitialMaxedCollectionsCount);
  const [maxBudget, setMaxBudgetState] = useState(loadInitialMaxBudget);

  const setMobHpPercent = useCallback((value) => {
    const clamped = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    setMobHpPercentState(clamped);
    localStorage.setItem(MOB_HP_PERCENT_KEY, String(clamped));
  }, []);

  // value=null/'' clears the pick for that mob (back to "no selection" — the DPS-by-hit graph's
  // fallback to the static Mob HP% slider) rather than storing an empty entry.
  const setMobHpSelection = useCallback((mobName, value) => {
    setMobHpSelectionsState((prev) => {
      const next = { ...prev };
      if (value) next[mobName] = value;
      else delete next[mobName];
      localStorage.setItem(MOB_HP_SELECTIONS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setInfernalCrimsonStacks = useCallback((value) => {
    const clamped = Math.max(1, Math.min(INFERNAL_CRIMSON_MAX_STACKS, Math.round(Number(value) || INFERNAL_CRIMSON_MAX_STACKS)));
    setInfernalCrimsonStacksState(clamped);
    localStorage.setItem(INFERNAL_CRIMSON_STACKS_KEY, String(clamped));
  }, []);

  const setSwarmMobs = useCallback((value) => {
    const clamped = Math.max(1, Math.min(MAX_SWARM_MOBS, Math.round(Number(value) || 1)));
    setSwarmMobsState(clamped);
    localStorage.setItem(SWARM_MOBS_KEY, String(clamped));
  }, []);

  const setComboKills = useCallback((value) => {
    const clamped = Math.max(1, Math.min(MAX_COMBO_KILLS, Math.round(Number(value) || 1)));
    setComboKillsState(clamped);
    localStorage.setItem(COMBO_KILLS_KEY, String(clamped));
  }, []);

  const setLegionPlayers = useCallback((value) => {
    const clamped = Math.max(0, Math.min(MAX_LEGION_PLAYERS, Math.round(Number(value) || 0)));
    setLegionPlayersState(clamped);
    localStorage.setItem(LEGION_PLAYERS_KEY, String(clamped));
  }, []);

  const toggleBlazeCrimsonIsle = useCallback(() => {
    setBlazeCrimsonIsleState((prev) => {
      const next = !prev;
      localStorage.setItem(BLAZE_CRIMSON_ISLE_KEY, String(next));
      return next;
    });
  }, []);

  const setMaxBudget = useCallback((value) => {
    const clamped = Math.max(0, Math.floor(Number(value) || 0));
    setMaxBudgetState(clamped);
    localStorage.setItem(MAX_BUDGET_KEY, String(clamped));
  }, []);

  const setAttributeLevel = useCallback((id, level) => {
    setAttributesState((prev) => {
      const clamped = Math.max(0, Math.min(getAttributeMaxLevel(id), Math.floor(level) || 0));
      const next = { ...prev, [id]: clamped };
      localStorage.setItem(ATTRIBUTES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // One setter for the whole blessing block — the slider levels, the Paul checkbox and the two
  // imported effectiveness inputs all live in the same persisted object.
  const updateBlessing = useCallback((patch) => {
    setBlessingState((prev) => {
      const next = { ...prev, ...patch, levels: { ...prev.levels, ...(patch.levels || {}) } };
      localStorage.setItem(BLESSING_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setBlessingLevel = useCallback(
    (id, value) => {
      const level = Math.max(BLESSING_MIN_LEVEL, Math.min(BLESSING_MAX_LEVEL, Math.floor(Number(value) || 0)));
      updateBlessing({ levels: { [id]: level } });
    },
    [updateBlessing],
  );

  const setPaulBuff = useCallback((value) => updateBlessing({ paulBuff: !!value }), [updateBlessing]);

  // One setter for the whole debuff block, same shape as updateBlessing above — the Ice Spray
  // checkbox and the two sliders all live in one persisted object.
  const updateDebuffs = useCallback((patch) => {
    setDebuffsState((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(DEBUFFS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setIceSpray = useCallback((value) => updateDebuffs({ iceSpray: !!value }), [updateDebuffs]);
  const setTwilightPoison = useCallback((value) => updateDebuffs({ twilightPoison: !!value }), [updateDebuffs]);

  // One toggle setter for every item buff (lib/buffs.js) — same persisted-object shape as debuffs.
  const setBuff = useCallback((id, value) => {
    setBuffsState((prev) => {
      const next = { ...prev, [id]: !!value };
      localStorage.setItem(BUFFS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  const setLastBreathLevel = useCallback(
    (value) => updateDebuffs({ lastBreath: Math.max(0, Math.min(LAST_BREATH_MAX_LEVEL, Math.floor(Number(value) || 0))) }),
    [updateDebuffs],
  );
  const setLethalityStacks = useCallback(
    (value) => updateDebuffs({ lethality: Math.max(0, Math.min(LETHALITY_MAX_STACKS, Math.floor(Number(value) || 0))) }),
    [updateDebuffs],
  );

  // Imported from the account, but editable afterwards on the Player Levels page — a manually
  // built loadout has no import to get them from. The Mimic shard is deliberately NOT here: it's a
  // normal attribute now (`attributes.mimic`), imported through importHypixelAttributes.
  const importHypixelBlessingInputs = useCallback(
    ({ forbiddenBlessingLevel, masterSkullTier }) =>
      updateBlessing({
        forbiddenBlessingLevel: Math.max(0, Math.min(FORBIDDEN_BLESSING_MAX_LEVEL, Math.floor(Number(forbiddenBlessingLevel) || 0))),
        masterSkullTier: Math.max(0, Math.min(MASTER_SKULL_MAX_TIER, Math.floor(Number(masterSkullTier) || 0))),
      }),
    [updateBlessing],
  );

  // Replaces the map wholesale, same "an import is authoritative" rule importHypixelAttributes
  // follows — a perk the account no longer has must not survive from a previous import.
  const importHypixelEssencePerks = useCallback((perks) => {
    const next = {};
    for (const [key, level] of Object.entries(perks || {})) {
      const n = Math.floor(Number(level) || 0);
      if (n > 0) next[key] = n;
    }
    setEssencePerksState(next);
    localStorage.setItem(ESSENCE_PERKS_KEY, JSON.stringify(next));
  }, []);

  // Normally import-only, but the Optimizer can suggest levelling one — see its
  // evaluateEssencePerkCandidates / applyOptimizerResult.
  const setEssencePerkLevel = useCallback((key, level) => {
    setEssencePerksState((prev) => {
      const next = { ...prev, [key]: Math.max(0, Math.floor(Number(level) || 0)) };
      localStorage.setItem(ESSENCE_PERKS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setForbiddenBlessingLevel = useCallback(
    (level) => updateBlessing({ forbiddenBlessingLevel: Math.max(0, Math.min(FORBIDDEN_BLESSING_MAX_LEVEL, Math.floor(Number(level) || 0))) }),
    [updateBlessing],
  );

  // Derived from the equipped Master Skull on import, but typeable too — a manually built loadout
  // has no accessory bag to read it off.
  const setMasterSkullTier = useCallback(
    (tier) => updateBlessing({ masterSkullTier: Math.max(0, Math.min(MASTER_SKULL_MAX_TIER, Math.floor(Number(tier) || 0))) }),
    [updateBlessing],
  );

  const setMiscStat = useCallback((statKey, value) => {
    setMiscStatsState((prev) => {
      const next = { ...prev, [statKey]: Number(value) || 0 };
      localStorage.setItem(MISC_STATS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Adds or removes one mob from the selection, and auto-toggles God Potion with it: its effects
  // don't work inside The Catacombs, so with at least one mob selected the potion goes on when none
  // of them is Catacombs-located and off when any is. An empty selection leaves it untouched.
  const toggleTargetMob = useCallback((name) => {
    setTargetMobsState((prev) => {
      const next = prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name];
      localStorage.setItem(TARGET_MOBS_KEY, JSON.stringify(next));
      localStorage.removeItem(TARGET_MOB_KEY);
      if (next.length > 0) {
        const anyCatacombs = next.some((n) => (MOB_LOCATIONS[n] || []).includes(CATACOMBS_LOCATION));
        setGodPotionActiveState(!anyCatacombs);
        localStorage.setItem(GOD_POTION_KEY, String(!anyCatacombs));
      }
      return next;
    });
  }, []);

  const clearTargetMobs = useCallback(() => {
    setTargetMobsState([]);
    localStorage.setItem(TARGET_MOBS_KEY, JSON.stringify([]));
    localStorage.removeItem(TARGET_MOB_KEY);
  }, []);

  const toggleGodPotion = useCallback(() => {
    setGodPotionActiveState((prev) => {
      const next = !prev;
      localStorage.setItem(GOD_POTION_KEY, String(next));
      return next;
    });
  }, []);

  const setGodPotionActive = useCallback((value) => {
    setGodPotionActiveState(!!value);
    localStorage.setItem(GOD_POTION_KEY, String(!!value));
  }, []);

  const setGodPotionMixin = useCallback((mixin) => {
    const next = GOD_POTION_MIXINS[mixin] ? mixin : 'none';
    setGodPotionMixinState(next);
    localStorage.setItem(GOD_POTION_MIXIN_KEY, next);
  }, []);

  const toggleEditAllArmor = useCallback(() => {
    setEditAllArmorState((prev) => {
      const next = !prev;
      localStorage.setItem(EDIT_ALL_ARMOR_KEY, String(next));
      return next;
    });
  }, []);

  const toggleEditAllEquipment = useCallback(() => {
    setEditAllEquipmentState((prev) => {
      const next = !prev;
      localStorage.setItem(EDIT_ALL_EQUIPMENT_KEY, String(next));
      return next;
    });
  }, []);

  // "Clear All" (Armor/Equipment Options): removes every equipped piece in the group and wipes each
  // slot's lastGearModifiers stash, so a later re-pick starts from defaults rather than restoring the
  // old reforge, stars and gemstones.
  const clearGroup = useCallback((slots) => {
    setLoadout((prev) => {
      const next = { ...prev };
      let changed = false;
      const stash = { ...lastGearModifiersRef.current };
      for (const slot of slots) {
        if (!prev[slot]) continue;
        changed = true;
        delete stash[slot];
        delete next[slot];
      }
      if (!changed) return prev;
      lastGearModifiersRef.current = stash;
      localStorage.setItem(LAST_GEAR_MODIFIERS_KEY, JSON.stringify(stash));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  const clearArmor = useCallback(() => clearGroup(ARMOR_SLOTS), [clearGroup]);
  const clearEquipment = useCallback(() => clearGroup(EQUIPMENT_SLOTS), [clearGroup]);

  const toggleUseDungeonizedStats = useCallback(() => {
    setUseDungeonizedStatsState((prev) => {
      const next = !prev;
      localStorage.setItem(USE_DUNGEONIZED_STATS_KEY, String(next));
      return next;
    });
  }, []);

  const toggleUseMasterMode = useCallback(() => {
    setUseMasterModeState((prev) => {
      const next = !prev;
      localStorage.setItem(USE_MASTER_MODE_KEY, String(next));
      return next;
    });
  }, []);

  const setDungeonClass = useCallback((id) => {
    const next = isDungeonClassId(id) ? id : DEFAULT_DUNGEON_CLASS;
    setDungeonClassState(next);
    localStorage.setItem(DUNGEON_CLASS_KEY, next);
    // Kept in step so an old-format share link generated from this build still reads correctly.
    localStorage.setItem(MAGE_MODE_KEY, String(next === 'mage'));
  }, []);

  // Writes the level of whichever class is picked, leaving the other three alone.
  const setDungeonClassLevel = useCallback(
    (value) => {
      setDungeonClassLevelsState((prev) => {
        const next = { ...prev, [dungeonClass]: clampClassLevel(value) };
        localStorage.setItem(DUNGEON_CLASS_LEVEL_KEY, JSON.stringify(next));
        return next;
      });
    },
    [dungeonClass],
  );

  // The whole per-class map at once, as a Hypixel import supplies it.
  const importHypixelDungeonClassLevels = useCallback((levels) => {
    setDungeonClassLevelsState((prev) => {
      const next = { ...prev };
      for (const [id, level] of Object.entries(levels || {})) {
        if (isDungeonClassId(id)) next[id] = clampClassLevel(level);
      }
      localStorage.setItem(DUNGEON_CLASS_LEVEL_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setHasJellyfishPet = useCallback((value) => {
    setHasJellyfishPetState(!!value);
    localStorage.setItem(HAS_JELLYFISH_PET_KEY, String(!!value));
  }, []);

  const setDpsKind = useCallback((kind) => {
    const next = DPS_KINDS.includes(kind) ? kind : 'melee';
    setDpsKindState(next);
    localStorage.setItem(DPS_KIND_KEY, next);
  }, []);

  const toggleDpsMode = useCallback(() => {
    setDpsModeState((prev) => {
      const next = !prev;
      localStorage.setItem(DPS_MODE_KEY, String(next));
      return next;
    });
  }, []);

  const setCombatLevel = useCallback((value) => {
    setPlayerStats((prev) => {
      const next = { ...prev, combatLevel: value };
      localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setSkyblockLevel = useCallback((value) => {
    setPlayerStats((prev) => {
      const next = { ...prev, skyblockLevel: value };
      localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setForagingLevel = useCallback((value) => {
    setPlayerStats((prev) => {
      const next = { ...prev, foragingLevel: value };
      localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setCatacombsLevel = useCallback((value) => {
    setPlayerStats((prev) => {
      const next = { ...prev, catacombsLevel: value };
      localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setTamingLevel = useCallback((value) => {
    setPlayerStats((prev) => {
      const next = { ...prev, tamingLevel: value };
      localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setWolfSlayerLevel = useCallback((value) => {
    setPlayerStats((prev) => {
      const next = { ...prev, wolfSlayerLevel: value };
      localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setTarantulaSlayerLevel = useCallback((value) => {
    setPlayerStats((prev) => {
      const next = { ...prev, tarantulaSlayerLevel: value };
      localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setBlazeSlayerLevel = useCallback((value) => {
    setPlayerStats((prev) => {
      const next = { ...prev, blazeSlayerLevel: value };
      localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setAlchemyLevel = useCallback((value) => {
    setPlayerStats((prev) => {
      const next = { ...prev, alchemyLevel: value };
      localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setEnchantingLevel = useCallback((value) => {
    setPlayerStats((prev) => {
      const next = { ...prev, enchantingLevel: value };
      localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setMiningLevel = useCallback((value) => {
    setPlayerStats((prev) => {
      const next = { ...prev, miningLevel: value };
      localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setLonesomeMinerLevel = useCallback((value) => {
    setPlayerStats((prev) => {
      const next = { ...prev, lonesomeMinerLevel: value };
      localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setGeneralsMedallionDigits = useCallback((value) => {
    setPlayerStats((prev) => {
      const next = { ...prev, generalsMedallionDigits: value };
      localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Blazetekk™ Ham Radio: manual — real ownership (it's a placed/inventory item, not equipped
  // gear or an Accessory Bag member) has no signal this app's Hypixel import currently reads. See
  // lib/damageSources.js for the Bluetooth/Bluertooth Ring damage bonus this toggle gates.
  const toggleBlazetekkHamRadio = useCallback(() => {
    setPlayerStats((prev) => {
      const next = { ...prev, blazetekkHamRadio: !prev.blazetekkHamRadio };
      localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Shared by every modifier setter below: no-ops on an empty slot, otherwise runs `updater` over the
  // slot's modifiers and persists.
  // `respectEditAll` (default true) lets a caller opt out of the Edit All broadcast while it is on —
  // used by applyOptimizerResult, since Edit All is scoped to the Hex screen rather than a swap-in.
  // `updater` receives (modifiers, item); the second argument lets a setter that only fits certain
  // items (applyGemstone's slot count, applyReforge's category and rarity, setRarityOverride's
  // config) inspect what it is being applied to and no-op when it doesn't fit, rather than copying
  // the origin piece's edit onto every other piece. Most updaters ignore it.
  const updateSlotModifiers = useCallback(
    (slot, updater, respectEditAll = true) => {
      setLoadout((prev) => {
        if (!prev[slot]) return prev;
        const next = { ...prev, [slot]: { ...prev[slot], modifiers: updater(prev[slot].modifiers, prev[slot].item) } };
        // Edit All (Armor/Equipment Options popups, above the Helmet/Necklace slots) — the same
        // modifier change also applies to every other equipped piece in the group, each running
        // `updater` over ITS OWN current modifiers independently rather than copying the target
        // slot's result, so a piece already in a different state (e.g. a different reforge) merges
        // the same real change instead of being overwritten wholesale.
        const group = !respectEditAll
          ? null
          : editAllArmor && ARMOR_SLOTS.includes(slot)
            ? ARMOR_SLOTS
            : editAllEquipment && EQUIPMENT_SLOTS.includes(slot)
              ? EQUIPMENT_SLOTS
              : null;
        if (group) {
          for (const other of group) {
            if (other === slot || !next[other]) continue;
            next[other] = { ...next[other], modifiers: updater(next[other].modifiers, next[other].item) };
          }
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    [editAllArmor, editAllEquipment],
  );

  // Equips `item` into `slot`. Every rule about what survives the swap — which modifiers carry,
  // the gemstone clip, the reforge-applicability check, star carry-over and the Kuudra reset, and
  // the weapon-family boundary that drops the lot — lives in lib/slotSelection.js, shared with the
  // Optimizer's own pure apply (lib/applyResult.js) so a planned swap and a clicked one can't
  // diverge. The stash below is this screen's own affordance: remove-then-repick is the only way
  // to reach here with the slot already empty, so `prev[slot]` is gone by then and the last-seen
  // modifiers have to come from somewhere. A planner never has one.
  const selectItem = useCallback(
    (slot, item) => {
      setLoadout((prev) => {
        const stashedRaw = slot !== 'pet' && slot !== 'accessory' ? lastGearModifiersRef.current[slot] : null;
        // Normalizes the older stash shape (a bare modifiers object) alongside the current
        // { modifiers, category } one; an old entry has no `category`, so it is treated as
        // same-family.
        const stashedEntry = stashedRaw ? (stashedRaw.modifiers ? stashedRaw : { modifiers: stashedRaw, category: null }) : null;
        const next = {
          ...prev,
          [slot]: buildSlotEntry({ slot, item, prevEntry: prev[slot], stashedEntry, itemData }),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    [itemData],
  );

  // Merges a Hypixel-import gear patch (see lib/hypixelImport.js) into the current loadout —
  // only the slots present in `patch` are touched (already-full {item, modifiers} entries, not
  // reset to defaults like selectItem does), everything else about the build (attributes, player
  // levels, target mobs, misc toggles, the Accessory slot) is left exactly as it was.
  const importHypixelLoadout = useCallback((patch) => {
    setLoadout((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Applies a Hypixel-import attribute patch. An import REPLACES the attribute panel rather than
  // merging into it: every id starts at 0, the same state the Attributes screen's [Min Attributes]
  // button produces, and only what the profile actually has is written back, so a hand-set or
  // previously-imported attribute can't linger. The caller only invokes this when the profile really
  // returned attribute data, so an empty response can't wipe a hand-built panel.
  const importHypixelAttributes = useCallback((patch) => {
    setAttributesState(() => {
      const next = Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, 0]));
      for (const [id, level] of Object.entries(patch || {})) {
        if (ATTRIBUTE_IDS.includes(id)) next[id] = Math.max(0, Math.min(getAttributeMaxLevel(id), Math.floor(level) || 0));
      }
      localStorage.setItem(ATTRIBUTES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Merges a Hypixel-import player-stats patch (wolfSlayerLevel/alchemyLevel/enchantingLevel) —
  // only the keys present in `patch` are touched.
  // One named level, by its playerStats key — the Optimizer's free Skill-level suggestions apply
  // through this rather than through nine slot-specific setters (see optimizer.js's
  // evaluateSkillLevelCandidates).
  const setPlayerLevel = useCallback((key, value) => {
    setPlayerStats((prev) => {
      const next = { ...prev, [key]: Math.max(0, Math.floor(Number(value) || 0)) };
      localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const importHypixelPlayerStats = useCallback((patch) => {
    setPlayerStats((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Full replacement rather than a merge: an import is a complete snapshot of which mobs are maxed
  // now (worker/src/index.js's computeBestiaryMaxedMobs).
  const importHypixelBestiaryMaxedMobs = useCallback((names) => {
    const next = Array.isArray(names) ? names : [];
    setBestiaryMaxedMobsState(next);
    localStorage.setItem(BESTIARY_MAXED_MOBS_KEY, JSON.stringify(next));
  }, []);

  // Full replacement too: the account's weapon inventory as of this import, so a weapon sold or
  // moved since the last one doesn't linger in the list.
  const importHypixelWeaponList = useCallback((entries) => {
    const next = Array.isArray(entries) ? entries : [];
    setImportedWeaponsState(next);
    localStorage.setItem(IMPORTED_WEAPONS_KEY, JSON.stringify(next));
  }, []);

  // Equips one entry from the imported-weapons list with its own {item, modifiers} as imported,
  // rather than selectItem's carry-over treatment: an account weapon already has its own reforge,
  // enchants and stars, which carrying the previous weapon's modifiers would overwrite.
  const equipImportedWeapon = useCallback((entry) => {
    if (!entry) return;
    setLoadout((prev) => {
      const next = { ...prev, weapon: { item: entry.item, modifiers: entry.modifiers } };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Same full-replacement treatment as importHypixelBestiaryMaxedMobs above — a fresh import is a
  // complete, authoritative recomputation from real kill data, not a patch.
  const importHypixelCombinedMythologicalBestiaryTiers = useCallback((value) => {
    const next = Number.isFinite(value) ? Math.max(0, value) : 0;
    setCombinedMythologicalBestiaryTiersState(next);
    localStorage.setItem(COMBINED_MYTHOLOGICAL_BESTIARY_TIERS_KEY, String(next));
  }, []);

  // Same full-replacement treatment as the two imports above.
  const importHypixelMaxedCollectionsCount = useCallback((value) => {
    const next = Number.isFinite(value) ? Math.max(0, value) : 0;
    setMaxedCollectionsCountState(next);
    localStorage.setItem(MAXED_COLLECTIONS_COUNT_KEY, String(next));
  }, []);

  // Fully unequips a slot, dropping its key from the loadout entirely.
  const removeSlot = useCallback((slot) => {
    setLoadout((prev) => {
      if (!prev[slot]) return prev;
      // Stash this slot's modifiers before they're gone — selectItem restores them onto whatever
      // item gets picked next for this slot, so recomb/enchants/gemstones/etc. survive a
      // remove-then-repick instead of resetting. Pet/Accessory aren't stashed here: pet's
      // modifiers (level, held item) don't carry meaning across different species, and Accessory
      // already carries over via its own `prev.accessory` read in selectItem (reachable without
      // going through remove first).
      if (slot !== 'pet' && slot !== 'accessory') {
        // `category` rides along so selectItem can tell a same-family repick (Sword -> another
        // Sword) apart from a cross-family one (Sword -> Bow) — see slotSelection.js's
        // weaponTypeGroup, which buildSlotEntry consults.
        lastGearModifiersRef.current = {
          ...lastGearModifiersRef.current,
          [slot]: { modifiers: prev[slot].modifiers, category: prev[slot].item?.category ?? null },
        };
        localStorage.setItem(LAST_GEAR_MODIFIERS_KEY, JSON.stringify(lastGearModifiersRef.current));
      }
      const next = { ...prev };
      delete next[slot];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Applies (or replaces) a chosen level for one enchant. Ultimate enchants occupy their own single slot; normal enchants upsert by id. removeIds (conflicting enchants) are dropped first.
  const applyEnchant = useCallback(
    (slot, id, level, maxLevel, removeIds = [], respectEditAll = true) => {
      updateSlotModifiers(
        slot,
        (modifiers) => {
          const entry = { id, level, maxLevel };
          let hexEnchantments = modifiers.hexEnchantments.filter((e) => !removeIds.includes(e.id));
          let ultimateEnchantment =
            modifiers.ultimateEnchantment && removeIds.includes(modifiers.ultimateEnchantment.id)
              ? null
              : modifiers.ultimateEnchantment;

          if (isUltimateEnchant(id)) {
            return { ...modifiers, ultimateEnchantment: entry, hexEnchantments };
          }
          return {
            ...modifiers,
            hexEnchantments: [...hexEnchantments.filter((e) => e.id !== id), entry],
            ultimateEnchantment,
          };
        },
        respectEditAll,
      );
    },
    [updateSlotModifiers],
  );

  // Sets (or replaces) the gemstone in one slot index — gemstones is a sparse array indexed by slot position.
  const applyGemstone = useCallback(
    (slot, slotIndex, gemId, tier, respectEditAll = true) => {
      updateSlotModifiers(
        slot,
        (modifiers, item) => {
          // Edit All: skip pieces that don't actually have a real gemstone slot at this index
          // (see lib/gemstones.js's countGemstoneSlots) instead of writing a phantom entry that
          // still adds its stat bonus in applyGemstonesToLore despite having no matching bracket.
          if (item && slotIndex >= countGemstoneSlots(item.lore)) return modifiers;
          // Also skip when this OTHER piece's real slot type at this index doesn't accept this gem
          // (e.g. broadcasting a Sapphire from Storm Helmet's slot 0 onto a piece whose own slot 0
          // is Jasper-only) — see lib/gemstones.js's getAllowedGemsForSlotType.
          if (item && !getAllowedGemsForSlotType(item.gemstone_slots?.[slotIndex]?.slot_type).includes(gemId)) return modifiers;
          const gemstones = (modifiers.gemstones || []).slice();
          gemstones[slotIndex] = { gem: gemId, tier };
          return { ...modifiers, gemstones };
        },
        respectEditAll,
      );
    },
    [updateSlotModifiers],
  );

  const removeGemstone = useCallback(
    (slot, slotIndex) => {
      updateSlotModifiers(slot, (modifiers) => {
        const gemstones = (modifiers.gemstones || []).slice();
        gemstones[slotIndex] = null;
        return { ...modifiers, gemstones };
      });
    },
    [updateSlotModifiers],
  );

  // Sets the combined Hot/Fuming Potato Book count (0-15).
  const setBookCount = useCallback(
    (slot, count) => {
      updateSlotModifiers(slot, (modifiers) => ({ ...modifiers, books: count }));
    },
    [updateSlotModifiers],
  );

  const setSpecialValue = useCallback(
    (slot, value, respectEditAll = true) => {
      updateSlotModifiers(slot, (modifiers) => ({ ...modifiers, special: value }), respectEditAll);
    },
    [updateSlotModifiers],
  );

  const toggleArtOfWar = useCallback(
    (slot) => {
      updateSlotModifiers(slot, (modifiers) => ({ ...modifiers, artOfWar: !modifiers.artOfWar }));
    },
    [updateSlotModifiers],
  );

  const toggleArtOfPeace = useCallback(
    (slot) => {
      updateSlotModifiers(slot, (modifiers) => ({ ...modifiers, artOfPeace: !modifiers.artOfPeace }));
    },
    [updateSlotModifiers],
  );

  // Not routed through updateSlotModifiers: this is a toggle, and broadcasting a flip to each piece
  // in an Edit All group could leave them in opposite states. The target slot's new value is computed
  // once and every other piece is set to it.
  // `forceValue` sets an exact value instead of flipping — used by the Optimizer's "carry the current
  // recomb status onto a swap-in candidate" step, where the freshly-selected item's state isn't known
  // in advance and a blind flip could land on the wrong value.
  const toggleRecombobulated = useCallback(
    (slot, respectEditAll = true, forceValue) => {
      setLoadout((prev) => {
        if (!prev[slot]) return prev;
        const nextRecombobulated = forceValue !== undefined ? forceValue : !prev[slot].modifiers.recombobulated;
        const next = { ...prev, [slot]: { ...prev[slot], modifiers: { ...prev[slot].modifiers, recombobulated: nextRecombobulated } } };
        const group = !respectEditAll
          ? null
          : editAllArmor && ARMOR_SLOTS.includes(slot)
            ? ARMOR_SLOTS
            : editAllEquipment && EQUIPMENT_SLOTS.includes(slot)
              ? EQUIPMENT_SLOTS
              : null;
        if (group) {
          for (const other of group) {
            if (other === slot || !next[other]) continue;
            next[other] = { ...next[other], modifiers: { ...next[other].modifiers, recombobulated: nextRecombobulated } };
          }
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    [editAllArmor, editAllEquipment],
  );

  // Hex.jsx's "Clean" button — resets every modifier on the slot's equipped item (enchants,
  // gemstones, books, recomb, reforge, stars, special, etc.) back to default, without unequipping
  // the item itself. Independent of removeSlot's lastGearModifiers stash, same as every other
  // modifier-editing action here.
  const cleanModifiers = useCallback(
    (slot) => {
      updateSlotModifiers(slot, () => emptyModifiers());
    },
    [updateSlotModifiers],
  );

  // name === null clears the reforge.
  // `reforgeMeta` (the selected reforge's own {itemTypes, requiredRarities, ...} entry, passed by
  // ReforgesPicker.jsx) lets Edit All check real applicability per OTHER piece before copying a
  // reforge onto it — clearing (name === null) or an origin-only call (no meta) always applies.
  const applyReforge = useCallback(
    (slot, name, respectEditAll = true, reforgeMeta = null) => {
      updateSlotModifiers(
        slot,
        (modifiers, item) => {
          if (name != null && reforgeMeta && item && !isReforgeApplicable(reforgeMeta, item)) return modifiers;
          return { ...modifiers, reforge: name };
        },
        respectEditAll,
      );
    },
    [updateSlotModifiers],
  );

  // Clamped against the equipped item's own real cap (5 normally, 10/15 for whitelisted gear —
  // see lib/starring.js's getMaxStarsForItem) — not a flat 15 for everything. Not routed through
  // updateSlotModifiers since it needs the slot's `item`, not just its `modifiers`. Dropping
  // below the Master Star eligibility threshold also clears masterStars, same as setDungeonized.
  // Edit All broadcasts the same real "set to `count`" operation to every other equipped piece in
  // the group, each independently re-clamped against ITS OWN item's max stars (not a flat copy).
  const setStarCount = useCallback(
    (slot, count, respectEditAll = true) => {
      setLoadout((prev) => {
        if (!prev[slot]) return prev;
        const applyStars = (entry) => {
          const maxStars = getMaxStarsForItem(entry.item);
          const stars = Math.max(0, Math.min(maxStars, Math.floor(count) || 0));
          const modifiers = { ...entry.modifiers, stars };
          if (stars < MASTER_STAR_MIN_BASE_STARS) modifiers.masterStars = 0;
          return { ...entry, modifiers };
        };
        const next = { ...prev, [slot]: applyStars(prev[slot]) };
        const group = !respectEditAll
          ? null
          : editAllArmor && ARMOR_SLOTS.includes(slot)
            ? ARMOR_SLOTS
            : editAllEquipment && EQUIPMENT_SLOTS.includes(slot)
              ? EQUIPMENT_SLOTS
              : null;
        if (group) {
          for (const other of group) {
            if (other === slot || !next[other]) continue;
            next[other] = applyStars(next[other]);
          }
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    [editAllArmor, editAllEquipment],
  );

  // tier === null resets to the item's own real tier — for milestone-upgrading items (e.g. David's Cloak) whose real rarity isn't in the bundled data.
  const setRarityOverride = useCallback(
    (slot, tier, respectEditAll = true) => {
      updateSlotModifiers(
        slot,
        (modifiers, item) => {
          // Edit All: rarityOverride only means anything for the specific milestone-upgrading
          // items that carry a `rarities` config (see lib/specialWeapons.js — currently only
          // David's Cloak) — it isn't a generic "set every piece's tier to X" knob. Every other
          // item's real tier/rarity feeds its reforge/gemstone/recomb stat scaling directly (see
          // lib/itemTooltip.js, lib/recombobulator.js), so broadcasting it blind would silently
          // change those pieces' computed stats to a tier they were never actually recombobulated to.
          if (item && !getSpecialConfig(item.id)?.rarities) return modifiers;
          return { ...modifiers, rarityOverride: tier };
        },
        respectEditAll,
      );
    },
    [updateSlotModifiers],
  );

  // Turning Dungeonize off also clears Master Stars — an item can't hold them without being dungeonized.
  const setDungeonized = useCallback(
    (slot, value) => {
      updateSlotModifiers(slot, (modifiers) => ({
        ...modifiers,
        dungeonized: !!value,
        masterStars: value ? modifiers.masterStars : 0,
      }));
    },
    [updateSlotModifiers],
  );

  const setDungeonizeOldCurve = useCallback(
    (slot, value) => {
      updateSlotModifiers(slot, (modifiers) => ({ ...modifiers, dungeonizeOldCurve: !!value }));
    },
    [updateSlotModifiers],
  );

  // Master Stars need both Dungeonize on AND the item already at 5+ base stars (usable on any
  // item once maxed on base stars, not restricted to Dungeon-tagged gear).
  const setMasterStars = useCallback(
    (slot, count, respectEditAll = true) => {
      updateSlotModifiers(
        slot,
        (modifiers) => ({
          ...modifiers,
          masterStars:
            modifiers.dungeonized && modifiers.stars >= MASTER_STAR_MIN_BASE_STARS
              ? Math.max(0, Math.min(MAX_MASTER_STARS, Math.floor(count) || 0))
              : 0,
        }),
        respectEditAll,
      );
    },
    [updateSlotModifiers],
  );

  const setPetLevel = useCallback(
    (level) => {
      updateSlotModifiers('pet', (modifiers) => ({ ...modifiers, level }));
    },
    [updateSlotModifiers],
  );

  // petItemId === null clears the equipped pet item.
  const setPetItem = useCallback(
    (petItemId) => {
      updateSlotModifiers('pet', (modifiers) => ({ ...modifiers, petItem: petItemId }));
    },
    [updateSlotModifiers],
  );

  const setPetBankCoins = useCallback(
    (value) => {
      updateSlotModifiers('pet', (modifiers) => ({ ...modifiers, bankCoins: value }));
    },
    [updateSlotModifiers],
  );

  const setPetGoldCollection = useCallback(
    (value) => {
      updateSlotModifiers('pet', (modifiers) => ({ ...modifiers, goldCollection: value }));
    },
    [updateSlotModifiers],
  );

  // Unlike other slots, Magical Power can be entered before a Power Stone is picked (it just
  // won't contribute any stats yet — same as in-game) — so this lazily creates the accessory
  // slot (item: null) rather than no-op'ing like updateSlotModifiers does for an empty slot.
  const setAccessoryMagicalPower = useCallback((value) => {
    setLoadout((prev) => {
      const prevSlot = prev.accessory || { item: null, modifiers: emptyAccessoryModifiers() };
      const next = { ...prev, accessory: { ...prevSlot, modifiers: { ...prevSlot.modifiers, magicalPower: Math.max(0, value) } } };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Enrichment count/type — same lazy-create-the-accessory-slot behavior as Magical Power above,
  // since Enrichments apply per Accessory Bag item regardless of which Power is currently active.
  const setAccessoryEnrichmentCount = useCallback((value) => {
    setLoadout((prev) => {
      const prevSlot = prev.accessory || { item: null, modifiers: emptyAccessoryModifiers() };
      const next = { ...prev, accessory: { ...prevSlot, modifiers: { ...prevSlot.modifiers, enrichmentCount: Math.max(0, value) } } };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setAccessoryEnrichmentType = useCallback((type) => {
    setLoadout((prev) => {
      const prevSlot = prev.accessory || { item: null, modifiers: emptyAccessoryModifiers() };
      const next = { ...prev, accessory: { ...prevSlot, modifiers: { ...prevSlot.modifiers, enrichmentType: type } } };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Clamped so the sum of every stat's assigned points never exceeds the current Magical Power's total.
  const setAccessoryTuningPoint = useCallback(
    (statKey, points) => {
      updateSlotModifiers('accessory', (modifiers) => {
        const totalPoints = computeTotalTuningPoints(
          modifiers.magicalPower,
          attributes.tuning_box,
          attributes.echo_of_boxes,
          attributes.echo_of_echoes,
        );
        const otherPointsSpent = Object.entries(modifiers.tuning)
          .filter(([key]) => key !== statKey)
          .reduce((sum, [, v]) => sum + v, 0);
        const clamped = Math.max(0, Math.min(points, totalPoints - otherPointsSpent));
        return { ...modifiers, tuning: { ...modifiers.tuning, [statKey]: clamped } };
      });
    },
    [updateSlotModifiers, attributes.tuning_box, attributes.echo_of_boxes, attributes.echo_of_echoes],
  );

  // Bulk replace — the "Auto-Spend" action (see lib/tuningOptimizer.js) computes a whole
  // allocation via the real damage pipeline and applies it in one shot, instead of 8 sequential
  // setAccessoryTuningPoint calls each re-clamping against a stale snapshot of the others.
  const setAccessoryTuning = useCallback(
    (tuning) => {
      updateSlotModifiers('accessory', (modifiers) => ({ ...modifiers, tuning }));
    },
    [updateSlotModifiers],
  );

  // Optimizer-only: "equipping" a New Accessory/Recombobulate/Perfect Gemstones candidate
  // (lib/accessoryOptimizer.js) pretends the player now owns/upgraded that real accessory, by
  // writing it into ownedAccessories the same shape a real Hypixel import would — otherwise
  // buildAccessoryCandidates keeps re-offering the exact same accessory next run (it only reads
  // ownedAccessories, which setAccessoryMagicalPower/setAccessoryTuning never touch), silently
  // double-counting its Magical Power. Always run after setAccessoryMagicalPower in the same
  // apply chain, which lazily creates the accessory slot if this is the first accessory ever set.
  const setOwnedAccessory = useCallback(
    (id, tier, recombobulated) => {
      updateSlotModifiers('accessory', (modifiers) => {
        const owned = modifiers.ownedAccessories ? [...modifiers.ownedAccessories] : [];
        const idx = owned.findIndex((o) => o.id === id);
        const entry = { id, tier, recombobulated: !!recombobulated };
        if (idx >= 0) owned[idx] = entry;
        else owned.push(entry);
        return { ...modifiers, ownedAccessories: owned };
      });
    },
    [updateSlotModifiers],
  );

  // Optimizer-only companion to setOwnedAccessory: an "Accessory Upgrade" candidate
  // (lib/accessoryOptimizer.js) replaces an owned lower-tier item with a different real item id
  // for the higher tier — this drops the now-gone lower tier's stale ownership record.
  const removeOwnedAccessory = useCallback(
    (id) => {
      updateSlotModifiers('accessory', (modifiers) => ({
        ...modifiers,
        ownedAccessories: (modifiers.ownedAccessories || []).filter((o) => o.id !== id),
      }));
    },
    [updateSlotModifiers],
  );

  // Overwrites the entire build state at once (loadout, attributes, player levels, God Potion, misc stats, mob HP%) — powers Import and the /loadout/:code share-link route.
  // Target mob(s) are intentionally left untouched: loadouts describe the player, not the encounter, so swapping loadouts keeps whatever mob(s) are currently targeted.
  const loadFullState = useCallback((state) => {
    const nextLoadout = state.loadout || {};
    setLoadout(nextLoadout);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextLoadout));

    const nextPlayerStats = {
      combatLevel: 0,
      skyblockLevel: 0,
      foragingLevel: 0,
      catacombsLevel: 0,
      tamingLevel: 0,
      wolfSlayerLevel: 0,
      tarantulaSlayerLevel: 0,
      blazeSlayerLevel: 0,
      alchemyLevel: 0,
      enchantingLevel: 0,
      miningLevel: 0,
      lonesomeMinerLevel: 0,
      generalsMedallionDigits: 0,
      blazetekkHamRadio: false,
      ...(state.playerStats || {}),
    };
    setPlayerStats(nextPlayerStats);
    localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(nextPlayerStats));

    setGodPotionActiveState(!!state.godPotionActive);
    localStorage.setItem(GOD_POTION_KEY, String(!!state.godPotionActive));

    const nextGodPotionMixin = GOD_POTION_MIXINS[state.godPotionMixin] ? state.godPotionMixin : 'none';
    setGodPotionMixinState(nextGodPotionMixin);
    localStorage.setItem(GOD_POTION_MIXIN_KEY, nextGodPotionMixin);

    setEditAllArmorState(!!state.editAllArmor);
    localStorage.setItem(EDIT_ALL_ARMOR_KEY, String(!!state.editAllArmor));

    setEditAllEquipmentState(!!state.editAllEquipment);
    localStorage.setItem(EDIT_ALL_EQUIPMENT_KEY, String(!!state.editAllEquipment));

    setUseDungeonizedStatsState(!!state.useDungeonizedStats);
    localStorage.setItem(USE_DUNGEONIZED_STATS_KEY, String(!!state.useDungeonizedStats));

    setUseMasterModeState(!!state.useMasterMode);
    localStorage.setItem(USE_MASTER_MODE_KEY, String(!!state.useMasterMode));

    const restoredClass = isDungeonClassId(state.dungeonClass) ? state.dungeonClass : state.mageMode ? 'mage' : DEFAULT_DUNGEON_CLASS;
    setDungeonClassState(restoredClass);
    localStorage.setItem(DUNGEON_CLASS_KEY, restoredClass);
    localStorage.setItem(MAGE_MODE_KEY, String(restoredClass === 'mage'));
    const restoredLevels =
      state.dungeonClassLevels && typeof state.dungeonClassLevels === 'object'
        ? state.dungeonClassLevels
        : { [restoredClass]: clampClassLevel(state.dungeonClassLevel) };
    setDungeonClassLevelsState(restoredLevels);
    localStorage.setItem(DUNGEON_CLASS_LEVEL_KEY, JSON.stringify(restoredLevels));

    setDpsModeState(!!state.dpsMode);
    localStorage.setItem(DPS_MODE_KEY, String(!!state.dpsMode));
    const nextDpsKind = DPS_KINDS.includes(state.dpsKind) ? state.dpsKind : 'melee';
    setDpsKindState(nextDpsKind);
    localStorage.setItem(DPS_KIND_KEY, nextDpsKind);

    const nextAttributes = { ...Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, 0])), ...(state.attributes || {}) };
    setAttributesState(nextAttributes);
    localStorage.setItem(ATTRIBUTES_KEY, JSON.stringify(nextAttributes));

    const nextMiscStats = { strength: 0, crit_damage: 0, intelligence: 0, ...(state.miscStats || {}) };
    setMiscStatsState(nextMiscStats);
    localStorage.setItem(MISC_STATS_KEY, JSON.stringify(nextMiscStats));

    // Ignores whatever a shared/saved loadout carried — see PINNED_MOB_HP_PERCENT.
    setMobHpPercentState(PINNED_MOB_HP_PERCENT);
    localStorage.setItem(MOB_HP_PERCENT_KEY, String(PINNED_MOB_HP_PERCENT));

    const nextMobHpSelections =
      state.mobHpSelections && typeof state.mobHpSelections === 'object' && !Array.isArray(state.mobHpSelections)
        ? state.mobHpSelections
        : {};
    setMobHpSelectionsState(nextMobHpSelections);
    localStorage.setItem(MOB_HP_SELECTIONS_KEY, JSON.stringify(nextMobHpSelections));

    const clampedStacks = Math.max(
      1,
      Math.min(INFERNAL_CRIMSON_MAX_STACKS, Math.round(Number(state.infernalCrimsonStacks) || INFERNAL_CRIMSON_MAX_STACKS)),
    );
    setInfernalCrimsonStacksState(clampedStacks);
    localStorage.setItem(INFERNAL_CRIMSON_STACKS_KEY, String(clampedStacks));

    const clampedSwarm = Math.max(1, Math.min(MAX_SWARM_MOBS, Math.round(Number(state.swarmMobs) || 1)));
    setSwarmMobsState(clampedSwarm);
    localStorage.setItem(SWARM_MOBS_KEY, String(clampedSwarm));

    const clampedCombo = Math.max(1, Math.min(MAX_COMBO_KILLS, Math.round(Number(state.comboKills) || 1)));
    setComboKillsState(clampedCombo);
    localStorage.setItem(COMBO_KILLS_KEY, String(clampedCombo));

    const clampedLegion = Math.max(0, Math.min(MAX_LEGION_PLAYERS, Math.round(Number(state.legionPlayers) || 0)));
    setLegionPlayersState(clampedLegion);
    localStorage.setItem(LEGION_PLAYERS_KEY, String(clampedLegion));

    setBlazeCrimsonIsleState(!!state.blazeCrimsonIsle);
    localStorage.setItem(BLAZE_CRIMSON_ISLE_KEY, String(!!state.blazeCrimsonIsle));

    const nextBestiaryMaxedMobs = Array.isArray(state.bestiaryMaxedMobs) ? state.bestiaryMaxedMobs : [];
    setBestiaryMaxedMobsState(nextBestiaryMaxedMobs);
    localStorage.setItem(BESTIARY_MAXED_MOBS_KEY, JSON.stringify(nextBestiaryMaxedMobs));

    const nextCombinedMythologicalBestiaryTiers = Math.max(0, Number(state.combinedMythologicalBestiaryTiers) || 0);
    setCombinedMythologicalBestiaryTiersState(nextCombinedMythologicalBestiaryTiers);
    localStorage.setItem(COMBINED_MYTHOLOGICAL_BESTIARY_TIERS_KEY, String(nextCombinedMythologicalBestiaryTiers));

    const nextMaxedCollectionsCount = Math.max(0, Number(state.maxedCollectionsCount) || 0);
    setMaxedCollectionsCountState(nextMaxedCollectionsCount);
    localStorage.setItem(MAXED_COLLECTIONS_COUNT_KEY, String(nextMaxedCollectionsCount));
  }, []);

  return (
    <BuildContext.Provider
      value={{
        loadout,
        playerStats,
        setCombatLevel,
        setSkyblockLevel,
        setForagingLevel,
        setCatacombsLevel,
        setTamingLevel,
        setWolfSlayerLevel,
        setTarantulaSlayerLevel,
        setBlazeSlayerLevel,
        setAlchemyLevel,
        setEnchantingLevel,
        setMiningLevel,
        setLonesomeMinerLevel,
        setPlayerLevel,
        setGeneralsMedallionDigits,
        toggleBlazetekkHamRadio,
        targetMobs,
        toggleTargetMob,
        clearTargetMobs,
        godPotionActive,
        toggleGodPotion,
        setGodPotionActive,
        godPotionMixin,
        setGodPotionMixin,
        editAllArmor,
        toggleEditAllArmor,
        editAllEquipment,
        toggleEditAllEquipment,
        clearArmor,
        clearEquipment,
        useDungeonizedStats,
        toggleUseDungeonizedStats,
        useMasterMode,
        toggleUseMasterMode,
        mageMode,
        dungeonClass,
        dungeonClassLevel,
        dungeonClassLevels,
        setDungeonClass,
        setDungeonClassLevel,
        importHypixelDungeonClassLevels,
        dpsMode,
        dpsKind,
        setDpsKind,
        hasJellyfishPet,
        setHasJellyfishPet,
        toggleDpsMode,
        attributes,
        setAttributeLevel,
        miscStats,
        setMiscStat,
        mobHpPercent,
        setMobHpPercent,
        mobHpSelections,
        setMobHpSelection,
        infernalCrimsonStacks,
        setInfernalCrimsonStacks,
        swarmMobs,
        setSwarmMobs,
        comboKills,
        setComboKills,
        legionPlayers,
        setLegionPlayers,
        blazeCrimsonIsle,
        toggleBlazeCrimsonIsle,
        bestiaryMaxedMobs,
        combinedMythologicalBestiaryTiers,
        maxedCollectionsCount,
        blessing,
        debuffs,
        buffs,
        setBuff,
        setIceSpray,
        setTwilightPoison,
        setLastBreathLevel,
        setLethalityStacks,
        essencePerks,
        importHypixelEssencePerks,
        setEssencePerkLevel,
        setForbiddenBlessingLevel,
        setMasterSkullTier,
        setBlessingLevel,
        setPaulBuff,
        importHypixelBlessingInputs,
        importedWeapons,
        maxBudget,
        setMaxBudget,
        selectItem,
        importHypixelLoadout,
        importHypixelAttributes,
        importHypixelPlayerStats,
        importHypixelBestiaryMaxedMobs,
        importHypixelCombinedMythologicalBestiaryTiers,
        importHypixelMaxedCollectionsCount,
        importHypixelWeaponList,
        equipImportedWeapon,
        removeSlot,
        applyEnchant,
        applyGemstone,
        removeGemstone,
        setBookCount,
        setSpecialValue,
        toggleArtOfWar,
        toggleArtOfPeace,
        toggleRecombobulated,
        cleanModifiers,
        applyReforge,
        setStarCount,
        setRarityOverride,
        setDungeonized,
        setDungeonizeOldCurve,
        setMasterStars,
        setPetLevel,
        setPetItem,
        setPetBankCoins,
        setPetGoldCollection,
        setAccessoryMagicalPower,
        setAccessoryEnrichmentCount,
        setAccessoryEnrichmentType,
        setAccessoryTuningPoint,
        setAccessoryTuning,
        setOwnedAccessory,
        removeOwnedAccessory,
        loadFullState,
        undo,
        redo,
        canUndo,
        canRedo,
      }}
    >
      {children}
    </BuildContext.Provider>
  );
}

export function useBuild() {
  const ctx = useContext(BuildContext);
  if (!ctx) throw new Error('useBuild must be used within BuildProvider');
  return ctx;
}

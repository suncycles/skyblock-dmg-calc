import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { isUltimateEnchant } from '../lib/enchantEffects';
import { computeTotalTuningPoints } from '../lib/accessoryPowers';
import { ATTRIBUTE_IDS, getAttributeMaxLevel } from '../lib/attributes';
import { MAX_MASTER_STARS, MASTER_STAR_MIN_BASE_STARS, getMaxStarsForItem } from '../lib/starring';
import { emptyModifiers, emptyPetModifiers, emptyAccessoryModifiers } from '../lib/defaultModifiers';
import { INFERNAL_CRIMSON_MAX_STACKS } from '../lib/armorSetBonuses';

const STORAGE_KEY = 'hexLoadout';
const PLAYER_STATS_KEY = 'hexPlayerStats';
const TARGET_MOB_KEY = 'hexTargetMob'; // legacy single-mob key, migrated once then unused
const TARGET_MOBS_KEY = 'hexTargetMobs';
const GOD_POTION_KEY = 'hexGodPotion';
const USE_DUNGEONIZED_STATS_KEY = 'hexUseDungeonizedStats';
const USE_MASTER_MODE_KEY = 'hexUseMasterMode';
const MAGE_MODE_KEY = 'hexMageMode';
const ATTRIBUTES_KEY = 'hexAttributes';
const MISC_STATS_KEY = 'hexMiscStats';
const MOB_HP_PERCENT_KEY = 'hexMobHpPercent';
const INFERNAL_CRIMSON_STACKS_KEY = 'hexInfernalCrimsonStacks';
const SWARM_MOBS_KEY = 'hexSwarmMobs';
const COMBO_KILLS_KEY = 'hexComboKills';
const LEGION_PLAYERS_KEY = 'hexLegionPlayers';
const BLAZE_CRIMSON_ISLE_KEY = 'hexBlazeCrimsonIsle';
const LAST_GEAR_MODIFIERS_KEY = 'hexLastGearModifiers';

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

// Loads the target's current HP% (0-100, default 100), used by Execute/Prosecute and to gate First Strike/Triple Strike.
function loadInitialMobHpPercent() {
  const stored = localStorage.getItem(MOB_HP_PERCENT_KEY);
  const parsed = stored != null ? Number(stored) : 100;
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 100;
}

// Loads the Infernal Crimson combo-stack count (1-10, default 1) — only shown/applied once 2+
// Infernal Crimson pieces are equipped, see lib/armorSetBonuses.js.
function loadInitialInfernalCrimsonStacks() {
  const stored = localStorage.getItem(INFERNAL_CRIMSON_STACKS_KEY);
  const parsed = stored != null ? Number(stored) : 1;
  return Number.isFinite(parsed) ? Math.max(1, Math.min(INFERNAL_CRIMSON_MAX_STACKS, parsed)) : 1;
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

// Loads the manually-entered "everything else" Strength/Crit Damage/Intelligence total (Fairy Souls, skill rewards, etc.).
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
    alchemyLevel: 0,
    enchantingLevel: 0,
    generalsMedallionDigits: 0,
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
      alchemyLevel: typeof parsed.alchemyLevel === 'number' ? parsed.alchemyLevel : 0,
      enchantingLevel: typeof parsed.enchantingLevel === 'number' ? parsed.enchantingLevel : 0,
      generalsMedallionDigits: typeof parsed.generalsMedallionDigits === 'number' ? parsed.generalsMedallionDigits : 0,
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

export function BuildProvider({ children }) {
  const [loadout, setLoadout] = useState(loadInitial);
  // Doesn't need to trigger re-renders (only ever read at selectItem time), so a ref instead of
  // state — keeps removeSlot/selectItem's useCallback deps stable.
  const lastGearModifiersRef = useRef(loadInitialLastGearModifiers());
  const [playerStats, setPlayerStats] = useState(loadInitialPlayerStats);
  const [targetMobs, setTargetMobsState] = useState(loadInitialTargetMobs);
  const [godPotionActive, setGodPotionActiveState] = useState(loadInitialGodPotion);
  const [useDungeonizedStats, setUseDungeonizedStatsState] = useState(loadInitialUseDungeonizedStats);
  const [useMasterMode, setUseMasterModeState] = useState(loadInitialUseMasterMode);
  const [mageMode, setMageModeState] = useState(loadInitialMageMode);
  const [attributes, setAttributesState] = useState(loadInitialAttributes);
  const [miscStats, setMiscStatsState] = useState(loadInitialMiscStats);
  const [mobHpPercent, setMobHpPercentState] = useState(loadInitialMobHpPercent);
  const [infernalCrimsonStacks, setInfernalCrimsonStacksState] = useState(loadInitialInfernalCrimsonStacks);
  const [swarmMobs, setSwarmMobsState] = useState(loadInitialSwarmMobs);
  const [comboKills, setComboKillsState] = useState(loadInitialComboKills);
  const [legionPlayers, setLegionPlayersState] = useState(loadInitialLegionPlayers);
  const [blazeCrimsonIsle, setBlazeCrimsonIsleState] = useState(loadInitialBlazeCrimsonIsle);

  const setMobHpPercent = useCallback((value) => {
    const clamped = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    setMobHpPercentState(clamped);
    localStorage.setItem(MOB_HP_PERCENT_KEY, String(clamped));
  }, []);

  const setInfernalCrimsonStacks = useCallback((value) => {
    const clamped = Math.max(1, Math.min(INFERNAL_CRIMSON_MAX_STACKS, Math.round(Number(value) || 1)));
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

  const setAttributeLevel = useCallback((id, level) => {
    setAttributesState((prev) => {
      const clamped = Math.max(0, Math.min(getAttributeMaxLevel(id), Math.floor(level) || 0));
      const next = { ...prev, [id]: clamped };
      localStorage.setItem(ATTRIBUTES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setMiscStat = useCallback((statKey, value) => {
    setMiscStatsState((prev) => {
      const next = { ...prev, [statKey]: Number(value) || 0 };
      localStorage.setItem(MISC_STATS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Adds/removes a single mob from the selection.
  const toggleTargetMob = useCallback((name) => {
    setTargetMobsState((prev) => {
      const next = prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name];
      localStorage.setItem(TARGET_MOBS_KEY, JSON.stringify(next));
      localStorage.removeItem(TARGET_MOB_KEY);
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

  const toggleMageMode = useCallback(() => {
    setMageModeState((prev) => {
      const next = !prev;
      localStorage.setItem(MAGE_MODE_KEY, String(next));
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

  const setGeneralsMedallionDigits = useCallback((value) => {
    setPlayerStats((prev) => {
      const next = { ...prev, generalsMedallionDigits: value };
      localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Shared by every modifier setter below: no-ops if the slot is empty, otherwise runs `updater` over its modifiers and persists.
  const updateSlotModifiers = useCallback((slot, updater) => {
    setLoadout((prev) => {
      if (!prev[slot]) return prev;
      const next = { ...prev, [slot]: { ...prev[slot], modifiers: updater(prev[slot].modifiers) } };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Equips `item` into `slot`, resetting modifiers to defaults — except Accessory, whose Magical
  // Power/Tuning carry over across Power Stone switches, and weapon/armor/equipment, which restore
  // whatever modifiers (recomb, enchants, gemstones, stars, reforge, ...) were last seen in this
  // slot (stashed by removeSlot below — the only way to reach here for a non-empty slot is
  // remove-then-repick, so `prev[slot]` is already gone by now). Stars/masterStars are reclamped
  // to the new item's own real cap; every other field carries over blind, same as Accessory always
  // has — a mismatched reforge/gemstone count for the new item is a rare edge the relevant picker
  // already surfaces, not something worth reconciling here.
  const selectItem = useCallback((slot, item) => {
    setLoadout((prev) => {
      const stashed = slot !== 'pet' && slot !== 'accessory' ? lastGearModifiersRef.current[slot] : null;
      let gearModifiers = stashed ? { ...emptyModifiers(), ...stashed } : emptyModifiers();
      if (stashed) {
        const maxStars = getMaxStarsForItem(item);
        gearModifiers.stars = Math.max(0, Math.min(maxStars, gearModifiers.stars || 0));
        if (gearModifiers.stars < MASTER_STAR_MIN_BASE_STARS) gearModifiers.masterStars = 0;
      }
      const next = {
        ...prev,
        [slot]: {
          item:
            slot === 'pet'
              ? { id: item.id, petId: item.petId, name: item.name, material: item.material, tier: item.tier }
              : slot === 'accessory'
                ? { id: item.id, name: item.name, iconId: item.iconId, material: item.material }
                : {
                    id: item.id,
                    name: item.name,
                    material: item.material,
                    category: item.category,
                    tier: item.tier,
                    lore: item.lore || [],
                    color: item.color,
                  },
          modifiers:
            slot === 'pet' ? emptyPetModifiers() : slot === 'accessory' ? prev.accessory?.modifiers || emptyAccessoryModifiers() : gearModifiers,
        },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

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

  // Merges a Hypixel-import attribute-level patch (see lib/hypixelImport.js) — only the ids
  // present in `patch` are touched, everything else stays as it was.
  const importHypixelAttributes = useCallback((patch) => {
    setAttributesState((prev) => {
      const next = { ...prev };
      for (const [id, level] of Object.entries(patch || {})) {
        if (ATTRIBUTE_IDS.includes(id)) next[id] = Math.max(0, Math.min(getAttributeMaxLevel(id), Math.floor(level) || 0));
      }
      localStorage.setItem(ATTRIBUTES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Merges a Hypixel-import player-stats patch (wolfSlayerLevel/alchemyLevel/enchantingLevel) —
  // only the keys present in `patch` are touched.
  const importHypixelPlayerStats = useCallback((patch) => {
    setPlayerStats((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(next));
      return next;
    });
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
        lastGearModifiersRef.current = { ...lastGearModifiersRef.current, [slot]: prev[slot].modifiers };
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
    (slot, id, level, maxLevel, removeIds = []) => {
      updateSlotModifiers(slot, (modifiers) => {
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
      });
    },
    [updateSlotModifiers],
  );

  // Sets (or replaces) the gemstone in one slot index — gemstones is a sparse array indexed by slot position.
  const applyGemstone = useCallback(
    (slot, slotIndex, gemId, tier) => {
      updateSlotModifiers(slot, (modifiers) => {
        const gemstones = (modifiers.gemstones || []).slice();
        gemstones[slotIndex] = { gem: gemId, tier };
        return { ...modifiers, gemstones };
      });
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
    (slot, value) => {
      updateSlotModifiers(slot, (modifiers) => ({ ...modifiers, special: value }));
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

  const toggleRecombobulated = useCallback(
    (slot) => {
      updateSlotModifiers(slot, (modifiers) => ({ ...modifiers, recombobulated: !modifiers.recombobulated }));
    },
    [updateSlotModifiers],
  );

  // name === null clears the reforge.
  const applyReforge = useCallback(
    (slot, name) => {
      updateSlotModifiers(slot, (modifiers) => ({ ...modifiers, reforge: name }));
    },
    [updateSlotModifiers],
  );

  // Clamped against the equipped item's own real cap (5 normally, 10/15 for whitelisted gear —
  // see lib/starring.js's getMaxStarsForItem) — not a flat 15 for everything. Not routed through
  // updateSlotModifiers since it needs the slot's `item`, not just its `modifiers`. Dropping
  // below the Master Star eligibility threshold also clears masterStars, same as setDungeonized.
  const setStarCount = useCallback((slot, count) => {
    setLoadout((prev) => {
      if (!prev[slot]) return prev;
      const maxStars = getMaxStarsForItem(prev[slot].item);
      const stars = Math.max(0, Math.min(maxStars, Math.floor(count) || 0));
      const modifiers = { ...prev[slot].modifiers, stars };
      if (stars < MASTER_STAR_MIN_BASE_STARS) modifiers.masterStars = 0;
      const next = { ...prev, [slot]: { ...prev[slot], modifiers } };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // tier === null resets to the item's own real tier — for milestone-upgrading items (e.g. David's Cloak) whose real rarity isn't in the bundled data.
  const setRarityOverride = useCallback(
    (slot, tier) => {
      updateSlotModifiers(slot, (modifiers) => ({ ...modifiers, rarityOverride: tier }));
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
    (slot, count) => {
      updateSlotModifiers(slot, (modifiers) => ({
        ...modifiers,
        masterStars:
          modifiers.dungeonized && modifiers.stars >= MASTER_STAR_MIN_BASE_STARS
            ? Math.max(0, Math.min(MAX_MASTER_STARS, Math.floor(count) || 0))
            : 0,
      }));
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
      alchemyLevel: 0,
      enchantingLevel: 0,
      generalsMedallionDigits: 0,
      ...(state.playerStats || {}),
    };
    setPlayerStats(nextPlayerStats);
    localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(nextPlayerStats));

    setGodPotionActiveState(!!state.godPotionActive);
    localStorage.setItem(GOD_POTION_KEY, String(!!state.godPotionActive));

    setUseDungeonizedStatsState(!!state.useDungeonizedStats);
    localStorage.setItem(USE_DUNGEONIZED_STATS_KEY, String(!!state.useDungeonizedStats));

    setUseMasterModeState(!!state.useMasterMode);
    localStorage.setItem(USE_MASTER_MODE_KEY, String(!!state.useMasterMode));

    setMageModeState(!!state.mageMode);
    localStorage.setItem(MAGE_MODE_KEY, String(!!state.mageMode));

    const nextAttributes = { ...Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, 0])), ...(state.attributes || {}) };
    setAttributesState(nextAttributes);
    localStorage.setItem(ATTRIBUTES_KEY, JSON.stringify(nextAttributes));

    const nextMiscStats = { strength: 0, crit_damage: 0, intelligence: 0, ...(state.miscStats || {}) };
    setMiscStatsState(nextMiscStats);
    localStorage.setItem(MISC_STATS_KEY, JSON.stringify(nextMiscStats));

    const clampedMobHp = Math.max(0, Math.min(100, Math.round(Number(state.mobHpPercent) || 100)));
    setMobHpPercentState(clampedMobHp);
    localStorage.setItem(MOB_HP_PERCENT_KEY, String(clampedMobHp));

    const clampedStacks = Math.max(1, Math.min(INFERNAL_CRIMSON_MAX_STACKS, Math.round(Number(state.infernalCrimsonStacks) || 1)));
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
        setAlchemyLevel,
        setEnchantingLevel,
        setGeneralsMedallionDigits,
        targetMobs,
        toggleTargetMob,
        clearTargetMobs,
        godPotionActive,
        toggleGodPotion,
        useDungeonizedStats,
        toggleUseDungeonizedStats,
        useMasterMode,
        toggleUseMasterMode,
        mageMode,
        toggleMageMode,
        attributes,
        setAttributeLevel,
        miscStats,
        setMiscStat,
        mobHpPercent,
        setMobHpPercent,
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
        selectItem,
        importHypixelLoadout,
        importHypixelAttributes,
        importHypixelPlayerStats,
        removeSlot,
        applyEnchant,
        applyGemstone,
        removeGemstone,
        setBookCount,
        setSpecialValue,
        toggleArtOfWar,
        toggleArtOfPeace,
        toggleRecombobulated,
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
        setAccessoryTuningPoint,
        loadFullState,
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

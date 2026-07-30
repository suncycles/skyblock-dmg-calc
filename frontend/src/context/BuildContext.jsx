import { createContext, useCallback, useContext, useState } from 'react';
import { isUltimateEnchant } from '../lib/enchantEffects';
import { computeTuningPoints } from '../lib/accessoryPowers';
import { ATTRIBUTE_IDS, MAX_ATTRIBUTE_LEVEL, TUNING_BOX_RATE } from '../lib/attributes';
import { MAX_MASTER_STARS } from '../lib/starring';
import { emptyModifiers, emptyPetModifiers, emptyAccessoryModifiers } from '../lib/defaultModifiers';
import { INFERNAL_CRIMSON_MAX_STACKS } from '../lib/armorSetBonuses';

const STORAGE_KEY = 'hexLoadout';
const PLAYER_STATS_KEY = 'hexPlayerStats';
const TARGET_MOB_KEY = 'hexTargetMob'; // legacy single-mob key, migrated once then unused
const TARGET_MOBS_KEY = 'hexTargetMobs';
const GOD_POTION_KEY = 'hexGodPotion';
const USE_DUNGEONIZED_STATS_KEY = 'hexUseDungeonizedStats';
const USE_MASTER_MODE_KEY = 'hexUseMasterMode';
const ATTRIBUTES_KEY = 'hexAttributes';
const MISC_STATS_KEY = 'hexMiscStats';
const MOB_HP_PERCENT_KEY = 'hexMobHpPercent';
const INFERNAL_CRIMSON_STACKS_KEY = 'hexInfernalCrimsonStacks';

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

// Loads the manually-entered "everything else" Strength/Crit Damage total (Fairy Souls, skill rewards, etc.).
function loadInitialMiscStats() {
  const stored = localStorage.getItem(MISC_STATS_KEY);
  if (!stored) return { strength: 0, crit_damage: 0 };
  try {
    const parsed = JSON.parse(stored);
    return {
      strength: typeof parsed.strength === 'number' ? parsed.strength : 0,
      crit_damage: typeof parsed.crit_damage === 'number' ? parsed.crit_damage : 0,
    };
  } catch (err) {
    console.error('Failed to parse saved misc stats:', err);
    return { strength: 0, crit_damage: 0 };
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
      if (typeof parsed[id] === 'number') defaults[id] = Math.max(0, Math.min(MAX_ATTRIBUTE_LEVEL, Math.floor(parsed[id])));
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
      // Discard entries saved under an older schema shape.
      if (!entry?.item) continue;
      if (slot === 'pet') {
        if (typeof entry?.modifiers?.level !== 'number') continue;
      } else if (slot === 'accessory') {
        if (typeof entry?.modifiers?.magicalPower !== 'number') continue;
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

export function BuildProvider({ children }) {
  const [loadout, setLoadout] = useState(loadInitial);
  const [playerStats, setPlayerStats] = useState(loadInitialPlayerStats);
  const [targetMobs, setTargetMobsState] = useState(loadInitialTargetMobs);
  const [godPotionActive, setGodPotionActiveState] = useState(loadInitialGodPotion);
  const [useDungeonizedStats, setUseDungeonizedStatsState] = useState(loadInitialUseDungeonizedStats);
  const [useMasterMode, setUseMasterModeState] = useState(loadInitialUseMasterMode);
  const [attributes, setAttributesState] = useState(loadInitialAttributes);
  const [miscStats, setMiscStatsState] = useState(loadInitialMiscStats);
  const [mobHpPercent, setMobHpPercentState] = useState(loadInitialMobHpPercent);
  const [infernalCrimsonStacks, setInfernalCrimsonStacksState] = useState(loadInitialInfernalCrimsonStacks);

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

  const setAttributeLevel = useCallback((id, level) => {
    setAttributesState((prev) => {
      const clamped = Math.max(0, Math.min(MAX_ATTRIBUTE_LEVEL, Math.floor(level) || 0));
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

  // Equips `item` into `slot`, resetting modifiers to defaults — except Accessory, whose Magical Power/Tuning carry over across Power Stone switches.
  const selectItem = useCallback((slot, item) => {
    setLoadout((prev) => {
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
            slot === 'pet'
              ? emptyPetModifiers()
              : slot === 'accessory'
                ? prev.accessory?.modifiers || emptyAccessoryModifiers()
                : emptyModifiers(),
        },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Fully unequips a slot, dropping its key from the loadout entirely.
  const removeSlot = useCallback((slot) => {
    setLoadout((prev) => {
      if (!prev[slot]) return prev;
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

  const setStarCount = useCallback(
    (slot, count) => {
      updateSlotModifiers(slot, (modifiers) => ({ ...modifiers, stars: count }));
    },
    [updateSlotModifiers],
  );

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

  const setMasterStars = useCallback(
    (slot, count) => {
      updateSlotModifiers(slot, (modifiers) => ({
        ...modifiers,
        masterStars: modifiers.dungeonized ? Math.max(0, Math.min(MAX_MASTER_STARS, Math.floor(count) || 0)) : 0,
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

  const setAccessoryMagicalPower = useCallback(
    (value) => {
      updateSlotModifiers('accessory', (modifiers) => ({ ...modifiers, magicalPower: value }));
    },
    [updateSlotModifiers],
  );

  // Clamped so the sum of every stat's assigned points never exceeds the current Magical Power's total.
  const setAccessoryTuningPoint = useCallback(
    (statKey, points) => {
      updateSlotModifiers('accessory', (modifiers) => {
        const totalPoints = computeTuningPoints(modifiers.magicalPower) + attributes.tuning_box * TUNING_BOX_RATE;
        const otherPointsSpent = Object.entries(modifiers.tuning)
          .filter(([key]) => key !== statKey)
          .reduce((sum, [, v]) => sum + v, 0);
        const clamped = Math.max(0, Math.min(points, totalPoints - otherPointsSpent));
        return { ...modifiers, tuning: { ...modifiers.tuning, [statKey]: clamped } };
      });
    },
    [updateSlotModifiers, attributes.tuning_box],
  );

  // Overwrites the entire build state at once (loadout, target mobs, attributes, player levels, God Potion, misc stats, mob HP%) — powers Import and the /loadout/:code share-link route.
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
      generalsMedallionDigits: 0,
      ...(state.playerStats || {}),
    };
    setPlayerStats(nextPlayerStats);
    localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(nextPlayerStats));

    const nextTargetMobs = state.targetMobs || [];
    setTargetMobsState(nextTargetMobs);
    localStorage.setItem(TARGET_MOBS_KEY, JSON.stringify(nextTargetMobs));
    localStorage.removeItem(TARGET_MOB_KEY);

    setGodPotionActiveState(!!state.godPotionActive);
    localStorage.setItem(GOD_POTION_KEY, String(!!state.godPotionActive));

    setUseDungeonizedStatsState(!!state.useDungeonizedStats);
    localStorage.setItem(USE_DUNGEONIZED_STATS_KEY, String(!!state.useDungeonizedStats));

    setUseMasterModeState(!!state.useMasterMode);
    localStorage.setItem(USE_MASTER_MODE_KEY, String(!!state.useMasterMode));

    const nextAttributes = { ...Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, 0])), ...(state.attributes || {}) };
    setAttributesState(nextAttributes);
    localStorage.setItem(ATTRIBUTES_KEY, JSON.stringify(nextAttributes));

    const nextMiscStats = { strength: 0, crit_damage: 0, ...(state.miscStats || {}) };
    setMiscStatsState(nextMiscStats);
    localStorage.setItem(MISC_STATS_KEY, JSON.stringify(nextMiscStats));

    const clampedMobHp = Math.max(0, Math.min(100, Math.round(Number(state.mobHpPercent) || 100)));
    setMobHpPercentState(clampedMobHp);
    localStorage.setItem(MOB_HP_PERCENT_KEY, String(clampedMobHp));

    const clampedStacks = Math.max(1, Math.min(INFERNAL_CRIMSON_MAX_STACKS, Math.round(Number(state.infernalCrimsonStacks) || 1)));
    setInfernalCrimsonStacksState(clampedStacks);
    localStorage.setItem(INFERNAL_CRIMSON_STACKS_KEY, String(clampedStacks));
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
        attributes,
        setAttributeLevel,
        miscStats,
        setMiscStat,
        mobHpPercent,
        setMobHpPercent,
        infernalCrimsonStacks,
        setInfernalCrimsonStacks,
        selectItem,
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

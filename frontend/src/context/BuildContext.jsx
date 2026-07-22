import { createContext, useCallback, useContext, useState } from 'react';
import { isUltimateEnchant } from '../lib/enchantEffects';
import { computeTuningPoints } from '../lib/accessoryPowers';

const STORAGE_KEY = 'hexLoadout';
const PLAYER_STATS_KEY = 'hexPlayerStats';

const BuildContext = createContext(null);

// Global, not tied to any equipped item/pet — Combat Level, Skyblock
// Level, etc (see lib/playerStats.js) — persisted separately from the
// slot-keyed loadout since it isn't "equipment."
function loadInitialPlayerStats() {
  const stored = localStorage.getItem(PLAYER_STATS_KEY);
  if (!stored) return { combatLevel: 0, skyblockLevel: 0, foragingLevel: 0 };
  try {
    const parsed = JSON.parse(stored);
    return {
      combatLevel: typeof parsed.combatLevel === 'number' ? parsed.combatLevel : 0,
      skyblockLevel: typeof parsed.skyblockLevel === 'number' ? parsed.skyblockLevel : 0,
      foragingLevel: typeof parsed.foragingLevel === 'number' ? parsed.foragingLevel : 0,
    };
  } catch (err) {
    console.error('Failed to parse saved player stats:', err);
    return { combatLevel: 0, skyblockLevel: 0, foragingLevel: 0 };
  }
}

function emptyModifiers() {
  return {
    hexEnchantments: [], // [{id, level, maxLevel}], normal enchants
    ultimateEnchantment: null, // {id, level, maxLevel} | null — only one allowed
    gemstones: [],
    books: 0, // Hot/Fuming Potato Book count, 0-15
    artOfWar: false, // The Art of War — one-time-use, +5 Strength, weapons only
    artOfPeace: false, // The Art of Peace — one-time-use, +40 Health, armor only
    special: 0, // weapon-specific ability input — see lib/specialWeapons.js
    recombobulated: false,
    reforge: null, // reforge name string | null
    stars: 0, // Item Upgrades star count, 0-15 — see lib/starring.js
  };
}

// Pets don't have enchants/gemstones/reforges/etc — just a level and an
// optional held pet item — so they get their own, much smaller modifiers
// shape rather than carrying 8 unused weapon/armor-only fields.
function emptyPetModifiers() {
  return {
    level: 1,
    petItem: null, // pet item id string | null
    bankCoins: 0, // Golden Dragon's "Legendary Treasure" input — see lib/damageSources.js
  };
}

// Accessory Powers (see lib/accessoryPowers.js) — a chosen power id, the
// player's Magical Power, and Tuning Point allocation. No enchants/
// gemstones/reforge concept at all, same "own small shape" precedent as
// pets.
function emptyAccessoryModifiers() {
  return {
    magicalPower: 0,
    tuning: {
      health: 0,
      defense: 0,
      speed: 0,
      strength: 0,
      crit_damage: 0,
      crit_chance: 0,
      bonus_attack_speed: 0,
      intelligence: 0,
    },
  };
}

// Sparse: a slot key ('weapon' | 'helmet' | 'chestplate' | 'leggings' |
// 'boots' | 'pet') is simply absent from the loadout until something's
// picked for it — no null placeholders for the other slots while working
// on one.
function loadInitial() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return {};
  try {
    const parsed = JSON.parse(stored);
    const next = {};
    for (const slot of Object.keys(parsed || {})) {
      const entry = parsed[slot];
      // Discard entries saved under an older schema (hexEnchantments used to
      // be a fixed {damage_boosts,utility,defense} object, not a list; books
      // used to be a list too, not a plain count) rather than risk operating
      // on a shape the setters below don't expect.
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

  // Shared by every modifier setter below: no-ops if the slot has nothing
  // equipped yet, otherwise runs `updater` over that slot's current
  // modifiers and persists the whole loadout.
  const updateSlotModifiers = useCallback((slot, updater) => {
    setLoadout((prev) => {
      if (!prev[slot]) return prev;
      const next = { ...prev, [slot]: { ...prev[slot], modifiers: updater(prev[slot].modifiers) } };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Equips `item` into `slot`, resetting that slot's modifiers to defaults
  // (picking a new item for a slot starts that piece fresh).
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
                  },
          modifiers: slot === 'pet' ? emptyPetModifiers() : slot === 'accessory' ? emptyAccessoryModifiers() : emptyModifiers(),
        },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Fully unequips a slot (as opposed to selectItem, which replaces it) —
  // the slot key is dropped from the loadout entirely rather than set to
  // null, matching loadInitial/the rest of the app's "absent = nothing
  // equipped" convention.
  const removeSlot = useCallback((slot) => {
    setLoadout((prev) => {
      if (!prev[slot]) return prev;
      const next = { ...prev };
      delete next[slot];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Applies (or replaces) a chosen level for one enchant. Ultimate enchants
  // occupy their own single slot (an item can only hold one); normal
  // enchants upsert into the list by id. removeIds (from
  // computeConflictingEntries) are dropped first, so the "X will be removed"
  // warning shown on hover is never a broken promise.
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

  // Sets (or replaces) the gemstone in one slot index. gemstones is a sparse
  // array indexed by slot position, matching the order slots are laid out
  // in on the Gemstones screen.
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

  // Hot/Fuming Potato Book count — a single combined counter since both
  // grant the same bonus per application and share one limit in the real
  // game (Hot Potato Books alone cap at 10; Fuming Potato Books are what
  // let that limit go up to 15). See lib/reforgeData.js's STAT_LABELS for
  // the bonus itself.
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

  // name === null clears the reforge (used by a "Remove Reforge" slot,
  // matching removeGemstone's pattern).
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

  const setAccessoryMagicalPower = useCallback(
    (value) => {
      updateSlotModifiers('accessory', (modifiers) => ({ ...modifiers, magicalPower: value }));
    },
    [updateSlotModifiers],
  );

  // Clamped so the sum of every stat's assigned points never exceeds what
  // the current Magical Power actually grants — matches the real "remove
  // points to reinvest them elsewhere" behavior rather than letting the
  // total silently overshoot.
  const setAccessoryTuningPoint = useCallback(
    (statKey, points) => {
      updateSlotModifiers('accessory', (modifiers) => {
        const totalPoints = computeTuningPoints(modifiers.magicalPower);
        const otherPointsSpent = Object.entries(modifiers.tuning)
          .filter(([key]) => key !== statKey)
          .reduce((sum, [, v]) => sum + v, 0);
        const clamped = Math.max(0, Math.min(points, totalPoints - otherPointsSpent));
        return { ...modifiers, tuning: { ...modifiers.tuning, [statKey]: clamped } };
      });
    },
    [updateSlotModifiers],
  );

  return (
    <BuildContext.Provider
      value={{
        loadout,
        playerStats,
        setCombatLevel,
        setSkyblockLevel,
        setForagingLevel,
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
        setPetLevel,
        setPetItem,
        setPetBankCoins,
        setAccessoryMagicalPower,
        setAccessoryTuningPoint,
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

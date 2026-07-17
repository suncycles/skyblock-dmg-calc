import { createContext, useCallback, useContext, useState } from 'react';
import { isUltimateEnchant } from '../lib/enchantEffects';

const STORAGE_KEY = 'currentlyModifying';

const BuildContext = createContext(null);

// Maps categories (e.g. "SWORD" or "BOW") to normalized lowercase strings
function mapItemType(category) {
  const cat = category ? category.toLowerCase() : '';
  if (cat === 'sword' || cat === 'longsword' || cat === 'bow') return cat;
  return 'sword'; // default fallback
}

function loadInitial() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    // Discard builds saved under an older schema (hexEnchantments used to be
    // a fixed {damage_boosts,utility,defense} object, not a list) rather
    // than risk operating on a shape applyEnchant doesn't expect.
    if (!Array.isArray(parsed?.modifiers?.hexEnchantments)) return null;
    return parsed;
  } catch (err) {
    console.error('Failed to parse saved weapon build:', err);
    return null;
  }
}

export function BuildProvider({ children }) {
  const [build, setBuild] = useState(loadInitial);

  // Builds the shared "currentlyModifying" schema and persists it so the
  // Hex/Enchants pages can pick it up.
  const selectWeapon = useCallback((weapon) => {
    const next = {
      weapon: {
        name: weapon.name,
        material: weapon.material,
        category: weapon.category,
        tier: weapon.tier,
        lore: weapon.lore || [],
      },
      item_type: mapItemType(weapon.category),
      modifiers: {
        hexEnchantments: [], // [{id, level, maxLevel}], normal enchants
        ultimateEnchantment: null, // {id, level, maxLevel} | null — only one allowed
        gemstones: [],
        books: [],
        modifiers: [],
        reforge: null,
        itemUpgrades: [],
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setBuild(next);
  }, []);

  // Applies (or replaces) a chosen level for one enchant. Ultimate enchants
  // occupy their own single slot (an item can only hold one); normal
  // enchants upsert into the list by id. removeIds (from
  // computeConflictingEntries) are dropped first, so the "X will be removed"
  // warning shown on hover is never a broken promise.
  const applyEnchant = useCallback((id, level, maxLevel, removeIds = []) => {
    setBuild((prev) => {
      if (!prev) return prev;
      const entry = { id, level, maxLevel };
      const next = { ...prev, modifiers: { ...prev.modifiers } };

      let hexEnchantments = prev.modifiers.hexEnchantments.filter((e) => !removeIds.includes(e.id));
      let ultimateEnchantment =
        prev.modifiers.ultimateEnchantment && removeIds.includes(prev.modifiers.ultimateEnchantment.id)
          ? null
          : prev.modifiers.ultimateEnchantment;

      if (isUltimateEnchant(id)) {
        next.modifiers.ultimateEnchantment = entry;
        next.modifiers.hexEnchantments = hexEnchantments;
      } else {
        next.modifiers.hexEnchantments = [...hexEnchantments.filter((e) => e.id !== id), entry];
        next.modifiers.ultimateEnchantment = ultimateEnchantment;
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Sets (or replaces) the gemstone in one slot. gemstones is a sparse
  // array indexed by slot position, matching the order slots are laid out
  // in on the Gemstones screen.
  const applyGemstone = useCallback((slotIndex, gemId, tier) => {
    setBuild((prev) => {
      if (!prev) return prev;
      const gemstones = (prev.modifiers.gemstones || []).slice();
      gemstones[slotIndex] = { gem: gemId, tier };
      const next = { ...prev, modifiers: { ...prev.modifiers, gemstones } };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeGemstone = useCallback((slotIndex) => {
    setBuild((prev) => {
      if (!prev) return prev;
      const gemstones = (prev.modifiers.gemstones || []).slice();
      gemstones[slotIndex] = null;
      const next = { ...prev, modifiers: { ...prev.modifiers, gemstones } };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <BuildContext.Provider value={{ build, selectWeapon, applyEnchant, applyGemstone, removeGemstone }}>
      {children}
    </BuildContext.Provider>
  );
}

export function useBuild() {
  const ctx = useContext(BuildContext);
  if (!ctx) throw new Error('useBuild must be used within BuildProvider');
  return ctx;
}

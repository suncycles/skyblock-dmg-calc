import { createContext, useCallback, useContext, useState } from 'react';

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
    return JSON.parse(stored);
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
        hexEnchantments: { damage_boosts: [], utility: [], defense: [] },
        ultimateEnchantment: null,
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

  return <BuildContext.Provider value={{ build, selectWeapon }}>{children}</BuildContext.Provider>;
}

export function useBuild() {
  const ctx = useContext(BuildContext);
  if (!ctx) throw new Error('useBuild must be used within BuildProvider');
  return ctx;
}

// Global states
let weaponsData = { weapons: [] };
let currentlyModifying = null;

// Inline SVG fallback so a broken icon never depends on a third-party host.
const FALLBACK_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' fill='%23707070'/%3E%3Ctext x='12' y='17' font-size='14' text-anchor='middle' fill='%23ddd'%3E%3F%3C/text%3E%3C/svg%3E";

// Minecraft's item ids occasionally diverge from our icon file names
// (e.g. the shovel item id is historically "SPADE"); map known cases here.
const MATERIAL_ALIASES = { SPADE: 'SHOVEL' };

// Helper to resolve the correct image file name based on material string.
// Local icons are stored Title_Cased (e.g. "Diamond_Sword.png"), while the
// worker normalizes NEU-REPO's namespaced itemid ("minecraft:diamond_sword")
// to upper snake case ("DIAMOND_SWORD") before this ever sees it.
function getWeaponIcon(material) {
  if (!material) return 'images/default.png';
  const normalized = material
    .toUpperCase()
    .split('_')
    .map((part) => MATERIAL_ALIASES[part] || part)
    .join('_');
  const titleCased = normalized
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('_');
  return `images/${titleCased}.png`;
}

// Maps categories (e.g. "SWORD" or "BOW") to normalized lowercase strings
function mapItemType(category) {
  const cat = category ? category.toLowerCase() : '';
  if (cat === 'sword' || cat === 'longsword' || cat === 'bow') {
    return cat;
  }
  return 'sword'; // default fallback
}

// Event handler triggered when a weapon card is clicked.
// Builds the shared "currentlyModifying" schema, persists it so hex.html
// can pick it up, then navigates there.
function selectWeapon(weapon) {
  currentlyModifying = {
    weapon: {
      name: weapon.name,
      material: weapon.material,
      category: weapon.category,
      tier: weapon.tier,
      lore: weapon.lore || []
    },
    item_type: mapItemType(weapon.category),
    modifiers: {
      hexEnchantments: {
        damage_boosts: [],
        utility: [],
        defense: []
      },
      ultimateEnchantment: null,
      gemstones: [],
      books: [],
      modifiers: [],
      reforge: null,
      itemUpgrades: []
    }
  };

  localStorage.setItem('currentlyModifying', JSON.stringify(currentlyModifying));
  window.location.href = 'hex.html';
}

// Generates the DOM list elements
function renderWeaponsGrid(weaponsList) {
  const grid = document.getElementById('weapons-grid');
  grid.innerHTML = ''; // Clear loading message or older elements

  if (!weaponsList || weaponsList.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center;">No weapons found.</div>';
    return;
  }

  weaponsList.forEach((weapon) => {
    // Create container card
    const card = document.createElement('div');
    card.className = 'weapon-card';

    // Create and configure icon image
    const img = document.createElement('img');
    img.className = 'weapon-icon';
    img.src = getWeaponIcon(weapon.material);
    img.alt = weapon.name;
    
    // Fallback if local image files don't exist in your directory
    img.onerror = () => {
      img.onerror = null;
      img.src = FALLBACK_ICON;
    };

    // Create name container
    const nameDiv = document.createElement('div');
    nameDiv.className = 'weapon-name';
    nameDiv.textContent = weapon.name;

    // Build the hierarchy
    card.appendChild(img);
    card.appendChild(nameDiv);

    // Event listener mapping to our active modification state
    card.addEventListener('click', () => selectWeapon(weapon));

    // Append to parent container
    grid.appendChild(card);
  });
}

// Fetches weapon data asynchronously from your Cloudflare Worker cache API
async function fetchWeaponsData() {
  const grid = document.getElementById('weapons-grid');
  grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center;">Loading weapons from API...</div>';

  const API_URL = 'https://dmg-calc-cache.mich536ael.workers.dev/api/items';

  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Normalize data check: matches {"weapons": [...]} or raw array fallback
    if (data && Array.isArray(data.weapons)) {
      weaponsData = data;
    } else if (Array.isArray(data)) {
      weaponsData = { weapons: data };
    } else {
      throw new Error("Invalid API response format");
    }

    renderWeaponsGrid(weaponsData.weapons);

  } catch (error) {
    console.error('Failed to fetch weapons:', error);
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; color: #ff6b6b;">
        Failed to load weapons. <br>
        <small>${error.message}</small>
      </div>`;
  }
}

// Wires the search box: shows a dropdown of weapons whose name starts with
// the typed text, updated on every keystroke. Selecting an entry behaves
// exactly like clicking its card.
function setupWeaponSearch() {
  const input = document.getElementById('weapon-search');
  const dropdown = document.getElementById('search-dropdown');

  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    dropdown.innerHTML = '';

    if (!query) {
      dropdown.classList.remove('open');
      return;
    }

    const matches = weaponsData.weapons
      .filter((weapon) => weapon.name && weapon.name.toLowerCase().startsWith(query))
      .slice(0, 8);

    if (matches.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'search-dropdown-empty';
      empty.textContent = 'No matching weapons.';
      dropdown.appendChild(empty);
    } else {
      matches.forEach((weapon) => {
        const item = document.createElement('div');
        item.className = 'search-dropdown-item';

        const img = document.createElement('img');
        img.src = getWeaponIcon(weapon.material);
        img.alt = weapon.name;
        img.onerror = () => { img.onerror = null; img.src = FALLBACK_ICON; };

        const label = document.createElement('span');
        label.textContent = weapon.name;

        item.appendChild(img);
        item.appendChild(label);
        item.addEventListener('click', () => selectWeapon(weapon));

        dropdown.appendChild(item);
      });
    }

    dropdown.classList.add('open');
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.search-bar')) {
      dropdown.classList.remove('open');
    }
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      dropdown.classList.remove('open');
      input.blur();
    }
  });
}

// Fetch the data when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  fetchWeaponsData();
  setupWeaponSearch();
});
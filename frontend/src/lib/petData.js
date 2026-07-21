import { STAT_LABELS } from './reforgeData';

/* Pet stats, sourced from NEU-REPO's constants/petnums.json (worker
   forwards it live under itemData.pets, see worker/src/index.js) — shaped
   { [petId]: { [rarity]: { "1": {statNums}, "100": {statNums} } } }.
   Only levels 1 and 100 are given; everything in between is linearly
   interpolated here. Real Hypixel pet stats aren't guaranteed linear by
   level, so this is a documented simplification — same kind of judgment
   call as lib/specialWeapons.js's linear Midas Sword/Staff approximation.

   Pets have no NEU-REPO icon or lore at all (they aren't `items/`
   entries), unlike weapons/armor/pet items. */

export const MAX_PET_LEVEL = 100; // real cap is 200 for the 3 dragon pets — not modeled yet

const PET_ID_DISPLAY_NAME_OVERRIDES = {
  TYRANNOSAURUS: 'T-Rex', // the only entry in NEU-REPO's id_to_display_name
};

function titleCase(word) {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function derivePetDisplayName(petId) {
  if (PET_ID_DISPLAY_NAME_OVERRIDES[petId]) return PET_ID_DISPLAY_NAME_OVERRIDES[petId];
  return petId
    .toLowerCase()
    .split('_')
    .map(titleCase)
    .join(' ');
}

// Flattens {petId: {rarity: {...}}} into one pseudo-item per (pet, rarity)
// pair — same list-shape precedent as "Starred Midas Sword" already being
// a separate weapons.json row from "Midas Sword", so ItemPicker.jsx needs
// zero pet-specific logic. `material: 'BONE'` is deliberate: it reuses
// getWeaponIcon()'s material -> /images/{Material}.png fallback path
// (Bone.png already exists) so WeaponIcon renders something sensible with
// no pet-specific icon code, matching how reforge stones without their
// own art fall back to a shared generic icon.
export function getFlattenedPets(petsRaw) {
  const pets = [];
  for (const [petId, byRarity] of Object.entries(petsRaw || {})) {
    const displayName = derivePetDisplayName(petId);
    for (const [rarity, levels] of Object.entries(byRarity || {})) {
      if (!levels || !levels['1'] || !levels['100']) continue;
      pets.push({
        id: `${petId}_${rarity}`,
        petId,
        // Rarity prefixed into the name (not just carried in `tier`) since
        // the same pet appears once per rarity in this flattened list —
        // without it every row for one species would show the identical
        // label ("Wolf", "Wolf", "Wolf"...) with nothing to tell them
        // apart in the picker's search/grid.
        name: `${titleCase(rarity)} ${displayName}`,
        tier: rarity,
        material: 'BONE',
        level1Stats: levels['1'].statNums || {},
        level100Stats: levels['100'].statNums || {},
      });
    }
  }
  return pets;
}

export function interpolatePetStat(level1Val, level100Val, level, maxLevel = MAX_PET_LEVEL) {
  const clampedLevel = Math.max(1, Math.min(level || 1, maxLevel));
  if (maxLevel <= 1) return level1Val;
  const t = (clampedLevel - 1) / (maxLevel - 1);
  return Math.round((level1Val + (level100Val - level1Val) * t) * 10) / 10;
}

// Only combat-relevant stats (the ones STAT_LABELS already knows how to
// render) surface here — skill-fortune stats (mining fortune, farming
// fortune, etc.) are silently dropped, same scoping choice already made
// for gemstones ("only the 6 combat gemstones are wired up").
export function computePetStats(pet, level) {
  if (!pet) return {};
  const result = {};
  for (const [key, level1Val] of Object.entries(pet.level1Stats)) {
    const statKey = key.toLowerCase();
    if (!STAT_LABELS[statKey]) continue;
    const level100Val = pet.level100Stats[key];
    if (level100Val === undefined) continue;
    result[statKey] = interpolatePetStat(level1Val, level100Val, level);
  }
  return result;
}

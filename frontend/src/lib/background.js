import { getMobLocations } from './mobLocations';

// Zone theme+video backdrop, keyed off the first selected Target Mob — checked in this priority
// order: (1) the mob has its own unique background (currently just the 5 named Slayer bosses,
// whose location is otherwise just the generic "Slayer" bucket), (2) the mob's real Bestiary
// location (see lib/mobLocations.js) has a mapped background, (3) no mob selected (or an
// unmapped location) falls back to the Hub, day or night depending on the player's local clock.
//
// Video file notes (all /public/images/backgrounds/*.mp4):
// - "Isle.mp4" is Crimson Isle (Lotus Atoll has its own "Atoll.mp4").
// - "Jerry.mp4" is the land Jerry's Workshop zone; "Jerry_SC.mp4" is Jerry's Pond, the Winter
//   Island fishing spot the wiki's Bestiary lists under the "Winter" Sea Creatures tab.
// - "Lava_SC.mp4" is Lava fishing (Crimson Isle's lava lakes), distinct from Crimson Isle itself.
// - "Catacombs_1.mp4" is used for The Catacombs; "Catacombs_2.mp4" is an unused alternate.
// - Sea Creatures - Water/Fishing Festival/Spooky and Private Island/Spooky Festival have no
//   dedicated footage — all of these are Hub-hosted activities (open-water fishing, the two
//   festivals, and Private Island's own hub-like scenery), so they fall back to "Hub.mp4".
const LOCATION_BACKGROUNDS = {
  'Crimson Isle': { theme: 'inferno', video: '/images/backgrounds/Isle.mp4' },
  'Crystal Hollows': { theme: 'nova', video: '/images/backgrounds/Hollows.mp4' },
  'Deep Caverns': { theme: 'slate', video: '/images/backgrounds/Deep.mp4' },
  'Dwarven Mines': { theme: 'slate', video: '/images/backgrounds/Dwarven.mp4' },
  Galatea: { theme: 'aurora', video: '/images/backgrounds/Galatea.mp4' },
  Hub: { theme: 'parchment', video: '/images/backgrounds/Hub.mp4' },
  "Jerry's Workshop": { theme: 'frost', video: '/images/backgrounds/Jerry.mp4' },
  Kuudra: { theme: 'inferno', video: '/images/backgrounds/Kuudra.mp4' },
  'Lotus Atoll': { theme: 'parchment', video: '/images/backgrounds/Atoll.mp4' },
  Mythological: { theme: 'aurora', video: '/images/backgrounds/Mythological.mp4' },
  'Private Island': { theme: 'parchment', video: '/images/backgrounds/Hub.mp4' },
  'Sea Creatures - Backwater Bayou': { theme: 'forest', video: '/images/backgrounds/Bayou.mp4' },
  'Sea Creatures - Fishing Festival': { theme: 'parchment', video: '/images/backgrounds/Hub.mp4' },
  'Sea Creatures - Lava': { theme: 'inferno', video: '/images/backgrounds/Lava_SC.mp4' },
  'Sea Creatures - Spooky': { theme: 'slate', video: '/images/backgrounds/Hub.mp4' },
  'Sea Creatures - Water': { theme: 'parchment', video: '/images/backgrounds/Hub.mp4' },
  'Sea Creatures - Winter': { theme: 'frost', video: '/images/backgrounds/Jerry_SC.mp4' },
  "Spider's Den": { theme: 'forest', video: '/images/backgrounds/Den.mp4' },
  'Spooky Festival': { theme: 'slate', video: '/images/backgrounds/Hub.mp4' },
  'The Catacombs': { theme: 'slate', video: '/images/backgrounds/Catacombs_1.mp4' },
  'The End': { theme: 'aurora', video: '/images/backgrounds/End.mp4' },
  'The Farming Islands': { theme: 'forest', video: '/images/backgrounds/Farm.mp4' },
  'The Garden': { theme: 'forest', video: '/images/backgrounds/Garden.mp4' },
  'The Park': { theme: 'forest', video: '/images/backgrounds/Park.mp4' },
};

// The 5 Slayer bosses get their own unique footage instead of the generic "Slayer" location
// bucket every other Slayer-only mob would otherwise share.
const MOB_BACKGROUND_OVERRIDES = {
  'inferno demonlord': { theme: 'inferno', video: '/images/backgrounds/Inferno_Demonlord.mp4' },
  'revenant horror': { theme: 'slate', video: '/images/backgrounds/Revenant_Horror.mp4' },
  'sven packmaster': { theme: 'forest', video: '/images/backgrounds/Sven_Packmaster.mp4' },
  'tarantula broodfather': { theme: 'forest', video: '/images/backgrounds/Tarantula_Broodfather.mp4' },
  'voidgloom seraph': { theme: 'aurora', video: '/images/backgrounds/Voidgloom_Seraph.mp4' },
};

function isDaytime() {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18;
}

function hubDefault() {
  return isDaytime()
    ? { theme: 'parchment', video: '/images/backgrounds/day_hub.mp4' }
    : { theme: 'forest', video: '/images/backgrounds/night_hub.mp4' };
}

// No mob selected (or its location isn't one of the mapped ones) falls back to the SkyBlock hub
// — day or night depending on the player's local clock.
export function getZoneStyle(targetMobs) {
  const firstMob = targetMobs && targetMobs[0];
  if (!firstMob) return hubDefault();

  const override = MOB_BACKGROUND_OVERRIDES[firstMob.trim().toLowerCase()];
  if (override) return override;

  for (const location of getMobLocations(firstMob)) {
    if (LOCATION_BACKGROUNDS[location]) return LOCATION_BACKGROUNDS[location];
  }
  return hubDefault();
}

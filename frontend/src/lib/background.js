import { getMobLocations } from './mobLocations';

// Zone theme+image backdrop, keyed off the first selected Target Mob — checked in this priority
// order: (1) the mob has its own unique background (currently just the 5 named Slayer bosses,
// whose location is otherwise just the generic "Slayer" bucket), (2) the mob's real Bestiary
// location (see lib/mobLocations.js) has a mapped background, (3) no mob selected (or an
// unmapped location) falls back to the Hub, day or night depending on the player's local clock.
//
// Each image is a single frame grabbed from the original ALAND's Immersive Skyblock Modpack
// footage (see Credits), cropped to remove a black border baked into the source recordings
// (an OBS export artifact, not a bug in this app) and lightly blurred — see
// docs/rebuild-backgrounds.md for the exact ffmpeg recipe if these ever need regenerating.
//
// Image file notes (all /public/images/backgrounds/*.jpg):
// - "Isle.jpg" is Crimson Isle (Lotus Atoll has its own "Atoll.jpg").
// - "Jerry.jpg" is the land Jerry's Workshop zone; "Jerry_SC.jpg" is Jerry's Pond, the Winter
//   Island fishing spot the wiki's Bestiary lists under the "Winter" Sea Creatures tab.
// - "Lava_SC.jpg" is Lava fishing (Crimson Isle's lava lakes), distinct from Crimson Isle itself.
// - "Catacombs_1.jpg" is used for The Catacombs.
// - Sea Creatures - Water/Fishing Festival/Spooky and Private Island/Spooky Festival have no
//   dedicated footage — all of these are Hub-hosted activities (open-water fishing, the two
//   festivals, and Private Island's own hub-like scenery), so they fall back to "Hub.jpg".
const LOCATION_BACKGROUNDS = {
  'Crimson Isle': { theme: 'inferno', image: '/images/backgrounds/Isle.jpg' },
  'Crystal Hollows': { theme: 'nova', image: '/images/backgrounds/Hollows.jpg' },
  'Deep Caverns': { theme: 'slate', image: '/images/backgrounds/Deep.jpg' },
  'Dwarven Mines': { theme: 'slate', image: '/images/backgrounds/Dwarven.jpg' },
  Galatea: { theme: 'aurora', image: '/images/backgrounds/Galatea.jpg' },
  Hub: { theme: 'parchment', image: '/images/backgrounds/Hub.jpg' },
  "Jerry's Workshop": { theme: 'frost', image: '/images/backgrounds/Jerry.jpg' },
  Kuudra: { theme: 'inferno', image: '/images/backgrounds/Kuudra.jpg' },
  'Lotus Atoll': { theme: 'parchment', image: '/images/backgrounds/Atoll.jpg' },
  Mythological: { theme: 'aurora', image: '/images/backgrounds/Mythological.jpg' },
  'Private Island': { theme: 'parchment', image: '/images/backgrounds/Hub.jpg' },
  'Sea Creatures - Backwater Bayou': { theme: 'forest', image: '/images/backgrounds/Bayou.jpg' },
  'Sea Creatures - Fishing Festival': { theme: 'parchment', image: '/images/backgrounds/Hub.jpg' },
  'Sea Creatures - Lava': { theme: 'inferno', image: '/images/backgrounds/Lava_SC.jpg' },
  'Sea Creatures - Spooky': { theme: 'slate', image: '/images/backgrounds/Hub.jpg' },
  'Sea Creatures - Water': { theme: 'parchment', image: '/images/backgrounds/Hub.jpg' },
  'Sea Creatures - Winter': { theme: 'frost', image: '/images/backgrounds/Jerry_SC.jpg' },
  "Spider's Den": { theme: 'forest', image: '/images/backgrounds/Den.jpg' },
  'Spooky Festival': { theme: 'slate', image: '/images/backgrounds/Hub.jpg' },
  'The Catacombs': { theme: 'slate', image: '/images/backgrounds/Catacombs_1.jpg' },
  'The End': { theme: 'aurora', image: '/images/backgrounds/End.jpg' },
  'The Farming Islands': { theme: 'forest', image: '/images/backgrounds/Farm.jpg' },
  'The Garden': { theme: 'forest', image: '/images/backgrounds/Garden.jpg' },
  'The Park': { theme: 'forest', image: '/images/backgrounds/Park.jpg' },
};

// The 5 Slayer bosses get their own unique footage instead of the generic "Slayer" location
// bucket every other Slayer-only mob would otherwise share.
const MOB_BACKGROUND_OVERRIDES = {
  'inferno demonlord': { theme: 'inferno', image: '/images/backgrounds/Inferno_Demonlord.jpg' },
  'revenant horror': { theme: 'slate', image: '/images/backgrounds/Revenant_Horror.jpg' },
  'sven packmaster': { theme: 'forest', image: '/images/backgrounds/Sven_Packmaster.jpg' },
  'tarantula broodfather': { theme: 'forest', image: '/images/backgrounds/Tarantula_Broodfather.jpg' },
  'voidgloom seraph': { theme: 'aurora', image: '/images/backgrounds/Voidgloom_Seraph.jpg' },
};

function isDaytime() {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18;
}

function hubDefault() {
  return isDaytime()
    ? { theme: 'parchment', image: '/images/backgrounds/day_hub.jpg' }
    : { theme: 'forest', image: '/images/backgrounds/night_hub.jpg' };
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

import { getMobTypes } from './mobTypes';

// Zone-themed background, picked off the first selected Target Mob's type — checked in this
// priority order since a mob can carry more than one type (e.g. Blight is Infernal + Undead).
const TYPE_BACKGROUNDS = [
  ['Arthropod', '/images/backgrounds/den.gif'],
  ['Infernal', '/images/backgrounds/tomb.gif'],
  ['Undead', '/images/backgrounds/catacombs.gif'],
  ['Ender', '/images/backgrounds/void.gif'],
];

function isDaytime() {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18;
}

// No mob selected (or its type isn't one of the four zoned ones) falls back to the SkyBlock
// hub, day or night depending on the player's local clock.
export function getBackgroundGif(targetMobs) {
  const firstMob = targetMobs && targetMobs[0];
  if (firstMob) {
    const types = getMobTypes(firstMob);
    for (const [type, gif] of TYPE_BACKGROUNDS) {
      if (types.includes(type)) return gif;
    }
  }
  return isDaytime() ? '/images/backgrounds/hub_day.gif' : '/images/backgrounds/hub_night.gif';
}

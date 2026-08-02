import { getMobTypes } from './mobTypes';

// Zone theme+backdrop, paired so the background gif and the active GUI theme always match —
// picked off the first selected Target Mob's type, checked in this priority order (most
// specific first) since a mob can carry more than one type (e.g. Lava Pigman is Magmatic +
// Undead; Skeletal is itself a more specific Undead subtype).
//
// No real footage exists yet for a dedicated Crimson Isle or ocean backdrop — the placeholder
// stub files that used to sit here (crimson_isle.gif/ocean.gif, ~5KB each, literally just the
// text "PLACEHOLDER") were shipping to real users, so Magmatic reuses the real Inferno/tomb
// backdrop (same theme as Infernal) and Aquatic is left unmapped, falling through to the normal
// hub day/night default below like any other type without a dedicated zone. Swap these back to
// real per-zone assets once footage is captured — see project backlog.
const TYPE_ZONES = [
  ['Skeletal', { theme: 'forest', background: '/images/backgrounds/hub_night.gif' }],
  ['Magmatic', { theme: 'inferno', background: '/images/backgrounds/tomb.gif' }],
  ['Ender', { theme: 'aurora', background: '/images/backgrounds/void.gif' }],
  ['Infernal', { theme: 'inferno', background: '/images/backgrounds/tomb.gif' }],
  ['Undead', { theme: 'slate', background: '/images/backgrounds/catacombs.gif' }],
];

function isDaytime() {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18;
}

// No mob selected (or its type isn't one of the zoned ones) falls back to the SkyBlock hub —
// Parchment by day, Forest by night — depending on the player's local clock.
export function getZoneStyle(targetMobs) {
  const firstMob = targetMobs && targetMobs[0];
  if (firstMob) {
    const types = getMobTypes(firstMob);
    for (const [type, zone] of TYPE_ZONES) {
      if (types.includes(type)) return zone;
    }
  }
  return isDaytime()
    ? { theme: 'parchment', background: '/images/backgrounds/hub_day.gif' }
    : { theme: 'forest', background: '/images/backgrounds/hub_night.gif' };
}

import { MOB_TYPES } from './mobTypes';

// Skyblock's ~211 mobs (lib/mobTypes.js) have no unique head/skin asset
// anywhere in this app's bundled data — NEU-REPO only covers inventory
// items, not mob entities, and most Skyblock mobs are reskins of a
// vanilla Minecraft entity rather than a genuinely new model. Rather than
// source (or fabricate) per-mob art, each mob is classified to its
// underlying vanilla entity type and rendered as a Minecraft-style
// "spawn egg" icon (two-tone circle) using that entity's real spawn-egg
// colors — approximate, not pixel-accurate to any shipped asset, but
// instantly recognizable and requires no external asset fetching at all.
//
// Classification is 3-tier, checked in order:
//  1. NAME_OVERRIDES — exact mob name, for well-known reskins/bosses
//     whose real name doesn't contain their vanilla base entity's name
//     (e.g. "Ashfang" is a wolf boss, "Voidgloom Seraph" is Enderman-
//     based).
//  2. SUBSTRING_RULES — mob name contains a vanilla entity's own name
//     (e.g. "Zombie Knight" -> zombie), checked in a specific order so
//     compound names resolve to their most specific match ("Wither
//     Skeleton" before the bare "wither"/"skeleton" rules).
//  3. TYPE_FALLBACK — first matching Skyblock Mob Type (lib/mobTypes.js)
//     in priority order maps to a representative vanilla entity, so any
//     mob with no direct name match still gets a thematically sensible
//     icon rather than a blank tile. Mobs entirely missing from
//     MOB_TYPES (not yet documented by the wiki — see that file's own
//     header) fall through to a plain grey "unknown" egg.
//
// This is a best-effort approximation, not a verified per-mob mapping —
// same "documented, not guessed-and-hidden" honesty as MOB_TYPES' own
// known-incomplete coverage.

const VANILLA_TYPE_COLORS = {
  zombie: { base: '#4E7A3D', spots: '#2E4A24' },
  zombie_villager: { base: '#4E7A3D', spots: '#6B4A2F' },
  skeleton: { base: '#C1C1C1', spots: '#4A4A4A' },
  wither_skeleton: { base: '#2B2B2B', spots: '#151515' },
  wither: { base: '#161616', spots: '#5C1414' },
  spider: { base: '#2E2620', spots: '#A31E1E' },
  cave_spider: { base: '#1F4A4A', spots: '#8C1E1E' },
  enderman: { base: '#1B1B1B', spots: '#7B2FBE' },
  endermite: { base: '#3A2F52', spots: '#7B2FBE' },
  blaze: { base: '#DBA827', spots: '#FFF3A0' },
  ghast: { base: '#E8E8E8', spots: '#B0B0B0' },
  slime: { base: '#4FAA2B', spots: '#8FD46B' },
  magma_cube: { base: '#C1441F', spots: '#F2B705' },
  creeper: { base: '#3FA34D', spots: '#1E5C28' },
  guardian: { base: '#3A8C82', spots: '#D8C93A' },
  iron_golem: { base: '#9A9A9A', spots: '#8C5A3C' },
  stray: { base: '#9FB4B8', spots: '#C9E8EA' },
  phantom: { base: '#3A4750', spots: '#8FA6A0' },
  wolf: { base: '#B8A98E', spots: '#5A4632' },
  ender_dragon: { base: '#1A0F26', spots: '#9B2FD1' },
  horse: { base: '#7A4B28', spots: '#C99B5E' },
  zombified_piglin: { base: '#E39A9A', spots: '#D4AF37' },
  witch: { base: '#4A3D5C', spots: '#7BA331' },
  silverfish: { base: '#7A7A7A', spots: '#B8B8B8' },
  vindicator: { base: '#4F6B5C', spots: '#6B4A2F' },
  fox: { base: '#D97C34', spots: '#F2E8D8' },
  unknown: { base: '#6B6B6B', spots: '#3D3D3D' },
};

// Exact mob name -> vanilla type, for reskins/bosses without a matching
// substring — real Hypixel Skyblock mob knowledge, not inferred.
const NAME_OVERRIDES = {
  Ashfang: 'wolf',
  'Sven Packmaster': 'wolf',
  'Howling Spirit': 'wolf',
  'Soul of the Alpha': 'wolf',
  'Pack Spirit': 'wolf',
  Werewolf: 'wolf',
  'Voidgloom Seraph': 'enderman',
  Voidling: 'enderman',
  'Voidling Extremist': 'enderman',
  'Voidling Fanatic': 'enderman',
  Zealot: 'enderman',
  'Zealot Bruiser': 'enderman',
  'Special Zealot': 'enderman',
  Seer: 'enderman',
  'Obsidian Defender': 'enderman',
  Bal: 'blaze',
  Bezal: 'blaze',
  'Inferno Demonlord': 'blaze',
  Automaton: 'iron_golem',
  'Gaia Construct': 'iron_golem',
  'Star Sentry': 'iron_golem',
  Terracotta: 'iron_golem',
  'Wither Sentry': 'iron_golem',
  Yeti: 'stray',
  Frosty: 'stray',
  Grinch: 'stray',
  Nutcracker: 'zombie_villager',
  'Deep Sea Protector': 'guardian',
  Nightmare: 'horse',
  'Grim Reaper': 'wither_skeleton',
};

// Checked in order — earlier (more specific/compound) entries must come
// before the bare substrings they contain.
const SUBSTRING_RULES = [
  ['ender dragon', 'ender_dragon'],
  ['dragon', 'ender_dragon'],
  ['wither skeleton', 'wither_skeleton'],
  ['zombie villager', 'zombie_villager'],
  ['zombified piglin', 'zombified_piglin'],
  ['cave spider', 'cave_spider'],
  ['magma cube', 'magma_cube'],
  ['skelet', 'skeleton'], // catches "Skeletor" too
  ['wither', 'wither_skeleton'],
  ['zombie', 'zombie'],
  ['creeper', 'creeper'],
  ['endermite', 'endermite'],
  ['enderman', 'enderman'],
  ['ghast', 'ghast'],
  ['blaze', 'blaze'],
  ['magma', 'magma_cube'],
  ['slime', 'slime'],
  ['spider', 'spider'],
  ['guardian', 'guardian'],
  ['golem', 'iron_golem'],
  ['witch', 'witch'],
  ['horse', 'horse'],
  ['wolf', 'wolf'],
  ['bat', 'bat'],
  ['pigman', 'zombified_piglin'],
  ['piglin', 'zombified_piglin'],
  ['silverfish', 'silverfish'],
  ['phantom', 'phantom'],
  ['fox', 'fox'],
];

// First matching Skyblock Mob Type (in this priority order) maps to a
// representative vanilla entity — covers any mob with no name match.
const TYPE_FALLBACK = [
  ['Wither', 'wither_skeleton'],
  ['Skeletal', 'skeleton'],
  ['Undead', 'zombie'],
  ['Arthropod', 'spider'],
  ['Ender', 'enderman'],
  ['Infernal', 'blaze'],
  ['Cubic', 'slime'],
  ['Magmatic', 'magma_cube'],
  ['Aquatic', 'guardian'],
  ['Construct', 'iron_golem'],
  ['Frozen', 'stray'],
  ['Glacial', 'stray'],
  ['Spooky', 'wither_skeleton'],
  ['Airborne', 'phantom'],
  ['Humanoid', 'zombie_villager'],
  ['Animal', 'wolf'],
  ['Mythological', 'ender_dragon'],
  ['Shielded', 'vindicator'],
  ['Elusive', 'fox'],
  ['Pest', 'silverfish'],
  ['Subterranean', 'cave_spider'],
  ['Woodland', 'vindicator'],
];

export function getMobVanillaType(mobName) {
  if (NAME_OVERRIDES[mobName]) return NAME_OVERRIDES[mobName];
  const lower = mobName.toLowerCase();
  for (const [needle, type] of SUBSTRING_RULES) {
    if (lower.includes(needle)) return type;
  }
  const types = MOB_TYPES[mobName];
  if (types) {
    for (const [skyblockType, vanillaType] of TYPE_FALLBACK) {
      if (types.includes(skyblockType)) return vanillaType;
    }
  }
  return 'unknown';
}

// Inline SVG "spawn egg" — a base-colored oval with a few irregular
// spot-colored blobs, mimicking the mottled look of a real Minecraft
// spawn egg without reproducing any actual texture. Cached per type
// since the same handful of eggs get reused across ~211 mobs.
const iconCache = new Map();

function buildSpawnEggSvg(base, spots) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<ellipse cx="16" cy="17" rx="13" ry="14" fill="${base}"/>` +
    `<ellipse cx="10" cy="11" rx="4" ry="3.2" fill="${spots}" transform="rotate(-20 10 11)"/>` +
    `<ellipse cx="21" cy="15" rx="3.4" ry="2.6" fill="${spots}" transform="rotate(15 21 15)"/>` +
    `<ellipse cx="13" cy="23" rx="3.8" ry="2.8" fill="${spots}" transform="rotate(8 13 23)"/>` +
    `<ellipse cx="22" cy="25" rx="2.6" ry="2" fill="${spots}" transform="rotate(-10 22 25)"/>` +
    `</svg>`
  );
}

export function getMobIconDataUri(mobName) {
  const type = getMobVanillaType(mobName);
  if (iconCache.has(type)) return iconCache.get(type);
  const { base, spots } = VANILLA_TYPE_COLORS[type] || VANILLA_TYPE_COLORS.unknown;
  const uri = `data:image/svg+xml,${encodeURIComponent(buildSpawnEggSvg(base, spots))}`;
  iconCache.set(type, uri);
  return uri;
}

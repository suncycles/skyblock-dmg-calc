// Mob Types — Hypixel Skyblock's own in-game mob classification system
// (visible per-mob in the Bestiary), added 2025/07/31. Sourced from the
// wiki's raw wikitext this session (not guessed):
// https://hypixel-skyblock.fandom.com/wiki/Mob_Types (the 23 types + their
// effective enchant) and
// https://hypixel-skyblock.fandom.com/wiki/Mob_Types/List (the mob→type
// table below). Fetched via the MediaWiki `api.php?action=query&prop=
// revisions` endpoint — the wiki's `?action=raw` path is now behind a
// Cloudflare JS challenge.
//
// Coverage: 211 of a reported 268 total mobs (~79%) — the source page is
// self-tagged `{{Sectionstub}}` by its own editors, i.e. known-incomplete,
// not just possibly stale. A mob missing from MOB_TYPES means "not yet
// documented by the wiki," not "has no type." A maintained reference table
// (searchable/filterable, same data) lives at docs/mob-types-reference.html
// for re-checking coverage over time.
//
// Only 9 of the 23 types have a matching enchantment that grants bonus
// damage against them — see MOB_TYPE_ENCHANTS. The rest (Humanoid, Frozen,
// Spooky, Mythological, Subterranean, Pest, Animal, Magmatic, Elusive,
// Construct, Arcane, Shielded, Airborne, Glacial) are flavor/lore
// classification only, with no matching enchant.

// Real per-level enchant lore for these 9, verified directly against
// NEU-REPO this session: Smite/Ender Slayer/Bane of Arthropods/Smoldering/
// Impaling/Woodsplitter were all rewritten to name the Mob Type itself
// ("Increases damage dealt to Aquatic mobs by 5%") when Hypixel shipped
// Mob Types — but Cubism's tooltip is still the old hand-written mob
// enumeration ("Magma Cubes, Slimes, and Creepers"), never updated to
// match. Keyed by the real NEU-REPO item id (lowercase) rather than
// display name, since titleCaseEnchantId's naive "capitalize every
// underscore-split word" would produce "Bane Of Arthropods" (capital
// "Of"), and Woodsplitter's actual id is the legacy "arcane" (confirmed
// via NEU-REPO — ARCANE;1.json's lore reads "Woodsplitter I").
export const ENCHANT_ID_MOB_TYPES = {
  smite: ['Undead', 'Skeletal', 'Wither'],
  ender_slayer: ['Ender'],
  bane_of_arthropods: ['Arthropod'],
  smoldering: ['Infernal'],
  cubism: ['Cubic'],
  impaling: ['Aquatic'],
  arcane: ['Woodland'],
};

export const MOB_TYPE_ENCHANTS = {
  Undead: 'Smite',
  Skeletal: 'Smite',
  Wither: 'Smite',
  Ender: 'Ender Slayer',
  Arthropod: 'Bane of Arthropods',
  Infernal: 'Smoldering',
  Cubic: 'Cubism',
  Aquatic: 'Impaling',
  Woodland: 'Woodsplitter',
};

export const MOB_TYPES = {
  'Abyssal Miner': ['Aquatic', 'Undead'],
  'Apostle': ['Undead', 'Wither'],
  'Arachne': ['Arcane', 'Arthropod'],
  'Ashfang': ['Arcane', 'Infernal'],
  'Automaton': ['Arcane', 'Construct', 'Subterranean'],
  'Bal': ['Cubic', 'Infernal', 'Shielded'],
  'Bat': ['Airborne', 'Animal', 'Spooky'],
  'Bat Piñata': ['Airborne', 'Shielded', 'Spooky'],
  'Bayou Sludge': ['Aquatic', 'Cubic'],
  'Beetle': ['Pest'],
  'Bezal': ['Infernal'],
  'Bladesoul': ['Arcane', 'Skeletal', 'Wither'],
  'Blaze': ['Infernal'],
  'Blight': ['Infernal', 'Undead'],
  'Blue Jerry': ['Humanoid', 'Shielded'],
  'Bogged': ['Aquatic', 'Skeletal'],
  'Bonzo': ['Arcane', 'Humanoid'],
  'Boss Corleone': ['Humanoid', 'Subterranean'],
  'Butterfly': ['Airborne', 'Arcane', 'Subterranean'],
  'Chaosmite': ['Arcane', 'Arthropod', 'Ender'],
  'Chillblade': ['Skeletal', 'Woodland'],
  'Chillshot': ['Skeletal', 'Woodland'],
  'Crazy Witch': ['Shielded', 'Spooky'],
  'Creeper': ['Cubic'],
  'Cretan Bull': ['Animal', 'Mythological'],
  'Cricket': ['Pest'],
  'Crypt Dreadlord': ['Subterranean', 'Undead', 'Wither'],
  'Crypt Ghoul': ['Undead'],
  'Crypt Lurker': ['Undead'],
  'Crypt Souleater': ['Subterranean', 'Undead', 'Wither'],
  'Crypt Undead': ['Subterranean', 'Undead'],
  'Deep Sea Protector': ['Aquatic', 'Construct'],
  'Diamond Goblin': ['Elusive', 'Humanoid', 'Shielded'],
  'Dragonfly': ['Pest'],
  'Dropship': ['Airborne', 'Arcane', 'Cubic'],
  'Earthworm': ['Pest'],
  'Emerald Slime': ['Cubic'],
  'End Stone Protector': ['Construct', 'Ender'],
  'Ender Dragon': ['Airborne', 'Arcane', 'Ender'],
  'Enderman': ['Ender'],
  'Endermite': ['Arthropod', 'Ender'],
  'Explosive Imp': ['Infernal', 'Undead'],
  'Fels': ['Arcane'],
  'Field Mouse': ['Elusive', 'Pest'],
  'Firefly': ['Pest'],
  'Fireproof Witch': ['Arcane', 'Humanoid', 'Magmatic'],
  'Flaming Spider': ['Arthropod', 'Infernal'],
  'Fly': ['Pest'],
  'Frosty': ['Aquatic', 'Construct', 'Frozen'],
  'Frozen Steve': ['Aquatic', 'Frozen', 'Humanoid'],
  'Gaia Construct': ['Construct', 'Mythological'],
  'Ghast': ['Airborne', 'Cubic'],
  'Ghost': ['Arcane', 'Subterranean'],
  'Glacite Bowman': ['Glacial', 'Humanoid'],
  'Glacite Caver': ['Glacial', 'Humanoid'],
  'Glacite Mage': ['Glacial', 'Humanoid'],
  'Glacite Mutt': ['Animal', 'Glacial'],
  'Glacite Walker': ['Glacial', 'Humanoid'],
  'Golden Ghoul': ['Undead'],
  'Golden Goblin': ['Humanoid', 'Shielded'],
  'Golden Jerry': ['Elusive', 'Humanoid', 'Shielded'],
  'Golem': ['Arcane', 'Construct'],
  'Gravel Skeleton': ['Skeletal'],
  'Graveyard Zombie': ['Undead'],
  'Green Jerry': ['Humanoid', 'Shielded'],
  'Grim Reaper': ['Aquatic', 'Arcane', 'Spooky'],
  'Grinch': ['Aquatic', 'Construct', 'Frozen'],
  'Grunt': ['Humanoid'],
  'Guardian Defender': ['Aquatic', 'Arcane'],
  'Harpy': ['Animal', 'Humanoid', 'Mythological'],
  'Headless Horseman': ['Animal', 'Skeletal', 'Spooky', 'Undead'],
  'Howling Spirit': ['Animal', 'Arcane'],
  'Hydrospear': ['Aquatic', 'Undead', 'Woodland'],
  'Inferno Demonlord': ['Infernal'],
  'Inferno Magma Cube': ['Cubic', 'Infernal'],
  'Kada Knight': ['Animal', 'Undead'],
  'Key Guardian': ['Subterranean', 'Undead'],
  'King Minos': ['Elusive', 'Humanoid', 'Mythological'],
  'Kuudra Berserker': ['Infernal', 'Undead'],
  'Kuudra Follower': ['Infernal', 'Undead'],
  'Kuudra Knocker': ['Infernal', 'Undead'],
  'Kuudra Landmine': ['Infernal', 'Undead'],
  'Kuudra Slasher': ['Cubic', 'Infernal'],
  'Lapis Zombie': ['Undead'],
  'Lava Pigman': ['Magmatic', 'Undead'],
  'Littlefoot': ['Elusive', 'Glacial', 'Humanoid'],
  'Locust': ['Pest'],
  'Lord Jawbus': ['Construct', 'Elusive', 'Magmatic'],
  'Lost Adventurer': ['Arcane', 'Humanoid'],
  'Mage Outlaw': ['Arcane', 'Humanoid'],
  'Magma Boss': ['Cubic', 'Infernal'],
  'Magma Cube': ['Cubic', 'Infernal'],
  'Magma Cube Rider': ['Cubic', 'Infernal', 'Undead'],
  'Magma Slug': ['Cubic', 'Magmatic'],
  'Manticore': ['Animal', 'Elusive', 'Mythological'],
  'Mega Bat': ['Airborne', 'Shielded', 'Spooky'],
  'Mimic': ['Arcane', 'Construct', 'Undead'],
  'Miner Skeleton': ['Skeletal'],
  'Miner Zombie': ['Undead'],
  'Minos Champion': ['Humanoid', 'Mythological'],
  'Minos Hunter': ['Humanoid', 'Mythological', 'Undead'],
  'Minos Inquisitor': ['Elusive', 'Humanoid', 'Mythological'],
  'Minotaur': ['Humanoid', 'Mythological'],
  'Mite': ['Pest'],
  'Mosquito': ['Pest'],
  'Moth': ['Pest'],
  'Mutated Blaze': ['Infernal'],
  'Nessie': ['Animal', 'Aquatic', 'Elusive'],
  'Nest Endermite': ['Arthropod', 'Ender'],
  'Nightmare': ['Aquatic', 'Spooky', 'Undead'],
  'Nutcracker': ['Aquatic', 'Construct', 'Frozen'],
  'Obsidian Defender': ['Ender', 'Wither'],
  'Old Dragon': ['Airborne', 'Arcane', 'Ender'],
  'Pack Spirit': ['Animal', 'Arcane'],
  'Phantom Fisher': ['Aquatic', 'Arcane', 'Spooky'],
  'Phantom Spirit': ['Shielded', 'Spooky'],
  'Plhlegblast': ['Elusive', 'Magmatic'],
  'Powder Ghast': ['Airborne', 'Cubic', 'Shielded'],
  'Praying Mantis': ['Pest'],
  'Protector Dragon': ['Airborne', 'Arcane', 'Ender'],
  'Purple Jerry': ['Humanoid', 'Shielded'],
  'Pyroclastic Worm': ['Cubic', 'Magmatic'],
  'Ragnarok': ['Elusive', 'Magmatic', 'Skeletal'],
  'Rain Slime': ['Cubic'],
  'Rat': ['Pest'],
  'Redstone Pigman': ['Undead'],
  'Reindrake': ['Elusive', 'Frozen', 'Shielded'],
  'Revenant Horror': ['Undead'],
  'Rider of the Deep': ['Animal', 'Aquatic', 'Undead'],
  'Scarecrow': ['Aquatic', 'Spooky'],
  'Scared Skeleton': ['Skeletal'],
  'Scary Jerry': ['Shielded', 'Spooky'],
  'Scatha': ['Elusive', 'Shielded', 'Subterranean'],
  'Sea Archer': ['Aquatic', 'Skeletal'],
  'Sea Guardian': ['Aquatic', 'Arcane'],
  'Sea Walker': ['Aquatic', 'Undead'],
  'Sea Witch': ['Aquatic', 'Arcane', 'Humanoid'],
  'Seer': ['Ender'],
  'Shadow Assassin': ['Arcane', 'Humanoid'],
  'Siamese Lynxes': ['Animal', 'Mythological'],
  'Skeleton': ['Skeletal'],
  'Skeleton Grunt': ['Skeletal'],
  'Skeleton Lord': ['Skeletal'],
  'Skeleton Master': ['Skeletal'],
  'Skeleton Soldier': ['Skeletal'],
  'Skeletor': ['Construct', 'Skeletal'],
  'Slime': ['Cubic'],
  'Sludge': ['Cubic', 'Subterranean'],
  'Slug': ['Pest'],
  'Smoldering Blaze': ['Infernal'],
  'Sneaky Creeper': ['Cubic'],
  'Sniper': ['Skeletal', 'Undead'],
  'Soul of the Alpha': ['Animal', 'Arcane'],
  'Special Zealot': ['Elusive', 'Ender'],
  'Sphinx': ['Elusive', 'Humanoid', 'Mythological'],
  'Spider': ['Arthropod'],
  'Spider Jockey': ['Arthropod', 'Skeletal'],
  'Star Sentry': ['Arcane', 'Construct', 'Shielded'],
  'Stranded Nymph': ['Aquatic', 'Humanoid', 'Mythological'],
  'Stridersurfer': ['Magmatic', 'Undead', 'Woodland'],
  'Strong Dragon': ['Airborne', 'Arcane', 'Ender'],
  'Super Archer': ['Skeletal'],
  'Super Tank Zombie': ['Undead'],
  'Superior Dragon': ['Airborne', 'Arcane', 'Ender'],
  'Sven Packmaster': ['Animal'],
  'Tank Zombie': ['Undead'],
  'Tarantula Broodfather': ['Arthropod'],
  'Tentacle': ['Cubic', 'Infernal'],
  'Terracotta': ['Arcane', 'Construct'],
  'The Loch Emperor': ['Aquatic', 'Arcane', 'Skeletal'],
  'The Watcher': ['Arcane'],
  'Thunder': ['Arcane', 'Elusive', 'Magmatic'],
  'Tidetot': ['Aquatic', 'Undead', 'Woodland'],
  'Titanoboa': ['Animal', 'Aquatic', 'Elusive'],
  'Trick or Treater': ['Shielded', 'Spooky'],
  'Undead': ['Undead'],
  'Undead Skeleton': ['Skeletal', 'Undead'],
  'Unstable Dragon': ['Airborne', 'Arcane', 'Ender'],
  'Vanquisher': ['Elusive', 'Wither'],
  'Vittomite': ['Arthropod', 'Ender'],
  'Voidgloom Seraph': ['Ender'],
  'Voidling': ['Ender'],
  'Voidling Extremist': ['Ender'],
  'Voidling Fanatic': ['Ender'],
  'Werewolf': ['Animal', 'Aquatic', 'Spooky'],
  'Wetwing': ['Animal', 'Aquatic', 'Undead'],
  'Wiki Tiki': ['Aquatic', 'Construct', 'Elusive'],
  'Wise Dragon': ['Airborne', 'Arcane', 'Ender'],
  'Witch': ['Arcane', 'Humanoid'],
  'Wither Gourd': ['Shielded', 'Spooky'],
  'Wither Guard': ['Skeletal', 'Wither'],
  'Wither Miner': ['Skeletal', 'Wither'],
  'Wither Sentry': ['Construct', 'Wither'],
  'Wither Skeleton': ['Skeletal', 'Wither'],
  'Wither Spectre': ['Arcane', 'Wither'],
  'Withermancer': ['Arcane', 'Skeletal', 'Wither'],
  'Wolf': ['Animal'],
  'Worm': ['Shielded', 'Subterranean'],
  'Wraith': ['Shielded', 'Spooky'],
  'Yeti': ['Aquatic', 'Frozen', 'Humanoid'],
  'Yog': ['Cubic', 'Infernal', 'Subterranean'],
  'Young Dragon': ['Airborne', 'Arcane', 'Ender'],
  'Zealot': ['Ender'],
  'Zealot Bruiser': ['Ender'],
  'Zombie': ['Undead'],
  'Zombie Commander': ['Undead'],
  'Zombie Grunt': ['Undead'],
  'Zombie Knight': ['Undead'],
  'Zombie Lord': ['Undead'],
  'Zombie Soldier': ['Undead'],
  'Zombie Villager': ['Undead'],
};

// Case-insensitive index, built once at module load — mob names as written
// in item lore/enchant descriptions ("Blazes", "Zombies") are often
// pluralized or differently-cased from the wiki's singular title-case keys.
const LOOKUP = new Map();
for (const [name, types] of Object.entries(MOB_TYPES)) {
  LOOKUP.set(name.toLowerCase(), types);
}

// Strips a trailing "s" only when the singular form is a known mob name —
// avoids mangling names that are already plural-looking on their own
// (e.g. "Slug" has no separate "Slug"/"Slugs" ambiguity to worry about,
// but this guards names like "Zombies" -> "Zombie" without assuming every
// trailing "s" is a plural marker).
export function resolveMobKey(name) {
  const key = name.trim().toLowerCase();
  if (LOOKUP.has(key)) return key;
  if (key.endsWith('s') && LOOKUP.has(key.slice(0, -1))) return key.slice(0, -1);
  return null;
}

export function getMobTypes(mobName) {
  const key = resolveMobKey(mobName);
  return key ? LOOKUP.get(key) : [];
}

export function mobHasType(mobName, type) {
  return getMobTypes(mobName).includes(type);
}

export function getEnchantForType(type) {
  return MOB_TYPE_ENCHANTS[type] || null;
}

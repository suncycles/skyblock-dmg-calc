// Bestiary "leveling reward" Strength bonus — every mob has its own Bestiary tier cap (5/10/15/
// 20/25 depending on the mob), and reaching that mob's OWN max tier grants a flat Strength bonus
// baked into its final leveling reward. User-confirmed 2026-08-26: tier-15-capped mobs grant +45
// Strength once maxed, tier-20-capped mobs grant +70. Every mob capped at some other tier (5/10/25)
// isn't covered by that rule and is deliberately left out of this table rather than guessed.
//
// A mob's own tier cap isn't a literal field anywhere in NEU-REPO's constants/bestiary.json — it's
// derived from each mob-family entry's own `cap` (the real kill count shown as 100% complete) by
// finding that value's index within its `bracket`'s cumulative kill-threshold array; index+1 is
// the real max tier. Verified against several real mobs live 2026-08-26 (Arachne/King Minos -> cap
// 100/50 land at index 14 -> tier 15; Gaia Construct/Minos Hunter -> cap 750/1000 land at index 19
// -> tier 20), then applied across NEU-REPO's full mob-family list and cross-referenced against
// this app's own MOB_TYPES names (worker/src/index.js's computeBestiaryMaxedMobs does the same
// derivation server-side, against the real account's actual per-mob kill counts, to decide which
// of these are actually unlocked for import — see lib/hypixelImport.js's consumer).
//
// Coverage: 141 of MOB_TYPES' 322 mobs matched a real bestiary.json entry with a 15 or 20 cap
// (case/singular-plural normalized — "Siamese Lynxes" here is bestiary's own "Siamese Lynx").
// Most of the remainder (bosses, uniques, Slayer bosses, Dragons) genuinely have no Bestiary entry
// at all in real Skyblock — not a matching gap. A handful of mobs capped at 5/10/25 were matched
// but intentionally excluded (see above), and ~10 more (Arachne's Brood/Keeper, and several
// Mining/Foraging-profile-specific mobs like Stoneworm/Brineling) have a real tier-15/20 bestiary
// entry but aren't in this app's own MOB_TYPES at all, so there's nothing to attach them to.
export const BESTIARY_STRENGTH_BY_MOB = {
  // Tier 15 cap -> +45 Strength once maxed
  Arachne: 45,
  Ashfang: 45,
  'Atoll Croaker': 45,
  Bal: 45,
  'Barbarian Duke X': 45,
  Bat: 45,
  Beetle: 45,
  Bladesoul: 45,
  Blaze: 45,
  'Boss Corleone': 45,
  Broodmother: 45,
  Butterfly: 45,
  'Cellar Spider': 45,
  'Crazy Witch': 45,
  'Cretan Bull': 45,
  Cricket: 45,
  'Crypt Lurker': 45,
  'Dasher Spider': 45,
  'Diamond Goblin': 45,
  Dragonfly: 45,
  Earthworm: 45,
  Fels: 45,
  'Field Mouse': 45,
  Firefly: 45,
  'Flint Skeleton': 45,
  Flipflopper: 45,
  Fly: 45,
  'Frog Prince': 45,
  'Glacite Bowman': 45,
  'Glacite Caver': 45,
  'Glacite Mage': 45,
  'Glacite Mutt': 45,
  'Goblin Raiders': 45,
  'Golden Ghoul': 45,
  'Golden Goblin': 45,
  Golem: 45,
  'Headless Horseman': 45,
  'Howling Spirit': 45,
  'Key Guardian': 45,
  'King Minos': 45,
  Locust: 45,
  'Lonely Spider': 45,
  Lotum: 45,
  'Lotus Guardian': 45,
  'Lunar Moth': 45,
  'Mage Outlaw': 45,
  'Magma Boss': 45,
  Manticore: 45,
  Matcho: 45,
  'Millennia-Aged Blaze': 45,
  Mimic: 45,
  Mite: 45,
  Mosquito: 45,
  Moth: 45,
  Nessie: 45,
  'Old Wolf': 45,
  'Pack Spirit': 45,
  'Phantom Spirit': 45,
  'Powder Ghast': 45,
  'Praying Mantis': 45,
  'Puddle Jumper': 45,
  'Rain Slime': 45,
  Rat: 45,
  'Scary Jerry': 45,
  'Shiny Pig': 45,
  Silverfish: 45,
  'Skeleton Grunt': 45,
  Skeletor: 45,
  Slug: 45,
  Sniper: 45,
  'Soul of the Alpha': 45,
  'Spider Jockey': 45,
  'Star Sentry': 45,
  'Stranded Nymph': 45,
  'Super Archer': 45,
  'Super Tank Zombie': 45,
  'Tank Zombie': 45,
  Tentacle: 45,
  Terracotta: 45,
  'The Loch Emperor': 45,
  Thyst: 45,
  Tidetot: 45,
  'Treasure Hoarder': 45,
  'Trick or Treater': 45,
  Undead: 45,
  Vanquisher: 45,
  'Voidling Extremist': 45,
  Wetwing: 45,
  'Wither Gourd': 45,
  Wolf: 45,
  Wraith: 45,
  'Zombie Grunt': 45,
  'Zombie Knight': 45,
  Zombuddy: 45,

  // Tier 20 cap -> +70 Strength once maxed
  'Angry Archaeologist': 70,
  Blight: 70,
  Bogged: 70,
  'Crypt Ghoul': 70,
  'Drowned Captain': 70,
  'End Stone Protector': 70,
  Ent: 70,
  'Explosive Imp': 70,
  'Flaming Spider': 70,
  Flare: 70,
  'Gaia Construct': 70,
  Ghast: 70,
  Ghost: 70,
  Goblin: 70,
  gorF: 70,
  Harpy: 70,
  'Inferno Magma Cube': 70,
  'Kada Knight': 70,
  'King Midas': 70,
  'Kuudra Berserker': 70,
  'Kuudra Follower': 70,
  'Kuudra Knocker': 70,
  'Kuudra Landmine': 70,
  'Magma Cube': 70,
  'Magma Cube Rider': 70,
  'Minos Champion': 70,
  'Minos Hunter': 70,
  'Minos Inquisitor': 70,
  Minotaur: 70,
  'Mushroom Bull': 70,
  'Scared Skeleton': 70,
  // Bestiary's own real name is "Siamese Lynx" (singular) — matched here under this app's own
  // plural MOB_TYPES name.
  'Siamese Lynxes': 70,
  'Skeleton Lord': 70,
  'Skeleton Soldier': 70,
  'Smoldering Blaze': 70,
  Sphinx: 70,
  'Splitter Spider': 70,
  Stridersurfer: 70,
  Tadgang: 70,
  'Voracious Spider': 70,
  'Wandering Blaze': 70,
  'Weaver Spider': 70,
  'Wither Skeleton': 70,
  'Wither Spectre': 70,
  'Zombie Commander': 70,
  'Zombie Lord': 70,
  'Zombie Soldier': 70,
};

// `maxedMobs` is the set/array of real mob names the imported account has actually reached max
// tier on (worker/src/index.js's computeBestiaryMaxedMobs) — the bonus only silently applies once
// a real import confirms it, never assumed. Manual/no-import builds always get 0 here.
export function getBestiaryStrengthBonus(mobName, maxedMobs) {
  if (!mobName || !maxedMobs) return 0;
  const bonus = BESTIARY_STRENGTH_BY_MOB[mobName];
  if (!bonus) return 0;
  const has = maxedMobs instanceof Set ? maxedMobs.has(mobName) : maxedMobs.includes?.(mobName);
  return has ? bonus : 0;
}

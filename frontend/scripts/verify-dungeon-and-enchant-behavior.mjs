#!/usr/bin/env node
// Regression guard for behaviors that have already broken once (fixed 2026-09-02, see
// lib/hypixelImport.js's git history): item Stars must stay at a flat 2%/star out of a dungeon
// and jump to a separate 10%/star Catacombs Boost total inside one; Master Stars must stay an
// independent, additive-only term that only ever applies while Master Mode is on; an imported
// item's own dungeonized flag must trust only Hypixel's real per-item NBT flag; a live-lore
// (Gear-Score) item's real, already-final stat total must not be re-inflated by re-merging its own
// real Stars/reforge/gemstones/books bonuses on top; and an imported item's displayed enchant list
// must always come from this app's own parsing of summary.enchantments — never Hypixel's raw,
// pre-rendered lore text (which duplicated it before the fix). Plain assert-based check, no test
// framework — run with `npm run verify`.
//
// Uses Vite's own module graph (ssrLoadModule) rather than plain `node script.js`, since lib/*.js
// files use extensionless relative imports that only Vite's resolver (not Node's ESM loader)
// understands — this also means the check runs against the exact same code the app ships.

import assert from 'node:assert/strict';
import { createServer } from 'vite';

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (err) {
    results.push({ name, ok: false, err });
  }
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const starring = await server.ssrLoadModule('/src/lib/starring.js');
  const dungeonize = await server.ssrLoadModule('/src/lib/dungeonize.js');
  const finalDamage = await server.ssrLoadModule('/src/lib/finalDamage.js');
  const hypixelImport = await server.ssrLoadModule('/src/lib/hypixelImport.js');
  const itemTooltip = await server.ssrLoadModule('/src/lib/itemTooltip.js');

  // 1. Item stars, Dungeon toggle OFF: flat 2%/star of the item's own pristine base stat.
  await check('stars out of a dungeon = 2%/star', () => {
    const lore = ['§7Damage: §c+200', '§7Strength: §c+100'];
    const bonus5 = starring.computeStarBonuses(lore, 5);
    assert.equal(bonus5.damage, 20, `5 stars on +200 Damage should add +20 (2%/star), got ${bonus5.damage}`);
    assert.equal(bonus5.strength, 10, `5 stars on +100 Strength should add +10 (2%/star), got ${bonus5.strength}`);
    const bonus0 = starring.computeStarBonuses(lore, 0);
    assert.deepEqual(bonus0, {}, '0 stars should add nothing');
  });

  // 2. Item stars, Dungeon toggle ON: 10%/star, a separate Catacombs Boost percentage.
  await check('stars in a dungeon = 10%/star', () => {
    assert.equal(starring.CATACOMBS_STAR_PERCENT_PER_STAR, 10);
    const zero = dungeonize.computeCatacombsBoostPercent(0, false, 0, 0, 0).withoutMaster;
    const five = dungeonize.computeCatacombsBoostPercent(0, false, 5, 0, 0).withoutMaster;
    assert.equal(five - zero, 50, `5 stars should add +50% (10%/star) to the Catacombs Boost, got +${five - zero}%`);
  });

  // 3a. Master Stars: a separate, additive-only term in the Catacombs Boost formula (5%/star),
  // independent of Catacombs Level / base Stars / General's Medallion.
  await check('Master Stars formula is independent (+5%/star, additive)', () => {
    const { withoutMaster, withMaster } = dungeonize.computeCatacombsBoostPercent(10, false, 3, 2, 4);
    assert.equal(withMaster - withoutMaster, 20, `4 Master Stars should add exactly +20% (5%/star) on top, got +${withMaster - withoutMaster}%`);
  });

  // 3b. Master Stars only ever apply while the Master Mode toggle is on — even with the Dungeon
  // toggle on and real Master Stars present, useMasterMode=false must return the withoutMaster
  // total (this exact leak happened once already this session — see finalDamage.js's own comment).
  await check('Master Stars gated behind the Master Mode toggle', () => {
    const sources = {
      baseStats: { damage: 100 },
      dungeonizedBaseStats: { damage: 150 },
      masterDungeonizedBaseStats: { damage: 200 },
      mythologicalBaseStats: {},
      mythologicalDungeonizedBaseStats: {},
      mythologicalMasterDungeonizedBaseStats: {},
      hasFinalDestinationFullSet: false,
      bestiaryMaxedMobs: null,
    };
    assert.equal(finalDamage.selectBaseStats(sources, false, false, null).damage, 100, 'Dungeon off -> plain baseStats');
    assert.equal(finalDamage.selectBaseStats(sources, false, true, null).damage, 100, 'Master Mode alone (Dungeon off) must NOT leak Master Stars in');
    assert.equal(finalDamage.selectBaseStats(sources, true, false, null).damage, 150, 'Dungeon on, Master Mode off -> dungeonized total WITHOUT Master Stars');
    assert.equal(finalDamage.selectBaseStats(sources, true, true, null).damage, 200, 'Dungeon on + Master Mode on -> full Master Star total');
  });

  // 4. An item's own `modifiers.dungeonized` flag must come ONLY from Hypixel's real per-item
  // ExtraAttributes.dungeon_item flag — never inferred from the catalog's "DUNGEON" category
  // prefix (marks gear ELIGIBLE to be Dungeonized, not that this owned copy actually is — fixed
  // 2026-09-02 round 1) and never from masterStars>0 either (disproved against sammui's real
  // Necron's Leggings: 4 real Master Stars alongside a real `dungeonized: false` — fixed 2026-09-02
  // round 2). Both were unverified assumptions that inflated a fresh/un-dungeonized item's stats
  // with the 10%/star Catacombs Boost even with the Dungeon toggle off.
  await check('per-item dungeonized flag trusts only the real NBT flag', () => {
    assert.equal(hypixelImport.resolveDungeonizedFlag({ dungeonized: false }), false, 'a real, un-dungeonized copy must resolve to false');
    assert.equal(hypixelImport.resolveDungeonizedFlag({ dungeonized: true }), true, 'a real dungeonized copy must resolve to true');
  });

  // 4b. A live-lore item's leading stat number is Hypixel's own REAL, ALREADY-FINAL total — it
  // must NOT be re-inflated by re-merging Stars/reforge/gemstones/books on top (the exact
  // regression fixed 2026-09-02: sammui's real Necron's Leggings showed Strength +111/Crit Damage
  // +78% in-game and via the raw API, but the app displayed +189.1/+130.8 — this app's own
  // pipeline was re-adding the item's real reforge(+35)/gemstone(+32)/Stars(+11.1) bonuses on top
  // of a number that already included them). Fixture: sammui's real, live-captured Necron's
  // Leggings lore (2026-09-02).
  const REAL_NECRONS_LEGGINGS_LORE = [
    '§7Gear Score: §d1068 §8(5000)',
    '§7Health: §c+410 §e(+60) §9(+7) §8(+2,279.43)',
    '§7Defense: §a+199.5 §e(+30) §9(+7) §8(+1,101.43)',
    '§7Strength: §c+111 §9(+35) §d(+32) §8(+630.23)',
    '§7Crit Chance: §9+15% §9(+15%) §8(+23.1%)',
    '§7Crit Damage: §9+78% §9(+45%) §8(+441.75%)',
    '§7Intelligence: §b+61 §9(+25) §8(+353.4)',
    '§7Health Regen: §c+5 §8(+5.2)',
    '§7Gemstones: §6[§d§6] §6[§d⚔§6]',
    '',
    '§d§l§d§lLegion V, §9Growth VI, §9Protection VI',
    '§9Rejuvenate V, §9Smarty Pants V',
    '',
    '§7Reduces the damage you take from',
    '§7withers by §c10%§7.',
    '',
    '§6Full Set Bonus: Witherborn §7(1/4)',
    '§7Spawns a wither minion every §e30',
    '§e§7seconds up to a maximum §a1 §7wither.',
    '§7Your withers will travel to and',
    '§7explode on nearby enemies.',
    '',
    '§9Ancient Bonus',
    '§7Grants §a+1 §9 Crit Damage §7per',
    '§7§cCatacombs §7level.',
    '',
    '§8✿ Black Ice Dyed',
    '§d§l§ka§r §d§lMYTHIC DUNGEON LEGGINGS §d§l§ka',
  ];

  await check('live-lore item stats are not re-inflated by Stars/reforge/gemstones/books', async () => {
    const itemData = {
      weapons: [],
      armor: [{ id: 'POWER_WITHER_LEGGINGS', category: 'DUNGEON LEGGINGS', tier: 'LEGENDARY', lore: ['§7Gear Score: §d574'] }],
      equipment: [],
      reforges: {},
      reforgeStones: { Ancient: { nbtModifier: 'ancient', stats: {} } },
      enchants: {},
    };
    const item = hypixelImport.resolveGearSummary({ id: 'POWER_WITHER_LEGGINGS', lore: REAL_NECRONS_LEGGINGS_LORE }, itemData);
    assert.equal(item.liveLore, true, 'a Gear-Score item with real per-account lore must be tagged liveLore');

    const modifiers = {
      stars: 5,
      masterStars: 4,
      dungeonized: false,
      reforge: 'Ancient',
      recombobulated: false,
      books: 0,
      artOfWar: false,
      artOfPeace: false,
      gemstones: [],
      hexEnchantments: [],
      ultimateEnchantment: null,
      special: null,
    };
    const lines = await itemTooltip.buildFullItemTooltipLines(item, modifiers, itemData, 0, 0, 0, undefined, 0, undefined, false, false, 0);
    const strength = dungeonize.sumStatFromTooltipLines(lines, 'Strength');
    const critDamage = dungeonize.sumStatFromTooltipLines(lines, 'Crit Damage');
    assert.equal(strength, 111, `Strength must stay at Hypixel's real final total of 111, got ${strength}`);
    assert.equal(critDamage, 78, `Crit Damage must stay at Hypixel's real final total of 78, got ${critDamage}`);
  });

  // Real, live-captured Astraea lore (sammui, 2026-09-02) — carries the exact raw enchant-list
  // paragraph ("§d§l§d§lUltimate Wise V, §9Bane of Arthropods VII, ..." through "..., §9Venomous VI")
  // that duplicated the tooltip's enchant list before the fix.
  const REAL_ASTRAEA_LORE = [
    '§7Gear Score: §d1785 §8(5000)',
    '§7Defense: §a+365 §8(+2,002.6)',
    '§7True Defense: §f+22 §8(+30.8)',
    '§7Damage: §c+372 §e(+30) §8(+2,032.05)',
    '§7Strength: §c+250 §e(+30) §6[+5] §9(+50) §8(+1,384.15)',
    '§7Crit Damage: §9+70% §8(+412.3%)',
    '§7Attack Speed: §e+7% §9(+7%) §8(+10.78%)',
    '§7Ferocity: §c+33 §8(+46.2)',
    '§7Intelligence: §b+210 §9(+125) §d(+30) §8(+1,207.45)',
    '§7Magic Find: §b+6 §8(+9.24)',
    '§7Gemstones: §8[§8☤§8] §6[§b⚔§6]',
    '',
    '§d§l§d§lUltimate Wise V, §9Bane of Arthropods VII, §9Champion X',
    '§9Critical VI, §9Cubism V, §9Divine Gift III',
    '§9Drain IV, §9Ender Slayer VI, §9Experience V',
    '§9Giant Killer VII, §9Gravity VI, §9Impaling V',
    '§9Lethality VI, §9Looting V, §9Luck VII',
    '§9Prosecute VI, §9Pyroclasm V, §9Scavenger V',
    '§9Smite VII, §9Smoldering IV, §9Thunderlord VII',
    '§9Triple-Strike IV, §9Vampirism VI, §9Venomous VI',
    '',
    '§7Deals §c+50% §7damage to §8 Wither §7mobs.',
    '§7Grants §c+1 §c Damage §7and §a+2 §a',
    '§aDefense §7per §cCatacombs §7level.',
    '',
    '§aScroll Abilities:',
    '§6Ability: Wither Impact  §e§lRIGHT CLICK',
    '§7Teleport §a10 blocks§7 ahead of you',
    '§7dealing §c26,503 §7damage to nearby',
    '§7enemies. Also reduces your damage',
    '§7taken and grants an absorption',
    '§7shield for §e5 seconds§7.',
    '§8Mana Cost: §3§b135',
    '',
    '§fKills: §685,040',
    '',
    '§7§cThis item has unused Gemstones! Visit',
    '§c§aGeo §cto remove them!',
    '',
    '§8§l* §8Co-op Soulbound §8§l*',
    '§d§l§ka§r §d§lMYTHIC DUNGEON SWORD §d§l§ka',
  ];

  // 5. Enchants: Hypixel's own raw, pre-rendered enchant-list paragraph (baked into a Gear-Score
  // item's real per-account lore) must never survive resolveGearSummary — the app's own
  // synthesized list (built from summary.enchantments) is the only source that may ever reach the
  // tooltip.
  await check('Hypixel raw enchant-list paragraph is stripped from live-lore items', () => {
    const itemData = { weapons: [{ id: 'ASTRAEA', lore: ['§7Gear Score: §d985'] }], armor: [], equipment: [] };
    const resolved = hypixelImport.resolveGearSummary({ id: 'ASTRAEA', lore: REAL_ASTRAEA_LORE }, itemData);
    assert.ok(resolved, 'resolveGearSummary should resolve a real catalog id');
    const KNOWN_RAW_LINE = '§9Critical VI, §9Cubism V, §9Divine Gift III';
    assert.ok(
      !resolved.lore.includes(KNOWN_RAW_LINE),
      "raw Hypixel enchant text leaked through — enchants must be parsed via our own implementation, not imported raw text",
    );
    // Must not over-strip: the real ability text right after the (now-removed) enchant block has to survive.
    assert.ok(
      resolved.lore.some((l) => l.includes('Deals') && l.includes('Wither')),
      'ability text after the enchant block should survive stripping',
    );
  });

  // 5b. Safety net: an item with zero real enchants has its ability text sitting in that same
  // position — must be left alone, not mistaken for an enchant paragraph and stripped.
  await check('an item with zero enchants keeps its ability text (no over-stripping)', () => {
    const itemData = { weapons: [{ id: 'ASTRAEA', lore: ['§7Gear Score: §d500'] }], armor: [], equipment: [] };
    const noEnchantLore = [
      '§7Gear Score: §d500',
      '§7Damage: §c+100',
      '',
      '§7Deals extra damage to zombies and',
      '§7similar undead creatures nearby.',
      '',
      '§8This item can be reforged!',
    ];
    const resolved = hypixelImport.resolveGearSummary({ id: 'ASTRAEA', lore: noEnchantLore }, itemData);
    assert.ok(
      resolved.lore.includes('§7Deals extra damage to zombies and'),
      'ability text must be untouched when the item has no enchants to strip',
    );
  });

  // 6. Positive check: the SYNTHESIZED list (our own implementation) is what actually determines
  // display content, sourced from summary.enchantments via this app's own id->display-name table —
  // and each enchant appears exactly once in a final, assembled tooltip.
  await check('displayed enchant list is built from our own parsing, exactly once', () => {
    const modifiers = {
      ultimateEnchantment: { id: 'ultimate_wise', level: 5, maxLevel: 5 },
      hexEnchantments: [
        { id: 'syphon', level: 4, maxLevel: 4 }, // real display-name override -> "Drain"
        { id: 'critical', level: 6, maxLevel: 7 },
      ],
    };
    const lines = itemTooltip.buildAppliedEnchantLines(modifiers);
    assert.equal(lines[0], '§d§lUltimate Wise V', 'ultimate must render first, bold pink');
    assert.ok(lines.includes('§6Drain IV'), 'maxed hex enchant (syphon, our own display-name override) must render gold');
    assert.ok(lines.includes('§7Critical VI'), 'non-maxed hex enchant must render grey');

    const baseLore = ['§7Damage: §c+100', '', '§7Ability text.', ''];
    const finalLore = itemTooltip.insertEnchantLines(baseLore, lines);
    const criticalOccurrences = finalLore.filter((l) => l.includes('Critical VI')).length;
    assert.equal(criticalOccurrences, 1, 'each enchant must appear exactly once in the final tooltip');
  });
} finally {
  await server.close();
}

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.name}`);
  if (!r.ok) console.error(`    ${r.err.message}`);
}
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length > 0 ? 1 : 0);

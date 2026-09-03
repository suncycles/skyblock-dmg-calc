#!/usr/bin/env node
// Regression guard for behaviors that have already broken once (fixed 2026-09-02, see git log):
// item Stars must stay at a flat 2%/star out of a dungeon and jump to a separate 10%/star
// Catacombs Boost total inside one; Master Stars must stay an independent, additive-only term
// that only ever applies while Master Mode is on; an imported item's own dungeonized flag must
// trust only Hypixel's real per-item NBT flag; every stat number the tooltip displays must come
// from lib/itemStatTotals.js's single computed source, never re-derived by parsing rendered lore
// text; an imported item's displayed enchant list must always come from this app's own parsing of
// summary.enchantments; and Gear-Score tiered stats (Skeleton Master/Zombie Knight families) must
// replace the catalog pristine value and independently bump rarity. Plain assert-based check, no
// test framework — run with `npm run verify`.
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

// Minimal, self-contained itemData for the synthetic-item checks below — no real catalog lookup
// needed since these items are passed in directly, not resolved by id.
const EMPTY_ITEM_DATA = { weapons: [], armor: [], equipment: [], reforges: {}, reforgeStones: {}, enchants: {} };
const BARE_MODIFIERS = {
  stars: 0,
  masterStars: 0,
  dungeonized: false,
  reforge: null,
  recombobulated: false,
  books: 0,
  artOfWar: false,
  artOfPeace: false,
  gemstones: [],
  hexEnchantments: [],
  ultimateEnchantment: null,
  special: null,
  itemTier: null,
  baseStatBoostPercentage: 0,
};

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const starring = await server.ssrLoadModule('/src/lib/starring.js');
  const dungeonize = await server.ssrLoadModule('/src/lib/dungeonize.js');
  const finalDamage = await server.ssrLoadModule('/src/lib/finalDamage.js');
  const hypixelImport = await server.ssrLoadModule('/src/lib/hypixelImport.js');
  const itemTooltip = await server.ssrLoadModule('/src/lib/itemTooltip.js');
  const itemStatTotals = await server.ssrLoadModule('/src/lib/itemStatTotals.js');
  const tieredArmorStats = await server.ssrLoadModule('/src/lib/tieredArmorStats.js');

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
  // prefix (marks gear ELIGIBLE to be Dungeonized, not that this owned copy actually is) and never
  // from masterStars>0 either (disproved against sammui's real Necron's Leggings: 4 real Master
  // Stars alongside a real `dungeonized: false`). Both were unverified assumptions that inflated a
  // fresh/un-dungeonized item's stats with the 10%/star Catacombs Boost even with the Dungeon
  // toggle off.
  await check('per-item dungeonized flag trusts only the real NBT flag', () => {
    assert.equal(hypixelImport.resolveDungeonizedFlag({ id: 'POWER_WITHER_LEGGINGS', dungeonized: false }), false, 'a real, un-dungeonized copy must resolve to false');
    assert.equal(hypixelImport.resolveDungeonizedFlag({ id: 'POWER_WITHER_LEGGINGS', dungeonized: true }), true, 'a real dungeonized copy must resolve to true');
    // Gear-Score tiered-stat items (mob-drop-only, no non-dungeon variant) are always dungeonized
    // even when the real per-copy NBT has no `dungeon_item` key at all — see the 2026-09-03 fix
    // comment above resolveDungeonizedFlag.
    assert.equal(hypixelImport.resolveDungeonizedFlag({ id: 'SKELETON_MASTER_CHESTPLATE', dungeonized: false }), true, 'a tiered-stat item must resolve dungeonized even without the NBT flag');
  });

  // Real, live-captured Necron's Leggings lore (sammui, 2026-09-02) — used below to pin down that
  // an imported item's real per-account lore is now ignored entirely for stat purposes.
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
  ];

  // 5. Design decision 2026-09-02: an imported item is rebuilt entirely from the catalog's own
  // pristine lore plus this app's own formula pipeline — resolveGearSummary must always return the
  // catalog's lore, ignoring summary.lore (Hypixel's real per-account lore) completely. The
  // accepted consequence (user-confirmed) is that Gear-Score-scaled stats on an imported item show
  // the catalog's un-scaled baseline rather than the player's real in-game number — pinned here as
  // documented, expected behavior rather than something that could silently regress unnoticed.
  await check('resolveGearSummary always returns catalog lore, ignoring summary.lore', () => {
    const catalogLore = ['§7Gear Score: §d574', '§7Strength: §c+40'];
    const itemData = { weapons: [], armor: [{ id: 'POWER_WITHER_LEGGINGS', category: 'DUNGEON LEGGINGS', tier: 'LEGENDARY', lore: catalogLore }], equipment: [] };
    const resolved = hypixelImport.resolveGearSummary({ id: 'POWER_WITHER_LEGGINGS', lore: REAL_NECRONS_LEGGINGS_LORE }, itemData);
    assert.ok(resolved, 'should resolve a real catalog id');
    assert.deepEqual(resolved.lore, catalogLore, "must return the catalog's own lore unconditionally, never summary.lore");
    assert.ok(!('liveLore' in resolved), 'no liveLore flag — the live-lore swap mechanism is gone');
  });

  // 6. The core new architecture: hiddenBase -> the three shown tiers, computed directly (not
  // parsed from any rendered text). Hand-computed synthetic numbers so the formula itself is
  // pinned exactly: pristine=100, 0 reforge/gems/books, 5 Stars, Catacombs Level 0.
  await check('computeItemStatTotals: hidden base -> three shown tiers', async () => {
    const item = { id: 'TEST_SWORD', tier: 'LEGENDARY', category: 'SWORD', lore: ['§7Damage: §c+100'] };
    const modifiers = { ...BARE_MODIFIERS, stars: 5, dungeonized: true };
    const totals = await itemStatTotals.computeItemStatTotals(item, modifiers, EMPTY_ITEM_DATA, { catacombsLevel: 0 });
    const t = totals.damage;
    assert.equal(t.pristine, 100);
    assert.equal(t.hiddenBase, 100, 'no reforge/gems/books -> hiddenBase equals pristine');
    assert.equal(t.nonDungeonStarred, 110, '5 Stars x 2% x pristine(100) = +10 -> 110');
    // Catacombs Level 0 curve = 10%, +10%/star x 5 Stars = 50% -> 60% total boost on hiddenBase.
    assert.equal(t.dungeonStarred, 160, 'hiddenBase(100) x 1.60 = 160');
  });

  // 7. Text is a RENDER of computed numbers, never a source parsed back into numbers — the
  // tooltip's leading number for a stat must exactly equal computeItemStatTotals's own
  // nonDungeonStarred for that same stat.
  await check('tooltip leading number matches computeItemStatTotals exactly', async () => {
    const item = { id: 'TEST_SWORD', tier: 'LEGENDARY', category: 'SWORD', lore: ['§7Damage: §c+100', '§7Strength: §c+50'] };
    const modifiers = { ...BARE_MODIFIERS, stars: 5 };
    const totals = await itemStatTotals.computeItemStatTotals(item, modifiers, EMPTY_ITEM_DATA, { catacombsLevel: 0 });
    const lines = await itemTooltip.buildFullItemTooltipLines(item, modifiers, EMPTY_ITEM_DATA, 0, 0, 0, undefined, 0, undefined, false, false, 0);
    for (const [statKey, label] of [['damage', 'Damage'], ['strength', 'Strength']]) {
      const line = lines.find((l) => l.replace(/§./g, '').startsWith(`${label}:`));
      assert.ok(line, `tooltip must have a ${label} line`);
      const afterLabel = line.replace(/§./g, '').slice(label.length + 1);
      const leading = parseFloat(/^\s*([+-]?[\d.]+)/.exec(afterLabel)[1]);
      assert.equal(leading, totals[statKey].nonDungeonStarred, `${label} leading number must equal computeItemStatTotals's nonDungeonStarred`);
    }
  });

  // 8. Same consistency check for the Dungeonize dark-grey/dark-blue annotations — they must
  // exactly equal the already-computed dungeonStarred/masterStarred, never re-derived.
  await check('Dungeonize annotations match computed dungeonStarred/masterStarred', async () => {
    const item = { id: 'TEST_SWORD', tier: 'LEGENDARY', category: 'SWORD', lore: ['§7Damage: §c+100'] };
    const modifiers = { ...BARE_MODIFIERS, stars: 5, masterStars: 3, dungeonized: true };
    const totals = await itemStatTotals.computeItemStatTotals(item, modifiers, EMPTY_ITEM_DATA, { catacombsLevel: 0 });
    const lines = await itemTooltip.buildFullItemTooltipLines(item, modifiers, EMPTY_ITEM_DATA, 0, 0, 0, undefined, 0, undefined, false, false, 0);
    const line = lines.find((l) => l.replace(/§./g, '').startsWith('Damage:'));
    const noMaster = /§8\(([+-]?[\d.]+)\)/.exec(line);
    const withMaster = /§q\(([+-]?[\d.]+)\)/.exec(line);
    assert.ok(noMaster, 'dark-grey Catacombs Boost annotation must be present');
    assert.ok(withMaster, 'dark-blue Master Star annotation must be present (masterStars > 0)');
    assert.equal(parseFloat(noMaster[1]), totals.damage.dungeonStarred, 'dark-grey annotation must equal computed dungeonStarred');
    assert.equal(parseFloat(withMaster[1]), totals.damage.masterStarred, 'dark-blue annotation must equal computed masterStarred');
  });

  // 9. Positive check: the SYNTHESIZED enchant list (our own implementation) is what actually
  // determines display content, sourced from summary.enchantments via this app's own
  // id->display-name table — and each enchant appears exactly once in a final, assembled tooltip.
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

  // 10. Gear-Score tiered stats (Skeleton Master / Zombie Knight families only — user-confirmed
  // 2026-09-03): a real per-copy item_tier + baseStatBoostPercentage replaces the catalog's
  // pristine value entirely for the stats Hypixel's own tiered_stats table covers, AND
  // baseStatBoostPercentage at its max independently bumps rarity +1 tier (stacking with
  // Recombobulator). The exact formula (and this specific item's real tiered_stats numbers) were
  // separately verified this session against sammui's real, live-decoded Skeleton Master
  // Chestplate NBT (item_tier: 10, baseStatBoostPercentage: 50) — Health/Defense/Crit Chance
  // matched Hypixel's own displayed total exactly. This check pins the mechanism itself with
  // simple, self-contained numbers (no reforge/enchant data needed to hand-verify).
  await check('Gear-Score tiered stats replace catalog pristine + bump rarity', async () => {
    const catalogItem = {
      id: 'SKELETON_MASTER_CHESTPLATE',
      tier: 'EPIC',
      category: 'DUNGEON CHESTPLATE',
      lore: ['§7Gear Score: §d142', '§7Health: §c+26', '§7Defense: §a+42', '', '§6§lEPIC DUNGEON CHESTPLATE'],
    };
    const itemData = { weapons: [], armor: [catalogItem], equipment: [], reforges: {}, reforgeStones: {}, enchants: {} };
    const modifiers = { ...BARE_MODIFIERS, stars: 5, recombobulated: true, itemTier: 10, baseStatBoostPercentage: tieredArmorStats.MAX_BASE_STAT_BOOST_PERCENTAGE };
    const totals = await itemStatTotals.computeItemStatTotals(catalogItem, modifiers, itemData, { catacombsLevel: 0 });
    // Real tiered_stats[item_tier-1]: HEALTH=56, DEFENSE=88, x(1+50/100)=1.5 -> 84 / 132 hiddenBase
    // (no reforge/gems/books/enchants here), + 2%/star x 5 stars on that same tiered pristine.
    assert.equal(totals.health.nonDungeonStarred, 92.4, `expected 56*1.5=84 hiddenBase + 2%*5*84=8.4 star bonus = 92.4, got ${totals.health.nonDungeonStarred}`);
    assert.equal(totals.defense.nonDungeonStarred, 145.2, `expected 88*1.5=132 hiddenBase + 2%*5*132=13.2 star bonus = 145.2, got ${totals.defense.nonDungeonStarred}`);

    const lines = await itemTooltip.buildFullItemTooltipLines(catalogItem, modifiers, itemData, 0, 0, 0, undefined, 0, undefined, false, false, 0);
    // applyRecombToLore appends a trailing "§8Rarity Upgraded" line after the actual tag line.
    const tagLine = lines[lines.length - 2];
    assert.ok(tagLine.includes('MYTHIC'), `boost bump (Epic->Legendary) + recomb bump (Legendary->Mythic) must stack to Mythic, got: ${tagLine}`);

    // A manually-built copy (no real itemTier) must fall back to the catalog's own pristine value,
    // completely unaffected by this mechanic — regression guard against an always-on tiered lookup.
    const manualTotals = await itemStatTotals.computeItemStatTotals(catalogItem, { ...modifiers, itemTier: null, baseStatBoostPercentage: 0 }, itemData, { catacombsLevel: 0 });
    assert.notEqual(manualTotals.health.nonDungeonStarred, 92.4, 'a manually-built item must NOT get the real per-copy tiered total');
  });

  // 11. Bug fix 2026-09-03: the tiered pristine must be CEIL'd, not left as a raw float — Hypixel's
  // own displayed base stat is always a whole number even when tiered_stats[i] x pieceBoost isn't
  // (e.g. 45 x 1.5 = 67.5). Missing this produced a small-but-real ~0.5 drift on every downstream
  // total (Crit Damage 119.3 vs the real 119.8) that looked like a rounding-order mystery until the
  // user pinned the exact formula.
  await check('Gear-Score tiered pristine is ceil()d, not a raw float', () => {
    assert.equal(tieredArmorStats.computeTieredPristineStat('SKELETON_MASTER_CHESTPLATE', 'crit_damage', 10, 50), 68, 'ceil(45 x 1.5 = 67.5) must be 68');
  });

  // 12. End-to-end pin against sammui's real, live-verified Skeleton Master Chestplate (2026-09-03):
  // Ancient reforge (+1 Crit Damage/Catacombs level, real Catacombs level 45), 5 base Stars + 5
  // Master Stars, General's Medallion 4 digits — the user-supplied formula
  // "[ceil(BASE x pieceBoost) + reforgebonus] x totalboost" reproduces Hypixel's own real displayed
  // Crit Damage EXACTLY: 119.8% out of a dungeon (5-star display), 665.57% inside a non-master
  // dungeon (this app rounds to 1 decimal vs Hypixel's 2, hence 665.6).
  await check('Gear-Score tiered item reproduces real Crit Damage exactly (119.8 / 665.6)', async () => {
    const catalogItem = {
      id: 'SKELETON_MASTER_CHESTPLATE',
      tier: 'EPIC',
      category: 'DUNGEON CHESTPLATE',
      lore: ['§7Gear Score: §d142', '§7Crit Damage: §9+22', '', '§6§lEPIC DUNGEON CHESTPLATE'],
    };
    const itemData = {
      weapons: [], armor: [catalogItem], equipment: [],
      reforges: { Ancient: { reforgeStats: { MYTHIC: {} } } },
      reforgeStones: {}, enchants: {},
    };
    const modifiers = {
      ...BARE_MODIFIERS,
      stars: 5,
      masterStars: 5,
      dungeonized: true, // resolveDungeonizedFlag's real job (checked separately above); computeItemStatTotals just trusts it
      reforge: 'Ancient',
      recombobulated: true,
      itemTier: 10,
      baseStatBoostPercentage: 50,
    };
    const totals = await itemStatTotals.computeItemStatTotals(catalogItem, modifiers, itemData, { catacombsLevel: 45, generalsMedallionDigits: 4 });
    assert.equal(totals.crit_damage.nonDungeonStarred, 119.8, `expected the real 119.8, got ${totals.crit_damage.nonDungeonStarred}`);
    assert.equal(totals.crit_damage.dungeonStarred, 665.6, `expected the real 665.57 (rounded to 665.6), got ${totals.crit_damage.dungeonStarred}`);

    // Bug fix 2026-09-03 (round 2): the catalog's own bundled lore for this item already has a
    // real "Crit Damage: +22" line (Hypixel's tier-1 tiered_stats baseline) — itemTooltip.js's
    // leading-number merge used to subtract computeItemStatTotals' own (tiered-overridden)
    // pristine from the final total and add that delta onto whatever's in the TEXT, silently
    // assuming the two matched. They don't for a tiered item, which under-counted the rendered
    // total by (68 - 22) = 46 (real bug: Skeleton Master Chestplate rendered "73.8%" instead of
    // "119.8%" in the live app, even though computeItemStatTotals itself was already correct).
    const tooltipLines = await itemTooltip.buildFullItemTooltipLines(catalogItem, modifiers, itemData, 45, 0, 0, undefined, 4, undefined, false, false, 0);
    const critDamageLine = tooltipLines.find((l) => l.replace(/§./g, '').startsWith('Crit Damage:'));
    assert.ok(critDamageLine, 'rendered tooltip must have a Crit Damage line');
    const afterLabel = critDamageLine.replace(/§./g, '').slice('Crit Damage:'.length);
    const leading = parseFloat(/^\s*([+-]?[\d.]+)/.exec(afterLabel)[1]);
    assert.equal(leading, 119.8, `rendered Crit Damage leading number must be the real 119.8, got ${leading} (line: ${critDamageLine})`);
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

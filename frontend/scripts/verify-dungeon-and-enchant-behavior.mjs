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
  const dungeonHeads = await server.ssrLoadModule('/src/lib/dungeonHeads.js');
  const dungeonBlessing = await server.ssrLoadModule('/src/lib/dungeonBlessing.js');
  const essencePerks = await server.ssrLoadModule('/src/lib/essencePerks.js');
  const masterSkull = await server.ssrLoadModule('/src/lib/masterSkull.js');
  const recombobulator = await server.ssrLoadModule('/src/lib/recombobulator.js');
  const petData = await server.ssrLoadModule('/src/lib/petData.js');
  const armorSetBonuses = await server.ssrLoadModule('/src/lib/armorSetBonuses.js');
  const godPotion = await server.ssrLoadModule('/src/lib/godPotion.js');
  const armorSlots = await server.ssrLoadModule('/src/lib/armorSlots.js');
  const optimizer = await server.ssrLoadModule('/src/lib/optimizer.js');
  const pricing = await server.ssrLoadModule('/src/lib/pricing.js');

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
  // Chimera and Manticore Claw both copy the equipped pet's stat spread, and both read the SAME
  // PET_STAT_KEY_MAP — a stat missing from that map is silently dropped by both at once, with no
  // error anywhere. Ability Damage was missing exactly that way (fixed 2026-09-05) even though the
  // pet catalog carries it and the rest of the pipeline already tracked it end to end. This area
  // has also drifted before via a duplicated definition (see the [[project_chimera_base_stats]]
  // note), so it gets a guard rather than trusting the map to stay complete.
  await check('Chimera/Manticore Claw copy Ability Damage and Intelligence', () => {
    // Crow's real level-100 numbers from the live catalog.
    const petStats = { ABILITY_DAMAGE: 20, INTELLIGENCE: 150, STRENGTH: 40 };

    const chimeraMax = petData.computeChimeraStatBonus(petStats, 5); // V = 100%
    assert.equal(chimeraMax.ability_damage, 20, "Chimera V must copy the pet's full Ability Damage");
    assert.equal(chimeraMax.intelligence, 150, "Chimera V must copy the pet's full Intelligence");

    const chimeraOne = petData.computeChimeraStatBonus(petStats, 1); // I = 20%
    assert.equal(chimeraOne.ability_damage, 4, 'Chimera I must copy 20% of Ability Damage');
    assert.equal(chimeraOne.intelligence, 30, 'Chimera I must copy 20% of Intelligence');

    // Manticore Claw is a flat 10% of the same spread.
    const claw = petData.computeManticoreClawBonus({ item: { id: 'MANTICORE_CLAW' }, modifiers: {} }, petStats);
    assert.equal(claw.ability_damage, 2, 'Manticore Claw must copy 10% of Ability Damage');
    assert.equal(claw.intelligence, 15, 'Manticore Claw must copy 10% of Intelligence');

    // A pet without the stat must not gain a phantom entry.
    const noAbility = petData.computeChimeraStatBonus({ STRENGTH: 100 }, 5);
    assert.equal(noAbility.ability_damage, undefined, 'a pet with no Ability Damage must not gain one');
    assert.equal(noAbility.strength, 100, 'unrelated stats must still be copied');
  });
  // Skeleton Master stacks PER PIECE and adds a separate full-set bonus on top, so the full set
  // is 1.05^4 * 1.25 = 1.5194x — not 1.25x, and not 1.05*1.25. It's also bow-only. Both are easy
  // to get subtly wrong (a single flat multiplier, or forgetting the weapon gate), and neither
  // fails loudly.
  await check('Skeleton Master is 1.05x per piece plus 1.25x at 4, bow-only', () => {
    const { SKELETON_MASTER_SET, SKELETON_MASTER_PER_PIECE_MULTIPLIER, SKELETON_MASTER_FULL_SET_MULTIPLIER,
            SKELETON_MASTER_FULL_SET_PIECES, countSetPieces } = armorSetBonuses;
    const { ARMOR_SLOTS } = armorSlots;

    const wear = (n) => Object.fromEntries(ARMOR_SLOTS.slice(0, n).map((slot, i) => [slot, { item: { id: SKELETON_MASTER_SET[i] } }]));

    assert.equal(countSetPieces(wear(4), ARMOR_SLOTS, SKELETON_MASTER_SET), 4, 'a full set must count 4 pieces');
    assert.equal(countSetPieces(wear(3), ARMOR_SLOTS, SKELETON_MASTER_SET), 3, 'a partial set must count its real pieces');

    assert.equal(SKELETON_MASTER_PER_PIECE_MULTIPLIER, 1.05, 'per-piece multiplier');
    assert.equal(SKELETON_MASTER_FULL_SET_MULTIPLIER, 1.25, 'full-set multiplier');
    const fullSet = SKELETON_MASTER_PER_PIECE_MULTIPLIER ** SKELETON_MASTER_FULL_SET_PIECES * SKELETON_MASTER_FULL_SET_MULTIPLIER;
    assert.ok(Math.abs(fullSet - 1.5193828125) < 1e-9, `full set must be 1.5194x, got ${fullSet}`);

    // The bow gate: same armour, different weapon category.
    const bow = { weapon: { item: { category: 'BOW' } } };
    const dungeonBow = { weapon: { item: { category: 'DUNGEON BOW' } } };
    const sword = { weapon: { item: { category: 'DUNGEON SWORD' } } };
    assert.equal(godPotion.isBowEquipped(bow), true, 'BOW counts as a bow');
    assert.equal(godPotion.isBowEquipped(dungeonBow), true, 'DUNGEON BOW counts as a bow');
    assert.equal(godPotion.isBowEquipped(sword), false, 'a sword must not trigger the bow-only bonus');
  });
  // A gemstone slot with no `costs` in Hypixel's catalog ships already unlocked. Reading that
  // absence as "price unknown" instead made every candidate for such a slot unpriced — and
  // unpriced results are exempt from dropDominated, so two identical COMBAT slots on the same
  // weapon disagreed about the same gem (Perfect Onyx surfaced for socket 1 while socket 2
  // correctly dropped it as dominated). Nothing about that failed loudly.
  await check('a gemstone slot with no unlock costs counts as already open', () => {
    const { gemstoneSlotShipsOpen } = optimizer;
    assert.equal(gemstoneSlotShipsOpen({ slot_type: 'COMBAT' }), true, 'no costs block = ships open');
    assert.equal(
      gemstoneSlotShipsOpen({ slot_type: 'COMBAT', costs: [{ type: 'COINS', coins: 100000 }] }),
      false,
      'a real costs block means it must be unlocked first',
    );
    // A missing catalog entry is genuinely unknown, NOT confirmed-free — it has to keep the
    // unpriced treatment rather than being silently priced as gem-cost-only.
    assert.equal(gemstoneSlotShipsOpen(undefined), false, 'no catalog data is unknown, not free');
    assert.equal(gemstoneSlotShipsOpen(null), false, 'null catalog data is unknown, not free');
  });

  // 17. Two DIFFERENT gems in the same socket are different upgrade paths, not redundant options.
  // Grouping them together let a cheaper Flawless Jasper delete every Perfect Onyx row from the
  // list at low Strength, so a Crit-Damage build was never offered the Onyx it was working toward
  // (user-reported 2026-09-06, again 2026-09-07). Same gem + same socket must still share a group
  // so a real bazaar price inversion is still filtered.
  await check('gemstone dominance is scoped per gem, not per socket', () => {
    const { dominanceGroupKey } = optimizer;
    const row = (index, gem, tier) => ({
      category: 'Gemstone',
      apply: [{ type: 'setGemstone', slot: 'chestplate', index, gem, tier }],
    });
    assert.notEqual(
      dominanceGroupKey(row(1, 'ONYX', 'perfect')),
      dominanceGroupKey(row(1, 'JASPER', 'flawless')),
      'Jasper must not dominate Onyx in the same socket',
    );
    assert.equal(
      dominanceGroupKey(row(1, 'ONYX', 'perfect')),
      dominanceGroupKey(row(1, 'ONYX', 'fine')),
      'two tiers of the same gem in the same socket are still one group',
    );
    assert.notEqual(
      dominanceGroupKey(row(0, 'ONYX', 'perfect')),
      dominanceGroupKey(row(1, 'ONYX', 'perfect')),
      'separate sockets stay separate groups',
    );
  });

  // 18. A Kuudra armor tier-up is CRAFTED from the piece already worn, so the Optimizer must price
  // it from its real recipe (Essence + Kuudra Teeth + coin fee, precomputed per hop by the Worker)
  // — never from either tier's auction price (user-specified 2026-09-08). Synthetic cost bundle so
  // the arithmetic is checked, not the live bazaar.
  await check('a Kuudra tier-up is priced from its prestige recipe, not the auction price', () => {
    const { lookupCandidateCost, prestigeUpgradeCost } = pricing;
    const itemData = {
      costs: {
        itemPrices: { BURNING_CRIMSON_CHESTPLATE: 32_000_000, FIERY_CRIMSON_CHESTPLATE: 85_000_000 },
        prestigeCosts: {
          BURNING_CRIMSON_CHESTPLATE: { to: 'FIERY_CRIMSON_CHESTPLATE', coins: 15_200_654 },
          FIERY_CRIMSON_CHESTPLATE: { to: 'INFERNAL_CRIMSON_CHESTPLATE', coins: 37_996_737 },
        },
      },
    };
    const row = (replaces, toId) => ({
      category: 'Armor',
      replaces,
      apply: [{ type: 'selectItem', slot: 'chestplate', item: { id: toId } }],
    });
    assert.equal(
      lookupCandidateCost(row({ itemId: 'BURNING_CRIMSON_CHESTPLATE' }, 'FIERY_CRIMSON_CHESTPLATE'), itemData),
      15_200_654,
      "one hop costs that hop's recipe, not Fiery's 85M auction price",
    );
    // A jump past a tier really does pay for every hop along the way.
    assert.equal(
      lookupCandidateCost(row({ itemId: 'BURNING_CRIMSON_CHESTPLATE' }, 'INFERNAL_CRIMSON_CHESTPLATE'), itemData),
      15_200_654 + 37_996_737,
      'a multi-tier jump sums every hop',
    );
    // Every other gear swap is bought outright — no `replaces`, so the market price still stands.
    assert.equal(
      lookupCandidateCost(row(null, 'FIERY_CRIMSON_CHESTPLATE'), itemData),
      85_000_000,
      'a non-craft swap keeps its market price',
    );
    // A chain that never reaches the target (different family, non-Kuudra item) must not invent a
    // number — it falls back to the market price rather than summing the whole ladder.
    assert.equal(prestigeUpgradeCost('BURNING_CRIMSON_CHESTPLATE', 'FIERY_HOLLOW_CHESTPLATE', itemData.costs.prestigeCosts), null);
    assert.equal(prestigeUpgradeCost('NECRON_CHESTPLATE', 'FIERY_CRIMSON_CHESTPLATE', itemData.costs.prestigeCosts), null);
  });

  // 19. Inferno Demonlord's Hellion Shield doesn't block Venomous, it cuts it to 1% — it sat in the
  // outright-immune set until 2026-09-08, so both halves are pinned here: the survivor multiplier
  // AND the fact that Atoned Horror is still genuinely immune.
  await check("Venomous is cut to 1% by Hellion Shield, not zeroed", () => {
    const { computeVenomousProcDamage } = finalDamage;
    const sources = {
      venomousProc: { id: 'Weapon-venomous', label: 'Venomous VII', level: 7, percent: 60 },
      additiveNonConditional: [],
      additiveConditional: [],
      abilityMultiplicative: [],
    };
    const at = (name, types) => computeVenomousProcDamage(sources, { name, types }, 1_000_000);
    const normal = at('Blaze', ['Infernal']);
    const demonlord = at('Inferno Demonlord', ['Infernal', 'Boss']);
    assert.equal(normal.finalDamage, 600000, 'an ordinary mob takes the full 60% proc');
    assert.equal(demonlord.finalDamage, 6000, 'Inferno Demonlord takes exactly 1% of that');
    assert.equal(demonlord.reductionLabel, 'Hellion Shield', 'the reduction names its real mechanic');
    assert.equal(normal.reductionLabel, null, 'an unreduced mob carries no label');
    // Fully immune, as distinct from Inferno Demonlord's reduced-but-present case above — the two
    // treatments live in separate tables and must not drift into each other.
    for (const immune of ['Atoned Horror', 'Quazii', 'Typhoeus']) {
      const r = at(immune, ['Boss']);
      assert.equal(r.finalDamage, 0, `${immune} stays fully immune`);
      assert.equal(r.reductionLabel, undefined, `${immune} is immune, not labelled as reduced`);
    }
  });

  // 20. A Catacombs boss head's real base stat is its printed lore value DOUBLED, and every later
  // boost compounds on the doubled figure (user-specified 2026-09-09). Checked through the real
  // computeItemStatTotals pipeline rather than the helper alone, since the whole point is where in
  // that pipeline the doubling lands — and a non-head helmet must be left completely alone.
  await check('Catacombs boss heads double their printed base stats', async () => {
    const { diamondCounterpartFor, parseDungeonHead } = dungeonHeads;
    const head = { id: 'GOLD_BONZO_HEAD', name: 'Gold Bonzo Head', tier: 'SPECIAL', lore: ['§7Health: §c+20', '§7Strength: §c+5'] };
    const plain = { id: 'SHADOW_ASSASSIN_HELMET', name: 'Shadow Assassin Helmet', tier: 'EPIC', lore: ['§7Health: §c+160', '§7Strength: §c+25'] };
    const headTotals = await itemStatTotals.computeItemStatTotals(head, { ...BARE_MODIFIERS }, EMPTY_ITEM_DATA, {});
    assert.equal(headTotals.health.pristine, 40, '+20 Health prints, +40 applies');
    assert.equal(headTotals.strength.pristine, 10, '+5 Strength prints, +10 applies');
    const plainTotals = await itemStatTotals.computeItemStatTotals(plain, { ...BARE_MODIFIERS }, EMPTY_ITEM_DATA, {});
    assert.equal(plainTotals.health.pristine, 160, 'a non-head helmet is untouched');

    // The head family's other rule: a head only ever upgrades to its OWN boss's Diamond rank.
    assert.equal(diamondCounterpartFor('GOLD_BONZO_HEAD'), 'DIAMOND_BONZO_HEAD');
    assert.equal(diamondCounterpartFor('GOLD_NECRON_HEAD'), 'DIAMOND_NECRON_HEAD');
    assert.equal(diamondCounterpartFor('DIAMOND_BONZO_HEAD'), null, 'Diamond is the top rank');
    assert.equal(parseDungeonHead('SHADOW_ASSASSIN_HELMET'), null, 'ordinary helmets are not heads');
  });

  // 21. Dungeon Blessing effectiveness: four independent sources, multiplicative with each other,
  // landing on exactly 1.815 when all four are maxed (user-confirmed 2026-09-10 — that figure is
  // the whole spec, so it's pinned here). The Mimic Shard's level comes off the Epic 32-cap shard
  // ladder, and the multiplier scales a blessing's own numbers BEFORE they reach the base stats.
  await check('Dungeon Blessing multiplier and Mimic ladder', () => {
    const { computeBlessingMultiplier, epicShardLevelFromCount, computeBlessingEffects } = dungeonBlessing;
    assert.equal(Number(computeBlessingMultiplier({}).toFixed(4)), 1.2, 'the automatic +20% is always on');
    assert.equal(
      Number(computeBlessingMultiplier({ mimicShardLevel: 10, forbiddenBlessingLevel: 10, paulBuff: true }).toFixed(4)),
      1.815,
      '1.10 * 1.10 * 1.20 * 1.25',
    );
    // Epic ladder: cumulative [1,2,4,6,9,12,16,20,25,32], 32 shards to reach level 10.
    assert.equal(epicShardLevelFromCount(0), 0);
    assert.equal(epicShardLevelFromCount(4), 3);
    assert.equal(epicShardLevelFromCount(31), 9, '31 is one short of the cap');
    assert.equal(epicShardLevelFromCount(32), 10);
    assert.equal(epicShardLevelFromCount(9999), 10, 'level is capped, not unbounded');

    const effects = computeBlessingEffects({ power: 30 }, 1.815);
    assert.equal(effects.length, 1, 'only levelled blessings produce an effect');
    // 30 x 4 x 1.815 flat, then 30 x 2% x 1.815 — the boost scales the blessing, not the stat.
    assert.equal(Number(effects[0].flat.strength.toFixed(1)), 217.8);
    assert.equal(Number(effects[0].percent.crit_damage.toFixed(1)), 108.9);
    assert.deepEqual(computeBlessingEffects({ power: 0, time: 0, stone: 0, wisdom: 0 }, 1.815), [], 'level 0 is inert');
    // Stone is the flat-only one.
    const stone = computeBlessingEffects({ stone: 10 }, 1)[0];
    assert.equal(stone.flat.damage, 60);
    assert.deepEqual(stone.percent, {}, 'Stone has no percentage clause');
  });

  // 22. Essence-shop perk effects, all user-supplied (2026-09-10) and none of them in any public
  // data source — so every per-level figure is pinned here at both ends of its range. The three
  // Catacombs (Undead) ones exist only inside a dungeon; the rest are permanent.
  await check('essence-shop perks grant their real per-level stats', () => {
    const { computeFlatPerkStats, computeBanePercent, computeInfusedDragonCritDamage, computeTwoHeadedStrikeAttackSpeed } = essencePerks;
    const at = (level, dungeon) => {
      const perks = Object.fromEntries(essencePerks.TRACKED_PERK_KEYS.map((k) => [k, level]));
      return Object.fromEntries(computeFlatPerkStats(perks, dungeon).map((e) => [`${e.label}|${e.stat}`, e.value]));
    };
    const max = at(99, true);
    assert.equal(max['Forbidden Strength 5|strength'], 5, '1-5 Strength');
    assert.equal(max['Forbidden Intelligence 5|intelligence'], 10, '2-10 Intelligence');
    assert.equal(max['Blessing of Time 3|strength'], 6, '2/4/6 Strength');
    assert.equal(max['Blessing of Time 3|intelligence'], 6, '2/4/6 Intelligence');
    assert.equal(max['Strength Essence 5|strength'], 50, '10-50 Strength');
    assert.equal(max['Intelligence Essence 5|intelligence'], 75, '15-75 Intelligence');
    assert.equal(max['Critical Essence 5|crit_damage'], 50, '10-50 Crit Damage');
    const min = at(1, true);
    assert.equal(min['Forbidden Strength 1|strength'], 1);
    assert.equal(min['Forbidden Intelligence 1|intelligence'], 2);
    assert.equal(min['Strength Essence 1|strength'], 10);
    assert.equal(min['Intelligence Essence 1|intelligence'], 15);
    assert.equal(min['Critical Essence 1|crit_damage'], 10);

    // The Catacombs line is dungeon-only; the permanent ones are not.
    const outside = at(99, false);
    assert.equal(outside['Strength Essence 5|strength'], undefined, 'Strength Essence is dungeon-only');
    assert.equal(outside['Intelligence Essence 5|intelligence'], undefined, 'Intelligence Essence is dungeon-only');
    assert.equal(outside['Critical Essence 5|crit_damage'], undefined, 'Critical Essence is dungeon-only');
    assert.equal(outside['Forbidden Strength 5|strength'], 5, 'Forbidden Strength applies everywhere');

    const maxed = Object.fromEntries(essencePerks.TRACKED_PERK_KEYS.map((k) => [k, 99]));
    assert.equal(computeBanePercent(maxed), 15, '3-15% vs Arachnids');
    assert.equal(computeBanePercent({ bane: 1 }), 3);
    assert.equal(computeInfusedDragonCritDamage(maxed, 'ENDER_DRAGON'), 10, '2-10 Crit Damage');
    assert.equal(computeInfusedDragonCritDamage(maxed, 'GOLDEN_DRAGON'), 0, 'Ender Dragon only');
    assert.equal(computeTwoHeadedStrikeAttackSpeed(maxed, 'Renowned'), 10, '2-10 Attack Speed');
    assert.equal(computeTwoHeadedStrikeAttackSpeed(maxed, 'Spiked'), 10);
    assert.equal(computeTwoHeadedStrikeAttackSpeed(maxed, 'Ancient'), 0, 'Renowned/Spiked only');
    // A manually-built loadout has no perk map at all — that must be inert, not a crash.
    assert.deepEqual(computeFlatPerkStats(null, true), []);
    assert.equal(computeBanePercent(null), 0);
    assert.equal(computeTwoHeadedStrikeAttackSpeed(null, 'Renowned'), 0);
  });

  // 23. Master Skull's Strength multiplier is MULTIPLICATIVE with the Dungeon Blessings, not summed
  // into them (user-specified 2026-09-10) — the distinction is the whole point, so both the ladder
  // and the compounding are pinned. The ladder changes slope at tier 4, which is exactly the kind
  // of thing a "clever" formula would quietly get wrong.
  await check('Master Skull tiers compound with blessings', () => {
    const { masterSkullStrengthMultiplier, masterSkullStrengthPercent, masterSkullTierFromItemId } = masterSkull;
    assert.deepEqual(
      [0, 1, 2, 3, 4, 5, 6, 7].map(masterSkullStrengthMultiplier),
      [1, 1.01, 1.02, 1.03, 1.04, 1.06, 1.08, 1.1],
      'tiers 1-4 step by 1 point, 5-7 by 2',
    );
    assert.equal(masterSkullStrengthMultiplier(0), 1, 'not owned is inert');
    assert.equal(masterSkullStrengthMultiplier(99), 1.1, 'capped at tier 7');
    assert.equal(Number(masterSkullStrengthPercent(7).toFixed(4)), 10, '1.10x is +10%');
    assert.equal(masterSkullTierFromItemId('MASTER_SKULL_TIER_7'), 7);
    assert.equal(masterSkullTierFromItemId('HEGEMONY_ARTIFACT'), 0, 'other accessories are not skulls');

    // Power 5 at effectiveness 1.5 is x1.15; Master Skull 7 is x1.10. Together they must compound
    // to x1.265 on top of the flat grant, NOT sum to x1.25.
    const blessingMult = dungeonBlessing.computeBlessingMultiplier({ paulBuff: true });
    const powerPercent = dungeonBlessing.computeBlessingEffects({ power: 5 }, blessingMult)[0].percent.strength;
    assert.equal(Number(powerPercent.toFixed(4)), 15, 'Power 5 at 1.5x effectiveness is +15%');
    const compounded = (1 + powerPercent / 100) * masterSkullStrengthMultiplier(7);
    assert.equal(Number(compounded.toFixed(4)), 1.265);
    assert.notEqual(Number(compounded.toFixed(4)), 1.25, 'summing the percentages would be wrong');
  });

  // 24. A Catacombs boss head's own rarity is SPECIAL, which appears in no reforge's
  // requiredRarities and in no rarity ladder — so heads matched zero reforges and couldn't be
  // recombobulated (user-reported 2026-09-10). They read a stand-in rarity for both. Pins the
  // BEHAVIOUR rather than the stand-in's value, which is a separate, still-open question.
  await check('boss heads reforge and recombobulate like helmets', () => {
    const { reforgeRarityFor, DUNGEON_HEAD_REFORGE_RARITY } = dungeonHeads;
    assert.equal(reforgeRarityFor('GOLD_BONZO_HEAD', 'SPECIAL'), DUNGEON_HEAD_REFORGE_RARITY);
    assert.equal(reforgeRarityFor('DIAMOND_NECRON_HEAD', 'SPECIAL'), DUNGEON_HEAD_REFORGE_RARITY);
    // Every other item keeps its own tier — the stand-in must not leak.
    assert.equal(reforgeRarityFor('POWER_WITHER_HELMET', 'LEGENDARY'), 'LEGENDARY');
    assert.equal(reforgeRarityFor('HYPERION', 'MYTHIC'), 'MYTHIC');
    assert.equal(reforgeRarityFor(null, 'EPIC'), 'EPIC');

    // The stand-in has to be a rarity the reforge tables actually carry, or a head matches nothing
    // again — which was the whole bug.
    assert.ok(
      ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'].includes(DUNGEON_HEAD_REFORGE_RARITY),
      'stand-in must be a real reforge-table column',
    );
    const head = { id: 'DIAMOND_BONZO_HEAD', tier: 'SPECIAL' };
    assert.equal(recombobulator.getDisplayTier(head, {}), DUNGEON_HEAD_REFORGE_RARITY);
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

#!/usr/bin/env node
// Regression guard for behaviours that have broken before: item Stars stay at a flat 2%/star
// outside a dungeon and become a separate 10%/star Catacombs Boost inside one; Master Stars stay an
// additive-only term applying only in Master Mode; an imported item's dungeonized flag follows
// lib/hypixelImport.js's resolveDungeonizedFlag; every displayed stat comes from
// lib/itemStatTotals.js rather than re-parsed lore text; an imported item's enchant list comes from
// this app's own parsing of summary.enchantments; and Gear-Score tiered stats replace the catalog
// pristine value and bump rarity. Plain assert-based checks, no framework — run `npm run verify`.
//
// Uses Vite's module graph (ssrLoadModule) rather than plain node, since lib/*.js use extensionless
// relative imports only Vite's resolver understands — so the checks run against the shipped code.

import { readFile } from 'node:fs/promises';
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
  const miningIslands = await server.ssrLoadModule('/src/lib/miningIslands.js');
  const optimizerModule = await server.ssrLoadModule('/src/lib/optimizer.js');
  const applyResult = await server.ssrLoadModule('/src/lib/applyResult.js');
  const essencePerks = await server.ssrLoadModule('/src/lib/essencePerks.js');
  const masterSkull = await server.ssrLoadModule('/src/lib/masterSkull.js');
  const recombobulator = await server.ssrLoadModule('/src/lib/recombobulator.js');
  const petData = await server.ssrLoadModule('/src/lib/petData.js');
  const playerStatsModule = await server.ssrLoadModule('/src/lib/playerStats.js');
  const playerDefense = await server.ssrLoadModule('/src/lib/playerDefense.js');
  const armorSetBonuses = await server.ssrLoadModule('/src/lib/armorSetBonuses.js');
  const godPotion = await server.ssrLoadModule('/src/lib/godPotion.js');
  const dungeonClass = await server.ssrLoadModule('/src/lib/dungeonClass.js');
  const mobDebuffs = await server.ssrLoadModule('/src/lib/mobDebuffs.js');
  const buffsModule = await server.ssrLoadModule('/src/lib/buffs.js');
  const mobDefenses = await server.ssrLoadModule('/src/lib/mobDefenses.js');
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

  // 3b. Master Stars apply only while Master Mode is on: with the Dungeon toggle on and Master Stars
  // present, useMasterMode=false must still return the withoutMaster total.
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

  // 4. How an item's `modifiers.dungeonized` flag is decided, in order: Hypixel's NBT flag, still
  // real on weapons; an explicit list of pieces that come pre-dungeonized; a STARRED_ id; and stars
  // on a DUNGEON-category piece. The category alone is not evidence.
  await check('per-item dungeonized flag uses every real signal', () => {
    assert.equal(hypixelImport.resolveDungeonizedFlag({ id: 'POWER_WITHER_LEGGINGS', dungeonized: true }), true, 'a real dungeonized copy must resolve to true');
    // Necron's, Maxor's, Storm's and Goldor's, Shadow Assassin, Spirit and Bonzo Mask, Bone Necklace,
    // Shadow Assassin Cloak, Adaptive Belt and Soulweaver Gloves come pre-dungeonized, so they need
    // no per-copy evidence at all, not even stars.
    assert.equal(hypixelImport.resolveDungeonizedFlag({ id: 'POWER_WITHER_LEGGINGS', stars: 0 }), true, "Necron's is pre-dungeonized");
    assert.equal(hypixelImport.resolveDungeonizedFlag({ id: 'SPEED_WITHER_BOOTS', stars: 0 }), true, "Maxor's is pre-dungeonized");
    assert.equal(hypixelImport.resolveDungeonizedFlag({ id: 'BONZO_MASK', stars: 0 }), true, 'Bonzo Mask is pre-dungeonized');
    assert.equal(hypixelImport.resolveDungeonizedFlag({ id: 'SOULWEAVER_GLOVES', stars: 0 }), true, 'Soulweaver Gloves are pre-dungeonized');
    // A DUNGEON-category piece NOT on that list still needs real evidence — the category marks
    // gear as eligible, and a crafted-but-unconverted copy is a real thing.
    assert.equal(hypixelImport.resolveDungeonizedFlag({ id: 'BOUNCY_BOOTS', stars: 0 }, { category: 'DUNGEON BOOTS' }), false, 'category alone is not proof');
    assert.equal(hypixelImport.resolveDungeonizedFlag({ id: 'BOUNCY_BOOTS', stars: 5 }, { category: 'DUNGEON BOOTS' }), true, 'stars on dungeon gear are');
    // Gear-Score tiered-stat items are mob-drop-only with no non-dungeon variant, so they are always
    // dungeonized even when the per-copy NBT carries no `dungeon_item` key.
    assert.equal(hypixelImport.resolveDungeonizedFlag({ id: 'SKELETON_MASTER_CHESTPLATE', dungeonized: false }), true, 'a tiered-stat item must resolve dungeonized even without the NBT flag');

    // A STARRED_ id is a Master Mode drop — dungeon gear by definition, no stars needed.
    assert.equal(hypixelImport.resolveDungeonizedFlag({ id: 'STARRED_BONE_NECKLACE', stars: 0 }), true, 'a STARRED_ id is dungeon gear');
    // Kuudra armour also uses upgrade_level for its stars but is not dungeon gear — the category
    // gate is what keeps it out.
    assert.equal(hypixelImport.resolveDungeonizedFlag({ id: 'INFERNAL_CRIMSON_CHESTPLATE', stars: 10 }, { category: 'CHESTPLATE' }), false, 'Kuudra stars are not dungeon stars');
  });

  // Live-captured Necron's Leggings lore, used below to pin that an imported item's per-account lore
  // is ignored for stat purposes.
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

  // 5. An imported item is rebuilt from the catalog's pristine lore plus this app's own pipeline, so
  // resolveGearSummary always returns the catalog's lore and ignores summary.lore. The accepted
  // consequence is that Gear-Score-scaled stats on an imported item show the catalog baseline rather
  // than the player's in-game number, pinned here as expected behaviour.
  await check('resolveGearSummary always returns catalog lore, ignoring summary.lore', () => {
    const catalogLore = ['§7Gear Score: §d574', '§7Strength: §c+40'];
    const itemData = { weapons: [], armor: [{ id: 'POWER_WITHER_LEGGINGS', category: 'DUNGEON LEGGINGS', tier: 'LEGENDARY', lore: catalogLore }], equipment: [] };
    const resolved = hypixelImport.resolveGearSummary({ id: 'POWER_WITHER_LEGGINGS', lore: REAL_NECRONS_LEGGINGS_LORE }, itemData);
    assert.ok(resolved, 'should resolve a real catalog id');
    assert.deepEqual(resolved.lore, catalogLore, "must return the catalog's own lore unconditionally, never summary.lore");
    assert.ok(!('liveLore' in resolved), 'no liveLore flag — the live-lore swap mechanism is gone');
  });

  // 6. hiddenBase through to the three shown tiers, computed rather than parsed from rendered text.
  // Synthetic numbers pin the formula: pristine=100, no reforge/gems/books, 5 Stars, Catacombs 0.
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

  // 10. Gear-Score tiered stats (Skeleton Master and Zombie Knight families): a per-copy item_tier
  // plus baseStatBoostPercentage replaces the catalog's pristine value for the stats Hypixel's
  // tiered_stats table covers, and baseStatBoostPercentage at its max bumps rarity one tier,
  // stacking with Recombobulator. Pinned with self-contained numbers.
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

    // A manually-built copy, with no per-copy itemTier, falls back to the catalog's pristine value
    // and is unaffected by this mechanic.
    const manualTotals = await itemStatTotals.computeItemStatTotals(catalogItem, { ...modifiers, itemTier: null, baseStatBoostPercentage: 0 }, itemData, { catacombsLevel: 0 });
    assert.notEqual(manualTotals.health.nonDungeonStarred, 92.4, 'a manually-built item must NOT get the real per-copy tiered total');
  });

  // 11. The tiered pristine is ceiled rather than left a float: Hypixel's displayed base stat is
  // always whole even when tiered_stats[i] x pieceBoost isn't (45 x 1.5 = 67.5), and without it
  // every downstream total drifts by up to half a point.
  await check('Gear-Score tiered pristine is ceil()d, not a raw float', () => {
    assert.equal(tieredArmorStats.computeTieredPristineStat('SKELETON_MASTER_CHESTPLATE', 'crit_damage', 10, 50), 68, 'ceil(45 x 1.5 = 67.5) must be 68');
  });

  // 12. End-to-end pin against a live Skeleton Master Chestplate: Ancient reforge (+1 Crit Damage per
  // Catacombs level, at level 45), 5 base Stars plus 5 Master Stars, General's Medallion 4 digits.
  // The formula "[ceil(BASE x pieceBoost) + reforge bonus] x totalboost" reproduces Hypixel's own
  // displayed Crit Damage: 119.8% outside a dungeon, 665.6% inside a non-master one.
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

    // The rendered tooltip must match computeItemStatTotals, not just the totals themselves. The
    // catalog's bundled lore for this item carries a "Crit Damage: +22" line (Hypixel's tier-1
    // tiered_stats baseline) while the real per-copy pristine is 68, so a leading-number merge
    // that assumes the text and the computed pristine agree under-counts the rendered total by 46
    // (73.8% instead of 119.8%) even when the totals are correct.
    const tooltipLines = await itemTooltip.buildFullItemTooltipLines(catalogItem, modifiers, itemData, 45, 0, 0, undefined, 4, undefined, false, false, 0);
    const critDamageLine = tooltipLines.find((l) => l.replace(/§./g, '').startsWith('Crit Damage:'));
    assert.ok(critDamageLine, 'rendered tooltip must have a Crit Damage line');
    const afterLabel = critDamageLine.replace(/§./g, '').slice('Crit Damage:'.length);
    const leading = parseFloat(/^\s*([+-]?[\d.]+)/.exec(afterLabel)[1]);
    assert.equal(leading, 119.8, `rendered Crit Damage leading number must be the real 119.8, got ${leading} (line: ${critDamageLine})`);
  });
  // Chimera and Manticore Claw both copy the equipped pet's stat spread, and both read the SAME
  // PET_STAT_KEY_MAP — a stat missing from that map is silently dropped by both at once, with no
  // error anywhere. Ability Damage was missing exactly that way even though the
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
  // list at low Strength, so a Crit-Damage build was never offered the Onyx it was working toward.
  // Same gem + same socket must still share a group
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
  // — never from either tier's auction price. Synthetic cost bundle so
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
  // outright-immune set until, so both halves are pinned here: the survivor multiplier
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
  // boost compounds on the doubled figure. Checked through the real
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
  // landing on exactly 1.815 when all four are maxed ( — that figure is
  // the whole spec, so it's pinned here). The Mimic Shard's level comes off the Epic 32-cap shard
  // ladder, and the multiplier scales a blessing's own numbers BEFORE they reach the base stats.
  await check('Dungeon Blessing multiplier and Mimic ladder', () => {
    const { computeBlessingMultiplier, computeBlessingEffects } = dungeonBlessing;
    assert.equal(Number(computeBlessingMultiplier({}).toFixed(4)), 1.2, 'the automatic +20% is always on');
    assert.equal(
      Number(computeBlessingMultiplier({ forbiddenBlessingLevel: 10, paulBuff: true }, { mimic: 10 }).toFixed(4)),
      1.815,
      '1.10 * 1.10 * 1.20 * 1.25',
    );
    // Mimic is a normal attribute (lib/attributes.js's OTHER_ATTRIBUTES), so it reaches the
    // multiplier through the attributes map — never off the blessing block, which doesn't carry
    // it. A stale `mimicShardLevel` on the blessing must be ignored, not silently honoured.
    assert.equal(
      Number(computeBlessingMultiplier({ mimicShardLevel: 10 }, {}).toFixed(4)),
      1.2,
      'the blessing block no longer carries the Mimic level',
    );
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

  // 22. Essence-shop perk effects have no public data source, so every per-level figure is pinned
  // here at both ends of its range. The three Catacombs (Undead) ones exist only inside a dungeon;
  // the rest are permanent.
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
  // into them — the distinction is the whole point, so both the ladder
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
  // recombobulated. They read a stand-in rarity for both. Pins the
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

  // 25. David's Cloak's Hunting-milestone Strength is imported from the item's own lore, but that
  // lore's leading number ALREADY includes the reforge — and this app applies the reforge itself,
  // so taking the leading number whole double-counted it. Confirmed against a real Strengthened
  // copy reading "§7Strength: §c+7 §9(+7)": milestone 0, reforge 7, app said 14.
  await check("David's Cloak imports milestone Strength without the reforge", () => {
    const { parseDavidsCloakFromLore } = hypixelImport;
    const realStrengthened = ['§7Health: §c+50', '§7Strength: §c+7 §9(+7)', '§d§lMYTHIC CLOAK'];
    assert.equal(parseDavidsCloakFromLore(realStrengthened).special, 0, 'an all-reforge +7 is milestone 0');
    assert.equal(parseDavidsCloakFromLore(realStrengthened).rarityOverride, 'MYTHIC');
    // A real milestone value with no reforge survives untouched.
    assert.equal(parseDavidsCloakFromLore(['§7Strength: §c+34', '§d§lMYTHIC CLOAK']).special, 34);
    // ...and with one, only the reforge's share comes off.
    assert.equal(parseDavidsCloakFromLore(['§7Strength: §c+41 §9(+7)', '§d§lLEGENDARY CLOAK']).special, 34);
    // The §8 parenthetical is the Catacombs Stats Boost preview — it is NOT part of the leading
    // number, so subtracting it too would swing the milestone value wildly negative.
    assert.equal(parseDavidsCloakFromLore(['§7Strength: §c+41 §9(+7) §8(+99)', '§d§lMYTHIC CLOAK']).special, 34);
    assert.equal(parseDavidsCloakFromLore(['§7Health: §c+50', '§d§lMYTHIC CLOAK']).special, 0, 'no Strength line is 0');
    assert.deepEqual(parseDavidsCloakFromLore(null), { special: 0, rarityOverride: null });
  });
  // 26. Mining Islands: two separate boosts (the HotM Lonesome Miner perk and a Mithril Golem
  // pet) share one location gate. Both rates are pinned here because both were quoted 10x/0.5
  // off before being checked against NEU-REPO and confirmed:
  // hotmlayout.json's "(+ (* level 0.5) 4.5)" and petnums.json's LEGENDARY otherNums[1].
  await check('Mining Island boosts and their location gate', () => {
    const { lonesomeMinerPercent, mithrilGolemPercent, isMiningIslandMob, anyMiningIslandTarget } = miningIslands;

    // Level 0 is "perk unbought" — NOT the formula's 4.5% intercept, the easy off-by-one here.
    assert.equal(lonesomeMinerPercent(0), 0, 'an unbought perk grants nothing');
    assert.equal(lonesomeMinerPercent(1), 5, 'level 1 is +5%');
    assert.equal(lonesomeMinerPercent(45), 27, 'level 45 caps at +27%, not +27.5%');
    assert.equal(lonesomeMinerPercent(999), 27, 'level is clamped to the cap');
    assert.equal(lonesomeMinerPercent(null), 0);

    // 0.2%/level, so +20% at level 100 — the 2%/level figure belongs to Mithril Affinity.
    assert.equal(mithrilGolemPercent(100), 20, 'level 100 is +20%, not +200%');
    assert.equal(mithrilGolemPercent(1), 0.2);
    assert.equal(mithrilGolemPercent(0), 0);

    // The gate is by LOCATION, not by mob type — all three islands count, nothing else does.
    assert.equal(isMiningIslandMob('Diamond Goblin'), true, 'Dwarven Mines');
    assert.equal(isMiningIslandMob('Automaton'), true, 'Crystal Hollows');
    assert.equal(isMiningIslandMob('Emerald Slime'), true, 'Deep Caverns');
    assert.equal(isMiningIslandMob('Bonzo'), false, 'the Catacombs is not a Mining Island');
    assert.equal(isMiningIslandMob('Nonexistent Mob'), false, 'an unlocated mob is not on one');
    assert.equal(anyMiningIslandTarget(['Bonzo', 'Automaton']), true, 'any selected target counts');
    assert.equal(anyMiningIslandTarget([]), false);
  });
  // 27. OPTIMIZER_BUILD_KEYS must list every build field runOptimizer reads. Both React callers
  // build their effect's dependency array from it, so a field missing here is a recommendation
  // panel that silently never updates when that input changes — how Dungeon Blessings, essence
  // perks, Master Mode and three Bestiary/collection inputs went stale.
  // Source-scanned rather than called, since the omission is invisible at runtime.
  await check('OPTIMIZER_BUILD_KEYS covers every build field the optimizer reads', async () => {
    const { OPTIMIZER_BUILD_KEYS } = optimizerModule;
    const src = await readFile(new URL('../src/lib/optimizer.js', import.meta.url), 'utf8');
    // The set*/apply*/toggle*/remove*/selectItem members are BuildContext mutators that
    // applyOptimizerResult calls — actions, not inputs, so they are deliberately not dependencies.
    const isMutator = (f) => /^(set|apply|toggle|remove)[A-Z]/.test(f) || f === 'selectItem';
    const read = [...new Set([...src.matchAll(/\bbuild\.([a-zA-Z_][a-zA-Z0-9_]*)/g)].map((m) => m[1]))]
      .filter((f) => !isMutator(f))
      .sort();
    const missing = read.filter((f) => !OPTIMIZER_BUILD_KEYS.includes(f));
    assert.deepEqual(missing, [], `add these to OPTIMIZER_BUILD_KEYS: ${missing.join(', ')}`);
    // ...and nothing stale in the other direction, which would be a wasted re-run per change.
    // 'loadout' is the one legitimate extra: runOptimizer takes it as its own first argument
    // rather than off `build`, but the callers still pass build.loadout and must depend on it.
    const unread = OPTIMIZER_BUILD_KEYS.filter((f) => f !== 'loadout' && !read.includes(f));
    assert.deepEqual(unread, [], `these are listed but never read: ${unread.join(', ')}`);
  });
  // 28. Two Optimizer carry-over rules. (a) A reforge/ultimate enchant only rides onto a swap
  // candidate the new item can actually take: BuildContext's selectItem clears both across a
  // weapon-family boundary, and the Optimizer's own steps must not re-apply them — a Sword's
  // Fabled and One For All landing on a Bow would rank that Bow as if it had them.
  // (b) Fabled's midpoint is melee-only.
  await check('Optimizer carries only what the new item can take', () => {
    const { carriedReforgeName, carriedUltimateEnchantment } = optimizerModule;
    const sword = { id: 'ASPECT_OF_THE_END', category: 'SWORD', tier: 'LEGENDARY' };
    const bow = { id: 'JUJU_SHORTBOW', category: 'BOW', tier: 'LEGENDARY' };
    const mods = { reforge: 'Fabled', ultimateEnchantment: { id: 'ultimate_one_for_all', level: 5, maxLevel: 5 } };
    // Same shape lib/reforgeData.js's isReforgeApplicable really reads: a single itemTypes string
    // matched through CATEGORY_TO_REFORGE_TYPES, plus the rarities the reforge is sold for.
    const data = {
      reforges: { Fabled: { name: 'Fabled', itemTypes: 'SWORD', requiredRarities: ['LEGENDARY'] } },
      reforgeStones: {},
      // getCategoryEnchantIds reads enchantsMeta.enchants[CATEGORY] — the nesting is real.
      enchants: { enchants: { SWORD: ['ultimate_one_for_all', 'sharpness'], BOW: ['power', 'ultimate_soul_eater'] } },
    };
    assert.equal(carriedReforgeName(mods, sword, data), 'Fabled', 'a sword keeps a sword reforge');
    assert.equal(carriedReforgeName(mods, bow, data), null, 'a bow cannot take a sword-only reforge');
    assert.equal(carriedUltimateEnchantment(mods, sword, data)?.id, 'ultimate_one_for_all');
    assert.equal(carriedUltimateEnchantment(mods, bow, data), null, "a bow cannot take the sword's ultimate");
    // An unrecognised reforge name carries over rather than being guessed invalid — same
    // permissive fallback selectItem uses when a name is in neither real table.
    assert.equal(carriedReforgeName({ reforge: 'Unknown' }, bow, data), 'Unknown');
    assert.equal(carriedReforgeName({}, bow, data), null);
    assert.equal(carriedUltimateEnchantment({}, bow, data), null);
  });
  // 29. Maxor's: +5% ADDITIVE arrow damage per piece, bow-only. The
  // set's real ids are SPEED_WITHER_*, Hypixel's internal name for it — a set keyed on MAXOR_*
  // would silently never match. Additive, so a full set is +20% summed, not 1.05^4 compounded the
  // way Skeleton Master's per-piece multiplier is; keeping those two straight is the point here.
  await check("Maxor's stacks additively per piece, bows only", () => {
    const { MAXOR_SET, MAXOR_ARROW_DAMAGE_PERCENT_PER_PIECE, countSetPieces } = armorSetBonuses;
    assert.deepEqual(MAXOR_SET, ['SPEED_WITHER_HELMET', 'SPEED_WITHER_CHESTPLATE', 'SPEED_WITHER_LEGGINGS', 'SPEED_WITHER_BOOTS']);
    assert.equal(MAXOR_SET.length * MAXOR_ARROW_DAMAGE_PERCENT_PER_PIECE, 20, 'a full set is +20%, additive');

    // countSetPieces aligns setIds to ARMOR_SLOTS by INDEX, so the array order above is load
    // bearing — a helmet id sitting in the chestplate position would count zero pieces.
    const slots = ['helmet', 'chestplate', 'leggings', 'boots'];
    const wear = (n) => Object.fromEntries(slots.slice(0, n).map((slot, i) => [slot, { item: { id: MAXOR_SET[i] } }]));
    assert.equal(countSetPieces(wear(0), slots, MAXOR_SET), 0);
    assert.equal(countSetPieces(wear(2), slots, MAXOR_SET), 2);
    assert.equal(countSetPieces(wear(4), slots, MAXOR_SET), 4);
    assert.equal(
      countSetPieces({ helmet: { item: { id: 'POWER_WITHER_HELMET' } } }, slots, MAXOR_SET),
      0,
      "Necron's is a different Wither set",
    );
  });
  // 30. The pure apply (lib/applyResult.js) is what lets a planner apply a candidate, re-rank
  // against the outcome, and continue — optimizer.js's applyOptimizerResult can't, since it writes
  // through BuildContext's setters. The two have to agree or a planned sequence gets ranked
  // against a state a real click never produces, so the shared rules live in lib/slotSelection.js
  // and the checks below pin the ones with real logic behind them.
  await check('Pure apply reproduces BuildContext\'s own swap rules', () => {
    const { applyResultToState, canApplyPurely } = applyResult;
    const sword = { id: 'ASPECT_OF_THE_END', name: 'AotE', category: 'SWORD', tier: 'LEGENDARY', lore: [] };
    const bow = { id: 'JUJU_SHORTBOW', name: 'Juju', category: 'BOW', tier: 'LEGENDARY', lore: [] };
    const base = {
      loadout: {
        weapon: {
          item: sword,
          modifiers: {
            reforge: 'Fabled',
            stars: 3,
            masterStars: 0,
            dungeonized: false,
            hexEnchantments: [{ id: 'sharpness', level: 5, maxLevel: 5 }],
            ultimateEnchantment: { id: 'ultimate_one_for_all', level: 5, maxLevel: 5 },
            gemstones: [],
            gemstoneSlotsUnlocked: [],
          },
        },
      },
      attributes: {},
      essencePerks: {},
      blessing: {},
    };
    const data = { reforges: { Fabled: { name: 'Fabled', itemTypes: 'SWORD', requiredRarities: ['LEGENDARY'] } }, reforgeStones: {} };

    // Crossing the weapon family drops every persisted upgrade — the rule BuildContext's own
    // selectItem applies, now shared rather than reimplemented.
    const swapped = applyResultToState(base, { apply: [{ type: 'selectItem', slot: 'weapon', item: bow }] }, data);
    assert.equal(swapped.loadout.weapon.item.id, 'JUJU_SHORTBOW');
    assert.equal(swapped.loadout.weapon.modifiers.reforge, null, 'a sword reforge does not survive onto a bow');
    assert.equal(swapped.loadout.weapon.modifiers.ultimateEnchantment, null, "nor does the sword's ultimate");
    assert.deepEqual(swapped.loadout.weapon.modifiers.hexEnchantments, [], 'nor its hex enchants');
    assert.equal(swapped.loadout.weapon.modifiers.stars, 0, 'nor its stars');
    // ...and the original state is untouched, which is what makes it safe to loop over.
    assert.equal(base.loadout.weapon.item.id, 'ASPECT_OF_THE_END', 'apply is pure');
    assert.equal(base.loadout.weapon.modifiers.reforge, 'Fabled');

    // Master Stars clear whenever the base stars drop below the eligibility threshold, and again
    // when dungeonized is turned off — both mirror their setters.
    const starred = applyResultToState(
      { ...base, loadout: { weapon: { ...base.loadout.weapon, modifiers: { ...base.loadout.weapon.modifiers, dungeonized: true, stars: 5, masterStars: 3 } } } },
      { apply: [{ type: 'setStarCount', slot: 'weapon', count: 1 }] },
      data,
    );
    assert.equal(starred.loadout.weapon.modifiers.masterStars, 0, 'dropping below the threshold clears Master Stars');

    // One For All's removeIds clear the hex list AND a named ultimate, same as applyEnchant.
    const ofa = applyResultToState(
      base,
      { apply: [{ type: 'applyEnchant', slot: 'weapon', id: 'ultimate_soul_eater', level: 5, maxLevel: 5, removeIds: ['sharpness', 'ultimate_one_for_all'] }] },
      data,
    );
    assert.equal(ofa.loadout.weapon.modifiers.ultimateEnchantment.id, 'ultimate_soul_eater');
    assert.deepEqual(ofa.loadout.weapon.modifiers.hexEnchantments, [], 'removeIds clears the hex list');

    // Build-level steps land outside the loadout but still inside the state a planner re-ranks on.
    const perked = applyResultToState(base, { apply: [{ type: 'setEssencePerkLevel', key: 'bane', level: 5 }, { type: 'setAttributeLevel', id: 'mimic', level: 10 }] }, data);
    assert.equal(perked.essencePerks.bane, 5);
    assert.equal(perked.attributes.mimic, 10);

    // A result touching the owned-accessory inventory isn't purely applicable — a planner must
    // skip it rather than apply it partially and rank the rest against a state that never exists.
    assert.equal(canApplyPurely({ apply: [{ type: 'selectItem', slot: 'weapon', item: bow }] }), true);
    assert.equal(canApplyPurely({ apply: [{ type: 'setOwnedAccessory', id: 'X', tier: 'RARE' }] }), false);
  });
  // 31. A bow's fire rate uses its own Attack Speed breakpoints, reached later than melee's, but
  // shares melee's cap exactly. Both tables are pinned: 0.5s to 0-11, 0.45s to 12-24, 0.4s to
  // 25-42, 0.35s to 43-66, 0.3s to 67-99, 0.25s to 100-149, 0.2s to 150+.
  await check('Bow fire rate has its own breakpoints under the shared cap', () => {
    const { computeBowShotsPerSecond, computeMeleeHitsPerSecond } = finalDamage;
    const bare = {};
    const rate = (as) => Number(computeBowShotsPerSecond(as, bare).toFixed(3));

    // Each row holds from its own threshold up to one below the next — a lookup, not a curve.
    assert.equal(rate(0), 2, '0 is 0.5s per shot');
    assert.equal(rate(11), 2, '11 is still 0.5s');
    assert.equal(rate(12), Number((1 / 0.45).toFixed(3)), '12 crosses to 0.45s');
    assert.equal(rate(24), Number((1 / 0.45).toFixed(3)));
    assert.equal(rate(25), 2.5, '25 crosses to 0.4s');
    assert.equal(rate(42), 2.5);
    assert.equal(rate(43), Number((1 / 0.35).toFixed(3)), '43 crosses to 0.35s');
    assert.equal(rate(66), Number((1 / 0.35).toFixed(3)));
    assert.equal(rate(67), Number((1 / 0.3).toFixed(3)), '67 crosses to 0.3s');
    assert.equal(rate(99), Number((1 / 0.3).toFixed(3)));
    assert.equal(rate(100), 4, '100 crosses to 0.25s');

    // The cap is 100, so nothing past it moves the rate...
    assert.equal(rate(149), 4, 'Attack Speed is capped at 100');
    assert.equal(rate(10000), 4, 'and the cap is a clamp, not a bug to overflow past');

    // ...which makes the 0.2s row reachable only through Thermodynamic's raised 150 cap — the one
    // real exception, and the same one melee already has.
    const thermo = {
      helmet: { item: { id: 'THERMODYNAMIC_HELMET' } },
      chestplate: { item: { id: 'THERMODYNAMIC_CHESTPLATE' } },
      leggings: { item: { id: 'THERMODYNAMIC_LEGGINGS' } },
      boots: { item: { id: 'THERMODYNAMIC_BOOTS' } },
    };
    assert.equal(Number(computeBowShotsPerSecond(150, thermo).toFixed(3)), 5, 'Thermodynamic reaches 0.2s');
    assert.equal(Number(computeBowShotsPerSecond(149, thermo).toFixed(3)), 4, 'one short of it does not');

    // The whole point of a separate table: the same stat fires slower from a bow. At 82 a melee
    // weapon is already at 0.25s while a bow is still at 0.3s.
    assert.equal(Number(computeMeleeHitsPerSecond(82, bare).toFixed(3)), 4);
    assert.equal(rate(82), Number((1 / 0.3).toFixed(3)), 'the same Attack Speed is slower on a bow');
  });
  // 32. Free upgrades. A Skill level costs time, not coins, so it prices to a real 0 rather than
  // null — the UI splits on exactly that (0 is free, '?' is unpriced, and they are different
  // claims). The step also has to survive the pure apply, or a planner would rank a Catacombs
  // level it can't actually take.
  await check('Skill levels are free and applicable', () => {
    const { applyResultToState, canApplyPurely } = applyResult;
    const step = { type: 'setPlayerLevel', key: 'catacombsLevel', value: 48 };
    assert.equal(pricing.lookupCandidateCost({ category: 'Skill', apply: [step] }, { costs: {} }), 0, 'a skill level costs no coins');
    assert.notEqual(pricing.lookupCandidateCost({ category: 'Skill', apply: [step] }, { costs: {} }), null, '0 is not the same as unpriced');
    assert.equal(canApplyPurely({ apply: [step] }), true);
    const before = { loadout: {}, playerStats: { catacombsLevel: 47 }, attributes: {}, essencePerks: {}, blessing: null };
    const after = applyResultToState(before, { apply: [step] }, {});
    assert.equal(after.playerStats.catacombsLevel, 48);
    assert.equal(before.playerStats.catacombsLevel, 47, 'apply stays pure');
  });
  // 33. Inside a dungeon the God Potion is REPLACED by the Dungeon Potion — different stats, no
  // mixin, and two tiers decided by owning a Jellyfish pet rather than by anything drunk. Both
  // tiers are pinned.
  await check('Dungeon Potion replaces the God Potion at two tiers', () => {
    const { DUNGEON_POTION_TIERS, dungeonPotionEffects, GOD_POTION_STRENGTH_POTION } = godPotion;
    assert.deepEqual(DUNGEON_POTION_TIERS.tier7, { label: 'Tier VII', strength: 40, critChance: 20, critDamage: 30, arrowDamage: 50 });
    assert.deepEqual(DUNGEON_POTION_TIERS.jellyfish, { label: 'Jellyfish VII', strength: 60, critChance: 30, critDamage: 45, arrowDamage: 75 });
    // Ownership picks the tier, and owning one is strictly better on every stat.
    assert.equal(dungeonPotionEffects(false).label, 'Tier VII');
    assert.equal(dungeonPotionEffects(true).label, 'Jellyfish VII');
    for (const key of ['strength', 'critChance', 'critDamage', 'arrowDamage']) {
      assert.ok(DUNGEON_POTION_TIERS.jellyfish[key] > DUNGEON_POTION_TIERS.tier7[key], `Jellyfish VII must beat Tier VII on ${key}`);
    }
    // It is weaker than the God Potion it replaces, which is the whole reason it can't just be a
    // scaled copy — a dungeon run is not a God Potion run.
    assert.ok(DUNGEON_POTION_TIERS.jellyfish.strength < GOD_POTION_STRENGTH_POTION, 'even the top dungeon tier trails the God Potion on Strength');
  });
  // 34. Last Breath and Lethality cut the mob's Defense STAT, and they are MULTIPLICATIVE with each
  // other, not additive — the difference at max is 68% off vs 86% off,
  // which on Master Necron is a 2.8x damage swing vs a 5.6x one. Both are pinned, along with the
  // fact that a Defense cut feeds `1 - Def/(100+Def)` rather than scaling damage directly.
  await check('Defense debuffs are multiplicative and feed the Defense curve', () => {
    const { mobDefenseDebuffMultiplier, finalDamageDebuffMultiplier, ICE_SPRAY_MULTIPLIER, TWILIGHT_ARROW_POISON_MULTIPLIER } = mobDebuffs;
    const { computeMobDefenseMultiplier } = mobDefenses;
    const maxed = { iceSpray: false, lastBreath: 5, lethality: 4 };
    // 0.5 * 0.64 — NOT 1 - (0.5 + 0.36).
    assert.ok(Math.abs(mobDefenseDebuffMultiplier(maxed) - 0.32) < 1e-9, 'max debuffs leave 32% of Defense');
    assert.ok(Math.abs(mobDefenseDebuffMultiplier({ lastBreath: 5 }) - 0.5) < 1e-9);
    assert.ok(Math.abs(mobDefenseDebuffMultiplier({ lethality: 4 }) - 0.64) < 1e-9);
    assert.equal(mobDefenseDebuffMultiplier(null), 1, 'no debuffs is an exact no-op');
    // Out-of-range input clamps rather than inverting the multiplier.
    assert.equal(mobDefenseDebuffMultiplier({ lastBreath: 99, lethality: 99 }), mobDefenseDebuffMultiplier(maxed));

    // The curve, not the damage: Master Necron's 2100 Defense at 0.32 is 672, and
    // 1 - 672/772 = 0.1295 — a 2.85x gain over the undebuffed 1 - 2100/2200 = 0.0455.
    const necron = { name: 'Necron', types: [] };
    const plain = computeMobDefenseMultiplier(necron, true);
    const shredded = computeMobDefenseMultiplier(necron, true, mobDefenseDebuffMultiplier(maxed));
    assert.ok(Math.abs(plain - (1 - 2100 / 2200)) < 1e-9);
    assert.ok(Math.abs(shredded - (1 - 672 / 772)) < 1e-9);
    assert.ok(shredded / plain > 2.8 && shredded / plain < 2.9, 'max Defense shred is worth ~2.85x, not ~5.6x');

    // A mob with no published Defense is untouched however far the sliders go — the honest result
    // for the 200-odd mobs with no real number, and the reason the panel says so.
    const zombie = { name: 'Zombie', types: [] };
    assert.equal(computeMobDefenseMultiplier(zombie, true, mobDefenseDebuffMultiplier(maxed)), 1);

    // The two flat multipliers are the debuffs that apply to every target, Defense or not — and
    // they are multiplicative with each other, so both on is 1.21 rather than 1.2.
    assert.equal(finalDamageDebuffMultiplier({ iceSpray: true }), ICE_SPRAY_MULTIPLIER);
    assert.equal(finalDamageDebuffMultiplier({ twilightPoison: true }), TWILIGHT_ARROW_POISON_MULTIPLIER);
    assert.ok(Math.abs(finalDamageDebuffMultiplier({ iceSpray: true, twilightPoison: true }) - 1.21) < 1e-9, 'both flat debuffs compose to 1.21');
    assert.equal(finalDamageDebuffMultiplier({ iceSpray: false, twilightPoison: false }), 1);
    assert.equal(finalDamageDebuffMultiplier(null), 1);
  });
  // 35. Potato Books on the weapon are priced as two different items: books 1-10 are Hot Potato
  // Books and 11-15 Fuming (lib/books.js), so where you START decides the cost. Also pins that an
  // unpriced half makes the row '?' instead of a total that quietly leaves those books out, and that
  // the new setBookCount step applies purely like every other planner step.
  await check('Potato Books price as Hot to 10 and Fuming beyond', () => {
    const { lookupCandidateCost } = pricing;
    const priced = { costs: { itemPrices: { HOT_POTATO_BOOK: 100, FUMING_POTATO_BOOK: 1000 } } };
    const row = (from) => ({ category: 'Potato Books', fromBooks: from, apply: [{ type: 'setBookCount', slot: 'weapon', count: 15 }] });
    assert.equal(lookupCandidateCost(row(0), priced), 10 * 100 + 5 * 1000);
    assert.equal(lookupCandidateCost(row(7), priced), 3 * 100 + 5 * 1000);
    assert.equal(lookupCandidateCost(row(12), priced), 3 * 1000, 'past 10, only Fuming books are left to buy');
    assert.equal(lookupCandidateCost(row(0), { costs: { itemPrices: { HOT_POTATO_BOOK: 100 } } }), null, 'a missing Fuming price is ?, not 0');
    assert.equal(lookupCandidateCost(row(12), { costs: { itemPrices: { FUMING_POTATO_BOOK: 1000 } } }), 3 * 1000, 'an unneeded Hot price does not matter');

    const { applyResultToState, canApplyPurely } = applyResult;
    const step = { type: 'setBookCount', slot: 'weapon', count: 15 };
    assert.equal(canApplyPurely({ apply: [step] }), true);
    const before = { loadout: { weapon: { item: { id: 'HYPERION' }, modifiers: { books: 3 } } } };
    const after = applyResultToState(before, { apply: [step] }, {});
    assert.equal(after.loadout.weapon.modifiers.books, 15);
    assert.equal(before.loadout.weapon.modifiers.books, 3, 'apply stays pure');
  });
  // 36. The Recommended Upgrades panel's "auto" mode follows the page's own toggles and target,
  // so the list can't be ranking for a different kind of content than
  // the damage number beside it. Pins every branch, and that each answer is a real selectable mode.
  await check('Auto recommendation mode follows the page toggles and target', () => {
    const { resolveOptimizerMode, OPTIMIZER_MODES } = optimizerModule;
    const page = (o) => ({ useDungeonizedStats: false, mageMode: false, dpsMode: false, dpsKind: 'melee', ...o });
    const cases = [
      [page({}), ['Ender'], 'slayer', 'an ordinary overworld target'],
      [page({}), null, 'slayer', 'no target picked yet'],
      [page({}), ['Mythological'], 'diana', 'a Mythological target is a Diana hunt'],
      [page({ mageMode: true }), ['Mythological'], 'mage', 'Mage wins over the target outside a dungeon'],
      [page({ useDungeonizedStats: true }), ['Undead'], 'dungeon_archer', 'the one non-mage dungeon mode'],
      [page({ useDungeonizedStats: true, mageMode: true }), ['Undead'], 'dungeon_mage_ability', 'Final Damage view is Ability Damage'],
      [page({ useDungeonizedStats: true, mageMode: true, dpsMode: true, dpsKind: 'beam' }), ['Undead'], 'dungeon_mage_beam', 'the Beam output is on screen'],
      [page({ useDungeonizedStats: true, mageMode: true, dpsMode: false, dpsKind: 'beam' }), ['Undead'], 'dungeon_mage_ability', 'a remembered beam choice only counts while DPS is showing'],
    ];
    const ids = new Set(OPTIMIZER_MODES.map((m) => m.id));
    for (const [toggles, types, expected, why] of cases) {
      const got = resolveOptimizerMode(toggles, types);
      assert.equal(got, expected, why);
      assert.ok(ids.has(got), `${got} must be a real optimizer mode`);
    }
  });
  // 37. Item buffs (lib/buffs.js): flat grants in every mode. Ragnarock
  // copies 1.5x the axe's own Strength (so nothing without an axe), Sword of Bad Health is its +100
  // cap, and the Weirder Tuba grants three stats. Also pins which Ragnarock the buff reads.
  await check('Item buffs grant their stats, Ragnarock from the axe itself', () => {
    const { computeBuffGrants, findRagnarock, RAGNAROCK_ID } = buffsModule;
    const sum = (grants) => grants.reduce((m, g) => ({ ...m, [g.stat]: (m[g.stat] || 0) + g.value }), {});
    assert.deepEqual(computeBuffGrants(null), []);
    assert.deepEqual(computeBuffGrants({ ragnarock: false, swordOfBadHealth: false, weirderTuba: false }, 300), [], 'toggled off is inert');
    assert.deepEqual(sum(computeBuffGrants({ ragnarock: true }, 240)), { strength: 360 }, '1.5x the axe Strength');
    assert.deepEqual(computeBuffGrants({ ragnarock: true }, 0), [], 'no axe to copy, no Ragnarock buff');
    assert.deepEqual(sum(computeBuffGrants({ swordOfBadHealth: true })), { strength: 100 });
    assert.deepEqual(sum(computeBuffGrants({ weirderTuba: true })), { strength: 40, crit_damage: 10, bonus_attack_speed: 5 });
    assert.deepEqual(
      sum(computeBuffGrants({ ragnarock: true, swordOfBadHealth: true, weirderTuba: true }, 100)),
      { strength: 290, crit_damage: 10, bonus_attack_speed: 5 },
      'they stack',
    );
    const imported = { item: { id: RAGNAROCK_ID }, modifiers: {} };
    const equipped = { item: { id: RAGNAROCK_ID }, modifiers: { reforge: 'fabled' } };
    assert.equal(findRagnarock([{ item: { id: 'HYPERION' } }, imported], { weapon: equipped }), imported, 'the imported axe wins');
    assert.equal(findRagnarock([], { weapon: equipped }), equipped, 'an equipped one when nothing is imported');
    assert.equal(findRagnarock(null, { weapon: { item: { id: 'HYPERION' } } }), null);
  });
  // 38. Blaze pet's Bling Armor (lib/petData.js): +0.4% per pet level to
  // Blaze and Frozen Blaze Armor's RAW base stats, for a Rare/Epic/Legendary Blaze (NEU petnums has
  // the perk from Rare up). Applied to pristine, so it only ever touches those eight pieces.
  await check('Blaze Bling Armor scales Blaze and Frozen Blaze armor base stats', async () => {
    const { computeBlingArmorPercent, petItemStatContext } = petData;
    const blaze = (tier, level) => ({ item: { petId: 'BLAZE', tier }, modifiers: { level } });
    assert.equal(computeBlingArmorPercent(blaze('LEGENDARY', 100)), 40);
    assert.equal(computeBlingArmorPercent(blaze('RARE', 50)), 20);
    assert.equal(computeBlingArmorPercent(blaze('UNCOMMON', 100)), 0, 'Common/Uncommon Blaze has no Bling Armor');
    assert.equal(computeBlingArmorPercent({ item: { petId: 'GOLDEN_DRAGON', tier: 'LEGENDARY' }, modifiers: { level: 100 } }), 0);
    assert.equal(computeBlingArmorPercent(null), 0);
    assert.deepEqual(petItemStatContext(blaze('LEGENDARY', 100)), { potatoBookDoubled: true, blingArmorPercent: 40 });
    assert.deepEqual(petItemStatContext(blaze('EPIC', 100)), { potatoBookDoubled: false, blingArmorPercent: 40 }, 'books double only at Legendary');

    const lore = ['§7Defense: §a+180', '§7Strength: §c+40', '§7Speed: §a+2'];
    const frozen = { id: 'FROZEN_BLAZE_CHESTPLATE', tier: 'LEGENDARY', category: 'CHESTPLATE', lore };
    const t = await itemStatTotals.computeItemStatTotals(frozen, { ...BARE_MODIFIERS }, EMPTY_ITEM_DATA, { blingArmorPercent: 40 });
    assert.equal(t.strength.pristine, 56, '40 Strength x 1.4');
    assert.equal(t.defense.nonDungeonStarred, 252, '180 Defense x 1.4');
    const plain = await itemStatTotals.computeItemStatTotals({ ...frozen, id: 'SHADOW_ASSASSIN_CHESTPLATE' }, { ...BARE_MODIFIERS }, EMPTY_ITEM_DATA, { blingArmorPercent: 40 });
    assert.equal(plain.strength.pristine, 40, 'no other armor is touched');
    const noPet = await itemStatTotals.computeItemStatTotals(frozen, { ...BARE_MODIFIERS }, EMPTY_ITEM_DATA, {});
    assert.equal(noPet.strength.pristine, 40, 'no Blaze pet, no boost');
  });
  // 39. Tier Boost pet item (lib/petData.js): raises the pet's rarity by
  // one; a pet already at its highest rarity is unchanged. Applied at read time, so it must be
  // idempotent — collectDamageSources applies it, then calls helpers that apply it again.
  await check('Tier Boost raises pet rarity by one, capped at the pet\'s highest rarity', async () => {
    const { applyTierBoost, computeBasePetStats, petItemStatContext, TIER_BOOST_ID } = petData;
    const levels = (strength) => ({ 1: { statNums: { STRENGTH: strength / 100 }, otherNums: [] }, 100: { statNums: { STRENGTH: strength }, otherNums: [] } });
    const itemData = { pets: { BLAZE: { EPIC: levels(10), LEGENDARY: levels(20) }, BAT: { LEGENDARY: levels(30), MYTHIC: levels(40) } }, petItems: [] };
    const pet = (petId, tier, petItem = TIER_BOOST_ID) => ({ item: { petId, tier }, modifiers: { level: 100, petItem } });

    const boosted = applyTierBoost(pet('BLAZE', 'EPIC'), itemData);
    assert.equal(boosted.item.tier, 'LEGENDARY');
    assert.equal(applyTierBoost(boosted, itemData).item.tier, 'LEGENDARY', 'applying twice must not boost twice');
    assert.equal(applyTierBoost(pet('BLAZE', 'LEGENDARY'), itemData).item.tier, 'LEGENDARY', 'highest rarity: no change');
    assert.equal(applyTierBoost(pet('BAT', 'LEGENDARY'), itemData).item.tier, 'MYTHIC', 'Legendary goes to Mythic when the pet has one');
    const unboosted = pet('BLAZE', 'EPIC', null);
    assert.equal(applyTierBoost(unboosted, itemData), unboosted, 'no Tier Boost: untouched');
    assert.equal(applyTierBoost(null, itemData), null);

    assert.equal(computeBasePetStats({ pet: pet('BLAZE', 'EPIC') }, itemData).STRENGTH, 20, 'stats come from the boosted rarity');
    assert.equal(petItemStatContext(pet('BLAZE', 'EPIC'), itemData).potatoBookDoubled, true, 'Epic Blaze + Tier Boost doubles books like a Legendary');
  });
  // 40. Crimson Swipe's opening proc (lib/finalDamage.js's simulateHitByHit): the fight's first
  // hit always procs Swipe, at double damage; every later Swipe keeps the 1/s cadence at the
  // normal amount.
  await check('Crimson Swipe procs on the first hit at double damage', () => {
    const { simulateHitByHit } = finalDamage;
    const stats = { damage: 100, strength: 100, crit_damage: 100, crit_chance: 100, bonus_attack_speed: 0 };
    const sources = {
      baseStats: stats,
      dungeonizedBaseStats: stats,
      masterDungeonizedBaseStats: stats,
      mythologicalBaseStats: stats,
      mythologicalDungeonizedBaseStats: stats,
      mythologicalMasterDungeonizedBaseStats: stats,
      additiveNonConditional: [{ id: 'flat', value: 100 }],
      additiveConditional: [],
      multiplicative: [],
      hasFinalDestinationFullSet: false,
      bestiaryMaxedMobs: null,
    };
    const crimson = Object.fromEntries(['helmet', 'chestplate', 'leggings', 'boots'].map((slot) => [slot, { item: { id: `INFERNAL_CRIMSON_${slot.toUpperCase()}` } }]));
    const mob = { name: 'Zombie', types: [] };
    const swipes = simulateHitByHit(sources, mob, crimson, null, 100).hits.map((h) => h.crimsonSwipeDamage);
    const later = swipes.slice(1).filter((d) => d > 0);
    assert.ok(swipes[0] > 0, 'hit 1 procs Swipe');
    assert.ok(later.length > 0, 'Swipe keeps proccing after the first hit');
    assert.ok(later.every((d) => d === later[0]), 'every later Swipe is the normal amount');
    assert.equal(swipes[0], later[0] * 2, 'only the opening Swipe is doubled');
    assert.ok(simulateHitByHit(sources, mob, {}, null, 100).hits.every((h) => h.crimsonSwipeDamage === 0), 'no Crimson armor, no Swipe');

    // The graph's x axis is 0-based: x=0 is the opening hit, against a
    // mob still at full HP, so the HP line drops at x=1 instead of x=2. Numbering only — the
    // doubled opening Swipe above still lands on that first recorded row.
    const sim = simulateHitByHit(sources, mob, crimson, 10_000_000, 100);
    assert.equal(sim.hits[0].hit, 0, 'the hit counter starts at 0');
    assert.equal(sim.hits[0].hpPercent, 100, 'and the mob is at full HP there');
    assert.equal(sim.hits[1].hit, 1, 'the next hit is 1, with damage already applied');
    assert.ok(sim.hits[1].hpPercent < 100, 'the HP line drops at x=1');
    assert.ok(sim.hits[0].crimsonSwipeDamage > 0, 'the doubled opening Swipe is on the x=0 row');
  });
  // 41. The player's Defense (lib/playerDefense.js) — Mining Level
  // (+1/level to 14, +2 after: 106 at 60), God Potion's 66, armor, and Unlimited Fortitude's
  // +0.2%/level on the total. Nothing on screen shows it; its only consumer is Ankylosaurus's
  // Armored Tank, whose own lore is "Gain {0}% of your Defense as Strength. (Max +500)".
  await check('Player Defense feeds Ankylosaurus Armored Tank, capped at +500 Strength', () => {
    const { computeMiningDefenseBonus, MAX_MINING_LEVEL } = playerStatsModule;
    const { combinePlayerDefense, GOD_POTION_DEFENSE, UNLIMITED_FORTITUDE_RATE } = playerDefense;
    const { computeAnkylosaurusStrength, ANKYLOSAURUS_MAX_STRENGTH } = petData;

    assert.equal(computeMiningDefenseBonus(MAX_MINING_LEVEL), 106, 'Mining 60 grants 106 Defense');
    assert.equal(computeMiningDefenseBonus(14), 14, '+1/level through 14');
    assert.equal(computeMiningDefenseBonus(15), 16, '+2/level from 15');
    assert.equal(GOD_POTION_DEFENSE, 66);
    assert.equal(UNLIMITED_FORTITUDE_RATE, 0.2);

    assert.equal(combinePlayerDefense(0, { miningLevel: 60 }, null, false), 106, 'Mining alone');
    assert.equal(combinePlayerDefense(0, null, null, true), 66, 'God Potion alone');
    assert.equal(combinePlayerDefense(828, { miningLevel: 60 }, null, true), 1000, 'armor + Mining + God Potion');
    assert.equal(combinePlayerDefense(100, null, { fortitude: 10 }, false), 102, 'Unlimited Fortitude 10 is +2%');

    // otherNums[0] is the pet's own rate: 0.5 at level 1, 50 at level 100 (0.5% per pet level).
    assert.equal(computeAnkylosaurusStrength(1000, [50]), 500, '1000 Defense at level 100 lands exactly on the cap');
    assert.equal(computeAnkylosaurusStrength(500, [50]), 250, 'half the Defense, half the Strength');
    assert.equal(computeAnkylosaurusStrength(1000, [25]), 250, 'half the pet level, half the conversion');
    assert.equal(computeAnkylosaurusStrength(4000, [50]), ANKYLOSAURUS_MAX_STRENGTH, 'never past +500');
    assert.equal(computeAnkylosaurusStrength(1000, []), 0, 'no pet numbers, no Strength');
  });
  // 42. Picking a Slayer boss defaults to its highest tier — the Tier
  // I-V ladder only. Every other tiered mob is tiered by spawn rarity or variant, where there's no
  // "highest" to assume, so those still need an explicit pick.
  await check('Slayer bosses default to their highest tier, other tiered mobs do not', async () => {
    const { resolveStartingHp, defaultTierSelection } = await server.ssrLoadModule('/src/lib/mobHp.js');

    assert.equal(defaultTierSelection('Voidgloom Seraph'), 'Tier IV');
    assert.equal(defaultTierSelection('Revenant Horror'), 'Tier V');
    assert.equal(defaultTierSelection('Tarantula Broodfather'), 'Tier V');
    assert.equal(defaultTierSelection('Sven Packmaster'), 'Tier IV');
    assert.equal(defaultTierSelection('Inferno Demonlord'), 'Tier IV');
    assert.equal(defaultTierSelection('Quazii'), 'Tier IV', 'the Attunement variants count too');
    assert.equal(defaultTierSelection('Typhoeus'), 'Tier IV');

    assert.equal(resolveStartingHp('Voidgloom Seraph', false, ''), 210_000_000, 'no pick -> Tier IV HP');
    assert.equal(resolveStartingHp('Revenant Horror', false, undefined), 10_000_000, 'no pick -> Tier V HP');
    assert.equal(resolveStartingHp('Voidgloom Seraph', false, 'Tier II'), 12_000_000, 'an explicit pick still wins');
    assert.equal(resolveStartingHp('Voidgloom Seraph', false, 'Tier IX'), 210_000_000, 'a stale pick falls back to the default');

    // Rarity/variant-tiered mobs are untouched: no default, still null without a pick.
    assert.equal(defaultTierSelection('Minos Inquisitor'), null, 'spawn rarities are not a Slayer ladder');
    assert.equal(defaultTierSelection('Zealot'), null, 'nor are variants');
    assert.equal(resolveStartingHp('Minos Inquisitor', false, ''), null);
    assert.equal(resolveStartingHp('Zealot', false, ''), null);
    assert.equal(resolveStartingHp('Minos Inquisitor', false, 'Mythic'), 80_000_000, 'an explicit pick still resolves');
    // Flat and dungeon mobs are unaffected by any of this.
    assert.equal(resolveStartingHp('Conjoined Brood', false, ''), 20_000_000, 'flat HP still resolves');
    assert.equal(resolveStartingHp('Necron', true, ''), 1_400_000_000, 'single-floor dungeon HP still resolves');
  });
  // 43. Final Destination's set bonus has to reach the DPS hit rate (the
  // Optimizer ignored its +20 Attack Speed). selectBaseStats grants it against Ender mobs only, so
  // every DPS path must read the stat through that rather than off the raw sources.baseStats block.
  await check("Final Destination's +20 Attack Speed reaches the DPS hit rate", () => {
    const { computeDpsBreakdown, simulateHitByHit, selectBaseStats, computeMeleeHitsPerSecond } = finalDamage;
    const stats = { damage: 100, strength: 0, crit_damage: 0, crit_chance: 100, bonus_attack_speed: 0 };
    const sources = {
      baseStats: stats,
      dungeonizedBaseStats: stats,
      masterDungeonizedBaseStats: stats,
      mythologicalBaseStats: stats,
      mythologicalDungeonizedBaseStats: stats,
      mythologicalMasterDungeonizedBaseStats: stats,
      additiveNonConditional: [],
      additiveConditional: [],
      multiplicative: [],
      hasFinalDestinationFullSet: true,
      bestiaryMaxedMobs: null,
    };
    const ender = { name: 'Voidgloom Seraph', types: ['Ender'] };
    const undead = { name: 'Revenant Horror', types: ['Undead'] };

    assert.equal(selectBaseStats(sources, false, false, ender).bonus_attack_speed, 20, 'the set grants +20 vs Ender');
    assert.equal(selectBaseStats(sources, false, false, undead).bonus_attack_speed, 0, 'and nothing vs anything else');

    // 0 Attack Speed is 0.5s per hit; +20 crosses two breakpoints to 0.4s, i.e. 2/s -> 2.5/s.
    assert.equal(computeMeleeHitsPerSecond(20, {}), 2.5);
    assert.equal(computeDpsBreakdown(sources, ender, {}).meleeHitsPerSecond, 2.5, 'Ender target: the boosted rate');
    assert.equal(computeDpsBreakdown(sources, undead, {}).meleeHitsPerSecond, 2, 'non-Ender target: the bare rate');
    assert.equal(simulateHitByHit(sources, ender, {}, null, 100).meleeHitsPerSecond, 2.5, 'the fight simulation reads it too');
  });
  // 44. Accessory Bag slots (lib/accessorySlots.js): a new accessory needs
  // a slot, so when none is free its price carries the cheapest slot on the market. Accessory Size
  // (~1.3M/slot) undercuts Jacobus (10M/slot at the top band) until it is maxed.
  await check('A new accessory pays for its bag slot only when none is free', async () => {
    const { readSlotState, slotCostForNewAccessory, nextSlotPurchase, jacobusPurchaseCost } =
      await server.ssrLoadModule('/src/lib/accessorySlots.js');

    assert.equal(jacobusPurchaseCost(1), 1_500_000);
    assert.equal(jacobusPurchaseCost(20), 12_000_000, 'the 20th purchase is still 12M');
    assert.equal(jacobusPurchaseCost(21), 20_000_000, '20M once 40 slots have been bought');
    assert.equal(jacobusPurchaseCost(99), 20_000_000);
    assert.equal(jacobusPurchaseCost(100), null, '99 purchases is the cap');

    // 9 base + 42 (collection tier 8) + 16 free + 70 (35 Jacobus) + 10 (Accessory Size) = 147.
    const loadout = (owned) => ({
      accessory: { modifiers: { ownedAccessories: owned, bagUpgradesPurchased: 35, redstoneCollection: 245_887 } },
    });
    const maxed = { accessory_size: 10 };
    const full = readSlotState(loadout(new Array(147).fill({ id: 'X' })), maxed);
    assert.equal(full.total, 147);
    assert.equal(full.used, 147);
    assert.equal(full.free, 0);

    const roomy = readSlotState(loadout(new Array(140).fill({ id: 'X' })), maxed);
    assert.equal(roomy.free, 7);
    assert.equal(slotCostForNewAccessory(roomy, {}).coins, 0, 'free slots cost nothing');

    // Bag full, Accessory Size maxed -> the next slot is a Jacobus purchase, halved across its 2 slots.
    assert.equal(slotCostForNewAccessory(full, {}).coins, 10_000_000);

    // Accessory Size not maxed -> its next level is cheaper, so that is what gets charged.
    const ladder = { costs: { attributeCostsByLevel: { accessory_size: [275_000, 825_000, 1_650_000, 2_475_000, 3_575_000, 4_675_000, 6_050_000, 7_700_000, 9_900_000, 13_200_000] } } };
    const lowSize = readSlotState(loadout(new Array(140).fill({ id: 'X' })), { accessory_size: 3 });
    assert.equal(lowSize.total, 140, '3 levels instead of 10 is 7 fewer slots');
    assert.equal(lowSize.free, 0);
    const charged = slotCostForNewAccessory(lowSize, ladder);
    assert.equal(charged.coins, 825_000, 'level 4 costs the gap between rungs 3 and 4');
    assert.match(charged.note, /Accessory Size 4/, 'and the note names where the slot comes from');
    assert.equal(nextSlotPurchase(lowSize, ladder).source, 'Accessory Size 4', 'cheaper than Jacobus, so it wins');

    // No import on file: no bag data, so nothing is charged and nothing is claimed.
    const noImport = readSlotState({ accessory: { modifiers: {} } }, maxed);
    assert.equal(noImport, null);
    // An import made before the Worker sent the bag fields: absent is not zero, or a maxed account
    // would compute a 35-slot bag, read as full, and pay for a slot on every accessory.
    const staleImport = readSlotState({ accessory: { modifiers: { ownedAccessories: new Array(146).fill({ id: 'X' }) } } }, maxed);
    assert.equal(staleImport, null, 'missing bag fields keep slots out of the pricing');
    assert.deepEqual(slotCostForNewAccessory(null, ladder), { coins: 0, free: true, note: null });
  });

  // 45. A gear swap carries the normal enchants the new item can take, not just the ultimate.
  // BuildContext's selectItem resets the slot, so every carried modifier needs both a ranked
  // value and an explicit apply step; a candidate evaluated stripped of the enchants the worn
  // piece has is ranked against a weaker copy of itself, and the swap-in then really does drop
  // them. Same category rule as the ultimate: melee enchants never ride onto a bow.
  await check('A weapon swap carries normal enchants the candidate accepts', () => {
    const { carriedHexEnchantments } = optimizerModule;
    const sword = { category: 'SWORD' };
    const bow = { category: 'BOW' };
    // itemData.enchants is itself the meta object getCategoryEnchantIds reads, so the per-category
    // lists sit one level further in: itemData.enchants.enchants[CATEGORY].
    const enchantData = {
      enchants: {
        enchants: {
          SWORD: ['sharpness', 'critical', 'ender_slayer'],
          BOW: ['power', 'ender_slayer'],
        },
      },
    };
    const worn = {
      hexEnchantments: [
        { id: 'sharpness', level: 7, maxLevel: 7 },
        { id: 'critical', level: 7, maxLevel: 7 },
        { id: 'power', level: 7, maxLevel: 7 },
        { id: 'ender_slayer', level: 7, maxLevel: 7 },
      ],
    };

    const ontoSword = carriedHexEnchantments(worn, sword, enchantData).map((e) => e.id);
    assert.ok(ontoSword.includes('sharpness'), 'a melee enchant rides onto another melee weapon');
    assert.ok(ontoSword.includes('ender_slayer'), 'and so does one both families share');
    assert.ok(!ontoSword.includes('power'), 'a Bow-only enchant does not');

    const ontoBow = carriedHexEnchantments(worn, bow, enchantData).map((e) => e.id);
    assert.ok(!ontoBow.includes('sharpness') && !ontoBow.includes('critical'), 'melee enchants never reach a bow');
    assert.ok(ontoBow.includes('power'), 'the Bow enchant does');

    // Levels ride along untouched — a carried enchant is the same enchant, not a re-rolled one.
    assert.deepEqual(
      carriedHexEnchantments(worn, sword, enchantData).find((e) => e.id === 'sharpness'),
      { id: 'sharpness', level: 7, maxLevel: 7 },
    );
    // Nothing applied, nothing carried.
    assert.deepEqual(carriedHexEnchantments({ hexEnchantments: [] }, sword, enchantData), []);
    assert.deepEqual(carriedHexEnchantments(undefined, sword, enchantData), []);
  });

  // 46. The five Catacombs classes (lib/dungeonClass.js). Stats are pinned at levels 0, 25 and 50,
  // and every one of them is gated on the Dungeon toggle: the classes exist only inside Catacombs,
  // so with it off a class grants nothing and every non-dungeon number is untouched.
  await check('Dungeon classes grant their real stats, and only inside a dungeon', () => {
    const { dungeonClassStats, lustForBloodCap, MAX_DUNGEON_CLASS_LEVEL, DEFAULT_DUNGEON_CLASS } = dungeonClass;
    const at = (id, level) => dungeonClassStats(id, level, true);

    // Mage: +500/+10 at level 0, +5 Intelligence per level and +1 Ability Damage per 5 levels.
    assert.equal(at('mage', 0).intelligence, 500);
    assert.equal(at('mage', 0).ability_damage, 10);
    assert.equal(at('mage', 50).intelligence, 750);
    assert.equal(at('mage', 50).ability_damage, 20);
    assert.equal(at('mage', 25).intelligence, 625);
    assert.equal(at('mage', 25).ability_damage, 15);
    // Mage grants no multiplier at all — its whole contribution is two flat stats.
    assert.equal(at('mage', 50).meleeMultiplier, 1);
    assert.equal(at('mage', 50).arrowMultiplier, 1);

    // Archer: arrows x3.0 -> x3.8, melee a flat x0.75 at every level, bonus arrow 50% -> 100%.
    assert.equal(at('archer', 0).arrowMultiplier, 3);
    assert.equal(Number(at('archer', 50).arrowMultiplier.toFixed(2)), 3.8);
    assert.equal(at('archer', 0).meleeMultiplier, 0.75);
    assert.equal(at('archer', 50).meleeMultiplier, 0.75, 'the melee penalty does not scale');
    assert.equal(at('archer', 0).bonusArrowChance, 0.5);
    assert.equal(Number(at('archer', 50).bonusArrowChance.toFixed(2)), 1);
    assert.ok(at('archer', 50).bonusArrowChance <= 1, 'bonus arrow chance never exceeds one extra arrow');

    // Berserker: melee x1.8 -> x2.175, opening hit x1.4 -> x1.775.
    assert.equal(Number(at('berserk', 0).meleeMultiplier.toFixed(3)), 1.8);
    assert.equal(Number(at('berserk', 50).meleeMultiplier.toFixed(3)), 2.175);
    assert.equal(Number(at('berserk', 0).firstHitMultiplier.toFixed(3)), 1.4);
    assert.equal(Number(at('berserk', 50).firstHitMultiplier.toFixed(3)), 1.775);

    // Lust for Blood: 30% per kill at level 0, +3% per level, melee 5x and ranged 1x, both clamped
    // at a cap that grows +70 every 5 levels. Melee is over the cap from level 0 on; ranged never
    // reaches it, which is what makes the two scale so differently.
    assert.equal(lustForBloodCap(0), 250);
    assert.equal(lustForBloodCap(4), 250, 'the cap steps every 5 levels, not every level');
    assert.equal(lustForBloodCap(5), 320);
    assert.equal(lustForBloodCap(50), 950);
    assert.equal(at('berserk', 0).lustForBloodMeleePercent, 150, '30 x 5, under the 250 cap');
    assert.equal(at('berserk', 0).lustForBloodRangedPercent, 30, '30 x 1');
    assert.equal(at('berserk', 50).lustForBloodMeleePercent, 900, '180 x 5, under the 950 cap');
    assert.equal(at('berserk', 50).lustForBloodRangedPercent, 180, '180 x 1');
    // A level whose melee value would exceed the cap is clamped to it rather than running past.
    const capped = at('berserk', 30);
    assert.equal(capped.lustForBloodMeleePercent, Math.min(lustForBloodCap(30), (30 + 3 * 30) * 5));

    // Healer/Tank grants nothing, which is also why it is the safe default for a build that has
    // never picked a class.
    assert.deepEqual(at('healer_tank', 50), at('healer_tank', 0));
    assert.equal(at('healer_tank', 50).meleeMultiplier, 1);
    assert.equal(at('healer_tank', 50).intelligence, 0);
    assert.equal(DEFAULT_DUNGEON_CLASS, 'healer_tank');

    // The Dungeon gate: outside a dungeon every class is inert, whatever its level.
    for (const id of ['mage', 'archer', 'berserk', 'healer_tank']) {
      assert.deepEqual(
        dungeonClassStats(id, MAX_DUNGEON_CLASS_LEVEL, false),
        dungeonClassStats('healer_tank', 0, true),
        `${id} grants nothing with the Dungeon toggle off`,
      );
    }
    // An unrecognised id is inert too, so a stale stored value can never inflate a number.
    assert.deepEqual(dungeonClassStats('paladin', 50, true), dungeonClassStats('healer_tank', 0, true));
    // Levels clamp rather than extrapolating past the real ceiling.
    assert.deepEqual(at('mage', 999), at('mage', MAX_DUNGEON_CLASS_LEVEL));
    assert.deepEqual(at('mage', -5), at('mage', 0));
  });

  // 47. The class stats reach the damage pipeline. Two halves that have to hold together: a class
  // flat stat rides on selectBaseStats' post-selection layer, where the Catacombs Boost can't scale
  // it, and Berserker's opening-hit multiplier is gated by the same excludeFirstHitOnly flag the
  // additive loop already honours — the multiplicative loop did not check it before classes existed.
  await check('Class stats reach Final Damage, and the opening-hit one is gated', () => {
    const { selectBaseStats, computeFinalDamage } = finalDamage;
    const { dungeonClassStats } = dungeonClass;
    const mob = { name: 'Test Dummy', types: [] };
    const baseStats = { damage: 100, strength: 100, crit_damage: 0, intelligence: 50, ability_damage: 0 };
    const sourcesWith = (classStats, multiplicative = []) => ({
      baseStats,
      dungeonizedBaseStats: baseStats,
      masterDungeonizedBaseStats: baseStats,
      mythologicalBaseStats: baseStats,
      mythologicalDungeonizedBaseStats: baseStats,
      mythologicalMasterDungeonizedBaseStats: baseStats,
      additiveNonConditional: [],
      additiveConditional: [],
      weaponBonusNonConditional: [],
      weaponBonusConditional: [],
      multiplicative,
      abilityMultiplicative: [],
      dungeonClassStats: classStats,
    });

    // Mage's Intelligence lands on top of the selected block, whichever block that is.
    const mageStats = dungeonClassStats('mage', 50, true);
    const mageSources = sourcesWith(mageStats);
    assert.equal(selectBaseStats(mageSources, true, false, mob).intelligence, 50 + 750);
    assert.equal(selectBaseStats(mageSources, true, false, mob).ability_damage, 20);
    // A class that grants no flat stat leaves the block exactly as it was.
    const bareSources = sourcesWith(dungeonClassStats('healer_tank', 50, true));
    assert.equal(selectBaseStats(bareSources, true, false, mob).intelligence, 50);

    // Berserker's opening-hit multiplier applies to the headline hit and is dropped from a steady
    // one, so a fight's later hits never carry it.
    const berserk = dungeonClassStats('berserk', 0, true);
    const firstHitEntry = { id: 'dungeon-class-first-hit', label: 'First Hit', value: berserk.firstHitMultiplier, firstHitOnly: true };
    const meleeEntry = { id: 'dungeon-class-weapon', label: 'Melee', value: berserk.meleeMultiplier };
    const withBoth = sourcesWith(berserk, [meleeEntry, firstHitEntry]);
    const opening = computeFinalDamage(withBoth, mob, true, false, false);
    const steady = computeFinalDamage(withBoth, mob, true, false, true);
    assert.equal(Number(opening.multiplicativeMultiplier.toFixed(4)), Number((1.8 * 1.4).toFixed(4)));
    assert.equal(Number(steady.multiplicativeMultiplier.toFixed(4)), 1.8, 'the steady hit keeps the melee multiplier and drops the opening one');
    assert.ok(opening.finalDamage > steady.finalDamage, 'the opening hit really is the bigger number');

    // An ordinary multiplicative entry carries no firstHitOnly flag, so the new gate leaves every
    // pre-existing source untouched on both kinds of hit.
    const plain = sourcesWith(dungeonClassStats('healer_tank', 0, true), [{ id: 'skyblock-level', label: 'Skyblock Level', value: 1.05 }]);
    assert.equal(computeFinalDamage(plain, mob, true, false, false).multiplicativeMultiplier, 1.05);
    assert.equal(computeFinalDamage(plain, mob, true, false, true).multiplicativeMultiplier, 1.05);
  });

  // 48. The DPS graph runs a whole fight, and Lust for Blood BUILDS across it. Melee gains 5x the
  // per-stack scaling and ranged 1x against the same cap, which is the entire reason the two scale
  // so differently: melee is capped by hit 2, ranged climbs for most of a fight.
  await check('Lust for Blood ramps per hit and the fight runs to 0% HP', () => {
    const { simulateHitByHit, MAX_SIMULATED_HITS } = finalDamage;
    const { dungeonClassStats } = dungeonClass;
    const mob = { name: 'Dummy', types: [] };
    const baseStats = { damage: 100, strength: 100, crit_damage: 0, crit_chance: 0, intelligence: 0, ability_damage: 0, bonus_attack_speed: 0 };
    const sourcesFor = (classStats) => ({
      baseStats,
      dungeonizedBaseStats: baseStats,
      masterDungeonizedBaseStats: baseStats,
      mythologicalBaseStats: baseStats,
      mythologicalDungeonizedBaseStats: baseStats,
      mythologicalMasterDungeonizedBaseStats: baseStats,
      additiveNonConditional: [],
      additiveConditional: [],
      weaponBonusNonConditional: [],
      weaponBonusConditional: [],
      multiplicative: [],
      abilityMultiplicative: [],
      dungeonClassStats: classStats,
    });
    const run = (category, classId, hp) =>
      simulateHitByHit(
        sourcesFor(dungeonClassStats(classId, 0, true)),
        mob,
        { weapon: { item: { category }, modifiers: {} } },
        hp,
        100,
        true,
        false,
        MAX_SIMULATED_HITS,
      );

    // Melee: 30 x 5 = 150% on hit 1, 300% on hit 2 clamped to the 250% cap, flat from there. The
    // damage ratio between the two is the additive multiplier's, (1 + 250/100) / (1 + 150/100).
    const melee = run('SWORD', 'berserk', 2_000_000).hits.map((h) => h.meleeDamage);
    assert.ok(melee[1] > melee[0], 'hit 2 gains another stack');
    assert.equal(Number((melee[1] / melee[0]).toFixed(3)), Number((3.5 / 2.5).toFixed(3)));
    assert.equal(melee[2], melee[1], 'hit 3 is already capped');
    assert.equal(melee[9], melee[1], 'and stays there');

    // Ranged: 30% a hit against the same 250% cap, so it climbs until hit 9 instead of hit 2.
    const ranged = run('BOW', 'berserk', 2_000_000).hits.map((h) => h.meleeDamage);
    for (let i = 1; i < 8; i++) assert.ok(ranged[i] > ranged[i - 1], `ranged hit ${i + 1} is still climbing`);
    assert.equal(ranged[9], ranged[8], 'and caps at hit 9');
    assert.ok(ranged[1] / ranged[0] < melee[1] / melee[0], 'ranged climbs slower than melee per hit');

    // Healer/Tank grants no Lust for Blood, so every hit is identical.
    const flat = run('SWORD', 'healer_tank', 2_000_000).hits.map((h) => h.meleeDamage);
    assert.equal(flat[0], flat[5], 'no class bonus means a flat line');

    // The window is the mob's health, not a hit count: a fight that takes more than the old 40-hit
    // cap runs all the way down, and the last recorded hit leaves the mob dead. HP is chosen to die
    // inside MAX_SIMULATED_HITS, which is a runaway guard rather than a window.
    const long = run('SWORD', 'healer_tank', 300_000);
    assert.ok(long.hits.length > 40, `a real fight runs past the old 40-hit window, got ${long.hits.length}`);
    assert.equal(long.hits[0].hpPercent, 100, 'and starts at full HP');
    assert.ok(long.hits[long.hits.length - 1].hpPercent < 1, 'ending with the mob all but dead');
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

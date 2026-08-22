// Guards computeBasePetStats — the single definition of what Chimera/Manticore Claw copy (see the
// comment above it in petData.js, and [[project_chimera_base_stats]] in project memory). This
// exact behavior has regressed twice: once by copying ability-granted stats that aren't real base
// stats (Ankylosaurus), once by stripping a species perk that genuinely IS part of the pet's real
// base-stat bracket (Golden Dragon's Shining Scales) after over-correcting the first bug. No test
// runner in this project (see CLAUDE.md) — run directly: `node src/lib/petData.selfcheck.mjs`.
// Fixture stat numbers are real, fetched live from NEU-REPO's petnums.json, not guessed.
import assert from 'node:assert/strict';
import { computeBasePetStats } from './petData.js';

function petFixture(petId, tier, level, level1Stats, level100Stats, { goldCollection = 0, otherNums1 = [], otherNums100 = [] } = {}) {
  return {
    loadout: {
      pet: {
        item: { id: `${petId}_${tier}`, petId, name: petId, tier, material: 'BONE' },
        modifiers: { level, petItem: null, bankCoins: 0, goldCollection },
      },
    },
    itemData: {
      pets: {
        [petId]: {
          [tier]: { 1: { statNums: level1Stats, otherNums: otherNums1 }, 100: { statNums: level100Stats, otherNums: otherNums100 } },
        },
      },
    },
  };
}

// Golden Dragon, Legendary, level 200 (its "100" checkpoint), max Gold Collection (9 digits) —
// Shining Scales must be included: base 50 Strength + ~99.9 from Shining Scales.
{
  const { loadout, itemData } = petFixture(
    'GOLDEN_DRAGON',
    'LEGENDARY',
    200,
    { BONUS_ATTACK_SPEED: 25, STRENGTH: 25, MAGIC_FIND: 5 },
    { BONUS_ATTACK_SPEED: 50, STRENGTH: 50, MAGIC_FIND: 10 },
    { goldCollection: 100_000_000 },
  );
  const stats = computeBasePetStats(loadout, itemData);
  assert.ok(stats.STRENGTH > 100, `Golden Dragon base Strength should include Shining Scales (>100), got ${stats.STRENGTH}`);
  assert.ok(Math.abs(stats.STRENGTH - 149.9) < 1, `Golden Dragon base Strength should be ~149.9, got ${stats.STRENGTH}`);
}

// Same pet with zero Gold Collection — Shining Scales contributes nothing, base stays the pure curve.
{
  const { loadout, itemData } = petFixture(
    'GOLDEN_DRAGON',
    'LEGENDARY',
    200,
    { BONUS_ATTACK_SPEED: 25, STRENGTH: 25, MAGIC_FIND: 5 },
    { BONUS_ATTACK_SPEED: 50, STRENGTH: 50, MAGIC_FIND: 10 },
  );
  const stats = computeBasePetStats(loadout, itemData);
  assert.equal(stats.STRENGTH, 50, `Golden Dragon base Strength with 0 Gold Collection should be exactly the curve (50), got ${stats.STRENGTH}`);
}

// Ankylosaurus, Legendary, level 100 — real base stats are Health/Defense/True Defense only.
// Unyielding's +500 Strength is ability-granted, not part of the curve, and must stay excluded.
{
  const { loadout, itemData } = petFixture(
    'ANKYLOSAURUS',
    'LEGENDARY',
    100,
    { HEALTH: 1.5, DEFENSE: 0.5, TRUE_DEFENSE: 0.15 },
    { HEALTH: 150, DEFENSE: 50, TRUE_DEFENSE: 15 },
  );
  const stats = computeBasePetStats(loadout, itemData);
  assert.ok(!stats.STRENGTH, `Ankylosaurus has no base Strength stat at all — Unyielding must stay excluded, got ${stats.STRENGTH}`);
  assert.equal(stats.HEALTH, 150, `Ankylosaurus base Health should be the curve value, got ${stats.HEALTH}`);
}

// Lion, Legendary, level 100 — Primal Force boosts its native Strength, same rule as Shining Scales.
{
  const { loadout, itemData } = petFixture(
    'LION',
    'LEGENDARY',
    100,
    { SPEED: 0.25, STRENGTH: 0.5, FEROCITY: 0.05 },
    { SPEED: 25, STRENGTH: 50, FEROCITY: 5 },
    { otherNums1: [0.2, 0.2, 1.0, 15], otherNums100: [20, 20, 100, 150] },
  );
  const stats = computeBasePetStats(loadout, itemData);
  assert.ok(stats.STRENGTH > 50, `Lion base Strength should include Primal Force (>50), got ${stats.STRENGTH}`);
  assert.equal(stats.STRENGTH, 70, `Lion base Strength should be curve(50) + Primal Force(20), got ${stats.STRENGTH}`);
}

console.log('petData.selfcheck: all Chimera/Manticore base-stat scope checks passed.');

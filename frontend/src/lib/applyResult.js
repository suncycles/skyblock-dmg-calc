// Applying an Optimizer result WITHOUT a live BuildContext.
//
// optimizer.js's applyOptimizerResult does the same job by calling BuildContext's setters, which
// means it mutates React state and can only run once, from a click. A planner has to apply a
// result, re-rank against the outcome, and apply the next one — so it needs the same rules as a
// pure transform (see docs: the Optimizer Rebuild plan, phase 02).
//
// The two must agree, or a planned sequence would be ranked against a state the real click never
// produces. Every rule with real logic behind it therefore lives in ONE place that both call:
// lib/slotSelection.js for what an item swap keeps, and the step handlers below mirroring each
// setter's own semantics (clamping, the masterStars resets, the enchant conflict rules).
//
// Deliberately NOT modelled: the Armor/Equipment "Edit All" broadcast. Every applyOptimizerResult
// call already passes respectEditAll: false — a Recommended Upgrade swap-in is scoped to its own
// slot (user-specified 2026-08-26), so there is nothing here for it to reproduce.

import { emptyAccessoryModifiers } from './defaultModifiers';
import { MAX_MASTER_STARS, MASTER_STAR_MIN_BASE_STARS, getMaxStarsForItem } from './starring';
import { isUltimateEnchant } from './enchantEffects';
import { getSpecialConfig } from './specialWeapons';
import { countGemstoneSlots, getAllowedGemsForSlotType } from './gemstones';
import { isReforgeApplicable } from './reforgeData';
import { buildSlotEntry } from './slotSelection';

// A planner state is the loadout plus the three build-level maps optimizer steps can write to.
// Attributes/essence perks/the blessing block are not part of the loadout but ARE part of what a
// candidate was valued against, so a planner that dropped them would mis-rank every later step.
export function emptyApplyState(build) {
  return {
    loadout: build.loadout,
    attributes: build.attributes || {},
    essencePerks: build.essencePerks || {},
    blessing: build.blessing || null,
  };
}

function withSlotModifiers(state, slot, fn) {
  const entry = state.loadout[slot];
  if (!entry) return state;
  const modifiers = fn(entry.modifiers, entry.item);
  if (modifiers === entry.modifiers) return state;
  return { ...state, loadout: { ...state.loadout, [slot]: { ...entry, modifiers } } };
}

// Mirrors BuildContext.setStarCount: clamped against the item's OWN real cap (5 normally, 10/15
// for whitelisted gear), and dropping below the Master Star threshold clears masterStars too.
function setStars(state, slot, count) {
  return withSlotModifiers(state, slot, (modifiers, item) => {
    const stars = Math.max(0, Math.min(getMaxStarsForItem(item), Math.floor(count) || 0));
    const next = { ...modifiers, stars };
    if (stars < MASTER_STAR_MIN_BASE_STARS) next.masterStars = 0;
    return next;
  });
}

// Mirrors BuildContext.applyEnchant, including One For All's "removes every other enchant" rule —
// the caller supplies removeIds, and an ultimate named there is cleared as well as hex entries.
function applyEnchant(state, slot, { id, level, maxLevel, removeIds = [] }) {
  return withSlotModifiers(state, slot, (modifiers) => {
    const entry = { id, level, maxLevel };
    const hexEnchantments = (modifiers.hexEnchantments || []).filter((e) => !removeIds.includes(e.id));
    const ultimateEnchantment =
      modifiers.ultimateEnchantment && removeIds.includes(modifiers.ultimateEnchantment.id) ? null : modifiers.ultimateEnchantment;
    if (isUltimateEnchant(id)) return { ...modifiers, ultimateEnchantment: entry, hexEnchantments };
    return {
      ...modifiers,
      hexEnchantments: [...hexEnchantments.filter((e) => e.id !== id), entry],
      ultimateEnchantment,
    };
  });
}

// Mirrors BuildContext.applyGemstone's two real guards: no phantom entry in a socket the item
// doesn't have, and no gem the socket's own type won't accept.
function setGemstone(state, slot, { index, gem, tier }) {
  return withSlotModifiers(state, slot, (modifiers, item) => {
    if (item && index >= countGemstoneSlots(item.lore)) return modifiers;
    if (item && !getAllowedGemsForSlotType(item.gemstone_slots?.[index]?.slot_type).includes(gem)) return modifiers;
    const gemstones = (modifiers.gemstones || []).slice();
    gemstones[index] = { gem, tier };
    return { ...modifiers, gemstones };
  });
}

const STEPS = {
  selectItem: (state, step, itemData) => ({
    ...state,
    loadout: {
      ...state.loadout,
      [step.slot]: buildSlotEntry({ slot: step.slot, item: step.item, prevEntry: state.loadout[step.slot], itemData }),
    },
  }),

  applyEnchant: (state, step) => applyEnchant(state, step.slot, step),

  setSpecialValue: (state, step) => withSlotModifiers(state, step.slot, (m) => ({ ...m, special: step.value })),

  // rarityOverride only means anything for the milestone-upgrading items that carry a `rarities`
  // config (currently David's Cloak) — same guard BuildContext.setRarityOverride applies.
  setRarityOverride: (state, step) =>
    withSlotModifiers(state, step.slot, (m, item) => (item && !getSpecialConfig(item.id)?.rarities ? m : { ...m, rarityOverride: step.tier })),

  setStarCount: (state, step) => setStars(state, step.slot, step.count),

  setDungeonized: (state, step) =>
    withSlotModifiers(state, step.slot, (m) => ({ ...m, dungeonized: !!step.value, masterStars: step.value ? m.masterStars : 0 })),

  setMasterStarCount: (state, step) =>
    withSlotModifiers(state, step.slot, (m) => ({
      ...m,
      masterStars: m.dungeonized && m.stars >= MASTER_STAR_MIN_BASE_STARS ? Math.max(0, Math.min(MAX_MASTER_STARS, Math.floor(step.count) || 0)) : 0,
    })),

  applyReforge: (state, step, itemData) =>
    withSlotModifiers(state, step.slot, (m, item) => {
      const meta = itemData?.reforges?.[step.name] || itemData?.reforgeStones?.[step.name];
      if (step.name != null && meta && item && !isReforgeApplicable(meta, item)) return m;
      return { ...m, reforge: step.name };
    }),

  toggleRecombobulated: (state, step) => withSlotModifiers(state, step.slot, (m) => ({ ...m, recombobulated: !m.recombobulated })),
  setRecombobulated: (state, step) => withSlotModifiers(state, step.slot, (m) => ({ ...m, recombobulated: !!step.value })),

  setGemstone: (state, step) => setGemstone(state, step.slot, step),

  setPetItem: (state, step) => withSlotModifiers(state, 'pet', (m) => ({ ...m, petItem: step.petItemId })),
  setPetBankCoins: (state, step) => withSlotModifiers(state, 'pet', (m) => ({ ...m, bankCoins: step.value })),
  setPetGoldCollection: (state, step) => withSlotModifiers(state, 'pet', (m) => ({ ...m, goldCollection: step.value })),

  setAccessoryMagicalPower: (state, step) => ({
    ...state,
    loadout: {
      ...state.loadout,
      accessory: {
        item: state.loadout.accessory?.item ?? null,
        modifiers: { ...(state.loadout.accessory?.modifiers || emptyAccessoryModifiers()), magicalPower: step.mp },
      },
    },
  }),

  setAccessoryTuning: (state, step) => ({
    ...state,
    loadout: {
      ...state.loadout,
      accessory: {
        item: state.loadout.accessory?.item ?? null,
        modifiers: { ...(state.loadout.accessory?.modifiers || emptyAccessoryModifiers()), tuning: step.tuning },
      },
    },
  }),

  setAttributeLevel: (state, step) => ({ ...state, attributes: { ...state.attributes, [step.id]: step.level } }),
  setEssencePerkLevel: (state, step) => ({ ...state, essencePerks: { ...state.essencePerks, [step.key]: step.level } }),
  setForbiddenBlessingLevel: (state, step) => ({ ...state, blessing: { ...(state.blessing || {}), forbiddenBlessingLevel: step.level } }),
};

// The two accessory-bag steps (setOwnedAccessory/removeOwnedAccessory) are deliberately absent:
// they edit the player's real owned-accessory inventory, which is import-derived bookkeeping
// rather than part of the damage state a planner re-ranks against. A plan containing one is
// rejected below rather than silently applied as a no-op.
const UNSUPPORTED_STEPS = new Set(['setOwnedAccessory', 'removeOwnedAccessory']);

// True when every step of `result` can be applied purely — a planner should skip a result that
// can't be, since applying it partially would rank later steps against a state that never exists.
export function canApplyPurely(result) {
  return (result.apply || []).every((step) => STEPS[step.type] && !UNSUPPORTED_STEPS.has(step.type));
}

// Applies one result's steps in order, returning a new state. Order matters: a Crown of Avarice
// candidate needs its item selected before its Special value lands, and every candidate that
// carries a reforge/gemstone/enchant forward re-applies it after the swap.
export function applyResultToState(state, result, itemData) {
  let next = state;
  for (const step of result.apply || []) {
    const handler = STEPS[step.type];
    if (!handler || UNSUPPORTED_STEPS.has(step.type)) continue;
    next = handler(next, step, itemData);
  }
  return next;
}

import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useItemData } from '../context/ItemDataContext';
import { useTooltip } from '../context/TooltipContext';
import { ARMOR_SLOTS, ARMOR_SLOT_LABELS } from '../lib/armorSlots';
import { EQUIPMENT_SLOTS, EQUIPMENT_SLOT_LABELS } from '../lib/equipmentSlots';
import { buildFullItemTooltipLines } from '../lib/itemTooltip';
import { petLoreItemId, buildPetTooltipLines } from '../lib/petData';
import { fetchNeuItem } from '../lib/neuItems';
import { getPowerById, computeAccessoryTotalStats } from '../lib/accessoryPowers';
import { getSkyblockLevelColor } from '../lib/playerStats';
import { MOB_TYPES } from '../lib/mobTypes';
import { GOD_POTION_TOOLTIP_LINES } from '../lib/godPotion';
import { STAT_LABELS, formatStatValue } from '../lib/reforgeData';
import { formatItemName } from '../lib/mcText';
import { SLOT_TEXTURES } from '../lib/icons';
import WeaponIcon from '../components/WeaponIcon';

const slotBase =
  'flex items-center justify-center bg-[#8b8b8b] shadow-[inset_2px_2px_0_0_#373737,inset_-2px_-2px_0_0_#ffffff]';
const iconImg = 'w-[70%] h-[70%] object-contain pixelated';
const slotFillImg = 'w-full h-full object-cover pixelated';

// One-page character screen: 6 rows x 9 columns, real chest-GUI styling.
// Column B: the 4 equipment slots (Necklace/Cloak/Belt/Gloves — a second,
// parallel gear set alongside armor, same enchant/reforge/gemstone/book
// eligibility, see lib/equipmentSlots.js). Column C: the 4 armor slots
// (was ArmorSlotPicker's own page — folded in here). Column D: weapon
// (row 4) and pet (row 5). Columns F/G/H: decorative mob-head filler with
// no function, purely to balance out the grid. Everything else is an
// inert dark-grey glass pane, same "empty" texture used elsewhere in the
// app.
export default function Landing() {
  const navigate = useNavigate();
  const { loadout, removeSlot, playerStats, targetMob, setTargetMob, godPotionActive, toggleGodPotion, attributes } = useBuild();
  const { itemData } = useItemData();
  const { showTooltip, hideTooltip } = useTooltip();

  // buildFullItemTooltipLines is async (it fetches applied enchants' real
  // per-level lore to compute their stat bonuses) — one hover token
  // shared by every gear/weapon slot on this page (only one can be
  // hovered at a time) so a still-in-flight lookup from an ended hover
  // can't clobber a newer one or resurrect the tooltip after the mouse
  // has left. See Hex.jsx for the same pattern.
  const hoverTokenRef = useRef(0);
  function invalidateHover() {
    hoverTokenRef.current++;
    hideTooltip();
  }

  // Shared by both the armor and equipment columns — they're two
  // functionally identical gear sets (enchants/reforges/gemstones/books
  // all apply the same way), just filtered from different item lists.
  function handleGearClick(slot, pickerPath) {
    navigate(loadout[slot] ? `/hex/${slot}` : pickerPath);
  }

  async function handleGearHover(slot, label, e) {
    const equipped = loadout[slot];
    if (!equipped) {
      showTooltip([`§7${label}`, '§8Empty — click to pick one'], e.currentTarget);
      return;
    }
    const anchor = e.currentTarget;
    const token = ++hoverTokenRef.current;
    const lines = await buildFullItemTooltipLines(equipped.item, equipped.modifiers, itemData, playerStats.catacombsLevel, playerStats.tamingLevel);
    if (hoverTokenRef.current === token) showTooltip(lines, anchor);
  }

  function handleGearRemove(slot, e) {
    e.stopPropagation();
    hideTooltip();
    removeSlot(slot);
  }

  function handleWeaponClick() {
    navigate(loadout.weapon ? '/hex/weapon' : '/weapon');
  }

  async function handleWeaponHover(e) {
    if (!loadout.weapon) {
      showTooltip(['§7Weapon', '§8Empty — click to pick one'], e.currentTarget);
      return;
    }
    const anchor = e.currentTarget;
    const token = ++hoverTokenRef.current;
    const lines = await buildFullItemTooltipLines(loadout.weapon.item, loadout.weapon.modifiers, itemData, playerStats.catacombsLevel, playerStats.tamingLevel);
    if (hoverTokenRef.current === token) showTooltip(lines, anchor);
  }

  // Same real-lore-with-stats-substituted tooltip PetDetail's inline panel
  // shows (see lib/petData.js's buildPetTooltipLines) — fetched fresh per
  // hover rather than cached, same as gear/weapon hover above.
  async function handlePetHover(e) {
    if (!loadout.pet) {
      showTooltip(['§7Pet', '§8Empty — click to pick one'], e.currentTarget);
      return;
    }
    const anchor = e.currentTarget;
    const token = ++hoverTokenRef.current;
    const { item: pet, modifiers } = loadout.pet;
    const rawLoreData = await fetchNeuItem(petLoreItemId(pet.petId, pet.tier));
    const rawLore = rawLoreData && rawLoreData.lore && rawLoreData.lore.length > 0 ? rawLoreData : false;
    const lines = buildPetTooltipLines(pet, modifiers, itemData, rawLore);
    if (hoverTokenRef.current === token) showTooltip(lines, anchor);
  }

  // Synchronous, no fetch needed — the power table + formula are all
  // local (lib/accessoryPowers.js).
  function handleAccessoryHover(e) {
    if (!loadout.accessory) {
      showTooltip(['§7Accessories', '§8Empty — click to pick a power'], e.currentTarget);
      return;
    }
    const { item, modifiers } = loadout.accessory;
    const power = getPowerById(item.id);
    const stats = computeAccessoryTotalStats(item.id, modifiers.magicalPower, modifiers.tuning);
    const lines = [`§d§l${formatItemName(item.name)}`, `§7${power ? power.type : ''}`, `§7Magical Power: §b${modifiers.magicalPower}`, ''];
    for (const [key, value] of Object.entries(stats)) {
      const meta = STAT_LABELS[key];
      if (!meta || !value) continue;
      lines.push(`§7${meta.label}: §${meta.color}${formatStatValue(key, Math.round(value * 10) / 10)}`);
    }
    showTooltip(lines, e.currentTarget);
  }

  // Synchronous — the mob's types are already local (lib/mobTypes.js).
  function handleTargetMobHover(e) {
    if (!targetMob) {
      showTooltip(['§7Target Mob', '§8Empty — click to pick one'], e.currentTarget);
      return;
    }
    const types = MOB_TYPES[targetMob] || [];
    showTooltip([`§d§l${targetMob}`, `§7Types: §f${types.join(', ')}`], e.currentTarget);
  }

  function handleTargetMobRemove(e) {
    e.stopPropagation();
    hideTooltip();
    setTargetMob(null);
  }

  // One small helper covers both gear columns — same slot cell shape
  // (icon + bottom label + remove button when equipped), just a
  // different slot list/label map/picker route per column.
  function renderGearSlot(key, slot, label, pickerPath) {
    const equipped = loadout[slot];
    return (
      <div
        key={key}
        className={`${slotBase} relative cursor-pointer hover:brightness-110 ${equipped ? 'bg-green-400' : ''}`}
        onClick={() => handleGearClick(slot, pickerPath)}
        onMouseEnter={(e) => handleGearHover(slot, label, e)}
        onMouseLeave={invalidateHover}
      >
        {equipped ? (
          <WeaponIcon id={equipped.item.id} material={equipped.item.material} alt={equipped.item.name} className={iconImg} />
        ) : (
          <img src={SLOT_TEXTURES.emptyGemSlot} alt="" className={slotFillImg} />
        )}
        {equipped && (
          <span
            className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center text-[10px] leading-none bg-neutral-900 outline outline-1 outline-black hover:brightness-125 cursor-pointer"
            title={`Remove ${label}`}
            onClick={(e) => handleGearRemove(slot, e)}
          >
            🗑️
          </span>
        )}
        <span className="absolute bottom-0.5 left-0 right-0 text-center text-[9px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
          {label}
        </span>
      </div>
    );
  }

  const cells = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 9; col++) {
      const key = `${row}-${col}`;

      // Column B (index 1): the 4 equipment slots, rows 2-5 (index 1-4).
      if (col === 1 && row >= 1 && row <= 4) {
        const slot = EQUIPMENT_SLOTS[row - 1];
        cells.push(renderGearSlot(key, slot, EQUIPMENT_SLOT_LABELS[slot], `/equipment/${slot}`));
        continue;
      }

      // Column C (index 2): the 4 armor slots, rows 2-5 (index 1-4).
      if (col === 2 && row >= 1 && row <= 4) {
        const slot = ARMOR_SLOTS[row - 1];
        cells.push(renderGearSlot(key, slot, ARMOR_SLOT_LABELS[slot], `/armor/${slot}`));
        continue;
      }

      // Column D (index 3), row 1: Player Levels (Combat/Skyblock/
      // Foraging) — directly above Accessories. Shows the Skyblock Level
      // number colored by its real in-game level-color bracket (see
      // lib/playerStats.js's getSkyblockLevelColor); click opens the
      // small edit page for all three levels.
      if (col === 3 && row === 1) {
        cells.push(
          <div
            key={key}
            className={`${slotBase} relative cursor-pointer hover:brightness-110`}
            onClick={() => navigate('/player-levels')}
            title="Player Levels"
          >
            <span
              className="text-sm font-bold leading-none whitespace-nowrap drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]"
              style={{ color: getSkyblockLevelColor(playerStats.skyblockLevel) }}
            >
              [{playerStats.skyblockLevel}]
            </span>
            <span className="absolute bottom-0.5 left-0 right-0 text-center text-[9px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] whitespace-nowrap">
              Levels
            </span>
          </div>,
        );
        continue;
      }

      // Column D (index 3): Accessories directly above the weapon (row 3,
      // index 2), weapon at row 4 (index 3), pet at row 5 (index 4).
      if (col === 3 && row === 2) {
        cells.push(
          <div
            key={key}
            className={`${slotBase} relative cursor-pointer hover:brightness-110 ${loadout.accessory ? 'bg-green-400' : ''}`}
            onClick={() => navigate('/accessory')}
            onMouseEnter={handleAccessoryHover}
            onMouseLeave={invalidateHover}
          >
            {loadout.accessory ? (
              <WeaponIcon
                id={loadout.accessory.item.iconId}
                material={loadout.accessory.item.material}
                alt={loadout.accessory.item.name}
                className={iconImg}
              />
            ) : (
              <img src={SLOT_TEXTURES.emptyGemSlot} alt="" className={slotFillImg} />
            )}
            {loadout.accessory && (
              <span
                className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center text-[10px] leading-none bg-neutral-900 outline outline-1 outline-black hover:brightness-125 cursor-pointer"
                title="Remove Accessories"
                onClick={(e) => handleGearRemove('accessory', e)}
              >
                🗑️
              </span>
            )}
            <span className="absolute bottom-0.5 left-0 right-0 text-center text-[9px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
              Accessories
            </span>
          </div>,
        );
        continue;
      }

      if (col === 3 && row === 3) {
        cells.push(
          <div
            key={key}
            className={`${slotBase} relative cursor-pointer hover:brightness-110 ${loadout.weapon ? 'bg-green-400' : ''}`}
            onClick={handleWeaponClick}
            onMouseEnter={handleWeaponHover}
            onMouseLeave={invalidateHover}
          >
            {loadout.weapon ? (
              <WeaponIcon
                id={loadout.weapon.item.id}
                material={loadout.weapon.item.material}
                alt={loadout.weapon.item.name}
                className={iconImg}
              />
            ) : (
              <img src={SLOT_TEXTURES.emptyGemSlot} alt="" className={slotFillImg} />
            )}
            {loadout.weapon && (
              <span
                className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center text-[10px] leading-none bg-neutral-900 outline outline-1 outline-black hover:brightness-125 cursor-pointer"
                title="Remove Weapon"
                onClick={(e) => handleGearRemove('weapon', e)}
              >
                🗑️
              </span>
            )}
            <span className="absolute bottom-0.5 left-0 right-0 text-center text-[9px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
              Weapon
            </span>
          </div>,
        );
        continue;
      }
      if (col === 3 && row === 4) {
        cells.push(
          <div
            key={key}
            className={`${slotBase} relative cursor-pointer hover:brightness-110 ${loadout.pet ? 'bg-green-400' : ''}`}
            onClick={() => navigate('/pet')}
            onMouseEnter={handlePetHover}
            onMouseLeave={invalidateHover}
          >
            {loadout.pet ? (
              <WeaponIcon id={loadout.pet.item.petId} material="BONE" alt={loadout.pet.item.name} className={iconImg} />
            ) : (
              <img src={SLOT_TEXTURES.emptyGemSlot} alt="" className={slotFillImg} />
            )}
            {loadout.pet && (
              <span
                className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center text-[10px] leading-none bg-neutral-900 outline outline-1 outline-black hover:brightness-125 cursor-pointer"
                title="Remove Pet"
                onClick={(e) => handleGearRemove('pet', e)}
              >
                🗑️
              </span>
            )}
            <span className="absolute bottom-0.5 left-0 right-0 text-center text-[9px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
              Pet
            </span>
          </div>,
        );
        continue;
      }

      // Column F (index 5), row 1: Target Mob — the mob Final Damage
      // (see lib/finalDamage.js) is computed against, picked from the
      // wiki-scraped roster in lib/mobTypes.js. Takes over the first cell
      // of the otherwise-decorative mob-head filler block below; no icon
      // assets exist for named mobs so this is a plain colored-text tile
      // like the Skyblock Level slot, not an image.
      if (col === 5 && row === 1) {
        cells.push(
          <div
            key={key}
            className={`${slotBase} relative cursor-pointer hover:brightness-110 pb-2.5`}
            onClick={() => navigate('/target-mob')}
            onMouseEnter={handleTargetMobHover}
            onMouseLeave={invalidateHover}
          >
            <span className="text-[9px] font-bold text-white text-center px-1 truncate max-w-full drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
              {targetMob || 'Select Mob'}
            </span>
            {targetMob && (
              <span
                className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center text-[10px] leading-none bg-neutral-900 outline outline-1 outline-black hover:brightness-125 cursor-pointer"
                title="Remove Target Mob"
                onClick={handleTargetMobRemove}
              >
                🗑️
              </span>
            )}
            <span className="absolute bottom-0.5 left-0 right-0 text-center text-[9px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] whitespace-nowrap">
              Target
            </span>
          </div>,
        );
        continue;
      }

      // Columns F/G/H (index 5-7): purely decorative mob-head filler,
      // rows 2-5 (index 1-4) — no click/hover behavior.
      if (col >= 5 && col <= 7 && row >= 1 && row <= 4) {
        cells.push(
          <div key={key} className={slotBase}>
            <img src="/images/skyblock/ZOMBIE.png" alt="" className={iconImg} />
          </div>,
        );
        continue;
      }

      // Top-left corner (row 0, col 0): Attributes (see lib/attributes.js)
      // — account-wide, not tied to any equipped item, so this is a plain
      // text tile like Target Mob/Skyblock Level rather than an icon slot.
      if (col === 0 && row === 0) {
        const leveledCount = Object.values(attributes).filter((v) => v > 0).length;
        cells.push(
          <div
            key={key}
            className={`${slotBase} relative cursor-pointer hover:brightness-110 ${leveledCount > 0 ? 'bg-green-400' : ''}`}
            onClick={() => navigate('/attributes')}
            onMouseEnter={(e) =>
              showTooltip(
                leveledCount > 0
                  ? [`§d§lAttributes`, `§7${leveledCount} attribute${leveledCount === 1 ? '' : 's'} leveled`]
                  : ['§7Attributes', '§8None leveled — click to edit'],
                e.currentTarget,
              )
            }
            onMouseLeave={hideTooltip}
          >
            <span className="text-[9px] font-bold text-white text-center px-1 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
              Attributes
            </span>
          </div>,
        );
        continue;
      }

      // Bottom-left (row 5, col 0): God Potion — a plain on/off toggle,
      // not a picker (see lib/godPotion.js), so clicking it flips state
      // in place rather than navigating anywhere.
      if (col === 0 && row === 5) {
        cells.push(
          <div
            key={key}
            className={`${slotBase} relative cursor-pointer hover:brightness-110 ${godPotionActive ? 'bg-green-400' : ''}`}
            onClick={toggleGodPotion}
            onMouseEnter={(e) => showTooltip(GOD_POTION_TOOLTIP_LINES, e.currentTarget)}
            onMouseLeave={hideTooltip}
          >
            <WeaponIcon id="GOD_POTION" material="POTION" alt="God Potion" className={`${iconImg} ${godPotionActive ? '' : 'opacity-50 grayscale'}`} />
          </div>,
        );
        continue;
      }

      cells.push(
        <div key={key} className={slotBase}>
          <img src={SLOT_TEXTURES.empty} alt="" className={slotFillImg} />
        </div>,
      );
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <header className="w-full max-w-[700px] mb-4 text-center">
        <h1 className="text-3xl font-bold"></h1>
      </header>

      <div className="w-full max-w-[700px] overflow-x-auto">
        <div className="grid grid-cols-9 grid-rows-6 gap-[3px] w-full min-w-[380px] aspect-[9/6] bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black p-2">
          {cells}
        </div>
      </div>

      {/* Deliberately small/muted, not a second focal element next to the
          grid — see lib/damageSources.js for what it aggregates. */}
      <button
        className="mt-2 text-[11px] text-neutral-400 hover:text-neutral-200 cursor-pointer underline"
        onClick={() => navigate('/damage-sources')}
      >
        📊 Damage Sources
      </button>
    </div>
  );
}

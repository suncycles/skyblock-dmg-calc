import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useItemData } from '../context/ItemDataContext';
import { useTooltip } from '../context/TooltipContext';
import { ARMOR_SLOTS, ARMOR_SLOT_LABELS } from '../lib/armorSlots';
import { EQUIPMENT_SLOTS, EQUIPMENT_SLOT_LABELS } from '../lib/equipmentSlots';
import { formatItemName, rarityColorCode } from '../lib/mcText';
import { buildFullItemTooltipLines } from '../lib/itemTooltip';
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
  const { loadout, removeSlot } = useBuild();
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
    const lines = await buildFullItemTooltipLines(equipped.item, equipped.modifiers, itemData);
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
    const lines = await buildFullItemTooltipLines(loadout.weapon.item, loadout.weapon.modifiers, itemData);
    if (hoverTokenRef.current === token) showTooltip(lines, anchor);
  }

  function handlePetHover(e) {
    if (!loadout.pet) {
      showTooltip(['§7Pet', '§8Empty — click to pick one'], e.currentTarget);
      return;
    }
    const { item, modifiers } = loadout.pet;
    showTooltip([`§${rarityColorCode(item.tier)}${formatItemName(item.name)}`, `§7Level ${modifiers.level}`], e.currentTarget);
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

      // Column D (index 3): weapon at row 4 (index 3), pet at row 5 (index 4).
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
            onMouseLeave={hideTooltip}
          >
            {loadout.pet ? (
              <WeaponIcon id={loadout.pet.item.petId} material="BONE" alt={loadout.pet.item.name} className={iconImg} />
            ) : (
              <img src={SLOT_TEXTURES.emptyGemSlot} alt="" className={slotFillImg} />
            )}
            <span className="absolute bottom-0.5 left-0 right-0 text-center text-[9px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
              Pet
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
        <h1 className="text-3xl font-bold">The Hex</h1>
      </header>

      <div className="w-full max-w-[700px] overflow-x-auto">
        <div className="grid grid-cols-9 grid-rows-6 gap-[3px] w-full min-w-[380px] aspect-[9/6] bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black p-2">
          {cells}
        </div>
      </div>
    </div>
  );
}

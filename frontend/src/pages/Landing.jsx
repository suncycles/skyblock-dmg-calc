import { useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useItemData } from '../context/ItemDataContext';
import { useTooltip } from '../context/TooltipContext';
import { ARMOR_SLOTS, ARMOR_SLOT_LABELS } from '../lib/armorSlots';
import { formatItemName, rarityColorCode } from '../lib/mcText';
import { buildFullItemTooltipLines } from '../lib/itemTooltip';
import { SLOT_TEXTURES } from '../lib/icons';
import WeaponIcon from '../components/WeaponIcon';

const slotBase =
  'flex items-center justify-center bg-[#8b8b8b] shadow-[inset_2px_2px_0_0_#373737,inset_-2px_-2px_0_0_#ffffff]';
const iconImg = 'w-[70%] h-[70%] object-contain pixelated';
const slotFillImg = 'w-full h-full object-cover pixelated';

// Real Hypixel SkyBlock equipment slots (Necklace/Cloak/Belt/Gloves) — no
// NEU-REPO data or picker built for these yet, so they're a visual-only
// placeholder column: they render and label like a real slot but aren't
// clickable, same treatment Hex.jsx gives a not-yet-wired-up category icon
// (dim + "not implemented" rather than pretending to work).
const EQUIPMENT_LABELS = ['Necklace', 'Cloak', 'Belt', 'Gloves'];

// One-page character screen: 6 rows x 9 columns, real chest-GUI styling.
// Column B: the 4 (placeholder) equipment slots. Column C: the 4 armor
// slots (was ArmorSlotPicker's own page — folded in here). Column D:
// weapon (row 4) and pet (row 5). Columns F/G/H: decorative mob-head
// filler with no function, purely to balance out the grid. Everything
// else is an inert dark-grey glass pane, same "empty" texture used
// elsewhere in the app.
export default function Landing() {
  const navigate = useNavigate();
  const { loadout, removeSlot } = useBuild();
  const { itemData } = useItemData();
  const { showTooltip, hideTooltip } = useTooltip();

  function handleArmorClick(slot) {
    navigate(loadout[slot] ? `/hex/${slot}` : `/armor/${slot}`);
  }

  function handleArmorHover(slot, e) {
    const equipped = loadout[slot];
    if (!equipped) {
      showTooltip([`§7${ARMOR_SLOT_LABELS[slot]}`, '§8Empty — click to pick one'], e.currentTarget);
      return;
    }
    showTooltip(buildFullItemTooltipLines(equipped.item, equipped.modifiers, itemData), e.currentTarget);
  }

  function handleArmorRemove(slot, e) {
    e.stopPropagation();
    hideTooltip();
    removeSlot(slot);
  }

  function handleWeaponClick() {
    navigate(loadout.weapon ? '/hex/weapon' : '/weapon');
  }

  function handleWeaponHover(e) {
    if (!loadout.weapon) {
      showTooltip(['§7Weapon', '§8Empty — click to pick one'], e.currentTarget);
      return;
    }
    showTooltip(buildFullItemTooltipLines(loadout.weapon.item, loadout.weapon.modifiers, itemData), e.currentTarget);
  }

  function handlePetHover(e) {
    if (!loadout.pet) {
      showTooltip(['§7Pet', '§8Empty — click to pick one'], e.currentTarget);
      return;
    }
    const { item, modifiers } = loadout.pet;
    showTooltip([`§${rarityColorCode(item.tier)}${formatItemName(item.name)}`, `§7Level ${modifiers.level}`], e.currentTarget);
  }

  const cells = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 9; col++) {
      const key = `${row}-${col}`;

      // Column B (index 1): equipment placeholders, rows 2-5 (index 1-4).
      if (col === 1 && row >= 1 && row <= 4) {
        const label = EQUIPMENT_LABELS[row - 1];
        cells.push(
          <div key={key} className={`${slotBase} relative opacity-50`} title={`${label} — not yet available`}>
            <img src={SLOT_TEXTURES.emptyGemSlot} alt="" className={slotFillImg} />
            <span className="absolute bottom-0.5 left-0 right-0 text-center text-[9px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
              {label}
            </span>
          </div>,
        );
        continue;
      }

      // Column C (index 2): the 4 armor slots, rows 2-5 (index 1-4).
      if (col === 2 && row >= 1 && row <= 4) {
        const slot = ARMOR_SLOTS[row - 1];
        const equipped = loadout[slot];
        cells.push(
          <div
            key={key}
            className={`${slotBase} relative cursor-pointer hover:brightness-110 ${equipped ? 'bg-green-400' : ''}`}
            onClick={() => handleArmorClick(slot)}
            onMouseEnter={(e) => handleArmorHover(slot, e)}
            onMouseLeave={hideTooltip}
          >
            {equipped ? (
              <WeaponIcon id={equipped.item.id} material={equipped.item.material} alt={equipped.item.name} className={iconImg} />
            ) : (
              <img src={SLOT_TEXTURES.emptyGemSlot} alt="" className={slotFillImg} />
            )}
            {equipped && (
              <span
                className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center text-[10px] leading-none bg-neutral-900 outline outline-1 outline-black hover:brightness-125 cursor-pointer"
                title={`Remove ${ARMOR_SLOT_LABELS[slot]}`}
                onClick={(e) => handleArmorRemove(slot, e)}
              >
                🗑️
              </span>
            )}
            <span className="absolute bottom-0.5 left-0 right-0 text-center text-[9px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
              {ARMOR_SLOT_LABELS[slot]}
            </span>
          </div>,
        );
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
            onMouseLeave={hideTooltip}
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

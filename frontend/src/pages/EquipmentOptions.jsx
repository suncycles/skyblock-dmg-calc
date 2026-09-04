import { useBuild } from '../context/BuildContext';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { EQUIPMENT_SLOTS } from '../lib/equipmentSlots';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

// Popup bubble opened from the tile above the Necklace slot on Landing. Same two conveniences as
// ArmorOptions.jsx, scoped to the 4 equipment slots (Necklace/Cloak/Belt/Gloves) instead.
export default function EquipmentOptions({ onClose }) {
  const { loadout, clearEquipment, editAllEquipment, toggleEditAllEquipment } = useBuild();
  const { confirmDialog } = useConfirmDialog();
  const equippedCount = EQUIPMENT_SLOTS.filter((slot) => loadout[slot]).length;

  async function handleClearAll() {
    if (equippedCount === 0) return;
    if (!(await confirmDialog(`Remove all ${equippedCount} equipped equipment piece${equippedCount === 1 ? '' : 's'}?`))) return;
    clearEquipment();
  }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className={`${panel} opaque-panel w-full max-w-[420px] p-4 flex flex-col gap-3`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-black">Equipment Options</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center text-black font-bold hover:brightness-110 cursor-pointer"
            title="Close"
          >
            ✕
          </button>
        </div>

        <button
          type="button"
          onClick={handleClearAll}
          disabled={equippedCount === 0}
          className={`${panel} px-4 py-3 text-left flex items-center gap-3 text-sm font-bold text-black transition-[filter] ${
            equippedCount === 0 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:brightness-110'
          }`}
        >
          <span className="text-xl leading-none">✕</span>
          <span className="flex flex-col">
            <span>Clear All Equipment</span>
            <span className="text-[11px] font-normal text-neutral-700">
              {equippedCount === 0 ? 'No equipment equipped' : `Removes all ${equippedCount} equipped piece${equippedCount === 1 ? '' : 's'}`}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={toggleEditAllEquipment}
          className={`${panel} px-4 py-3 text-left flex items-center gap-3 text-sm font-bold text-black cursor-pointer transition-[filter] ${
            editAllEquipment ? 'hover:brightness-110' : 'brightness-50'
          }`}
        >
          <span className="text-xl leading-none">{editAllEquipment ? '☑' : '☐'}</span>
          <span className="flex flex-col">
            <span>Edit All Mode {editAllEquipment ? '(On)' : '(Off)'}</span>
            <span className="text-[11px] font-normal text-neutral-700">
              While on, a Hex edit to one equipment piece (enchant, gemstone, reforge, stars, special, recomb, Clean) applies to all
              equipped equipment pieces.
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}

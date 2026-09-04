import { useBuild } from '../context/BuildContext';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { ARMOR_SLOTS } from '../lib/armorSlots';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

// Popup bubble opened from the tile above the Helmet slot on Landing (user-specified: a popup, not
// a separate routed page). Two account-wide armor conveniences — clearing every piece at once
// (and wiping their lastGearModifiers stash so a later re-pick starts clean, not restoring old
// reforge/stars/gemstones — see BuildContext.jsx's clearGroup), and an "Edit All" mode that
// broadcasts a Hex modifier edit (enchant/gemstone/reforge/stars/special/recomb/Clean) made to one
// armor piece onto the other 3 equipped pieces (see BuildContext.jsx's
// updateSlotModifiers/setStarCount/toggleRecombobulated).
export default function ArmorOptions({ onClose }) {
  const { loadout, clearArmor, editAllArmor, toggleEditAllArmor } = useBuild();
  const { confirmDialog } = useConfirmDialog();
  const equippedCount = ARMOR_SLOTS.filter((slot) => loadout[slot]).length;

  async function handleClearAll() {
    if (equippedCount === 0) return;
    if (!(await confirmDialog(`Remove all ${equippedCount} equipped armor piece${equippedCount === 1 ? '' : 's'}?`))) return;
    clearArmor();
  }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className={`${panel} opaque-panel w-full max-w-[420px] p-4 flex flex-col gap-3`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-black">Armor Options</h2>
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
            <span>Clear All Armor</span>
            <span className="text-[11px] font-normal text-neutral-700">
              {equippedCount === 0 ? 'No armor equipped' : `Removes all ${equippedCount} equipped piece${equippedCount === 1 ? '' : 's'}`}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={toggleEditAllArmor}
          className={`${panel} px-4 py-3 text-left flex items-center gap-3 text-sm font-bold text-black cursor-pointer transition-[filter] ${
            editAllArmor ? 'hover:brightness-110' : 'brightness-50'
          }`}
        >
          <span className="text-xl leading-none">{editAllArmor ? '☑' : '☐'}</span>
          <span className="flex flex-col">
            <span>Edit All Mode {editAllArmor ? '(On)' : '(Off)'}</span>
            <span className="text-[11px] font-normal text-neutral-700">
              While on, a Hex edit to one armor piece (enchant, gemstone, reforge, stars, special, recomb, Clean) applies to all equipped
              armor pieces.
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}

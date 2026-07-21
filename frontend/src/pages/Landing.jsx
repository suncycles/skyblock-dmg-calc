import { useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { ARMOR_SLOTS } from '../lib/armorSlots';
import { formatItemName } from '../lib/mcText';

const tile =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black p-8 flex-1 flex flex-col items-center gap-2 cursor-pointer hover:brightness-105 text-black';

// Entry screen: choose whether to work on the weapon or the 4 armor
// slots. Each tile shows a one-line status caption pulled straight from
// the persisted loadout so returning users can see what's already picked
// without navigating further in.
export default function Landing() {
  const navigate = useNavigate();
  const { loadout } = useBuild();

  const weaponCaption = loadout.weapon ? formatItemName(loadout.weapon.item.name) : 'No weapon selected';
  const armorCount = ARMOR_SLOTS.filter((slot) => loadout[slot]).length;
  const armorCaption = `${armorCount}/4 armor pieces equipped`;
  const petCaption = loadout.pet
    ? `${formatItemName(loadout.pet.item.name)} — Lvl ${loadout.pet.modifiers.level}`
    : 'No pet selected';

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <header className="w-full max-w-[700px] mb-8 text-center">
        <h1 className="text-3xl font-bold">The Hex</h1>
      </header>

      <div className="w-full max-w-[700px] flex gap-4">
        <div className={tile} onClick={() => navigate('/weapon')}>
          <div className="text-lg font-bold">⚔️ Pick Weapon</div>
          <div className="text-xs text-neutral-700">{weaponCaption}</div>
        </div>
        <div className={tile} onClick={() => navigate('/armor')}>
          <div className="text-lg font-bold">🛡️ Pick Armor</div>
          <div className="text-xs text-neutral-700">{armorCaption}</div>
        </div>
        <div className={tile} onClick={() => navigate('/pet')}>
          <div className="text-lg font-bold">🐾 Pick Pet</div>
          <div className="text-xs text-neutral-700">{petCaption}</div>
        </div>
      </div>
    </div>
  );
}

import { useNavigate, useParams } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { getSpecialConfig, computeSpecialBonus, crownOfAvariceStats } from '../lib/specialWeapons';
import { formatItemName } from '../lib/mcText';
import { SLOT_TEXTURES } from '../lib/icons';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

// Weapon-specific ability mechanics (Daedalus Blade, Midas' Sword/Staff,
// Emerald Blade — see lib/specialWeapons.js) each take a single free-form
// number rather than a pick from a fixed list, so unlike every other Hex
// sub-screen this isn't a slot grid — just a labeled number input with a
// live bonus preview, saved on every change (same instant-apply feel as
// Books/Modifiers).
export default function SpecialPicker() {
  const { slot } = useParams();
  const navigate = useNavigate();
  const { loadout, setSpecialValue } = useBuild();
  const weapon = loadout[slot] && loadout[slot].item;
  const config = weapon ? getSpecialConfig(weapon.id) : null;
  const value = (loadout[slot] && loadout[slot].modifiers && loadout[slot].modifiers.special) || 0;

  if (!weapon || !config) {
    return (
      <div className="min-h-screen flex flex-col items-center p-4">
        <header className="w-full max-w-[700px] mb-4">
          <h1 className="text-xl font-bold">The Hex — Special</h1>
        </header>
        <div className="w-full max-w-[700px] text-[13px] text-neutral-300 mb-2.5">
          This weapon has no special ability mechanic.
        </div>
        <button
          className={`${panel} px-4 py-2 cursor-pointer hover:brightness-110 flex items-center gap-2`}
          onClick={() => navigate(-1)}
        >
          <img src={SLOT_TEXTURES.close} alt="Back" className="w-5 h-5" />
          Back
        </button>
      </div>
    );
  }

  function handleChange(e) {
    const num = Math.max(0, Number(e.target.value) || 0);
    setSpecialValue(slot, num);
  }

  const bonus = computeSpecialBonus(config, value);
  const bonusText =
    config.kind === 'bestiary'
      ? `Grants +${bonus}% Damage on Mythological mobs`
      : config.kind === 'emeraldBlade'
        ? `Current Damage Bonus: +${bonus}`
        : config.kind === 'midasStaff'
          ? `Current Ability Damage Bonus: +${bonus}`
          : config.kind === 'crownOfAvarice'
            ? (() => {
                const { magicFind, damageMultiplier } = crownOfAvariceStats(config, bonus);
                return `${bonus} digit${bonus === 1 ? '' : 's'} — +${damageMultiplier}x Damage, +${magicFind} Magic Find vs Mythological mobs`;
              })()
            : `Current Damage and Strength Bonus: +${bonus}`;

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <header className="w-full max-w-[700px] mb-4">
        <h1 className="text-xl font-bold">The Hex — {formatItemName(weapon.name)}</h1>
      </header>

      <div className={`${panel} w-full max-w-[500px] p-6 flex flex-col gap-4`}>
        <label className="text-sm font-bold text-black" htmlFor="special-value">
          {config.inputLabel}
        </label>
        <input
          id="special-value"
          type="number"
          min="0"
          step="1"
          value={value}
          onChange={handleChange}
          className="px-3 py-2 bg-black text-white border-2 border-neutral-700"
        />
        <div className="text-sm text-neutral-800">{bonusText}</div>
        <button
          className="self-start px-4 py-2 bg-neutral-800 text-white cursor-pointer hover:brightness-110"
          onClick={() => navigate(-1)}
        >
          Back
        </button>
      </div>
    </div>
  );
}

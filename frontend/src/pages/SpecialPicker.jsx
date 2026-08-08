import { useNavigate, useParams } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { getSpecialConfig, computeSpecialBonus, crownOfAvariceStats } from '../lib/specialWeapons';
import { parseShorthandNumber } from '../lib/numberInput';
import { formatItemName } from '../lib/mcText';
import { SLOT_TEXTURES } from '../lib/icons';
import { Keyworded } from '../lib/damageFormat';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

// Weapon-specific ability mechanics each take a single free-form number, so unlike other Hex sub-screens this is a labeled input with a live bonus preview, saved on every change.
export default function SpecialPicker() {
  const { slot } = useParams();
  const navigate = useNavigate();
  const { loadout, setSpecialValue, setRarityOverride } = useBuild();
  const weapon = loadout[slot] && loadout[slot].item;
  const config = weapon ? getSpecialConfig(weapon.id) : null;
  const value = (loadout[slot] && loadout[slot].modifiers && loadout[slot].modifiers.special) || 0;
  const rarityOverride = (loadout[slot] && loadout[slot].modifiers && loadout[slot].modifiers.rarityOverride) || '';

  if (!weapon || !config) {
    return (
      <div className="min-h-screen flex flex-col items-center p-4 relative">
        <header className="w-full max-w-[700px] mb-4">
          <h1 className="text-xl font-bold">Special</h1>
        </header>
        <div className="w-full max-w-[700px] text-[13px] text-neutral-300 mb-2.5">
          This weapon has no special ability mechanic.
        </div>
        <button
          className={`${panel} px-4 py-2 cursor-pointer hover:brightness-110 flex items-center gap-2 text-sm font-bold text-black`}
          onClick={() => navigate(-1)}
        >
          <img src={SLOT_TEXTURES.close} alt="Back" className="w-5 h-5" />
          Back
        </button>
      </div>
    );
  }

  function handleChange(e) {
    let num = Math.max(0, parseShorthandNumber(e.target.value));
    if (config.max != null) num = Math.min(num, config.max);
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
            : config.kind === 'flatStrength'
              ? `+${bonus} Strength (max ${config.max})`
              : `Current Damage and Strength Bonus: +${bonus}`;

  return (
    <div className="min-h-screen flex flex-col items-center p-4 relative">
      <header className="w-full max-w-[700px] mb-4">
        <h1 className="text-xl font-bold">{formatItemName(weapon.name)}</h1>
      </header>

      <div className={`${panel} w-full max-w-[500px] p-6 flex flex-col gap-4`}>
        <label className="text-sm font-bold text-black" htmlFor="special-value">
          {config.inputLabel}
        </label>
        <input
          id="special-value"
          type="text"
          inputMode="decimal"
          value={value || ''}
          onChange={handleChange}
          placeholder="e.g. 25m"
          className="px-3 py-2 bg-black text-white border-2 border-neutral-700"
        />
        <div className="text-sm text-neutral-800">
          <Keyworded text={bonusText} />
        </div>

        {config.rarities && (
          <div className="flex flex-col gap-1 border-t border-neutral-500 pt-3">
            <label className="text-sm font-bold text-black" htmlFor="special-rarity">
              Item Rarity
            </label>
            <select
              id="special-rarity"
              value={rarityOverride}
              onChange={(e) => setRarityOverride(slot, e.target.value || null)}
              className="px-3 py-2 bg-black text-white border-2 border-neutral-700"
            >
              <option value="">Default ({weapon.tier[0]}{weapon.tier.slice(1).toLowerCase()})</option>
              {config.rarities.map((tier) => (
                <option key={tier} value={tier}>
                  {tier[0]}{tier.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
            <div className="text-xs text-neutral-600 italic">
              This item's real rarity upgrades over time (Hunting milestones) rather than from a Recombobulator — pick the tier it's actually at.
            </div>
          </div>
        )}

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

import { useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { MAX_COMBAT_LEVEL, MAX_FORAGING_LEVEL, MAX_CATACOMBS_LEVEL, MAX_TAMING_LEVEL, MAX_WOLF_SLAYER_LEVEL } from '../lib/playerStats';
import { MAX_GENERALS_MEDALLION_DIGITS } from '../lib/dungeonize';
import { SLOT_TEXTURES } from '../lib/icons';
import NumberInput from '../components/NumberInput';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

const inputClass = 'w-20 px-2 py-1 text-sm bg-black text-white border-2 border-neutral-700 text-center';

// Combat/Skyblock/Foraging/Catacombs/Taming Level, grouped on one small edit page. Foraging feeds a
// flat Strength bonus; Catacombs feeds Ancient reforge/Wither blade per-level bonuses; Taming feeds
// Daedalus Blade's per-level base stat.
export default function PlayerLevels() {
  const navigate = useNavigate();
  const {
    playerStats,
    setCombatLevel,
    setSkyblockLevel,
    setForagingLevel,
    setCatacombsLevel,
    setTamingLevel,
    setWolfSlayerLevel,
    setGeneralsMedallionDigits,
  } = useBuild();

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <header className="w-full max-w-[700px] mb-4 flex items-center gap-3">
        <button
          className="text-sm px-3 py-1.5 cursor-pointer bg-neutral-800 text-white hover:brightness-110"
          onClick={() => navigate('/')}
        >
          <img src={SLOT_TEXTURES.close} alt="" className="w-4 h-4 inline-block mr-1 align-[-2px]" />
          Back
        </button>
        <h1 className="text-xl font-bold">SkyDmg — Player Levels</h1>
      </header>

      <div className={`${panel} w-full max-w-[500px] p-6 flex flex-col gap-4`}>
        <div className="flex items-center justify-between gap-2">
          <label className="text-sm text-black" htmlFor="combat-level">
            Combat Level
          </label>
          <NumberInput id="combat-level" max={MAX_COMBAT_LEVEL} value={playerStats.combatLevel} onChange={setCombatLevel} className={inputClass} />
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="text-sm text-black" htmlFor="skyblock-level">
            Skyblock Level
          </label>
          <NumberInput id="skyblock-level" value={playerStats.skyblockLevel} onChange={setSkyblockLevel} className={inputClass} />
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="text-sm text-black" htmlFor="foraging-level">
            Foraging Level
          </label>
          <NumberInput
            id="foraging-level"
            max={MAX_FORAGING_LEVEL}
            value={playerStats.foragingLevel}
            onChange={setForagingLevel}
            className={inputClass}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="text-sm text-black" htmlFor="catacombs-level">
            Catacombs Level
          </label>
          <NumberInput
            id="catacombs-level"
            max={MAX_CATACOMBS_LEVEL}
            value={playerStats.catacombsLevel}
            onChange={setCatacombsLevel}
            className={inputClass}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="text-sm text-black" htmlFor="taming-level">
            Taming Level
          </label>
          <NumberInput id="taming-level" max={MAX_TAMING_LEVEL} value={playerStats.tamingLevel} onChange={setTamingLevel} className={inputClass} />
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="text-sm text-black" htmlFor="wolf-slayer-level">
            Wolf Slayer Level (Only used by Pooch Sword)
          </label>
          <NumberInput
            id="wolf-slayer-level"
            max={MAX_WOLF_SLAYER_LEVEL}
            value={playerStats.wolfSlayerLevel}
            onChange={setWolfSlayerLevel}
            className={inputClass}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="text-sm text-black" htmlFor="generals-medallion-digits">
            General's Medallion Digits (Dungeonize only)
          </label>
          <NumberInput
            id="generals-medallion-digits"
            max={MAX_GENERALS_MEDALLION_DIGITS}
            value={playerStats.generalsMedallionDigits}
            onChange={setGeneralsMedallionDigits}
            className={inputClass}
          />
        </div>

        <button
          className="self-start px-4 py-2 bg-neutral-800 text-white cursor-pointer hover:brightness-110"
          onClick={() => navigate('/')}
        >
          Back
        </button>
      </div>
    </div>
  );
}

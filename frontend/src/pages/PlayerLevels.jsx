import { useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { MAX_COMBAT_LEVEL, MAX_FORAGING_LEVEL, MAX_CATACOMBS_LEVEL, MAX_TAMING_LEVEL } from '../lib/playerStats';
import { SLOT_TEXTURES } from '../lib/icons';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

// Combat/Skyblock/Foraging/Catacombs/Taming Level — grouped on one small
// edit page behind the grid slot above Accessories (see Landing.jsx),
// same "click a slot, edit on its own page" pattern as Stat Tuning.
// Combat and Skyblock Level behave exactly as before (see
// lib/playerStats.js); Foraging Level only feeds a flat Strength bonus
// into Damage Sources' (base) Stats. Catacombs Level feeds the Ancient
// reforge's real +1 Crit Damage-per-level bonus (lib/reforges.js) and
// the Wither blades' own per-level base stats (lib/witherBladeBonuses.js)
// — its separate overall stat-multiplier scaling is deliberately
// unimplemented, see the comment above lib/playerStats.js's file-level
// note on it. Taming Level feeds Daedalus Blade's +4/+5 Damage-per-level
// base stat (lib/specialWeapons.js). None of these five have a slot of
// their own to click through to.
export default function PlayerLevels() {
  const navigate = useNavigate();
  const { playerStats, setCombatLevel, setSkyblockLevel, setForagingLevel, setCatacombsLevel, setTamingLevel } = useBuild();

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
        <h1 className="text-xl font-bold">The Hex — Player Levels</h1>
      </header>

      <div className={`${panel} w-full max-w-[500px] p-6 flex flex-col gap-4`}>
        <div className="flex items-center justify-between gap-2">
          <label className="text-sm text-black" htmlFor="combat-level">
            Combat Level
          </label>
          <input
            id="combat-level"
            type="number"
            min="0"
            max={MAX_COMBAT_LEVEL}
            step="1"
            value={playerStats.combatLevel}
            onChange={(e) => setCombatLevel(Math.max(0, Math.min(MAX_COMBAT_LEVEL, Math.floor(Number(e.target.value) || 0))))}
            className="w-20 px-2 py-1 text-sm bg-black text-white border-2 border-neutral-700 text-center"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="text-sm text-black" htmlFor="skyblock-level">
            Skyblock Level
          </label>
          <input
            id="skyblock-level"
            type="number"
            min="0"
            step="1"
            value={playerStats.skyblockLevel}
            onChange={(e) => setSkyblockLevel(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            className="w-20 px-2 py-1 text-sm bg-black text-white border-2 border-neutral-700 text-center"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="text-sm text-black" htmlFor="foraging-level">
            Foraging Level
          </label>
          <input
            id="foraging-level"
            type="number"
            min="0"
            max={MAX_FORAGING_LEVEL}
            step="1"
            value={playerStats.foragingLevel}
            onChange={(e) => setForagingLevel(Math.max(0, Math.min(MAX_FORAGING_LEVEL, Math.floor(Number(e.target.value) || 0))))}
            className="w-20 px-2 py-1 text-sm bg-black text-white border-2 border-neutral-700 text-center"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="text-sm text-black" htmlFor="catacombs-level">
            Catacombs Level
          </label>
          <input
            id="catacombs-level"
            type="number"
            min="0"
            max={MAX_CATACOMBS_LEVEL}
            step="1"
            value={playerStats.catacombsLevel}
            onChange={(e) =>
              setCatacombsLevel(Math.max(0, Math.min(MAX_CATACOMBS_LEVEL, Math.floor(Number(e.target.value) || 0))))
            }
            className="w-20 px-2 py-1 text-sm bg-black text-white border-2 border-neutral-700 text-center"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="text-sm text-black" htmlFor="taming-level">
            Taming Level
          </label>
          <input
            id="taming-level"
            type="number"
            min="0"
            max={MAX_TAMING_LEVEL}
            step="1"
            value={playerStats.tamingLevel}
            onChange={(e) => setTamingLevel(Math.max(0, Math.min(MAX_TAMING_LEVEL, Math.floor(Number(e.target.value) || 0))))}
            className="w-20 px-2 py-1 text-sm bg-black text-white border-2 border-neutral-700 text-center"
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

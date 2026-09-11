import { useBuild } from '../context/BuildContext';
import {
  MAX_COMBAT_LEVEL,
  MAX_FORAGING_LEVEL,
  MAX_CATACOMBS_LEVEL,
  MAX_TAMING_LEVEL,
  MAX_WOLF_SLAYER_LEVEL,
  MAX_TARANTULA_SLAYER_LEVEL,
  MAX_BLAZE_SLAYER_LEVEL,
  MAX_ALCHEMY_LEVEL,
  MAX_ENCHANTING_LEVEL,
} from '../lib/playerStats';
import { MAX_GENERALS_MEDALLION_DIGITS } from '../lib/dungeonize';
import { FLAT_STAT_PERKS, BANE_PERK, INFUSED_DRAGON_PERK, TWO_HEADED_STRIKE_PERK } from '../lib/essencePerks';
import { FORBIDDEN_BLESSING_MAX_LEVEL } from '../lib/dungeonBlessing';
import { MASTER_SKULL_MAX_TIER } from '../lib/masterSkull';
import NumberInput from '../components/NumberInput';
import PageHeader from '../components/PageHeader';

const translucentPanel =
  'bg-[#c6c6c6]/75 backdrop-blur-[1px] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

const inputClass = 'w-20 px-2 py-1 text-sm bg-black text-white border-2 border-neutral-700 text-center';

// Every permanent account upgrade bought with Essence, in the order the shops themselves read: the
// always-on Forbidden line, then the Catacombs line, then the three that aren't a flat stat.
// Normally filled by the Hypixel import, but typeable — a manually built loadout has no import, and
// these move the damage number as much as a skill level does, which is why they live on this page.
// `dungeonOnly` perks are marked rather than hidden: they're still real, just Catacombs-scoped.
const ESSENCE_PERKS = [...FLAT_STAT_PERKS, BANE_PERK, INFUSED_DRAGON_PERK, TWO_HEADED_STRIKE_PERK];

// Combat/Skyblock/Foraging/Catacombs/Taming Level, grouped on one small edit page. Foraging feeds a
// flat Strength bonus; Catacombs feeds Ancient reforge/Wither blade per-level bonuses; Taming feeds
// Daedalus Blade's per-level base stat.
export default function PlayerLevels() {
  const {
    playerStats,
    essencePerks,
    setEssencePerkLevel,
    blessing,
    setForbiddenBlessingLevel,
    setMasterSkullTier,
    setCombatLevel,
    setSkyblockLevel,
    setForagingLevel,
    setCatacombsLevel,
    setTamingLevel,
    setWolfSlayerLevel,
    setTarantulaSlayerLevel,
    setBlazeSlayerLevel,
    setAlchemyLevel,
    setEnchantingLevel,
    setGeneralsMedallionDigits,
    toggleBlazetekkHamRadio,
  } = useBuild();

  return (
    <div className="min-h-screen flex flex-col items-center p-4 relative">
      <PageHeader title="Player Levels" />

      <div className={`${translucentPanel} w-full max-w-[500px] p-6 flex flex-col gap-4`}>
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
          <label className="text-sm text-black" htmlFor="tarantula-slayer-level">
            Tarantula Slayer Level
          </label>
          <NumberInput
            id="tarantula-slayer-level"
            max={MAX_TARANTULA_SLAYER_LEVEL}
            value={playerStats.tarantulaSlayerLevel}
            onChange={setTarantulaSlayerLevel}
            className={inputClass}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="text-sm text-black" htmlFor="blaze-slayer-level">
            Blaze Slayer Level
          </label>
          <NumberInput
            id="blaze-slayer-level"
            max={MAX_BLAZE_SLAYER_LEVEL}
            value={playerStats.blazeSlayerLevel}
            onChange={setBlazeSlayerLevel}
            className={inputClass}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="text-sm text-black" htmlFor="alchemy-level">
            Alchemy Level
          </label>
          <NumberInput
            id="alchemy-level"
            max={MAX_ALCHEMY_LEVEL}
            value={playerStats.alchemyLevel}
            onChange={setAlchemyLevel}
            className={inputClass}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="text-sm text-black" htmlFor="enchanting-level">
            Enchanting Level
          </label>
          <NumberInput
            id="enchanting-level"
            max={MAX_ENCHANTING_LEVEL}
            value={playerStats.enchantingLevel}
            onChange={setEnchantingLevel}
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

        <div className="flex items-center justify-between gap-2">
          <label className="text-sm text-black" htmlFor="blazetekk-ham-radio">
            Blazetekk™ Ham Radio (owned)
          </label>
          <input
            id="blazetekk-ham-radio"
            type="checkbox"
            checked={playerStats.blazetekkHamRadio}
            onChange={toggleBlazetekkHamRadio}
            className="w-5 h-5 accent-black cursor-pointer"
          />
        </div>
      </div>

      <div className={`${translucentPanel} w-full max-w-[500px] p-6 mt-4 flex flex-col gap-4`}>
        <div>
          <h2 className="text-base font-bold text-black">Essence Shop</h2>
          <p className="text-xs text-neutral-700">
            Permanent upgrades bought with Essence. Filled in by a Hypixel import; edit them here if you build by hand.
          </p>
        </div>

        {ESSENCE_PERKS.map((perk) => (
          <div key={perk.key} className="flex items-center justify-between gap-2">
            <label className="text-sm text-black" htmlFor={`perk-${perk.key}`}>
              {perk.name}
              {perk.dungeonOnly && <span className="text-xs text-neutral-600"> (dungeon only)</span>}
            </label>
            <NumberInput
              id={`perk-${perk.key}`}
              max={perk.maxLevel}
              value={essencePerks[perk.key] || 0}
              onChange={(v) => setEssencePerkLevel(perk.key, v)}
              className={inputClass}
            />
          </div>
        ))}

        <div className="flex items-center justify-between gap-2">
          <label className="text-sm text-black" htmlFor="forbidden-blessing">
            Forbidden Blessing <span className="text-xs text-neutral-600">(dungeon blessing strength)</span>
          </label>
          <NumberInput
            id="forbidden-blessing"
            max={FORBIDDEN_BLESSING_MAX_LEVEL}
            value={blessing.forbiddenBlessingLevel}
            onChange={setForbiddenBlessingLevel}
            className={inputClass}
          />
        </div>

        {/* Not an Essence purchase, but the same shape of permanent account upgrade and the only
            other one with nowhere else to live — the Mimic shard, its old neighbour here, is an
            attribute and sits on the Attributes page under Other. */}
        <div className="flex items-center justify-between gap-2">
          <label className="text-sm text-black" htmlFor="master-skull-tier">
            Master Skull Tier <span className="text-xs text-neutral-600">(Strength multiplier)</span>
          </label>
          <NumberInput
            id="master-skull-tier"
            max={MASTER_SKULL_MAX_TIER}
            value={blessing.masterSkullTier}
            onChange={setMasterSkullTier}
            className={inputClass}
          />
        </div>
      </div>
    </div>
  );
}

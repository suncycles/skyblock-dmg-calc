import { useNavigate } from 'react-router-dom';
import { useItemData } from '../context/ItemDataContext';
import { useBuild } from '../context/BuildContext';
import { useTooltip } from '../context/TooltipContext';
import { rarityColorCode } from '../lib/mcText';
import WeaponIcon from '../components/WeaponIcon';

// 6 rows x 9 columns, matching the reference screenshot.
// type: "empty" | "filler" | "weapon" | "icon" | "barrier"
const GRID_LAYOUT = [
  ['empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty'],
  ['empty', 'empty', 'empty', 'filler', 'filler', 'filler', 'icon:📖:Enchantments', 'icon:📝:Ultimate Enchantments', 'icon:💎:Gemstones'],
  ['empty', 'empty', 'empty', 'filler', 'weapon', 'filler', 'icon:📔:Books', 'icon:🗳:Modifiers', 'empty'],
  ['empty', 'empty', 'empty', 'filler', 'filler', 'filler', 'icon:🔷:Reforges', 'icon:🔥:Item Upgrades', 'empty'],
  ['empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty'],
  ['empty', 'empty', 'empty', 'empty', 'barrier:⛔:Close', 'empty', 'empty', 'empty', 'empty'],
];

// Dummy handler for every interactive slot without real behavior yet.
function handleSlotClick(label) {
  console.log(`[The Hex] "${label}" clicked — not yet implemented.`);
}

const slotBase = 'flex items-center justify-center border border-neutral-700';
const interactiveIcon = `${slotBase} bg-neutral-300 cursor-pointer text-[clamp(14px,3.5vw,26px)] hover:bg-neutral-200`;

export default function Hex() {
  const navigate = useNavigate();
  const { status, refresh } = useItemData();
  const { build } = useBuild();
  const { showTooltip, hideTooltip } = useTooltip();
  const weapon = build && build.weapon;

  function handleWeaponHover(e) {
    if (!weapon) return;
    showTooltip([`§${rarityColorCode(weapon.tier)}§l${weapon.name}`, ...(weapon.lore || [])], e.currentTarget);
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <header className="w-full max-w-[700px] mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">The Hex</h1>
        <div className="flex items-center gap-2.5 text-[13px]">
          <span>{status}</span>
          <button className="text-[13px] px-3 py-1.5 cursor-pointer bg-neutral-200 text-black" onClick={refresh}>
            Refresh Data
          </button>
        </div>
      </header>

      <div className="w-full max-w-[700px] overflow-x-auto">
        <div className="grid grid-cols-9 grid-rows-6 gap-0.5 w-full min-w-[380px] aspect-[9/6] bg-neutral-600 border-2 border-neutral-500 p-1">
          {GRID_LAYOUT.flatMap((row, rowIdx) =>
            row.map((cellDef, colIdx) => {
              const [type, glyph, label] = cellDef.split(':');
              const key = `${rowIdx}-${colIdx}`;

              if (type === 'weapon') {
                return (
                  <div
                    key={key}
                    className={`${slotBase} bg-neutral-500 cursor-pointer text-[clamp(20px,5vw,34px)]`}
                    onClick={() => navigate('/')}
                    onMouseEnter={handleWeaponHover}
                    onMouseLeave={hideTooltip}
                  >
                    {weapon ? (
                      <WeaponIcon
                        material={weapon.material}
                        alt={weapon.name}
                        className="w-[70%] h-[70%] object-contain pixelated"
                      />
                    ) : (
                      <span title="No weapon selected — click to choose one">⚔️</span>
                    )}
                  </div>
                );
              }

              if (type === 'icon') {
                return (
                  <div
                    key={key}
                    className={interactiveIcon}
                    title={label}
                    onClick={() => (label === 'Enchantments' ? navigate('/enchants') : handleSlotClick(label))}
                  >
                    {glyph}
                  </div>
                );
              }

              if (type === 'barrier') {
                return (
                  <div key={key} className={interactiveIcon} title={label} onClick={() => navigate('/')}>
                    {glyph}
                  </div>
                );
              }

              if (type === 'filler') {
                return <div key={key} className={`${slotBase} bg-purple-500`} />;
              }

              return <div key={key} className={`${slotBase} bg-neutral-500`} />;
            }),
          )}
        </div>
      </div>
    </div>
  );
}

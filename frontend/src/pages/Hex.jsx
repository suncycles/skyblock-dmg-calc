import { useNavigate } from 'react-router-dom';
import { useItemData } from '../context/ItemDataContext';
import { useBuild } from '../context/BuildContext';
import { useTooltip } from '../context/TooltipContext';
import { rarityColorCode } from '../lib/mcText';
import { titleCaseEnchantId, toRoman } from '../lib/enchantEffects';
import WeaponIcon from '../components/WeaponIcon';

// Applied enchants, formatted for the tooltip: ultimate first (always bold
// pink, matching its real in-game color regardless of level), then normal
// enchants alphabetically, gold if at max level else grey.
function buildAppliedEnchantLines(modifiers) {
  if (!modifiers) return [];
  const entries = [];
  if (modifiers.ultimateEnchantment) {
    entries.push({ ...modifiers.ultimateEnchantment, isUltimate: true });
  }
  const normals = (modifiers.hexEnchantments || [])
    .slice()
    .sort((a, b) => titleCaseEnchantId(a.id).localeCompare(titleCaseEnchantId(b.id)));
  entries.push(...normals.map((e) => ({ ...e, isUltimate: false })));

  return entries.map((e) => {
    const name = `${titleCaseEnchantId(e.id)} ${toRoman(e.level)}`;
    if (e.isUltimate) return `§d§l${name}`;
    return e.level === e.maxLevel ? `§6${name}` : `§7${name}`;
  });
}

// Real Skyblock tooltips show applied enchants right after the stat block
// (Damage/Strength/.../Gemstones) and before the Ability section — i.e. at
// the first blank line in the lore. Splice them in there rather than at the
// very top, so the tooltip reads exactly like the real item would.
function insertEnchantLines(lore, enchantLines) {
  if (enchantLines.length === 0) return lore;
  const blankIdx = lore.indexOf('');
  if (blankIdx === -1) return [...lore, '', ...enchantLines];
  return [...lore.slice(0, blankIdx + 1), ...enchantLines, '', ...lore.slice(blankIdx + 1)];
}

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
    const enchantLines = buildAppliedEnchantLines(build.modifiers);
    const lore = insertEnchantLines(weapon.lore || [], enchantLines);
    showTooltip([`§${rarityColorCode(weapon.tier)}§l${weapon.name}`, ...lore], e.currentTarget);
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
                        id={weapon.id}
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
                const dest =
                  label === 'Enchantments' ? '/enchants' : label === 'Ultimate Enchantments' ? '/ultimate-enchants' : null;
                return (
                  <div
                    key={key}
                    className={interactiveIcon}
                    title={label}
                    onClick={() => (dest ? navigate(dest) : handleSlotClick(label))}
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

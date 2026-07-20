import { useNavigate } from 'react-router-dom';
import { useItemData } from '../context/ItemDataContext';
import { useBuild } from '../context/BuildContext';
import { useTooltip } from '../context/TooltipContext';
import { rarityColorCode, formatItemName } from '../lib/mcText';
import { titleCaseEnchantId, toRoman } from '../lib/enchantEffects';
import { hasGemstoneSlots, applyGemstonesToLore } from '../lib/gemstones';
import { getApplicableReforges } from '../lib/reforgeData';
import { applyReforgeToLore } from '../lib/reforges';
import { applyBooksToLore } from '../lib/books';
import { canRecombobulate, bumpRarity, applyRecombToLore } from '../lib/recombobulator';
import { SLOT_TEXTURES, CATEGORY_ICONS } from '../lib/icons';
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
  ['empty', 'empty', 'empty', 'filler', 'filler', 'filler', 'icon:Enchantments', 'icon:Ultimate Enchantments', 'icon:Gemstones'],
  ['empty', 'empty', 'empty', 'filler', 'weapon', 'filler', 'icon:Books', 'icon:Modifiers', 'empty'],
  ['empty', 'empty', 'empty', 'filler', 'filler', 'filler', 'icon:Reforges', 'icon:Item Upgrades', 'empty'],
  ['empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty'],
  ['empty', 'empty', 'empty', 'empty', 'barrier:Close', 'empty', 'empty', 'empty', 'empty'],
];

// Dummy handler for every interactive slot without real behavior yet.
function handleSlotClick(label) {
  console.log(`[The Hex] "${label}" clicked — not yet implemented.`);
}

// Real Minecraft slots are a recessed bevel (dark shadow top-left, light
// highlight bottom-right), not a flat border — matches the reference at
// https://codepen.io/isd-crew/pen/qBMprNv.
const slotBase =
  'flex items-center justify-center bg-[#8b8b8b] shadow-[inset_2px_2px_0_0_#373737,inset_-2px_-2px_0_0_#ffffff]';
const interactiveIcon = `${slotBase} cursor-pointer hover:brightness-110`;
const iconImg = 'w-[70%] h-[70%] object-contain pixelated';
// Glass panes stand in for the slot's own background, not a held item, so
// they fill the slot edge-to-edge instead of sitting inset like item icons.
const slotFillImg = 'w-full h-full object-cover pixelated';

export default function Hex() {
  const navigate = useNavigate();
  const { status, refresh, itemData } = useItemData();
  const { build, toggleRecombobulated } = useBuild();
  const { showTooltip, hideTooltip } = useTooltip();
  const weapon = build && build.weapon;

  function handleWeaponHover(e) {
    if (!weapon) return;
    const modifiers = build.modifiers;
    // Reforge bonuses scale off the item's *current* rarity, not the one
    // it was reforged at — recombobulating an already-reforged item is a
    // known real-game trick to bump the reforge's own bonus too — so this
    // has to be resolved before the reforge lookup below uses it.
    const displayTier = modifiers.recombobulated ? bumpRarity(weapon.tier) : weapon.tier;

    let lore = applyGemstonesToLore(weapon.lore || [], modifiers.gemstones, weapon.tier);
    const reforge = modifiers.reforge ? itemData.reforges?.[modifiers.reforge] : null;
    lore = applyReforgeToLore(lore, reforge, displayTier, lore.indexOf(''));
    lore = applyBooksToLore(lore, modifiers.books, lore.indexOf(''));
    lore = insertEnchantLines(lore, buildAppliedEnchantLines(modifiers));
    if (modifiers.recombobulated) lore = applyRecombToLore(lore, weapon.tier);

    const reforgePrefix = modifiers.reforge ? `${modifiers.reforge} ` : '';
    const title = `§${rarityColorCode(displayTier)}§l${reforgePrefix}${formatItemName(weapon.name)}`;
    showTooltip([title, ...lore], e.currentTarget);
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
        <div className="grid grid-cols-9 grid-rows-6 gap-[3px] w-full min-w-[380px] aspect-[9/6] bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black p-2">
          {GRID_LAYOUT.flatMap((row, rowIdx) =>
            row.map((cellDef, colIdx) => {
              const [type, label] = cellDef.split(':');
              const key = `${rowIdx}-${colIdx}`;

              if (type === 'weapon') {
                return (
                  <div
                    key={key}
                    className={`${slotBase} cursor-pointer`}
                    onClick={() => navigate('/')}
                    onMouseEnter={handleWeaponHover}
                    onMouseLeave={hideTooltip}
                  >
                    {weapon ? (
                      <WeaponIcon id={weapon.id} material={weapon.material} alt={weapon.name} className={iconImg} />
                    ) : (
                      <span title="No weapon selected — click to choose one" className="text-2xl">
                        ⚔️
                      </span>
                    )}
                  </div>
                );
              }

              if (type === 'icon') {
                const dest =
                  label === 'Enchantments'
                    ? '/enchants'
                    : label === 'Ultimate Enchantments'
                      ? '/ultimate-enchants'
                      : label === 'Gemstones'
                        ? '/gemstones'
                        : label === 'Books'
                          ? '/books'
                          : label === 'Reforges'
                            ? '/reforges'
                            : null;

                // Gemstones/Books/Reforges only open for items that can
                // actually use them — everything else (Item Upgrades) is
                // still a dummy placeholder.
                if (label === 'Gemstones') {
                  const enabled = weapon && hasGemstoneSlots(weapon.lore);
                  return (
                    <div
                      key={key}
                      className={enabled ? interactiveIcon : `${slotBase} opacity-40 cursor-not-allowed`}
                      title={enabled ? label : `${label} — this item has no Gemstone Slots`}
                      onClick={() => enabled && navigate(dest)}
                    >
                      <img src={CATEGORY_ICONS[label]} alt={label} className={iconImg} />
                    </div>
                  );
                }

                if (label === 'Books') {
                  const enabled = Boolean(weapon);
                  const applied = build?.modifiers?.books > 0;
                  return (
                    <div
                      key={key}
                      className={`${enabled ? interactiveIcon : `${slotBase} opacity-40 cursor-not-allowed`} ${applied ? 'bg-green-400' : ''}`}
                      title={enabled ? label : `${label} — select a weapon first`}
                      onClick={() => enabled && navigate(dest)}
                    >
                      <img src={CATEGORY_ICONS[label]} alt={label} className={iconImg} />
                    </div>
                  );
                }

                if (label === 'Reforges') {
                  const enabled = weapon && getApplicableReforges(itemData.reforges, weapon).length > 0;
                  const applied = Boolean(build?.modifiers?.reforge);
                  return (
                    <div
                      key={key}
                      className={`${enabled ? interactiveIcon : `${slotBase} opacity-40 cursor-not-allowed`} ${applied ? 'bg-green-400' : ''}`}
                      title={enabled ? label : `${label} — no reforges available for this item`}
                      onClick={() => enabled && navigate(dest)}
                    >
                      <img src={CATEGORY_ICONS[label]} alt={label} className={iconImg} />
                    </div>
                  );
                }

                if (label === 'Modifiers') {
                  const enabled = weapon && canRecombobulate(weapon.tier);
                  const applied = Boolean(build?.modifiers?.recombobulated);
                  return (
                    <div
                      key={key}
                      className={`${enabled ? interactiveIcon : `${slotBase} opacity-40 cursor-not-allowed`} ${applied ? 'bg-green-400' : ''}`}
                      title={enabled ? 'Recombobulator 3000 — click to toggle' : `${label} — this item can't be recombobulated`}
                      onClick={() => enabled && toggleRecombobulated()}
                    >
                      <img src={CATEGORY_ICONS[label]} alt={label} className={iconImg} />
                    </div>
                  );
                }

                return (
                  <div
                    key={key}
                    className={interactiveIcon}
                    title={label}
                    onClick={() => (dest ? navigate(dest) : handleSlotClick(label))}
                  >
                    <img src={CATEGORY_ICONS[label]} alt={label} className={iconImg} />
                  </div>
                );
              }

              if (type === 'barrier') {
                return (
                  <div key={key} className={interactiveIcon} title={label} onClick={() => navigate('/')}>
                    <img src={SLOT_TEXTURES.close} alt={label} className={iconImg} />
                  </div>
                );
              }

              if (type === 'filler') {
                return (
                  <div key={key} className={slotBase}>
                    <img src={SLOT_TEXTURES.filler} alt="" className={slotFillImg} />
                  </div>
                );
              }

              return (
                <div key={key} className={slotBase}>
                  <img src={SLOT_TEXTURES.empty} alt="" className={slotFillImg} />
                </div>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}

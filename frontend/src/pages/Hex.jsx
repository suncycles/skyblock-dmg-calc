import { useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useItemData } from '../context/ItemDataContext';
import { useBuild } from '../context/BuildContext';
import { useTooltip } from '../context/TooltipContext';
import { hasGemstoneSlots } from '../lib/gemstones';
import { getApplicableReforges } from '../lib/reforgeData';
import { getSpecialConfig } from '../lib/specialWeapons';
import { canRecombobulate } from '../lib/recombobulator';
import { getGearType } from '../lib/gearType';
import { ARMOR_SLOT_LABELS } from '../lib/armorSlots';
import { EQUIPMENT_SLOT_LABELS } from '../lib/equipmentSlots';
import { SLOT_TEXTURES, CATEGORY_ICONS } from '../lib/icons';
import { buildFullItemTooltipLines } from '../lib/itemTooltip';
import { computeEquippedPetStats, computeItemChimeraBonus, computeManticoreClawBonus } from '../lib/petData';
import WeaponIcon from '../components/WeaponIcon';

// 6 rows x 9 columns, matching the reference screenshot.
// type: "empty" | "filler" | "item" | "icon" | "barrier"
const GRID_LAYOUT = [
  ['empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty'],
  ['empty', 'empty', 'empty', 'filler', 'filler', 'filler', 'icon:Enchantments', 'icon:Ultimate Enchantments', 'icon:Gemstones'],
  ['empty', 'empty', 'empty', 'filler', 'item', 'filler', 'icon:Books', 'icon:Modifiers', 'icon:Special'],
  ['empty', 'empty', 'empty', 'filler', 'filler', 'filler', 'icon:Reforges', 'icon:Item Upgrades', 'empty'],
  ['empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty'],
  ['empty', 'empty', 'empty', 'empty', 'barrier:Close', 'empty', 'empty', 'empty', 'empty'],
];

// Dummy handler for every interactive slot without real behavior yet.
function handleSlotClick(label) {
  console.log(`[SkyDmg] "${label}" clicked — not yet implemented.`);
}

const slotBase =
  'flex items-center justify-center bg-[#8b8b8b] shadow-[inset_2px_2px_0_0_#373737,inset_-2px_-2px_0_0_#ffffff]';
const interactiveIcon = `${slotBase} cursor-pointer hover:brightness-110`;
const iconImg = 'w-[70%] h-[70%] object-contain pixelated';
const slotFillImg = 'w-full h-full object-cover pixelated';

// Opened per-slot (weapon, an armor piece, or an equipment piece) via /hex/:slot; operates on loadout[slot].
export default function Hex() {
  const { slot } = useParams();
  const navigate = useNavigate();
  const { itemData } = useItemData();
  const { loadout, toggleRecombobulated, playerStats } = useBuild();
  const { showTooltip, hideTooltip } = useTooltip();
  const item = loadout[slot] && loadout[slot].item;
  const gearType = item ? getGearType(item.category) : null;
  const slotLabel = slot === 'weapon' ? 'Weapon' : ARMOR_SLOT_LABELS[slot] || EQUIPMENT_SLOT_LABELS[slot] || slot;
  const closeTo = '/';

  // Captures a token before awaiting so a still-in-flight hover lookup can't clobber a newer one or resurrect after the mouse leaves.
  const hoverTokenRef = useRef(0);
  async function handleItemHover(e) {
    if (!item) return;
    const anchor = e.currentTarget;
    const token = ++hoverTokenRef.current;
    const petStats = computeEquippedPetStats(loadout, itemData);
    const chimeraBonus = computeItemChimeraBonus(loadout[slot], petStats);
    const manticoreClawBonus = computeManticoreClawBonus(loadout[slot], petStats);
    const potatoBookDoubled = loadout.pet?.item?.petId === 'BLAZE' && loadout.pet?.item?.tier === 'LEGENDARY';
    const lines = await buildFullItemTooltipLines(
      item,
      loadout[slot].modifiers,
      itemData,
      playerStats.catacombsLevel,
      playerStats.tamingLevel,
      playerStats.wolfSlayerLevel,
      chimeraBonus,
      playerStats.generalsMedallionDigits,
      manticoreClawBonus,
      potatoBookDoubled,
    );
    if (hoverTokenRef.current === token) showTooltip(lines, anchor);
  }
  function handleItemLeave() {
    hoverTokenRef.current++;
    hideTooltip();
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-4 relative">
      <header className="w-full max-w-[700px] mb-4">
        <h1 className="text-xl font-bold">{slotLabel}</h1>
      </header>

      <div className="w-full max-w-[700px] overflow-x-auto">
        <div className="grid grid-cols-9 grid-rows-6 gap-[3px] w-full min-w-[380px] aspect-[9/6] bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black p-2">
          {GRID_LAYOUT.flatMap((row, rowIdx) =>
            row.map((cellDef, colIdx) => {
              const [type, label] = cellDef.split(':');
              const key = `${rowIdx}-${colIdx}`;

              if (type === 'item') {
                return (
                  <div key={key} className={slotBase} onMouseEnter={handleItemHover} onMouseLeave={handleItemLeave}>
                    {item ? (
                      <WeaponIcon id={item.id} material={item.material} alt={item.name} className={iconImg} color={item.color} />
                    ) : (
                      <span title="No item selected — use Close to pick one" className="text-2xl">
                        {slot === 'weapon' ? '⚔️' : '🛡️'}
                      </span>
                    )}
                  </div>
                );
              }

              if (type === 'icon') {
                const dest =
                  label === 'Enchantments'
                    ? `/enchants/${slot}`
                    : label === 'Ultimate Enchantments'
                      ? `/ultimate-enchants/${slot}`
                      : label === 'Gemstones'
                        ? `/gemstones/${slot}`
                        : label === 'Books'
                          ? `/books/${slot}`
                          : label === 'Reforges'
                            ? `/reforges/${slot}`
                            : label === 'Special'
                              ? `/special/${slot}`
                              : label === 'Item Upgrades'
                                ? `/stars/${slot}`
                                : null;

                if (label === 'Gemstones') {
                  const enabled = item && hasGemstoneSlots(item.lore);
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
                  const isEquipment = gearType === 'equipment';
                  const enabled = Boolean(item) && !isEquipment;
                  const modifiers = loadout[slot] && loadout[slot].modifiers;
                  const applied = Boolean(modifiers && (modifiers.books > 0 || modifiers.artOfWar || modifiers.artOfPeace));
                  const disabledReason = !item
                    ? 'select an item first'
                    : 'Equipment cannot use Potato Books, the Art of War, or the Art of Peace';
                  return (
                    <div
                      key={key}
                      className={`${enabled ? interactiveIcon : `${slotBase} opacity-40 cursor-not-allowed`} ${applied ? 'bg-green-400' : ''}`}
                      title={enabled ? label : `${label} — ${disabledReason}`}
                      onClick={() => enabled && navigate(dest)}
                    >
                      <img src={CATEGORY_ICONS[label]} alt={label} className={iconImg} />
                    </div>
                  );
                }

                if (label === 'Reforges') {
                  const enabled =
                    item &&
                    (getApplicableReforges(itemData.reforges, item).length > 0 ||
                      getApplicableReforges(itemData.reforgeStones, item).length > 0);
                  const applied = Boolean(loadout[slot] && loadout[slot].modifiers.reforge);
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

                if (label === 'Special') {
                  const enabled = Boolean(item && getSpecialConfig(item.id));
                  const applied = enabled && loadout[slot].modifiers.special > 0;
                  return (
                    <div
                      key={key}
                      className={`${enabled ? interactiveIcon : `${slotBase} opacity-40 cursor-not-allowed`} ${applied ? 'bg-green-400' : ''}`}
                      title={enabled ? 'Special — this item\'s own ability mechanic' : `${label} — no special ability mechanic for this item`}
                      onClick={() => enabled && navigate(dest)}
                    >
                      <img src={CATEGORY_ICONS[label]} alt={label} className={iconImg} />
                    </div>
                  );
                }

                if (label === 'Item Upgrades') {
                  const enabled = Boolean(item);
                  const applied = enabled && loadout[slot].modifiers.stars > 0;
                  return (
                    <div
                      key={key}
                      className={`${enabled ? interactiveIcon : `${slotBase} opacity-40 cursor-not-allowed`} ${applied ? 'bg-green-400' : ''}`}
                      title={enabled ? 'Item Upgrades — Starring' : `${label} — select an item first`}
                      onClick={() => enabled && navigate(dest)}
                    >
                      <img src={CATEGORY_ICONS[label]} alt={label} className={iconImg} />
                    </div>
                  );
                }

                if (label === 'Modifiers') {
                  const baseTier = (loadout[slot] && loadout[slot].modifiers.rarityOverride) || (item && item.tier);
                  const enabled = item && canRecombobulate(baseTier);
                  const applied = Boolean(loadout[slot] && loadout[slot].modifiers.recombobulated);
                  return (
                    <div
                      key={key}
                      className={`${enabled ? interactiveIcon : `${slotBase} opacity-40 cursor-not-allowed`} ${applied ? 'bg-green-400' : ''}`}
                      title={enabled ? 'Recombobulator 3000 — click to toggle' : `${label} — this item can't be recombobulated`}
                      onClick={() => enabled && toggleRecombobulated(slot)}
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
                  <div key={key} className={interactiveIcon} title={label} onClick={() => navigate(closeTo)}>
                    <img src={SLOT_TEXTURES.close} alt={label} className="w-[85%] h-[85%] object-contain pixelated" />
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

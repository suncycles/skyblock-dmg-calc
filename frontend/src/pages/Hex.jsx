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
import { computeBasePetStats, computeItemChimeraBonus, computeManticoreClawBonus } from '../lib/petData';
import { MOB_TYPES } from '../lib/mobTypes';
import WeaponIcon from '../components/WeaponIcon';

// 6 rows x 9 columns, matching the reference screenshot.
// type: "empty" | "filler" | "item" | "icon" | "change" | "barrier"
const GRID_LAYOUT = [
  ['empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty'],
  ['empty', 'empty', 'empty', 'filler', 'filler', 'filler', 'icon:Enchantments', 'icon:Ultimate Enchantments', 'icon:Gemstones'],
  ['empty', 'empty', 'empty', 'filler', 'item', 'filler', 'icon:Books', 'icon:Modifiers', 'icon:Special'],
  ['empty', 'empty', 'empty', 'filler', 'filler', 'filler', 'icon:Reforges', 'icon:Item Upgrades', 'icon:Clean'],
  ['empty', 'empty', 'empty', 'empty', 'change', 'empty', 'empty', 'empty', 'empty'],
  ['empty', 'empty', 'empty', 'empty', 'barrier:Close', 'empty', 'empty', 'empty', 'empty'],
];

// Short, player-vernacular label painted under each action icon. The full name stays in the
// hover title. Nine unlabeled icons was this page's single biggest clarity problem — every other
// grid in the app (Landing's slots, the pickers' tiles) labels its cells, and this is the one
// screen where the icons are genuinely ambiguous.
const ICON_LABELS = {
  Enchantments: 'Enchants',
  'Ultimate Enchantments': 'Ultimate',
  Gemstones: 'Gemstones',
  Books: 'Books',
  Modifiers: 'Recomb',
  Special: 'Special',
  Reforges: 'Reforge',
  'Item Upgrades': 'Stars',
  Clean: 'Clean',
};

const slotBase =
  'flex items-center justify-center bg-[#8b8b8b] shadow-[inset_2px_2px_0_0_#373737,inset_-2px_-2px_0_0_#ffffff]';
const interactiveIcon = `${slotBase} cursor-pointer hover:brightness-110`;
const iconImg = 'w-[70%] h-[70%] object-contain pixelated';
const slotFillImg = 'w-full h-full object-cover pixelated';

// One action cell: icon, permanent label, and — when this modifier is actually set — a badge
// carrying its VALUE (★5, 3 enchants, the gemstone count) rather than the old flat green
// background, which said only that *something* was applied and still cost a click to find out what.
function IconCell({ icon, iconNode, label, title, enabled, badge, onClick }) {
  return (
    <div
      className={`relative ${enabled ? interactiveIcon : `${slotBase} opacity-40 cursor-not-allowed`}`}
      title={title}
      onClick={() => enabled && onClick?.()}
    >
      {iconNode || <img src={icon} alt="" className={iconImg} />}
      <span className="absolute bottom-0.5 left-0 right-0 text-center text-[8px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] truncate px-0.5">
        {ICON_LABELS[label] || label}
      </span>
      {badge && (
        <span className="absolute top-0.5 right-0.5 z-20 max-w-[90%] truncate text-[8px] font-bold leading-none text-black bg-green-400 px-[3px] py-[1px] rounded-[2px]">
          {badge}
        </span>
      )}
    </div>
  );
}

// Opened per-slot (weapon, an armor piece, or an equipment piece) via /hex/:slot; operates on loadout[slot].
export default function Hex() {
  const { slot } = useParams();
  const navigate = useNavigate();
  const { itemData } = useItemData();
  const { loadout, toggleRecombobulated, cleanModifiers, playerStats, targetMobs } = useBuild();
  const isMythologicalTarget = targetMobs.some((name) => (MOB_TYPES[name] || []).includes('Mythological'));
  const { showTooltip, hideTooltip, handleTapOrActivate, guardHover } = useTooltip();
  const item = loadout[slot] && loadout[slot].item;
  const gearType = item ? getGearType(item.category) : null;
  const slotLabel = slot === 'weapon' ? 'Weapon' : ARMOR_SLOT_LABELS[slot] || EQUIPMENT_SLOT_LABELS[slot] || slot;
  const closeTo = '/';
  // Same destination Landing's empty slot opens — see the 'change' cell below.
  const pickerPath =
    slot === 'weapon' ? '/weapon' : ARMOR_SLOT_LABELS[slot] ? `/armor/${slot}` : `/equipment/${slot}`;

  // Per-action enabled/disabled state, the reason when disabled, and the badge showing what's
  // currently applied. One table instead of the eight near-identical inline blocks this replaced.
  function iconConfig(label, currentItem, modifiers) {
    if (!currentItem) return { enabled: false, disabledReason: 'select an item first' };
    switch (label) {
      case 'Enchantments':
        return {
          enabled: true,
          badge: modifiers.hexEnchantments.length > 0 ? String(modifiers.hexEnchantments.length) : null,
          onClick: () => navigate(`/enchants/${slot}`),
        };
      case 'Ultimate Enchantments':
        return {
          enabled: true,
          badge: modifiers.ultimateEnchantment ? '✓' : null,
          onClick: () => navigate(`/ultimate-enchants/${slot}`),
        };
      case 'Gemstones': {
        const filled = modifiers.gemstones.filter(Boolean).length;
        return {
          enabled: hasGemstoneSlots(currentItem.lore),
          disabledReason: 'this item has no Gemstone Slots',
          badge: filled > 0 ? String(filled) : null,
          onClick: () => navigate(`/gemstones/${slot}`),
        };
      }
      case 'Books':
        return {
          enabled: gearType !== 'equipment',
          disabledReason: 'Equipment cannot use Potato Books, the Art of War, or the Art of Peace',
          badge: modifiers.books > 0 ? String(modifiers.books) : modifiers.artOfWar || modifiers.artOfPeace ? '✓' : null,
          onClick: () => navigate(`/books/${slot}`),
        };
      case 'Reforges':
        return {
          enabled:
            getApplicableReforges(itemData.reforges, currentItem).length > 0 ||
            getApplicableReforges(itemData.reforgeStones, currentItem).length > 0,
          disabledReason: 'no reforges available for this item',
          badge: modifiers.reforge ? '✓' : null,
          onClick: () => navigate(`/reforges/${slot}`),
        };
      case 'Special':
        return {
          enabled: Boolean(getSpecialConfig(currentItem.id)),
          disabledReason: 'no special ability mechanic for this item',
          title: "Special — this item's own ability mechanic",
          badge: modifiers.special > 0 ? '✓' : null,
          onClick: () => navigate(`/special/${slot}`),
        };
      case 'Item Upgrades':
        return {
          enabled: true,
          title: 'Item Upgrades — Starring',
          badge: modifiers.stars > 0 ? `★${modifiers.stars}` : null,
          onClick: () => navigate(`/stars/${slot}`),
        };
      case 'Modifiers':
        return {
          enabled: canRecombobulate(modifiers.rarityOverride || currentItem.tier),
          disabledReason: "this item can't be recombobulated",
          title: 'Recombobulator 3000 — click to toggle',
          badge: modifiers.recombobulated ? '✓' : null,
          onClick: () => toggleRecombobulated(slot),
        };
      case 'Clean':
        return {
          enabled: true,
          title: 'Clean — remove every modifier from this item',
          onClick: () => cleanModifiers(slot),
        };
      default:
        return { enabled: false, disabledReason: 'not available' };
    }
  }

  // Captures a token before awaiting so a still-in-flight hover lookup can't clobber a newer one or resurrect after the mouse leaves.
  const hoverTokenRef = useRef(0);
  async function handleItemHover(e) {
    if (!item) return;
    const anchor = e.currentTarget;
    const token = ++hoverTokenRef.current;
    const basePetStats = computeBasePetStats(loadout, itemData);
    const chimeraBonus = computeItemChimeraBonus(loadout[slot], basePetStats);
    const manticoreClawBonus = computeManticoreClawBonus(loadout[slot], basePetStats);
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
      isMythologicalTarget,
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
                  <div
                    key={key}
                    className={slotBase}
                    onClick={handleTapOrActivate('item', handleItemHover, undefined)}
                    onMouseEnter={guardHover(handleItemHover)}
                    onMouseLeave={guardHover(handleItemLeave)}
                  >
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
                const modifiers = (loadout[slot] && loadout[slot].modifiers) || null;
                const cfg = iconConfig(label, item, modifiers);
                return (
                  <IconCell
                    key={key}
                    icon={CATEGORY_ICONS[label]}
                    label={label}
                    title={cfg.enabled ? cfg.title || label : `${label} — ${cfg.disabledReason}`}
                    enabled={cfg.enabled}
                    badge={cfg.badge}
                    onClick={cfg.onClick}
                  />
                );
              }

              if (type === 'change') {
                // Swapping the equipped item used to mean going back to Landing, hitting the 16px
                // remove ✕, then clicking the now-empty slot — 3 clicks for the most common action
                // in a damage calculator. This is the same destination the empty slot would open.
                return (
                  <IconCell
                    key={key}
                    // The equipped item's own icon, dimmed — reads as "this is what's in the slot,
                    // click to swap it" without needing a generic action glyph.
                    iconNode={
                      item ? (
                        <WeaponIcon id={item.id} material={item.material} className={`${iconImg} opacity-60`} color={item.color} />
                      ) : undefined
                    }
                    icon={SLOT_TEXTURES.emptyGemSlot}
                    label="Change"
                    title={item ? `Change Item — pick a different ${slotLabel}` : `Pick a ${slotLabel}`}
                    enabled
                    onClick={() => navigate(pickerPath)}
                  />
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

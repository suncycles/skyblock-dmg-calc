import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useItemData } from '../context/ItemDataContext';
import { useTooltip } from '../context/TooltipContext';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { ARMOR_SLOTS, ARMOR_SLOT_LABELS } from '../lib/armorSlots';
import { EQUIPMENT_SLOTS, EQUIPMENT_SLOT_LABELS } from '../lib/equipmentSlots';
import { buildFullItemTooltipLines } from '../lib/itemTooltip';
import {
  petLoreItemId,
  buildPetTooltipLines,
  computeBasePetStats,
  computeItemChimeraBonus,
  computeManticoreClawBonus,
  petItemStatContext,
  applyTierBoost,
} from '../lib/petData';
import { fetchNeuItem } from '../lib/neuItems';
import { computePlayerDefense } from '../lib/playerDefense';
import { getPowerById, computeAccessoryTotalStats } from '../lib/accessoryPowers';
import { getSkyblockLevelColor } from '../lib/playerStats';
import { MOB_TYPES } from '../lib/mobTypes';
import { dropdownPanel, dropdownItemActive, dropdownItemMuted } from '../lib/guiStyles';
import { getMobModelIcon, getMobIconDataUri } from '../lib/mobIcons';
import { getGodPotionTooltipLines, getDungeonPotionTooltipLines, dungeonPotionEffects } from '../lib/godPotion';
import { STAT_LABELS, formatStatValue } from '../lib/reforgeData';
import { formatItemName, rarityGlowFilter } from '../lib/mcText';
import { getDisplayTier } from '../lib/recombobulator';
import { SLOT_TEXTURES } from '../lib/icons';
import { getItemCornerBadge } from '../lib/itemCornerBadge';
import { encodeLoadout, decodeLoadoutCode, shortenLoadoutCode } from '../lib/loadoutCode';
import { SAVED_LOADOUTS_KEY, loadSavedLoadoutsFromStorage, useSavedLoadoutHelmetPreviews } from '../lib/savedLoadouts';
import { computeLoadoutCostBreakdown, LOADOUT_COST_SECTIONS } from '../lib/loadoutCost';
import { formatCoinsShort } from '../lib/damageFormat';
import { ENTRY_DISMISSED_KEY, SHOW_ENTRY_EVENT } from '../lib/entryScreen';
import WeaponIcon from '../components/WeaponIcon';
import EntryScreen from '../components/EntryScreen';
import UpgradesPanel from '../components/UpgradesPanel';
import { DUNGEON_BLESSINGS, computeBlessingMultiplier } from '../lib/dungeonBlessing';
import { hasAnyDebuff, mobDefenseDebuffMultiplier, finalDamageDebuffMultiplier } from '../lib/mobDebuffs';
import { BUFF_ITEMS } from '../lib/buffs';
import ArmorOptions from './ArmorOptions';
import EquipmentOptions from './EquipmentOptions';

// Lazy, like every route in App.jsx, to keep Landing's bundle small. Merged inline below the gear
// grid (see the `embedded` prop) rather than behind a route change, so equipping gear and reading
// its damage numbers happen on one page.
const DamageSources = lazy(() => import('./DamageSources'));

// Darkens a slot's background once an item is equipped, as an inline style so it wins over the
// themed bg-[#8b8b8b] override without a per-theme "equipped" colour.
const EQUIPPED_BG_STYLE = { backgroundColor: 'rgba(0,0,0,0.4)' };

const slotBase =
  'flex items-center justify-center bg-[#8b8b8b]/80 shadow-[inset_2px_2px_0_0_#373737,inset_-2px_-2px_0_0_#ffffff]';
// The same bordered-panel look as the chest-GUI grid, so Export/Import/Loadouts stay theme-aware
// rather than floating pills that wash out against a busy background.
const toolbar =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';
const iconImg = 'w-[70%] h-[70%] object-contain pixelated';
const slotFillImg = 'w-full h-full object-cover pixelated';
// The remove button: the same square Minecraft bevel and literal bg-[#c6c6c6]/border-t-white
// classes as every other panel, so it reskins per theme, with a faint red inset shadow so it still
// reads as "remove". High z-index to sit above every other slot element, including the Target Mob
// tile's stacked mob renders. remove-btn-square opts it out of the rounded-panel corners some themes
// apply (see index.css). w-5 on touch viewports, since 16px is under a sane tap target on a cell
// whose whole body is also tappable; 16px once there is a cursor.
const removeBtn =
  'remove-btn-square absolute -top-1.5 -right-1.5 z-30 w-5 h-5 sm:w-4 sm:h-4 flex items-center justify-center text-[10px] font-bold leading-none text-black bg-[#c6c6c6] border-2 border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-1 outline-black shadow-[inset_0_0_0_20px_rgba(220,38,38,0.22)] hover:brightness-110 cursor-pointer';

// Every Loadout-toolbar button shares this shape; below `sm` it drops to the short label, collapsing
// six buttons from stacked rows into two compact ones. Not icon-only there: six unlabelled boxes,
// export against import especially, are a guessing game.
function ToolbarButton({ icon, label, shortLabel, onClick, pixelated }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="text-[12px] sm:text-[13px] font-bold px-2 sm:px-3 py-2 bg-neutral-800 text-white hover:brightness-125 transition-[filter] cursor-pointer whitespace-nowrap flex items-center gap-1.5"
      onClick={onClick}
    >
      <img src={icon} alt="" className={`w-4 h-4 ${pixelated ? 'pixelated' : ''}`} />
      <span className="sm:hidden">{shortLabel}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// Session-scoped rather than persisted, so a "Back" navigation doesn't re-show the entry screen but
// a fresh visit does. The key lives in lib/entryScreen.js, since TopBar.jsx's brand link needs it.

// One-page character screen: 6 rows x 9 columns, real chest-GUI styling. Column B: equipment
// slots. Column C: armor slots. Column D: accessories/weapon/pet. Columns F/G/H: decorative
// mob-head filler. Everything else is an inert dark-grey glass pane.
export default function Landing() {
  const navigate = useNavigate();
  const {
    loadout,
    removeSlot,
    playerStats,
    targetMobs,
    clearTargetMobs,
    godPotionActive,
    godPotionMixin,
    useDungeonizedStats,
    hasJellyfishPet,
    useMasterMode,
    mageMode,
    dungeonClass,
    dungeonClassLevel,
    setGodPotionActive,
    setGodPotionMixin,
    editAllArmor,
    editAllEquipment,
    attributes,
    blessing,
    debuffs,
    buffs,
    miscStats,
    mobHpPercent,
    infernalCrimsonStacks,
    swarmMobs,
    comboKills,
    legionPlayers,
    blazeCrimsonIsle,
    importedWeapons,
    equipImportedWeapon,
    loadFullState,
  } = useBuild();
  const { itemData, loading: itemDataLoading } = useItemData();
  const { showTooltip, hideTooltip, handleTapOrActivate, guardHover } = useTooltip();
  const { confirmDialog, alertDialog } = useConfirmDialog();
  const damageSectionRef = useRef(null);
  // The sticky damage readout (rendered by DamageSources) is a fixed overlay in the bottom band, the
  // same band this page's "View Damage Breakdown" button occupies at the default scroll position, and
  // it covered the button. The two do the same job, so the readout hides while the button is on
  // screen. Observed here rather than inside DamageSources because a ref passed into a lazy child is
  // read before the child's effect sees it attached; a callback ref into state fires when the node
  // lands.
  const [jumpButtonEl, setJumpButtonEl] = useState(null);
  const [jumpButtonVisible, setJumpButtonVisible] = useState(false);
  // A rect check on scroll rather than IntersectionObserver: same result, and an IO callback never
  // fires inside a headless preview surface.
  useEffect(() => {
    if (!jumpButtonEl) return;
    const update = () => {
      const r = jumpButtonEl.getBoundingClientRect();
      setJumpButtonVisible(r.bottom > 0 && r.top < window.innerHeight);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [jumpButtonEl]);
  const [exportStatus, setExportStatus] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  const [savedLoadouts, setSavedLoadouts] = useState(loadSavedLoadoutsFromStorage);
  const [showLoadoutsPanel, setShowLoadoutsPanel] = useState(false);
  const [newLoadoutName, setNewLoadoutName] = useState('');
  const [saveStatus, setSaveStatus] = useState(null);
  const [showEntry, setShowEntry] = useState(() => sessionStorage.getItem(ENTRY_DISMISSED_KEY) !== '1');
  // The potion tile's own menu. A native <select> gives keyboard and screen-reader behaviour for free
  // but renders an OS popup unlike the rest of the GUI, so this is a real listbox with that
  // behaviour reimplemented below.
  const [potionMenuOpen, setPotionMenuOpen] = useState(false);
  const [potionMenuIndex, setPotionMenuIndex] = useState(0);
  // Where the menu sits once open. It renders in a portal on document.body rather than beside the
  // tile: the gear board's wrapper is `overflow-x-auto` for narrow screens, which forces overflow-y
  // to auto as well, so a menu dropping out of the grid's bottom row was being clipped by it.
  const [potionMenuPos, setPotionMenuPos] = useState(null);
  const potionMenuRef = useRef(null);
  const potionListRef = useRef(null);
  const [showArmorOptions, setShowArmorOptions] = useState(false);
  const [showEquipmentOptions, setShowEquipmentOptions] = useState(false);

  // Close the potion menu on an outside click or Escape - the two things a native <select> did
  // that a div does not.
  useEffect(() => {
    if (!potionMenuOpen) return undefined;
    const onPointerDown = (e) => {
      if (potionMenuRef.current?.contains(e.target) || potionListRef.current?.contains(e.target)) return;
      setPotionMenuOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setPotionMenuOpen(false);
    };
    // The portal is placed from a one-off measurement, so anything that moves the tile closes it
    // rather than leaving the menu stranded.
    const onReflow = () => setPotionMenuOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onReflow, true);
    window.addEventListener('resize', onReflow);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onReflow, true);
      window.removeEventListener('resize', onReflow);
    };
  }, [potionMenuOpen]);
  const helmetPreviews = useSavedLoadoutHelmetPreviews(savedLoadouts, itemData, showLoadoutsPanel, itemDataLoading);
  const [costResult, setCostResult] = useState(null);
  // Whether any currently-selected target is Mythological-typed - Challenger's/Mythos' doubled-stat
  // tooltip preview (buildFullItemTooltipLines' isMythologicalTarget param) only makes sense to show
  // when it'd actually apply in combat.
  const isMythologicalTarget = targetMobs.some((name) => (MOB_TYPES[name] || []).includes('Mythological'));

  function handleCalculateSetupCost() {
    setCostResult((prev) => (prev ? null : computeLoadoutCostBreakdown(loadout, attributes, itemData)));
  }

  // Wipes this app's localStorage - current build, saved Loadouts, theme - and reloads, so every
  // context re-initializes as for a new visitor. localStorage.clear() rather than a hand-picked key
  // list, so it stays comprehensive as new persisted state appears, at the cost of clearing anything
  // else this origin stores.
  async function handleHardReset() {
    if (!(await confirmDialog('Hard reset EVERYTHING? This permanently deletes your current build, all saved Loadouts, and every other saved setting. This cannot be undone.'))) return;
    localStorage.clear();
    window.location.reload();
  }

  function dismissEntry() {
    sessionStorage.setItem(ENTRY_DISMISSED_KEY, '1');
    setShowEntry(false);
  }

  // TopBar.jsx's brand click brings the entry screen back while already on "/", where a plain
  // navigate("/") is a no-op and the initial-state read never re-runs.
  useEffect(() => {
    function handleShowEntry() {
      setShowEntry(true);
    }
    window.addEventListener(SHOW_ENTRY_EVENT, handleShowEntry);
    return () => window.removeEventListener(SHOW_ENTRY_EVENT, handleShowEntry);
  }, []);

  function persistSavedLoadouts(next) {
    setSavedLoadouts(next);
    localStorage.setItem(SAVED_LOADOUTS_KEY, JSON.stringify(next));
  }

  // What Save and Export both encode.
  function currentEncodableState() {
    return {
      loadout,
      targetMobs,
      attributes,
      playerStats,
      godPotionActive,
      godPotionMixin,
      useDungeonizedStats,
      useMasterMode,
      mageMode,
      dungeonClass,
      dungeonClassLevel,
      miscStats,
      mobHpPercent,
      infernalCrimsonStacks,
      swarmMobs,
      comboKills,
      legionPlayers,
      blazeCrimsonIsle,
    };
  }

  // Encodes the current build (reusing the share-link codec) and stores it under the typed name.
  async function handleSaveLoadout() {
    const name = newLoadoutName.trim();
    if (!name) return;
    setSaveStatus('Saving...');
    try {
      const code = await encodeLoadout(currentEncodableState());
      const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, code, savedAt: Date.now() };
      persistSavedLoadouts([...savedLoadouts, entry]);
      setNewLoadoutName('');
      setSaveStatus('Saved!');
    } catch (err) {
      console.error('Failed to save loadout:', err);
      setSaveStatus('Failed');
    }
    setTimeout(() => setSaveStatus(null), 1500);
  }

  async function handleLoadSavedLoadout(entry) {
    if (!(await confirmDialog(`Load "${entry.name}"? This will replace your current build.`))) return;
    try {
      const decoded = await decodeLoadoutCode(entry.code, itemData);
      loadFullState(decoded);
      setShowLoadoutsPanel(false);
    } catch (err) {
      console.error('Failed to load saved loadout:', err);
      await alertDialog('Could not load this saved loadout.');
    }
  }

  async function handleDeleteSavedLoadout(id, name) {
    if (!(await confirmDialog(`Delete "${name}"? This can't be undone.`))) return;
    persistSavedLoadouts(savedLoadouts.filter((l) => l.id !== id));
  }

  // Copies an existing saved loadout's code under a new name/id, inserted right after the
  // original - lets the user branch off a build (e.g. try a different reforge) without losing it.
  function handleDuplicateSavedLoadout(entry) {
    const copy = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: `${entry.name} (copy)`,
      code: entry.code,
      savedAt: Date.now(),
    };
    const idx = savedLoadouts.findIndex((l) => l.id === entry.id);
    const next = [...savedLoadouts];
    next.splice(idx + 1, 0, copy);
    persistSavedLoadouts(next);
  }

  // Encodes the current build and copies a shareable /loadout/:code URL to the clipboard.
  async function handleExportLoadout() {
    setExportStatus('Copying...');
    try {
      const code = await encodeLoadout(currentEncodableState());
      const shortCode = await shortenLoadoutCode(code);
      await navigator.clipboard.writeText(`${window.location.origin}/loadout/${shortCode}`);
      setExportStatus('Copied!');
    } catch (err) {
      console.error('Failed to export loadout:', err);
      setExportStatus('Failed');
    }
    setTimeout(() => setExportStatus(null), 2000);
  }

  // Reads a loadout code (or full /loadout/:code URL) from the clipboard, decodes it, and confirms before applying.
  async function handleImportLoadout() {
    setImportStatus('Reading clipboard...');
    let decoded;
    try {
      const clipboardText = (await navigator.clipboard.readText()).trim();
      const match = clipboardText.match(/\/loadout\/([A-Za-z0-9_-]+)/);
      decoded = await decodeLoadoutCode(match ? match[1] : clipboardText, itemData);
    } catch (err) {
      console.error('Failed to import loadout:', err);
      await alertDialog('Could not read a valid loadout from your clipboard.');
      setImportStatus(null);
      return;
    }
    if (!(await confirmDialog('Import this loadout? This will replace your current build.'))) {
      setImportStatus(null);
      return;
    }
    loadFullState(decoded);
    setImportStatus('Imported!');
    setTimeout(() => setImportStatus(null), 2000);
  }

  // Shared hover token so a still-in-flight tooltip lookup can't clobber a newer hover or resurrect after the mouse leaves.
  const hoverTokenRef = useRef(0);
  function invalidateHover() {
    hoverTokenRef.current++;
    hideTooltip();
  }

  // Shared by both the armor and equipment columns.
  function handleGearClick(slot, pickerPath) {
    navigate(loadout[slot] ? `/hex/${slot}` : pickerPath);
  }

  async function handleGearHover(slot, label, e) {
    const equipped = loadout[slot];
    if (!equipped) {
      showTooltip([`§7${label}`, '§8Empty - click to pick one'], e.currentTarget);
      return;
    }
    const anchor = e.currentTarget;
    const token = ++hoverTokenRef.current;
    const petStats = computeBasePetStats(loadout, itemData);
    const chimeraBonus = computeItemChimeraBonus(equipped, petStats);
    const manticoreClawBonus = computeManticoreClawBonus(equipped, petStats);
    const lines = await buildFullItemTooltipLines(
      equipped.item,
      equipped.modifiers,
      itemData,
      playerStats.catacombsLevel,
      playerStats.tamingLevel,
      playerStats.wolfSlayerLevel,
      chimeraBonus,
      playerStats.generalsMedallionDigits,
      manticoreClawBonus,
      petItemStatContext(loadout.pet, itemData),
      isMythologicalTarget,
    );
    if (hoverTokenRef.current === token) showTooltip(lines, anchor);
  }

  // The same per-item tooltip build as handleWeaponHover, against an imported-weapons-list entry
  // rather than the equipped weapon.
  async function handleImportedWeaponHover(entry, e) {
    const anchor = e.currentTarget;
    const token = ++hoverTokenRef.current;
    const petStats = computeBasePetStats(loadout, itemData);
    const chimeraBonus = computeItemChimeraBonus(entry, petStats);
    const manticoreClawBonus = computeManticoreClawBonus(entry, petStats);
    const lines = await buildFullItemTooltipLines(
      entry.item,
      entry.modifiers,
      itemData,
      playerStats.catacombsLevel,
      playerStats.tamingLevel,
      playerStats.wolfSlayerLevel,
      chimeraBonus,
      playerStats.generalsMedallionDigits,
      manticoreClawBonus,
      petItemStatContext(loadout.pet, itemData),
      isMythologicalTarget,
    );
    if (hoverTokenRef.current === token) showTooltip(lines, anchor);
  }

  // The tile paints one number (Skyblock Level), but Combat, Catacombs, Taming and Wolf Slayer feed
  // the damage formula too, so the tooltip lists them.
  function handleLevelsHover(e) {
    showTooltip(
      [
        '§d§lPlayer Levels',
        `§7Skyblock Level: §f${playerStats.skyblockLevel}`,
        `§7Combat Level: §f${playerStats.combatLevel}`,
        `§7Catacombs Level: §f${playerStats.catacombsLevel}`,
        `§7Taming Level: §f${playerStats.tamingLevel}`,
        `§7Wolf Slayer: §f${playerStats.wolfSlayerLevel}`,
        '',
        '§8Click to edit',
      ],
      e.currentTarget,
    );
  }

  function handleGearRemove(slot, e) {
    e.stopPropagation();
    hideTooltip();
    removeSlot(slot);
  }

  function handleWeaponClick() {
    navigate(loadout.weapon ? '/hex/weapon' : '/weapon');
  }

  async function handleWeaponHover(e) {
    if (!loadout.weapon) {
      showTooltip(['§7Weapon', '§8Empty - click to pick one'], e.currentTarget);
      return;
    }
    const anchor = e.currentTarget;
    const token = ++hoverTokenRef.current;
    const petStats = computeBasePetStats(loadout, itemData);
    const chimeraBonus = computeItemChimeraBonus(loadout.weapon, petStats);
    const manticoreClawBonus = computeManticoreClawBonus(loadout.weapon, petStats);
    const lines = await buildFullItemTooltipLines(
      loadout.weapon.item,
      loadout.weapon.modifiers,
      itemData,
      playerStats.catacombsLevel,
      playerStats.tamingLevel,
      playerStats.wolfSlayerLevel,
      chimeraBonus,
      playerStats.generalsMedallionDigits,
      manticoreClawBonus,
      petItemStatContext(loadout.pet, itemData),
      isMythologicalTarget,
    );
    if (hoverTokenRef.current === token) showTooltip(lines, anchor);
  }

  async function handlePetHover(e) {
    if (!loadout.pet) {
      showTooltip(['§7Pet', '§8Empty - click to pick one'], e.currentTarget);
      return;
    }
    const anchor = e.currentTarget;
    const token = ++hoverTokenRef.current;
    const { item: pet, modifiers } = loadout.pet;
    const rawLoreData = await fetchNeuItem(petLoreItemId(pet.petId, applyTierBoost(loadout.pet, itemData).item.tier));
    const rawLore = rawLoreData && rawLoreData.lore && rawLoreData.lore.length > 0 ? rawLoreData : false;
    // Ankylosaurus's Armored Tank turns Defense into Strength, so the tooltip needs the same
    // Defense the damage calculation uses - see lib/playerDefense.js.
    const playerDefense = await computePlayerDefense(loadout, itemData, playerStats, attributes, godPotionActive);
    const lines = buildPetTooltipLines(pet, modifiers, itemData, rawLore, playerDefense);
    if (hoverTokenRef.current === token) showTooltip(lines, anchor);
  }

  function handleAccessoryHover(e) {
    if (!loadout.accessory?.item) {
      const mp = loadout.accessory?.modifiers?.magicalPower;
      showTooltip(
        mp
          ? ['§7Accessories', `§7Magical Power: §b${mp}`, '§8No Power Stone selected yet - click to pick one']
          : ['§7Accessories', '§8Empty - click to pick a power'],
        e.currentTarget,
      );
      return;
    }
    const { item, modifiers } = loadout.accessory;
    const power = getPowerById(item.id);
    const stats = computeAccessoryTotalStats(item.id, modifiers.magicalPower, modifiers.tuning);
    const lines = [`§d§l${formatItemName(item.name)}`, `§7${power ? power.type : ''}`, `§7Magical Power: §b${modifiers.magicalPower}`, ''];
    for (const [key, value] of Object.entries(stats)) {
      const meta = STAT_LABELS[key];
      if (!meta || !value) continue;
      lines.push(`§7${meta.label}: §${meta.color}${formatStatValue(key, Math.round(value * 10) / 10)}`);
    }
    showTooltip(lines, e.currentTarget);
  }

  function handleTargetMobHover(e) {
    if (targetMobs.length === 0) {
      showTooltip(['§7Target Mobs', '§8Empty - click to pick some'], e.currentTarget);
      return;
    }
    const lines = ['§d§lTarget Mobs'];
    for (const name of targetMobs) {
      const types = MOB_TYPES[name] || [];
      lines.push(`§f${name} §7(${types.join(', ')})`);
    }
    showTooltip(lines, e.currentTarget);
  }

  function handleTargetMobRemove(e) {
    e.stopPropagation();
    hideTooltip();
    clearTargetMobs();
  }

  // Renders one gear slot cell (icon + bottom label + remove button when equipped) - shared by both gear columns.
  function renderGearSlot(key, slot, label, pickerPath) {
    const equipped = loadout[slot];
    const tier = equipped ? getDisplayTier(equipped.item, equipped.modifiers) : null;
    const cornerBadge = equipped ? getItemCornerBadge(equipped.item.id, slot, equipped.modifiers) : null;
    return (
      <div
        key={key}
        className={`${slotBase} relative cursor-pointer hover:brightness-110`}
        style={equipped ? EQUIPPED_BG_STYLE : undefined}
        onClick={handleTapOrActivate(slot, (e) => handleGearHover(slot, label, e), () => handleGearClick(slot, pickerPath))}
        onMouseEnter={guardHover((e) => handleGearHover(slot, label, e))}
        onMouseLeave={guardHover(invalidateHover)}
      >
        {equipped ? (
          <WeaponIcon
            id={equipped.item.id}
            material={equipped.item.material}
            alt={equipped.item.name}
            className={iconImg}
            color={equipped.item.color}
            style={{ filter: rarityGlowFilter(tier) }}
          />
        ) : (
          <img src={SLOT_TEXTURES.emptyGemSlot} alt="" className={slotFillImg} />
        )}
        {equipped && (
          <span
            className={removeBtn}
            title={`Remove ${label}`}
            onClick={(e) => handleGearRemove(slot, e)}
          >
            ✕
          </span>
        )}
        <span className="absolute bottom-0.5 left-0 right-0 text-center text-[8px] sm:text-[9px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] truncate px-0.5">
          {label}
        </span>
        {cornerBadge && (
          <span className="absolute bottom-0.5 right-0.5 z-20 text-[8px] font-bold text-white bg-black/75 leading-none px-[3px] py-[1px] rounded-[2px]">
            {cornerBadge}
          </span>
        )}
      </div>
    );
  }

  if (showEntry) {
    return <EntryScreen onSkip={dismissEntry} />;
  }

  const cells = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 9; col++) {
      const key = `${row}-${col}`;

      // Column B, row 0 (above Necklace): Equipment Options - clear-all + "Edit All" mode for the
      // 4 equipment slots below, opened as a popup bubble (see pages/EquipmentOptions.jsx) instead
      // of a routed page.
      if (col === 1 && row === 0) {
        cells.push(
          <div
            key={key}
            className={`${slotBase} relative cursor-pointer hover:brightness-110 ${editAllEquipment ? 'bg-green-400' : ''}`}
            title="Equipment Options"
            onClick={() => setShowEquipmentOptions(true)}
          >
            <img src="/images/manual/cmd.webp" alt="" className={iconImg} />
            <span className="absolute bottom-0.5 left-0 right-0 text-center text-[8px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] truncate px-0.5">
              Equip. Options
            </span>
          </div>,
        );
        continue;
      }

      // Column C, row 0 (above Helmet): Armor Options - same 2 conveniences for the 4 armor slots
      // below, opened as a popup bubble (see pages/ArmorOptions.jsx) instead of a routed page.
      if (col === 2 && row === 0) {
        cells.push(
          <div
            key={key}
            className={`${slotBase} relative cursor-pointer hover:brightness-110 ${editAllArmor ? 'bg-green-400' : ''}`}
            title="Armor Options"
            onClick={() => setShowArmorOptions(true)}
          >
            <img src="/images/manual/cmd.webp" alt="" className={iconImg} />
            <span className="absolute bottom-0.5 left-0 right-0 text-center text-[8px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] truncate px-0.5">
              Armor Options
            </span>
          </div>,
        );
        continue;
      }

      // Column B: the 4 equipment slots, rows 2-5.
      if (col === 1 && row >= 1 && row <= 4) {
        const slot = EQUIPMENT_SLOTS[row - 1];
        cells.push(renderGearSlot(key, slot, EQUIPMENT_SLOT_LABELS[slot], `/equipment/${slot}`));
        continue;
      }

      // Column C: the 4 armor slots, rows 2-5.
      if (col === 2 && row >= 1 && row <= 4) {
        const slot = ARMOR_SLOTS[row - 1];
        cells.push(renderGearSlot(key, slot, ARMOR_SLOT_LABELS[slot], `/armor/${slot}`));
        continue;
      }

      // Column D, row 1: Player Levels - shows Skyblock Level colored by its level-color bracket; click opens the edit page.
      if (col === 3 && row === 1) {
        cells.push(
          <div
            key={key}
            className={`${slotBase} relative cursor-pointer hover:brightness-110`}
            onClick={handleTapOrActivate('levels', handleLevelsHover, () => navigate('/player-levels'))}
            onMouseEnter={guardHover(handleLevelsHover)}
            onMouseLeave={guardHover(invalidateHover)}
          >
            <span
              className="text-sm font-bold leading-none whitespace-nowrap drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]"
              style={{ color: getSkyblockLevelColor(playerStats.skyblockLevel) }}
            >
              [{playerStats.skyblockLevel}]
            </span>
            <span className="absolute bottom-0.5 left-0 right-0 text-center text-[8px] sm:text-[9px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] truncate px-0.5">
              Levels
            </span>
          </div>,
        );
        continue;
      }

      // Column D: Accessories (row 2), weapon (row 3), pet (row 4).
      if (col === 3 && row === 2) {
        cells.push(
          <div
            key={key}
            className={`${slotBase} relative cursor-pointer hover:brightness-110`}
            style={loadout.accessory?.item ? EQUIPPED_BG_STYLE : undefined}
            onClick={handleTapOrActivate('accessory', handleAccessoryHover, () => navigate('/accessory'))}
            onMouseEnter={guardHover(handleAccessoryHover)}
            onMouseLeave={guardHover(invalidateHover)}
          >
            {loadout.accessory?.item ? (
              <WeaponIcon
                id={loadout.accessory.item.iconId}
                material={loadout.accessory.item.material}
                alt={loadout.accessory.item.name}
                className={iconImg}
              />
            ) : (
              <img src={SLOT_TEXTURES.emptyGemSlot} alt="" className={slotFillImg} />
            )}
            {loadout.accessory?.item && (
              <span
                className={removeBtn}
                title="Remove Accessories"
                onClick={(e) => handleGearRemove('accessory', e)}
              >
                ✕
              </span>
            )}
            <span className="absolute bottom-0.5 left-0 right-0 text-center text-[8px] sm:text-[9px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] truncate px-0.5">
              Accessories
            </span>
          </div>,
        );
        continue;
      }

      if (col === 3 && row === 3) {
        cells.push(
          <div
            key={key}
            className={`${slotBase} relative cursor-pointer hover:brightness-110`}
            style={loadout.weapon ? EQUIPPED_BG_STYLE : undefined}
            onClick={handleTapOrActivate('weapon', handleWeaponHover, handleWeaponClick)}
            onMouseEnter={guardHover(handleWeaponHover)}
            onMouseLeave={guardHover(invalidateHover)}
          >
            {loadout.weapon ? (
              <WeaponIcon
                id={loadout.weapon.item.id}
                material={loadout.weapon.item.material}
                alt={loadout.weapon.item.name}
                className={iconImg}
                style={{ filter: rarityGlowFilter(getDisplayTier(loadout.weapon.item, loadout.weapon.modifiers)) }}
              />
            ) : (
              <img src={SLOT_TEXTURES.emptyGemSlot} alt="" className={slotFillImg} />
            )}
            {loadout.weapon && (
              <span
                className={removeBtn}
                title="Remove Weapon"
                onClick={(e) => handleGearRemove('weapon', e)}
              >
                ✕
              </span>
            )}
            <span className="absolute bottom-0.5 left-0 right-0 text-center text-[8px] sm:text-[9px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] truncate px-0.5">
              Weapon
            </span>
          </div>,
        );
        continue;
      }
      if (col === 3 && row === 4) {
        cells.push(
          <div
            key={key}
            className={`${slotBase} relative cursor-pointer hover:brightness-110`}
            style={loadout.pet ? EQUIPPED_BG_STYLE : undefined}
            onClick={handleTapOrActivate('pet', handlePetHover, () => navigate(loadout.pet ? '/pet/detail' : '/pet'))}
            onMouseEnter={guardHover(handlePetHover)}
            onMouseLeave={guardHover(invalidateHover)}
          >
            {loadout.pet ? (
              <WeaponIcon
                id={loadout.pet.item.petId}
                material="BONE"
                alt={loadout.pet.item.name}
                className={iconImg}
                style={{ filter: rarityGlowFilter(applyTierBoost(loadout.pet, itemData).item.tier) }}
              />
            ) : (
              <img src={SLOT_TEXTURES.emptyGemSlot} alt="" className={slotFillImg} />
            )}
            {loadout.pet && (
              <span
                className={removeBtn}
                title="Remove Pet"
                onClick={(e) => handleGearRemove('pet', e)}
              >
                ✕
              </span>
            )}
            <span className="absolute bottom-0.5 left-0 right-0 text-center text-[8px] sm:text-[9px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] truncate px-0.5">
              Pet
            </span>
          </div>,
        );
        continue;
      }

      // Column E, rows 1-4, beside Weapon: the imported-weapons list - every weapon
      // lib/hypixelImport.js's buildWeaponInventoryList found in the account's inventory, not only the
      // equipped one, so swapping between owned weapons needs no re-import. One spanning tile holding
      // a scrollable icon grid, since a name-and-level row per weapon doesn't fit a 1-column cell.
      if (col === 4 && row === 1) {
        cells.push(
          <div key={key} className={`${slotBase} relative row-span-4 p-1`}>
            {importedWeapons.length === 0 ? (
              <div
                className="w-full h-full flex items-center justify-center cursor-pointer hover:brightness-110"
                onClick={() => navigate('/hypixel-import')}
                title="Import from Hypixel to fill this list"
              >
                <span className="text-[9px] font-bold text-white/70 text-center px-1 leading-tight">
                  Import to
                  <br />
                  fill
                </span>
              </div>
            ) : (
              <div className="w-full h-full overflow-y-auto grid grid-cols-2 gap-0.5 content-start">
                {importedWeapons.map((entry, i) => {
                  const equipped = loadout.weapon?.item?.id === entry.item.id;
                  return (
                    <button
                      key={i}
                      type="button"
                      title={`${formatItemName(entry.item.name)}${equipped ? ' (equipped)' : ''}`}
                      className={`relative flex items-center justify-center aspect-square border-2 outline outline-1 outline-black cursor-pointer hover:brightness-110 ${
                        equipped
                          ? 'bg-green-500/70 border-t-green-300 border-l-green-300 border-b-green-800 border-r-green-800'
                          : 'bg-[#8b8b8b] border-t-[#c9c9c9] border-l-[#c9c9c9] border-b-[#4a4a4a] border-r-[#4a4a4a]'
                      }`}
                      onClick={() => equipImportedWeapon(entry)}
                      onMouseEnter={guardHover((e) => handleImportedWeaponHover(entry, e))}
                      onMouseLeave={guardHover(hideTooltip)}
                    >
                      <WeaponIcon
                        id={entry.item.id}
                        material={entry.item.material}
                        alt={entry.item.name}
                        className="w-[75%] h-[75%] object-contain pixelated"
                        style={{ filter: rarityGlowFilter(getDisplayTier(entry.item, entry.modifiers)) }}
                      />
                    </button>
                  );
                })}
              </div>
            )}
            <span className="absolute bottom-0.5 left-0 right-0 text-center text-[8px] sm:text-[9px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] truncate px-0.5 pointer-events-none">
              Weapons
            </span>
          </div>,
        );
        continue;
      }
      if (col === 4 && row >= 2 && row <= 4) continue;

      // Columns F/G/H, rows 1-4: Target Mob - one tile spanning the full 3x4 block, filled with
      // the real mob-model renders of every selected mob (overlapping when there's more than one).
      if (col === 5 && row === 1) {
        cells.push(
          <div
            key={key}
            className={`${slotBase} relative cursor-pointer hover:brightness-110 col-span-3 row-span-4`}
            onClick={handleTapOrActivate('target-mob', handleTargetMobHover, () => navigate('/target-mob'))}
            onMouseEnter={guardHover(handleTargetMobHover)}
            onMouseLeave={guardHover(invalidateHover)}
          >
            {targetMobs.length === 0 ? (
              <span className="text-xs font-bold text-white text-center px-2 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                Select Mob
              </span>
            ) : (
              <div className="relative w-full h-full">
                {targetMobs.map((name, i) => {
                  const n = targetMobs.length;
                  // Each mob centers on its own divider - the midpoint of the tile split into n
                  // equal columns - but stays oversized relative to that column so neighbors overlap.
                  const center = ((i + 0.5) / n) * 100;
                  const size = Math.max(42, 72 - Math.max(0, n - 2) * 7);
                  return (
                    <img
                      key={name}
                      src={getMobModelIcon(name) || getMobIconDataUri(name)}
                      alt={name}
                      className="absolute top-1/2 object-contain pixelated"
                      style={{
                        left: `${center}%`,
                        width: `${size}%`,
                        height: `${size}%`,
                        transform: 'translate(-50%, -50%)',
                        zIndex: i,
                      }}
                    />
                  );
                })}
              </div>
            )}
            {targetMobs.length > 0 && (
              <span
                className={removeBtn}
                title="Remove Target Mob"
                onClick={handleTargetMobRemove}
              >
                ✕
              </span>
            )}
            <span className="absolute bottom-0.5 left-0 right-0 text-center text-[10px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] whitespace-nowrap truncate px-1">
              {targetMobs.length === 0
                ? 'Target'
                : targetMobs.length === 1
                  ? targetMobs[0]
                  : `${targetMobs.length} Mobs`}
            </span>
          </div>,
        );
        continue;
      }
      if (col >= 5 && col <= 7 && row >= 1 && row <= 4) continue;

      // Row 5, columns B and C: Buff/Blessing and Debuffs, shown in every mode - item buffs and
      // debuffs apply everywhere, and only the Dungeon Blessings inside the first page are
      // Dungeon-gated. Board tiles rather than panels in the damage breakdown, lit green when
      // something is active, the same cue the Attributes tile uses.
      if (row === 5 && (col === 1 || col === 2)) {
        const isBlessings = col === 1;
        let lit;
        let tooltipLines;
        if (isBlessings) {
          const activeBuffs = BUFF_ITEMS.filter((b) => buffs?.[b.id]);
          // Blessings only count while they can apply - outside a dungeon they're inert, so they
          // neither light the tile nor list in its tooltip.
          const activeBlessings = useDungeonizedStats ? DUNGEON_BLESSINGS.filter((b) => (blessing.levels?.[b.id] || 0) > 0) : [];
          const paulBuff = useDungeonizedStats && !!blessing.paulBuff;
          lit = activeBuffs.length > 0 || activeBlessings.length > 0 || paulBuff;
          tooltipLines = [
            '§d§lBuff/Blessing',
            ...activeBuffs.map((b) => `§a${b.label}`),
            ...activeBlessings.map((b) => `§7${b.label} Blessing §f${blessing.levels[b.id]}`),
            ...(paulBuff ? ['§6Paul Buff'] : []),
            ...(useDungeonizedStats ? [`§8Blessing effectiveness x${Math.round(computeBlessingMultiplier(blessing, attributes) * 100) / 100}`] : []),
            ...(lit ? [] : ['§8None active - click to edit']),
          ];
        } else {
          lit = hasAnyDebuff(debuffs);
          tooltipLines = lit
            ? [
                '§c§lDebuffs',
                `§7Mob Defense §fx${Math.round(mobDefenseDebuffMultiplier(debuffs) * 100) / 100}`,
                `§7Final damage §fx${Math.round(finalDamageDebuffMultiplier(debuffs) * 100) / 100}`,
              ]
            : ['§7Debuffs', '§8None active - click to edit'];
        }
        const path = isBlessings ? '/blessings' : '/debuffs';
        const handleHover = (e) => showTooltip(tooltipLines, e.currentTarget);
        cells.push(
          <div
            key={key}
            className={`${slotBase} relative cursor-pointer hover:brightness-110 ${lit ? 'bg-green-400' : ''}`}
            onClick={handleTapOrActivate(path, handleHover, () => navigate(path))}
            onMouseEnter={guardHover(handleHover)}
            onMouseLeave={guardHover(hideTooltip)}
          >
            <span className="text-[9px] font-bold text-white text-center px-1 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
              {isBlessings ? 'Buff/Blessing' : 'Debuffs'}
            </span>
          </div>,
        );
        continue;
      }

      // Column D, row 5 (right below Pet): Attributes - plain text tile, account-wide rather than tied to an item.
      if (col === 3 && row === 5) {
        const leveledCount = Object.values(attributes).filter((v) => v > 0).length;
        const attributesTooltipLines = leveledCount > 0
          ? [`§d§lAttributes`, `§7${leveledCount} attribute${leveledCount === 1 ? '' : 's'} leveled`]
          : ['§7Attributes', '§8None leveled - click to edit'];
        const handleAttributesHover = (e) => showTooltip(attributesTooltipLines, e.currentTarget);
        cells.push(
          <div
            key={key}
            className={`${slotBase} relative cursor-pointer hover:brightness-110 ${leveledCount > 0 ? 'bg-green-400' : ''}`}
            onClick={handleTapOrActivate('attributes', handleAttributesHover, () => navigate('/attributes'))}
            onMouseEnter={guardHover(handleAttributesHover)}
            onMouseLeave={guardHover(hideTooltip)}
          >
            <span className="text-[9px] font-bold text-white text-center px-1 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
              Attributes
            </span>
          </div>,
        );
        continue;
      }

      // Bottom-right of the Target Mob block: Hard Reset, drawn with a Barrier block texture so it
      // reads as destructive at a glance. Gated behind confirmDialog, since it wipes this app's whole
      // localStorage rather than the current loadout.
      if (col === 7 && row === 5) {
        cells.push(
          <div
            key={key}
            className={`${slotBase} cursor-pointer hover:brightness-110`}
            title="Hard Reset Everything"
            onClick={handleHardReset}
            onMouseEnter={guardHover((e) => showTooltip(['§c§lHard Reset Everything', '§7Wipes your current build, saved', '§7Loadouts, and every other saved', '§7setting. Cannot be undone.'], e.currentTarget))}
            onMouseLeave={guardHover(hideTooltip)}
          >
            <img src="/images/vanilla/Barrier.webp" alt="Hard Reset Everything" className="w-[70%] h-[70%] object-contain pixelated" />
          </div>,
        );
        continue;
      }

      // Bottom-left: the potion. Which one depends on the Dungeon toggle - inside a dungeon it is the
      // Dungeon Potion, a different set of effects with no mixin (lib/godPotion.js) - so the tile
      // relabels rather than pretending one potion covers both. Styled like every other tile, with the
      // bottom-anchored white label; the <select> stays a transparent full-tile overlay so the picker,
      // keyboard and screen readers behave as before.
      if (col === 0 && row === 5) {
        const dungeonPotion = useDungeonizedStats;
        const potionValue = !godPotionActive ? 'off' : godPotionMixin === 'spider_egg' ? 'spider_egg' : 'on';
        const potionTier = dungeonPotionEffects(hasJellyfishPet);
        const potionLabel = !godPotionActive
          ? dungeonPotion
            ? 'Dungeon Pot'
            : 'God Potion'
          : dungeonPotion
            ? potionTier.label
            : potionValue === 'spider_egg'
              ? '+Spider Egg'
              : 'God Potion';
        const potionTooltip = dungeonPotion ? getDungeonPotionTooltipLines(hasJellyfishPet) : getGodPotionTooltipLines(godPotionMixin);
        const potionOptions = dungeonPotion
          ? [
              { value: 'off', label: 'Off' },
              { value: 'on', label: `Dungeon Potion (${potionTier.label})` },
            ]
          : [
              { value: 'off', label: 'Off' },
              { value: 'on', label: 'God Potion' },
              { value: 'spider_egg', label: '+Spider Egg' },
            ];
        const applyPotionValue = (next) => {
          setGodPotionActive(next !== 'off');
          setGodPotionMixin(next === 'spider_egg' ? 'spider_egg' : 'none');
          setPotionMenuOpen(false);
        };
        const openPotionMenu = () => {
          setPotionMenuIndex(Math.max(0, potionOptions.findIndex((o) => o.value === potionValue)));
          const rect = potionMenuRef.current?.getBoundingClientRect();
          if (rect) setPotionMenuPos({ top: rect.bottom + 4, left: rect.left });
          setPotionMenuOpen(true);
        };
        const onPotionKeyDown = (e) => {
          if (!potionMenuOpen) {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              openPotionMenu();
            }
            return;
          }
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const step = e.key === 'ArrowDown' ? 1 : -1;
            setPotionMenuIndex((i) => (i + step + potionOptions.length) % potionOptions.length);
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            applyPotionValue(potionOptions[potionMenuIndex].value);
          }
        };
        cells.push(
          <div
            key={key}
            ref={potionMenuRef}
            role="button"
            tabIndex={0}
            aria-haspopup="listbox"
            aria-expanded={potionMenuOpen}
            aria-label={dungeonPotion ? 'Dungeon Potion' : 'God Potion'}
            onClick={() => (potionMenuOpen ? setPotionMenuOpen(false) : openPotionMenu())}
            onKeyDown={onPotionKeyDown}
            className={`${slotBase} relative cursor-pointer hover:brightness-110 focus:outline focus:outline-2 focus:outline-white ${godPotionActive ? 'bg-green-400' : ''}`}
            onMouseEnter={guardHover((e) => showTooltip(potionTooltip, e.currentTarget))}
            onMouseLeave={guardHover(hideTooltip)}
          >
            {/* Drops DOWN from the tile, through a portal on document.body. The tile sits in the
                grid's bottom row inside an overflow-x-auto wrapper, and a non-visible overflow-x
                forces overflow-y to match, so rendering the menu in place got it clipped. */}
            {potionMenuOpen &&
              potionMenuPos &&
              createPortal(
              <ul
                ref={potionListRef}
                role="listbox"
                aria-label={dungeonPotion ? 'Dungeon Potion' : 'God Potion'}
                style={{ top: potionMenuPos.top, left: potionMenuPos.left }}
                className={`${dropdownPanel} fixed z-50 min-w-max py-0.5 flex flex-col cursor-default`}
                onMouseEnter={guardHover(hideTooltip)}
              >
                {potionOptions.map((option, i) => {
                  const selected = option.value === potionValue;
                  return (
                    <li
                      key={option.value}
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={() => setPotionMenuIndex(i)}
                      onClick={(e) => {
                        e.stopPropagation();
                        applyPotionValue(option.value);
                      }}
                      className={`px-2 py-1 text-[10px] font-bold whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                        i === potionMenuIndex ? dropdownItemActive : dropdownItemMuted
                      }`}
                    >
                      <span className="w-2 shrink-0">{selected ? '✔' : ''}</span>
                      {option.label}
                    </li>
                  );
                })}
              </ul>,
                document.body,
              )}
            {/* The Dungeon Potion has its own art; the God Potion still resolves through the
                catalog icon lookup like every other real item id. */}
            {dungeonPotion ? (
              <img
                src="/images/manual/dpot.webp"
                alt="Dungeon Potion"
                className={`${iconImg} ${godPotionActive ? '' : 'opacity-50 grayscale'}`}
              />
            ) : (
              <WeaponIcon
                id="GOD_POTION"
                material="POTION"
                alt="God Potion"
                className={`${iconImg} ${godPotionActive ? '' : 'opacity-50 grayscale'}`}
              />
            )}
            <span className="absolute bottom-0.5 left-0 right-0 text-center text-[8px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] truncate px-0.5 pointer-events-none">
              {potionLabel}
            </span>
          </div>,
        );
        continue;
      }

      cells.push(
        <div key={key} className={slotBase}>
          <img src={SLOT_TEXTURES.empty} alt="" className={slotFillImg} />
        </div>,
      );
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-4 relative">
      {/* Below xl everything stacks in DOM order - toolbar, board, Recommended Upgrades, the jump
          button, the breakdown - so the panel lands under the board. At xl the panel moves into its
          own right-hand column, spanning every row and sticky, so it stays beside whatever you are
          reading and can't cover the board. 700 + 340 + gap clears the edges at 1280px even with
          index.css's site-wide 1.15 zoom. */}
      <div className="w-full flex flex-col items-center xl:grid xl:grid-cols-[minmax(0,700px)_340px] xl:justify-center xl:items-start xl:gap-x-4">
      {/* Combined Loadout panel (Export/Import plus saved Loadouts), in normal document flow above the
          grid rather than pinned over content, so it can never overlap the GUI at any viewport size.
          Centred to match the grid below. */}
      <div className="w-full flex justify-center mb-1.5 xl:col-start-1">
        <div className={`z-10 flex flex-col gap-1.5 p-2 max-w-full ${toolbar}`}>
          <span className="text-[10px] font-bold text-black uppercase tracking-wide">Loadout</span>
          <div className="flex flex-wrap gap-1.5">
            <ToolbarButton
              icon="/images/ui/hypixel.webp"
              label="Import from Hypixel"
              shortLabel="Hypixel"
              onClick={() => navigate('/hypixel-import')}
            />
            <ToolbarButton
              icon="/images/ui/loadouts.webp"
              label="Loadouts"
              shortLabel="Loadouts"
              onClick={() => setShowLoadoutsPanel((v) => !v)}
            />
            <ToolbarButton
              icon="/images/manual/Coins.webp"
              label={costResult ? 'Hide Cost' : 'Cost'}
              shortLabel={costResult ? 'Hide Cost' : 'Cost'}
              onClick={handleCalculateSetupCost}
            />
            <ToolbarButton
              icon="/images/ui/export.webp"
              label={exportStatus || 'Export to Clipboard'}
              shortLabel={exportStatus || 'Export'}
              onClick={handleExportLoadout}
            />
            <ToolbarButton
              icon="/images/ui/import.webp"
              label={importStatus || 'Import from Clipboard'}
              shortLabel={importStatus || 'Import'}
              onClick={handleImportLoadout}
            />
            <ToolbarButton icon="/images/manual/comp.webp" label="Compare" shortLabel="Compare" pixelated onClick={() => navigate('/compare')} />
          </div>
          {costResult && (
            <div className="w-64 flex flex-col gap-1 text-[12px]">
              {LOADOUT_COST_SECTIONS.map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between gap-2 text-white">
                  <span className="text-neutral-300">{label}</span>
                  <span className="font-mono">
                    {typeof costResult.breakdown[key] === 'number' ? formatCoinsShort(costResult.breakdown[key]) : '?'}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-2 pt-1 mt-1 border-t border-neutral-600 font-bold text-white">
                <span>Total{costResult.hasUnknown ? ' (partial)' : ''}</span>
                <span className="font-mono">{formatCoinsShort(costResult.total)}</span>
              </div>
            </div>
          )}
          {showLoadoutsPanel && (
            <div className="w-64 flex flex-col gap-1">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newLoadoutName}
                  onChange={(e) => setNewLoadoutName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveLoadout()}
                  placeholder="Loadout name"
                  className="flex-1 min-w-0 text-[12px] px-2 py-1 rounded bg-neutral-800 border border-neutral-600 text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-400"
                />
                <button
                  className="text-[12px] px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                  onClick={handleSaveLoadout}
                  disabled={!newLoadoutName.trim()}
                >
                  {saveStatus || 'Save'}
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto flex flex-col gap-1">
                {savedLoadouts.length === 0 ? (
                  <p className="text-[11px] text-black/70 italic">No saved loadouts yet.</p>
                ) : (
                  savedLoadouts.map((entry) => {
                    const helmetPreview = helmetPreviews[entry.id];
                    return (
                    <div key={entry.id} className="flex items-center gap-1.5">
                      <button
                        className="flex-1 min-w-0 flex flex-col items-start text-left px-2 py-1 rounded bg-neutral-800 text-white hover:bg-neutral-700 transition-colors cursor-pointer"
                        onClick={() => handleLoadSavedLoadout(entry)}
                        title={entry.name}
                      >
                        <span className="text-[12px] w-full truncate">{entry.name}</span>
                        <span className="text-[10px] text-neutral-400 w-full truncate">
                          {helmetPreview === undefined ? '…' : helmetPreview ? `⛑️ ${helmetPreview}` : 'No helmet'}
                        </span>
                      </button>
                      <button
                        className="text-[11px] px-1.5 py-1 rounded bg-neutral-800 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                        title={`Duplicate "${entry.name}"`}
                        onClick={() => handleDuplicateSavedLoadout(entry)}
                      >
                        ⧉
                      </button>
                      <button
                        className="text-[11px] px-1.5 py-1 rounded bg-neutral-800 text-neutral-400 hover:text-red-400 transition-colors cursor-pointer"
                        title={`Delete "${entry.name}"`}
                        onClick={() => handleDeleteSavedLoadout(entry.id, entry.name)}
                      >
                        ✕
                      </button>
                    </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* min-w 340 (was 380): at 380 the board overflowed a 375px phone viewport, so the Target
          Mob panel and the whole right-hand column sat off-screen behind a horizontal scrollbar
          most people never find. 340 fits the narrowest common viewport whole. */}
      <div className="w-full max-w-[700px] overflow-x-auto xl:col-start-1">
        <div className="grid grid-cols-9 grid-rows-6 gap-[3px] w-full min-w-[340px] aspect-[9/6] bg-[#c6c6c6]/75 backdrop-blur-[1px] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black p-2">
          {cells}
        </div>
      </div>

      <aside className="w-full max-w-[700px] mt-4 xl:mt-0 xl:max-w-none xl:col-start-2 xl:row-start-1 xl:row-span-4 xl:self-stretch">
        {/* Height divides by --page-zoom: with index.css's site-wide zoom, 100vh is the unzoomed
            viewport, so an undivided cap was ~15% taller than the screen and the panel's title slid
            up under the top bar while stuck. */}
        <div className="xl:sticky xl:top-16 xl:max-h-[calc(100vh/var(--page-zoom)_-_5.5rem)] xl:overflow-y-auto">
          <UpgradesPanel variant="column" />
        </div>
      </aside>

      <button
        ref={setJumpButtonEl}
        className="mt-3 xl:col-start-1 xl:justify-self-center px-8 py-3 text-lg font-bold text-white bg-[#3a8f3a] border-[3px] border-t-[#6fd66f] border-l-[#6fd66f] border-b-[#1f4f1f] border-r-[#1f4f1f] outline outline-2 outline-black shadow-[0_3px_0_0_#000] active:shadow-none active:translate-y-[3px] hover:brightness-110 cursor-pointer flex items-center gap-2"
        onClick={() => damageSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      >
        <img src="/images/manual/dmg.webp" alt="" className="w-6 h-6 pixelated" />
        View Damage Breakdown
      </button>

      {/* Merged inline (see the lazy DamageSources import above) instead of a separate route -
          equipping gear above and reading its damage breakdown below now happen on one page. */}
      <div ref={damageSectionRef} className="w-full mt-6 pt-6 border-t-2 border-white/10 flex flex-col items-center xl:col-start-1">
        <Suspense fallback={<div className="text-sm text-neutral-400">Loading damage calculation...</div>}>
          <DamageSources embedded hideSticky={jumpButtonVisible} />
        </Suspense>
      </div>

      </div>

      {showArmorOptions && <ArmorOptions onClose={() => setShowArmorOptions(false)} />}
      {showEquipmentOptions && <EquipmentOptions onClose={() => setShowEquipmentOptions(false)} />}
    </div>
  );
}

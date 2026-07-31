import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useItemData } from '../context/ItemDataContext';
import { useTooltip } from '../context/TooltipContext';
import { ARMOR_SLOTS, ARMOR_SLOT_LABELS } from '../lib/armorSlots';
import { EQUIPMENT_SLOTS, EQUIPMENT_SLOT_LABELS } from '../lib/equipmentSlots';
import { buildFullItemTooltipLines } from '../lib/itemTooltip';
import {
  petLoreItemId,
  buildPetTooltipLines,
  computeEquippedPetStats,
  computeItemChimeraBonus,
  computeManticoreClawBonus,
} from '../lib/petData';
import { fetchNeuItem } from '../lib/neuItems';
import { getPowerById, computeAccessoryTotalStats } from '../lib/accessoryPowers';
import { getSkyblockLevelColor } from '../lib/playerStats';
import { MOB_TYPES } from '../lib/mobTypes';
import { getMobModelIcon, getMobIconDataUri } from '../lib/mobIcons';
import { getZoneStyle } from '../lib/background';
import { useTheme } from '../context/ThemeContext';
import { GOD_POTION_TOOLTIP_LINES } from '../lib/godPotion';
import { STAT_LABELS, formatStatValue } from '../lib/reforgeData';
import { formatItemName } from '../lib/mcText';
import { SLOT_TEXTURES } from '../lib/icons';
import { encodeLoadout, decodeLoadoutCode } from '../lib/loadoutCode';
import WeaponIcon from '../components/WeaponIcon';

const slotBase =
  'flex items-center justify-center bg-[#8b8b8b]/80 shadow-[inset_2px_2px_0_0_#373737,inset_-2px_-2px_0_0_#ffffff]';
// Same bordered-panel look as the main chest-GUI grid (and every other page's Back button) —
// reused here so Export/Import/Loadouts stay visually consistent and theme-aware instead of a
// generic floating pill that can wash out against a busy background gif.
const toolbar =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';
const iconImg = 'w-[70%] h-[70%] object-contain pixelated';
const slotFillImg = 'w-full h-full object-cover pixelated';

const SAVED_LOADOUTS_KEY = 'skydmgSavedLoadouts';

function loadSavedLoadoutsFromStorage() {
  try {
    const raw = localStorage.getItem(SAVED_LOADOUTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

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
    useDungeonizedStats,
    useMasterMode,
    toggleGodPotion,
    attributes,
    miscStats,
    mobHpPercent,
    infernalCrimsonStacks,
    swarmMobs,
    comboKills,
    legionPlayers,
    blazeCrimsonIsle,
    loadFullState,
  } = useBuild();
  const { itemData } = useItemData();
  const { showTooltip, hideTooltip } = useTooltip();
  const [exportStatus, setExportStatus] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  const [savedLoadouts, setSavedLoadouts] = useState(loadSavedLoadoutsFromStorage);
  const [showLoadoutsPanel, setShowLoadoutsPanel] = useState(false);
  const [newLoadoutName, setNewLoadoutName] = useState('');
  const [saveStatus, setSaveStatus] = useState(null);

  // Zone theme+backdrop keyed off the first selected Target Mob (see lib/background.js) —
  // background and GUI theme always change together so they never clash. Falls back to the
  // SkyBlock hub, day or night, when nothing's selected. Re-applied whenever the target mob
  // selection changes; the ThemeSwitcher can still freely override it afterward (shared
  // ThemeContext keeps both in sync) — this just sets a sensible matching default.
  const zoneStyle = useMemo(() => getZoneStyle(targetMobs), [targetMobs]);
  const { setTheme } = useTheme();
  useEffect(() => {
    setTheme(zoneStyle.theme);
  }, [zoneStyle.theme, setTheme]);

  function persistSavedLoadouts(next) {
    setSavedLoadouts(next);
    localStorage.setItem(SAVED_LOADOUTS_KEY, JSON.stringify(next));
  }

  // Encodes the current build (reusing the share-link codec) and stores it under a user-given name.
  async function handleSaveLoadout() {
    const name = newLoadoutName.trim();
    if (!name) return;
    setSaveStatus('Saving...');
    try {
      const code = await encodeLoadout({
        loadout,
        targetMobs,
        attributes,
        playerStats,
        godPotionActive,
        useDungeonizedStats,
        useMasterMode,
        miscStats,
        mobHpPercent,
        infernalCrimsonStacks,
        swarmMobs,
        comboKills,
        legionPlayers,
        blazeCrimsonIsle,
      });
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
    if (!window.confirm(`Load "${entry.name}"? This will replace your current build.`)) return;
    try {
      const decoded = await decodeLoadoutCode(entry.code, itemData);
      loadFullState(decoded);
      setShowLoadoutsPanel(false);
    } catch (err) {
      console.error('Failed to load saved loadout:', err);
      window.alert('Could not load this saved loadout.');
    }
  }

  function handleDeleteSavedLoadout(id) {
    persistSavedLoadouts(savedLoadouts.filter((l) => l.id !== id));
  }

  // Encodes the current build and copies a shareable /loadout/:code URL to the clipboard.
  async function handleExportLoadout() {
    setExportStatus('Copying...');
    try {
      const code = await encodeLoadout({
        loadout,
        targetMobs,
        attributes,
        playerStats,
        godPotionActive,
        useDungeonizedStats,
        useMasterMode,
        miscStats,
        mobHpPercent,
        infernalCrimsonStacks,
        swarmMobs,
        comboKills,
        legionPlayers,
        blazeCrimsonIsle,
      });
      await navigator.clipboard.writeText(`${window.location.origin}/loadout/${code}`);
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
      window.alert('Could not read a valid loadout from your clipboard.');
      setImportStatus(null);
      return;
    }
    if (!window.confirm('Import this loadout? This will replace your current build.')) {
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
      showTooltip([`§7${label}`, '§8Empty — click to pick one'], e.currentTarget);
      return;
    }
    const anchor = e.currentTarget;
    const token = ++hoverTokenRef.current;
    const petStats = computeEquippedPetStats(loadout, itemData);
    const chimeraBonus = computeItemChimeraBonus(equipped, petStats);
    const manticoreClawBonus = computeManticoreClawBonus(equipped, petStats);
    const potatoBookDoubled = loadout.pet?.item?.petId === 'BLAZE' && loadout.pet?.item?.tier === 'LEGENDARY';
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
      potatoBookDoubled,
    );
    if (hoverTokenRef.current === token) showTooltip(lines, anchor);
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
      showTooltip(['§7Weapon', '§8Empty — click to pick one'], e.currentTarget);
      return;
    }
    const anchor = e.currentTarget;
    const token = ++hoverTokenRef.current;
    const petStats = computeEquippedPetStats(loadout, itemData);
    const chimeraBonus = computeItemChimeraBonus(loadout.weapon, petStats);
    const manticoreClawBonus = computeManticoreClawBonus(loadout.weapon, petStats);
    const potatoBookDoubled = loadout.pet?.item?.petId === 'BLAZE' && loadout.pet?.item?.tier === 'LEGENDARY';
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
      potatoBookDoubled,
    );
    if (hoverTokenRef.current === token) showTooltip(lines, anchor);
  }

  async function handlePetHover(e) {
    if (!loadout.pet) {
      showTooltip(['§7Pet', '§8Empty — click to pick one'], e.currentTarget);
      return;
    }
    const anchor = e.currentTarget;
    const token = ++hoverTokenRef.current;
    const { item: pet, modifiers } = loadout.pet;
    const rawLoreData = await fetchNeuItem(petLoreItemId(pet.petId, pet.tier));
    const rawLore = rawLoreData && rawLoreData.lore && rawLoreData.lore.length > 0 ? rawLoreData : false;
    const lines = buildPetTooltipLines(pet, modifiers, itemData, rawLore);
    if (hoverTokenRef.current === token) showTooltip(lines, anchor);
  }

  function handleAccessoryHover(e) {
    if (!loadout.accessory?.item) {
      const mp = loadout.accessory?.modifiers?.magicalPower;
      showTooltip(
        mp
          ? ['§7Accessories', `§7Magical Power: §b${mp}`, '§8No Power Stone selected yet — click to pick one']
          : ['§7Accessories', '§8Empty — click to pick a power'],
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
      showTooltip(['§7Target Mobs', '§8Empty — click to pick some'], e.currentTarget);
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

  // Renders one gear slot cell (icon + bottom label + remove button when equipped) — shared by both gear columns.
  function renderGearSlot(key, slot, label, pickerPath) {
    const equipped = loadout[slot];
    return (
      <div
        key={key}
        className={`${slotBase} relative cursor-pointer hover:brightness-110 ${equipped ? 'bg-green-400' : ''}`}
        onClick={() => handleGearClick(slot, pickerPath)}
        onMouseEnter={(e) => handleGearHover(slot, label, e)}
        onMouseLeave={invalidateHover}
      >
        {equipped ? (
          <WeaponIcon
            id={equipped.item.id}
            material={equipped.item.material}
            alt={equipped.item.name}
            className={iconImg}
            color={equipped.item.color}
          />
        ) : (
          <img src={SLOT_TEXTURES.emptyGemSlot} alt="" className={slotFillImg} />
        )}
        {equipped && (
          <span
            className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center text-[10px] leading-none bg-neutral-900 outline outline-1 outline-black hover:brightness-125 cursor-pointer"
            title={`Remove ${label}`}
            onClick={(e) => handleGearRemove(slot, e)}
          >
            🗑️
          </span>
        )}
        <span className="absolute bottom-0.5 left-0 right-0 text-center text-[9px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
          {label}
        </span>
      </div>
    );
  }

  const cells = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 9; col++) {
      const key = `${row}-${col}`;

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

      // Column D, row 1: Player Levels — shows Skyblock Level colored by its level-color bracket; click opens the edit page.
      if (col === 3 && row === 1) {
        cells.push(
          <div
            key={key}
            className={`${slotBase} relative cursor-pointer hover:brightness-110`}
            onClick={() => navigate('/player-levels')}
            title="Player Levels"
          >
            <span
              className="text-sm font-bold leading-none whitespace-nowrap drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]"
              style={{ color: getSkyblockLevelColor(playerStats.skyblockLevel) }}
            >
              [{playerStats.skyblockLevel}]
            </span>
            <span className="absolute bottom-0.5 left-0 right-0 text-center text-[9px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] whitespace-nowrap">
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
            className={`${slotBase} relative cursor-pointer hover:brightness-110 ${loadout.accessory?.item ? 'bg-green-400' : ''}`}
            onClick={() => navigate('/accessory')}
            onMouseEnter={handleAccessoryHover}
            onMouseLeave={invalidateHover}
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
                className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center text-[10px] leading-none bg-neutral-900 outline outline-1 outline-black hover:brightness-125 cursor-pointer"
                title="Remove Accessories"
                onClick={(e) => handleGearRemove('accessory', e)}
              >
                🗑️
              </span>
            )}
            <span className="absolute bottom-0.5 left-0 right-0 text-center text-[9px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
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
            className={`${slotBase} relative cursor-pointer hover:brightness-110 ${loadout.weapon ? 'bg-green-400' : ''}`}
            onClick={handleWeaponClick}
            onMouseEnter={handleWeaponHover}
            onMouseLeave={invalidateHover}
          >
            {loadout.weapon ? (
              <WeaponIcon
                id={loadout.weapon.item.id}
                material={loadout.weapon.item.material}
                alt={loadout.weapon.item.name}
                className={iconImg}
              />
            ) : (
              <img src={SLOT_TEXTURES.emptyGemSlot} alt="" className={slotFillImg} />
            )}
            {loadout.weapon && (
              <span
                className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center text-[10px] leading-none bg-neutral-900 outline outline-1 outline-black hover:brightness-125 cursor-pointer"
                title="Remove Weapon"
                onClick={(e) => handleGearRemove('weapon', e)}
              >
                🗑️
              </span>
            )}
            <span className="absolute bottom-0.5 left-0 right-0 text-center text-[9px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
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
            className={`${slotBase} relative cursor-pointer hover:brightness-110 ${loadout.pet ? 'bg-green-400' : ''}`}
            onClick={() => navigate(loadout.pet ? '/pet/detail' : '/pet')}
            onMouseEnter={handlePetHover}
            onMouseLeave={invalidateHover}
          >
            {loadout.pet ? (
              <WeaponIcon id={loadout.pet.item.petId} material="BONE" alt={loadout.pet.item.name} className={iconImg} />
            ) : (
              <img src={SLOT_TEXTURES.emptyGemSlot} alt="" className={slotFillImg} />
            )}
            {loadout.pet && (
              <span
                className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center text-[10px] leading-none bg-neutral-900 outline outline-1 outline-black hover:brightness-125 cursor-pointer"
                title="Remove Pet"
                onClick={(e) => handleGearRemove('pet', e)}
              >
                🗑️
              </span>
            )}
            <span className="absolute bottom-0.5 left-0 right-0 text-center text-[9px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
              Pet
            </span>
          </div>,
        );
        continue;
      }

      // Columns F/G/H, rows 1-4: Target Mob — one tile spanning the full 3x4 block, filled with
      // the real mob-model renders of every selected mob (overlapping when there's more than one).
      if (col === 5 && row === 1) {
        cells.push(
          <div
            key={key}
            className={`${slotBase} relative cursor-pointer hover:brightness-110 col-span-3 row-span-4`}
            onClick={() => navigate('/target-mob')}
            onMouseEnter={handleTargetMobHover}
            onMouseLeave={invalidateHover}
          >
            {targetMobs.length === 0 ? (
              <span className="text-xs font-bold text-white text-center px-2 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                Select Mob
              </span>
            ) : (
              <div className="relative w-full h-full">
                {targetMobs.map((name, i) => {
                  const n = targetMobs.length;
                  // Each mob centers on its own divider — the midpoint of the tile split into n
                  // equal columns — but stays oversized relative to that column so neighbors overlap.
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
                className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center text-[10px] leading-none bg-neutral-900 outline outline-1 outline-black hover:brightness-125 cursor-pointer z-10"
                title="Remove Target Mob"
                onClick={handleTargetMobRemove}
              >
                🗑️
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

      // Column D, row 5 (right below Pet): Attributes — plain text tile, account-wide rather than tied to an item.
      if (col === 3 && row === 5) {
        const leveledCount = Object.values(attributes).filter((v) => v > 0).length;
        cells.push(
          <div
            key={key}
            className={`${slotBase} relative cursor-pointer hover:brightness-110 ${leveledCount > 0 ? 'bg-green-400' : ''}`}
            onClick={() => navigate('/attributes')}
            onMouseEnter={(e) =>
              showTooltip(
                leveledCount > 0
                  ? [`§d§lAttributes`, `§7${leveledCount} attribute${leveledCount === 1 ? '' : 's'} leveled`]
                  : ['§7Attributes', '§8None leveled — click to edit'],
                e.currentTarget,
              )
            }
            onMouseLeave={hideTooltip}
          >
            <span className="text-[9px] font-bold text-white text-center px-1 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
              Attributes
            </span>
          </div>,
        );
        continue;
      }

      // Bottom-left: God Potion — a plain on/off toggle, clicking flips state in place.
      if (col === 0 && row === 5) {
        cells.push(
          <div
            key={key}
            className={`${slotBase} relative cursor-pointer hover:brightness-110 ${godPotionActive ? 'bg-green-400' : ''}`}
            onClick={toggleGodPotion}
            onMouseEnter={(e) => showTooltip(GOD_POTION_TOOLTIP_LINES, e.currentTarget)}
            onMouseLeave={hideTooltip}
          >
            <WeaponIcon id="GOD_POTION" material="POTION" alt="God Potion" className={`${iconImg} ${godPotionActive ? '' : 'opacity-50 grayscale'}`} />
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
      {/* Zone-themed backdrop, sits behind everything. Explicit inline background properties
          (rather than relying solely on the bg-cover/bg-center utility classes) plus redundant
          w-screen/h-screen sizing alongside inset-0, so it robustly fills edge-to-edge with no
          letterboxing on any aspect ratio — cropping the image is fine, empty space isn't. */}
      <div
        className="fixed inset-0 -z-10 w-screen h-screen"
        style={{
          backgroundImage: `url(${zoneStyle.background})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />

      {/* Combined Loadout panel (Export/Import + saved Loadouts) — sits in normal document flow,
          left-aligned at the top of the page rather than fixed/pinned over content, so it can
          never overlap the central GUI regardless of viewport size: flow-stacked elements simply
          can't occupy the same space. */}
      <div className="w-full flex justify-start mb-3">
        <div className={`z-10 flex flex-col gap-1.5 p-2 ${toolbar}`}>
          <span className="text-[10px] font-bold text-black uppercase tracking-wide">Loadout</span>
          <div className="flex gap-1.5">
            <button
              className="text-[13px] font-bold px-3 py-2 bg-neutral-800 text-white hover:brightness-125 transition-[filter] cursor-pointer whitespace-nowrap flex items-center gap-1.5"
              onClick={handleExportLoadout}
            >
              📤 {exportStatus || 'Export'}
            </button>
            <button
              className="text-[13px] font-bold px-3 py-2 bg-neutral-800 text-white hover:brightness-125 transition-[filter] cursor-pointer whitespace-nowrap flex items-center gap-1.5"
              onClick={handleImportLoadout}
            >
              📥 {importStatus || 'Import'}
            </button>
            <button
              className="text-[13px] font-bold px-3 py-2 bg-neutral-800 text-white hover:brightness-125 transition-[filter] cursor-pointer whitespace-nowrap flex items-center gap-1.5"
              onClick={() => setShowLoadoutsPanel((v) => !v)}
            >
              📁 Loadouts
            </button>
          </div>
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
                  savedLoadouts.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-1.5">
                      <button
                        className="flex-1 min-w-0 text-left text-[12px] px-2 py-1 rounded bg-neutral-800 text-white hover:bg-neutral-700 transition-colors cursor-pointer truncate"
                        onClick={() => handleLoadSavedLoadout(entry)}
                        title={entry.name}
                      >
                        {entry.name}
                      </button>
                      <button
                        className="text-[11px] px-1.5 py-1 rounded bg-neutral-800 text-neutral-400 hover:text-red-400 transition-colors cursor-pointer"
                        title={`Delete "${entry.name}"`}
                        onClick={() => handleDeleteSavedLoadout(entry.id)}
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pushes the central GUI down ~15% of the viewport for more comfortable vertical centering. */}
      <div className="h-[15vh] shrink-0" />

      <header className="w-full max-w-[700px] mb-4 text-center">
        <h1 className="text-3xl font-bold"></h1>
      </header>

      <div className="w-full max-w-[700px] overflow-x-auto">
        <div className="grid grid-cols-9 grid-rows-6 gap-[3px] w-full min-w-[380px] aspect-[9/6] bg-[#c6c6c6]/75 backdrop-blur-[1px] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black p-2">
          {cells}
        </div>
      </div>

      <button
        className="mt-4 px-8 py-3 text-lg font-bold text-white bg-[#3a8f3a] border-[3px] border-t-[#6fd66f] border-l-[#6fd66f] border-b-[#1f4f1f] border-r-[#1f4f1f] outline outline-2 outline-black shadow-[0_3px_0_0_#000] active:shadow-none active:translate-y-[3px] hover:brightness-110 cursor-pointer"
        onClick={() => navigate('/damage-sources')}
      >
        📊 Damage Calculation
      </button>
    </div>
  );
}

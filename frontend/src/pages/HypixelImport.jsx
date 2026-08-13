import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useItemData } from '../context/ItemDataContext';
import {
  fetchHypixelImport,
  mapHypixelImportToLoadout,
  resolveGearSummary,
  HypixelImportError,
} from '../lib/hypixelImport';
import { ARMOR_SLOTS } from '../lib/armorSlots';
import { EQUIPMENT_SLOTS } from '../lib/equipmentSlots';
import { formatItemName } from '../lib/mcText';
import WeaponIcon from '../components/WeaponIcon';
import PageHeader from '../components/PageHeader';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

// Raised-bevel Minecraft-button treatment for every selectable row on the Review screen (weapon
// candidates, Wardrobe source sets, per-slot include toggles) — mirrors the same bevel already
// used for this page's own Import button (grey-unselected / green-selected) instead of native
// radio/checkbox inputs, so a whole group of options reads as a stack of buttons.
const optionButtonBase =
  'flex items-center gap-2 px-2.5 py-2 text-sm text-left border-[3px] outline outline-2 outline-black transition-[filter] w-full min-w-0';
const optionButtonOff =
  'bg-[#8b8b8b] border-t-[#c9c9c9] border-l-[#c9c9c9] border-b-[#4a4a4a] border-r-[#4a4a4a] text-white cursor-pointer hover:brightness-110';
const optionButtonOn =
  'bg-[#3a8f3a] border-t-[#6fd66f] border-l-[#6fd66f] border-b-[#1f4f1f] border-r-[#1f4f1f] text-white cursor-pointer hover:brightness-110';
const optionButtonDisabled =
  'bg-black/10 border-t-black/10 border-l-black/10 border-b-black/10 border-r-black/10 text-black/40 cursor-default';

// "Don't import a weapon" — a real, explicit choice alongside the real candidates, not just
// "nothing picked" (see the Review step's weapon section below for why that distinction matters).
const SKIP_WEAPON = 'skip';

function GearRow({ item, checked, onToggle }) {
  if (!item) {
    return (
      <div className={`${optionButtonBase} ${optionButtonDisabled}`}>
        <span className="italic">Nothing worn</span>
      </div>
    );
  }
  return (
    <button type="button" onClick={onToggle} className={`${optionButtonBase} justify-between ${checked ? optionButtonOn : optionButtonOff}`}>
      <span className="flex items-center gap-2 min-w-0">
        <WeaponIcon id={item.id} material={item.material} alt={item.name} className="w-5 h-5 object-contain pixelated shrink-0" color={item.color} />
        <span className="truncate">{formatItemName(item.name)}</span>
      </span>
      {checked && <span className="shrink-0 text-xs font-bold">✓</span>}
    </button>
  );
}

// Compact 4-icon preview for a Wardrobe set's pieces, used in the Armor/Equipment Source pickers.
function WardrobeSetPreview({ set, slots, itemData }) {
  return (
    <span className="flex items-center gap-1 shrink-0">
      {slots.map((slot) => {
        const item = resolveGearSummary(set[slot], itemData);
        return (
          <span key={slot} title={item ? formatItemName(item.name) : 'Empty'}>
            {item ? (
              <WeaponIcon id={item.id} material={item.material} alt={item.name} className="w-5 h-5 object-contain pixelated" color={item.color} />
            ) : (
              <span className="block w-5 h-5 bg-white/15" />
            )}
          </span>
        );
      })}
    </span>
  );
}

// "Currently worn" + one row per non-empty Wardrobe set, with a 4-icon preview — shared by both
// the Armor Source and Equipment Source pickers on the Review screen. Renders nothing when the
// account has no saved sets for this slot group (nothing to choose between).
function WardrobeSourcePicker({ label, sets, slots, itemData, choice, onChange }) {
  if (!sets?.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] font-bold text-black uppercase tracking-wide">{label}</div>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`${optionButtonBase} justify-between ${choice == null ? optionButtonOn : optionButtonOff}`}
        >
          <span>Currently worn</span>
          {choice == null && <span className="shrink-0 text-xs font-bold">✓</span>}
        </button>
        {sets.map((set) => (
          <button
            key={set.index}
            type="button"
            onClick={() => onChange(set.index)}
            className={`${optionButtonBase} justify-between ${choice === set.index ? optionButtonOn : optionButtonOff}`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <span className="shrink-0">Wardrobe Set {set.index}</span>
              <WardrobeSetPreview set={set} slots={slots} itemData={itemData} />
            </span>
            {choice === set.index && <span className="shrink-0 text-xs font-bold">✓</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// Resolves a chosen Wardrobe set index (the set's real in-game slot number) against a sets array,
// falling back to currently-worn when nothing's picked — matched by `.index`, not array position,
// since empty sets are already filtered out worker-side and can leave gaps.
function pickSource(sets, choice, fallback) {
  return choice == null ? fallback : sets?.find((s) => s.index === choice);
}

// Imports currently-worn armor/equipment/active pet/Accessory Power, plus computed pet level,
// attribute levels, Wolf Slayer level, and Combat/Skyblock/Foraging/Catacombs/Taming/Alchemy/
// Enchanting level, from a real Hypixel account. Pet/Accessory Power/levels are always imported
// unconditionally; weapon and each armor/equipment slot go through a Review step first — weapon
// because Skyblock has no dedicated weapon slot (the Worker returns every carried candidate, not
// a guess), armor/equipment because the user may want to keep what's already in a given loadout
// slot instead of having the import overwrite it. Both armor and equipment can additionally be
// sourced from any non-empty Wardrobe set instead of currently-worn. Can auto-run on mount when
// EntryScreen navigates here with a username already typed in.
export default function HypixelImport() {
  const navigate = useNavigate();
  const location = useLocation();
  const { importHypixelLoadout, importHypixelAttributes, importHypixelPlayerStats } = useBuild();
  const { itemData } = useItemData();
  const [username, setUsername] = useState(location.state?.username || '');
  const [status, setStatus] = useState('idle'); // idle | loading | picking-profile | reviewing
  const [error, setError] = useState(null);
  const [profileChoice, setProfileChoice] = useState(null); // { uuid, username, profiles }
  const [rawImport, setRawImport] = useState(null);
  const [weaponChoice, setWeaponChoice] = useState(null); // null = undecided, SKIP_WEAPON, or a raw.weapons index
  const [wardrobeChoice, setWardrobeChoice] = useState(null); // null = currently worn, or a raw.wardrobeSets index
  const [wardrobeEquipmentChoice, setWardrobeEquipmentChoice] = useState(null); // null = currently worn, or a raw.wardrobeEquipmentSets index
  const [includedSlots, setIncludedSlots] = useState(() => new Set());
  const autoRanRef = useRef(false);

  async function runImport(uuid, byUuid, profile) {
    setError(null);
    setStatus('loading');
    try {
      const raw = await fetchHypixelImport(uuid, { byUuid, profile });
      if (raw.needsProfileSelection) {
        setProfileChoice(raw);
        setStatus('picking-profile');
        return;
      }
      setRawImport(raw);
      setWeaponChoice(null);
      setWardrobeChoice(null);
      setWardrobeEquipmentChoice(null);
      // Pre-checked for every slot Hypixel actually reports something worn in — an empty slot has nothing to import either way.
      const bySlot = { ...raw.armor, ...raw.equipment };
      setIncludedSlots(new Set([...ARMOR_SLOTS, ...EQUIPMENT_SLOTS].filter((slot) => bySlot[slot])));
      setStatus('reviewing');
    } catch (err) {
      setError(err instanceof HypixelImportError ? err.message : 'Import failed — see console for details.');
      if (!(err instanceof HypixelImportError)) console.error('Hypixel import failed:', err);
      setStatus('idle');
    }
  }

  function toggleSlot(slot) {
    setIncludedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });
  }

  // Switching Armor/Equipment Source re-checks/unchecks that group's 4 slots to match what the
  // newly chosen source actually has (same "pre-checked when present" rule as the initial load) —
  // the other group's slots are untouched.
  function updateIncludedFromSource(slots, source) {
    setIncludedSlots((prev) => {
      const next = new Set(prev);
      for (const slot of slots) {
        if (source?.[slot]) next.add(slot);
        else next.delete(slot);
      }
      return next;
    });
  }

  function handleWardrobeChoice(choice) {
    setWardrobeChoice(choice);
    updateIncludedFromSource(ARMOR_SLOTS, pickSource(rawImport.wardrobeSets, choice, rawImport.armor));
  }

  function handleWardrobeEquipmentChoice(choice) {
    setWardrobeEquipmentChoice(choice);
    updateIncludedFromSource(EQUIPMENT_SLOTS, pickSource(rawImport.wardrobeEquipmentSets, choice, rawImport.equipment));
  }

  async function handleConfirmImport() {
    const weaponIndex = typeof weaponChoice === 'number' ? weaponChoice : null;
    const excludedSlots = new Set([...ARMOR_SLOTS, ...EQUIPMENT_SLOTS].filter((slot) => !includedSlots.has(slot)));
    const { loadout, attributes, playerStats } = await mapHypixelImportToLoadout(rawImport, itemData, {
      weaponIndex,
      excludedSlots,
      wardrobeSetIndex: wardrobeChoice,
      wardrobeEquipmentSetIndex: wardrobeEquipmentChoice,
    });
    if (Object.keys(loadout).length === 0) {
      setError("Nothing selected to import.");
      return;
    }
    importHypixelLoadout(loadout);
    if (Object.keys(attributes).length > 0) importHypixelAttributes(attributes);
    if (Object.keys(playerStats).length > 0) importHypixelPlayerStats(playerStats);
    navigate('/');
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim()) return;
    runImport(username.trim(), false, null);
  }

  function handlePickProfile(profileId) {
    runImport(profileChoice.uuid, true, profileId);
  }

  // EntryScreen sends the typed username via router state — kick the import off immediately
  // instead of making the player retype it and press Import again.
  useEffect(() => {
    if (autoRanRef.current) return;
    if (!location.state?.username) return;
    autoRanRef.current = true;
    runImport(location.state.username.trim(), false, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const weaponCandidates = useMemo(
    () => (rawImport?.weapons || []).map((summary) => resolveGearSummary(summary, itemData)),
    [rawImport, itemData],
  );
  const weaponPending = weaponCandidates.length > 0 && weaponChoice === null;
  const armorSource = pickSource(rawImport?.wardrobeSets, wardrobeChoice, rawImport?.armor);
  const equipmentSource = pickSource(rawImport?.wardrobeEquipmentSets, wardrobeEquipmentChoice, rawImport?.equipment);

  if (status === 'reviewing' && rawImport) {
    return (
      <div className="min-h-screen flex flex-col items-center p-4">
        <PageHeader title="Review Import" />

        <div className="w-full max-w-[500px] flex flex-col gap-3">
          <div className={`${panel} p-4 flex flex-col gap-3`}>
            <div className="text-xs text-neutral-700 leading-snug">
              Pet, Accessory Power (with Stat Tuning), and your attribute/skill levels are always imported. Pick a weapon and choose
              which armor/equipment slots to bring in below — anything left unchecked keeps whatever's already in
              that slot.
            </div>

            <div className="flex flex-col gap-1">
              <div className="text-[11px] font-bold text-black uppercase tracking-wide">Weapon</div>
              {weaponCandidates.length === 0 ? (
                <div className={`${optionButtonBase} ${optionButtonDisabled}`}>
                  <span className="italic">No weapon found in inventory.</span>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {weaponCandidates.map((item, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setWeaponChoice(i)}
                      className={`${optionButtonBase} justify-between ${weaponChoice === i ? optionButtonOn : optionButtonOff}`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {item ? (
                          <>
                            <WeaponIcon
                              id={item.id}
                              material={item.material}
                              alt={item.name}
                              className="w-5 h-5 object-contain pixelated shrink-0"
                              color={item.color}
                            />
                            <span className="truncate">{formatItemName(item.name)}</span>
                          </>
                        ) : (
                          <span className="italic truncate">Unknown item (not in current catalog)</span>
                        )}
                      </span>
                      {weaponChoice === i && <span className="shrink-0 text-xs font-bold">✓</span>}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setWeaponChoice(SKIP_WEAPON)}
                    className={`${optionButtonBase} justify-between ${weaponChoice === SKIP_WEAPON ? optionButtonOn : optionButtonOff}`}
                  >
                    <span className="italic">Don't import a weapon</span>
                    {weaponChoice === SKIP_WEAPON && <span className="shrink-0 text-xs font-bold">✓</span>}
                  </button>
                </div>
              )}
            </div>

            <WardrobeSourcePicker
              label="Armor Source"
              sets={rawImport.wardrobeSets}
              slots={ARMOR_SLOTS}
              itemData={itemData}
              choice={wardrobeChoice}
              onChange={handleWardrobeChoice}
            />

            <div className="flex flex-col gap-1">
              <div className="text-[11px] font-bold text-black uppercase tracking-wide">Armor</div>
              {ARMOR_SLOTS.map((slot) => (
                <GearRow
                  key={slot}
                  item={resolveGearSummary(armorSource?.[slot], itemData)}
                  checked={includedSlots.has(slot)}
                  onToggle={() => toggleSlot(slot)}
                />
              ))}
            </div>

            <WardrobeSourcePicker
              label="Equipment Source"
              sets={rawImport.wardrobeEquipmentSets}
              slots={EQUIPMENT_SLOTS}
              itemData={itemData}
              choice={wardrobeEquipmentChoice}
              onChange={handleWardrobeEquipmentChoice}
            />

            <div className="flex flex-col gap-1">
              <div className="text-[11px] font-bold text-black uppercase tracking-wide">Equipment</div>
              {EQUIPMENT_SLOTS.map((slot) => (
                <GearRow
                  key={slot}
                  item={resolveGearSummary(equipmentSource?.[slot], itemData)}
                  checked={includedSlots.has(slot)}
                  onToggle={() => toggleSlot(slot)}
                />
              ))}
            </div>

            {error && <div className="text-xs text-red-700 font-bold">{error}</div>}

            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={() => {
                  setRawImport(null);
                  setStatus('idle');
                }}
                className="px-4 py-2 text-sm font-bold text-black bg-neutral-300 hover:brightness-95 transition-[filter] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={weaponPending}
                className="flex-1 px-4 py-2 text-sm font-bold text-white bg-[#3a8f3a] border-[3px] border-t-[#6fd66f] border-l-[#6fd66f] border-b-[#1f4f1f] border-r-[#1f4f1f] outline outline-2 outline-black hover:brightness-110 transition-[filter] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {weaponPending ? 'Pick a weapon option above' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <PageHeader title="Import from Hypixel" />

      <div className="w-full max-w-[500px] flex flex-col gap-3">
        <div className={`${panel} p-4 flex flex-col gap-3`}>
          <div className="text-xs text-neutral-700 leading-snug">
            Imports what you're <strong>currently wearing</strong> — you'll get to pick which weapon (if you're
            carrying more than one) and which armor/equipment slots to bring in next, plus your active pet (with
            level + held item), Accessory Power (with Stat Tuning), attribute levels, Wolf Slayer level, and
            Combat/Skyblock/Foraging/Catacombs/Taming/Alchemy/Enchanting level. Saved in-game Loadouts aren't
            imported.
          </div>

          {status !== 'picking-profile' && (
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="text"
                autoFocus
                placeholder="Minecraft username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={status === 'loading'}
                className="flex-1 min-w-0 text-sm px-2.5 py-2 bg-black text-white border-2 border-neutral-700 outline-none focus:border-neutral-400"
              />
              <button
                type="submit"
                disabled={status === 'loading' || !username.trim()}
                className="text-sm font-bold px-3 py-2 bg-neutral-800 text-white hover:brightness-125 transition-[filter] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {status === 'loading' ? 'Loading...' : 'Import'}
              </button>
            </form>
          )}

          {error && <div className="text-xs text-red-700 font-bold">{error}</div>}

          {status === 'picking-profile' && profileChoice && (
            <div className="flex flex-col gap-1.5">
              <div className="text-xs text-black font-bold">
                {profileChoice.username} has multiple SkyBlock profiles — pick one:
              </div>
              {profileChoice.profiles.map((p) => (
                <button
                  key={p.profile_id}
                  onClick={() => handlePickProfile(p.profile_id)}
                  disabled={status === 'loading'}
                  className="text-left text-sm px-3 py-2 bg-neutral-800 text-white hover:brightness-125 transition-[filter] cursor-pointer disabled:opacity-40"
                >
                  {p.cute_name}
                  {p.game_mode ? ` (${p.game_mode})` : ''}
                  {p.selected ? ' — currently active' : ''}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

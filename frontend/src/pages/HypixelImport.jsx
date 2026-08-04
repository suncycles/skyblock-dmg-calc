import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useItemData } from '../context/ItemDataContext';
import { fetchHypixelImport, mapHypixelImportToLoadout, HypixelImportError } from '../lib/hypixelImport';
import PageHeader from '../components/PageHeader';
import PageBackground from '../components/PageBackground';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

// Imports currently-worn armor/equipment/weapon/pet/Accessory Power, plus computed pet level,
// attribute levels, Wolf Slayer level, and Combat/Skyblock/Foraging/Catacombs/Taming/Alchemy/
// Enchanting level, from a real Hypixel account, then drops straight back onto the Loadout page —
// no confirmation step, no separate results screen. The only stop along the way is profile
// picking, and only when the account actually has more than one SkyBlock profile to choose from.
// Can auto-run on mount when EntryScreen navigates here with a username already typed in.
export default function HypixelImport() {
  const navigate = useNavigate();
  const location = useLocation();
  const { importHypixelLoadout, importHypixelAttributes, importHypixelPlayerStats } = useBuild();
  const { itemData } = useItemData();
  const [username, setUsername] = useState(location.state?.username || '');
  const [status, setStatus] = useState('idle'); // idle | loading | picking-profile
  const [error, setError] = useState(null);
  const [profileChoice, setProfileChoice] = useState(null); // { uuid, username, profiles }
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
      const { loadout, attributes, playerStats } = await mapHypixelImportToLoadout(raw, itemData);
      if (Object.keys(loadout).length === 0) {
        setError("Couldn't match any currently-worn item to this app's item catalog.");
        setStatus('idle');
        return;
      }
      importHypixelLoadout(loadout);
      if (Object.keys(attributes).length > 0) importHypixelAttributes(attributes);
      if (Object.keys(playerStats).length > 0) importHypixelPlayerStats(playerStats);
      navigate('/');
    } catch (err) {
      setError(err instanceof HypixelImportError ? err.message : 'Import failed — see console for details.');
      if (!(err instanceof HypixelImportError)) console.error('Hypixel import failed:', err);
      setStatus('idle');
    }
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

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <PageBackground />
      <PageHeader title="SkyDmg — Import from Hypixel" />

      <div className="w-full max-w-[500px] flex flex-col gap-3">
        <div className={`${panel} p-4 flex flex-col gap-3`}>
          <div className="text-xs text-neutral-700 leading-snug">
            Imports what you're <strong>currently wearing</strong> — weapon (first weapon found in your
            hotbar/inventory), armor, equipment, active pet (with level + held item), and Accessory Power —
            plus your attribute levels, Wolf Slayer level, and Combat/Skyblock/Foraging/Catacombs/Taming/
            Alchemy/Enchanting level. Saved in-game Loadouts aren't imported.
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

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useItemData } from '../context/ItemDataContext';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { fetchHypixelImport, mapHypixelImportToLoadout, HypixelImportError } from '../lib/hypixelImport';
import PageHeader from '../components/PageHeader';
import PageBackground from '../components/PageBackground';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

// Imports currently-worn armor/equipment/weapon/pet from a real Hypixel account. Two-step flow:
// resolve the username (the Worker may come back asking to pick a profile if the account has
// more than one), then map the chosen profile's gear onto BuildContext via importHypixelLoadout
// — which only touches those slots, leaving attributes/player levels/target mobs/toggles as-is.
export default function HypixelImport() {
  const navigate = useNavigate();
  const { importHypixelLoadout } = useBuild();
  const { itemData } = useItemData();
  const { confirmDialog } = useConfirmDialog();
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | picking-profile | done
  const [error, setError] = useState(null);
  const [profileChoice, setProfileChoice] = useState(null); // { uuid, username, profiles }
  const [result, setResult] = useState(null); // { imported: [...slots], skipped: [...ids] }

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
      const { loadout, skipped } = await mapHypixelImportToLoadout(raw, itemData);
      if (Object.keys(loadout).length === 0) {
        setError("Couldn't match any currently-worn item to this app's item catalog.");
        setStatus('idle');
        return;
      }
      if (!(await confirmDialog(`Import ${raw.username}'s currently-worn gear? This replaces your weapon/armor/equipment/pet slots.`))) {
        setStatus('idle');
        return;
      }
      importHypixelLoadout(loadout);
      setResult({ imported: Object.keys(loadout), skipped });
      setStatus('done');
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

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <PageBackground />
      <PageHeader title="SkyDmg — Import from Hypixel" />

      <div className="w-full max-w-[500px] flex flex-col gap-3">
        <div className={`${panel} p-4 flex flex-col gap-3`}>
          <div className="text-xs text-neutral-700 leading-snug">
            Imports what you're <strong>currently wearing</strong> — weapon (first weapon found in your
            hotbar/inventory), armor, equipment, and active pet. Attributes, skill levels, and saved in-game
            Loadouts aren't imported yet.
          </div>

          {status !== 'picking-profile' && status !== 'done' && (
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

          {status === 'done' && result && (
            <div className="flex flex-col gap-1.5">
              <div className="text-sm text-black font-bold">Imported: {result.imported.join(', ')}</div>
              {result.skipped.length > 0 && (
                <div className="text-xs text-neutral-700">
                  Skipped (not in this app's item catalog): {result.skipped.join(', ')}
                </div>
              )}
              <button
                className="mt-1 text-sm font-bold px-3 py-2 bg-neutral-800 text-white hover:brightness-125 transition-[filter] cursor-pointer self-start"
                onClick={() => navigate('/')}
              >
                Back to Loadout
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useItemData } from '../context/ItemDataContext';
import { fetchHypixelImport, HypixelImportError } from '../lib/hypixelImport';
import { buildAccessoryCandidates, evaluateAccessoryCandidates } from '../lib/accessoryOptimizer';
import { OPTIMIZER_MODES } from '../lib/optimizer';
import { MOB_TYPES } from '../lib/mobTypes';
import { round1 } from '../lib/damageFormat';
import PageHeader from '../components/PageHeader';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';
const sectionTitle = 'text-[13px] font-bold text-black uppercase tracking-wide pb-1 mb-0.5 border-b border-neutral-500/40';
const inputClass = 'flex-1 min-w-0 px-2.5 py-2 bg-white/90 border-[3px] border-black/60 text-sm text-black outline-none';
const buttonClass =
  'px-3 py-2 text-sm font-bold text-black bg-[#8fbf3f] border-[3px] border-t-[#c5e88a] border-l-[#c5e88a] border-b-[#4d6b1f] border-r-[#4d6b1f] cursor-pointer hover:brightness-110 disabled:opacity-50 disabled:cursor-default';

const CATEGORY_COLORS = {
  'New Accessory': '#4ade80',
  Recombobulate: '#818cf8',
  'Perfect Gemstones': '#a78bfa',
};

const RARITY_COLORS = {
  COMMON: '#ffffff',
  UNCOMMON: '#55ff55',
  RARE: '#5555ff',
  EPIC: '#aa00aa',
  LEGENDARY: '#ffaa00',
  MYTHIC: '#ff55ff',
  SPECIAL: '#ff5555',
  VERY_SPECIAL: '#ff5555',
};

function CandidateRow({ result, onSwapIn }) {
  return (
    <button
      type="button"
      onClick={onSwapIn}
      title="Click to set your Magical Power as if you owned this"
      className="w-full flex items-center gap-2 px-3 py-2 bg-[#8b8b8b]/40 hover:bg-[#8b8b8b]/70 border border-black/30 cursor-pointer text-left transition-colors"
    >
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: CATEGORY_COLORS[result.category] || '#999999' }}>
          {result.category}
        </span>
        <span className="text-[13px] text-black truncate">
          <span style={{ color: RARITY_COLORS[result.rarity] || '#000000', textShadow: '0 0 1px rgba(0,0,0,0.4)' }}>{result.label}</span>
        </span>
        <span className="text-[10px] text-neutral-700">
          Cost: {result.cost.toLocaleString()} coins · Ratio: {result.ratio != null ? round1(result.ratio) : '—'}
        </span>
      </div>
      <span className="text-sm font-mono font-bold text-green-700 whitespace-nowrap">+{round1(result.percentIncrease)}%</span>
    </button>
  );
}

// Magical Power Optimizer — a "temporary implementation" (see lib/accessoryOptimizer.js's header
// for full scope/provenance) ranking real accessories not yet owned (or upgradeable) by DPS
// increase from the resulting Magical Power gain. Two independent inputs feed it: a Hypixel IGN
// (fetched here, on-demand — NOT tied to the main gear-import flow, since this only needs the raw
// accessory list/tiers, not a full loadout import) for the owned-accessory catalog diff, and the
// current build/mode/target mob (from useBuild()) for the actual DPS evaluation.
export default function AccessoryOptimizer() {
  const navigate = useNavigate();
  const build = useBuild();
  const { itemData, loading: itemDataLoading } = useItemData();
  const [mode, setMode] = useState('slayer');
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | ok | error
  const [error, setError] = useState(null);
  const [owned, setOwned] = useState(null);
  const [result, setResult] = useState(null);

  const mobName = build.targetMobs[0] || null;
  const mobTypes = mobName ? MOB_TYPES[mobName] : null;

  async function handleFetch(e) {
    e.preventDefault();
    if (!username.trim()) return;
    setStatus('loading');
    setError(null);
    try {
      let raw = await fetchHypixelImport(username.trim());
      // Multiple SkyBlock profiles: this "temporary" implementation just uses whichever profile
      // Hypixel lists first rather than offering a picker (the main Hypixel Import page already
      // has that picker — reused here would be scope creep for a prototype).
      if (raw.needsProfileSelection) {
        const profileId = raw.profiles.find((p) => p.selected)?.profile_id || raw.profiles[0].profile_id;
        raw = await fetchHypixelImport(username.trim(), { profile: profileId });
      }
      setOwned(raw.accessory?.owned || []);
      setStatus('ok');
    } catch (err) {
      setError(err instanceof HypixelImportError ? err.message : 'Import failed, try again.');
      setStatus('error');
    }
  }

  async function handleEvaluate(ownedList) {
    if (itemDataLoading || !mobName || !mobTypes || !itemData.accessoryFamilies) return;
    const candidates = buildAccessoryCandidates(ownedList, itemData.accessoryFamilies);
    const evaluated = await evaluateAccessoryCandidates(
      build.loadout,
      itemData,
      build,
      mode,
      { name: mobName, types: mobTypes },
      candidates,
    );
    setResult(evaluated);
  }

  function handleSwapIn(candidate) {
    build.setAccessoryMagicalPower(result.currentMp + candidate.mpGain);
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <PageHeader title="Magical Power Optimizer" />
      <div className="w-full max-w-[700px] flex flex-col gap-3">
        <div className={`${panel} p-3 flex flex-col gap-2`}>
          <div className={sectionTitle}>Optimize For</div>
          <div className="grid grid-cols-2 gap-2">
            {OPTIMIZER_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={`${panel} px-3 py-2 text-sm font-bold text-black cursor-pointer transition-[filter] ${
                  mode === m.id ? 'hover:brightness-110' : 'brightness-50'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className={`${panel} p-3 flex flex-col gap-2`}>
          <div className={sectionTitle}>Account</div>
          <form onSubmit={handleFetch} className="flex gap-2">
            <input
              className={inputClass}
              placeholder="Minecraft username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <button type="submit" className={buttonClass} disabled={status === 'loading' || !username.trim()}>
              {status === 'loading' ? 'Loading...' : 'Fetch Accessories'}
            </button>
          </form>
          {status === 'error' && <div className="text-xs text-red-700">{error}</div>}
          {owned && status === 'ok' && (
            <div className="text-[11px] text-neutral-700">{owned.length} real accessories found on this account.</div>
          )}
        </div>

        {!mobName || !mobTypes ? (
          <div className={`${panel} p-4 flex flex-col gap-2`}>
            <div className={sectionTitle}>Upgrades</div>
            <div className="text-xs text-neutral-600 italic">
              No target selected —{' '}
              <button className="underline cursor-pointer" onClick={() => navigate('/target-mob')}>
                pick a mob
              </button>{' '}
              to run the optimizer.
            </div>
          </div>
        ) : !owned ? (
          <div className={`${panel} p-4 text-xs text-neutral-600 italic`}>Fetch an account above to see real missing accessories.</div>
        ) : (
          <div className={`${panel} p-3 flex flex-col gap-2`}>
            <div className="flex items-center justify-between">
              <div className={sectionTitle}>Missing / Upgradeable Accessories</div>
              <button type="button" className={`${buttonClass} !py-1 !text-xs`} onClick={() => handleEvaluate(owned)}>
                Evaluate DPS
              </button>
            </div>
            {!result ? (
              <div className="text-xs text-neutral-600 italic">Click "Evaluate DPS" to rank real candidates against your current build.</div>
            ) : result.results.length === 0 ? (
              <div className="text-xs text-neutral-600 italic">No candidate increases Magical Power's real damage effect right now.</div>
            ) : (
              <>
                <div className="text-[11px] text-neutral-700">Current Magical Power: {result.currentMp}</div>
                {result.results.map((r) => (
                  <CandidateRow key={`${r.category}-${r.id}`} result={r} onSwapIn={() => handleSwapIn(r)} />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

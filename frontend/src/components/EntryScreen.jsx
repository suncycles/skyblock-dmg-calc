import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageBackground from './PageBackground';

const toolbar =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

// SkyCrypt-style entry point: enter an IGN to pull a loadout straight from the Hypixel API, or
// skip straight into the manual builder. Submitting hands the username to /hypixel-import (see
// HypixelImport.jsx), which auto-runs the import on mount instead of making the player retype it.
export default function EntryScreen({ onSkip }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim()) return;
    onSkip();
    navigate('/hypixel-import', { state: { username: username.trim() } });
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative">
      <PageBackground />

      <div className="w-full max-w-[440px] flex flex-col items-center gap-1 mb-8 text-center">
        <h1 className="text-5xl font-bold tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">SkyDmg</h1>
        <p className="text-sm text-neutral-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          Hypixel Skyblock damage calculator
        </p>
      </div>

      <form onSubmit={handleSubmit} className={`${toolbar} w-full max-w-[440px] p-4 flex flex-col gap-3`}>
        <label htmlFor="ign" className="text-[11px] font-bold text-black uppercase tracking-wide">
          Minecraft Username
        </label>
        <div className="flex gap-2">
          <input
            id="ign"
            type="text"
            autoComplete="off"
            autoFocus
            placeholder="Enter your IGN..."
            className="flex-1 min-w-0 text-sm px-3 py-2 bg-black text-white border-2 border-neutral-700 outline-none focus:border-neutral-400"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button
            type="submit"
            className="px-4 py-2 text-sm font-bold text-white bg-[#3a8f3a] border-[3px] border-t-[#6fd66f] border-l-[#6fd66f] border-b-[#1f4f1f] border-r-[#1f4f1f] outline outline-2 outline-black hover:brightness-110 cursor-pointer whitespace-nowrap"
          >
            View Loadout
          </button>
        </div>
      </form>

      <div className="flex items-center gap-3 w-full max-w-[440px] my-4">
        <div className="flex-1 h-px bg-white/20" />
        <span className="text-[11px] text-neutral-300 uppercase tracking-wide">or</span>
        <div className="flex-1 h-px bg-white/20" />
      </div>

      <button
        type="button"
        className={`${toolbar} px-5 py-2.5 text-sm font-bold text-black hover:brightness-110 cursor-pointer`}
        onClick={onSkip}
      >
        Build Manually
      </button>
    </div>
  );
}

import PageHeader from '../components/PageHeader';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';
const slotBase =
  'flex items-center justify-center bg-[#8b8b8b] shadow-[inset_2px_2px_0_0_#373737,inset_-2px_-2px_0_0_#ffffff] text-white text-[9px] font-bold text-center';
const toolbarBtn =
  'text-[13px] font-bold px-3 py-2 bg-neutral-800 text-white whitespace-nowrap flex items-center gap-1.5';

// Wraps a mockup UI fragment with a red callout box — the "screenshot with a red box around the
// button" this whole page is built from. `block` for a full-width row, otherwise inline (fits a button).
function Spot({ children, block = false }) {
  return (
    <div className={`relative ${block ? '' : 'inline-block'}`}>
      {children}
      <div className="absolute -inset-1 border-[3px] border-red-500 rounded-sm pointer-events-none" />
    </div>
  );
}

// A cropped "screenshot" frame — dark title bar + light content area, same visual language as a
// browser chrome — so each mockup below reads as "a picture of the app" rather than loose UI bits.
function Shot({ route, children }) {
  return (
    <div className="w-full rounded overflow-hidden border border-neutral-700">
      <div className="bg-neutral-900 text-neutral-400 text-[10px] font-mono px-2 py-1">skydmg.pages.dev{route}</div>
      <div className="bg-[#1a1a1a] p-3 flex flex-wrap gap-3 items-start pointer-events-none select-none">{children}</div>
    </div>
  );
}

function Step({ n, title, children }) {
  return (
    <section className={`${panel} p-3 flex flex-col gap-2`}>
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 shrink-0 flex items-center justify-center bg-neutral-800 text-white text-xs font-bold rounded-full">
          {n}
        </span>
        <h2 className="font-bold text-black">{title}</h2>
      </div>
      {children}
    </section>
  );
}

// Mockups below are simplified re-creations of the real UI (same classes/colors, trimmed content)
// annotated with red Spot boxes — not live screenshots, since a couple of the MISC sliders below
// only render once specific enchants are equipped and can't all be shown live at once anyway.
export default function Tutorial() {
  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <PageHeader title="Tutorial" />

      <div className="w-full max-w-[700px] flex flex-col gap-4 text-sm text-neutral-200">
        <Step n={1} title="Import & Export a Loadout">
          <p>
            The Loadout toolbar above the main grid lets you move builds in and out of the app. <strong>Export</strong>{' '}
            copies a shareable link to your clipboard; <strong>Import</strong> reads a link (or code) back out of your
            clipboard and loads it, after confirming. <strong>Hypixel</strong> pulls your gear straight from your
            in-game profile instead.
          </p>
          <Shot route="/">
            <div className={`${panel} p-2 flex gap-1.5`}>
              <Spot>
                <button className={toolbarBtn}>📤 Export</button>
              </Spot>
              <Spot>
                <button className={toolbarBtn}>📥 Import</button>
              </Spot>
              <button className={toolbarBtn}>📁 Loadouts</button>
              <Spot>
                <button className={toolbarBtn}>🌐 Hypixel</button>
              </Spot>
              <button className={toolbarBtn}>⚖️ Compare</button>
            </div>
          </Shot>
        </Step>

        <Step n={2} title="Saving Loadouts">
          <p>
            Click <strong>Loadouts</strong> to open the saved-builds panel. Give the current build a name and hit{' '}
            <strong>Save</strong> — it's stored in your browser. Click a saved entry to load it back in (this replaces
            your current build), or use the ⧉ / ✕ icons to duplicate or delete it.
          </p>
          <Shot route="/">
            <div className={`${panel} p-2 flex flex-col gap-1.5 w-64`}>
              <div className="flex gap-1.5">
                <div className="flex-1 text-[12px] px-2 py-1 rounded bg-neutral-800 border border-neutral-600 text-neutral-500">
                  Loadout name
                </div>
                <Spot>
                  <button className="text-[12px] px-2.5 py-1 rounded bg-emerald-600 text-white font-semibold whitespace-nowrap">
                    Save
                  </button>
                </Spot>
              </div>
              <Spot block>
                <div className="flex-1 flex flex-col items-start text-left px-2 py-1 rounded bg-neutral-800 text-white">
                  <span className="text-[12px]">My PvP Loadout</span>
                  <span className="text-[10px] text-neutral-400">⛑️ Necron's Helmet</span>
                </div>
              </Spot>
            </div>
          </Shot>
        </Step>

        <Step n={3} title="Comparison Mode">
          <p>
            Click <strong>Compare</strong> on the toolbar to open Comparison Mode. Pick a saved loadout (or your
            current build) for Side A and Side B and the page lines up their stats and Final Damage against your
            selected target mobs, side by side.
          </p>
          <Shot route="/compare">
            <div className="flex flex-col gap-1.5 w-56">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-neutral-300 uppercase w-14">Side A</span>
                <Spot>
                  <div className={`${panel} text-sm px-2 py-1.5 text-black flex-1`}>Current Build</div>
                </Spot>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-neutral-300 uppercase w-14">Side B</span>
                <div className={`${panel} text-sm px-2 py-1.5 text-black flex-1`}>My PvP Loadout</div>
              </div>
            </div>
          </Shot>
        </Step>

        <Step n={4} title="Using the Hex">
          <p>
            Click any equipped gear slot on the main grid to open its <strong>Hex</strong> — the customization menu
            for that item. From there you can open Enchantments, Gemstones, Reforges, and more for that specific
            piece.
          </p>
          <Shot route="/hex/weapon">
            <div className="grid grid-cols-3 gap-[3px] w-40">
              <div className={`${slotBase} h-11`}>Ench.</div>
              <div className={`${slotBase} h-11`}>Ult. Ench.</div>
              <div className={`${slotBase} h-11`}>Gems</div>
              <Spot block>
                <div className={`${slotBase} h-11 bg-neutral-700`}>Item</div>
              </Spot>
              <div className={`${slotBase} h-11`}>Books</div>
              <div className={`${slotBase} h-11`}>Special</div>
              <Spot block>
                <div className={`${slotBase} h-11`}>Reforges</div>
              </Spot>
              <div className={`${slotBase} h-11`}>Upgrades</div>
              <div className={`${slotBase} h-11 opacity-0`} />
            </div>
          </Shot>
        </Step>

        <Step n={5} title="Selecting a Target Mob">
          <p>
            Click the <strong>Target</strong> tile on the main grid to open the mob picker — click any mob to add or
            remove it from your targets (you can pick more than one). Mobs marked with a{' '}
            <span className="text-red-500 font-bold">☠</span> are bosses.
          </p>
          <Shot route="/target-mob">
            <div className="grid grid-cols-4 gap-1 w-56">
              {['Zealot', 'Voidling', 'Bal', 'Sven Packmaster'].map((name) => (
                <div key={name} className={`${slotBase} h-11 relative text-[8px] px-0.5`}>
                  {name}
                </div>
              ))}
              <Spot>
                <div className={`${slotBase} h-11 relative text-[8px] px-0.5`}>
                  <span className="absolute top-0 left-0 text-red-500 text-[10px] leading-none">☠</span>
                  Livid
                </div>
              </Spot>
            </div>
          </Shot>
        </Step>

        <Step n={6} title="Tuning Final Stats with MISC">
          <p>
            The <strong>Misc</strong> panel on the Damage Calculation page covers everything that isn't tied to a
            specific item — flat Strength/Crit Damage bonuses, Mob HP%, and a few situational sliders that only
            appear when you have the matching enchant or set equipped:
          </p>
          <ul className="list-disc list-inside pl-1 flex flex-col gap-1">
            <li>
              <strong>Swarm Mobs</strong> — appears with the Swarm ultimate enchant; set how many nearby mobs it's
              hitting.
            </li>
            <li>
              <strong>Legion Players</strong> — appears with the Legion enchant; set how many nearby party members
              count toward its bonus.
            </li>
            <li>
              <strong>⑊ Stacks</strong> — appears with 2+ Infernal/Crimson armor pieces equipped; set your current
              Crimson Isle stack count.
            </li>
          </ul>
          <Shot route="/damage-sources">
            <div className={`${panel} p-2 flex flex-col gap-1.5 w-48`}>
              <div className="text-[11px] font-bold text-black uppercase border-b border-neutral-500/40 pb-1">Misc</div>
              <div className="flex flex-col gap-0.5 text-[11px] text-black">
                <span>Strength</span>
                <div className="px-2 py-0.5 bg-black text-white border border-neutral-700 text-center">0</div>
              </div>
              <Spot block>
                <div className="flex flex-col gap-0.5 text-[11px] text-black">
                  <span className="flex justify-between">
                    <span>⑊ Stacks</span>
                    <span className="font-mono">1</span>
                  </span>
                  <div className="w-full h-1.5 bg-neutral-500 rounded" />
                </div>
              </Spot>
              <Spot block>
                <div className="flex flex-col gap-0.5 text-[11px] text-black">
                  <span className="flex justify-between">
                    <span>Swarm Mobs</span>
                    <span className="font-mono">1</span>
                  </span>
                  <div className="w-full h-1.5 bg-neutral-500 rounded" />
                </div>
              </Spot>
              <Spot block>
                <div className="flex items-center justify-between gap-1.5 text-[11px] text-black">
                  <span>Legion Players</span>
                  <div className="w-10 px-1 py-0.5 bg-black text-white border border-neutral-700 text-center">0</div>
                </div>
              </Spot>
            </div>
          </Shot>
        </Step>
      </div>
    </div>
  );
}

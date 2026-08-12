import PageHeader from '../components/PageHeader';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

// A cropped "screenshot" frame — dark title bar + the real screenshot below it (red boxes already
// baked into the image around the relevant button/element) — same visual language as a browser
// chrome, so each shot reads as "a picture of the app."
function Shot({ route, src, alt }) {
  return (
    <div className="w-full rounded overflow-hidden border border-neutral-700 bg-[#1a1a1a]">
      <div className="bg-neutral-900 text-neutral-400 text-[10px] font-mono px-2 py-1">skydmg.pages.dev{route}</div>
      <img src={src} alt={alt} className="w-full block" />
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

// Screenshots below are real captures of the live app (public/tutorial/*.jpg) with a red box baked
// in around the relevant button/element for each step.
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
          <Shot route="/" src="/tutorial/step1-toolbar.jpg" alt="Loadout toolbar with Export, Import, and Hypixel buttons highlighted" />
        </Step>

        <Step n={2} title="Saving Loadouts">
          <p>
            Click <strong>Loadouts</strong> to open the saved-builds panel. Give the current build a name and hit{' '}
            <strong>Save</strong> — it's stored in your browser. Click a saved entry to load it back in (this replaces
            your current build), or use the ⧉ / ✕ icons to duplicate or delete it.
          </p>
          <Shot route="/" src="/tutorial/step2-loadouts.jpg" alt="Loadouts panel open, showing the Save button and a saved loadout entry" />
        </Step>

        <Step n={3} title="Comparison Mode">
          <p>
            Click <strong>Compare</strong> on the toolbar to open Comparison Mode. Pick a saved loadout (or your
            current build) for Side A and Side B and the page lines up their stats and Final Damage against your
            selected target mobs, side by side.
          </p>
          <Shot route="/compare" src="/tutorial/step3-compare.jpg" alt="Compare Loadouts page with the Loadout A dropdown highlighted" />
        </Step>

        <Step n={4} title="Using the Hex">
          <p>
            Click any equipped gear slot on the main grid to open its <strong>Hex</strong> — the customization menu
            for that item. From there you can open Enchantments, Gemstones, Reforges, and more for that specific
            piece.
          </p>
          <Shot route="/hex/weapon" src="/tutorial/step4-hex.jpg" alt="Hex customization grid with the item slot and Reforges button highlighted" />
        </Step>

        <Step n={5} title="Selecting a Target Mob">
          <p>
            Click the <strong>Target</strong> tile on the main grid to open the mob picker — click any mob to add or
            remove it from your targets (you can pick more than one). Mobs marked with a{' '}
            <span className="text-red-500 font-bold">☠</span> are bosses.
          </p>
          <Shot route="/target-mob" src="/tutorial/step5-target.jpg" alt="Target Mobs picker with a boss-marked mob tile highlighted" />
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
          <Shot
            route="/damage-sources"
            src="/tutorial/step6-misc.jpg"
            alt="Misc panel showing the Stacks, Swarm Mobs, and Legion Players sliders highlighted"
          />
        </Step>
      </div>
    </div>
  );
}

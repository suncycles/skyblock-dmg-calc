import PageHeader from '../components/PageHeader';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

// A cropped "screenshot" frame — dark title bar showing the real route, then the capture below it
// — same visual language as browser chrome, so each shot reads as "a picture of the app."
function Shot({ route, src, alt }) {
  return (
    <div className="w-full rounded overflow-hidden border border-neutral-700 bg-[#1a1a1a]">
      <div className="bg-neutral-900 text-neutral-400 text-[10px] font-mono px-2 py-1">skydmg.pages.dev{route}</div>
      <img src={src} alt={alt} loading="lazy" className="w-full block" />
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

// Screenshots are real, unretouched captures of the live app (public/tutorial/*.jpg), taken in one
// sitting off a real imported profile so the whole set reads as a single session. Recapture them
// with scripts/-style headless Chrome + CDP whenever the UI moves on — a stale tutorial is worse
// than none, since every shot here doubles as a claim about what the app currently looks like.
export default function Tutorial() {
  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <PageHeader title="Tutorial" />

      <div className="w-full max-w-[700px] flex flex-col gap-4 text-sm text-neutral-200">
        <Step n={1} title="Start with your own gear">
          <p>
            Type your Minecraft username and hit <strong>View Loadout</strong>. SkyDmg reads your Hypixel profile and
            fills in weapons, armor, equipment, pet, accessories, attributes and skill levels for you — no login, no
            API key. <strong>Build Manually</strong> starts from an empty grid instead. You can also link straight
            into the import with <code className="text-[11px] bg-black/40 px-1 rounded">/import/&lt;username&gt;</code>.
          </p>
          <Shot route="/" src="/tutorial/01-start.jpg" alt="SkyDmg entry screen with a username typed into the Minecraft Username field" />
        </Step>

        <Step n={2} title="The loadout grid">
          <p>
            Every slot is clickable — click one to change that piece, or the small <strong>✕</strong> on its corner to
            clear it. The <strong>Loadout</strong> toolbar sits above the grid, and <strong>Recommended Upgrades</strong>{' '}
            docks to the right, updating live as you build (drag its title bar to move it, its edges to resize).
            Undo/Redo live in the top bar, and the <strong>☰</strong> menu holds everything else — Import, Compare,
            Damage Optimizer, and the guide pages.
          </p>
          <Shot route="/" src="/tutorial/02-loadout.jpg" alt="The main loadout grid with a full imported build and the Recommended Upgrades panel open" />
        </Step>

        <Step n={3} title="Customize a piece in the Hex">
          <p>
            Clicking an equipped slot opens its <strong>Hex</strong> — that item's own menu:{' '}
            <strong>Enchants</strong>, <strong>Ultimate</strong>, <strong>Gemstones</strong>, <strong>Books</strong>,{' '}
            <strong>Recomb</strong>, <strong>Reforge</strong>, <strong>Stars</strong>, <strong>Special</strong>, and{' '}
            <strong>Clean</strong> to strip it back. Each tile carries a badge showing what's already applied, and{' '}
            <strong>Change</strong> swaps the item itself.
          </p>
          <Shot route="/hex/weapon" src="/tutorial/03-hex.jpg" alt="The Hex item menu for the weapon slot, with badges on the Enchants, Books, Gemstones and Stars tiles" />
        </Step>

        <Step n={4} title="Pick your targets">
          <p>
            The <strong>Target</strong> tile opens the mob picker. Search by name or filter by location, then click to
            add or remove — you can select several, and Final Damage is computed against each one. Your first target
            also sets the page's backdrop and theme.
          </p>
          <Shot route="/target-mob" src="/tutorial/04-target.jpg" alt="Target Mobs picker showing the search box, location filter, and the full mob grid" />
        </Step>

        <Step n={5} title="Read the damage breakdown">
          <p>
            <strong>View Damage Breakdown</strong> shows, per mob, how the number is built: Initial Damage, then the
            additive multiplier, then the multiplicative one, then <strong>Final Damage</strong>. Toggle{' '}
            <strong>Mage</strong>, <strong>Dungeon</strong>, <strong>Master</strong>, and <strong>DPS</strong> to see
            the same build under different conditions.
          </p>
          <ul className="list-disc list-inside pl-1 flex flex-col gap-1">
            <li>
              Click any line under <strong>(Base) Stats</strong> to expand every source feeding that stat.
            </li>
            <li>
              <strong>MISC</strong> is for anything the app can't see — type the gap between its Strength/Crit Damage
              and your real in-game numbers. Typing pauses for 3 seconds before recalculating.
            </li>
            <li>
              Situational fields appear only when they apply — <strong>Legion Players</strong> with the Legion enchant,{' '}
              <strong>Swarm Mobs</strong> with Swarm, <strong>⑊ Stacks</strong> with 2+ Infernal Crimson pieces.
            </li>
          </ul>
          <Shot route="/damage-sources" src="/tutorial/05-damage.jpg" alt="Damage Sources page showing Final Damage against Voidgloom Seraph, the Base Stats list, and the Misc panel" />
        </Step>

        <Step n={6} title="Let it find your next upgrade">
          <p>
            The <strong>Damage Optimizer</strong> ranks real upgrades one swap at a time. Pick what to optimize for
            (Slayer, Diana, Mage, or the three Dungeon modes), optionally set a <strong>Max Budget</strong>, then sort
            by <strong>Highest Increase</strong> or <strong>Best Value</strong> (damage gained per coin). Every row
            shows its real bazaar/auction cost — click one to equip it instantly, or <strong>✕</strong> to hide it.
            Category chips narrow the list to just gemstones, reforges, enchants, and so on.
          </p>
          <Shot route="/optimizer" src="/tutorial/06-optimizer.jpg" alt="Damage Optimizer with the mode buttons, Max Budget field, and a ranked list of upgrades with coin costs" />
        </Step>

        <Step n={7} title="Save, share, and compare">
          <p>
            <strong>Loadouts</strong> names and stores builds in your browser. <strong>Export to Clipboard</strong>{' '}
            copies a shareable link and <strong>Import from Clipboard</strong> reads one back in.{' '}
            <strong>Cost</strong> totals what the current build is worth, and <strong>Compare</strong> lines two saved
            builds up side by side, stat for stat.
          </p>
          <Shot route="/" src="/tutorial/07-share.jpg" alt="The Loadout toolbar with the Loadouts panel open, showing the name field and Save button" />
        </Step>
      </div>
    </div>
  );
}

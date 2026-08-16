import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

const PIECE_SLOTS = ['helmet', 'chestplate', 'leggings', 'boots', 'necklace', 'cloak', 'belt', 'gloves'];
const PIECE_LABELS = {
  helmet: 'Helmet',
  chestplate: 'Chestplate',
  leggings: 'Leggings',
  boots: 'Boots',
  necklace: 'Necklace',
  cloak: 'Cloak',
  belt: 'Belt',
  gloves: 'Gloves',
};

// Real shared-loadout links (KV short ids, see lib/loadoutCode.js's shortenLoadoutCode). Item
// names/pet/magical power below were read directly off each loadout after loading it — not
// guessed. A few item names carry a genuine leading space in the underlying catalog data
// (a NEU-REPO quirk, not a typo here) — trimmed below for clean display.
// `category` groups the cards on the page below (Eman / Blaze / Other) — assigned by which
// dungeon class the loadout is built around, not derived from anything else in the entry.
const EXAMPLES = [
  {
    code: 'uMUbAdR4',
    title: 'Endgame Eman',
    category: 'Eman',
    image: '/examples/endgame-eman.jpg',
    weapon: 'Atomsplit Katana',
    pet: 'Golden Dragon',
    petItem: 'Hephaestus Remedies',
    magicalPower: 2000,
    pieces: {
      helmet: 'Crown of Avarice',
      chestplate: 'Infernal Crimson Chestplate',
      leggings: 'Infernal Crimson Leggings',
      boots: 'Infernal Crimson Boots',
      necklace: 'Rift Necklace',
      cloak: "David's Cloak",
      belt: 'The Primordial',
      gloves: 'Manticore Claw',
    },
  },
  {
    code: '38rhdacc',
    title: 'Early-game Eman T1-3',
    category: 'Eman',
    image: '/examples/earlygame-eman-t1-3.jpg',
    weapon: 'Voidedge Katana',
    pet: 'Ankylosaurus',
    petItem: 'Crochet Tiger Plushie',
    magicalPower: 800,
    pieces: {
      helmet: 'Final Destination Helmet',
      chestplate: 'Final Destination Chestplate',
      leggings: 'Final Destination Leggings',
      boots: 'Final Destination Boots',
      necklace: 'Ender Necklace',
      cloak: 'Ender Cloak',
      belt: 'Ender Belt',
      gloves: 'Ender Gauntlet',
    },
  },
  {
    code: '6qmWYiem',
    title: 'Early-game Eman T4',
    category: 'Eman',
    image: '/examples/earlygame-eman-t4.jpg',
    weapon: 'Vorpal Katana',
    pet: 'Ankylosaurus',
    petItem: 'Crochet Tiger Plushie',
    magicalPower: 800,
    pieces: {
      helmet: 'Final Destination Helmet',
      chestplate: 'Final Destination Chestplate',
      leggings: 'Final Destination Leggings',
      boots: 'Final Destination Boots',
      necklace: 'Ender Necklace',
      cloak: 'Ender Cloak',
      belt: 'Ender Belt',
      gloves: 'Ender Gauntlet',
    },
  },
  {
    code: 'eqkoDoFi',
    title: 'Midgame Crimson Eman',
    category: 'Eman',
    image: '/examples/midgame-crimson-eman.png',
    weapon: 'Atomsplit Katana',
    pet: 'Ankylosaurus',
    petItem: null,
    magicalPower: 1000,
    pieces: {
      helmet: 'Primordial Helmet',
      chestplate: 'Burning Crimson Chestplate',
      leggings: 'Burning Crimson Leggings',
      boots: 'Burning Crimson Boots',
      necklace: 'Rift Necklace',
      cloak: "David's Cloak",
      belt: 'Molten Belt',
      gloves: 'Molten Bracelet',
    },
  },
  {
    code: 'LAS3DSRP',
    title: 'Endgame Blaze',
    category: 'Blaze',
    image: '/examples/endgame-blaze.jpg',
    weapon: 'Deathripper Dagger',
    pet: 'Golden Dragon',
    petItem: 'Hephaestus Remedies',
    magicalPower: 2000,
    pieces: {
      helmet: 'Crown of Avarice',
      chestplate: 'Infernal Crimson Chestplate',
      leggings: 'Infernal Crimson Leggings',
      boots: 'Infernal Crimson Boots',
      necklace: 'Rift Necklace',
      cloak: 'Annihilation Cloak',
      belt: 'The Primordial',
      gloves: 'Demonslayer Gauntlet',
    },
  },
  {
    code: 'GgHF8UXQ',
    title: 'Midgame Blaze T6 SWA',
    category: 'Blaze',
    image: '/examples/midgame-blaze-t6-swa.jpg',
    weapon: 'Mawdredge Dagger',
    pet: 'Blaze',
    petItem: null,
    magicalPower: 1000,
    pieces: {
      helmet: 'Warden Helmet',
      chestplate: 'Burning Crimson Chestplate',
      leggings: 'Burning Crimson Leggings',
      boots: 'Burning Crimson Boots',
      necklace: 'Vanquished Magma Necklace',
      cloak: 'Vanquished Ghast Cloak',
      belt: 'Vanquished Blaze Belt',
      gloves: 'Vanquished Glowstone Gauntlet',
    },
  },
  {
    code: 'kN8m6KBF',
    title: 'Midgame Blaze OFA',
    category: 'Blaze',
    image: '/examples/midgame-blaze-ofa.jpg',
    weapon: 'Mawdredge Dagger',
    pet: 'Blaze',
    petItem: null,
    magicalPower: 1000,
    pieces: {
      helmet: 'Warden Helmet',
      chestplate: 'Burning Crimson Chestplate',
      leggings: 'Burning Crimson Leggings',
      boots: 'Burning Crimson Boots',
      necklace: 'Vanquished Magma Necklace',
      cloak: 'Vanquished Ghast Cloak',
      belt: 'Vanquished Blaze Belt',
      gloves: 'Vanquished Glowstone Gauntlet',
    },
  },
  {
    code: 'YU2xtzsD',
    title: 'Hypermax LCM',
    category: 'Other',
    image: '/examples/hypermax-lcm.jpg',
    weapon: 'Dark Claymore',
    pet: 'Golden Dragon',
    petItem: 'Hephaestus Remedies',
    magicalPower: 2010,
    pieces: {
      helmet: "Storm's Helmet",
      chestplate: "Storm's Chestplate",
      leggings: "Storm's Leggings",
      boots: "Storm's Boots",
      necklace: 'Bone Necklace',
      cloak: 'Shadow Assassin Cloak',
      belt: 'Adaptive Belt',
      gloves: 'Soulweaver Gloves',
    },
  },
];

const CATEGORY_ORDER = ['Eman', 'Blaze', 'Other'];

function ExampleCard({ example }) {
  return (
    <div className={`${panel} p-4 flex flex-col gap-3`}>
      <h2 className="text-lg font-bold text-black">{example.title}</h2>
      <img src={example.image} alt={`${example.title} loadout screenshot`} className="w-full border-2 border-black" />
      <div className="text-sm text-black grid grid-cols-2 gap-x-4 gap-y-1">
        <div>
          <span className="font-bold">Weapon:</span> {example.weapon}
        </div>
        <div>
          <span className="font-bold">Pet:</span> {example.pet}
          {example.petItem ? ` (${example.petItem})` : ''}
        </div>
        <div className="col-span-2">
          <span className="font-bold">Magical Power:</span> {example.magicalPower.toLocaleString()}
        </div>
      </div>
      <div className="text-sm text-black">
        <p className="font-bold mb-1">Armor &amp; Equipment</p>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          {PIECE_SLOTS.map((slot) => (
            <li key={slot}>
              <span className="text-black/60">{PIECE_LABELS[slot]}:</span> {example.pieces[slot]}
            </li>
          ))}
        </ul>
      </div>
      <Link
        to={`/loadout/${example.code}`}
        className="mt-1 text-center text-sm font-bold px-4 py-2 bg-neutral-800 text-white hover:brightness-110"
      >
        Open this loadout
      </Link>
    </div>
  );
}

export default function Examples() {
  return (
    <div className="min-h-screen flex flex-col items-center p-4 relative">
      <PageHeader title="Examples" />
      <div className="w-full max-w-[1200px] flex flex-col gap-6">
        {CATEGORY_ORDER.map((category) => {
          const examples = EXAMPLES.filter((example) => example.category === category);
          if (examples.length === 0) return null;
          return (
            <div key={category} className="flex flex-col gap-3">
              <h2 className="text-lg font-bold text-white border-b-2 border-white/20 pb-1">{category}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {examples.map((example) => (
                  <ExampleCard key={example.code} example={example} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

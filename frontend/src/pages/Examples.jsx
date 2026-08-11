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
// names/magical power below were read directly off each loadout after loading it — not guessed.
const EXAMPLES = [
  {
    code: 'EmvGtMnd',
    title: 'Endgame Eman',
    image: '/examples/endgame-eman.jpg',
    weapon: 'Atomsplit Katana',
    pet: 'Golden Dragon',
    petItem: 'Hephaestus’ Remedies',
    magicalPower: 2000,
    pieces: {
      helmet: 'Crown of Avarice',
      chestplate: 'Infernal Crimson Chestplate',
      leggings: 'Infernal Crimson Leggings',
      boots: 'Infernal Crimson Boots',
      necklace: 'Rift Necklace',
      cloak: 'Annihilation Cloak',
      belt: 'The Primordial',
      gloves: 'Shriveled Bracelet',
    },
  },
  {
    code: 'uIA9T5z6',
    title: 'Midgame Blaze T4',
    image: '/examples/midgame-blaze.jpg',
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
    code: 'RAtEYFPo',
    title: 'Early-Midgame Eman T4',
    image: '/examples/midgame-eman.jpg',
    weapon: 'Atomsplit Katana',
    pet: 'Lion',
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
    code: 'z35sEtEn',
    title: 'Endgame Blaze',
    image: '/examples/endgame-blaze.jpg',
    weapon: 'Deathripper Dagger',
    pet: 'Golden Dragon',
    petItem: 'Hephaestus’ Remedies',
    magicalPower: 1900,
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
];

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
      <div className="w-full max-w-[1200px] grid grid-cols-1 md:grid-cols-2 gap-4">
        {EXAMPLES.map((example) => (
          <ExampleCard key={example.code} example={example} />
        ))}
      </div>
    </div>
  );
}

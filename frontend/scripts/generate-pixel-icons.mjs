// One-off offline generator for the site's pixel-art icon set (favicon, TopBar brand mark, and
// the drawer menu icons) — same "bake a static asset once" approach as
// worker/scripts/apply-skull-head-icons.mjs. Each icon is authored as a 16x16 grid (matching real
// Minecraft item-texture resolution) of palette-key characters, rendered as crisp-edged SVG <rect>
// elements (one per filled cell — 256 max, plenty small) so it stays perfectly sharp at any
// display size instead of blurring like a scaled-up raster image would.
//
// Re-run with `node scripts/generate-pixel-icons.mjs` from frontend/ any time an icon's grid
// below is edited; output goes to public/icons/*.svg.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

function gridToSvg(rows, palette) {
  const size = rows.length;
  let rects = '';
  for (let y = 0; y < size; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const key = row[x];
      if (key === '.') continue;
      rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${palette[key]}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${rects}</svg>`;
}

// Diagonal 2-tone blade (tip top-right) + a wide crossguard + brown grip + dark pommel
// (bottom-left) — same silhouette/orientation as Minecraft's own sword items. Used for both the
// browser-tab favicon and the small brand mark next to "SkyDmg" in TopBar.jsx.
const SWORD = {
  palette: { E: '#F5F5F5', B: '#B8B8B8', G: '#D4AF37', H: '#6B4423', P: '#3A3A3A' },
  rows: [
    '..............EB', // unused padding row, trimmed below
  ],
};
// Built precisely via explicit per-row strings (16 chars each) — easier to keep aligned than
// computed diagonal math.
SWORD.rows = [
  '.............EB.',
  '............EB..',
  '...........EB...',
  '..........EB....',
  '.........EB.....',
  '........EB......',
  '.......EB.......',
  '......EB........',
  '....GGGG........',
  '....HH..........',
  '...HH...........',
  '..PP............',
  '................',
  '................',
  '................',
  '................',
].map((r) => r.padEnd(16, '.').slice(0, 16));

// Closed book: dark spine on the left, cream page-edge on the right, a thin gold clasp line
// through the middle. Guides.
const BOOK = {
  palette: { C: '#8B4A3A', S: '#5C2E22', G: '#F0E6C8', L: '#D4AF37' },
  rows: [
    '................',
    '................',
    '..SCCCCCCCCCCG..',
    '..SCCCCCCCCCCG..',
    '..SCCCCCCCCCCG..',
    '..SCCCCCCCCCCG..',
    '..SCCCCCCCCCCG..',
    '..SLLLLLLLLLLG..',
    '..SCCCCCCCCCCG..',
    '..SCCCCCCCCCCG..',
    '..SCCCCCCCCCCG..',
    '..SCCCCCCCCCCG..',
    '..SCCCCCCCCCCG..',
    '................',
    '................',
    '................',
  ],
};

// Octagon-ish grey casing with a red/white two-tone needle (tapered like a real compass needle,
// not a plain bar) and a dark center pivot. Tutorial.
const COMPASS = {
  palette: { K: '#B0B0B0', N: '#C0392B', W: '#E8E8E8', D: '#2A2A2A' },
  rows: [
    '................',
    '................',
    '......KKKK......',
    '....KKKKKKKK....',
    '...KKKKKKKKKKK..',
    '...KKKKKNNKKKK..',
    '...KKKKKNNKKKK..',
    '...KKKKKDDKKKK..',
    '...KKKKKDDKKKK..',
    '...KKKKKWWKKKK..',
    '...KKKKKWWKKKK..',
    '...KKKKKKKKKKK..',
    '....KKKKKKKK....',
    '......KKKK......',
    '................',
    '................',
  ],
};

// Wooden chest with a darker plank border, a lid seam, and a small gold latch. Examples.
const CHEST = {
  palette: { W: '#8B5A2B', D: '#5C3A1A', L: '#D4AF37' },
  rows: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '...DDDDDDDDDDD..',
    '...DWWWWWWWWWD..',
    '...DWWWWWWWWWD..',
    '...DWWWLLWWWWD..',
    '...DDDDDDDDDDD..',
    '...DWWWWWWWWWD..',
    '...DWWWWWWWWWD..',
    '...DWWWWWWWWWD..',
    '...DDDDDDDDDDD..',
    '................',
    '................',
  ],
};

// Parchment ledger sheet: a blue header strip plus a couple of grid lines. Spreadsheets.
const LEDGER = {
  palette: { P: '#EDE6D3', O: '#B8AA88', H: '#4A6FA5', L: '#C9BFA0' },
  rows: [
    '................',
    '................',
    '...OOOOOOOOOO...',
    '...OHHHHHHHHO...',
    '...OPPPLPPPPO...',
    '...OPPPLPPPPO...',
    '...OLLLLLLLLO...',
    '...OPPPLPPPPO...',
    '...OPPPLPPPPO...',
    '...OLLLLLLLLO...',
    '...OPPPLPPPPO...',
    '...OPPPLPPPPO...',
    '...OOOOOOOOOO...',
    '................',
    '................',
    '................',
  ],
};

const ICONS = {
  sword: SWORD,
  book: BOOK,
  compass: COMPASS,
  chest: CHEST,
  ledger: LEDGER,
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, { rows, palette }] of Object.entries(ICONS)) {
  const svg = gridToSvg(rows, palette);
  writeFileSync(join(OUT_DIR, `${name}.svg`), svg);
  console.log(`wrote ${name}.svg`);
}

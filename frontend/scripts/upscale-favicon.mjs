// Larger copies of public/icons/favicon.webp, for share cards, apple-touch and PWA manifests.
//
// The source is only 7x7, so there is no detail to recover - the job is to enlarge it without
// smearing it. Two rules keep it crisp:
//
//   1. Nearest-neighbour only. Any smoothing kernel turns 49 hard pixels into mush.
//   2. Scale by a whole number, then pad to the target size. 512/7 is 73.14, and a fractional
//      scale makes some source pixels 73 wide and others 74, which reads as a wobble at the edges.
//      Scaling 7x73=511 and centring that on a 512 transparent canvas keeps every pixel square.
//
// Run from frontend/: node scripts/upscale-favicon.mjs
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const ICONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const SOURCE = join(ICONS_DIR, 'favicon.webp');

// 32 and 192 cover favicons and the PWA manifest; 180 is what iOS asks for; 512 is the manifest's
// large icon and big enough to sit on a share card.
const TARGETS = [32, 64, 128, 180, 192, 256, 512];

const { width, height } = await sharp(SOURCE).metadata();
if (width !== height) throw new Error(`expected a square source, got ${width}x${height}`);
console.log(`source: ${width}x${height}`);

for (const target of TARGETS) {
  const scale = Math.floor(target / width);
  if (scale < 1) throw new Error(`${target}px is smaller than the ${width}px source`);
  const scaled = width * scale;
  const pad = target - scaled;
  const left = Math.floor(pad / 2);
  const top = Math.floor(pad / 2);

  const enlarged = await sharp(SOURCE)
    .resize(scaled, scaled, { kernel: 'nearest' })
    .toBuffer();

  const canvas = sharp({
    create: { width: target, height: target, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: enlarged, left, top }]);

  await canvas.clone().png({ compressionLevel: 9 }).toFile(join(ICONS_DIR, `favicon-${target}.png`));
  await canvas.clone().webp({ lossless: true }).toFile(join(ICONS_DIR, `favicon-${target}.webp`));
  console.log(`wrote favicon-${target} (${width}x${scale} = ${scaled}, padded by ${pad})`);
}

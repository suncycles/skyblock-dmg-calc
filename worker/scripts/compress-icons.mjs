#!/usr/bin/env node
/**
 * Converts every baked icon PNG to lossless WebP and drops the PNG.
 *
 * These are 100x106 anti-aliased isometric renders with ~1000 unique colours: lossless WebP
 * stores them ~37% smaller than PNG with identical pixels. Lossy WebP is smaller still, but every
 * surface that shows them renders `image-rendering: pixelated`, so a lossy encoder's ringing
 * around the hard edges would be plainly visible.
 *
 * Runs last in update-data.mjs, after every step that writes an icon. Idempotent: an all-WebP dir
 * converts nothing, and the bake steps check for BOTH extensions, so re-running the pipeline
 * doesn't re-download hundreds of head renders.
 *
 * Requires cwebp (`brew install webp`).
 *
 * Usage: node compress-icons.mjs
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_ROOT = path.join(__dirname, '..', '..', 'frontend', 'public', 'images');

// Every dir whose contents are addressed by lib/icons.js's path builders or its literal
// SLOT_TEXTURES/CATEGORY_ICONS maps. mob_images is deliberately absent - those are hand-curated
// animations, already converted, and not produced by this pipeline.
const ICON_DIRS = ['skyblock', 'vanilla', 'reforgestones', 'gemstones', 'manual', 'ui'];

try {
  execFileSync('cwebp', ['-version'], { stdio: 'ignore' });
} catch {
  console.error('cwebp not found - install it with `brew install webp` (or your platform\'s libwebp package).');
  process.exit(1);
}

let converted = 0;
let beforeBytes = 0;
let afterBytes = 0;

for (const dir of ICON_DIRS) {
  const dirPath = path.join(IMAGES_ROOT, dir);
  let entries;
  try {
    entries = readdirSync(dirPath).filter((f) => f.toLowerCase().endsWith('.png'));
  } catch {
    continue;
  }
  for (const file of entries) {
    const pngPath = path.join(dirPath, file);
    const webpPath = pngPath.replace(/\.png$/i, '.webp');
    const before = statSync(pngPath).size;
    // -z 9 is the slowest/smallest lossless preset; these run once per ingest, not per request.
    execFileSync('cwebp', ['-quiet', '-z', '9', pngPath, '-o', webpPath]);
    unlinkSync(pngPath);
    beforeBytes += before;
    afterBytes += statSync(webpPath).size;
    converted++;
  }
  console.log(`${dir}: ${entries.length} converted`);
}

if (!converted) {
  console.log('Nothing to convert - every icon is already WebP.');
} else {
  const saved = Math.round((1 - afterBytes / beforeBytes) * 100);
  console.log(`\n${converted} icons: ${Math.round(beforeBytes / 1024)}KB -> ${Math.round(afterBytes / 1024)}KB (${saved}% smaller)`);
}

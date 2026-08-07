#!/usr/bin/env node
/**
 * Orchestrates the full NEU-REPO ingest pipeline in one command — previously 6 separate scripts
 * run by hand in a specific order, one of which (build-item-data.mjs) additionally needed a local
 * NEU-REPO checkout cloned and passed in manually. This does the clone itself (shallow, into a
 * throwaway temp dir, deleted right after the one step that needs it) and then runs the rest of
 * the pipeline exactly as documented in each script's own header comment.
 *
 * Fail-fast: if any step exits non-zero, the pipeline stops immediately rather than continuing
 * with partially-stale data (every step from build-item-data.mjs onward depends on the previous
 * one's output being real).
 *
 * This only regenerates local files — it does NOT git add/commit/push, and does NOT build or
 * deploy anything. Review the printed `git status` summary and commit/deploy yourself when
 * you're happy with the diff, same as any other change in this repo.
 *
 * Usage: node update-data.mjs
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..');
const NEU_REPO_URL = 'https://github.com/NotEnoughUpdates/NotEnoughUpdates-REPO.git';

function runNode(scriptName, args = []) {
  console.log(`\n=== ${scriptName} ${args.join(' ')} ===`);
  execFileSync('node', [path.join(__dirname, scriptName), ...args], { stdio: 'inherit', cwd: __dirname });
}

function step(label, fn) {
  try {
    fn();
  } catch (err) {
    console.error(`\n✗ Failed at: ${label}`);
    console.error(err.message || err);
    process.exit(1);
  }
}

console.log('Cloning a fresh shallow copy of NEU-REPO...');
const checkoutDir = mkdtempSync(path.join(tmpdir(), 'neu-repo-'));
step('git clone NEU-REPO', () => {
  execFileSync('git', ['clone', '--depth', '1', NEU_REPO_URL, checkoutDir], { stdio: 'inherit' });
});

step('build-item-data.mjs', () => runNode('build-item-data.mjs', [checkoutDir]));
rmSync(checkoutDir, { recursive: true, force: true });

step('apply-leather-armor-colors.mjs', () => runNode('apply-leather-armor-colors.mjs'));
step('apply-hypixel-textures.mjs', () => runNode('apply-hypixel-textures.mjs'));
step('apply-skull-head-icons.mjs', () => runNode('apply-skull-head-icons.mjs'));
step('apply-armor-reforge-stone-skulls.mjs', () => runNode('apply-armor-reforge-stone-skulls.mjs'));
step('apply-equipment-reforge-stone-skulls.mjs', () => runNode('apply-equipment-reforge-stone-skulls.mjs'));

console.log('\n=== Done. Changed files (review before committing): ===');
try {
  execFileSync('git', ['status', '--short', '--', 'worker/src/data', 'frontend/public/images'], {
    stdio: 'inherit',
    cwd: REPO_ROOT,
  });
} catch {
  // Not fatal — the pipeline itself already succeeded, this is just a convenience summary.
  console.log('(not a git repo, or git status failed — check worker/src/data and frontend/public/images manually)');
}

#!/usr/bin/env node
/**
 * US-141, finding 4 — the vendored files are the ones we think they are.
 *
 * `vendor/chart.umd.js` is 200 KB of code that draws every chart and that no
 * test reads. A modified copy — a mistaken edit, a dependency confusion, a
 * commit nobody looked at — would ship. This compares each vendored file's
 * sha256 against the value recorded in `vendor/README.md`, which also says where
 * the value came from, and runs before the tests like the other checks.
 *
 *   node tools/check-vendor.mjs
 *
 * No network: the README is the record, and the record is reviewed with the
 * file it describes. A row without a file and a file without a row both fail,
 * so a new vendored file cannot arrive unaccounted for.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const vendor = fileURLToPath(new URL('../vendor/', import.meta.url));
const readme = readFileSync(join(vendor, 'README.md'), 'utf8');

/** `| \`path\` | \`<64 hex>\` |` rows, wherever they are in the README. */
const recorded = new Map();
for (const [, file, hash] of readme.matchAll(/^\|\s*`([^`]+)`\s*\|\s*`([0-9a-f]{64})`\s*\|/gm)) {
  recorded.set(file, hash);
}

/** Every file under vendor/ that is not a licence text or the README itself. */
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const present = walk(vendor)
  .map((p) => relative(vendor, p))
  .filter((f) => f !== 'README.md' && !/\.(md|txt)$/.test(f));

const sha256 = (f) => createHash('sha256').update(readFileSync(join(vendor, f))).digest('hex');

const problems = [];
if (!recorded.size) problems.push('vendor/README.md records no hashes');
for (const f of present) {
  if (!recorded.has(f)) {
    problems.push(`vendor/${f} has no sha256 row in vendor/README.md`);
    continue;
  }
  const actual = sha256(f);
  if (actual !== recorded.get(f)) {
    problems.push(`vendor/${f} is ${actual}, README records ${recorded.get(f)} — the file changed, or the row was not updated with it`);
  }
}
for (const f of recorded.keys()) {
  if (!present.includes(f)) problems.push(`vendor/README.md records vendor/${f}, which is not there`);
}

if (problems.length) {
  for (const p of problems) console.error(`check-vendor: ${p}`);
  process.exit(1);
}
console.log(`check-vendor: ${present.length} vendored file(s) match vendor/README.md.`);

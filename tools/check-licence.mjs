#!/usr/bin/env node
/**
 * US-156 — the licence files exist.
 *
 * A repository without a `LICENSE` is "all rights reserved" by default, which is
 * the opposite of what the safety page claims. The file was missing for the
 * project's first seventy releases and nobody noticed, because nothing looked.
 * This looks, before the tests, like the other four checks.
 *
 *   node tools/check-licence.mjs
 *
 * Three things, all cheap: `LICENSE` and `TRADEMARK.md` are present and not
 * empty, and `package.json` declares the same licence the file carries.
 */
import { readFileSync, statSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const problems = [];

for (const name of ['LICENSE', 'TRADEMARK.md']) {
  try {
    if (statSync(new URL(name, root)).size === 0) problems.push(`${name} is empty`);
  } catch {
    problems.push(`${name} is missing at the repository root`);
  }
}

const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
if (pkg.license !== 'Apache-2.0') {
  problems.push(`package.json "license" is ${JSON.stringify(pkg.license)}, expected "Apache-2.0"`);
}

if (problems.length) {
  for (const p of problems) console.error(`check-licence: ${p}`);
  process.exit(1);
}
console.log('check-licence: LICENSE, TRADEMARK.md and package.json agree.');

#!/usr/bin/env node
/**
 * US-144 — name the build inside the release ZIP.
 *
 *   node tools/stamp-version.mjs <path/to/manifest.json> <short sha>
 *
 * Rewrites `version_name` in the given manifest to `<version> (<short sha>)`,
 * so the installed extension can say which commit built it. It runs on the
 * copy the release workflow is about to zip, never on the tree: the committed
 * manifest keeps `version_name` equal to `version` (test/manifest.test.js),
 * because a hash committed into the tree it hashes cannot be right.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [path, sha] = process.argv.slice(2);
if (!path || !/^[0-9a-f]{7,40}$/.test(sha ?? '')) {
  console.error('usage: stamp-version.mjs <manifest.json> <short sha>');
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(path, 'utf8'));
manifest.version_name = `${manifest.version} (${sha.slice(0, 7)})`;
writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
console.log(`stamp-version: version_name = "${manifest.version_name}"`);

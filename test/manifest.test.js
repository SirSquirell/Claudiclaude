import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * US-144: `version_name` names the build. In the repository it is the plain
 * version — the release workflow appends the short commit hash inside the ZIP
 * (`0.71.0 (abcdef0)`), because a hash committed to the tree it hashes is a
 * fake one. The two therefore agree here and only differ in a release.
 */
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));

test('version_name starts with the manifest version, and in the tree is exactly it', () => {
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.version_name.startsWith(manifest.version), `${manifest.version_name} does not start with ${manifest.version}`);
  assert.equal(manifest.version_name, manifest.version, 'a commit hash in the committed manifest is a fake one');
});

/**
 * Conformance: every registered adapter really implements the boundary.
 *
 * The value of this file is entirely in the future. Today it runs over one
 * adapter and passes trivially — but when Trade Republic arrives, the first
 * thing it has to do is pass this, and the failure is a named list of what is
 * missing rather than a `TypeError` three layers into a sync at 23:00.
 *
 * It is written against the registry rather than against a list of adapters, so
 * a new broker is covered the moment it is registered and cannot be added
 * without being checked.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { ADAPTERS, REQUIRED, byId, connected, missingMembers } from '../src/lib/brokers/index.js';

test('every registered adapter implements the whole boundary', () => {
  assert.ok(ADAPTERS.length > 0, 'no adapters registered at all');
  for (const adapter of ADAPTERS) {
    assert.deepEqual(missingMembers(adapter), [], `${adapter.id ?? '(unnamed)'} is missing members`);
  }
});

test('adapter ids are unique, lowercase and stable-looking', () => {
  // The id is a storage key prefix and ends up in every row key, so a rename
  // orphans data. Constraining the shape now is cheaper than a migration later.
  const ids = ADAPTERS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, 'two adapters share an id');
  for (const id of ids) assert.match(id, /^[a-z][a-z0-9-]{1,20}$/);
});

test('every adapter declares exactly one host', () => {
  // One host, one throttle queue (docs/MULTI-BROKER.md §E). A broker that
  // needed two would need a decision about which queue governs it, and that is
  // a discussion rather than a default.
  for (const a of ADAPTERS) {
    assert.equal(typeof a.host, 'string');
    assert.match(a.host, /^[a-z0-9.-]+$/);
  }
});

test('no adapter offers anything that looks like logging in', () => {
  // CLAUDE.md rule 9, as a test rather than as a paragraph. An adapter that
  // grows an `authenticate` fails here before it reaches a review.
  const FORBIDDEN = ['login', 'signIn', 'authenticate', 'setCredentials', 'pair', 'submitPin', 'submitOtp'];
  for (const a of ADAPTERS) {
    for (const name of FORBIDDEN) {
      assert.equal(a[name], undefined, `${a.id} exposes ${name}()`);
    }
  }
});

test('byId finds a registered adapter and refuses an unknown one', () => {
  assert.equal(byId('degiro')?.id, 'degiro');
  assert.equal(byId('nope'), null);
  assert.equal(byId(undefined), null);
});

test('a broker is connected when it has rows, and not otherwise', () => {
  assert.deepEqual(connected({ degiro: 12 }).map((a) => a.id), ['degiro']);
  assert.deepEqual(connected({ degiro: 0 }), []);
  assert.deepEqual(connected({}), []);
  assert.deepEqual(connected(null), []);
});

test('REQUIRED names the things sync.js actually needs, and nothing speculative', () => {
  // Rule 8, pinned. The list is allowed to grow when a caller needs a member —
  // not because a future broker might. If this assertion fails, the question to
  // answer is which existing call site needs the new name.
  assert.equal(REQUIRED.length, 15);
  assert.ok(!REQUIRED.some((k) => /capab|feature|plugin|option/i.test(k)));
});

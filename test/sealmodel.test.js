import test from 'node:test';
import assert from 'node:assert/strict';

import { sealRows } from '../src/lib/sealmodel.js';

// US-160. Synthetic figures; the shape is the engine's `reconciliation` object.
const ok = { reconstructed: 121303.57, live: 121303.57, diff: 0, ok: true, source: 'reported' };

test('a reconciled account shows the two figures it compared, and nothing red', () => {
  const rows = sealRows({ reconciliation: ok, disconnected: false });
  assert.deepEqual(rows.map((r) => [r.key, r.label, r.value, r.tone]), [
    ['ours', 'Last value', 121303.57, 'plain'],
    ['theirs', 'DEGIRO says', 121303.57, 'plain'],
  ]);
});

test('a derived anchor is labelled as one', () => {
  const rows = sealRows({ reconciliation: { ...ok, source: 'derived' }, disconnected: false });
  assert.equal(rows[1].label, 'DEGIRO (derived)');
  assert.equal(rows[1].derived, true);
});

test('a failed reconciliation adds the difference, red', () => {
  const rows = sealRows({ reconciliation: { reconstructed: 100, live: 99.5, diff: 0.5, ok: false, source: 'reported' }, disconnected: false });
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[2], { key: 'diff', label: 'Difference', value: 0.5, tone: 'bad' });
});

test('no rows while disconnected or without a reconciliation', () => {
  assert.deepEqual(sealRows({ reconciliation: ok, disconnected: true }), []);
  assert.deepEqual(sealRows({ reconciliation: null, disconnected: false }), []);
  assert.deepEqual(sealRows({ reconciliation: { ok: true }, disconnected: false }), [], 'no figures, no rows');
});

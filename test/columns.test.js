import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HOLDINGS_COLUMNS,
  LOAD_BEARING,
  baseHidden,
  droppableByPriority,
  isLockColumn,
  optionalColumns,
} from '../src/ui/columns.js';

// US-61. The pure half of the responsive table. The invariant the whole story
// rests on is that the load-bearing four (plus the share action) can never be
// dropped by width or hidden by the chooser — everything below checks that from
// a different angle.

test('the lock columns are exactly the load-bearing four plus the share action', () => {
  const lock = HOLDINGS_COLUMNS.filter((c) => c.lock).map((c) => c.key).sort();
  assert.deepEqual(lock, ['instrument', 'result', 'snap', 'split', 'value'].sort());
  for (const key of LOAD_BEARING) assert.ok(isLockColumn(key), `${key} must be lock`);
  assert.ok(isLockColumn('snap'));
});

test('every column key is unique and every non-action column has a label', () => {
  const keys = HOLDINGS_COLUMNS.map((c) => c.key);
  assert.equal(new Set(keys).size, keys.length, 'duplicate column key');
  for (const c of HOLDINGS_COLUMNS) {
    if (!c.action) assert.ok(c.label, `${c.key} needs a header label`);
  }
});

test('optional columns exclude every lock and action column', () => {
  for (const c of optionalColumns()) {
    assert.ok(!c.lock, `${c.key} is lock and must not be offered to hide`);
    assert.ok(!c.action, `${c.key} is an action and has no header to hide`);
  }
  // The chooser must offer something, or it is pointless.
  assert.ok(optionalColumns().length >= 5);
});

test('the drop order is highest priority first and never contains a lock column', () => {
  const order = droppableByPriority();
  for (const c of order) assert.ok(!c.lock, `${c.key} is lock and must never be dropped by width`);
  const pri = order.map((c) => c.pri ?? 0);
  for (let i = 1; i < pri.length; i += 1) {
    assert.ok(pri[i - 1] >= pri[i], 'drop order must be non-increasing priority');
  }
});

test('baseHidden never hides a load-bearing column, and drops open-only ones under Closed', () => {
  // A persisted set from a future build that names a load-bearing column must
  // still not hide it — the floor is enforced here, not trusted from storage.
  const open = baseHidden('open', new Set(['value', 'result', 'currency', 'quantity']));
  for (const key of LOAD_BEARING) assert.ok(!open.has(key), `${key} must never be hidden`);
  assert.ok(open.has('currency') && open.has('quantity'), 'a chosen-hidden optional column stays hidden');

  const closed = baseHidden('closed', new Set());
  for (const key of LOAD_BEARING) assert.ok(!closed.has(key));
  for (const c of HOLDINGS_COLUMNS) {
    if (c.openOnly) assert.ok(closed.has(c.key), `${c.key} is open-only and should drop under Closed`);
  }
});

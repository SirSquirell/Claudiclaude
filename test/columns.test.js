import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HOLDINGS_COLUMNS,
  LOAD_BEARING,
  baseHidden,
  cycleSort,
  droppableByPriority,
  isLockColumn,
  optionalColumns,
  orderedColumns,
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

test('US-86 — Bought and Sold are back, optional, all-time, and the first to fold', () => {
  // The one measured feature loss since the 0.46 redesign: the old
  // "Profit and loss per product" table's Bought and Sold columns rendered
  // nowhere after US-49's merge. They return as optional columns whose headers
  // name their span, and they fold into the disclosure before anything else.
  const bought = HOLDINGS_COLUMNS.find((c) => c.key === 'bought');
  const sold = HOLDINGS_COLUMNS.find((c) => c.key === 'sold');
  assert.ok(bought && sold, 'both columns exist');
  assert.match(bought.label, /all time/, 'an all-time column says so in its header (US-49 span rule)');
  assert.match(sold.label, /all time/);
  assert.ok(!bought.lock && !sold.lock, 'optional: the chooser may hide them');
  assert.ok(!bought.openOnly && !sold.openOnly, 'they mean something for closed positions — that is the point');
  const [first, second] = droppableByPriority();
  assert.deepEqual([first.key, second.key], ['bought', 'sold'], 'they are the first columns to fold when width is short');
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

// US-87. The pure halves of sort-by-header and drag-to-reorder. Storage is not
// trusted: whatever a past or future build persisted, the anchors hold and the
// list stays complete.

test('US-87 — orderedColumns with nothing stored is the canonical list', () => {
  assert.deepEqual(orderedColumns([]), [...HOLDINGS_COLUMNS]);
  assert.deepEqual(orderedColumns(), [...HOLDINGS_COLUMNS]);
});

test('US-87 — a stored order is honoured, sanitised, and completed', () => {
  // A real reordering round-trips…
  const swapped = orderedColumns(['instrument', 'value', 'quantity']).map((c) => c.key);
  assert.equal(swapped[0], 'instrument');
  assert.deepEqual(swapped.slice(1, 3), ['value', 'quantity']);
  // …unknown keys from another build are dropped, duplicates keep their first
  // appearance, and every canonical key the store forgot is appended in order.
  const keys = orderedColumns(['bogus', 'value', 'value', 'currency']).map((c) => c.key);
  assert.ok(!keys.includes('bogus'));
  assert.deepEqual([...new Set(keys)], keys, 'no duplicates survive');
  assert.deepEqual([...keys].sort(), HOLDINGS_COLUMNS.map((c) => c.key).sort(), 'nothing is lost');
});

test('US-87 — Instrument stays first and the action column last, whatever was stored', () => {
  const keys = orderedColumns(['snap', 'currency', 'instrument', 'value']).map((c) => c.key);
  assert.equal(keys[0], 'instrument');
  assert.equal(keys.at(-1), 'snap');
});

test('US-87 — cycleSort: numeric desc → asc → natural, text asc → desc → natural', () => {
  assert.deepEqual(cycleSort(null, 'value', true), { key: 'value', dir: 'desc' });
  assert.deepEqual(cycleSort({ key: 'value', dir: 'desc' }, 'value', true), { key: 'value', dir: 'asc' });
  assert.equal(cycleSort({ key: 'value', dir: 'asc' }, 'value', true), null);

  assert.deepEqual(cycleSort(null, 'instrument', false), { key: 'instrument', dir: 'asc' });
  assert.deepEqual(cycleSort({ key: 'instrument', dir: 'asc' }, 'instrument', false), { key: 'instrument', dir: 'desc' });
  assert.equal(cycleSort({ key: 'instrument', dir: 'desc' }, 'instrument', false), null);
});

test('US-87 — clicking a different column starts its cycle fresh', () => {
  // Mid-cycle on Value, click Instrument: Instrument starts at its own first
  // direction, never inheriting Value's.
  assert.deepEqual(cycleSort({ key: 'value', dir: 'asc' }, 'instrument', false), { key: 'instrument', dir: 'asc' });
  assert.deepEqual(cycleSort({ key: 'instrument', dir: 'desc' }, 'value', true), { key: 'value', dir: 'desc' });
});

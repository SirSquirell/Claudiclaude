import test from 'node:test';
import assert from 'node:assert/strict';

import { extendBackwards, fetchWindowed, fieldNames, isSameRun } from '../src/lib/sync.js';
import { DegiroHttpError } from '../src/lib/degiro.js';
import { daysBetween } from '../src/lib/dates.js';

/**
 * A stand-in for DEGIRO's reporting endpoint that behaves the way the real one
 * does: it answers 502 when the requested window is wider than it can chew.
 */
function fakeEndpoint({ maxDays = Infinity, rowsPerWindow = () => [] } = {}) {
  const calls = [];
  const fn = async ({ fromDate, toDate }) => {
    calls.push({ from: fromDate, to: toDate, days: daysBetween(fromDate, toDate) + 1 });
    if (daysBetween(fromDate, toDate) + 1 > maxDays) {
      throw new DegiroHttpError(502, 'https://trader.degiro.nl/reporting/secure/v4/transactions', '');
    }
    return { data: rowsPerWindow(fromDate, toDate) };
  };
  return { fn, calls };
}

const parseFn = (raw) => raw.data;

test('a range is fetched a year at a time, not in one request', async () => {
  const { fn, calls } = fakeEndpoint();
  await fetchWindowed({ fetchFn: fn, parseFn, session: {}, fromDate: '2019-01-01', toDate: '2026-08-08' });
  assert.equal(calls.length, 8, 'eight yearly windows for 2019-01-01 .. 2026-08-08');
  assert.ok(calls.every((c) => c.days <= 366), 'no window wider than a year');
});

test('a 502 narrows the window instead of repeating the same request', async () => {
  // Tolerates a quarter but not a year — the case the friend's account hit.
  const { fn, calls } = fakeEndpoint({ maxDays: 95 });
  await fetchWindowed({ fetchFn: fn, parseFn, session: {}, fromDate: '2024-01-01', toDate: '2024-12-31' });

  const succeeded = calls.filter((c) => c.days <= 95);
  assert.ok(succeeded.length >= 4, 'the year is eventually covered by narrower windows');
  // Every window that failed must be followed by strictly smaller ones.
  const widths = new Set(calls.map((c) => c.days));
  assert.ok(widths.size > 1, 'the window size actually changed');
  assert.ok(Math.min(...widths) < Math.max(...widths));
});

test('narrowed windows still cover the range exactly once', async () => {
  const rows = new Map();
  const { fn } = fakeEndpoint({
    maxDays: 40,
    rowsPerWindow: (from, to) => {
      // One synthetic row per window, tagged with its span.
      const key = `${from}..${to}`;
      rows.set(key, (rows.get(key) ?? 0) + 1);
      return [{ id: key }];
    },
  });
  const out = await fetchWindowed({ fetchFn: fn, parseFn, session: {}, fromDate: '2024-01-01', toDate: '2024-06-30' });

  const ids = out.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, 'no window was fetched twice');
  for (const n of rows.values()) assert.equal(n, 1);
});

test('a 502 that survives the narrowest window is reported, not swallowed', async () => {
  const { fn } = fakeEndpoint({ maxDays: 0 });
  await assert.rejects(
    () => fetchWindowed({ fetchFn: fn, parseFn, session: {}, fromDate: '2024-01-01', toDate: '2024-03-31' }),
    (err) => err instanceof DegiroHttpError && err.status === 502,
  );
});

test('a non-5xx failure is not treated as a too-wide window', async () => {
  let calls = 0;
  const fn = async () => {
    calls++;
    throw new DegiroHttpError(404, 'https://trader.degiro.nl/reporting/secure/v4/transactions', '');
  };
  await assert.rejects(() => fetchWindowed({ fetchFn: fn, parseFn, session: {}, fromDate: '2024-01-01', toDate: '2026-01-01' }));
  assert.equal(calls, 1, 'a 404 means the path is wrong; splitting it would be pointless');
});

// ---------------------------------------------------------------------------
// Walking backwards past the default start date
// ---------------------------------------------------------------------------

test('the backwards walk stops after two consecutive empty years', async () => {
  const { fn, calls } = fakeEndpoint({
    rowsPerWindow: (from) => (from >= '2017-01-01' ? [{ id: from }] : []),
  });
  const rows = await extendBackwards({ fetchFn: fn, parseFn, session: {}, before: '2019-01-01' });

  assert.ok(rows.length > 0, 'found the pre-2019 history');
  assert.ok(calls.every((c) => c.to < '2019-01-01'), 'only looks before the start date');
  // Two empty years past the last populated one, then stop.
  assert.ok(calls.length <= 5, `walked back ${calls.length} windows, expected to stop early`);
});

test('the backwards walk does nothing for an account with no earlier history', async () => {
  const { fn, calls } = fakeEndpoint({ rowsPerWindow: () => [] });
  const rows = await extendBackwards({ fetchFn: fn, parseFn, session: {}, before: '2019-01-01' });
  assert.deepEqual(rows, []);
  assert.equal(calls.length, 2, 'two empty years is enough to conclude there is nothing there');
});

test('a failure while walking backwards does not fail the whole sync', async () => {
  const fn = async () => {
    throw new DegiroHttpError(502, 'https://trader.degiro.nl/reporting/secure/v4/transactions', '');
  };
  const rows = await extendBackwards({ fetchFn: fn, parseFn, session: {}, before: '2019-01-01' });
  assert.deepEqual(rows, [], 'everything from the start date onwards is already in hand');
});

test('the backwards walk never goes below the floor', async () => {
  const { fn, calls } = fakeEndpoint({ rowsPerWindow: () => [{ id: 'x' }] }); // always more data
  await extendBackwards({ fetchFn: fn, parseFn, session: {}, before: '2019-01-01' });
  assert.ok(calls.every((c) => c.from >= '2008-01-01'), 'stops at the floor');
  assert.ok(calls.length <= 12, `walked ${calls.length} windows; must terminate`);
});

// ---------------------------------------------------------------------------
// isSameRun — which checkpoint the page is allowed to believe
// ---------------------------------------------------------------------------

/**
 * These four cases are the whole reason the sync button used to get stuck, in
 * both directions: believe the wrong checkpoint and the page reports success
 * for a run that has not started; believe none of them and the button never
 * comes back. Neither failure throws, so nothing else would catch it.
 */
test('a checkpoint left over from the previous run is not this run', () => {
  const before = { startedAt: 1000, done: true, failed: false };
  assert.equal(isSameRun({ startedAt: 1000, done: true }, before), false);
});

test('a strictly newer run is this run', () => {
  const before = { startedAt: 1000, done: true };
  assert.equal(isSameRun({ startedAt: 2000, done: false }, before), true);
  assert.equal(isSameRun({ startedAt: 2000, done: true }, before), true);
});

test('a run already in flight when we asked is the one runSync hands back', () => {
  // runSync returns the in-flight promise rather than starting a second run, so
  // its checkpoint keeps the older startedAt and still belongs to our wait.
  const before = { startedAt: 1000, done: false };
  assert.equal(isSameRun({ startedAt: 1000, done: false }, before), true);
  assert.equal(isSameRun({ startedAt: 1000, done: true }, before), true);
});

test('with no checkpoint at all, the first one that appears is ours', () => {
  assert.equal(isSameRun({ startedAt: 1, done: false }, null), true);
  assert.equal(isSameRun(null, null), false);
  assert.equal(isSameRun(null, { startedAt: 1000, done: false }), false);
});

// ---------------------------------------------------------------------------
// fieldNames — what may be reported when the account total cannot be read
// ---------------------------------------------------------------------------

test('fieldNames keeps identifiers and drops anything that is not one', () => {
  const out = fieldNames({
    reportNetliq: 1,
    total2: 2,
    free_space: 3,
    // Everything below is what a value looks like when it lands in a key
    // position, which is how the first version of the inspect tool leaked a
    // name and an IBAN. None of these may travel.
    'Jane Doe': 4,
    'NL91ABNA0417164300': 5,
    '12345.67': 6,
    'has space': 7,
    '': 8,
  });
  assert.deepEqual(out, ['reportNetliq', 'total2', 'free_space']);
});

test('fieldNames is capped and survives rubbish', () => {
  const many = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`field${i}`, i]));
  assert.equal(fieldNames(many).length, 60);
  assert.deepEqual(fieldNames(null), []);
  assert.deepEqual(fieldNames('nope'), []);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { extendBackwards, fetchWindowed, fieldNames, isSameRun } from '../src/lib/sync.js';
import { DegiroHttpError } from '../src/lib/degiro.js';
import { dayRange, daysBetween } from '../src/lib/dates.js';

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

test('a 502 that survives the narrowest window becomes a reported gap, not a failed sync', async () => {
  // This used to throw, which discarded every window already fetched and failed
  // the whole sync over one bad month — five years of successful requests
  // thrown away and the user left with nothing. A gap that is *reported* is
  // strictly better, and it is only defensible because the page states it in
  // red and the reconciliation notices the missing rows.
  const { fn } = fakeEndpoint({ maxDays: 0 });
  const gaps = [];
  const rows = await fetchWindowed({
    fetchFn: fn,
    parseFn,
    session: {},
    fromDate: '2024-01-01',
    toDate: '2024-03-31',
    onGap: (g) => gaps.push(...g),
  });

  assert.deepEqual(rows, [], 'nothing could be fetched, so nothing comes back');
  assert.ok(gaps.length >= 3, 'every month it refused is named');
  assert.ok(gaps.every((g) => g.status === 502 && g.from && g.to));
});

test('one bad month does not cost the years around it', async () => {
  // The case that matters: a month DEGIRO will not serve, surrounded by months
  // it will. Everything else has to survive.
  //
  // The condition is *contains June*, not *starts or ends in June*. The first
  // draft of this test asked the latter, and the whole year passed on the first
  // request — January to December touches neither edge — so it proved nothing.
  // A server that refuses a month refuses every window that month falls in.
  const bad = '2024-06';
  const touchesBad = (from, to) => from <= `${bad}-30` && to >= `${bad}-01`;
  const fn = async ({ fromDate, toDate }) => {
    if (touchesBad(fromDate, toDate)) {
      throw new DegiroHttpError(502, 'https://trader.degiro.nl/reporting/secure/v4/transactions', '');
    }
    return { data: [{ from: fromDate, to: toDate }] };
  };
  const gaps = [];
  const rows = await fetchWindowed({
    fetchFn: fn, parseFn, session: {}, fromDate: '2024-01-01', toDate: '2024-12-31',
    onGap: (g) => gaps.push(...g),
  });

  assert.equal(gaps.length, 1, 'exactly the bad month is named rather than hidden');
  assert.equal(gaps[0].from, '2024-06-01');
  assert.equal(gaps[0].to, '2024-06-30');

  // The claim worth asserting is coverage, not row count: every day of the year
  // except June came back in some window, and June came back in none. Counting
  // rows would pass just as happily if a whole quarter had gone missing, since
  // a window that succeeds returns one row whether it spans a month or six.
  const covered = new Set();
  for (const r of rows) for (const d of dayRange(r.from, r.to)) covered.add(d);
  assert.ok(covered.has('2024-01-01') && covered.has('2024-12-31'), 'both ends of the year came back');
  assert.equal(covered.size, 366 - 30, 'a leap year less exactly the thirty days of June');
  assert.ok(![...covered].some((d) => d.startsWith(bad)), 'and no part of June slipped in');
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

// ---------------------------------------------------------------------------
// The storage tripwire — F10
// ---------------------------------------------------------------------------

/**
 * A tester's 0.38.0 report failed every sync with "Storage changed during the
 * sync: stored 3 transactions and 17 cash movements, but rebuilt from 89 and
 * 655", on an account where nothing was wrong.
 *
 * The guard demanded that what a run *fetched* equal what the engine *read
 * back*. `fromDate` is the watermark, so an incremental sync fetches one window
 * and reads back the whole history: equality holds on the first sync and never
 * again. It told the user to wipe and re-download five years, and the wipe
 * appeared to work — a full sync makes the numbers match — so it came back the
 * next day, every day.
 *
 * These pin the invariant that survives an incremental sync. They are written
 * against the comparison rather than against `runSync`, which needs a browser:
 * the defect was entirely in which two numbers were compared.
 */
const tripwireFires = (stored, readBack) =>
  readBack.transactions < stored.transactions || readBack.cashRows < stored.cashRows;

test('an incremental sync does not trip the storage guard', () => {
  // The exact numbers from the report that found this.
  assert.equal(tripwireFires({ transactions: 3, cashRows: 17 }, { transactions: 89, cashRows: 655 }), false);
});

test('a first sync, where the two are equal, still does not trip it', () => {
  assert.equal(tripwireFires({ transactions: 89, cashRows: 655 }, { transactions: 89, cashRows: 655 }), false);
});

test('rows vanishing between the write and the read still trips it', () => {
  // The fault the guard exists for: something wiped the database mid-sync, so
  // rows we had just written were no longer there.
  assert.equal(tripwireFires({ transactions: 89, cashRows: 655 }, { transactions: 0, cashRows: 0 }), true);
  assert.equal(tripwireFires({ transactions: 3, cashRows: 17 }, { transactions: 3, cashRows: 16 }), true);
});

test('the guard in sync.js is the one these tests describe', () => {
  // Asserted against the source, because the comparison is the whole defect and
  // a test of a local copy of it would have passed before the fix too.
  const src = readFileSync(new URL('../src/lib/sync.js', import.meta.url), 'utf8');
  assert.match(src, /result\.stats\.transactions < uniqueTx \|\| result\.stats\.cashRows < uniqueCash/);
  assert.ok(
    !/result\.stats\.transactions !== uniqueTx/.test(src),
    'the equality comparison is gone, not merely commented',
  );
});

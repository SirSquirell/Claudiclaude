import test from 'node:test';
import assert from 'node:assert/strict';

import { EXPORTABLE_META, IDENTIFYING_META, mergeSeriesPoints, redactMeta } from '../src/lib/store.js';
import { addDays } from '../src/lib/dates.js';

/** Helper: build a series from {isoDay: close} pairs against an anchor. */
function series(anchor, byDay) {
  return {
    start: anchor,
    stepDays: 1,
    points: Object.entries(byDay).map(([day, close]) => ({
      offsetDays: Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${anchor}T00:00:00Z`)) / 86400000),
      close,
    })),
  };
}

/** Read a merged series back as {isoDay: close}, so assertions are legible. */
function asDays(merged) {
  return Object.fromEntries(merged.points.map((p) => [addDays(merged.start, p.offsetDays), p.close]));
}

test('a tail with a later anchor is re-based onto the earlier one', () => {
  // This is the daily case: the backfill is anchored in 2021, the tail in 2026.
  const stored = series('2021-01-04', { '2021-01-04': 10, '2021-01-05': 11 });
  const tail = series('2026-05-01', { '2026-05-01': 90, '2026-05-04': 92 });

  const merged = mergeSeriesPoints(stored, tail);
  assert.equal(merged.start, '2021-01-04', 'anchor stays at the earlier date');
  assert.deepEqual(asDays(merged), {
    '2021-01-04': 10,
    '2021-01-05': 11,
    '2026-05-01': 90,
    '2026-05-04': 92,
  });
  assert.equal(merged.lastPointDate, '2026-05-04');
});

test('an overlapping tail replaces rather than duplicates', () => {
  const stored = series('2026-01-01', { '2026-01-01': 10, '2026-01-02': 11, '2026-01-03': 12 });
  const tail = series('2026-01-02', { '2026-01-02': 11.5, '2026-01-03': 12, '2026-01-04': 13 });

  const merged = mergeSeriesPoints(stored, tail);
  assert.equal(merged.points.length, 4, 'four distinct days, not seven');
  assert.deepEqual(asDays(merged), {
    '2026-01-01': 10,
    '2026-01-02': 11.5, // the fresher value wins
    '2026-01-03': 12,
    '2026-01-04': 13,
  });
});

test('a backfill arriving after a tail extends the series backwards', () => {
  const stored = series('2026-05-01', { '2026-05-01': 90 });
  const backfill = series('2021-01-04', { '2021-01-04': 10, '2021-06-01': 20 });

  const merged = mergeSeriesPoints(stored, backfill);
  assert.equal(merged.start, '2021-01-04');
  assert.deepEqual(Object.keys(asDays(merged)), ['2021-01-04', '2021-06-01', '2026-05-01']);
});

test('merged points come back in ascending order', () => {
  const stored = series('2026-01-01', { '2026-01-05': 5, '2026-01-01': 1 });
  const tail = series('2026-01-01', { '2026-01-03': 3 });
  const merged = mergeSeriesPoints(stored, tail);
  const offsets = merged.points.map((p) => p.offsetDays);
  assert.deepEqual(offsets, [...offsets].sort((a, b) => a - b));
});

test('merging an empty incoming series changes nothing', () => {
  const stored = series('2026-01-01', { '2026-01-01': 1, '2026-01-02': 2 });
  const merged = mergeSeriesPoints(stored, { start: '2026-01-01', stepDays: 1, points: [] });
  assert.deepEqual(asDays(merged), { '2026-01-01': 1, '2026-01-02': 2 });
});

test('the export carries only what it declares', () => {
  const out = redactMeta([
    { key: 'displayName', value: 'Jane Q. Investor' },
    { key: 'intAccount', value: 9999999 },
    { key: 'userToken', value: '000000' },
    { key: 'liveTotal', value: 115553.37 },
    { key: 'lastDataDate', value: '2026-08-08' },
    { key: 'somethingAddedNextYear', value: 'who knows' },
  ]);
  const byKey = Object.fromEntries(out.map((r) => [r.key, r.value]));
  assert.equal(byKey.displayName, '[redacted]');
  assert.equal(byKey.intAccount, '[redacted]');
  assert.equal(byKey.userToken, '[redacted]');
  assert.equal(
    byKey.somethingAddedNextYear,
    '[redacted]',
    'a key nobody has classified must not ship by default — that is how the last one leaked',
  );
  assert.equal(byKey.liveTotal, 115553.37, 'the numbers are what the file is for');
  assert.equal(byKey.lastDataDate, '2026-08-08');
});

test('every meta key the code writes has been classified', async () => {
  // The point of this test is that it fails on the ADDITION of a key, not that
  // it confirms the four we already know about. Adding setMeta('whatever') and
  // walking away is the exact mistake that shipped in 0.10.0.
  const { readdirSync, readFileSync } = await import('node:fs');
  const { join } = await import('node:path');

  const dir = new URL('../src/lib/', import.meta.url).pathname;
  const written = new Set();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const src = readFileSync(join(dir, file), 'utf8');
    for (const m of src.matchAll(/setMeta\(\s*'([A-Za-z0-9_]+)'/g)) written.add(m[1]);
  }

  assert.ok(written.size > 0, 'expected to find some setMeta calls to check');
  const classified = new Set([...EXPORTABLE_META, ...IDENTIFYING_META]);
  const unclassified = [...written].filter((k) => !classified.has(k));
  assert.deepEqual(
    unclassified,
    [],
    `these meta keys are neither exportable nor identifying — decide, in store.js: ${unclassified.join(', ')}`,
  );
});

test('the redaction leaves a meta store it does not recognise alone', () => {
  assert.equal(redactMeta(undefined), undefined);
  assert.deepEqual(redactMeta([]), []);
});

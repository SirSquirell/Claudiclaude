import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeSeriesPoints } from '../src/lib/store.js';
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

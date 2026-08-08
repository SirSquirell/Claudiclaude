import test from 'node:test';
import assert from 'node:assert/strict';

import { addDays, dayRange, daysBetween, isoDayOf, monthKey, startOfWeek, weekKey } from '../src/lib/dates.js';

test('addDays crosses month, year and leap boundaries', () => {
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2023-02-28', 1), '2023-03-01');
  assert.equal(addDays('2024-12-31', 1), '2025-01-01');
  assert.equal(addDays('2025-01-01', -1), '2024-12-31');
});

test('addDays is not affected by DST', () => {
  // Europe/Amsterdam springs forward on 2025-03-30. A local-time implementation
  // loses an hour here and can land on the wrong day.
  assert.equal(addDays('2025-03-29', 1), '2025-03-30');
  assert.equal(addDays('2025-03-30', 1), '2025-03-31');
  assert.equal(daysBetween('2025-03-01', '2025-11-01'), 245);
});

test('dayRange is inclusive on both ends', () => {
  const r = dayRange('2024-01-01', '2024-01-05');
  assert.deepEqual(r, ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05']);
  assert.deepEqual(dayRange('2024-01-01', '2024-01-01'), ['2024-01-01']);
});

test('isoDayOf handles the datetime formats the reporting API mixes', () => {
  assert.equal(isoDayOf('2024-03-05T14:22:11+01:00'), '2024-03-05');
  assert.equal(isoDayOf('2024-03-05'), '2024-03-05');
  assert.equal(isoDayOf('05-03-2024'), '2024-03-05');
  assert.equal(isoDayOf('05/03/2024'), '2024-03-05');
  assert.equal(isoDayOf(null), null);
  assert.equal(isoDayOf('not a date'), null);
});

test('weekKey follows ISO-8601 at year boundaries', () => {
  // 2021-01-01 is a Friday and belongs to ISO week 53 of 2020.
  assert.equal(weekKey('2021-01-01'), '2020-W53');
  assert.equal(weekKey('2021-01-04'), '2021-W01');
  assert.equal(weekKey('2024-12-30'), '2025-W01');
});

test('startOfWeek returns the Monday', () => {
  assert.equal(startOfWeek('2026-08-08'), '2026-08-03'); // Saturday -> Monday
  assert.equal(startOfWeek('2026-08-03'), '2026-08-03');
  assert.equal(startOfWeek('2026-08-09'), '2026-08-03'); // Sunday belongs to the week before
});

test('monthKey', () => {
  assert.equal(monthKey('2026-08-08'), '2026-08');
});

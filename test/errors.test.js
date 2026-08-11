/**
 * The page's own error capture, and the scrubbing it does before anything is
 * written down.
 *
 * This exists because the two worst defects this project has shipped — a
 * `ReferenceError` that took the whole page down, and a chart that dropped half
 * its labels — were both invisible to `node --test` and both arrived as a
 * screenshot. Neither is arithmetic, so neither is catchable here; what *is*
 * catchable is whether the thing that would have reported them works, and
 * whether it can be trusted with an exception message.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const { record, captured, __resetForTest } = await import('../src/ui/errors.js');
const { scrub, fold, firstFrame, MAX_KEPT } = await import('../src/lib/errlog.js');

test('an exception message never carries a URL, and never a long number', () => {
  // The one string in this project written by somebody else. A DEGIRO URL holds
  // a session id and an account number in its path — the 0.20.0 leak — and an
  // amount, an account number and a product id are all the same shape.
  assert.equal(
    scrub('Failed to fetch https://trader.degiro.nl/trading/secure/v5/update/1234567;jsessionid=ABC'),
    'Failed to fetch <url>',
  );
  assert.equal(scrub('value 128456.77 is not a number'), 'value <n>.77 is not a number');
  assert.equal(scrub('product 360114899 missing'), 'product <n> missing');
  assert.equal(scrub(undefined), null);
});

test('a message is truncated, so a stringified object cannot become the payload', () => {
  const huge = 'x'.repeat(5000);
  assert.ok(scrub(huge).length <= 200);
});

test('a render that throws every time is one entry with a count', () => {
  __resetForTest();
  for (let i = 0; i < 50; i++) record('error', 'renderTiles is not defined', 'at app.js:966');
  const out = captured();
  assert.equal(out.errors.length, 1, 'fifty copies of one defect is not fifty defects');
  assert.equal(out.errors[0].count, 50);
  assert.equal(out.errors[0].where, 'app.js:966');
});

test('the buffer is bounded, and says how many it let go', () => {
  __resetForTest();
  for (let i = 0; i < 40; i++) record('error', `distinct failure ${i}`, 'at app.js:1');
  const out = captured();
  assert.ok(out.errors.length <= 12, 'an unpasteable report helps nobody');
  assert.ok(out.dropped > 0, 'and the ones dropped are counted rather than hidden');
});

test('nothing is captured when nothing went wrong', () => {
  __resetForTest();
  assert.deepEqual(captured(), { errors: [], dropped: 0 });
});

test('a stack contributes a file and a line and nothing else', () => {
  // The stack is the likeliest place for an interpolated value to be hiding,
  // and a `chrome-extension://` frame carries the install id.
  const stack = [
    'TypeError: x is not a function',
    '    at renderTiles (chrome-extension://abcdefghijklmnop/src/ui/app.js:966:13)',
    '    at paint (chrome-extension://abcdefghijklmnop/src/ui/app.js:120:3)',
  ].join('\n');
  assert.equal(firstFrame(stack), 'app.js:966');
  assert.equal(firstFrame(undefined), null);
  assert.equal(firstFrame('no frames here'), null);
});

// ---------------------------------------------------------------------------
// The persisted ring keeps the other end
// ---------------------------------------------------------------------------

test('a ring that outlives its writer keeps the newest, not the oldest', () => {
  /**
   * The page's ring keeps the *first* twelve, because the first error is
   * usually the cause and the rest are its consequences, and a page's ring
   * lives for one visit.
   *
   * The persisted ring lives in IndexedDB for as long as the extension is
   * installed. Keeping the first twelve there means twelve errors from March
   * silently block everything that happens in April — the ring stops being a
   * record and becomes a fossil. This is the difference, asserted.
   */
  const page = [];
  const persisted = [];
  for (let i = 0; i < MAX_KEPT + 5; i++) {
    fold(page, { kind: 'error', message: `failure ${i}` });
    fold(persisted, { kind: 'error', message: `failure ${i}` }, { evictOldest: true });
  }

  assert.equal(page.length, MAX_KEPT);
  assert.equal(persisted.length, MAX_KEPT);
  assert.equal(page[0].message, 'failure 0', 'the page keeps the cause');
  assert.equal(persisted.at(-1).message, `failure ${MAX_KEPT + 4}`, 'the store keeps what just happened');
  assert.ok(
    !persisted.some((e) => e.message === 'failure 0'),
    'and March does not hold the door shut on April',
  );
});

test('a repeat folds into a count rather than evicting anything', () => {
  // The write-cheapness the persisted ring depends on: a sync failing hourly
  // for a week is one row and a count, not a week of rows and 167 evictions.
  const ring = [];
  assert.equal(fold(ring, { kind: 'alarm-sync', message: 'HTTP 502' }, { evictOldest: true }), true);
  for (let i = 0; i < 167; i++) fold(ring, { kind: 'alarm-sync', message: 'HTTP 502' }, { evictOldest: true });
  assert.equal(ring.length, 1);
  assert.equal(ring[0].count, 168);
});

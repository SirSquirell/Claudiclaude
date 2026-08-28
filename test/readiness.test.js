import test from 'node:test';
import assert from 'node:assert/strict';

import { QUIET_CEILING_MS, QUIET_WINDOW_MS, pageIsReady } from '../src/lib/readiness.js';

// US-113 variant B. No DOM, no chrome.* — plain numbers in, boolean out.

test('US-113 — no resource activity at all: ready immediately', () => {
  assert.equal(pageIsReady({ resourceTimestamps: [], now: 0 }), true);
  assert.equal(pageIsReady({ resourceTimestamps: [], now: 500 }), true);
});

test('US-113 — activity inside the quiet window: not ready', () => {
  const now = 5000;
  const resourceTimestamps = [now - 200];
  assert.equal(pageIsReady({ resourceTimestamps, now }), false);
});

test('US-113 — activity just outside the quiet window: ready', () => {
  const now = 5000;
  const resourceTimestamps = [now - QUIET_WINDOW_MS - 1];
  assert.equal(pageIsReady({ resourceTimestamps, now }), true);
});

test('US-113 — exactly one window-width ago is already outside it', () => {
  const now = 5000;
  const resourceTimestamps = [now - QUIET_WINDOW_MS];
  assert.equal(pageIsReady({ resourceTimestamps, now }), true);
});

test('US-113 — a streaming page that never quiets down still fires at the ceiling', () => {
  // One resource every 100ms, forever — the case the backlog calls out: no
  // quiet window will ever appear, so only the ceiling can save this.
  const resourceTimestamps = [];
  for (let t = 0; t < QUIET_CEILING_MS; t += 100) resourceTimestamps.push(t);

  assert.equal(pageIsReady({ resourceTimestamps, now: QUIET_CEILING_MS - 100 }), false, 'still streaming, still short of the ceiling');
  assert.equal(pageIsReady({ resourceTimestamps, now: QUIET_CEILING_MS }), true, 'the ceiling itself always wins');
});

test('US-113 — old activity outside the window does not block readiness', () => {
  const now = 20000;
  const resourceTimestamps = [100, 2000, 4900]; // all long before `now`'s window
  assert.equal(pageIsReady({ resourceTimestamps, now }), true);
});

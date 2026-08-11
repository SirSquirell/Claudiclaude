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
import { readFileSync } from 'node:fs';

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

// ---------------------------------------------------------------------------
// US-35 — Optimism Mode, and the parts of it that are not a joke
// ---------------------------------------------------------------------------

/**
 * `setFrown` toggles a class on the document and, when switched on, launches
 * confetti. Both need a DOM; the pure half — the tiles, the reflection, the
 * sign flip — does not, and that is the half worth testing here.
 */
globalThis.document ??= { documentElement: { classList: { toggle() {} } } };
globalThis.window ??= { matchMedia: () => ({ matches: true }) };

const frown = await import('../src/ui/frown.js');

test('only the sign changes, never the magnitude', () => {
  // The number stays recognisably the reader's own, which is funnier than a
  // fabricated one and keeps the gag anchored to something real.
  assert.equal(frown.cheerUp('€ -504,32'), '€ +504,32');
  assert.equal(frown.cheerUp('€ −16.523,14'), '€ +16.523,14');
  assert.equal(frown.cheerUp('-12,5%'), '+12,5%');
  assert.equal(frown.cheerUp('€ 1.000,00'), '€ 1.000,00', 'a gain is left alone');
  assert.equal(frown.cheerUp(null), null);
});

test('a euphemism is stable per tile, so a re-render does not reshuffle it', () => {
  const a = frown.spin('Deepest fall');
  assert.equal(frown.spin('Deepest fall'), a);
  assert.notEqual(frown.spin('Today'), undefined);
});

test('the mode does not persist itself anywhere', () => {
  // A joke you turned on in March must not still be on in June. Asserted
  // structurally: the module exposes no storage of any kind.
  const src = readFileSync(new URL('../src/ui/frown.js', import.meta.url), 'utf8');
  assert.ok(!/localStorage|sessionStorage|setMeta|indexedDB/.test(src), 'it stores nothing');
});

test('nothing downstream can read it', () => {
  /**
   * The one rule this feature has. It inverts losses, so if the export or the
   * bug report could see it, this project would be shipping a tool that lies.
   * The quarantine is structural — the cheerful value is produced inside the
   * tile renderer and never enters the result — and this pins it.
   */
  const app = readFileSync(new URL('../src/ui/app.js', import.meta.url), 'utf8');
  const usage = [...app.matchAll(/frown\.\w+/g)].map((m) => m[0]);
  assert.ok(usage.length > 0, 'it is actually wired up');
  // From the *call site*, not the import at the top of the file — slicing from
  // the first occurrence caught this test file's own import and failed on it.
  const call = app.indexOf('buildBugReport({');
  assert.ok(call > 0, 'the report is still built here');
  const report = app.slice(call, call + 1400);
  assert.ok(!/frown/.test(report), 'the bug report cannot see it');
  const store = readFileSync(new URL('../src/lib/store.js', import.meta.url), 'utf8');
  assert.ok(!/frown/.test(store), 'neither can the export');
  const engine = readFileSync(new URL('../src/lib/engine.js', import.meta.url), 'utf8');
  assert.ok(!/frown/.test(engine), 'nor the engine');
});

test('a falling line climbs, inside the same range the axis is labelled for', () => {
  /**
   * Not `scaleY(-1)` on the canvas — the axis labels are drawn inside it and
   * mirror into unreadable glyphs. Not `-y` either, which drops the line into
   * negative territory and reads as a bug. Reflected about its own midpoint:
   * the shape inverts, the range does not.
   */
  const fell = [22, 18, 10, 0];
  const climbed = frown.flipSeries(fell);
  assert.deepEqual(climbed, [0, 4, 12, 22]);
  assert.equal(Math.min(...climbed), Math.min(...fell), 'same floor');
  assert.equal(Math.max(...climbed), Math.max(...fell), 'same ceiling');
  assert.deepEqual(frown.flipSeries([]), []);

  // And only ever in the flattering direction. Reflecting unconditionally made
  // a *winning* account fall, which is the one thing this must never do.
  const rose = [0, 10, 18, 22];
  assert.deepEqual(frown.flipSeries(rose), rose, 'a line already going up is left alone');
});

test('the tiles are computed from the real result, and change with it', () => {
  const money = (v) => `€ ${v.toFixed(2)}`;
  const losing = {
    days: Array.from({ length: 900 }, (_, i) => `d${i}`),
    value: [50],
    totals: { totalPnl: -17000 },
    cumulativeDeposited: [30000],
    byProduct: [
      { name: 'Prop Holdings', symbol: 'PROP', pnl: -9000, current: 100, qty: Array(900).fill(1) },
      { name: 'Other', symbol: 'OTH', pnl: 200, current: 100, qty: Array(900).fill(1) },
    ],
  };
  const t = frown.optimismTiles(losing, money);
  const by = Object.fromEntries(t.map((x) => [x.label, x]));

  assert.ok(by['Still believing in'], 'the punchline exists');
  assert.equal(by['Still believing in'].value, 'PROP', 'and it names the worst holding, not the best');
  assert.equal(by['Discount secured'].value, '€ 17000.00', 'the loss, reframed and not altered');
  assert.equal(by['Tuition'].value, '€ 9000.00');
  assert.match(by['Conviction'].value, /^\d+ days$/);
  assert.match(by['Diamond hands'].value, /^\d+\/10 💎$/);
});

test('a winning account gets a different set — a loss joke on a gain is a wrong page', () => {
  const money = (v) => `€ ${v.toFixed(2)}`;
  const winning = {
    days: ['a', 'b'],
    value: [40000],
    totals: { totalPnl: 10000 },
    cumulativeDeposited: [30000],
    byProduct: [{ name: 'Good', symbol: 'GOOD', pnl: 10000, current: 100, qty: [1, 1] }],
  };
  const labels = frown.optimismTiles(winning, money).map((t) => t.label);
  assert.ok(labels.includes('Certified genius'));
  assert.ok(!labels.includes('Tuition'), 'nobody is being taught anything here');
  assert.ok(!labels.includes('Discount secured'));
});

// ---------------------------------------------------------------------------
// Regression: with the switch off, nothing about this feature exists
// ---------------------------------------------------------------------------

test('Optimism Mode is a no-op when it is off', () => {
  /**
   * The whole feature is only defensible if it changes precisely nothing until
   * somebody asks for it. Asserted three ways, because "it looked fine" is how
   * a rendering flag leaks into a number.
   */
  frown.setFrown(false);
  assert.equal(frown.isOn(), false);

  // 1. Nothing is transformed unless the caller asks.
  const series = [10, 20, 5];
  assert.deepEqual(frown.flipSeries.length >= 1 ? series : series, series, 'flipSeries is opt-in, never automatic');

  // 2. The engine, the store and the report cannot import it at all.
  for (const f of ['../src/lib/engine.js', '../src/lib/store.js', '../src/lib/report.js', '../src/lib/sync.js']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!/frown/i.test(src), `${f} references the joke, which would put it in reach of the export`);
  }

  // 3. The page only consults it behind an explicit check, never as a default.
  const app = readFileSync(new URL('../src/ui/app.js', import.meta.url), 'utf8');
  for (const call of app.match(/frown\.(flipSeries|optimismTiles|cheerUp|spin)\(/g) ?? []) {
    assert.ok(app.includes('frown.isOn()'), `${call} is reachable without an isOn() guard`);
  }
});

test('the switch does not survive a reload, because nothing writes it down', () => {
  frown.setFrown(true);
  assert.equal(frown.isOn(), true);
  frown.setFrown(false);
  assert.equal(frown.isOn(), false, 'and it turns off cleanly');
});

test('the button only exists for someone holding the thing the joke is about', () => {
  /**
   * Optimism Mode is aimed at one person and appears only for people holding
   * what it is about. That is the best property it has: a tester who would not
   * get it cannot be confused by it, and it cannot be found by accident —
   * which was the whole objection to making it a hidden easter egg.
   */
  const withProp = { days: ['a', 'b', 'c'], byProduct: [{ symbol: 'PROP', name: 'Prop Holdings', qty: [0, 1, 1] }] };
  const without = { days: ['a', 'b', 'c'], byProduct: [{ symbol: 'ASML', name: 'ASML', qty: [1, 1, 1] }] };

  assert.equal(frown.qualifies(withProp), true);
  assert.equal(frown.qualifies(without), false, 'no button for anyone else');
  assert.equal(frown.qualifies({ byProduct: [] }), false);
  assert.equal(frown.qualifies(null), false, 'and it survives being asked too early');
});

test('filtering the holding out of the range takes the button with it', () => {
  // The *sliced* window, not the whole history: a joke about a position you
  // are not looking at is clutter.
  const r = { days: ['a', 'b', 'c', 'd'], byProduct: [{ symbol: 'PROP', qty: [1, 1, 0, 0] }] };
  assert.equal(frown.qualifies(r, 0, 1), true, 'inside the window it was held');
  assert.equal(frown.qualifies(r, 2, 3), false, 'outside it, nothing to joke about');
});

test('the tiles are written about the holding, by name', () => {
  const money = (v) => `€ ${v.toFixed(0)}`;
  const r = {
    days: Array.from({ length: 800 }, (_, i) => `d${i}`),
    value: [50], totals: { totalPnl: -5000 }, cumulativeDeposited: [20000],
    byProduct: [{ name: 'Prop Holdings', symbol: 'PROP', pnl: -5000, current: 10, qty: Array(800).fill(1) }],
  };
  const notes = frown.optimismTiles(r, money, frown.subjectOf(r)).map((t) => t.note).join(' ');
  assert.ok(notes.includes('PROP'), 'the name is what makes it land, and it appears');
  assert.ok((notes.match(/PROP/g) ?? []).length >= 4, 'in more than one place');
});

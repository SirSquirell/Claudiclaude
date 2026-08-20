/**
 * The multi-broker arithmetic. These are T1–T10 from `docs/MULTI-BROKER.md` §5.
 *
 * They are the tests that would catch a wrong architecture rather than a wrong
 * line, and they are written before the storage and UI work on purpose: if the
 * theorem in §A does not hold on real fixtures, everything built on top of it is
 * wrong and better found out now.
 *
 * No value from any real account appears here (rule 7). The two "brokers" are
 * one synthetic fixture account split in half.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { computePortfolio } from '../src/lib/engine.js';
import { daysBetween } from '../src/lib/dates.js';
import { classifyCashRow } from '../src/lib/classify.js';
import { combineResults, combinedReturnPct } from '../src/lib/combine.js';

// --- a tiny synthetic account, built by hand so every number is known --------

const day = (n) => `2024-01-${String(n).padStart(2, '0')}`;

/**
 * One instrument, one price series, whatever trades and cash rows are asked
 * for. Deliberately hand-built rather than loaded from `fixtures/`: these tests
 * are about the *combination*, and a fixture with a hundred instruments would
 * hide an off-by-one behind a plausible total.
 */
function account({ productId = 'P1', isin = null, trades = [], cash = [], prices = [], first = 1, last = 10 }) {
  const products = { [productId]: { id: productId, name: productId, symbol: productId, currency: 'EUR', isin, vwdId: productId } };
  return computePortfolio({
    transactions: trades.map((t) => ({
      id: `${productId}-${t.day}`,
      date: day(t.day),
      productId,
      quantity: t.qty,
      price: t.price,
      currency: 'EUR',
      totalBase: -(t.qty * t.price),
      feeBase: 0,
    })),
    // Through the real rule table, because the engine reads `row.category` and
    // never classifies anything itself — classification is a *parse-time*,
    // per-broker step, which is exactly the boundary the adapter design rests
    // on. A fixture that set the category by hand would test neither.
    cashRows: [
      // A trade has two halves and the engine takes the cash half from the cash
      // ledger, never from the transaction — which is how the real data
      // arrives, DEGIRO reporting a purchase in both places. A fixture without
      // the cash leg holds the money twice: once as stock and once as cash.
      ...trades.map((t) => cashRow(`t${t.day}`, t.day, 'Koop', -(t.qty * t.price))),
      ...cash.map((c, i) => cashRow(`c${i}-${c.day}`, c.day, c.description, c.change)),
    ],
    products,
    prices: prices.length
      ? { [productId]: { start: day(first), points: prices.map((close, i) => ({ offsetDays: i, close })) } }
      : {},
    today: day(last),
    liveTotal: null,
  });
}

/** A cash row with its category filled in by the real rule table. */
const cashRow = (id, d, description, change) => {
  const row = { id, date: day(d), description, change, currency: 'EUR' };
  return { ...row, category: classifyCashRow(row) };
};

const flat = (v, n = 10) => new Array(n).fill(v);

// ---------------------------------------------------------------------------
// T1 — the theorem
// ---------------------------------------------------------------------------

test('T1: per-broker-then-sum equals running the engine on everything at once', () => {
  const depositsA = [{ day: 1, description: 'Storting', change: 1000 }];
  const depositsB = [{ day: 1, description: 'Storting', change: 500 }];

  const a = account({ productId: 'AAA', trades: [{ day: 2, qty: 10, price: 50 }], cash: depositsA, prices: flat(50) });
  const b = account({ productId: 'BBB', trades: [{ day: 3, qty: 5, price: 40 }], cash: depositsB, prices: flat(40) });

  const combined = combineResults([
    { broker: 'a', result: a },
    { broker: 'b', result: b },
  ]);

  for (let i = 0; i < combined.days.length; i++) {
    assert.equal(combined.value[i], round(a.value[i] + b.value[i]), `value on ${combined.days[i]}`);
    assert.equal(combined.netExternal[i], round(a.netExternal[i] + b.netExternal[i]), `netExternal on ${combined.days[i]}`);
    assert.equal(combined.pnl[i], round(a.pnl[i] + b.pnl[i]), `pnl on ${combined.days[i]}`);
  }
});

test('T1b: the identity itself survives combination', () => {
  // pnl[t] === (value[t] - value[t-1]) - netExternal[t], on the combined series.
  // If this ever fails, the combination has invented or destroyed money.
  const a = account({ productId: 'AAA', trades: [{ day: 2, qty: 10, price: 50 }], cash: [{ day: 1, description: 'Storting', change: 1000 }], prices: [50, 50, 52, 55, 51, 49, 60, 61, 58, 57] });
  const b = account({ productId: 'BBB', trades: [{ day: 4, qty: 20, price: 10 }], cash: [{ day: 3, description: 'Storting', change: 400 }], prices: [10, 10, 10, 11, 12, 9, 8, 14, 15, 15] });

  const c = combineResults([{ broker: 'a', result: a }, { broker: 'b', result: b }]);
  for (let i = 1; i < c.days.length; i++) {
    const identity = round(c.value[i] - c.value[i - 1] - c.netExternal[i]);
    assert.ok(Math.abs(identity - c.pnl[i]) < 0.011, `${c.days[i]}: ${identity} vs ${c.pnl[i]}`);
  }
});

// ---------------------------------------------------------------------------
// T2 / T3 — a transfer between brokers
// ---------------------------------------------------------------------------

test('T2: a cross-broker transfer produces zero combined P/L on both days', () => {
  // €1 000 leaves A on day 4 and arrives at B on day 6. Nothing is held
  // anywhere, so any non-zero P/L is fabricated by the combination itself.
  const a = account({ cash: [{ day: 1, description: 'Storting', change: 1000 }, { day: 4, description: 'Terugstorting', change: -1000 }] });
  const b = account({ cash: [{ day: 6, description: 'Storting', change: 1000 }] });

  const c = combineResults([{ broker: 'a', result: a }, { broker: 'b', result: b }]);
  const at = (d) => c.days.indexOf(day(d));

  assert.equal(c.pnl[at(4)], 0, 'the withdrawal day');
  assert.equal(c.pnl[at(6)], 0, 'the deposit day');
  assert.equal(round(c.pnl.reduce((x, y) => x + y, 0)), 0, 'and nothing anywhere else');
});

test('T3: the combined value genuinely dips while the money is in transit', () => {
  // The counterpart to T2, and the reason no TRANSFER category exists: the dip
  // is real — for those two days the money was at neither broker — and it must
  // survive, because netting it away would be a guess about intent (rule 4).
  const a = account({ cash: [{ day: 1, description: 'Storting', change: 1000 }, { day: 4, description: 'Terugstorting', change: -1000 }] });
  const b = account({ cash: [{ day: 6, description: 'Storting', change: 1000 }] });

  const c = combineResults([{ broker: 'a', result: a }, { broker: 'b', result: b }]);
  const at = (d) => c.days.indexOf(day(d));

  assert.equal(c.value[at(3)], 1000, 'before');
  assert.equal(c.value[at(4)], 0, 'in transit');
  assert.equal(c.value[at(5)], 0, 'still in transit');
  assert.equal(c.value[at(6)], 1000, 'arrived');
});

// ---------------------------------------------------------------------------
// T4 — percentages do not add
// ---------------------------------------------------------------------------

test('T4: combined return is value-weighted, not the average of two percentages', () => {
  // A holds €10 000 and gains 10 %. B holds €1 000 and loses 10 %. The average
  // of the two percentages is 0 %, and the true combined return is close to
  // +8,2 %. A test where both hold the same amount would pass either way, which
  // is exactly why this one does not.
  const a = account({ productId: 'AAA', trades: [{ day: 1, qty: 100, price: 100 }], cash: [{ day: 1, description: 'Storting', change: 10000 }], prices: [100, 100, 100, 100, 100, 110, 110, 110, 110, 110] });
  const b = account({ productId: 'BBB', trades: [{ day: 1, qty: 100, price: 10 }], cash: [{ day: 1, description: 'Storting', change: 1000 }], prices: [10, 10, 10, 10, 10, 9, 9, 9, 9, 9] });

  const c = combineResults([{ broker: 'a', result: a }, { broker: 'b', result: b }]);
  const combinedPct = combinedReturnPct(c);

  assert.ok(combinedPct > 7 && combinedPct < 9, `expected roughly +8 %, got ${combinedPct}`);
  assert.ok(Math.abs(combinedPct) > 1, 'the average of the two percentages would be 0 %');
});

// ---------------------------------------------------------------------------
// T5 / T6 / T7 — instrument identity across brokers
// ---------------------------------------------------------------------------

test('T5: the same ISIN at two brokers is one holding', () => {
  const isin = 'NL0000000001';
  const a = account({ productId: 'D-1', isin, trades: [{ day: 1, qty: 10, price: 100 }], cash: [{ day: 1, description: 'Storting', change: 1000 }], prices: flat(100) });
  const b = account({ productId: 'T-9', isin, trades: [{ day: 1, qty: 5, price: 100 }], cash: [{ day: 1, description: 'Storting', change: 500 }], prices: flat(100) });

  const c = combineResults([
    { broker: 'a', result: a, products: { 'D-1': { id: 'D-1', isin } } },
    { broker: 'b', result: b, products: { 'T-9': { id: 'T-9', isin } } },
  ]);
  assert.equal(c.byProduct.length, 1);
  assert.equal(c.byProduct[0].qty.at(-1), 15);
  assert.deepEqual(c.byProduct[0].brokers, ['a', 'b']);
});

test('T6: the same product id at two brokers is two holdings', () => {
  // Two brokers will eventually issue the same number for different
  // instruments. One silently overwriting the other is a class of bug that
  // produces a plausible wrong chart.
  const a = account({ productId: '42815', trades: [{ day: 1, qty: 10, price: 100 }], cash: [{ day: 1, description: 'Storting', change: 1000 }], prices: flat(100) });
  const b = account({ productId: '42815', trades: [{ day: 1, qty: 3, price: 20 }], cash: [{ day: 1, description: 'Storting', change: 60 }], prices: flat(20) });

  const c = combineResults([{ broker: 'a', result: a }, { broker: 'b', result: b }]);
  assert.equal(c.byProduct.length, 2);
});

test('T7: an instrument with no ISIN stays separate at each broker', () => {
  const a = account({ productId: 'OPT-A', trades: [{ day: 1, qty: 1, price: 100 }], cash: [{ day: 1, description: 'Storting', change: 100 }], prices: flat(100) });
  const b = account({ productId: 'OPT-B', trades: [{ day: 1, qty: 1, price: 100 }], cash: [{ day: 1, description: 'Storting', change: 100 }], prices: flat(100) });

  const c = combineResults([{ broker: 'a', result: a }, { broker: 'b', result: b }]);
  assert.equal(c.byProduct.length, 2);
  assert.deepEqual(c.byProduct.map((p) => p.brokers), [['a'], ['b']]);
});

// ---------------------------------------------------------------------------
// T8 — the strongest available test of the whole design
// ---------------------------------------------------------------------------

test('T8: one broker combined is byte-for-byte that broker', () => {
  const a = account({ productId: 'AAA', trades: [{ day: 2, qty: 10, price: 50 }], cash: [{ day: 1, description: 'Storting', change: 1000 }], prices: flat(50) });
  const c = combineResults([{ broker: 'a', result: a }]);

  for (const key of ['days', 'value', 'pnl', 'netExternal', 'cumulativeDeposited', 'cash']) {
    assert.deepEqual(c[key], a[key], key);
  }
  assert.deepEqual(c.totals, a.totals);
});

// ---------------------------------------------------------------------------
// T9 / T10 — honesty about what has and has not been checked
// ---------------------------------------------------------------------------

test('T9: one broker without an anchor makes the combined status unverified, and names it', () => {
  const a = account({ cash: [{ day: 1, description: 'Storting', change: 1000 }] });
  a.reconciliation = { ok: true, reconstructed: 1000, live: 1000, diff: 0 };
  const b = account({ cash: [{ day: 1, description: 'Storting', change: 500 }] });
  b.reconciliation = null;

  const c = combineResults([{ broker: 'degiro', result: a }, { broker: 'other', result: b }]);
  assert.equal(c.reconciliation.ok, false, 'a green banner here would be the failure the project exists to prevent');
  assert.deepEqual(c.reconciliation.missingAnchor, ['other']);
  assert.equal(c.reconciliation.partial, true);
});

test('T9b: every broker reconciling makes the combined status ok', () => {
  const a = account({ cash: [{ day: 1, description: 'Storting', change: 1000 }] });
  a.reconciliation = { ok: true, reconstructed: 1000, live: 1000, diff: 0 };
  const b = account({ cash: [{ day: 1, description: 'Storting', change: 500 }] });
  b.reconciliation = { ok: true, reconstructed: 500, live: 500, diff: 0 };

  const c = combineResults([{ broker: 'a', result: a }, { broker: 'b', result: b }]);
  assert.equal(c.reconciliation.ok, true);
  assert.equal(c.reconciliation.live, 1500);
  assert.deepEqual(c.reconciliation.missingAnchor, []);
});

test('T10: unclassified cash rows are counted per broker, not merged into one number', () => {
  const a = account({ cash: [{ day: 1, description: 'Storting', change: 1000 }] });
  const b = account({
    cash: [
      { day: 1, description: 'Storting', change: 500 },
      { day: 2, description: 'iets volstrekt onbekends', change: 12 },
      { day: 3, description: 'nog iets onbekends', change: -3 },
    ],
  });

  const c = combineResults([{ broker: 'degiro', result: a }, { broker: 'other', result: b }]);
  assert.equal(c.stats.byBroker.degiro, 0);
  assert.equal(c.stats.byBroker.other, 2);
  assert.equal(c.stats.unclassified, 2);
});

// ---------------------------------------------------------------------------
// Calendars that do not line up — the case the arithmetic hides
// ---------------------------------------------------------------------------

test('a broker that starts later contributes nothing before its first day', () => {
  const a = account({ cash: [{ day: 1, description: 'Storting', change: 1000 }], first: 1, last: 10 });
  const b = computePortfolio({
    transactions: [],
    cashRows: [cashRow('x', 5, 'Storting', 500)],
    products: {},
    prices: {},
    today: day(10),
    liveTotal: null,
  });

  const c = combineResults([{ broker: 'a', result: a }, { broker: 'b', result: b }]);
  const at = (d) => c.days.indexOf(day(d));

  assert.equal(c.value[at(4)], 1000, 'before B exists');
  assert.equal(c.value[at(5)], 1500, 'once B exists');
  assert.equal(c.value[at(10)], 1500, 'and it stays');
});

test('a deposit is never carried forward as a repeated flow', () => {
  // The bug this guards is invisible on the value chart: carrying `netExternal`
  // forward the way a stock is carried would add €500 every single day, and the
  // resulting line looks entirely plausible on the way up.
  const a = account({ cash: [{ day: 1, description: 'Storting', change: 1000 }], last: 10 });
  const b = computePortfolio({
    transactions: [],
    cashRows: [cashRow('x', 5, 'Storting', 500)],
    products: {},
    prices: {},
    today: day(10),
    liveTotal: null,
  });

  const c = combineResults([{ broker: 'a', result: a }, { broker: 'b', result: b }]);
  assert.equal(round(c.netExternal.reduce((x, y) => x + y, 0)), 1500, 'exactly what went in, once');
  assert.equal(c.cumulativeDeposited.at(-1), 1500);
});

test('US-90: two realistic calendars, partially overlapping, still sum exactly', () => {
  // AC3. Hundreds of days through the real engine, in the three regimes the
  // carry-forward has to get right: A alone, both, and B alone with A's last
  // stocks carried. Written against the `indexOf` implementation first, so the
  // map lookup that replaced it is measured against the same numbers rather
  // than trusted to produce them.
  const build = (productId, firstDay, today, deposit, qty, price, closeAt) => {
    const nDays = daysBetween(firstDay, today) + 1;
    const cash = [
      { id: `${productId}-dep`, date: firstDay, description: 'Storting', change: deposit, currency: 'EUR' },
      { id: `${productId}-buy`, date: firstDay, description: 'Koop', change: -(qty * price), currency: 'EUR' },
    ].map((row) => ({ ...row, category: classifyCashRow(row) }));
    return computePortfolio({
      transactions: [{ id: `${productId}-t`, date: firstDay, productId, quantity: qty, price, currency: 'EUR', totalBase: -(qty * price), feeBase: 0 }],
      cashRows: cash,
      products: { [productId]: { id: productId, name: productId, symbol: productId, currency: 'EUR', vwdId: productId } },
      prices: { [productId]: { start: firstDay, points: Array.from({ length: nDays }, (_, i) => ({ offsetDays: i, close: closeAt(i) })) } },
      today,
      liveTotal: null,
    });
  };

  // A starts first and stops syncing in March 2025; B starts five months later
  // and runs to the end. Daily-varying prices, so a lookup that lands one day
  // off produces a different value rather than the same flat number.
  const a = build('AAA', '2024-01-01', '2025-03-31', 10000, 100, 50, (i) => 50 + (i % 7) - 3);
  const b = build('BBB', '2024-06-03', '2025-08-31', 5000, 40, 100, (i) => 100 + (i % 5) - 2);

  const c = combineResults([{ broker: 'a', result: a }, { broker: 'b', result: b }]);

  assert.equal(c.days.length, daysBetween('2024-01-01', '2025-08-31') + 1, 'the union calendar is continuous');

  for (let j = 0; j < c.days.length; j++) {
    const dayIso = c.days[j];
    const fromA = dayIso <= a.days.at(-1) ? a.value[daysBetween(a.days[0], dayIso)] : a.value.at(-1);
    const fromB = dayIso < b.days[0] ? 0 : b.value[daysBetween(b.days[0], dayIso)];
    assert.equal(c.value[j], round(fromA + fromB), `value on ${dayIso}`);
  }

  // Rule 6 on the combined view: the last value is exactly the parts' last
  // values, to the cent, and the deposits were counted once each.
  assert.equal(c.totals.value, round(a.value.at(-1) + b.value.at(-1)));
  assert.equal(round(c.netExternal.reduce((x, y) => x + y, 0)), 15000);
  assert.equal(c.cumulativeDeposited.at(-1), 15000);
  assert.equal(c.totals.totalPnl, round(c.totals.value - 15000));
});

const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---------------------------------------------------------------------------
// The single-broker path IS the multi-broker path
// ---------------------------------------------------------------------------

/**
 * `datasource.js` sends every engine result through `combineResults`, with one
 * broker in it. This is what makes that safe, and it is deliberately stricter
 * than T8: not "the numbers match" but "nothing was touched at all".
 *
 * The reason to run the real path rather than keep `combine.js` on a shelf is
 * rule 8 — an unreferenced module is dead code, and dead code is untested code
 * that runs for the first time on somebody's real account. Running it on every
 * page load means it cannot rot between now and a second adapter.
 */
test('one broker in, the same object out — every key, not just the numbers', () => {
  const r = account({
    productId: 'AAA',
    trades: [{ day: 2, qty: 10, price: 50 }, { day: 7, qty: -4, price: 61 }],
    cash: [{ day: 1, description: 'Storting', change: 2000 }, { day: 5, description: 'Dividend', change: 12 }],
    prices: [50, 50, 52, 55, 51, 49, 60, 61, 58, 57],
  });

  const out = combineResults([{ broker: 'degiro', label: 'DEGIRO', result: r }]);

  // Everything the engine produced survives untouched…
  for (const key of Object.keys(r)) {
    assert.deepEqual(out[key], r[key], `combining one broker changed ${key}`);
  }
  // …and exactly one field is added.
  const added = Object.keys(out).filter((k) => !(k in r));
  assert.deepEqual(added, ['brokers']);
  assert.equal(out.brokers[0].broker, 'degiro');
  assert.equal(out.brokers[0].label, 'DEGIRO');
});

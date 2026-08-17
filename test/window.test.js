/**
 * Phase 4's gate: the period control has to be real.
 *
 * `MIGRATION.md` §2 asks for exactly two properties, and they are the two a
 * screenshot cannot show — which is why this phase gets a test and the three
 * before it got a browser pass:
 *
 *  1. **A window's result is the sum of the results inside it.** Not a
 *     difference of endpoints, which would count a deposit landing mid-window as
 *     profit.
 *  2. **Time-weighted return chains rather than divides.** `(end − start) /
 *     start` is the number a deposit flatters, and it is the error this project
 *     exists to avoid.
 *
 * All of it runs against `computePortfolio`'s own output — the engine is the
 * thing under test, not a re-implementation of it in the view.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { computePortfolio, monthlyTable, rangeEndIndex, rangeStartIndex, windowReturnPct } from '../src/lib/engine.js';
import { parseCashMovements, parseChartResponse, parseProducts, parseTransactions, parseUpdate } from '../src/lib/parse.js';
import { fixture, loadPrices } from './helpers.js';

const RANGES = ['1M', '3M', '6M', 'YTD', '1Y', 'ALL'];
const sum = (a) => a.reduce((x, y) => x + y, 0);
const near = (a, b, eps = 0.02) => Math.abs(a - b) <= eps;

const meta = fixture('meta.json');
const r = computePortfolio({
  transactions: parseTransactions(fixture('transactions.json')),
  cashRows: parseCashMovements(fixture('accountoverview.json')),
  products: parseProducts(fixture('products-info.json')),
  prices: loadPrices(parseChartResponse, meta),
  today: meta.today,
  liveTotal: parseUpdate(fixture('update.json')).totalValue,
});

test('every range resolves to a window inside the history', () => {
  for (const range of RANGES) {
    const from = rangeStartIndex(r.days, range);
    const to = rangeEndIndex(r.days, range);
    assert.ok(from >= 0 && to < r.days.length, `${range}: ${from}..${to} outside the series`);
    assert.ok(from <= to, `${range}: window runs backwards`);
    // Every preset ends today. A window that stops short would make the last
    // figure on the page older than the page says it is.
    assert.equal(to, r.days.length - 1, `${range}: does not end on the last day`);
  }
});

test('a window result is the sum of its days, not a difference of endpoints', () => {
  /**
   * The distinction is the whole point. Over a window containing a deposit,
   * `value[to] − value[from]` is larger than the result by the size of the
   * deposit — `pnl` already has external flow removed, so summing it is the only
   * definition that cannot count your own money as profit.
   */
  for (const range of RANGES) {
    const from = rangeStartIndex(r.days, range);
    const to = rangeEndIndex(r.days, range);
    const result = sum(r.pnl.slice(from, to + 1));
    /**
     * **The anchor**, and the first version of this test got it wrong in exactly
     * the way brief §4 warns about: it compared against `value[from]`, the value
     * *inside* the window, and every range failed. `pnl[from]` is the move from
     * the previous day into the first day of the window, so the opening level is
     * the last point at or before the window opens — `value[from − 1]`.
     * Measuring from the anchor is what makes the first delta in a window real
     * instead of zero. Before the series exists the anchor is a synthetic zero,
     * which is why `from === 0` uses 0 and never draws it.
     */
    const anchor = from === 0 ? 0 : r.value[from - 1];
    const endpoints = r.value[to] - anchor;
    const flow = sum(r.netExternal.slice(from, to + 1));
    assert.ok(
      near(endpoints - flow, result, 0.5),
      `${range}: result ${result.toFixed(2)} does not reconcile with endpoints ${endpoints.toFixed(2)} minus flow ${flow.toFixed(2)}`,
    );
  }
});

test('over the whole history, the result equals the sum of the monthly results', () => {
  // The gate's wording, and it holds exactly for ALL because the month grid
  // partitions the same days. For a preset that cuts mid-month it cannot hold —
  // half of March is not March — which is why the per-range assertion above is
  // stated in days.
  const { years } = monthlyTable(r);
  const monthly = sum(years.flatMap((y) => y.months.filter(Boolean).map((m) => m.pnl ?? 0)));
  assert.ok(
    near(monthly, sum([...r.pnl]), 1),
    `sum of monthly results ${monthly.toFixed(2)} != all-time result ${sum([...r.pnl]).toFixed(2)}`,
  );
});

test('time-weighted return chains rather than dividing', () => {
  const from = rangeStartIndex(r.days, 'ALL');
  const to = rangeEndIndex(r.days, 'ALL');

  // Chained by hand, the same way the engine documents it: Π(1 + pnl/value[−1]).
  let factor = 1;
  for (let i = Math.max(1, from); i <= to; i++) {
    const prev = r.value[i - 1];
    if (prev > 0 && Math.abs(r.pnl[i]) <= prev) factor *= 1 + r.pnl[i] / prev;
  }
  assert.ok(
    near((factor - 1) * 100, windowReturnPct(r, from, to), 0.5),
    'windowReturnPct is not the chained product of daily factors',
  );

  // And it is *not* the naive ratio. On an account that was deposited into, the
  // difference is the whole reason this function exists; if these two ever agree
  // to the cent, the chaining has been quietly replaced by a division.
  const naive = ((r.value[to] - r.value[from]) / Math.max(1, r.value[from])) * 100;
  assert.ok(
    Math.abs(naive - windowReturnPct(r, from, to)) > 1,
    'the chained return equals the endpoint ratio — a deposit would flatter this',
  );
});

test('a shorter window gives a smaller result than the whole history', () => {
  // Not a tautology: it is what "recompute, do not re-slice" buys. A window that
  // re-sliced an all-time figure would report the same number for every range,
  // which is exactly what the old floating control did.
  const all = sum(r.pnl.slice(rangeStartIndex(r.days, 'ALL'), rangeEndIndex(r.days, 'ALL') + 1));
  const month = sum(r.pnl.slice(rangeStartIndex(r.days, '1M'), rangeEndIndex(r.days, '1M') + 1));
  assert.notEqual(all.toFixed(2), month.toFixed(2), 'every range reports the same result');
});

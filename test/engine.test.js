import test from 'node:test';
import assert from 'node:assert/strict';

import { aggregatePnl, buildComposition, computePortfolio, expandSeries, rangeStartIndex } from '../src/lib/engine.js';
import { parseCashMovements, parseChartResponse, parseProducts, parseTransactions, parseUpdate } from '../src/lib/parse.js';
import { dayRange } from '../src/lib/dates.js';
import { fixture, loadPrices } from './helpers.js';

const near = (a, b, eps = 0.005, msg) =>
  assert.ok(Math.abs(a - b) <= eps, msg ?? `expected ${a} to be within ${eps} of ${b}`);

// ---------------------------------------------------------------------------
// expandSeries: forward-fill, back-fill, staleness
// ---------------------------------------------------------------------------

test('expandSeries forward-fills non-trading days', () => {
  const days = dayRange('2024-01-04', '2024-01-10'); // Thu .. Wed, weekend in the middle
  const idx = new Map(days.map((d, i) => [d, i]));
  // Quotes on Thu(0), Fri(1), Mon(4), Tue(5)
  const { close } = expandSeries(
    { start: '2024-01-04', stepDays: 1, points: [
      { offsetDays: 0, close: 10 },
      { offsetDays: 1, close: 11 },
      { offsetDays: 4, close: 12 },
      { offsetDays: 5, close: 13 },
    ] },
    days,
    idx,
  );
  assert.deepEqual(Array.from(close), [10, 11, 11, 11, 12, 13, 13]);
});

test('expandSeries back-fills before the first quote and flags it estimated', () => {
  const days = dayRange('2024-01-01', '2024-01-05');
  const idx = new Map(days.map((d, i) => [d, i]));
  const { close, estimated } = expandSeries(
    { start: '2024-01-03', stepDays: 1, points: [{ offsetDays: 0, close: 50 }] },
    days,
    idx,
  );
  assert.deepEqual(Array.from(close), [50, 50, 50, 50, 50]);
  assert.deepEqual(Array.from(estimated), [1, 1, 0, 0, 0], 'days before the first quote are estimates');
});

test('expandSeries freezes a delisted price rather than dropping to zero', () => {
  // SPEC §6: "Handle a missing vwdId by freezing the last known price and
  // flagging the day as estimated rather than dropping to zero."
  const days = dayRange('2024-01-01', '2024-02-01');
  const idx = new Map(days.map((d, i) => [d, i]));
  const { close, estimated } = expandSeries(
    { start: '2024-01-01', stepDays: 1, points: [{ offsetDays: 0, close: 7 }, { offsetDays: 1, close: 8 }] },
    days,
    idx,
  );
  assert.equal(close[close.length - 1], 8, 'last known price is carried forward');
  assert.equal(estimated[estimated.length - 1], 1, 'and the day is flagged');
});

test('expandSeries with no points at all yields zeros, all estimated', () => {
  const days = dayRange('2024-01-01', '2024-01-03');
  const idx = new Map(days.map((d, i) => [d, i]));
  const { close, estimated } = expandSeries({ points: [] }, days, idx);
  assert.deepEqual(Array.from(close), [0, 0, 0]);
  assert.deepEqual(Array.from(estimated), [1, 1, 1]);
});

// ---------------------------------------------------------------------------
// The SPEC §1.4 invariant: a deposit is not a gain.
// ---------------------------------------------------------------------------

function scenario(overrides = {}) {
  return computePortfolio({
    products: { 1: { id: '1', name: 'TEST', symbol: 'TST', currency: 'EUR', vwdId: '900' } },
    prices: {
      900: { start: '2024-01-01', stepDays: 1, points: [
        { offsetDays: 0, close: 100 },
        { offsetDays: 1, close: 100 },
        { offsetDays: 2, close: 110 },
        { offsetDays: 3, close: 110 },
        { offsetDays: 4, close: 120 },
      ] },
    },
    today: '2024-01-05',
    ...overrides,
  });
}

test('value = cash + positions, and P/L follows the price', () => {
  const r = scenario({
    cashRows: [
      { date: '2024-01-01', description: 'iDEAL Deposit', change: 1000, currency: 'EUR', category: 'DEPOSIT' },
      { date: '2024-01-02', description: 'Koop 5 @ 100', change: -500, currency: 'EUR', category: 'TRADE' },
    ],
    transactions: [{ date: '2024-01-02', productId: '1', quantity: 5, price: 100, currency: 'EUR', fee: 0 }],
  });

  assert.deepEqual(r.days, ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05']);
  assert.deepEqual(r.cash, [1000, 500, 500, 500, 500]);
  assert.deepEqual(r.positionsValue, [0, 500, 550, 550, 600]);
  assert.deepEqual(r.value, [1000, 1000, 1050, 1050, 1100]);
  // Day 1 is the deposit: value went 0 -> 1000 but none of it is profit.
  assert.deepEqual(r.pnl, [0, 0, 50, 0, 50]);
});

test('a mid-history deposit does not register as profit', () => {
  const r = scenario({
    cashRows: [
      { date: '2024-01-01', description: 'iDEAL Deposit', change: 1000, currency: 'EUR', category: 'DEPOSIT' },
      { date: '2024-01-03', description: 'iDEAL Deposit', change: 5000, currency: 'EUR', category: 'DEPOSIT' },
    ],
    transactions: [],
  });
  assert.deepEqual(r.value, [1000, 1000, 6000, 6000, 6000]);
  assert.deepEqual(r.pnl, [0, 0, 0, 0, 0], 'the 5000 jump is cashflow, not gain');
  assert.deepEqual(r.netExternal, [1000, 0, 5000, 0, 0]);
  assert.deepEqual(r.cumulativeDeposited, [1000, 1000, 6000, 6000, 6000]);
});

test('a withdrawal does not register as a loss', () => {
  const r = scenario({
    cashRows: [
      { date: '2024-01-01', description: 'iDEAL Deposit', change: 10000, currency: 'EUR', category: 'DEPOSIT' },
      { date: '2024-01-04', description: 'Terugstorting', change: -4000, currency: 'EUR', category: 'WITHDRAWAL' },
    ],
    transactions: [],
  });
  assert.deepEqual(r.pnl, [0, 0, 0, 0, 0]);
  assert.equal(r.totals.invested, 6000);
});

test('dividends and fees land in P/L, not in cashflow', () => {
  const r = scenario({
    cashRows: [
      { date: '2024-01-01', description: 'iDEAL Deposit', change: 1000, currency: 'EUR', category: 'DEPOSIT' },
      { date: '2024-01-03', description: 'Dividend TEST', change: 30, currency: 'EUR', category: 'DIVIDEND' },
      { date: '2024-01-03', description: 'Dividendbelasting TEST', change: -4.5, currency: 'EUR', category: 'DIVIDEND_TAX' },
      { date: '2024-01-04', description: 'DEGIRO Aansluitingskosten', change: -2.5, currency: 'EUR', category: 'FEE' },
    ],
    transactions: [],
  });
  assert.deepEqual(r.netExternal, [1000, 0, 0, 0, 0]);
  near(r.pnl[2], 25.5);
  near(r.pnl[3], -2.5);
  assert.deepEqual(r.dividendsByMonth, [{ month: '2024-01', gross: 30, tax: -4.5, net: 25.5 }]);
  near(r.income.fees, -2.5);
});

test('a cash sweep is invisible: it moves nothing', () => {
  const r = scenario({
    cashRows: [
      { date: '2024-01-01', description: 'iDEAL Deposit', change: 1000, currency: 'EUR', category: 'DEPOSIT' },
      { date: '2024-01-03', description: 'DEGIRO Cash Sweep Transfer', change: -900, currency: 'EUR', category: 'CASH_SWEEP' },
      { date: '2024-01-03', description: 'flatex Deposit', change: 900, currency: 'EUR', category: 'CASH_SWEEP' },
    ],
    transactions: [],
  });
  assert.deepEqual(r.cash, [1000, 1000, 1000, 1000, 1000]);
  assert.deepEqual(r.pnl, [0, 0, 0, 0, 0]);
});

test('a fully sold position stops contributing value', () => {
  const r = scenario({
    cashRows: [{ date: '2024-01-01', description: 'iDEAL Deposit', change: 1000, currency: 'EUR', category: 'DEPOSIT' }],
    transactions: [
      { date: '2024-01-02', productId: '1', quantity: 5, price: 100, currency: 'EUR', fee: 0 },
      { date: '2024-01-04', productId: '1', quantity: -5, price: 110, currency: 'EUR', fee: 0 },
    ],
  });
  assert.deepEqual(r.positionsValue, [0, 500, 550, 0, 0]);
  assert.equal(r.byProduct[0].qty[4], 0);
});

test('floating-point dust does not leave a ghost position', () => {
  const r = scenario({
    cashRows: [{ date: '2024-01-01', description: 'Deposit', change: 1000, currency: 'EUR', category: 'DEPOSIT' }],
    transactions: [
      { date: '2024-01-02', productId: '1', quantity: 0.1, price: 100, currency: 'EUR', fee: 0 },
      { date: '2024-01-02', productId: '1', quantity: 0.2, price: 100, currency: 'EUR', fee: 0 },
      { date: '2024-01-03', productId: '1', quantity: -0.3, price: 100, currency: 'EUR', fee: 0 },
    ],
  });
  assert.equal(r.byProduct[0].qty[2], 0, '0.1 + 0.2 - 0.3 must be exactly 0');
  assert.equal(r.positionsValue[4], 0);
});

test('an unclassified cash row is reported, not silently swallowed', () => {
  const r = scenario({
    cashRows: [
      { date: '2024-01-01', description: 'Deposit', change: 1000, currency: 'EUR', category: 'DEPOSIT' },
      { date: '2024-01-02', description: 'Iets nieuws', change: -5, currency: 'EUR', category: 'UNKNOWN' },
    ],
    transactions: [],
  });
  assert.equal(r.stats.unclassified, 1);
  assert.ok(r.warnings.some((w) => w.code === 'unclassified-cash-rows'));
  assert.equal(r.cash[1], 995, 'it still moves the balance');
});

test('a non-EUR position raises a loud FX warning', () => {
  // SPEC §2.2: "Do not silently mix currencies; a wrong chart is worse than an
  // incomplete one."
  const r = computePortfolio({
    products: { 1: { id: '1', name: 'US STOCK', currency: 'USD', vwdId: '900' } },
    prices: { 900: { start: '2024-01-01', stepDays: 1, points: [{ offsetDays: 0, close: 100 }] } },
    transactions: [{ date: '2024-01-01', productId: '1', quantity: 1, price: 100, currency: 'USD', fee: 0 }],
    cashRows: [{ date: '2024-01-01', description: 'Deposit', change: 200, currency: 'EUR', category: 'DEPOSIT' }],
    today: '2024-01-02',
  });
  const w = r.warnings.find((x) => x.code === 'fx-not-implemented');
  assert.ok(w, 'expected an FX warning');
  assert.equal(w.level, 'error');
  assert.deepEqual(w.detail.currencies, ['USD']);
});

test('a price jump with no trade is flagged as a possible split', () => {
  const r = computePortfolio({
    products: { 1: { id: '1', name: 'SPLITTER', currency: 'EUR', vwdId: '900' } },
    prices: { 900: { start: '2024-01-01', stepDays: 1, points: [
      { offsetDays: 0, close: 400 },
      { offsetDays: 1, close: 400 },
      { offsetDays: 2, close: 100 }, // 4-for-1, unadjusted
    ] } },
    transactions: [{ date: '2024-01-01', productId: '1', quantity: 1, price: 400, currency: 'EUR', fee: 0 }],
    cashRows: [{ date: '2024-01-01', description: 'Deposit', change: 400, currency: 'EUR', category: 'DEPOSIT' }],
    today: '2024-01-03',
  });
  const w = r.warnings.find((x) => x.code === 'suspected-split');
  assert.ok(w, 'expected a split warning');
  assert.equal(w.detail.hits[0].date, '2024-01-03');
});

test('a product with no price series falls back to the traded price and warns', () => {
  const r = computePortfolio({
    products: { 1: { id: '1', name: 'ILLIQUID', currency: 'EUR', vwdId: null } },
    prices: {},
    transactions: [{ date: '2024-01-01', productId: '1', quantity: 10, price: 25, currency: 'EUR', fee: 0 }],
    cashRows: [{ date: '2024-01-01', description: 'Deposit', change: 250, currency: 'EUR', category: 'DEPOSIT' }],
    today: '2024-01-03',
  });
  assert.deepEqual(r.positionsValue, [250, 250, 250]);
  assert.ok(r.warnings.some((w) => w.code === 'no-price-series'));
  assert.equal(r.totals.estimatedDays, 3);
});

test('an empty account produces an empty, non-crashing result', () => {
  const r = computePortfolio({ transactions: [], cashRows: [], today: '2024-01-05' });
  assert.equal(r.totals.value, 0);
  assert.ok(r.warnings.some((w) => w.code === 'no-data'));
});

test('reconciliation reports the gap when the totals disagree', () => {
  const r = scenario({
    cashRows: [{ date: '2024-01-01', description: 'Deposit', change: 1000, currency: 'EUR', category: 'DEPOSIT' }],
    transactions: [],
    liveTotal: 1000.5,
  });
  assert.equal(r.reconciliation.ok, false);
  near(r.reconciliation.diff, -0.5);
  assert.ok(r.warnings.some((w) => w.code === 'reconciliation-failed'));
});

// ---------------------------------------------------------------------------
// aggregation
// ---------------------------------------------------------------------------

test('aggregatePnl preserves the total across every granularity', () => {
  const days = dayRange('2024-01-01', '2024-03-31');
  const pnl = days.map((_, i) => (i % 3 === 0 ? 10 : -3));
  const total = pnl.reduce((a, b) => a + b, 0);

  for (const g of ['day', 'week', 'month']) {
    const agg = aggregatePnl(days, pnl, g);
    near(agg.pnl.reduce((a, b) => a + b, 0), total, 0.01, `${g} buckets must sum to the daily total`);
    near(agg.cumulative[agg.cumulative.length - 1], total, 0.01);
  }
  assert.equal(aggregatePnl(days, pnl, 'month').labels.length, 3);
  assert.deepEqual(aggregatePnl(days, pnl, 'month').labels, ['2024-01', '2024-02', '2024-03']);
});

test('aggregatePnl honours the index window', () => {
  const days = dayRange('2024-01-01', '2024-01-10');
  const pnl = days.map(() => 1);
  const agg = aggregatePnl(days, pnl, 'day', 3, 6);
  assert.deepEqual(agg.labels, ['2024-01-04', '2024-01-05', '2024-01-06', '2024-01-07']);
  assert.equal(agg.cumulative[3], 4);
});

test('composition layers sum to the total value on every day', () => {
  const r = scenario({
    cashRows: [{ date: '2024-01-01', description: 'Deposit', change: 1000, currency: 'EUR', category: 'DEPOSIT' }],
    transactions: [{ date: '2024-01-02', productId: '1', quantity: 5, price: 100, currency: 'EUR', fee: 0 }],
  });
  const comp = buildComposition(r);
  for (let i = 0; i < comp.days.length; i++) {
    const stacked = comp.layers.reduce((a, l) => a + l.values[i], 0);
    near(stacked, r.value[i], 0.02, `stack must equal total on ${comp.days[i]}`);
  }
  assert.equal(comp.layers.at(-1).key, '__cash__', 'cash is the last layer');
});

test('rangeStartIndex resolves the selector buttons', () => {
  const days = dayRange('2024-01-01', '2024-12-31');
  assert.equal(days[rangeStartIndex(days, 'ALL')], '2024-01-01');
  assert.equal(days[rangeStartIndex(days, 'YTD')], '2024-01-01');
  assert.equal(days[rangeStartIndex(days, '1W')], '2024-12-25', '1W spans seven days including today');
  assert.equal(days[rangeStartIndex(days, '1M')], '2024-11-30');
  assert.equal(days[rangeStartIndex(days, '3M')], '2024-09-30');
  // A year back from 2024-12-31 predates the series, so it clamps to the start.
  assert.equal(days[rangeStartIndex(days, '1Y')], '2024-01-01');
});

// ---------------------------------------------------------------------------
// The whole pipeline against the fixture set.
// ---------------------------------------------------------------------------

test('SPEC §6: the reconstructed total matches the reported total to the cent', () => {
  const meta = fixture('meta.json');
  const result = computePortfolio({
    transactions: parseTransactions(fixture('transactions.json')),
    cashRows: parseCashMovements(fixture('accountoverview.json')),
    products: parseProducts(fixture('products-info.json')),
    prices: loadPrices(parseChartResponse, meta),
    today: meta.today,
    liveTotal: parseUpdate(fixture('update.json')).totalValue,
  });

  assert.ok(result.reconciliation, 'expected a reconciliation block');
  assert.equal(
    result.reconciliation.ok,
    true,
    `off by ${result.reconciliation.diff} (reconstructed ${result.reconciliation.reconstructed} vs ${result.reconciliation.live})`,
  );
  near(result.totals.cash, meta.liveCash);
  near(result.totals.positions, meta.livePositionsValue);
});

test('fixture run: the derived series are internally consistent', () => {
  const meta = fixture('meta.json');
  const result = computePortfolio({
    transactions: parseTransactions(fixture('transactions.json')),
    cashRows: parseCashMovements(fixture('accountoverview.json')),
    products: parseProducts(fixture('products-info.json')),
    prices: loadPrices(parseChartResponse, meta),
    today: meta.today,
  });

  const n = result.days.length;
  assert.equal(result.days[0], '2021-01-04');
  assert.equal(result.days[n - 1], meta.today);
  for (const key of ['value', 'cash', 'positionsValue', 'pnl', 'netExternal', 'estimated']) {
    assert.equal(result[key].length, n, `${key} must be indexed by days`);
  }

  for (let i = 0; i < n; i++) {
    near(result.value[i], result.cash[i] + result.positionsValue[i], 0.02, `value breaks down on ${result.days[i]}`);
    assert.ok(result.cash[i] >= -0.01, `cash went negative on ${result.days[i]}: ${result.cash[i]}`);
  }

  // P/L must telescope back to the total gain net of deposits.
  const pnlSum = result.pnl.reduce((a, b) => a + b, 0);
  near(pnlSum, result.totals.value - result.totals.invested, 0.5);
  near(result.totals.totalPnl, result.totals.value - result.totals.invested, 0.01);
});

test('fixture run: composition and dividends are populated', () => {
  const meta = fixture('meta.json');
  const result = computePortfolio({
    transactions: parseTransactions(fixture('transactions.json')),
    cashRows: parseCashMovements(fixture('accountoverview.json')),
    products: parseProducts(fixture('products-info.json')),
    prices: loadPrices(parseChartResponse, meta),
    today: meta.today,
  });

  assert.ok(result.byProduct.length >= 5, 'expected several holdings');
  assert.ok(result.dividendsByMonth.length > 8, 'expected dividends across many months');
  for (const m of result.dividendsByMonth) {
    assert.ok(m.gross > 0);
    assert.ok(m.tax <= 0, 'tax is booked as a negative change');
    near(m.net, m.gross + m.tax);
  }

  assert.ok(result.flowEvents.length > 40, 'expected deposit markers');
  assert.ok(result.flowEvents.some((e) => e.amount < 0), 'expected the withdrawal to show up');

  const comp = buildComposition(result, 6);
  assert.ok(comp.layers.length >= 3);
  const last = comp.days.length - 1;
  near(comp.layers.reduce((a, l) => a + l.values[last], 0), result.totals.value, 0.05);
});

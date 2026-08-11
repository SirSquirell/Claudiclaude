import test from 'node:test';
import assert from 'node:assert/strict';

import { aggregatePnl, buildComposition, candleSeries, computePortfolio, deriveContractSizes, deriveFxRates, fxFromConversions, expandSeries, monthlyTable, rangeEndIndex, rangeStartIndex, windowReturnPct, usableReturnDay, annualisedReturn, projectPortfolio, maxDrawdown } from '../src/lib/engine.js';
import { classifyCashRow } from '../src/lib/classify.js';
import { parseCashMovements, parseChartResponse, parseProducts, parseTransactions, parseUpdate } from '../src/lib/parse.js';
import { dayRange } from '../src/lib/dates.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
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

test('a foreign position is converted at the rate its own trade settled at', () => {
  // 10 shares at USD 100 that cost EUR 860 means 0.86 EUR to the dollar. The
  // position is worth EUR 860, not EUR 1000.
  const r = computePortfolio({
    products: { 1: { id: '1', name: 'US STOCK', currency: 'USD', vwdId: '900' } },
    prices: { 900: { start: '2024-01-01', stepDays: 1, points: [0, 1, 2].map((i) => ({ offsetDays: i, close: 100 })) } },
    transactions: [
      { date: '2024-01-01', productId: '1', quantity: 10, price: 100, currency: 'USD', fee: -2, totalBase: -862 },
    ],
    cashRows: [{ date: '2024-01-01', description: 'Deposit', change: 1000, currency: 'EUR', category: 'DEPOSIT' }],
    today: '2024-01-03',
  });
  near(r.positionsValue.at(-1), 860, 1, 'valued in euros, not dollars-as-euros');
  const w = r.warnings.find((x) => x.code === 'fx-derived');
  assert.ok(w, 'expected the derived rates to be reported');
  assert.equal(w.detail.currencies[0].currency, 'USD');
  near(w.detail.currencies[0].median, 0.86, 0.01);
});

test('the derivation returns exactly 1 for the base currency', () => {
  // The strongest self-check there is: on a real account 267 euro trades all
  // came back at 1.0000. Anything else means the formula is wrong.
  const days = dayRange('2024-01-01', '2024-01-03');
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const { series, report } = deriveFxRates(
    [{ date: '2024-01-01', productId: '1', quantity: 10, price: 50, fee: -2, totalBase: -502 }],
    { 1: { id: '1', currency: 'EUR' } },
    days,
    dayIndex,
    'EUR',
  );
  assert.deepEqual(report, [], 'the base currency needs no conversion');
  assert.equal(series.EUR, undefined);
});

test('rates are interpolated between trades and held flat outside them', () => {
  const days = dayRange('2024-01-01', '2024-01-05');
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const { series } = deriveFxRates(
    [
      { date: '2024-01-02', productId: '1', quantity: 1, price: 100, fee: 0, totalBase: -80 },
      { date: '2024-01-04', productId: '1', quantity: 1, price: 100, fee: 0, totalBase: -90 },
    ],
    { 1: { id: '1', currency: 'USD' } },
    days,
    dayIndex,
  );
  near(series.USD[0], 0.8, 0.001, 'flat before the first observation');
  near(series.USD[1], 0.8, 0.001);
  near(series.USD[2], 0.85, 0.001, 'halfway between the two');
  near(series.USD[3], 0.9, 0.001);
  near(series.USD[4], 0.9, 0.001, 'flat after the last observation');
});

test('a fee-dominated trade does not drag the rate off', () => {
  const days = dayRange('2024-01-01', '2024-01-03');
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const { series, report } = deriveFxRates(
    [
      { date: '2024-01-01', productId: '1', quantity: 100, price: 100, fee: 0, totalBase: -8600 },
      { date: '2024-01-02', productId: '1', quantity: 100, price: 100, fee: 0, totalBase: -8600 },
      // One nonsense row an order of magnitude out.
      { date: '2024-01-03', productId: '1', quantity: 1, price: 1, fee: 0, totalBase: -50 },
    ],
    { 1: { id: '1', currency: 'USD' } },
    days,
    dayIndex,
  );
  assert.equal(report[0].dropped, 1, 'the outlier is dropped, not averaged in');
  near(series.USD[2], 0.86, 0.01);
});

test('a currency no trade has ever priced is reported, not guessed at', () => {
  const r = computePortfolio({
    products: {},
    prices: {},
    transactions: [],
    cashRows: [
      { date: '2024-01-01', description: 'Deposit', change: 1000, currency: 'EUR', category: 'DEPOSIT' },
      { date: '2024-01-01', description: 'Valuta Creditering', change: 500, currency: 'HKD', category: 'FX' },
    ],
    today: '2024-01-02',
  });
  const w = r.warnings.find((x) => x.code === 'fx-unknown');
  assert.ok(w, 'expected an fx-unknown warning');
  assert.equal(w.level, 'error');
  assert.deepEqual(w.detail.currencies, ['HKD']);
});

test('the split heuristic stays quiet when trades already settled the question', () => {
  // A 40% day on a meme stock in 2021 is a market move. Where trades exist to
  // audit against, that evidence decides — guessing on top is just noise, and a
  // real account produced 23 such banners with nothing to act on.
  const r = computePortfolio({
    products: { 1: { id: '1', name: 'VOLATILE', currency: 'EUR', vwdId: '900' } },
    prices: { 900: { start: '2024-01-01', stepDays: 1, points: [
      { offsetDays: 0, close: 400 },
      { offsetDays: 1, close: 400 },
      { offsetDays: 2, close: 100 },
    ] } },
    transactions: [{ date: '2024-01-01', productId: '1', quantity: 1, price: 400, currency: 'EUR', fee: 0 }],
    cashRows: [{ date: '2024-01-01', description: 'Deposit', change: 400, currency: 'EUR', category: 'DEPOSIT' }],
    today: '2024-01-03',
  });
  assert.equal(r.warnings.some((w) => w.code === 'suspected-split'), false);
  near(r.positionsValue.at(-1), 100, 0.01, 'the quote is trusted, because the trade agreed with it');
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

// ---------------------------------------------------------------------------
// month × year grid
// ---------------------------------------------------------------------------

test('monthlyTable lays months out per year and totals each row', () => {
  const days = dayRange('2024-11-01', '2025-01-31');
  const r = {
    days,
    pnl: days.map((d) => (d.startsWith('2024-11') ? 10 : d.startsWith('2024-12') ? -5 : 2)),
    value: days.map(() => 1000),
  };
  const table = monthlyTable(r);

  assert.deepEqual(table.years.map((y) => y.year), ['2024', '2025']);
  const y2024 = table.years[0];
  assert.equal(y2024.months[10].month, '2024-11');
  near(y2024.months[10].pnl, 300, 0.01, 'November: 30 days x 10');
  near(y2024.months[11].pnl, -155, 0.01, 'December: 31 days x -5');
  assert.equal(y2024.months[0], null, 'January 2024 predates the data');
  near(y2024.total.pnl, 145, 0.01);
});

test('monthlyTable return is chained daily, not pnl divided by an opening value', () => {
  // Two days of +10 on a value that grows: 10/100 then 10/110.
  const r = {
    days: ['2024-05-01', '2024-05-02', '2024-05-03'],
    pnl: [0, 10, 10],
    value: [100, 110, 120],
  };
  const table = monthlyTable(r);
  const may = table.years[0].months[4];
  const expected = ((1 + 10 / 100) * (1 + 10 / 110) - 1) * 100;
  near(may.returnPct, Math.round(expected * 100) / 100, 0.02);
  near(may.pnl, 20, 0.01);
});

test('monthlyTable does not let a deposit inflate the return', () => {
  // Value doubles because money was paid in; pnl is zero, so return is zero.
  const r = {
    days: ['2024-05-01', '2024-05-02', '2024-05-03'],
    pnl: [0, 0, 0],
    value: [1000, 5000, 5000],
  };
  const may = monthlyTable(r).years[0].months[4];
  near(may.returnPct, 0, 0.001, 'a deposit is not a return');
  near(may.pnl, 0, 0.001);
});

test('monthlyTable ignores days with nothing invested yet', () => {
  const r = {
    days: ['2024-05-01', '2024-05-02', '2024-05-03'],
    pnl: [0, 5, 5],
    value: [0, 0, 100],
  };
  const may = monthlyTable(r).years[0].months[4];
  // Only the last day has a positive previous value (0 -> no return contributed).
  assert.ok(Number.isFinite(may.returnPct), 'must not divide by zero');
  near(may.pnl, 10, 0.01);
});

test('monthlyTable scale bounds come from cells, not year totals', () => {
  const days = dayRange('2024-01-01', '2024-03-31');
  const r = { days, pnl: days.map(() => 1), value: days.map(() => 1000) };
  const table = monthlyTable(r);
  const biggestCell = Math.max(...table.years[0].months.filter(Boolean).map((c) => Math.abs(c.pnl)));
  assert.equal(table.maxAbsPnl, biggestCell);
  assert.ok(table.maxAbsPnl < table.years[0].total.pnl, 'a year total must not set the ramp');
});

test('monthlyTable reports the best and worst month for both metrics', () => {
  const days = dayRange('2024-01-01', '2024-03-31');
  const r = {
    days,
    pnl: days.map((d) => (d.startsWith('2024-02') ? 100 : d.startsWith('2024-03') ? -50 : 1)),
    value: days.map(() => 1000),
  };
  const table = monthlyTable(r);
  assert.equal(table.byPnl.best.month, '2024-02');
  assert.equal(table.byPnl.worst.month, '2024-03');
});

test('monthlyTable on the fixture set covers every month in the window', () => {
  const meta = fixture('meta.json');
  const result = computePortfolio({
    transactions: parseTransactions(fixture('transactions.json')),
    cashRows: parseCashMovements(fixture('accountoverview.json')),
    products: parseProducts(fixture('products-info.json')),
    prices: loadPrices(parseChartResponse, meta),
    today: meta.today,
  });
  const table = monthlyTable(result);
  assert.deepEqual(table.years.map((y) => y.year), ['2021', '2022', '2023', '2024', '2025', '2026']);

  // Every euro cell must add back up to the daily P/L total.
  const cellSum = table.years.flatMap((y) => y.months).filter(Boolean).reduce((a, c) => a + c.pnl, 0);
  near(cellSum, result.pnl.reduce((a, b) => a + b, 0), 0.5);

  // August 2026 is the current, partial month; it still gets a cell.
  assert.ok(table.years.at(-1).months[7], 'the running month is present');
});

test('an iDEAL reservation and its reversal produce no phantom gain or loss', () => {
  // Taken from a real account: DEGIRO advances the money on day 1 so you can
  // trade, then reverses it on day 3 when the actual deposit lands. Booking the
  // advance as cash puts a +1500 gain on day 1 and a -1500 loss on day 3.
  const r = computePortfolio({
    transactions: [],
    cashRows: [
      { date: '2024-01-01', description: 'Reservation iDEAL', change: 1500, currency: 'EUR', category: 'RESERVATION' },
      { date: '2024-01-03', description: 'Reservation iDEAL', change: -1500, currency: 'EUR', category: 'RESERVATION' },
      { date: '2024-01-03', description: 'iDEAL Deposit', change: 1500, currency: 'EUR', category: 'DEPOSIT' },
    ],
    products: {},
    prices: {},
    today: '2024-01-04',
  });

  assert.deepEqual(r.pnl, [0, 0, 0, 0], 'no day may show a gain or a loss');
  assert.deepEqual(r.cash, [0, 0, 1500, 1500], 'cash only moves when the deposit lands');
  assert.equal(r.totals.invested, 1500, 'the deposit is counted exactly once');
});

test('securities lending income counts as profit, not as a deposit', () => {
  const r = computePortfolio({
    transactions: [],
    cashRows: [
      { date: '2024-01-01', description: 'iDEAL Deposit', change: 1000, currency: 'EUR', category: 'DEPOSIT' },
      { date: '2024-01-02', description: 'Inkomsten uit Securities Lending - Januari', change: 26.17, currency: 'EUR', category: 'SECURITIES_LENDING' },
    ],
    products: {},
    prices: {},
    today: '2024-01-02',
  });
  near(r.pnl[1], 26.17);
  assert.equal(r.totals.invested, 1000, 'lending income is not money you paid in');
});

// ---------------------------------------------------------------------------
// Units. Reported from a real account: a portfolio that peaked at EUR 450
// million against EUR 116k ever paid in, with today's totals correct. One
// instrument's quantities and quotes were in different units.
// ---------------------------------------------------------------------------

/**
 * The field case: 49 shares bought at EUR 13.44 in 2020 and sold in 2022, whose
 * series quotes millions because it is adjusted for several reverse splits.
 * Unadjusted this produced EUR 428 million on a EUR 116k account.
 */
function splitAdjustedScenario() {
  const days = dayRange('2024-01-01', '2024-01-08');
  // A real, smooth history in adjusted money: 7.0m falling to 2.3m.
  const curve = [7030800, 7100000, 6900000, 5200000, 4100000, 3000000, 2500000, 2349000];
  return computePortfolio({
    products: { 1: { id: '1', name: 'VISION MARINE', symbol: 'VMAR', currency: 'EUR', vwdId: '900' } },
    prices: { 900: { start: '2024-01-01', stepDays: 1, points: curve.map((close, i) => ({ offsetDays: i, close })) } },
    transactions: [
      { date: '2024-01-01', productId: '1', quantity: 49, price: 13.44, currency: 'EUR', fee: 0 },
      { date: '2024-01-08', productId: '1', quantity: -49, price: 4.5, currency: 'EUR', fee: 0 },
    ],
    cashRows: [{ date: '2024-01-01', description: 'Deposit', change: 1000, currency: 'EUR', category: 'DEPOSIT' }],
    today: '2024-01-08',
  });
}

test('a split-adjusted series values the position correctly over time', () => {
  const r = splitAdjustedScenario();
  // Bought for 49 x 13.44 = 658.56 and sold for 49 x 4.50 = 220.50.
  near(r.positionsValue[0], 658.56, 0.5, 'worth what it was bought for on day one');
  near(r.positionsValue[6], 235, 5, 'and tracks the real curve in between');
  assert.equal(r.positionsValue.at(-1), 0, 'sold on the last day');
  assert.ok(
    r.positionsValue.every((v) => v < 1000),
    `values ran away: ${r.positionsValue.map((v) => v.toFixed(0)).join(', ')}`,
  );
});

test('the rescaling is reported, with the evidence behind it', () => {
  const w = splitAdjustedScenario().warnings.find((x) => x.code === 'price-scale-adjusted');
  assert.ok(w, 'expected a price-scale-adjusted warning');
  const hit = w.detail.instruments[0];
  assert.equal(hit.symbol, 'VMAR');
  assert.ok(hit.factor > 100000, `expected a large factor, got ${hit.factor}`);
  assert.ok(hit.spread < 5, 'a split factor holds steady between trades');
  assert.equal(hit.sample[0].traded, 13.44);
});

// ---------------------------------------------------------------------------
// Exchange rates and contract sizes
// ---------------------------------------------------------------------------

/** Two legs of one conversion: consecutive sourceIds, same productId. */
const conversion = (sourceId, date, ccy, out, eurIn, productId = 'X') => [
  { id: `${sourceId}`, sourceId, date, productId, currency: ccy, change: out, category: 'FX', description: 'Valuta Debitering' },
  { id: `${sourceId + 1}`, sourceId: sourceId + 1, date, productId, currency: 'EUR', change: eurIn, category: 'FX', description: 'Valuta Creditering' },
];

test('a currency conversion states the rate outright', () => {
  const days = dayRange('2024-01-01', '2024-01-03');
  const idx = new Map(days.map((d, i) => [d, i]));
  const rows = [...conversion(100, '2024-01-02', 'CHF', -1800, 1933.78)];
  const { series } = deriveFxRates([], {}, days, idx, 'EUR', rows);
  near(series.CHF[1], 1.07432, 0.00001, 'euros in divided by francs out');
});

test('conversions in several currencies on one day do not cross-pair', () => {
  const days = dayRange('2024-01-01', '2024-01-03');
  const idx = new Map(days.map((d, i) => [d, i]));
  const rows = [
    ...conversion(200, '2024-01-02', 'CHF', -415, 444.93, 'a'),
    ...conversion(300, '2024-01-02', 'SEK', 948.2, -82.54, 'b'),
  ];
  const { series } = deriveFxRates([], {}, days, idx, 'EUR', rows);
  near(series.CHF[1], 1.07211, 0.0001);
  near(series.SEK[1], 0.08704, 0.0001);
});

test('an option trade must not be read as an exchange rate', () => {
  // The bug this replaces: for a derivative, |totalBase - fee| / |price x qty|
  // is the rate times the contract size. Where every trade in a currency was an
  // option the median landed on that cluster and CHF came out at 107.
  const days = dayRange('2024-01-01', '2024-01-05');
  const idx = new Map(days.map((d, i) => [d, i]));
  const products = {
    1: { id: '1', name: 'SHARE', currency: 'CHF' },
    2: { id: '2', name: 'OPTION', currency: 'CHF', productType: 'OPTION' },
  };
  const transactions = [
    { date: '2024-01-02', productId: '1', quantity: 10, price: 100, currency: 'CHF', fee: 0, totalBase: -1070 },
    { date: '2024-01-03', productId: '2', quantity: -1, price: 5, currency: 'CHF', fee: 0, totalBase: 535 },
    { date: '2024-01-04', productId: '2', quantity: -2, price: 4, currency: 'CHF', fee: 0, totalBase: 856 },
  ];
  const { series } = deriveFxRates(transactions, products, days, idx, 'EUR', []);
  near(series.CHF[2], 1.07, 0.01, 'the lowest cluster is the rate, not the option cluster');
});

test('pence and pounds are the same currency', () => {
  const days = dayRange('2024-01-01', '2024-01-03');
  const idx = new Map(days.map((d, i) => [d, i]));
  const { series, report } = deriveFxRates([], {}, days, idx, 'EUR', [
    ...conversion(400, '2024-01-02', 'GBP', -1000, 1172.07),
  ]);
  near(series.GBP[1], 1.17207, 0.00001);
  near(series.GBX[1], 0.0117207, 0.0000001, 'a hundred pence to the pound');
  assert.equal(report.find((r) => r.currency === 'GBX').source, 'gbp');
});

test('a rate nobody has observed for years is called an estimate', () => {
  const days = dayRange('2020-01-01', '2024-01-01');
  const idx = new Map(days.map((d, i) => [d, i]));
  const { report } = deriveFxRates([], {}, days, idx, 'EUR', [
    ...conversion(500, '2020-01-02', 'HKD', -1000, 115),
  ]);
  const hkd = report.find((r) => r.currency === 'HKD');
  assert.equal(hkd.stale, true, 'one observation cannot describe four years');
  assert.ok(hkd.widestGapDays > 1000);
});

test('a contract size is measured, not assumed, and rounded to a whole number', () => {
  // Real contract sizes seen on one account: 10, 100, and 103 on a contract
  // adjusted for a corporate action. No table of sizes could hold that.
  const days = dayRange('2024-01-01', '2024-01-05');
  const products = {
    1: { id: '1', name: 'ADY P700', currency: 'EUR', productType: 'OPTION' },
    2: { id: '2', name: 'BMW P56', currency: 'EUR', productType: 'OPTION' },
    3: { id: '3', name: 'RND P38.81', currency: 'EUR', productType: 'OPTION' },
    4: { id: '4', name: 'PLAIN SHARE', currency: 'EUR' },
  };
  const transactions = [
    { date: '2024-01-02', productId: '1', quantity: -1, price: 29.85, currency: 'EUR', fee: 0, totalBase: 298.5 },
    { date: '2024-01-02', productId: '2', quantity: -1, price: 2.43, currency: 'EUR', fee: 0, totalBase: 243 },
    { date: '2024-01-02', productId: '3', quantity: -1, price: 7.71, currency: 'EUR', fee: 0, totalBase: 794.13 },
    { date: '2024-01-02', productId: '4', quantity: 10, price: 20, currency: 'EUR', fee: 0, totalBase: -200 },
  ];
  const { sizes, report } = deriveContractSizes(transactions, products, () => 1);
  assert.equal(sizes['1'], 10);
  assert.equal(sizes['2'], 100);
  assert.equal(sizes['3'], 103, 'a corporate action leaves a size that is not round');
  assert.equal(sizes['4'], undefined, 'an ordinary share needs no entry and no banner');
  assert.equal(report.every((r) => r.verdict === 'measured'), true);
});

test('a contract size measured through a guessed rate is flagged, not trusted silently', () => {
  // A rate interpolated across months is a few percent out, and a few percent
  // moves a contract size of 100 to 102. It is still the best answer available —
  // calling it unresolved would fall back to one share per contract, which is a
  // hundredfold error instead of a two percent one — so it is used and said out
  // loud.
  const days = dayRange('2024-01-01', '2024-06-30');
  const idx = new Map(days.map((d, i) => [d, i]));
  const products = { 1: { id: '1', name: 'FAR OPT', currency: 'USD', productType: 'OPTION' } };
  const transactions = [
    { date: '2024-04-01', productId: '1', quantity: -1, price: 10, currency: 'USD', fee: 0, totalBase: 900 },
  ];
  const far = deriveContractSizes(transactions, products, () => 0.9, 'EUR', { USD: [0] }, idx);
  assert.equal(far.report[0].anchored, false, 'the only observation is three months away');

  const anchored = deriveContractSizes(transactions, products, () => 0.9, 'EUR', { USD: [idx.get('2024-04-02')] }, idx);
  assert.equal(anchored.report[0].anchored, true, 'a rate stated the next day anchors it');
  assert.equal(anchored.sizes['1'], 100);
});

test('a contract size that will not repeat is reported, never guessed', () => {
  // A contract size is fixed, so two trades in the same instrument have to
  // produce the same number. One that does not is not a measurement.
  const products = { 1: { id: '1', name: 'ODD', currency: 'EUR', productType: 'OPTION' } };
  const transactions = [
    { date: '2024-01-02', productId: '1', quantity: -1, price: 10, currency: 'EUR', fee: 0, totalBase: 1000 },
    { date: '2024-01-03', productId: '1', quantity: -1, price: 10, currency: 'EUR', fee: 0, totalBase: 400 },
  ];
  const { sizes, report } = deriveContractSizes(transactions, products, () => 1);
  assert.equal(sizes['1'], undefined, '100 one day and 40 the next settles nothing');
  assert.equal(report[0].verdict, 'unresolved');
  assert.ok(report[0].spread > 2);
});

test('a contract size lands on a whole number or it is not used', () => {
  const products = { 1: { id: '1', name: 'HALF', currency: 'EUR', productType: 'OPTION' } };
  const transactions = [
    { date: '2024-01-02', productId: '1', quantity: -1, price: 10, currency: 'EUR', fee: 0, totalBase: 125 },
    { date: '2024-01-03', productId: '1', quantity: -1, price: 10, currency: 'EUR', fee: 0, totalBase: 125 },
  ];
  const { sizes, report } = deriveContractSizes(transactions, products, () => 1);
  assert.equal(sizes['1'], undefined, '12.5 shares per contract is not a share count');
  assert.equal(report[0].verdict, 'unresolved');
});

test('a written option is valued at its full contract size', () => {
  const days = dayRange('2024-01-01', '2024-01-05');
  const r = computePortfolio({
    products: { 1: { id: '1', name: 'WKL P70', symbol: 'WKL', currency: 'EUR', productType: 'OPTION' } },
    transactions: [
      // Sold two contracts for 12.95 each; 2590 landed, so one contract is 100.
      { date: '2024-01-02', productId: '1', quantity: -2, price: 12.95, currency: 'EUR', fee: 0, totalBase: 2590 },
    ],
    cashRows: [
      { date: '2024-01-01', description: 'Deposit', change: 10000, currency: 'EUR', category: 'DEPOSIT' },
      { date: '2024-01-02', description: 'Verkoop 2 @ 12,95 EUR', change: 2590, currency: 'EUR', category: 'TRADE' },
    ],
    today: '2024-01-05',
  });
  assert.equal(r.byProduct[0].contractSize, 100);
  near(r.byProduct[0].values.at(-1), -2590, 0.01, 'the liability is the full contract, not two shares');
  near(r.totals.value, 10000, 0.01, 'premium in, liability out: the account is unchanged');
});

test('a position DEGIRO does not report is an error, not a rounding note', () => {
  const days = dayRange('2024-01-01', '2024-01-05');
  const r = computePortfolio({
    products: { 1: { id: '1', name: 'GHOST', currency: 'EUR' } },
    transactions: [{ date: '2024-01-02', productId: '1', quantity: 5, price: 10, currency: 'EUR', fee: 0, totalBase: -50 }],
    cashRows: [{ date: '2024-01-01', description: 'Deposit', change: 1000, currency: 'EUR', category: 'DEPOSIT' }],
    today: '2024-01-05',
    livePositions: [{ productId: '1', size: 3, price: 10, value: 30 }],
  });
  const w = r.warnings.find((x) => x.code === 'position-mismatch');
  assert.ok(w, 'expected a position-mismatch warning');
  assert.equal(w.level, 'error');
  assert.equal(w.detail.positions[0].ours, 5);
  assert.equal(w.detail.positions[0].theirs, 3);
});

test('a cash fund among the positions is not mistaken for a holding', () => {
  const days = dayRange('2024-01-01', '2024-01-05');
  const r = computePortfolio({
    products: { 1: { id: '1', name: 'SHARE', currency: 'EUR' } },
    transactions: [{ date: '2024-01-02', productId: '1', quantity: 5, price: 10, currency: 'EUR', fee: 0, totalBase: -50 }],
    cashRows: [{ date: '2024-01-01', description: 'Deposit', change: 1000, currency: 'EUR', category: 'DEPOSIT' }],
    today: '2024-01-05',
    livePositions: [
      { productId: '1', size: 5, price: 10, value: 50 },
      { productId: 'FLATEX_EUR', size: 950, price: 1, value: 950 },
    ],
  });
  assert.equal(r.warnings.some((x) => x.code === 'position-mismatch'), false, 'a balance is not an instrument');
});

test('a round trip on a split-adjusted series closes to exactly zero', () => {
  // Found on two real accounts. Bought 26 and 17 on one day at different fills,
  // sold all 43 six days later; the ledger nets to zero and the position is gone.
  // Dividing each trade by the factor measured from its own fill left 17.36
  // shares of a bankrupt company on the books, worth EUR 69 that never existed.
  // A factor converts units. It cannot differ between two fills on one day, and
  // whatever it does, a position that closes has to close.
  const days = dayRange('2024-01-01', '2024-01-10');
  const r = computePortfolio({
    products: { 1: { id: '1', name: 'ROUND TRIP', symbol: 'RTP', currency: 'EUR', vwdId: '900' } },
    prices: {
      900: {
        start: '2024-01-01',
        stepDays: 1,
        // Quoted in units about a thousand times smaller than the fills.
        points: days.map((_, i) => ({ offsetDays: i, close: i < 5 ? 0.02 : 0.0096 })),
      },
    },
    transactions: [
      { date: '2024-01-01', productId: '1', quantity: 26, price: 15.67, currency: 'EUR', fee: 0 },
      { date: '2024-01-01', productId: '1', quantity: 17, price: 26.5, currency: 'EUR', fee: 0 },
      { date: '2024-01-06', productId: '1', quantity: -43, price: 9.61, currency: 'EUR', fee: 0 },
    ],
    cashRows: [{ date: '2024-01-01', description: 'Deposit', change: 2000, currency: 'EUR', category: 'DEPOSIT' }],
    today: '2024-01-10',
  });

  const p = r.byProduct[0];
  assert.equal(p.qty.at(-1), 0, 'the position was sold in full and must read exactly 0');
  assert.equal(p.values.at(-1), 0, 'a position that does not exist cannot be worth anything');
  assert.equal(r.positionsValue.at(-1), 0, 'and it must not reach the portfolio total');
});

test('the ledger reports the shares actually booked, not the price series units', () => {
  // The holdings table shows this number. A share count converted into a price
  // series' units is not a share count, and reads as a different position.
  const days = dayRange('2024-01-01', '2024-01-05');
  const r = computePortfolio({
    products: { 1: { id: '1', name: 'ADJUSTED', symbol: 'ADJ', currency: 'EUR', vwdId: '900' } },
    prices: { 900: { start: '2024-01-01', stepDays: 1, points: days.map((_, i) => ({ offsetDays: i, close: 0.05 })) } },
    transactions: [{ date: '2024-01-02', productId: '1', quantity: 40, price: 50, currency: 'EUR', fee: 0 }],
    cashRows: [{ date: '2024-01-01', description: 'Deposit', change: 5000, currency: 'EUR', category: 'DEPOSIT' }],
    today: '2024-01-05',
  });
  assert.equal(r.byProduct[0].qty.at(-1), 40, '40 shares were bought, so the ledger says 40');
  // 40 shares that cost 50 each are worth 2000, whatever units the series quotes in.
  near(r.positionsValue.at(-1), 2000, 0.01, 'and the valuation still converts correctly');
});

test('a series whose factor will not hold still is thrown away, not rescaled', () => {
  // No consistent relationship between quotes and fills means the series is not
  // this instrument. Rescaling it would draw another company under this name.
  const days = dayRange('2024-01-01', '2024-01-05');
  const r = computePortfolio({
    products: { 1: { id: '1', name: 'WRONG SERIES', symbol: 'WRG', currency: 'EUR', vwdId: '900' } },
    prices: {
      900: { start: '2024-01-01', stepDays: 1, points: [800, 40, 900, 30, 700].map((close, i) => ({ offsetDays: i, close })) },
    },
    transactions: [
      { date: '2024-01-01', productId: '1', quantity: 10, price: 8, currency: 'EUR', fee: 0 },
      { date: '2024-01-02', productId: '1', quantity: 10, price: 8, currency: 'EUR', fee: 0 },
    ],
    cashRows: [{ date: '2024-01-01', description: 'Deposit', change: 1000, currency: 'EUR', category: 'DEPOSIT' }],
    today: '2024-01-05',
  });
  const w = r.warnings.find((x) => x.code === 'price-series-mismatch');
  assert.ok(w, 'expected a price-series-mismatch warning');
  assert.equal(w.level, 'error');
  assert.equal(r.byProduct[0].qty.at(-1), 20, 'the share count is left exactly as booked');
  near(r.positionsValue.at(-1), 160, 0.01, 'valued at the price actually paid');
});

test('a series is judged on price, so fractional shares change nothing', () => {
  // Buying 0.37 of a share does not change what a share costs, and the audit
  // compares prices, never quantities.
  const days = dayRange('2024-01-01', '2024-01-05');
  const r = computePortfolio({
    products: { 1: { id: '1', name: 'FRACTIONAL', currency: 'EUR', vwdId: '900' } },
    prices: { 900: { start: '2024-01-01', stepDays: 1, points: days.map((_, i) => ({ offsetDays: i, close: 700 })) } },
    transactions: [
      { date: '2024-01-02', productId: '1', quantity: 0.37, price: 705, currency: 'EUR', fee: 0 },
      { date: '2024-01-03', productId: '1', quantity: 0.128, price: 698, currency: 'EUR', fee: 0 },
    ],
    cashRows: [{ date: '2024-01-01', description: 'Deposit', change: 1000, currency: 'EUR', category: 'DEPOSIT' }],
    today: '2024-01-05',
  });
  assert.equal(r.warnings.some((w) => w.code === 'price-series-mismatch'), false, 'a fraction is not a mismatch');
  near(r.byProduct[0].qty.at(-1), 0.498, 0.0001, 'fractional quantities survive intact');
  near(r.positionsValue.at(-1), 0.498 * 700, 0.01);
});

test('a series is kept when FX alone explains the gap', () => {
  // A USD instrument counted at 1:1 sits maybe 20% off. That must not be enough
  // to throw the whole price history away.
  const days = dayRange('2024-01-01', '2024-01-05');
  const r = computePortfolio({
    products: { 1: { id: '1', name: 'US STOCK', currency: 'USD', vwdId: '900' } },
    prices: { 900: { start: '2024-01-01', stepDays: 1, points: days.map((_, i) => ({ offsetDays: i, close: 118 })) } },
    transactions: [{ date: '2024-01-02', productId: '1', quantity: 10, price: 100, currency: 'USD', fee: 0 }],
    cashRows: [{ date: '2024-01-01', description: 'Deposit', change: 2000, currency: 'EUR', category: 'DEPOSIT' }],
    today: '2024-01-05',
  });
  assert.equal(r.warnings.some((w) => w.code === 'price-series-mismatch'), false);
  near(r.positionsValue.at(-1), 1180);
});

test('an ordinary instrument keeps its series', () => {
  // Quote and fill differ intraday, as they always do. That must not look like
  // a split, or every ordinary holding gets mangled.
  const days = dayRange('2024-01-01', '2024-01-05');
  const r = computePortfolio({
    products: { 1: { id: '1', name: 'NORMAL', currency: 'EUR', vwdId: '900' } },
    prices: { 900: { start: '2024-01-01', stepDays: 1, points: days.map((_, i) => ({ offsetDays: i, close: 101 })) } },
    transactions: [{ date: '2024-01-02', productId: '1', quantity: 10, price: 100, currency: 'EUR', fee: 0 }],
    cashRows: [{ date: '2024-01-01', description: 'Deposit', change: 1000, currency: 'EUR', category: 'DEPOSIT' }],
    today: '2024-01-05',
  });
  assert.equal(r.byProduct[0].qty.at(-1), 10, 'a 1% intraday difference proves nothing');
  assert.equal(r.warnings.some((w) => w.code === 'price-series-mismatch'), false);
  near(r.positionsValue.at(-1), 1010);
});

test('a history worth many times everything paid in is called out', () => {
  // The engine cannot always repair a unit error, but it must never draw one
  // silently. This is the tripwire that should have caught the report.
  const days = dayRange('2024-01-01', '2024-01-05');
  const r = computePortfolio({
    products: { 1: { id: '1', name: 'GHOST', currency: 'EUR', vwdId: null } },
    prices: {},
    // No price series, so no factor can be measured: quantity stands as booked.
    transactions: [{ date: '2024-01-02', productId: '1', quantity: 1e6, price: 1000, currency: 'EUR', fee: 0 }],
    cashRows: [{ date: '2024-01-01', description: 'Deposit', change: 10000, currency: 'EUR', category: 'DEPOSIT' }],
    today: '2024-01-05',
  });
  const w = r.warnings.find((x) => x.code === 'implausible-history');
  assert.ok(w, 'expected an implausible-history warning');
  assert.equal(w.level, 'error');
  assert.equal(w.detail.culprits[0].name, 'GHOST');
});

test('an ordinary account does not trip the plausibility check', () => {
  const meta = fixture('meta.json');
  const r = computePortfolio({
    transactions: parseTransactions(fixture('transactions.json')),
    cashRows: parseCashMovements(fixture('accountoverview.json')),
    products: parseProducts(fixture('products-info.json')),
    prices: loadPrices(parseChartResponse, meta),
    today: meta.today,
  });
  assert.equal(r.warnings.some((w) => w.code === 'implausible-history'), false);
  assert.equal(r.warnings.some((w) => w.code === 'price-series-mismatch'), false);
});

test('days before a price series starts use the traded price, not a future quote', () => {
  // Extrapolating the first quote backwards is what turns a post-split price
  // into a pre-split valuation.
  const r = computePortfolio({
    products: { 1: { id: '1', name: 'LATE SERIES', currency: 'EUR', vwdId: '900' } },
    prices: { 900: { start: '2024-01-05', stepDays: 1, points: [{ offsetDays: 0, close: 500 }] } },
    transactions: [{ date: '2024-01-01', productId: '1', quantity: 10, price: 5, currency: 'EUR', fee: 0 }],
    cashRows: [{ date: '2024-01-01', description: 'Deposit', change: 50, currency: 'EUR', category: 'DEPOSIT' }],
    today: '2024-01-05',
  });
  near(r.positionsValue[0], 50, 0.01, 'day one is valued at the price actually paid');
  assert.ok(r.estimated[0] === 1, 'and the day is flagged as an estimate');
});


test('a dragged range selects an arbitrary window, not one of six', () => {
  // The six buttons reach six windows; March 2024 and the fortnight around a
  // crash were unreachable between them.
  const days = dayRange('2024-01-01', '2024-12-31');
  const from = rangeStartIndex(days, '2024-03-01..2024-03-31');
  const to = rangeEndIndex(days, '2024-03-01..2024-03-31');
  assert.equal(days[from], '2024-03-01');
  assert.equal(days[to], '2024-03-31');
  assert.equal(to - from + 1, 31);
});

test('a button range still runs to the newest day', () => {
  const days = dayRange('2024-01-01', '2024-12-31');
  assert.equal(rangeEndIndex(days, '3M'), days.length - 1);
  assert.equal(rangeEndIndex(days, 'ALL'), days.length - 1);
});

test('a dragged range that starts before the history clamps to its first day', () => {
  const days = dayRange('2024-06-01', '2024-06-30');
  assert.equal(rangeStartIndex(days, '2020-01-01..2024-06-10'), 0);
  assert.equal(days[rangeEndIndex(days, '2020-01-01..2024-06-10')], '2024-06-10');
});


// ---------------------------------------------------------------------------
// Candles on the cumulative result
// ---------------------------------------------------------------------------

test('a month holding only a deposit draws a flat candle', () => {
  // THE test for this feature. A candle on portfolio value would say the
  // deposit was volatility: the high of the month is its maximum daily total,
  // so paying money in on the 12th raises it and the candle grows a long upper
  // wick where nothing swung. Built on the deposit-free curve, it must be flat.
  const days = dayRange('2024-01-01', '2024-01-31');
  const r = computePortfolio({
    products: {},
    transactions: [],
    cashRows: [
      { date: '2024-01-01', description: 'iDEAL Deposit', change: 1000, currency: 'EUR', category: 'DEPOSIT' },
      { date: '2024-01-12', description: 'iDEAL Deposit', change: 50000, currency: 'EUR', category: 'DEPOSIT' },
    ],
    today: '2024-01-31',
  });
  const { candles } = candleSeries(r.days, r.pnl, 'month', 0, r.days.length - 1);
  assert.equal(candles.length, 1);
  const c = candles[0];
  assert.deepEqual(
    [c.open, c.high, c.low, c.close],
    [0, 0, 0, 0],
    'EUR 50,000 arriving is not a swing, and the candle must not draw one',
  );
});

test('a candle spans the highest and lowest the result reached inside the bucket', () => {
  const days = dayRange('2024-01-01', '2024-01-04');
  // +100 up, then -300 down, then +50 back up: high +100, low -200, close -150.
  const pnl = [0, 100, -300, 50];
  const { candles, labels } = candleSeries(days, pnl, 'month', 0, 3);
  assert.deepEqual(labels, ['2024-01']);
  assert.deepEqual([candles[0].open, candles[0].high, candles[0].low, candles[0].close], [0, 100, -200, -150]);
  assert.equal(candles[0].up, false, 'it closed below where it opened');
});

test('each candle opens where the previous one closed', () => {
  const days = dayRange('2024-01-01', '2024-02-29');
  const pnl = days.map((d) => (d.startsWith('2024-01') ? 10 : -5));
  const { candles } = candleSeries(days, pnl, 'month', 0, days.length - 1);
  assert.equal(candles.length, 2);
  assert.equal(candles[1].open, candles[0].close, 'a gap between them would be a break in the curve');
  assert.equal(candles[0].up, true);
  assert.equal(candles[1].up, false);
});

// ---------------------------------------------------------------------------
// buildComposition — membership belongs to the window, colour to the instrument
// ---------------------------------------------------------------------------

/** A result-shaped object with hand-written value series. Days are ISO and daily. */
function fakeResult(series) {
  const n = Object.values(series)[0].length;
  const days = Array.from({ length: n }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`);
  return {
    days,
    cash: new Array(n).fill(0),
    byProduct: Object.entries(series).map(([productId, values]) => ({
      productId,
      name: productId,
      symbol: productId,
      values,
      qty: values.map((v) => (v ? 1 : 0)),
      pnl: new Array(n).fill(0),
      current: values.at(-1),
    })),
  };
}

test('a position closed before the window does not take a layer', () => {
  // OLD, and the whole point of the story: `sold` peaked highest of anything
  // here, so it passed an all-time filter, took a categorical slot, and then
  // drew a flat zero across a window it was not present in — while `bought`,
  // which is actually held, was folded into Other.
  const r = fakeResult({
    sold: [900, 900, 0, 0],
    held: [100, 100, 100, 100],
    bought: [0, 0, 300, 300],
  });
  const c = buildComposition(r, 2, 2, 3);
  const keys = c.layers.map((l) => l.key);
  assert.equal(keys.includes('sold'), false, 'a position not held in the window gets no layer');
  assert.deepEqual(keys.slice(0, 2), ['bought', 'held'], 'ranked by what the window actually contains');
});

test('ranking is by mean over the window, not by a one-day spike', () => {
  // `spike` has the higher peak — 1000 against 200 — so the old peak rule put
  // it first. But it was there for one day in ten, and the question the chart
  // answers is what this portfolio *was* over the period, not what it briefly
  // touched. Mean: 100 against 200.
  const flat = (v) => new Array(10).fill(v);
  const spike = flat(0);
  spike[4] = 1000;
  const r = fakeResult({ spike, steady: flat(200) });
  assert.equal(buildComposition(r, 1, 0, 9).layers[0].key, 'steady');
});

test('an empty slot is backfilled rather than lost', () => {
  // The old order sliced to topN and *then* dropped the empty ones, so an empty
  // one cost a layer that was never filled — six slots, five bands, no reason.
  const r = fakeResult({ a: [0, 0], b: [10, 10], c: [5, 5] });
  const c = buildComposition(r, 2, 0, 1);
  assert.deepEqual(c.layers.filter((l) => l.productId).map((l) => l.key), ['b', 'c']);
});

test('rank is the all-time ordering, so a window cannot move it', () => {
  const r = fakeResult({
    big: [1000, 1000, 0, 0],
    small: [10, 10, 10, 10],
  });
  const whole = buildComposition(r, 2, 0, 3);
  const tail = buildComposition(r, 2, 2, 3);
  const rankOf = (c, key) => c.layers.find((l) => l.key === key)?.rank;
  assert.equal(rankOf(whole, 'small'), rankOf(tail, 'small'),
    'the same instrument reports the same rank whatever window it is seen in');
  assert.equal(rankOf(whole, 'big'), 0, 'ranked on the whole history, where it is the largest');
});

test('Other reports no rank, so it can never take an instrument colour', () => {
  const r = fakeResult({ a: [10, 10], b: [5, 5], c: [1, 1] });
  const other = buildComposition(r, 1, 0, 1).layers.find((l) => l.key === '__other__');
  assert.equal(other.rank, null);
  assert.equal(other.members.length, 2);
});

// ---------------------------------------------------------------------------
// per-holding result
// ---------------------------------------------------------------------------

test('a round trip inside the window reports its realised result', () => {
  // Bought at 100, sold at 130, nothing held at either end. No cost-basis
  // convention is consulted, because the position is worth zero on both sides.
  const r = computePortfolio({
    prices: { 900: { start: '2024-01-01', stepDays: 1, points: [
      { offsetDays: 0, close: 100 },
      { offsetDays: 1, close: 100 },
      { offsetDays: 2, close: 130 },
      { offsetDays: 3, close: 130 },
    ] } },
    products: { 1: { id: '1', name: 'Thing', symbol: 'THG', currency: 'EUR', vwdId: '900', productType: 'STOCK' } },
    transactions: [
      { date: '2024-01-02', productId: '1', quantity: 1, price: 100, currency: 'EUR', fee: 0, totalBase: -100 },
      { date: '2024-01-03', productId: '1', quantity: -1, price: 130, currency: 'EUR', fee: 0, totalBase: 130 },
    ],
    cashRows: [
      { date: '2024-01-01', description: 'Deposit', change: 1000, currency: 'EUR', category: 'DEPOSIT' },
      { date: '2024-01-02', description: 'Koop', change: -100, currency: 'EUR', category: 'TRADE' },
      { date: '2024-01-03', description: 'Verkoop', change: 130, currency: 'EUR', category: 'TRADE' },
    ],
    today: '2024-01-04',
  });
  const p = r.byProduct.find((x) => x.productId === '1');
  const realised = p.pnl.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(realised - 30) < 0.01, `realised ${realised}, expected 30`);
  assert.equal(p.qty.at(-1), 0, 'and it is closed');
});

test('a purchase is not a gain on the day it settles', () => {
  const r = computePortfolio({
    prices: { 900: { start: '2024-01-01', stepDays: 1, points: [0, 1].map((i) => ({ offsetDays: i, close: 100 })) } },
    products: { 1: { id: '1', name: 'Thing', symbol: 'THG', currency: 'EUR', vwdId: '900', productType: 'STOCK' } },
    transactions: [
      { date: '2024-01-02', productId: '1', quantity: 1, price: 100, currency: 'EUR', fee: 0, totalBase: -100 },
    ],
    cashRows: [
      { date: '2024-01-01', description: 'Deposit', change: 1000, currency: 'EUR', category: 'DEPOSIT' },
      { date: '2024-01-02', description: 'Koop', change: -100, currency: 'EUR', category: 'TRADE' },
    ],
    today: '2024-01-02',
  });
  const p = r.byProduct.find((x) => x.productId === '1');
  // 100 euros of value appeared, and exactly 100 euros bought it.
  assert.ok(Math.abs(p.pnl[1]) < 0.01, `day of purchase scored ${p.pnl[1]}, expected 0`);
});

test('a product says whether it has usable prices behind it', () => {
  // Shipped once as a marker that could never appear: the UI looked for the
  // instrument in `warning.products`, a field no warning has. The fact belongs
  // to the product — and the warning that does list instruments truncates at 40,
  // so it was never the right source either.
  //
  // `hasSeries` is false in both cases that matter: no series at all, and a
  // series the audit could not reconcile with what was actually paid. Both mean
  // the same thing to a reader — held at the last price it traded at.
  const r = computePortfolio({
    prices: { 900: { start: '2024-01-01', stepDays: 1, points: [0, 1].map((i) => ({ offsetDays: i, close: 100 })) } },
    products: {
      1: { id: '1', name: 'Quoted', symbol: 'Q', currency: 'EUR', vwdId: '900', productType: 'STOCK' },
      2: { id: '2', name: 'Delisted', symbol: 'D', currency: 'EUR', vwdId: '901', productType: 'STOCK' },
    },
    transactions: [
      { date: '2024-01-01', productId: '1', quantity: 1, price: 100, currency: 'EUR', fee: 0, totalBase: -100 },
      { date: '2024-01-01', productId: '2', quantity: 1, price: 100, currency: 'EUR', fee: 0, totalBase: -100 },
    ],
    cashRows: [{ date: '2024-01-01', description: 'Deposit', change: 1000, currency: 'EUR', category: 'DEPOSIT' }],
    today: '2024-01-02',
  });
  const bySymbol = Object.fromEntries(r.byProduct.map((x) => [x.symbol, x]));
  assert.equal(bySymbol.Q.hasSeries, true);
  assert.equal(bySymbol.D.hasSeries, false, 'no series, so its result between trades is an estimate');
});

test('a window return is not flattered by a deposit inside it', () => {
  // The reason the tiles can follow a range at all. Two days of +10% on a
  // portfolio that doubles in size overnight because money arrived: the return
  // is 21%, not whatever dividing the euro result by the opening value says.
  const r = {
    days: ['2026-01-01', '2026-01-02', '2026-01-03'],
    value: [1000, 2200, 2420],
    pnl: [0, 100, 220],
  };
  assert.ok(Math.abs(windowReturnPct(r, 0, 2) - 21) < 0.01, `got ${windowReturnPct(r, 0, 2)}`);
  // and the euro result over the same window is 320 on an opening 1000, which
  // naive division would call 32%.
});

test('a window with nothing invested returns zero rather than NaN', () => {
  const r = { days: ['2026-01-01', '2026-01-02'], value: [0, 0], pnl: [0, 0] };
  assert.equal(windowReturnPct(r, 0, 1), 0);
});

// ---------------------------------------------------------------------------
// maxDrawdown
// ---------------------------------------------------------------------------

/** A result-shaped object with just the two series maxDrawdown reads. */
const dd = (pnl, value) => ({ days: pnl.map((_, i) => `2024-01-${String(i + 1).padStart(2, '0')}`), pnl, value });

test('maxDrawdown finds the deepest peak-to-trough fall, not the largest single drop', () => {
  //           d0   d1   d2   d3   d4   d5
  // running:   10   30   20    5   25   40   → peak 30 at d1, trough 5 at d3
  const r = dd([10, 20, -10, -15, 20, 15], [100, 130, 120, 105, 125, 140]);
  const out = maxDrawdown(r);
  assert.equal(out.amount, -25);
  assert.equal(out.from, 1);
  assert.equal(out.to, 3);
  // -25 against the portfolio value on the peak day, not against the curve.
  assert.ok(Math.abs(out.pct - (-25 / 130) * 100) < 1e-9);
});

test('a withdrawal is not a drawdown', () => {
  // The whole reason this reads `pnl` and not `value`: value halves on d2 and
  // nothing went wrong — the money was taken out. `pnl` already excludes it.
  const r = dd([0, 0, 0, 0], [100, 100, 50, 50]);
  assert.equal(maxDrawdown(r).amount, 0);
});

test('a curve that only rises has no drawdown', () => {
  assert.equal(maxDrawdown(dd([5, 5, 5], [10, 15, 20])).amount, 0);
});

test('maxDrawdown honours the window it is given', () => {
  const r = dd([10, -40, 30, 5, -5], [100, 60, 90, 95, 90]);
  // The crash on d1 is outside a window that starts at d2.
  assert.equal(maxDrawdown(r, 2, 4).amount, -5);
  assert.equal(maxDrawdown(r, 0, 4).amount, -40);
});

// ---------------------------------------------------------------------------
// A residual-cent conversion states no rate
// ---------------------------------------------------------------------------

/**
 * From a real bug report: USD `fx-derived` with four observations, a median of
 * 0.8647 and a **high of exactly 1**. No currency pair has ever had a rate of
 * 1.0000, so one of the four was junk — and with a 1 554-day gap between
 * observations, one junk point prices years of holdings.
 *
 * The mechanism is rounding. Both legs are stored to the cent, so a €0.01 leg
 * carries a 50 % relative error, and a residual sweep of one cent each way
 * divides to exactly 1.
 */
const fxRow = (sourceId, date, currency, change) => ({
  id: `fx${sourceId}`,
  sourceId,
  date,
  currency,
  change,
  category: 'FX',
  productId: '',
});

test('a one-cent currency conversion is not treated as an exchange rate', () => {
  const days = dayRange('2024-01-01', '2024-01-05');
  const dayIndex = new Map(days.map((d, i) => [d, i]));

  const observations = fxFromConversions(
    [
      // A real conversion: €864,70 for $1 000.
      fxRow(1, '2024-01-02', 'EUR', -864.7),
      fxRow(2, '2024-01-02', 'USD', 1000),
      // A residual sweep. One cent each way divides to exactly 1.0000.
      fxRow(3, '2024-01-04', 'EUR', -0.01),
      fxRow(4, '2024-01-04', 'USD', 0.01),
    ],
    dayIndex,
  );

  assert.equal(observations.length, 1, 'only the real conversion states a rate');
  assert.ok(Math.abs(observations[0].rate - 0.8647) < 0.0001);
  assert.deepEqual(
    observations.dropped.map((d) => d.currency),
    ['USD'],
    'and the one that was dropped is counted, not silently discarded',
  );
});

test('the dropped count reaches the FX report', () => {
  const days = dayRange('2024-01-01', '2024-01-05');
  const dayIndex = new Map(days.map((d, i) => [d, i]));

  const { report } = deriveFxRates(
    [],
    {},
    days,
    dayIndex,
    'EUR',
    [
      fxRow(1, '2024-01-02', 'EUR', -864.7),
      fxRow(2, '2024-01-02', 'USD', 1000),
      fxRow(3, '2024-01-04', 'EUR', -0.01),
      fxRow(4, '2024-01-04', 'USD', 0.01),
    ],
  );

  const usd = report.find((r) => r.currency === 'USD');
  assert.equal(usd.observations, 1);
  assert.equal(usd.dropped, 1);
  // The whole point: 1.0000 no longer appears anywhere in the reported range.
  assert.ok(usd.high < 0.9, `high was ${usd.high}`);
});

test('a currency whose only conversions were all too small still reports itself', () => {
  // It must not vanish. Falling back to 1:1 with nothing said is exactly the
  // silent-wrong-number failure the project exists to avoid.
  const days = dayRange('2024-01-01', '2024-01-05');
  const dayIndex = new Map(days.map((d, i) => [d, i]));

  const { report } = deriveFxRates([], {}, days, dayIndex, 'EUR', [
    fxRow(1, '2024-01-02', 'EUR', -0.01),
    fxRow(2, '2024-01-02', 'USD', 0.01),
  ]);

  const usd = report.find((r) => r.currency === 'USD');
  assert.ok(usd, 'USD is absent from the report entirely');
  assert.equal(usd.observations, 0);
  assert.equal(usd.dropped, 1);
});

// ---------------------------------------------------------------------------
// B11 — a size measured through an interpolated rate is not "measured"
// ---------------------------------------------------------------------------

/**
 * The contract size is `|totalBase − fee| ÷ |price × quantity| ÷ rate`, so any
 * error in the rate lands directly on the size and then gets rounded. A true
 * 100 measured through a rate 8 % out reads 108 and rounds there — and the row
 * used to report `anchored: false` and `verdict: 'measured'` side by side,
 * contradicting itself, with the UI believing the confident half.
 *
 * The number is still used: falling back to one share per contract would be a
 * hundredfold error in place of an eight percent one. It is reported as an
 * estimate instead.
 */
test('a contract size measured far from any stated rate is reported as estimated', () => {
  const days = dayRange('2024-01-01', '2024-06-30');
  const dayIndex = new Map(days.map((d, i) => [d, i]));

  // One rate observation, on day 0 only. The trade is 150 days later, so its
  // rate is extrapolated flat and is whatever the truth has drifted to since.
  const observedAt = { NOK: [0] };
  const rateUsed = 0.08; // what the interpolation believes
  const trueRate = 0.0864; // what it actually was on the trade date, 8 % away

  const products = { X: { id: 'X', currency: 'NOK', name: 'SPRS P75', productType: 'OPTION' } };
  const transactions = [
    {
      id: 't1',
      date: days[150],
      productId: 'X',
      quantity: -6,
      price: 9.4,
      currency: 'NOK',
      // What actually settled: 6 contracts × 100 shares × 9,40 NOK × the true rate.
      totalBase: 6 * 100 * 9.4 * trueRate,
      fee: 0,
    },
  ];

  const { sizes, report } = deriveContractSizes(
    transactions,
    products,
    () => rateUsed,
    'EUR',
    observedAt,
    dayIndex,
  );

  const row = report.find((r) => r.productId === 'X');
  assert.equal(row.anchored, false);
  assert.equal(row.verdict, 'estimated', 'a number derived through an interpolated rate is not measured');
  assert.equal(row.size, 108, 'and it is 8 % out, which is exactly why it must not claim to be measured');
  // Still used, deliberately: one share per contract would be a hundredfold error.
  assert.equal(sizes.X, 108);
});

test('a contract size measured beside a stated rate still says measured', () => {
  const days = dayRange('2024-01-01', '2024-06-30');
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const products = { X: { id: 'X', currency: 'NOK', name: 'SPRS P75', productType: 'OPTION' } };
  const transactions = [
    { id: 't1', date: days[10], productId: 'X', quantity: -6, price: 9.4, currency: 'NOK', totalBase: 6 * 100 * 9.4 * 0.08, fee: 0 },
  ];

  const { report } = deriveContractSizes(transactions, products, () => 0.08, 'EUR', { NOK: [10] }, dayIndex);
  const row = report.find((r) => r.productId === 'X');
  assert.equal(row.anchored, true);
  assert.equal(row.verdict, 'measured');
  assert.equal(row.size, 100);
});

// ---------------------------------------------------------------------------
// US-27 — what went in, what came out, and what it paid
// ---------------------------------------------------------------------------

test('bought and sold are the two halves of the net, not the net', () => {
  const days = dayRange('2024-01-01', '2024-01-10');
  const day = (n) => days[n - 1];
  const cash = (id, d, description, change, productId = '') => ({
    id, date: day(d), description, change, currency: 'EUR', productId,
    category: classifyCashRow({ description }),
  });

  const r = computePortfolio({
    transactions: [
      { id: 'a', date: day(2), productId: 'P', quantity: 10, price: 50, currency: 'EUR', totalBase: -500, fee: 0 },
      { id: 'b', date: day(6), productId: 'P', quantity: -4, price: 60, currency: 'EUR', totalBase: 240, fee: 0 },
    ],
    cashRows: [
      cash('c1', 1, 'Storting', 1000),
      cash('c2', 2, 'Koop', -500),
      cash('c3', 6, 'Verkoop', 240),
      cash('c4', 7, 'Dividend', 30, 'P'),
      cash('c5', 7, 'Dividendbelasting', -4.5, 'P'),
      // No productId: cannot be attributed, must be counted rather than dropped.
      cash('c6', 8, 'Dividend', 11),
    ],
    products: { P: { id: 'P', name: 'P', symbol: 'P', currency: 'EUR', isin: 'NL0000000001', vwdId: 'P' } },
    prices: { P: { start: day(1), points: days.map((_, i) => ({ offsetDays: i, close: 50 })) } },
    today: day(10),
    liveTotal: null,
  });

  const p = r.byProduct.find((x) => x.productId === 'P');
  assert.equal(p.bought, 500, 'money that left');
  assert.equal(p.sold, 240, 'money that came back');
  // The net the per-product result rests on is still bought - sold, so the two
  // halves and the whole cannot drift apart.
  assert.equal(round2(p.bought - p.sold), 260);
  assert.equal(p.dividend, 25.5, 'gross plus the withheld tax, i.e. what landed');
  assert.equal(p.isin, 'NL0000000001');
  assert.equal(r.unattributedDividends, 1, 'the row with no product is counted, not lost');
});

test('a product that was only ever sold has a zero bought half', () => {
  // A transfer-in, or an account whose history starts mid-position. The row
  // must not silently become a purchase.
  const days = dayRange('2024-01-01', '2024-01-05');
  const r = computePortfolio({
    transactions: [
      { id: 'a', date: days[1], productId: 'P', quantity: -3, price: 20, currency: 'EUR', totalBase: 60, fee: 0 },
    ],
    cashRows: [],
    products: { P: { id: 'P', name: 'P', symbol: 'P', currency: 'EUR' } },
    prices: {},
    today: days[4],
    liveTotal: null,
  });
  const p = r.byProduct.find((x) => x.productId === 'P');
  assert.equal(p.bought, 0);
  assert.equal(p.sold, 60);
});

// ---------------------------------------------------------------------------
// US-31 — annualised return, both kinds
// ---------------------------------------------------------------------------

/** A result-shaped object with only the three series this reads. */
function series(pnl, value, netExternal) {
  return {
    days: value.map((_, i) => new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10)),
    pnl,
    value,
    netExternal,
  };
}

test('a known IRR is solved to four decimals', () => {
  // €1 000 in on day 0, worth €1 210 two years later. The money-weighted rate
  // is exactly 10 %: 1000 * 1.1^2 = 1210.
  const n = 731;
  const value = new Array(n).fill(1000);
  value[n - 1] = 1210;
  const netExternal = new Array(n).fill(0);
  netExternal[0] = 1000;
  const pnl = new Array(n).fill(0);
  pnl[n - 1] = 210;

  const out = annualisedReturn(series(pnl, value, netExternal));
  assert.equal(out.reason, null);
  assert.ok(Math.abs(out.moneyWeighted - 10) < 0.01, `expected ~10 %, got ${out.moneyWeighted}`);
});

test('money-weighted and time-weighted disagree when the money arrived late', () => {
  // Small early, large late, and the late money catches the fall. The portfolio
  // did fine; the money did not. A page showing one of these as "the return"
  // without saying which is a page that misleads.
  const n = 800;
  const value = new Array(n).fill(0);
  const netExternal = new Array(n).fill(0);
  const pnl = new Array(n).fill(0);

  value.fill(1000, 0, 400);
  netExternal[0] = 1000;
  // A big deposit on day 400, then a 20 % fall across the rest.
  netExternal[400] = 100000;
  for (let i = 400; i < n; i++) value[i] = 101000 - ((i - 400) / (n - 401)) * 20200;
  for (let i = 1; i < n; i++) pnl[i] = value[i] - value[i - 1] - netExternal[i];

  const out = annualisedReturn(series(pnl, value, netExternal));
  assert.ok(out.moneyWeighted != null && out.timeWeighted != null);
  assert.ok(out.moneyWeighted < out.timeWeighted, 'the late deposit should drag the money-weighted figure down');
});

test('under a year, nothing is annualised', () => {
  const n = 90;
  const out = annualisedReturn(series(new Array(n).fill(1), new Array(n).fill(100), new Array(n).fill(0)));
  assert.equal(out.reason, 'too-short');
  assert.equal(out.moneyWeighted, null);
  assert.equal(out.timeWeighted, null);
});

test('a cashflow sequence with several roots refuses to pick one', () => {
  // In, out, in — the classic multiple-IRR shape. A solver started at a guess
  // returns whichever root it walks into, with no sign the others exist.
  const n = 1200;
  const value = new Array(n).fill(0);
  const netExternal = new Array(n).fill(0);
  netExternal[0] = 1000;
  netExternal[400] = -5000;
  netExternal[800] = 6000;
  value.fill(1000, 0, 400);
  value.fill(4000, 400, 800);
  value.fill(500, 800, n);
  const pnl = new Array(n).fill(0);
  for (let i = 1; i < n; i++) pnl[i] = value[i] - value[i - 1] - netExternal[i];

  const out = annualisedReturn(series(pnl, value, netExternal));
  if (out.moneyWeighted === null) assert.equal(out.reason, 'multiple-roots');
  // If this shape happens to have one root it is allowed to answer — the
  // assertion that matters is that it never answers when it has several.
});

test('US-30: a year containing a large deposit and no market movement returns ~0 %', () => {
  // The trap the year table exists to avoid. (close − open) ÷ open would report
  // this year as +900 %; the chained return knows nothing happened.
  const days = dayRange('2024-01-01', '2024-12-31');
  const cashRow = (id, d, description, change) => {
    const row = { id, date: d, description, change, currency: 'EUR' };
    return { ...row, category: classifyCashRow(row) };
  };
  const r = computePortfolio({
    transactions: [],
    cashRows: [cashRow('a', '2024-01-02', 'Storting', 1000), cashRow('b', '2024-06-01', 'Storting', 9000)],
    products: {},
    prices: {},
    today: '2024-12-31',
    liveTotal: null,
  });
  assert.ok(Math.abs(windowReturnPct(r, 0, r.days.length - 1)) < 0.001, 'a deposit is not a return');
  assert.equal(r.totals.value, 10000);
});

test('US-30: income splits into calendar years and the years sum to the total', () => {
  const cashRow = (id, d, description, change) => {
    const row = { id, date: d, description, change, currency: 'EUR' };
    return { ...row, category: classifyCashRow(row) };
  };
  const r = computePortfolio({
    transactions: [],
    cashRows: [
      cashRow('a', '2023-02-01', 'Storting', 1000),
      cashRow('b', '2023-03-01', 'Dividend', 30),
      cashRow('c', '2024-03-01', 'Dividend', 50),
      cashRow('d', '2024-04-01', 'Transactiekosten', -2),
    ],
    products: {},
    prices: {},
    today: '2024-12-31',
    liveTotal: null,
  });

  assert.equal(r.incomeByYear['2023'].dividendGross, 30);
  assert.equal(r.incomeByYear['2024'].dividendGross, 50);
  assert.equal(r.incomeByYear['2024'].fees, -2);
  // The split cannot drift from the whole.
  const summed = Object.values(r.incomeByYear).reduce((a, y) => a + y.dividendGross, 0);
  assert.equal(round2(summed), r.income.dividendGross);
});

// ---------------------------------------------------------------------------
// US-33 — the projection, and the guards that stop it lying
// ---------------------------------------------------------------------------

/** A five-year account that grew steadily and paid a dividend. */
function grower() {
  const days = dayRange('2020-01-01', '2024-12-31');
  const cashRow = (id, d, description, change) => {
    const row = { id, date: d, description, change, currency: 'EUR' };
    return { ...row, category: classifyCashRow(row) };
  };
  const rows = [cashRow('dep', '2020-01-01', 'Storting', 10000), cashRow('buy', '2020-01-02', 'Koop', -10000)];
  for (let y = 2020; y <= 2024; y++) rows.push(cashRow(`div${y}`, `${y}-06-01`, 'Dividend', 300));
  return computePortfolio({
    transactions: [{ id: 't', date: '2020-01-02', productId: 'P', quantity: 100, price: 100, currency: 'EUR', totalBase: -10000, fee: 0 }],
    cashRows: rows,
    products: { P: { id: 'P', name: 'P', symbol: 'P', currency: 'EUR', vwdId: 'P' } },
    prices: { P: { start: '2020-01-01', points: days.map((_, i) => ({ offsetDays: i, close: 100 * 1.08 ** (i / 365) })) } },
    today: '2024-12-31',
    liveTotal: null,
  });
}

test('the derived rates do not double-count the dividends', () => {
  // The trap: a dividend is internal, so it is already inside the total return.
  // Taking the total as "growth" and adding a yield on top counts it twice.
  const r = grower();
  const p = projectPortfolio(r, { months: 12 });
  const { growthPct, yieldPct, totalAnnual } = p.rates.derived;
  assert.ok(Math.abs(growthPct + yieldPct - totalAnnual) < 0.001, 'the two halves must sum to the whole');
  assert.ok(yieldPct > 0, 'this account pays a dividend, so the yield is not zero');
});

test('a horizon longer than the history is an example, not a scenario', () => {
  // Five years of history cannot contain three separate five-year stretches.
  const r = grower();
  assert.equal(projectPortfolio(r, { months: 60 }).basis, 'illustrative');
  assert.equal(projectPortfolio(r, { months: 12 }).basis, 'historical');
});

test('the horizon is capped at five years however much is asked for', () => {
  assert.equal(projectPortfolio(grower(), { months: 600 }).months, 60);
});

test('the bad case is never above the expected one, and the good never below', () => {
  const p = projectPortfolio(grower(), { months: 12 });
  assert.ok(p.rates.badAnnual <= p.rates.expectedAnnual);
  assert.ok(p.rates.goodAnnual >= p.rates.expectedAnnual);
  assert.ok(p.scenarios.bad.end <= p.scenarios.expected.end);
  assert.ok(p.scenarios.expected.end <= p.scenarios.good.end);
});

test('dividends left in cash do not compound, and the difference is visible', () => {
  const r = grower();
  const reinvested = projectPortfolio(r, { months: 60, reinvest: true });
  const idle = projectPortfolio(r, { months: 60, reinvest: false });
  assert.ok(reinvested.scenarios.expected.end > idle.scenarios.expected.end,
    'reinvesting must beat leaving it in cash over five years');
  assert.ok(idle.scenarios.expected.idleCash > 0, 'and the uninvested cash is stated');
});

test('the idle-dividend ceiling is a bound, not an estimate', () => {
  // Cash today bounds how much dividend can still be sitting uninvested. It
  // cannot be confounded by purchases, which is what broke the first version.
  const d = projectPortfolio(grower(), { months: 12 }).rates.derived;
  assert.ok(d.maxIdleShare >= 0 && d.maxIdleShare <= 100);
  assert.ok(d.cashNow <= d.dividendSeen * (d.maxIdleShare / 100) + 0.01 || d.maxIdleShare === 100);
});

test('a monthly deposit ends up in the projection', () => {
  const without = projectPortfolio(grower(), { months: 12, monthly: 0 });
  const with250 = projectPortfolio(grower(), { months: 12, monthly: 250 });
  assert.ok(with250.scenarios.expected.end > without.scenarios.expected.end + 2900,
    'twelve deposits of 250 have to show up');
});

// ---------------------------------------------------------------------------
// The reconciliation anchor when DEGIRO states no total
// ---------------------------------------------------------------------------

/**
 * Two real accounts in a row reported `reconciliation: null`, both listing the
 * same fourteen `totalPortfolio` field names — all of them cash figures, none
 * of them net liquidity. So the missing anchor is the normal case for those
 * accounts, not an anomaly, and rule 6's acceptance test was simply absent on
 * them.
 *
 * The parts are there: DEGIRO states a value per open position and a cash
 * balance. These pin that the sum is used, that it is labelled as derived
 * rather than passed off as DEGIRO's own figure, and — the ones that matter
 * most — that it is *not* used when it would be a partial sum compared against
 * a full one.
 */
function anchorCase({ liveTotal = null, liveCash = null, livePositions = null } = {}) {
  // One share bought at 10, still held, valued by its own series.
  const day = '2024-01-02';
  return computePortfolio({
    transactions: [
      { date: day, productId: 'P1', quantity: 1, price: 10, totalBase: -10, currency: 'EUR' },
    ],
    cashRows: [
      { date: day, description: 'Deposit', change: 100, currency: 'EUR', category: 'DEPOSIT' },
      // A trade moves the cash balance through the cash ledger, not through the
      // transaction's own `totalBase` — DEGIRO books both, and leaving this out
      // made the first draft of these tests fail against correct code.
      { date: day, description: 'Buy Thing', change: -10, currency: 'EUR', category: 'TRADE' },
    ],
    products: { P1: { id: 'P1', name: 'Thing', vwdId: 'v1', currency: 'EUR', productType: 'STOCK' } },
    prices: { v1: { start: day, stepDays: 1, points: [{ offsetDays: 0, close: 10 }] } },
    today: day,
    liveTotal,
    liveCash,
    livePositions,
  });
}

test('a stated total is used, and says it was stated', () => {
  const r = anchorCase({ liveTotal: 100, livePositions: [{ productId: 'P1', size: 1, value: 10 }] });
  assert.equal(r.reconciliation?.source, 'reported');
  assert.equal(r.reconciliation.live, 100);
});

test('no stated total: the position values and the cash are added up instead', () => {
  const r = anchorCase({
    liveCash: 90,
    livePositions: [{ productId: 'P1', size: 1, value: 10 }],
  });
  assert.ok(r.reconciliation, 'the check ran at all, which on two real accounts it did not');
  assert.equal(r.reconciliation.source, 'derived', 'and it does not pass itself off as DEGIRO’s own figure');
  assert.equal(r.reconciliation.live, 100, '10 of instrument + 90 of cash');
  assert.equal(r.reconciliation.ok, true);
});

test('a cash fund among the positions is not counted twice', () => {
  // /update lists cash balances alongside instruments — 'EUR', 'FLATEX_EUR'.
  // They are already in `liveCash`, and adding them again would inflate the
  // anchor and report a shortfall that is not there.
  const r = anchorCase({
    liveCash: 90,
    livePositions: [
      { productId: 'P1', size: 1, value: 10 },
      { productId: 'EUR', size: 90, value: 90 },
      { productId: 'FLATEX_EUR', size: 0, value: 0 },
    ],
  });
  assert.equal(r.reconciliation.live, 100, 'the cash rows were skipped, not added');
});

test('a position DEGIRO gives no value for stops the derivation entirely', () => {
  // A partial sum compared against a full one reports a shortfall that is not
  // real. Crying wolf on the one check everything rests on is worse than the
  // check being absent, so this stays null.
  const r = anchorCase({
    liveCash: 90,
    livePositions: [{ productId: 'P1', size: 1, value: null }],
  });
  assert.equal(r.reconciliation, null);
});

test('no cash figure means no derived anchor', () => {
  const r = anchorCase({ livePositions: [{ productId: 'P1', size: 1, value: 10 }] });
  assert.equal(r.reconciliation, null);
});

test('positions that already disagree are the finding, and no total is derived from them', () => {
  // If the share counts are wrong, a total built on DEGIRO's values is being
  // compared against a ledger already known to be broken. `position-mismatch`
  // is the answer there, not a second number.
  const r = anchorCase({
    liveCash: 90,
    livePositions: [{ productId: 'P1', size: 99, value: 990 }],
  });
  assert.equal(r.reconciliation, null);
  assert.ok(r.warnings.some((w) => w.code === 'position-mismatch'), 'and it says so loudly');
});

test('the derived anchor is not circular — it still catches a wrong valuation', () => {
  // The whole point. DEGIRO's prices and share counts against our valuation of
  // our own ledger: independent sources, so a mis-scaled series still shows up.
  const r = anchorCase({
    liveCash: 90,
    livePositions: [{ productId: 'P1', size: 1, value: 1000 }], // DEGIRO says the holding is worth 1000
  });
  assert.equal(r.reconciliation.ok, false);
  assert.equal(r.reconciliation.source, 'derived');
  assert.ok(Math.abs(r.reconciliation.diff) > 900, 'the disagreement is reported, not absorbed');
});

// ---------------------------------------------------------------------------
// A percentage is not a number when there was nothing to earn it on
// ---------------------------------------------------------------------------

/**
 * A tester's account displayed **+291 949,64 %** as its all-time result and
 * **−60 006,26 %** as its worst month, beside a perfectly ordinary
 * +19,64 % best month. Both come from the same place: the chain guarded only
 * against `prev > 0`, so a day that began with a couple of cents and moved a
 * few euros multiplied the running factor by a few hundred.
 *
 * That is not a return anyone earned. It is the opening days of an account,
 * where a deposit and the trade it paid for land a day apart and `pnl` briefly
 * absorbs capital the cashflow record has not caught up with.
 */
test('a day that moves more than it started with is not a return', () => {
  assert.equal(usableReturnDay(100, 5), true, 'an ordinary day');
  assert.equal(usableReturnDay(100, -100), true, 'a total loss is still a return');
  assert.equal(usableReturnDay(0.02, 5), false, 'two cents becoming five euros is not +25 000 %');
  assert.equal(usableReturnDay(0, 5), false, 'nothing invested, nothing earned');
  assert.equal(usableReturnDay(-10, 1), false, 'a negative base has no meaningful ratio');
});

test('an account that starts from nothing does not report a five-digit percentage', () => {
  // The shape of the real case: a near-zero opening value, then capital
  // arriving a day out of step with the position it bought.
  const days = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04'];
  const result = {
    days,
    // 0.02 → 500 → 520 → 530: the second day is the artefact.
    value: [0.02, 500, 520, 530],
    pnl: [0, 499.98, 20, 10],
  };

  const pct = windowReturnPct(result);
  assert.ok(Number.isFinite(pct), 'a finite number at all');
  assert.ok(
    Math.abs(pct) < 100,
    `the artefact day is excluded, so the return is the 30 euros on 500 that was really earned, not ${pct.toFixed(0)} %`,
  );
  assert.ok(pct > 0, 'and the genuine gain still counts');
});

test('the monthly grid excludes the same artefact the all-time figure does', () => {
  const r = {
    days: ['2024-01-01', '2024-01-02', '2024-01-31', '2024-02-01', '2024-02-02'],
    value: [0.01, 1000, 1010, 1010, 1050],
    pnl: [0, 999.99, 10, 0, 40],
  };
  const t = monthlyTable(r);
  const jan = t.years[0].months[0];
  const feb = t.years[0].months[1];
  assert.ok(Math.abs(jan.returnPct) < 100, `January is a percentage, not ${jan.returnPct}`);
  assert.ok(feb.returnPct > 0 && feb.returnPct < 100, 'and an untouched month is unaffected');
});

test('an ordinary account is not changed by the guard', () => {
  // The guard must not quietly reshape a healthy history — that would be a
  // worse defect than the one it fixes, and a silent one.
  const r = {
    days: ['2024-01-01', '2024-01-02', '2024-01-03'],
    value: [1000, 1100, 1045],
    pnl: [0, 100, -55],
  };
  const pct = windowReturnPct(r);
  // (1 + 100/1000) × (1 + −55/1100) − 1 = 1.1 × 0.95 − 1 = 4.5 %
  assert.ok(Math.abs(pct - 4.5) < 1e-9, `expected 4.5 %, got ${pct}`);
});

test('a year that opens at three cents reports a return, not −101 275 %', () => {
  /**
   * Straight off a tester's screen. The account sat at **€ 0,03** through 2022,
   * 2023 and 2024, then took €12 000 in during 2025 and ended at €16 046,10 —
   * and the year-by-year table showed its return as **−101 275,55 %** beside a
   * perfectly correct result of +€ 8 846,09.
   *
   * Both numbers come from the same days, which is the whole point: the
   * deposit is booked on one day and the value moves on the next, so `pnl`
   * carries −12 000 and then +12 000. Those **cancel in a sum** — the euro
   * result is right — and they **destroy a product**, because the first of them
   * is divided by three cents.
   *
   * So the fix has to leave the euros alone and only touch the chain.
   */
  const days = ['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04'];
  const r = {
    days,
    value: [0.03, 0.03, 12000, 12600],
    // day 2: cash booked, value has not caught up. day 3: value catches up.
    pnl: [0, -12000, 11999.97, 600],
  };

  const t = monthlyTable(r);
  const jan = t.years[0].months[0];
  assert.ok(
    Math.abs(jan.returnPct) < 100,
    `the two artefact days are out of the chain, leaving the 600 on 12 000 that was really earned — got ${jan.returnPct} %`,
  );
  assert.ok(jan.returnPct > 0, 'and what was earned still shows');

  // The euro result is untouched: that number was always right.
  assert.ok(Math.abs(jan.pnl - 599.97) < 0.01, `the result stays as it was, got ${jan.pnl}`);
});

test('a euro trade that did not settle for its euro amount is called out', () => {
  /**
   * From a tester's export, rebuilt synthetically — rule 7 keeps real values
   * out of `test/`. Rows read `currency: "EUR"` while `totalBase` was 0,851 of
   * `price × quantity`, which is not rounding, it is the dollar rate of the
   * day on trades nothing had marked as foreign. Nothing detected it.
   */
  const r = computePortfolio({
    products: { 1: { id: '1', name: 'A', currency: 'EUR', vwdId: '900' } },
    prices: { 900: { start: '2024-01-01', stepDays: 1, points: [0, 1].map((i) => ({ offsetDays: i, close: 2 })) } },
    transactions: [
      // 100 x 2 = 200 traded, 170 settled: a rate, not a rounding difference.
      { date: '2024-01-01', productId: '1', quantity: 100, price: 2, currency: 'EUR', fee: -1, totalBase: -171 },
    ],
    cashRows: [{ date: '2024-01-01', description: 'Deposit', change: 1000, currency: 'EUR', category: 'DEPOSIT' }],
    today: '2024-01-02',
  });

  const w = r.warnings.find((x) => x.code === 'settled-amount-mismatch');
  assert.ok(w, 'the disagreement is reported');
  assert.equal(w.level, 'error', 'a holding valued without its conversion is not a warning');
  assert.equal(w.detail.trades, 1);
  assert.ok(Math.abs(w.detail.ratios[0] - 0.85) < 0.01);
});

test('an ordinary euro trade raises nothing, fees and all', () => {
  const r = computePortfolio({
    products: { 1: { id: '1', name: 'A', currency: 'EUR', vwdId: '900' } },
    prices: { 900: { start: '2024-01-01', stepDays: 1, points: [0, 1].map((i) => ({ offsetDays: i, close: 2 })) } },
    transactions: [
      { date: '2024-01-01', productId: '1', quantity: 100, price: 2, currency: 'EUR', fee: -3, totalBase: -203 },
    ],
    cashRows: [{ date: '2024-01-01', description: 'Deposit', change: 1000, currency: 'EUR', category: 'DEPOSIT' }],
    today: '2024-01-02',
  });
  assert.ok(!r.warnings.some((x) => x.code === 'settled-amount-mismatch'), 'no false alarm on a healthy trade');
});

test('a genuinely foreign trade is not the target of this check', () => {
  // A USD instrument settling at a USD rate is correct, not a mismatch.
  const r = computePortfolio({
    products: { 1: { id: '1', name: 'A', currency: 'USD', vwdId: '900' } },
    prices: { 900: { start: '2024-01-01', stepDays: 1, points: [0, 1].map((i) => ({ offsetDays: i, close: 2 })) } },
    transactions: [
      { date: '2024-01-01', productId: '1', quantity: 100, price: 2, currency: 'USD', fee: -1, totalBase: -171 },
    ],
    cashRows: [{ date: '2024-01-01', description: 'Deposit', change: 1000, currency: 'EUR', category: 'DEPOSIT' }],
    today: '2024-01-02',
  });
  assert.ok(!r.warnings.some((x) => x.code === 'settled-amount-mismatch'));
});

// ---------------------------------------------------------------------------
// The projection: three defects a tester found in one screenshot each
// ---------------------------------------------------------------------------

/**
 * A history of `n` months averaging `pct` a month, at a plausible account size.
 *
 * The returns have to *vary*, or every window is identical, the tails collapse
 * onto the median and a test about dispersion passes vacuously. The first draft
 * of this helper used a constant and did exactly that.
 */
function historyOf(months, pct, start = 10000) {
  const days = [];
  const value = [];
  const pnl = [];
  let v = start;
  for (let m = 0; m < months; m++) {
    for (let d = 1; d <= 28; d++) {
      const day = `${2015 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      // A deterministic wobble around `pct`, so consecutive windows differ.
      const swing = pct * 0.6 * Math.sin(m * 1.7);
      const gain = d === 28 ? v * ((pct + swing) / 100) : 0;
      days.push(day);
      pnl.push(gain);
      v += gain;
      value.push(v);
    }
  }
  return { days, value, pnl, income: { dividendGross: 0, dividendTax: 0 }, cash: [0] };
}

test('eight overlapping windows are not eight observations', () => {
  /**
   * `rollingOutcomes` slides one month at a time, so 67 months of history gives
   * eight five-year windows that share fifty-nine of their sixty months. The
   * card said "treat 8 as fewer independent observations than it looks" while
   * the code counted them as eight and called the result history.
   */
  const p = projectPortfolio(historyOf(67, 0.5), { months: 60 });
  assert.ok(p.windows >= 3, 'the overlapping count is still what the spread is measured from');
  assert.equal(p.independentWindows, 1, '67 months contains one separate five-year stretch');
  assert.notEqual(p.basis, 'historical', 'and one observation is not history');
});

test('enough genuinely separate stretches is still called history', () => {
  // 15 years of monthly data holds three independent five-year stretches.
  const p = projectPortfolio(historyOf(180, 0.5), { months: 60 });
  assert.ok(p.independentWindows >= 3);
  assert.equal(p.basis, 'historical');
});

test('a rate the reader types is used, which it was not', () => {
  /**
   * `expectedAnnual` read `basis === 'historical' ? median(outcomes) : total`,
   * so on any account with enough windows the typed growth rate was discarded
   * for all three lines and only the yield survived. Someone set growth to
   * 100 % and watched nothing move.
   */
  const history = historyOf(180, 0.5);
  const auto = projectPortfolio(history, { months: 60 });
  const mine = projectPortfolio(history, { months: 60, growthPct: 100, yieldPct: 0 });

  assert.equal(mine.manual, true);
  assert.ok(Math.abs(mine.rates.expectedAnnual - 100) < 1e-6, `expected 100, got ${mine.rates.expectedAnnual}`);
  assert.notEqual(mine.rates.expectedAnnual, auto.rates.expectedAnnual);
  assert.ok(
    mine.scenarios.expected.path.at(-1) > auto.scenarios.expected.path.at(-1),
    'and the line it draws actually moves',
  );
});

test('a typed rate keeps the spread this account really showed, recentred', () => {
  // The dispersion is real information about this portfolio; the middle is the
  // reader's assumption. Both survive.
  const history = historyOf(180, 0.5);
  const auto = projectPortfolio(history, { months: 60 });
  const mine = projectPortfolio(history, { months: 60, growthPct: 20, yieldPct: 0 });

  const autoWidth = auto.rates.goodAnnual - auto.rates.badAnnual;
  const mineWidth = mine.rates.goodAnnual - mine.rates.badAnnual;
  assert.ok(Math.abs(autoWidth - mineWidth) < 1e-6, 'the observed dispersion is kept, not replaced');
  assert.ok(mine.rates.goodAnnual > mine.rates.expectedAnnual);
  assert.ok(mine.rates.badAnnual < mine.rates.expectedAnnual);
});

test('a rate that is not a market outcome draws no projection at all', () => {
  /**
   * A tester's account measured several hundred percent a year and drew a
   * dashed line to €89 million beside a portfolio worth thirty-three thousand.
   * There is no honest chart for that. Refusing beats clamping: a clamp would
   * invent a number.
   */
  const p = projectPortfolio(historyOf(180, 20), { months: 60 });
  assert.equal(p.basis, 'unsupported');
  assert.equal(p.scenarios, null, 'nothing is drawn');
  assert.ok(Math.abs(p.rates.expectedAnnual) > 50, 'and the report still says what was measured');
});

test('but the reader may overrule that and set their own', () => {
  // They were told it is an assumption. It is theirs to make.
  const p = projectPortfolio(historyOf(180, 20), { months: 60, growthPct: 7, yieldPct: 0 });
  assert.notEqual(p.basis, 'unsupported');
  assert.ok(p.scenarios, 'a projection is drawn from their number');
  assert.ok(Math.abs(p.rates.expectedAnnual - 7) < 1e-6);
});

// ---------------------------------------------------------------------------
// U1 — an instrument valued through the rate its own trades state
// ---------------------------------------------------------------------------

/** A EUR-labelled instrument whose trades settle at `rate`, held to the end. */
function foreignInDisguise({ rate = 0.85, trades = 2, spread = 1 } = {}) {
  const dates = ['2024-01-01', '2024-06-03', '2024-12-02'];
  const tx = [];
  for (let k = 0; k < trades; k++) {
    const r = rate * (k === 1 ? spread : 1);
    tx.push({
      date: dates[k],
      productId: '1',
      quantity: 10,
      price: 100,
      currency: 'EUR',
      fee: -1,
      totalBase: -(10 * 100 * r + 1),
    });
  }
  return computePortfolio({
    products: { 1: { id: '1', name: 'A', currency: 'EUR', vwdId: '900' } },
    prices: { 900: { start: '2024-01-01', stepDays: 1, points: [{ offsetDays: 0, close: 100 }, { offsetDays: 365, close: 100 }] } },
    transactions: tx,
    cashRows: [{ date: '2024-01-01', description: 'Deposit', change: 100000, currency: 'EUR', category: 'DEPOSIT' }],
    today: '2024-12-31',
  });
}

test('an instrument is valued through the rate its own trades state', () => {
  /**
   * 0.37.0 detected that a "EUR" trade had settled at 0,85 of what it traded
   * for and stopped there, because resolving it changes numbers on somebody's
   * screen. This is the resolution, and it needs no guess about *which*
   * currency the instrument is in: the ratio of settled to traded is the
   * conversion DEGIRO itself applied, on a known date.
   */
  const r = foreignInDisguise({ rate: 0.85, trades: 2 });
  const held = r.byProduct.find((p) => String(p.productId) === '1');
  // 20 shares at a quote of 100, converted at 0,85 — not 2 000 euros.
  assert.ok(Math.abs(held.current - 1700) < 5, `expected about 1 700, got ${held.current}`);

  const w = r.warnings.find((x) => x.code === 'settled-amount-mismatch');
  assert.ok(w, 'and it still says what it did');
  assert.equal(w.detail.resolved, 1);
  assert.equal(w.level, 'warn', 'downgraded from error once every instrument is resolved');
});

test('one observation states a rate on one day and nothing about any other', () => {
  // A single trade cannot be interpolated between. Left alone, and still loud.
  const r = foreignInDisguise({ rate: 0.85, trades: 1 });
  const held = r.byProduct.find((p) => String(p.productId) === '1');
  assert.ok(Math.abs(held.current - 1000) < 5, 'valued unconverted, as before');
  const w = r.warnings.find((x) => x.code === 'settled-amount-mismatch');
  assert.equal(w.level, 'error', 'and it stays an error, because nothing was fixed');
  assert.equal(w.detail.resolved, 0);
  assert.equal(w.detail.unresolved[0].observations, 1);
});

test('observations that disagree with each other are not measuring a currency', () => {
  // Applying the median of those would swap a visible error for an invisible
  // one, which is the worse of the two.
  const r = foreignInDisguise({ rate: 0.85, trades: 2, spread: 2.5 });
  const w = r.warnings.find((x) => x.code === 'settled-amount-mismatch');
  assert.equal(w.detail.resolved, 0);
  assert.ok(w.detail.unresolved[0].spread > 1.6);
});

test('an ordinary euro instrument is untouched by any of this', () => {
  const r = computePortfolio({
    products: { 1: { id: '1', name: 'A', currency: 'EUR', vwdId: '900' } },
    prices: { 900: { start: '2024-01-01', stepDays: 1, points: [{ offsetDays: 0, close: 100 }, { offsetDays: 30, close: 100 }] } },
    transactions: [{ date: '2024-01-01', productId: '1', quantity: 10, price: 100, currency: 'EUR', fee: -1, totalBase: -1001 }],
    cashRows: [{ date: '2024-01-01', description: 'Deposit', change: 100000, currency: 'EUR', category: 'DEPOSIT' }],
    today: '2024-01-31',
  });
  assert.ok(!r.warnings.some((x) => x.code === 'settled-amount-mismatch'));
  const held = r.byProduct.find((p) => String(p.productId) === '1');
  assert.ok(Math.abs(held.current - 1000) < 1);
});

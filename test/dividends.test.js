import test from 'node:test';
import assert from 'node:assert/strict';

import { perShareSeries, RECENT_TRADE_DAYS } from '../src/lib/dividends.js';
import { computePortfolio } from '../src/lib/engine.js';
import { CATEGORY } from '../src/lib/classify.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const near = (a, b, eps = 1e-9, msg) => assert.ok(Math.abs(a - b) <= eps, msg ?? `expected ${a} within ${eps} of ${b}`);

// ---------------------------------------------------------------------------
// Synthetic builders. Every value here is invented; nothing is copied from an
// account (rule 7). Product ids are short and prices round on purpose.
// ---------------------------------------------------------------------------

let seq = 0;
function buy(productId, date, quantity, price) {
  return { id: `t${++seq}`, date, productId, quantity, price, currency: 'EUR', fee: 0, totalBase: -quantity * price };
}
function sell(productId, date, quantity, price) {
  return { id: `t${++seq}`, date, productId, quantity: -quantity, price, currency: 'EUR', fee: 0, totalBase: quantity * price };
}
/** A gross dividend row: `amount` euros landed. */
function div(productId, date, amount) {
  return { id: `c${++seq}`, date, productId, description: 'Dividend', currency: 'EUR', change: amount, type: 'cash', category: CATEGORY.DIVIDEND };
}
/** A withholding row: `amount` euros taken (stored negative, as DEGIRO books it). */
function tax(productId, date, amount) {
  return { id: `c${++seq}`, date, productId, description: 'Dividendbelasting', currency: 'EUR', change: -Math.abs(amount), type: 'cash', category: CATEGORY.DIVIDEND_TAX };
}

/** A quarterly payer: 100 shares from 2022-01-10, €0.25/share, raised to €0.30 in 2023, cut to €0.20 in 2024. */
function quarterlyPayer(productId = 'Q') {
  const transactions = [buy(productId, '2022-01-10', 100, 40)];
  const cashRows = [];
  const perShare = { 2022: 0.25, 2023: 0.3, 2024: 0.2 };
  for (const year of [2022, 2023, 2024]) {
    for (const month of ['03', '06', '09', '12']) {
      cashRows.push(div(productId, `${year}-${month}-15`, perShare[year] * 100));
      cashRows.push(tax(productId, `${year}-${month}-15`, perShare[year] * 100 * 0.15));
    }
  }
  return { transactions, cashRows, perShare };
}

// ---------------------------------------------------------------------------
// US-121 perShareSeries
// ---------------------------------------------------------------------------

test('US-121: per-share gross and tax are the day total over the ledger quantity, in EUR per share', () => {
  const { transactions, cashRows } = quarterlyPayer();
  const s = perShareSeries(transactions, cashRows, { Q: { name: 'Quarterly NV' } });
  assert.equal(s.unit, 'EUR/share');
  const q = s.byProduct.Q;
  assert.equal(q.name, 'Quarterly NV');
  assert.equal(q.points.length, 12, 'one point per pay-date, gross and tax on the same date merged');
  near(q.points[0].grossPerShare, 0.25);
  near(q.points[0].taxPerShare, -0.0375, 1e-9, 'tax keeps the sign the data has');
  assert.equal(q.points[0].quantity, 100);
  assert.equal(q.points[0].gross, 25);
  near(q.points[4].grossPerShare, 0.3, 1e-9, 'the 2023 raise shows per share');
  near(q.points[8].grossPerShare, 0.2, 1e-9, 'the 2024 cut shows per share');
  assert.equal(s.undetermined.length, 0);
  assert.equal(q.heldFrom, '2022-01-10');
  assert.equal(q.heldTo, null, 'still held');
});

test('US-121: a position sold between ex-date and pay-date is undetermined, counted, and carries the amount', () => {
  const transactions = [buy('S', '2024-01-10', 100, 10), sell('S', '2024-03-10', 100, 11)];
  const cashRows = [div('S', '2024-03-15', 30), tax('S', '2024-03-15', 4.5)];
  const s = perShareSeries(transactions, cashRows);
  assert.equal(s.byProduct.S, undefined, 'no point can be formed');
  assert.equal(s.undetermined.length, 2, 'gross and tax each counted');
  assert.deepEqual(s.undetermined[0], { date: '2024-03-15', productId: 'S', category: CATEGORY.DIVIDEND, amount: 30, reason: 'no-position-on-pay-date' });
  assert.equal(s.undetermined[1].amount, -4.5);
  assert.equal(s.undetermined[1].reason, 'no-position-on-pay-date');
});

test('US-121: a row without a product is undetermined with its own reason', () => {
  const s = perShareSeries([buy('A', '2024-01-01', 10, 1)], [div(null, '2024-02-01', 5), div('', '2024-02-02', 6)]);
  assert.equal(s.undetermined.length, 2);
  assert.equal(s.undetermined[0].reason, 'no-product');
  assert.equal(s.undetermined[0].productId, null);
  assert.equal(s.undetermined[1].reason, 'no-product');
});

test('US-121: a reversal (non-positive gross) is undetermined, not a negative payment', () => {
  const s = perShareSeries([buy('R', '2024-01-01', 10, 1)], [div('R', '2024-02-01', 5), div('R', '2024-02-20', -5)]);
  assert.equal(s.byProduct.R.points.length, 1);
  assert.equal(s.undetermined.length, 1);
  assert.equal(s.undetermined[0].reason, 'non-positive-amount');
  assert.equal(s.undetermined[0].amount, -5);
});

test('US-121: a tax row a day after its gross row yields two points, no pairing assumed', () => {
  const s = perShareSeries([buy('T', '2024-01-01', 50, 1)], [div('T', '2024-02-01', 10), tax('T', '2024-02-02', 1.5)]);
  const pts = s.byProduct.T.points;
  assert.equal(pts.length, 2);
  assert.equal(pts[0].grossPerShare, 0.2);
  assert.equal(pts[0].taxPerShare, null);
  assert.equal(pts[1].grossPerShare, null);
  near(pts[1].taxPerShare, -0.03);
  assert.equal(s.undetermined.length, 0, 'an unpaired tax row is a fact, not a gap');
});

test('US-121: two gross rows on one day are one payment', () => {
  const s = perShareSeries([buy('D', '2024-01-01', 10, 1)], [div('D', '2024-02-01', 3), div('D', '2024-02-01', 2)]);
  assert.equal(s.byProduct.D.points.length, 1);
  assert.equal(s.byProduct.D.points[0].gross, 5);
  assert.equal(s.byProduct.D.points[0].grossPerShare, 0.5);
});

test(`US-121: a trade within ${RECENT_TRADE_DAYS} days up to the pay-date flags the point, one day further does not`, () => {
  const transactions = [buy('F', '2023-01-01', 100, 1), buy('F', '2024-02-14', 100, 1)];
  const cashRows = [div('F', '2024-03-15', 40), div('F', '2024-06-15', 40)];
  const s = perShareSeries(transactions, cashRows);
  const [march, june] = s.byProduct.F.points;
  assert.equal(march.quantity, 200);
  assert.equal(march.quantityChangedRecently, true, '30 days before 2024-03-15 is 2024-02-14, inclusive');
  assert.equal(june.quantityChangedRecently, false);

  const s2 = perShareSeries([buy('F', '2023-01-01', 100, 1), buy('F', '2024-02-13', 100, 1)], [div('F', '2024-03-15', 40)]);
  assert.equal(s2.byProduct.F.points[0].quantityChangedRecently, false, '31 days before is outside the window');

  const s3 = perShareSeries([buy('F', '2023-01-01', 100, 1), buy('F', '2024-03-15', 100, 1)], [div('F', '2024-03-15', 40)]);
  assert.equal(s3.byProduct.F.points[0].quantityChangedRecently, true, 'a trade on the pay-date itself counts');
  assert.equal(s3.byProduct.F.points[0].quantity, 200, 'and the quantity includes it, as the ledger does');
});

test('US-121: a numeric productId on the transactions still meets a string id on the cash rows', () => {
  const s = perShareSeries([buy(7, '2024-01-01', 10, 1)], [div('7', '2024-02-01', 2)]);
  assert.equal(s.byProduct['7'].points[0].grossPerShare, 0.2);
});

test('US-121: heldTo is the first day at zero after a full sale', () => {
  const transactions = [buy('H', '2024-01-01', 10, 1), sell('H', '2024-05-01', 10, 1)];
  const s = perShareSeries(transactions, [div('H', '2024-03-01', 1), div('H', '2024-06-01', 1)]);
  assert.equal(s.byProduct.H.heldFrom, '2024-01-01');
  assert.equal(s.byProduct.H.heldTo, '2024-05-01');
  assert.equal(s.undetermined.length, 1, 'the June payment fell on a closed position');
});

test('US-121: no dividend rows at all is an empty series, not an error', () => {
  const s = perShareSeries([buy('E', '2024-01-01', 1, 1)], []);
  assert.deepEqual(s, { unit: 'EUR/share', byProduct: {}, undetermined: [] });
});

// ---------------------------------------------------------------------------
// The guardrail: per-share × quantity, plus what was undetermined, sums back
// to the engine's own dividendGross and dividendTax per product to the cent.
// Two measurements of the same money must not disagree.
// ---------------------------------------------------------------------------

test('US-121 guardrail: points plus undetermined equal computePortfolio dividendGross/dividendTax per product', () => {
  const q = quarterlyPayer('Q');
  // A second product with a partial sale, a same-day trade, a sold-out
  // position that still received a payment, and an unpaired tax row.
  const transactions = [
    ...q.transactions,
    buy('P', '2022-02-01', 30, 20),
    sell('P', '2023-05-05', 10, 22),
    buy('P', '2023-08-15', 5, 21),
    sell('P', '2024-02-01', 25, 23),
  ];
  const cashRows = [
    ...q.cashRows,
    div('P', '2022-08-15', 12.34), tax('P', '2022-08-15', 1.85),
    div('P', '2023-08-15', 13.37), tax('P', '2023-08-16', 2.01),
    div('P', '2024-02-10', 9.99), tax('P', '2024-02-10', 1.5), // after the full sale: undetermined
  ];
  const today = '2024-12-31';
  const result = computePortfolio({ transactions, cashRows, products: {}, prices: {}, today });
  const series = perShareSeries(transactions, cashRows);

  for (const p of result.byProduct) {
    const id = String(p.productId);
    const pts = series.byProduct[id]?.points ?? [];
    const und = series.undetermined.filter((u) => u.productId === id);
    const gross = pts.reduce((k, x) => k + (x.grossPerShare === null ? 0 : x.grossPerShare * x.quantity), 0)
      + und.filter((u) => u.category === CATEGORY.DIVIDEND).reduce((k, u) => k + u.amount, 0);
    const taxSum = pts.reduce((k, x) => k + (x.taxPerShare === null ? 0 : x.taxPerShare * x.quantity), 0)
      + und.filter((u) => u.category === CATEGORY.DIVIDEND_TAX).reduce((k, u) => k + u.amount, 0);
    assert.equal(round2(gross), p.dividendGross, `${id}: gross`);
    assert.equal(round2(taxSum), p.dividendTax, `${id}: tax`);
  }
  assert.equal(series.undetermined.length, 2, 'the two rows on the sold-out position are counted, not lost');
  assert.equal(series.byProduct.P.points.length, 3, 'two pay-dates while held, the second tax landing a day late');
});

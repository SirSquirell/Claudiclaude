import test from 'node:test';
import assert from 'node:assert/strict';

import { perShareSeries, RECENT_TRADE_DAYS, detectRhythm, classifyPayments, changes, forwardIncome, yields, trackRecord } from '../src/lib/dividends.js';
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

// ---------------------------------------------------------------------------
// US-124 detectRhythm
// ---------------------------------------------------------------------------

const dated = (...dates) => dates.map((date) => ({ date }));

test('US-124: monthly, quarterly, semi-annual and annual payers are detected with confidence 1', () => {
  const monthly = dated('2024-01-15', '2024-02-15', '2024-03-15', '2024-04-15', '2024-05-15');
  const quarterly = dated('2023-03-15', '2023-06-15', '2023-09-15', '2023-12-15', '2024-03-15');
  const semi = dated('2022-05-10', '2022-11-10', '2023-05-10', '2023-11-10');
  const annual = dated('2021-06-01', '2022-06-01', '2023-06-01');
  for (const [pts, rhythm, perYear] of [[monthly, 'monthly'], [quarterly, 'quarterly'], [semi, 'semiannual'], [annual, 'annual']]) {
    const r = detectRhythm(pts);
    assert.equal(r.rhythm, rhythm);
    assert.equal(r.confidence, 1);
    assert.ok(r.intervalDays > 0);
    assert.equal(r.reason, null);
  }
});

test('US-124: a quarterly payer that skipped one quarter is still quarterly, with the confidence it earned', () => {
  const r = detectRhythm(dated('2023-03-15', '2023-06-15', '2023-12-15', '2024-03-15'));
  assert.equal(r.rhythm, 'quarterly');
  near(r.confidence, 2 / 3);
  assert.deepEqual(r.gaps, [92, 183, 91]);
});

test('US-124: fewer than three points, or gaps that disagree, is irregular — an answer, not a guess', () => {
  assert.equal(detectRhythm(dated('2024-01-01', '2024-04-01')).rhythm, 'irregular');
  assert.equal(detectRhythm(dated('2024-01-01', '2024-04-01')).reason, 'too-few-points');
  assert.equal(detectRhythm([]).rhythm, 'irregular');
  // Fifty-day gaps: between the monthly and the quarterly bucket, in neither.
  const split = detectRhythm(dated('2020-01-01', '2020-02-20', '2020-04-10', '2020-05-30'));
  assert.equal(split.rhythm, 'irregular');
  assert.equal(split.reason, 'gap-outside-buckets');
  // Two quarterly gaps, two annual gaps: the median (228 days) falls in the
  // semi-annual bucket and no gap agrees with it.
  const straddle = detectRhythm(dated('2020-01-01', '2020-04-01', '2020-07-01', '2021-07-01', '2022-07-01'));
  assert.equal(straddle.rhythm, 'irregular');
  assert.equal(straddle.reason, 'gaps-disagree');
  // Three gaps in three buckets: nothing to agree with.
  const mixed = detectRhythm(dated('2020-01-01', '2020-02-01', '2020-05-01', '2021-05-01'));
  assert.equal(mixed.rhythm, 'irregular');
  assert.equal(mixed.reason, 'gaps-disagree');
  assert.equal(mixed.intervalDays, null);
});

test('US-124: order of the input does not matter', () => {
  const r = detectRhythm(dated('2024-03-15', '2023-03-15', '2023-09-15', '2023-06-15', '2023-12-15'));
  assert.equal(r.rhythm, 'quarterly');
});

// ---------------------------------------------------------------------------
// US-125 classifyPayments
// ---------------------------------------------------------------------------

test('US-125: a triple-size payment between two quarters is special by amount, and the regular ones stay regular', () => {
  const { transactions, cashRows } = quarterlyPayer('Q');
  cashRows.push(div('Q', '2023-07-20', 0.9 * 100)); // 0.90/share, three times the 0.30 regular
  const c = classifyPayments(perShareSeries(transactions, cashRows));
  assert.equal(c.classified, true);
  const q = c.byProduct.Q;
  const special = q.points.filter((p) => p.label === 'special');
  assert.equal(special.length, 1);
  assert.equal(special[0].date, '2023-07-20');
  assert.equal(special[0].rule, 'amount');
  near(special[0].deviationPct, 260, 1e-6, 'the trailing-24-month median of the others is 0.25: four 2022 payments, two 2023');
  assert.ok(special[0].comparedAgainst >= 2);
  assert.equal(q.points.filter((p) => p.label === 'regular').length, 12);
  assert.equal(q.rhythm.rhythm, 'quarterly', 'the rhythm is read off the regular payments only');
  assert.equal(q.rhythm.confidence, 1);
});

test('US-125: an extra payment of the regular size inside a quarter is special by rhythm', () => {
  const { transactions, cashRows } = quarterlyPayer('Q');
  cashRows.push(div('Q', '2023-07-20', 0.3 * 100)); // same amount, 35 days after the June payment
  const c = classifyPayments(perShareSeries(transactions, cashRows));
  const p = c.byProduct.Q.points.find((x) => x.date === '2023-07-20');
  assert.equal(p.label, 'special');
  assert.equal(p.rule, 'off-rhythm');
  assert.equal(c.byProduct.Q.rhythm.rhythm, 'quarterly');
});

test('US-125: the 2024 cut (0.30 → 0.20, 33 %) and the 2023 raise (0.25 → 0.30) are not specials', () => {
  const { transactions, cashRows } = quarterlyPayer('Q');
  const c = classifyPayments(perShareSeries(transactions, cashRows));
  assert.ok(c.byProduct.Q.points.every((p) => p.label === 'regular'));
});

test('US-125: an interim/final payer\'s larger final has a yearly twin and is regular', () => {
  const transactions = [buy('IF', '2020-01-02', 100, 10)];
  const cashRows = [];
  for (const y of [2020, 2021, 2022, 2023]) {
    cashRows.push(div('IF', `${y}-05-10`, 40)); // interim 0.40
    cashRows.push(div('IF', `${y}-09-10`, 80)); // final 0.80, +100 % against a 0.40 median
  }
  const c = classifyPayments(perShareSeries(transactions, cashRows));
  const pts = c.byProduct.IF.points;
  assert.ok(pts.every((p) => p.label === 'regular'), JSON.stringify(pts.map((p) => [p.date, p.label, p.rule])));
  assert.equal(pts[1].comparedAgainst, 1, 'the first final has one earlier payment — too few for the amount rule');
  assert.equal(pts[1].rule, null);
  assert.equal(c.byProduct.IF.rhythm.rhythm, 'irregular', '4-month and 8-month gaps alternate: no single bucket');
});

test('US-125: the first payments carry comparedAgainst below the minimum, so a UI can show the label is a default', () => {
  const { transactions, cashRows } = quarterlyPayer('Q');
  const c = classifyPayments(perShareSeries(transactions, cashRows));
  const [first, second, third] = c.byProduct.Q.points;
  assert.equal(first.comparedAgainst, 0);
  assert.equal(second.comparedAgainst, 1);
  assert.equal(third.comparedAgainst, 2);
  assert.equal(first.deviationPct, null);
  assert.equal(third.rule, null);
  assert.equal(typeof third.deviationPct, 'number');
});

test('US-125: a tax-only point has no label and does not enter the rhythm', () => {
  const s = perShareSeries([buy('T', '2024-01-01', 50, 1)], [div('T', '2024-02-01', 10), tax('T', '2024-02-02', 1.5)]);
  const c = classifyPayments(s);
  assert.equal(c.byProduct.T.points[1].label, null);
  assert.equal(c.byProduct.T.points[0].label, 'regular');
});

test('US-125: classifying twice changes nothing', () => {
  const { transactions, cashRows } = quarterlyPayer('Q');
  cashRows.push(div('Q', '2023-07-20', 90));
  const once = classifyPayments(perShareSeries(transactions, cashRows));
  assert.deepEqual(classifyPayments(once), once);
});

test('US-125 property: classification is trailing — a later payment never relabels an earlier one', () => {
  const { transactions, cashRows } = quarterlyPayer('Q');
  cashRows.push(div('Q', '2023-07-20', 90));
  cashRows.push(div('Q', '2024-07-20', 30));
  cashRows.sort((a, b) => (a.date < b.date ? -1 : 1));
  const full = classifyPayments(perShareSeries(transactions, cashRows)).byProduct.Q.points;
  for (let k = 1; k <= cashRows.length; k++) {
    const prefix = classifyPayments(perShareSeries(transactions, cashRows.slice(0, k))).byProduct.Q?.points ?? [];
    for (let i = 0; i < prefix.length; i++) {
      assert.equal(prefix[i].label, full[i].label, `${prefix[i].date} label with ${k} rows`);
      assert.equal(prefix[i].rule, full[i].rule, `${prefix[i].date} rule with ${k} rows`);
    }
  }
});

// ---------------------------------------------------------------------------
// US-122 changes
// ---------------------------------------------------------------------------

test('US-122: a quarterly payer with one raise and one cut — labels and percentages against the payment a year earlier', () => {
  const { transactions, cashRows } = quarterlyPayer('Q');
  const ch = changes(perShareSeries(transactions, cashRows), '2024-12-31');
  assert.equal(ch.unit, 'EUR/share');
  const pay = ch.byProduct.Q.payments;
  assert.equal(pay.length, 12);
  assert.deepEqual(pay.slice(0, 4).map((p) => p.label), ['new', 'new', 'new', 'new'], 'the first year has nothing to compare with');
  for (const p of pay.slice(4, 8)) {
    assert.equal(p.label, 'raised');
    near(p.pct, 20, 1e-9);
    assert.equal(p.comparedTo.date, p.date.replace('2023', '2022'));
    near(p.comparedTo.grossPerShare, 0.25);
  }
  for (const p of pay.slice(8)) {
    assert.equal(p.label, 'cut');
    near(p.pct, -33.3333333333, 1e-6);
  }
  assert.equal(ch.byProduct.Q.stopped, null, 'the last payment was 16 days ago');
});

test('US-122: the same amount a year later is unchanged, and a change inside the tolerance too', () => {
  const transactions = [buy('U', '2022-01-01', 100, 1)];
  const cashRows = [div('U', '2022-06-01', 50), div('U', '2023-06-01', 50), div('U', '2024-06-01', 50.4)];
  const pay = changes(perShareSeries(transactions, cashRows), '2024-12-31').byProduct.U.payments;
  assert.equal(pay[1].label, 'unchanged');
  assert.equal(pay[1].pct, 0);
  assert.equal(pay[2].label, 'unchanged', '+0,8 % is inside the 1 % tolerance');
});

test('US-122: earlier history but nothing 11 to 13 months back is null with a reason, never "new" or "unchanged"', () => {
  const transactions = [buy('G', '2020-01-01', 100, 1)];
  const cashRows = [div('G', '2020-06-01', 50), div('G', '2020-12-01', 50), div('G', '2022-06-01', 50)];
  const pay = changes(perShareSeries(transactions, cashRows), '2022-12-31').byProduct.G.payments;
  assert.equal(pay[2].label, null);
  assert.equal(pay[2].reason, 'no-payment-11-13-months-earlier');
  assert.equal(pay[1].label, 'new', 'six months after the first payment the stream is still younger than a year');
});

test('US-122: specials are not compared and do not serve as a comparison', () => {
  const { transactions, cashRows } = quarterlyPayer('Q');
  cashRows.push(div('Q', '2023-07-20', 90));
  const pay = changes(perShareSeries(transactions, cashRows), '2024-12-31').byProduct.Q.payments;
  assert.equal(pay.length, 12, 'twelve regular payments, the special is absent');
  assert.ok(pay.every((p) => p.date !== '2023-07-20'));
  const jun24 = pay.find((p) => p.date === '2024-06-15');
  assert.equal(jun24.comparedTo.date, '2023-06-15');
});

test('US-122: a stream is stopped once the next payment is 1.5 intervals overdue, and not before', () => {
  const { transactions, cashRows } = quarterlyPayer('Q');
  const s = perShareSeries(transactions, cashRows);
  assert.equal(changes(s, '2025-03-20').byProduct.Q.stopped, null, '95 days after 2024-12-15 is one late quarter, not a stop');
  const stopped = changes(s, '2025-06-01').byProduct.Q.stopped;
  assert.ok(stopped, '168 days: the following payment is due too');
  assert.equal(stopped.lastDate, '2024-12-15');
  assert.equal(stopped.expectedBy, '2025-05-01', '2024-12-15 plus 137 days, 1.5 quarters');
  assert.equal(stopped.overdueDays, 31);
  assert.equal(stopped.rhythm, 'quarterly');
});

test('US-122: an irregular payer is never called stopped — nothing predicts its next payment', () => {
  const transactions = [buy('I', '2020-01-01', 100, 1)];
  const cashRows = [div('I', '2020-02-01', 10), div('I', '2020-03-01', 10), div('I', '2020-09-01', 10), div('I', '2021-09-01', 10)];
  assert.equal(changes(perShareSeries(transactions, cashRows), '2026-01-01').byProduct.I.stopped, null);
});

test('US-122 property: today moving forward never changes a past label; only stopped may appear', () => {
  const { transactions, cashRows } = quarterlyPayer('Q');
  cashRows.push(div('Q', '2023-07-20', 90));
  const s = perShareSeries(transactions, cashRows);
  const base = changes(s, '2024-12-16').byProduct.Q.payments;
  let sawStopped = false;
  for (const today of ['2025-01-01', '2025-03-15', '2025-06-01', '2026-01-01', '2030-12-31']) {
    const r = changes(s, today).byProduct.Q;
    assert.deepEqual(r.payments, base, `labels identical with today = ${today}`);
    if (r.stopped) sawStopped = true;
  }
  assert.ok(sawStopped);
});

// ---------------------------------------------------------------------------
// US-123 forwardIncome
// ---------------------------------------------------------------------------

test('US-123: a quarterly payer — the last four regular per-share payments times today\'s quantity', () => {
  const { transactions, cashRows } = quarterlyPayer('Q');
  const s = perShareSeries(transactions, cashRows);
  const end23 = forwardIncome(s, { Q: 100 }, '2023-12-31');
  assert.equal(end23.unit, 'EUR');
  assert.equal(end23.byProduct.length, 1);
  const q = end23.byProduct[0];
  near(q.perShareAnnual, 1.2, 1e-9, 'four raised quarters of 0.30');
  near(q.income, 120, 1e-9);
  assert.equal(q.rhythm, 'quarterly');
  assert.equal(q.expectedPerYear, 4);
  assert.equal(q.paymentsInWindow, 4);
  assert.equal(q.trimmed, false);
  assert.deepEqual(q.payments, ['2023-03-15', '2023-06-15', '2023-09-15', '2023-12-15']);
  near(end23.total, 120, 1e-9);
  assert.equal(end23.determinedCount, 1);
  assert.equal(end23.undeterminedCount, 0);

  // Mid-2023: two old quarters and two raised ones.
  const mid23 = forwardIncome(s, { Q: 100 }, '2023-08-01');
  near(mid23.byProduct[0].perShareAnnual, 1.1, 1e-9);
  // A different holding today scales the figure; the per-share rate does not move.
  near(forwardIncome(s, { Q: 250 }, '2023-12-31').total, 300, 1e-9);
});

test('US-123: a special in the window must not enter the figure, and is listed as excluded', () => {
  const { transactions, cashRows } = quarterlyPayer('Q');
  cashRows.push(div('Q', '2023-07-20', 90));
  const r = forwardIncome(perShareSeries(transactions, cashRows), { Q: 100 }, '2023-12-31');
  near(r.total, 120, 1e-9);
  assert.deepEqual(r.byProduct[0].excluded, [{ date: '2023-07-20', grossPerShare: 0.9, rule: 'amount' }]);
});

test('US-123: an annual payer with one payment is undetermined — no rhythm can be read from one point', () => {
  const r = forwardIncome(perShareSeries([buy('A', '2024-01-01', 10, 1)], [div('A', '2024-06-01', 5)]), { A: 10 }, '2024-12-31');
  assert.equal(r.byProduct.length, 0);
  assert.equal(r.total, 0);
  assert.equal(r.undeterminedCount, 1);
  assert.equal(r.undetermined[0].productId, 'A');
  assert.equal(r.undetermined[0].reason, 'irregular-rhythm');
  assert.equal(r.undetermined[0].detail.rhythmReason, 'too-few-points');
});

test('US-123: an annual payer with three payments is determined at one payment per year', () => {
  const tx = [buy('A', '2021-01-01', 10, 1)];
  const rows = [div('A', '2021-06-01', 5), div('A', '2022-06-01', 6), div('A', '2023-06-01', 7)];
  const r = forwardIncome(perShareSeries(tx, rows), { A: 10 }, '2023-12-31');
  near(r.total, 7, 1e-9, 'the latest 0.70 per share times ten');
  assert.equal(r.byProduct[0].expectedPerYear, 1);
});

test('US-123: a closed position is listed under closed, neither projected nor undetermined', () => {
  const { transactions, cashRows } = quarterlyPayer('Q');
  const r = forwardIncome(perShareSeries(transactions, cashRows), { Q: 0 }, '2024-12-31');
  assert.deepEqual(r.closed, ['Q']);
  assert.equal(r.undeterminedCount, 0);
  assert.equal(r.total, 0);
  const missing = forwardIncome(perShareSeries(transactions, cashRows), {}, '2024-12-31');
  assert.deepEqual(missing.closed, ['Q'], 'a product absent from the quantities is not held');
});

test('US-123: a stopped stream is undetermined, not projected from stale payments', () => {
  const { transactions, cashRows } = quarterlyPayer('Q');
  const r = forwardIncome(perShareSeries(transactions, cashRows), { Q: 100 }, '2025-06-01');
  assert.equal(r.undetermined[0].reason, 'stopped');
  assert.equal(r.undetermined[0].detail.lastDate, '2024-12-15');
});

test('US-123: pay-date drift — five in a strict year are trimmed to four, three are rescued by half an interval', () => {
  const tx = [buy('D', '2022-01-01', 10, 1)];
  // Regular quarterlies whose December payment slid from the 20th to the 10th.
  const rows = [
    div('D', '2022-12-20', 1), div('D', '2023-03-15', 1), div('D', '2023-06-15', 1), div('D', '2023-09-15', 1), div('D', '2023-12-10', 1),
  ];
  const s = perShareSeries(tx, rows);
  const five = forwardIncome(s, { D: 10 }, '2023-12-19');
  assert.equal(five.byProduct[0].paymentsInWindow, 4);
  assert.equal(five.byProduct[0].trimmed, true);
  assert.deepEqual(five.byProduct[0].payments.at(-1), '2023-12-10');
  near(five.total, 4, 1e-9);

  // Without the December payment, the strict window (2022-12-25, 2023-12-25]
  // holds three; stretched back by half a quarter it reaches 2022-12-20.
  const short = forwardIncome(perShareSeries(tx, rows.slice(0, 4)), { D: 10 }, '2023-12-25');
  assert.equal(short.byProduct.length, 1);
  assert.equal(short.byProduct[0].paymentsInWindow, 4);
  assert.equal(short.byProduct[0].trimmed, false);
});

test('US-123: too few payments even after the tolerance is incomplete-cycle, with the counts', () => {
  // A quarterly stream younger than a year: three payments, rhythm readable,
  // but not one full cycle of them yet.
  const tx = [buy('D', '2024-01-01', 10, 1)];
  const rows = [div('D', '2024-03-15', 1), div('D', '2024-06-15', 1), div('D', '2024-09-15', 1)];
  const r = forwardIncome(perShareSeries(tx, rows), { D: 10 }, '2024-10-01');
  assert.equal(r.undetermined[0].reason, 'incomplete-cycle');
  assert.equal(r.undetermined[0].detail.paymentsInWindow, 3);
  assert.equal(r.undetermined[0].detail.expectedPerYear, 4);
});

test('US-123: the total is the sum of the determined rows, and says how many were not', () => {
  const q = quarterlyPayer('Q');
  const tx = [...q.transactions, buy('A', '2024-01-01', 10, 1)];
  const rows = [...q.cashRows, div('A', '2024-06-01', 5)];
  const r = forwardIncome(perShareSeries(tx, rows), { Q: 100, A: 10 }, '2024-12-31');
  near(r.total, 80, 1e-9, 'four 0.20 quarters on 100 shares; A is undetermined and not in the total');
  assert.equal(r.determinedCount, 1);
  assert.equal(r.undeterminedCount, 1);
});

// ---------------------------------------------------------------------------
// US-126 yields
// ---------------------------------------------------------------------------

/** A hand-built position in the shape of computePortfolio's byProduct entries. */
const position = (productId, bought, boughtQty, quantity, current) => ({ productId, bought, boughtQty, qty: [0, quantity], current });

test('US-126: yield on cost and current yield for a quarterly payer, from trailing gross received', () => {
  const { transactions, cashRows } = quarterlyPayer('Q');
  const y = yields(perShareSeries(transactions, cashRows), [position('Q', 4000, 100, 100, 5000)], '2024-12-31');
  assert.equal(y.unit, 'EUR');
  assert.equal(y.windowFrom, '2023-12-31');
  const q = y.byProduct[0];
  near(q.received, 80, 1e-9, 'four 2024 payments of 0.20 on 100 shares');
  assert.equal(q.paymentsInWindow, 4);
  assert.equal(q.specialsInWindow, 0);
  assert.equal(q.cost, 4000);
  near(q.yieldOnCostPct, 2, 1e-9);
  near(q.currentYieldPct, 1.6, 1e-9);
  assert.deepEqual(q.reasons, { yieldOnCost: null, currentYield: null });
});

test('US-126: received is what landed — a special counts and is reported as such', () => {
  const { transactions, cashRows } = quarterlyPayer('Q');
  cashRows.push(div('Q', '2024-07-20', 60));
  const q = yields(perShareSeries(transactions, cashRows), [position('Q', 4000, 100, 100, 5000)], '2024-12-31').byProduct[0];
  near(q.received, 140, 1e-9);
  assert.equal(q.specialsInWindow, 1);
  near(q.yieldOnCostPct, 3.5, 1e-9);
});

test('US-126: cost is the average buy price times the shares held today, after a partial sale', () => {
  const { transactions, cashRows } = quarterlyPayer('Q');
  const q = yields(perShareSeries(transactions, cashRows), [position('Q', 4000, 100, 50, 2500)], '2024-12-31').byProduct[0];
  assert.equal(q.cost, 2000);
  near(q.yieldOnCostPct, 4, 1e-9, 'the same 80 received over half the cost');
});

test('US-126: null with a reason — closed, no payments, no cost basis, no current value — never 0 %', () => {
  const { transactions, cashRows } = quarterlyPayer('Q');
  const s = perShareSeries(transactions, cashRows);
  const closed = yields(s, [position('Q', 4000, 100, 0, 0)], '2024-12-31').byProduct[0];
  assert.equal(closed.yieldOnCostPct, null);
  assert.deepEqual(closed.reasons, { yieldOnCost: 'closed', currentYield: 'closed' });

  const none = yields(s, [position('Q', 4000, 100, 100, 5000)], '2022-02-01').byProduct[0];
  assert.deepEqual(none.reasons, { yieldOnCost: 'no-payments', currentYield: 'no-payments' });
  assert.equal(none.received, 0);

  const noCost = yields(s, [position('Q', 0, 0, 100, 5000)], '2024-12-31').byProduct[0];
  assert.equal(noCost.yieldOnCostPct, null);
  assert.equal(noCost.reasons.yieldOnCost, 'no-cost-basis');
  near(noCost.currentYieldPct, 1.6, 1e-9, 'the other figure still stands');

  const noValue = yields(s, [position('Q', 4000, 100, 100, 0)], '2024-12-31').byProduct[0];
  assert.equal(noValue.currentYieldPct, null);
  assert.equal(noValue.reasons.currentYield, 'no-current-value');
  near(noValue.yieldOnCostPct, 2, 1e-9);

  const never = yields(s, [position('Z', 100, 10, 10, 120)], '2024-12-31').byProduct[0];
  assert.equal(never.reasons.yieldOnCost, 'no-payments', 'a position that never paid is a row, not an omission');
});

test('US-126: computePortfolio\'s byProduct entries are accepted as positions unchanged', () => {
  const { transactions, cashRows } = quarterlyPayer('Q');
  const today = '2024-12-31';
  const result = computePortfolio({ transactions, cashRows, products: {}, prices: {}, today });
  const y = yields(perShareSeries(transactions, cashRows), result.byProduct, today);
  const q = y.byProduct.find((r) => r.productId === 'Q');
  assert.equal(q.quantity, 100);
  assert.equal(q.cost, 4000);
  assert.equal(q.current, result.byProduct[0].current, 'the engine values an unpriced position at its last trade');
  near(q.yieldOnCostPct, 2, 1e-9);
  near(q.currentYieldPct, 80 / result.byProduct[0].current * 100, 1e-9);
});

// ---------------------------------------------------------------------------
// US-127 trackRecord
// ---------------------------------------------------------------------------

test('US-127: the quarterly payer — years, raises, cuts, largest cut and CAGR over the complete years, by hand', () => {
  const { transactions, cashRows } = quarterlyPayer('Q');
  const tr = trackRecord(perShareSeries(transactions, cashRows), '2025-01-15');
  assert.equal(tr.unit, 'EUR/share');
  assert.equal(tr.boundedByWindow, true);
  const q = tr.byProduct[0];
  assert.equal(q.productId, 'Q');
  assert.equal(q.heldFrom, '2022-01-10');
  assert.equal(q.heldTo, null);
  assert.equal(q.firstPayment, '2022-03-15');
  assert.equal(q.lastPayment, '2024-12-15');
  assert.equal(q.regularPayments, 12);
  assert.equal(q.rhythm, 'quarterly');
  assert.deepEqual(q.yearsPaid, ['2022', '2023', '2024']);
  assert.equal(q.consecutiveYearsPaid, 3);
  assert.equal(q.raises, 4);
  assert.equal(q.cuts, 4);
  near(q.largestCutPct, -33.3333333333, 1e-6);
  // Bought on 10 January 2022, so 2022 is not a complete year; 2023 and 2024 are.
  assert.deepEqual(q.cagrYears, ['2023', '2024']);
  near(q.cagrPct, -33.3333333333, 1e-6, '1.20 per share in 2023 to 0.80 in 2024, one year');
  assert.equal(q.cagrReason, null);
});

test('US-127: a position held from before 1 January counts that year as complete', () => {
  const { cashRows } = quarterlyPayer('Q');
  const q = trackRecord(perShareSeries([buy('Q', '2021-12-20', 100, 40)], cashRows), '2025-01-15').byProduct[0];
  assert.deepEqual(q.cagrYears, ['2022', '2024']);
  near(q.cagrPct, (Math.sqrt(0.8 / 1.0) - 1) * 100, 1e-9, '1.00 to 0.80 over two years');
});

test('US-127: one complete year is too short for a growth rate — null with the reason', () => {
  const { transactions, cashRows } = quarterlyPayer('Q');
  const q = trackRecord(perShareSeries(transactions, cashRows), '2024-01-15').byProduct[0];
  assert.equal(q.cagrPct, null);
  assert.equal(q.cagrReason, 'too-short');
  assert.equal(q.cagrYears, null);
  assert.equal(q.consecutiveYearsPaid, 2, 'the facts that can be stated still are');
});

test('US-127: a year with a mid-year sale is not a complete year', () => {
  const transactions = [buy('M', '2021-12-01', 100, 10), sell('M', '2023-06-01', 100, 11)];
  const cashRows = [];
  for (const y of [2022, 2023]) for (const m of ['03', '06', '09', '12']) if (`${y}-${m}-15` < '2023-06-01') cashRows.push(div('M', `${y}-${m}-15`, 25));
  const q = trackRecord(perShareSeries(transactions, cashRows), '2024-01-01').byProduct[0];
  assert.equal(q.heldTo, '2023-06-01');
  assert.equal(q.cagrReason, 'too-short', '2022 is the only complete year');
  assert.deepEqual(q.yearsPaid, ['2022', '2023']);
});

test('US-127: a special does not appear as growth, and a gap year breaks the streak', () => {
  const { cashRows } = quarterlyPayer('Q');
  cashRows.push(div('Q', '2024-07-20', 90));
  const withSpecial = trackRecord(perShareSeries([buy('Q', '2021-12-20', 100, 40)], cashRows), '2025-01-15').byProduct[0];
  near(withSpecial.cagrPct, (Math.sqrt(0.8 / 1.0) - 1) * 100, 1e-9);
  assert.equal(withSpecial.regularPayments, 12);

  const gap = trackRecord(
    perShareSeries([buy('G', '2019-01-01', 10, 1)], [div('G', '2019-06-01', 1), div('G', '2020-06-01', 1), div('G', '2022-06-01', 1), div('G', '2023-06-01', 1)]),
    '2024-01-01',
  ).byProduct[0];
  assert.deepEqual(gap.yearsPaid, ['2019', '2020', '2022', '2023']);
  assert.equal(gap.consecutiveYearsPaid, 2, 'counted back from the last payment to the gap');
});

test('US-127: payments after today are not part of the record', () => {
  const { transactions, cashRows } = quarterlyPayer('Q');
  const q = trackRecord(perShareSeries(transactions, cashRows), '2023-07-01').byProduct[0];
  assert.equal(q.lastPayment, '2023-06-15');
  assert.equal(q.regularPayments, 6);
});

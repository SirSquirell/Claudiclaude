import test from 'node:test';
import assert from 'node:assert/strict';

import { inspect, shape } from '../tools/inspect-fields.mjs';

// Every field name below is invented. None of it is a claim about what DEGIRO
// sends — that is exactly the question the tool exists to answer, and a fixture
// that pre-answered it would be read as evidence later. See docs/ENDPOINT-REPORT.md.

const exportWith = ({ totals = null, products = [] } = {}) => ({
  exportedAt: '2026-08-10T09:00:00.000Z',
  meta: [{ key: 'liveSnapshot', value: totals ? { at: '2026-08-10', totals } : { at: '2026-08-10' } }],
  products,
});

const product = (id, productType, extra) => ({ id, productType, extra });
const text = (d) => inspect(d).lines.join('\n');

test('a small integer field is listed, because that is the shape of a count', () => {
  assert.equal(shape([100, 100, 10, 103, 1]), 'integer, 4 distinct: 1, 10, 100, 103');
});

test('an amount is counted, never printed', () => {
  const s = shape([115553.37, -39758.03, 0]);
  assert.match(s, /^number, 3 distinct, fractional, 2\/3 non-zero$/);
  assert.doesNotMatch(s, /115553|39758/);
});

test('a large integer is an amount too, whatever its type says', () => {
  const s = shape([1153124, 1040993]);
  assert.doesNotMatch(s, /1153124|1040993/);
  assert.match(s, /integral/);
});

test('a short enum is printed, because a status word is the finding', () => {
  assert.equal(shape(['C', 'P', 'C']), 'string, 2 distinct: "C", "P"');
  assert.equal(shape(['NO_MARGIN_CALL']), 'string, 1 distinct: "NO_MARGIN_CALL"');
});

test('a free-text string is measured, not quoted', () => {
  const s = shape(['Some Instrument Name N.V.', 'Another Long Instrument Name']);
  assert.doesNotMatch(s, /Instrument/);
  assert.match(s, /string, 2 distinct, \d+–\d+ chars/);
});

test('a digit run is never quoted, however it is typed', () => {
  // The two real incidents were a pasted account number and a value off a
  // screen. Neither should survive this function in any branch.
  for (const s of [shape(['12345678']), shape([12345678]), shape(['NL91ABNA0417164300'])]) {
    assert.doesNotMatch(s, /\d{6}/);
  }
});

test('dates report their format, not their range', () => {
  const s = shape(['2026-12-18', '2027-12-17']);
  assert.match(s, /^date, 2 distinct, format YYYY-MM-DD$/);
});

test('a pre-0.12.0 export is reported as no answer, not as an absent field', () => {
  const r = inspect(exportWith({ products: [product('1', 'STOCK', undefined)] }));
  assert.equal(r.answered, false);
  assert.match(r.lines.join('\n'), /written before 0\.12\.0/);
});

test('a candidate that never arrives is reported as loudly as one that does', () => {
  const out = text(exportWith({
    totals: { madeUpMarginish: 1234.5 },
    products: [product('1', 'OPTION', { madeUpSizeish: 100 })],
  }));
  assert.match(out, /absent {2}reportMargin/);
  assert.match(out, /absent {2}contractSize/);
  assert.match(out, /madeUpMarginish/);
  assert.match(out, /madeUpSizeish/);
});

test('coverage is per product type, since 169 of 169 options is the finding', () => {
  const out = text(exportWith({
    totals: {},
    products: [
      product('1', 'OPTION', { contractSize: 100 }),
      product('2', 'OPTION', { contractSize: 10 }),
      product('3', 'STOCK', { someStockField: true }),
    ],
  }));
  assert.match(out, /FOUND {3}contractSize/);
  assert.match(out, /on 2\/2 OPTION/);
  assert.match(out, /integer, 2 distinct: 10, 100/);
});

test('nothing an account holder would recognise reaches the output', () => {
  // One export carrying, in every place the tool looks, the three things that
  // have actually leaked in this project: a name, an account number, an amount.
  const out = text(exportWith({
    // The digits below are invented, and account-shaped on purpose: a test that
    // this cannot leak needs something that would matter if it did.
    totals: { someTotal: 115553.37, someRef: '87654321' }, // leak-check: ok
    products: [product('1', 'STOCK', { someLabel: 'A Person Name', someRef: '87654321', someValue: 115553.37 })], // leak-check: ok
  }));
  assert.doesNotMatch(out, /A Person Name/);
  assert.doesNotMatch(out, /87654321/);
  assert.doesNotMatch(out, /115553/);
  // and it still says the fields were there
  assert.match(out, /someLabel/);
  assert.match(out, /someRef/);
});

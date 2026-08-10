import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBugReport } from '../src/lib/report.js';

// Every value below is invented. The point of the fixture is that it is
// poisoned: a name, an account-shaped number, a session id, a URL with a query
// string and real amounts, in every field the builder reads. Whatever survives
// into the output is what a tester would be pasting into a chat window.

const POISON = {
  name: 'A Person Name',
  ref: '87654321', // leak-check: ok — invented, account-shaped on purpose
  amount: 1234.56,
  url: 'https://trader.degiro.nl/trading/secure/v5/update/1234567?sessionId=ABCDEF0123456789',
};

const poisonedInput = () => ({
  version: '0.13.0',
  generatedAt: '2026-08-10T09:00:00.000Z',
  counts: { transactions: 1457, cashflows: 8088, products: 303, prices: 181 },
  meta: {
    lastSyncAt: '2026-08-10T08:00:00.000Z',
    displayName: POISON.name,
    intAccount: POISON.ref, // leak-check: ok — invented
    userToken: POISON.ref, // leak-check: ok — invented
    lastError: { reason: 'transactions', message: `Could not reach ${POISON.url}`, at: '2026-08-10T08:00:00.000Z' },
    syncLog: [{ phase: 'products', message: `GET ${POISON.url} failed`, at: '2026-08-10T08:00:00.000Z', error: true }],
    missingPriceSeries: ['a', 'b'],
  },
  result: {
    days: ['2021-01-01', '2026-08-09'],
    byProduct: [
      { productId: POISON.ref, name: POISON.name, symbol: POISON.name, currency: 'EUR', productType: 'STOCK', contractSize: 1, current: POISON.amount, hasSeries: true },
      { productId: '2', name: POISON.name, symbol: 'OPT', currency: 'SEK', productType: 'OPTION', contractSize: 100, current: -POISON.amount, hasSeries: false },
    ],
    reconciliation: { ok: false, positionsAgree: true, reconstructed: 14400, live: 10000, attribution: [{ name: POISON.name }] },
    warnings: [
      { level: 'warn', code: 'price-scale-adjusted', message: `Rescaled ${POISON.name}`, detail: { instruments: [{ productId: POISON.ref, name: POISON.name, symbol: 'X', vwdId: '900', factor: 100.4, spread: 1.02, sample: [{ date: '2021-03-01', traded: POISON.amount, quoted: POISON.amount }] }] } },
      { level: 'warn', code: 'no-price-series', message: 'no series', detail: { instruments: [{ productId: '9', name: POISON.name, vwdId: '901' }] } },
      { level: 'info', code: 'fx-derived', message: 'rates', detail: { currencies: [{ currency: 'CHF', source: 'trades', observations: 24, dropped: 0, median: 107.1, low: 106, high: 108, widestGapDays: 400, stale: true }] } },
      { level: 'error', code: 'reconciliation-failed', message: `off by ${POISON.amount}`, detail: { reconstructed: 14400, live: 10000, diff: 4400, positionsAgree: true, attribution: [] } },
      { level: 'warn', code: 'a-code-nobody-has-classified', message: POISON.name, detail: { name: POISON.name, amount: POISON.amount } },
    ],
  },
});

const asText = (r) => JSON.stringify(r);

test('nothing an account holder would recognise survives', () => {
  const text = asText(buildBugReport(poisonedInput()));
  assert.doesNotMatch(text, /A Person Name/, 'a name');
  assert.doesNotMatch(text, /87654321/, 'an account-shaped number'); // leak-check: ok
  assert.doesNotMatch(text, /1234\.56|14400|4400/, 'an amount');
  assert.doesNotMatch(text, /sessionId|ABCDEF/, 'a session id');
  assert.doesNotMatch(text, /trader\.degiro\.nl/, 'a URL');
});

test('an unclassified warning contributes its code and nothing else', () => {
  // The default has to be safe, because the next warning added to the engine
  // will not have an entry here and nobody will remember to add one.
  const report = buildBugReport(poisonedInput());
  const w = report.warnings.find((x) => x.code === 'a-code-nobody-has-classified');
  assert.deepEqual(w, { level: 'warn', code: 'a-code-nobody-has-classified' });
});

test('the reconciliation defect is still diagnosable, as a ratio', () => {
  // This is the criterion the whole story turns on: could 0.10.0's missing
  // contract multiplier have been found from this file alone? A reconstructed
  // total over DEGIRO's own of 1.44 says it is 44% too high, which *is* the
  // finding. The euros behind it are not.
  //
  // The figures here are invented. An earlier draft used the two real ones from
  // docs/BACKLOG.md and the leak guard caught it — which is the rule working:
  // no value copied out of a real account belongs in test/, however harmless it
  // looks sitting in a document three directories away.
  const report = buildBugReport(poisonedInput());
  assert.equal(report.reconciliation.ratio, 1.44);
  assert.equal(report.reconciliation.positionsAgree, true);
  assert.equal(report.warnings.find((w) => w.code === 'reconciliation-failed').detail.ratio, 1.44);
});

test('the exchange-rate defect is still diagnosable', () => {
  // CHF deriving to 107 instead of 1.07 was the €1.15M chart. A rate is public
  // information about a currency, not about a person, so it is carried whole.
  const fx = buildBugReport(poisonedInput()).warnings.find((w) => w.code === 'fx-derived');
  assert.equal(fx.detail.currencies[0].currency, 'CHF');
  assert.equal(fx.detail.currencies[0].median, 107.1);
  assert.equal(fx.detail.currencies[0].stale, true);
});

test('the contract-size defect is still diagnosable', () => {
  // A rescale factor of 100.4 is the shape of a contract size measured through
  // a guessed rate. Reported without saying which instrument.
  const report = buildBugReport(poisonedInput());
  const scale = report.warnings.find((w) => w.code === 'price-scale-adjusted');
  assert.equal(scale.detail.factors[0].factor, 100.4);
  assert.equal(scale.detail.instruments, 1);
  // and the distribution of contract sizes is in the account block
  assert.deepEqual(report.account.contractSizes, { 1: 1, 100: 1 });
});

test('the shape of the account is described without identifying it', () => {
  const a = buildBugReport(poisonedInput()).account;
  assert.equal(a.transactions, 1457);
  assert.equal(a.heldPositions, 2);
  assert.equal(a.heldWithoutPrices, 1, 'the one with no series');
  assert.deepEqual(a.currencies, ['EUR', 'SEK']);
  assert.deepEqual(a.productTypes, { STOCK: 1, OPTION: 1 });
});

test('the sync log survives, which is the half a screenshot never has', () => {
  const s = buildBugReport(poisonedInput()).sync;
  assert.equal(s.log.length, 1);
  assert.equal(s.log[0].phase, 'products');
  assert.equal(s.log[0].error, true);
  assert.match(s.log[0].message, /<url>/, 'the URL is replaced, the sentence is kept');
  assert.equal(s.lastError.reason, 'transactions');
});

test('an empty run does not throw', () => {
  // The button exists before the first sync, and a report saying "nothing here"
  // is more useful than a page that breaks when you press it.
  const report = buildBugReport({ result: null, meta: {}, counts: {} });
  assert.equal(report.account.days, 0);
  assert.deepEqual(report.warnings, []);
  assert.equal(report.reconciliation, null);
});

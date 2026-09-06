import test from 'node:test';
import assert from 'node:assert/strict';

import { underFakeClock } from './fake-clock.js';
import { installFakeIndexedDb } from './fake-indexeddb.js';

/**
 * The connection check against a broker that is not there.
 *
 * `diagnose.js`'s output is meant to be pasted into a bug report, and its
 * header promises: statuses, counts, key names, booleans — never a value. The
 * red team (2026-09-06, finding 12) found the one gap in that promise: the key
 * lists came straight off `Object.keys`, and a response keyed by a number — a
 * products map keyed by product id, or any value that lands in a key position —
 * would have travelled. The keys now go through `sync.js`'s `fieldNames`; this
 * file feeds the check a response poisoned in exactly that way and reads what
 * comes out.
 */

installFakeIndexedDb();

// The 1,1 s spacing is tested for real in degiro.test.js; here it would only
// make eight requests take ten seconds.
const { RATE } = await import('../src/lib/config.js');
RATE.minIntervalMs = 0;
RATE.backoffBaseMs = 1;
RATE.backoffMaxMs = 4;

const { runDiagnostics } = await import('../src/lib/diagnose.js');

// Every value below is invented. The keys are the point: three of them are what
// a value looks like when it lands in a key position, and none may travel.
const POISON_KEYS = ['1234567', 'NL91ABNA0417164300', '12345.67'];
const poison = () => Object.fromEntries(POISON_KEYS.map((k) => [k, 1]));

const json = (o) => new Response(JSON.stringify(o), { status: 200 });

async function fakeBroker(url) {
  const u = String(url);
  if (u.includes('/login/secure/config')) {
    return json({ data: { tradingUrl: 'https://trader.degiro.nl/trading/secure/', reportingUrl: 'https://trader.degiro.nl/reporting/secure/', productSearchUrl: 'https://trader.degiro.nl/product_search/secure/', paUrl: 'https://trader.degiro.nl/pa/secure/' } });
  }
  if (u.includes('/pa/secure/client')) {
    return json({ data: { intAccount: 42, id: 'tok', ...poison() } }); // leak-check: ok — invented
  }
  if (u.includes('/v5/update/')) {
    return json({
      portfolio: { value: [] },
      totalPortfolio: { value: [{ name: 'total', value: 500 }, { name: 'totalCash', value: 500 }] },
      cashFunds: { value: [{ value: [{ name: 'currencyCode', value: 'EUR' }, { name: 'value', value: 500 }] }] },
    });
  }
  if (u.includes('/v4/transactions')) {
    return json({ data: [{ id: 1, date: '2026-06-03T10:00:00', productId: 900, quantity: 10, price: 30, currency: 'EUR', totalPlusFeeInBaseCurrency: -300.5, feeInBaseCurrency: -0.5, ...poison() }] });
  }
  if (u.includes('/v6/accountoverview')) {
    return json({ data: { cashMovements: [{ id: 1, date: '2026-06-01T09:00:00', description: 'Storting', change: 1000, currency: 'EUR', type: 'CASH_TRANSACTION', ...poison() }] } });
  }
  if (u.includes('/v5/products/info')) {
    return json({ data: { 900: { id: 900, name: 'Testable NV', symbol: 'TST', currency: 'EUR', productType: 'STOCK', vwdId: '900', vwdIdentifierType: 'issueid', ...poison() } } });
  }
  return json({});
}

async function diagnose() {
  const realChrome = globalThis.chrome;
  const realFetch = globalThis.fetch;
  globalThis.chrome = { cookies: { get: async () => ({ value: 'COOKIE' }) } };
  globalThis.fetch = fakeBroker;
  try {
    return await underFakeClock(() => runDiagnostics());
  } finally {
    globalThis.chrome = realChrome;
    globalThis.fetch = realFetch;
  }
}

test('a key that is a number, or carries one, does not appear in the diagnose output', async () => {
  const out = await diagnose();
  const steps = Object.fromEntries(out.steps.map((s) => [s.name, s]));

  // The check ran far enough to have reported keys at all — otherwise the
  // assertions below pass on an empty report.
  assert.ok(steps.client.keys.includes('intAccount'), 'client keys were reported');
  assert.ok(steps.transactions.rowKeys.includes('quantity'), 'transaction row keys were reported');
  assert.ok(steps.accountoverview.rowKeys.includes('description'), 'cash row keys were reported');
  assert.ok(steps['products-info'].rowKeys.includes('vwdId'), 'product row keys were reported');

  for (const s of out.steps) {
    for (const k of [...(s.keys ?? []), ...(s.rowKeys ?? [])]) {
      assert.match(k, /^[A-Za-z][A-Za-z0-9_]{0,31}$/, `${s.name}: "${k}" is not shaped like a field name`);
      assert.doesNotMatch(k, /\d{3}/, `${s.name}: "${k}" carries a digit run`);
    }
  }
  const text = JSON.stringify(out);
  for (const k of POISON_KEYS) assert.ok(!text.includes(k), `"${k}" survived into the output`);
});

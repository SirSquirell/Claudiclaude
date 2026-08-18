import test from 'node:test';
import assert from 'node:assert/strict';

import { underFakeClock } from './fake-clock.js';

import { installFakeIndexedDb } from './fake-indexeddb.js';

/**
 * A whole sync, end to end, against a DEGIRO that is not there.
 *
 * This is the piece the coverage report kept pointing at: `sync.js` at 40 % of
 * its functions, with `doSync` — the seven-step orchestration, two hundred
 * lines of it — never executed by a test. It is also the piece CLAUDE.md says
 * cannot be verified without a logged-in browser.
 *
 * That was half right. What needs a real browser is whether DEGIRO's endpoints
 * still answer the way we think and whether the field names still match. What
 * does *not* need one is everything this file asserts: that the steps run in
 * order, that each one's rows reach the right store, that a failure part-way
 * leaves a usable error rather than a half-written database, that a second sync
 * does not refetch what it already has, and that the numbers the engine
 * produces from what was stored reconcile against the total DEGIRO reported.
 *
 * A fake broker cannot tell us the API is unchanged. It can tell us that if the
 * API behaves, we do.
 */

installFakeIndexedDb();

// The 1.1s spacing between requests is an account-safety rule and it is tested
// for real in degiro.test.js. Re-proving it here would only make a whole sync
// take a minute, so it is turned off for these tests and nothing else is.
const { RATE, HISTORY_START } = await import('../src/lib/config.js');
RATE.minIntervalMs = 0;
RATE.backoffBaseMs = 1;
RATE.backoffMaxMs = 4;

const store = await import('../src/lib/store.js');
const sync = await import('../src/lib/sync.js');

// --- a broker that answers ---------------------------------------------------

const DAYS = 40;
const iso = (i) => new Date(Date.UTC(2026, 5, 1 + i)).toISOString().slice(0, 10);

/** Two instruments, a deposit, two trades, a dividend and a fee. */
function fakeBroker({ fail = null } = {}) {
  const calls = [];
  // Shaped after fixtures/chart-*.json: two series per instrument, and the one
  // carrying the prices is the `price:` id, with `times` as the anchor.
  const chart = (id, base) => ({
    requestid: '1',
    start: iso(0) + 'T00:00:00',
    end: iso(DAYS - 1) + 'T00:00:00',
    resolution: 'P1D',
    series: [
      { type: 'object', id: `issueid:${id}`, times: `${iso(0)}/P1D`, expires: '', data: { issueId: Number(id), name: 'Testable NV', currency: 'EUR', lastPrice: base } },
      { type: 'time', id: `price:issueid:${id}`, times: `${iso(0)}/P1D`, expires: '', data: Array.from({ length: DAYS }, (_, i) => [i, base]) },
    ],
  });

  const handler = async (url) => {
    const u = String(url);
    calls.push(u);
    if (fail && u.includes(fail.on)) return new Response('', { status: fail.status });

    if (u.includes('/login/secure/config')) {
      return json({ data: { tradingUrl: 'https://trader.degiro.nl/trading/secure/', reportingUrl: 'https://trader.degiro.nl/reporting/secure/', productSearchUrl: 'https://trader.degiro.nl/product_search/secure/', paUrl: 'https://trader.degiro.nl/pa/secure/' } });
    }
    if (u.includes('/pa/secure/client')) {
      return json({ data: { intAccount: 42, id: 'tok', displayName: 'X' } }); // leak-check: ok — invented
    }
    if (u.includes('/v5/update/')) {
      return json({
        portfolio: { value: [
          { id: '900', value: [{ name: 'size', value: 10 }, { name: 'price', value: 39 }, { name: 'value', value: 390 }] },
        ] },
        totalPortfolio: { value: [{ name: 'total', value: 890 }, { name: 'totalCash', value: 500 }] },
        cashFunds: { value: [{ value: [{ name: 'currencyCode', value: 'EUR' }, { name: 'value', value: 500 }] }] },
      });
    }
    if (u.includes('/v4/transactions')) {
      return json({ data: inWindow(u, [
        { id: 1, date: iso(2) + 'T10:00:00', productId: 900, quantity: 10, price: 30, currency: 'EUR', totalPlusFeeInBaseCurrency: -300.5, feeInBaseCurrency: -0.5 },
      ]) });
    }
    if (u.includes('/v6/accountoverview')) {
      return json({ data: { cashMovements: inWindow(u, [
        { id: 1, date: iso(0) + 'T09:00:00', description: 'Storting', change: 1000, currency: 'EUR', type: 'CASH_TRANSACTION' },
        { id: 2, date: iso(2) + 'T10:00:00', description: 'Koop 10 @ 30 EUR', change: -300, currency: 'EUR', productId: 900, type: 'TRANSACTION' },
        { id: 3, date: iso(2) + 'T10:00:00', description: 'Transactiekosten', change: -0.5, currency: 'EUR', type: 'CASH_TRANSACTION' },
        { id: 4, date: iso(9) + 'T09:00:00', description: 'Dividend', change: 12, currency: 'EUR', productId: 900, type: 'CASH_TRANSACTION' },
      ]) } });
    }
    if (u.includes('/v5/products/info')) {
      return json({ data: { 900: { id: 900, name: 'Testable NV', symbol: 'TST', isin: 'NL0000000000', currency: 'EUR', productType: 'STOCK', vwdId: '900', vwdIdentifierType: 'issueid', closePrice: 39 } } });
    }
    if (u.includes('charting.vwdservices.com')) return json(chart('900', 39));
    return json({});
  };
  return { handler, calls };
}

const json = (o) => new Response(JSON.stringify(o), { status: 200 });

/**
 * Only the rows that fall inside the window the caller asked for.
 *
 * The first version of this returned every row for every window, and the sync
 * refused to store them — correctly. Nineteen windows produced nineteen copies
 * of one transaction, all sharing a storage key, and the collision guard added
 * in 0.9.0 stopped the write and said so. Worth recording that the guard fired:
 * that defect once lost 46 cash movements.
 */
function inWindow(url, rows) {
  const m = /fromDate=(\d\d)\/(\d\d)\/(\d{4})&toDate=(\d\d)\/(\d\d)\/(\d{4})/.exec(url);
  if (!m) return rows;
  const from = `${m[3]}-${m[2]}-${m[1]}`;
  const to = `${m[6]}-${m[5]}-${m[4]}`;
  return rows.filter((r) => {
    const d = String(r.date).slice(0, 10);
    return d >= from && d <= to;
  });
}

async function withBroker(broker, fn) {
  const realChrome = globalThis.chrome;
  const realFetch = globalThis.fetch;
  globalThis.chrome = { cookies: { get: async () => ({ value: 'COOKIE' }) } };
  globalThis.fetch = broker.handler;
  try {
    // US-80: a seven-step sync makes a dozen requests, each spaced 1,1 s apart
    // by the queue rule 5 owns. Faked, the same requests happen in the same
    // order without the wall clock.
    return await underFakeClock(() => fn());
  } finally {
    globalThis.chrome = realChrome;
    globalThis.fetch = realFetch;
  }
}

const wipe = () => store.wipeAll();

// --- the tests ---------------------------------------------------------------

test('a whole sync runs its steps in order and stores what it fetched', async (t) => {
  await wipe();
  const broker = fakeBroker();
  const steps = [];

  await withBroker(broker, async () => {
    const result = await sync.runSync({ force: true, onProgress: (e) => steps.push(e.phase) });
    assert.ok(result, 'the sync resolved');
  });

  // The seven steps SPEC §6 describes, in the order the connection check reports.
  const order = [...sync.SYNC_STEPS, 'done'];
  const seen = order.filter((s) => steps.includes(s));
  assert.deepEqual(seen, order.filter((s) => seen.includes(s)), 'phases arrive in the documented order');
  assert.ok(steps.includes('done'), 'and it finishes');

  assert.equal((await store.getAll('transactions')).length, 1);
  assert.equal((await store.getAll('cashflows')).length, 4);
  assert.equal((await store.getAll('products')).length, 1);
  assert.ok((await store.getAll('prices')).length >= 1, 'a price series was stored');
  assert.equal(await store.getMeta('lastError', 'unset'), null, 'a clean run clears the last error');
});

test('what was stored reconstructs to what the broker said it was worth', async () => {
  // The acceptance test of the whole project, run over a sync rather than over
  // an export: SPEC §6 makes agreement with the broker's own total the check.
  const { computePortfolio } = await import('../src/lib/engine.js');
  const products = Object.fromEntries((await store.getAll('products')).map((p) => [p.id, p]));
  const prices = await store.getPriceMap();
  const r = computePortfolio({
    transactions: await store.getAll('transactions'),
    cashRows: await store.getAll('cashflows'),
    products,
    prices,
    today: await store.getMeta('lastDataDate'),
    liveTotal: await store.getMeta('liveTotal', null),
  });
  assert.ok(r.days.length > 0, 'a history came out');
  assert.equal(r.warnings.filter((w) => w.code === 'no-data').length, 0);
  // 10 shares closing at 39 plus 711.50 of cash — the deposit less the trade,
  // its fee and plus the dividend.
  assert.ok(Math.abs(r.totals.positions - 390) < 0.01, `positions ${r.totals.positions}`);
  assert.ok(Math.abs(r.totals.cash - 711.5) < 0.01, `cash ${r.totals.cash}`);
});

test('a second sync does not refetch product details it already has', async () => {
  const broker = fakeBroker();
  await withBroker(broker, async () => {
    await sync.runSync({ force: true, onProgress: () => {} });
  });
  const productCalls = broker.calls.filter((u) => u.includes('/products/info'));
  assert.equal(productCalls.length, 0, 'the one product was already known');
});

test('a failure part-way leaves an error a person can act on, not a half-written state', async () => {
  const broker = fakeBroker({ fail: { on: '/v6/accountoverview', status: 500 } });
  const before = (await store.getAll('cashflows')).length;

  // It resolves rather than rejecting: an alarm drives this, and an unhandled
  // rejection in a service worker helps nobody. The failure has to be *findable*
  // instead, which is what the popup and the bug report read.
  await withBroker(broker, async () => {
    await sync.runSync({ force: true, onProgress: () => {} });
  });

  const err = await store.getMeta('lastError', null);
  assert.ok(err, 'the failure was recorded');
  assert.ok(err.reason, 'and it names the step that broke');
  assert.doesNotMatch(JSON.stringify(err), /COOKIE/, 'without carrying the session cookie');
  assert.equal((await store.getAll('cashflows')).length, before, 'nothing was half-written');
});

test('an expired session stops rather than retrying, and says to log in', async () => {
  const broker = fakeBroker({ fail: { on: '/v5/update/', status: 401 } });
  await withBroker(broker, async () => {
    await sync.runSync({ force: true, onProgress: () => {} });
  });
  const attempts = broker.calls.filter((u) => u.includes('/v5/update/'));
  assert.equal(attempts.length, 1, 'a rejected session is never retried — that looks like a login attempt');
  const err = await store.getMeta('lastError', null);
  assert.ok(err, 'and the popup has something to show');
  assert.match(JSON.stringify(err), /session|401|expired/i, 'that says the session is the problem');
});

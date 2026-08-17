/**
 * Where the page gets its data.
 *
 * Two modes, one pipeline:
 *
 *  - `extension`: read the raw stores out of IndexedDB and run the engine here.
 *    Recomputing is milliseconds (SPEC §1.2), so the page never has to trust a
 *    stale cache.
 *
 *  - `demo`: fetch fixtures/ and run the exact same engine. This is what makes
 *    the whole thing testable in a plain browser without a DEGIRO login — the
 *    charts you see in demo mode are produced by the same code path that runs
 *    against your real account.
 *
 * Demo mode is chosen by `?demo=1`, and automatically when the page is not
 * running inside an extension at all.
 */

import { computePortfolio } from '../lib/engine.js';
import { combineResults } from '../lib/combine.js';
import * as degiro from '../lib/brokers/degiro.js';
import { parseCashMovements, parseChartResponse, parseProducts, parseTransactions, parseUpdate } from '../lib/parse.js';
import { todayISO } from '../lib/dates.js';

export const inExtension = typeof chrome !== 'undefined' && !!chrome.runtime?.id;

export function wantsDemo() {
  const p = new URLSearchParams(location.search);
  if (p.has('demo')) return p.get('demo') !== '0';
  return !inExtension;
}

/**
 * Ask the service worker to do something.
 *
 * The deadline is not defensive padding. MV3 gives no guarantee the reply ever
 * arrives: Chrome may terminate the worker mid-message, and a terminated worker
 * does **not** reliably fail the pending call — the callback can simply never
 * fire, with `chrome.runtime.lastError` never set. Without a deadline the
 * promise never settles, the `finally` that re-enables the button never runs,
 * and the page sits on "Syncing…" until it is reloaded. That is one bug, not a
 * class of them, and it is the reported "the sync button gets stuck".
 *
 * A timeout here says nothing about whether the work finished — the worker may
 * well still be going. It ends *this page's* wait, and nothing more. Anything
 * long-running must therefore not treat this reply as its completion signal;
 * it reads the checkpoint `sync.js` writes instead.
 */
export function send(message, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error(`The background worker did not answer “${message?.type}” within ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);

    chrome.runtime.sendMessage(message, (reply) => {
      if (settled) return; // a late reply to a call we have already given up on
      clearTimeout(timer);
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      if (!reply?.ok) return reject(new Error(reply?.error ?? 'Unknown error'));
      resolve(reply.data);
    });
  });
}

/**
 * Every engine result goes through the multi-broker combiner, even though there
 * is exactly one broker.
 *
 * Not decoration, and not an abstraction kept warm for later — the opposite.
 * `combineResults` returns a single part **untouched** (acceptance criterion A5,
 * pinned by test T8), so this changes no number on the page and adds one field,
 * `brokers`. What it buys is that the multi-broker path is the *only* path:
 * it runs on every page load, so it cannot rot unnoticed between now and the day
 * a second adapter arrives, and the "one broker looks exactly like today"
 * requirement is enforced continuously rather than asserted in a test nobody
 * runs against the real UI.
 *
 * The alternative was leaving `combine.js` unreferenced on `main` until it was
 * needed, which is precisely the dead code rule 8 is about.
 */
const asPortfolio = (result, products) =>
  combineResults([{ broker: degiro.id, label: degiro.label, result, products }]);

// --- demo ------------------------------------------------------------------

/**
 * Fixtures live at the repo root. Resolve relative to this module so the same
 * code works from the dev server and from a chrome-extension:// page.
 */
const fixtureUrl = (name) => new URL(`../../fixtures/${name}`, import.meta.url).href;

async function loadJson(name) {
  const res = await fetch(fixtureUrl(name));
  if (!res.ok) throw new Error(`Could not load fixtures/${name} (HTTP ${res.status})`);
  return res.json();
}

export async function loadDemo() {
  const meta = await loadJson('meta.json');
  const [txRaw, cashRaw, productsRaw, updateRaw] = await Promise.all([
    loadJson('transactions.json'),
    loadJson('accountoverview.json'),
    loadJson('products-info.json'),
    loadJson('update.json'),
  ]);

  const prices = {};
  const charts = await Promise.all((meta.charts ?? []).map((f) => loadJson(f)));
  for (const c of charts) Object.assign(prices, parseChartResponse(c));

  const update = parseUpdate(updateRaw);
  const transactions = parseTransactions(txRaw);
  const cashRows = parseCashMovements(cashRaw);
  const products = parseProducts(productsRaw);
  const result = asPortfolio(
    computePortfolio({
      transactions,
      cashRows,
      products,
      prices,
      today: meta.today,
      liveTotal: update.totalValue,
      liveCash: update.totalCash,
      // Demo mode runs the real engine, so it has to be handed the same inputs
      // or it silently exercises a weaker path than the extension does — which
      // is the whole reason `npm run demo` is trusted for UI work.
      livePositions: update.positions,
    }),
    products,
  );

  // The demo reports the same counts the extension does. Without them the bug
  // report says "0 transactions" over a chart drawn from hundreds, and a
  // diagnostic that understates is worse than one that is absent.
  const counts = {
    transactions: transactions.length,
    cashflows: cashRows.length,
    products: Object.keys(products).length,
    prices: Object.keys(prices).length,
  };

  /**
   * A synthetic account name, so the share sheet's name sources are exercisable
   * in `npm run demo`. Invented here rather than taken from a real account, per
   * CLAUDE.md rule 7: no value copied out of a real account enters the fixtures,
   * because the value on screen is the one that gets pasted.
   */
  return { result, meta, counts, mode: 'demo', live: update, transactions, products, accountName: 'Demo Belegger' };
}

// --- extension -------------------------------------------------------------

/**
 * Meta keys the bug report reads, with the fallback each one needs.
 *
 * A list rather than a fifteen-slot positional destructure, which is what this
 * was: adding a key meant editing three lines in lockstep and silently shifted
 * every value after the one you forgot. `persistedErrors` is the key that made it
 * worth changing — the whole point of it is to be read when something has
 * already gone wrong, so it is exactly the wrong field to wire up by counting
 * positions.
 *
 * Everything here is also in `EXPORTABLE_META`, and `report.js` still names
 * each field on the way out. This list decides what is *read*, not what may
 * leave.
 */
const DIAGNOSTIC_META = {
  lastSyncAt: 0,
  lastError: null,
  urls: null,
  syncLog: [],
  lastDataDate: null,
  missingPriceSeries: [],
  liveCash: null,
  liveTotalFields: null,
  unreadableRows: null,
  missingWindows: null,
  persistedErrors: [],
};

export async function loadFromExtension() {
  const store = await import('../lib/store.js');
  const metaKeys = Object.keys(DIAGNOSTIC_META);
  const [rawTx, rawCash, rawProducts, prices, liveTotal, live, accountName, ...metaValues] = await Promise.all([
    store.getAll('transactions'),
    store.getAll('cashflows'),
    store.getAll('products'),
    store.getPriceMap(),
    store.getMeta('liveTotal', null),
    store.getMeta('liveSnapshot', null),
    /**
     * The name the broker has for this account, for US-47's card and nothing
     * else.
     *
     * Read *outside* `DIAGNOSTIC_META` on purpose, and this is the load-bearing
     * part: everything in that object is folded into `diagnosticContext`, which
     * is what the bug report and the export are built from. `displayName` is in
     * `IDENTIFYING_META` precisely because the 0.10.0 export shipped it. Putting
     * it in that bag to save a line would re-introduce the leak, so it travels
     * as its own field that only the share sheet reads.
     */
    store.getMeta('displayName', ''),
    ...metaKeys.map((k) => store.getMeta(k, DIAGNOSTIC_META[k])),
  ]);
  const meta = Object.fromEntries(metaKeys.map((k, i) => [k, metaValues[i]]));
  const { lastSyncAt, lastError, urls } = meta;

  // What the bug report needs and the charts do not: how the sync went, and how
  // many rows of each kind there are. Gathered here because this is the only
  // module that already touches the store.
  const diagnosticContext = {
    meta,
    counts: {
      transactions: rawTx.length,
      cashflows: rawCash.length,
      products: rawProducts.length,
      prices: Object.keys(prices ?? {}).length,
    },
  };

  if (!rawTx.length && !rawCash.length) {
    return { result: null, mode: 'extension', empty: true, accountName, lastSyncAt, lastError, urls, ...diagnosticContext };
  }

  const products = Object.fromEntries(rawProducts.map((p) => [p.id, p]));
  const result = asPortfolio(
    computePortfolio({
      transactions: rawTx,
      cashRows: rawCash,
      products,
      prices,
      today: todayISO(),
      liveTotal,
      /**
       * The page recomputes independently of `sync.js`, and it was passing
       * neither of these — so the position check and the attribution never ran
       * on the page at all, and the reconciliation it displayed was a weaker
       * one than the cached result had already computed. The snapshot was
       * loaded three lines up and simply not handed over.
       */
      liveCash: meta.liveCash ?? null,
      livePositions: live?.positions ?? null,
    }),
    products,
  );

  // The transaction list is handed to the page rather than folded into the
  // engine result: `sync.js` caches that result, and a few thousand rows of
  // something no chart reads would be carried through every recompute for the
  // sake of one table.
  return { result, mode: 'extension', live, accountName, lastSyncAt, lastError, urls, transactions: rawTx, products, ...diagnosticContext };
}

export async function load() {
  return wantsDemo() ? loadDemo() : loadFromExtension();
}

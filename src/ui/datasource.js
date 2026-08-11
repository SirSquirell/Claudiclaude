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
  const result = computePortfolio({
    transactions,
    cashRows,
    products,
    prices,
    today: meta.today,
    liveTotal: update.totalValue,
  });

  // The demo reports the same counts the extension does. Without them the bug
  // report says "0 transactions" over a chart drawn from hundreds, and a
  // diagnostic that understates is worse than one that is absent.
  const counts = {
    transactions: transactions.length,
    cashflows: cashRows.length,
    products: Object.keys(products).length,
    prices: Object.keys(prices).length,
  };

  return { result, meta, counts, mode: 'demo', live: update };
}

// --- extension -------------------------------------------------------------

export async function loadFromExtension() {
  const store = await import('../lib/store.js');
  const [rawTx, rawCash, rawProducts, prices, liveTotal, live, lastSyncAt, lastError, urls, syncLog, lastDataDate, missingPriceSeries, liveTotalFields] =
    await Promise.all([
      store.getAll('transactions'),
      store.getAll('cashflows'),
      store.getAll('products'),
      store.getPriceMap(),
      store.getMeta('liveTotal', null),
      store.getMeta('liveSnapshot', null),
      store.getMeta('lastSyncAt', 0),
      store.getMeta('lastError', null),
      store.getMeta('urls', null),
      store.getMeta('syncLog', []),
      store.getMeta('lastDataDate', null),
      store.getMeta('missingPriceSeries', []),
      store.getMeta('liveTotalFields', null),
    ]);

  // What the bug report needs and the charts do not: how the sync went, and how
  // many rows of each kind there are. Gathered here because this is the only
  // module that already touches the store.
  const diagnosticContext = {
    meta: { lastSyncAt, lastError, urls, syncLog, lastDataDate, missingPriceSeries, liveTotalFields },
    counts: {
      transactions: rawTx.length,
      cashflows: rawCash.length,
      products: rawProducts.length,
      prices: Object.keys(prices ?? {}).length,
    },
  };

  if (!rawTx.length && !rawCash.length) {
    return { result: null, mode: 'extension', empty: true, lastSyncAt, lastError, urls, ...diagnosticContext };
  }

  const result = computePortfolio({
    transactions: rawTx,
    cashRows: rawCash,
    products: Object.fromEntries(rawProducts.map((p) => [p.id, p])),
    prices,
    today: todayISO(),
    liveTotal,
  });

  return { result, mode: 'extension', live, lastSyncAt, lastError, urls, ...diagnosticContext };
}

export async function load() {
  return wantsDemo() ? loadDemo() : loadFromExtension();
}

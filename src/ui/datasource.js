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

/** Ask the service worker to do something. */
export function send(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (reply) => {
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
  const result = computePortfolio({
    transactions: parseTransactions(txRaw),
    cashRows: parseCashMovements(cashRaw),
    products: parseProducts(productsRaw),
    prices,
    today: meta.today,
    liveTotal: update.totalValue,
  });

  return { result, meta, mode: 'demo', live: update };
}

// --- extension -------------------------------------------------------------

export async function loadFromExtension() {
  const store = await import('../lib/store.js');
  const [rawTx, rawCash, rawProducts, prices, liveTotal, live, lastSyncAt, lastError] = await Promise.all([
    store.getAll('transactions'),
    store.getAll('cashflows'),
    store.getAll('products'),
    store.getPriceMap(),
    store.getMeta('liveTotal', null),
    store.getMeta('liveSnapshot', null),
    store.getMeta('lastSyncAt', 0),
    store.getMeta('lastError', null),
  ]);

  if (!rawTx.length && !rawCash.length) {
    return { result: null, mode: 'extension', empty: true, lastSyncAt, lastError };
  }

  const result = computePortfolio({
    transactions: rawTx,
    cashRows: rawCash,
    products: Object.fromEntries(rawProducts.map((p) => [p.id, p])),
    prices,
    today: todayISO(),
    liveTotal,
  });

  return { result, mode: 'extension', live, lastSyncAt, lastError };
}

export async function load() {
  return wantsDemo() ? loadDemo() : loadFromExtension();
}

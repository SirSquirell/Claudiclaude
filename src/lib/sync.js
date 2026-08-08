/**
 * Sync orchestration — the only module that talks to both the network and the
 * database. SPEC §3.1.
 *
 * Two rules shape everything here:
 *
 *  - SPEC §1.2: only the raw API responses are persisted truth. `recompute()`
 *    rebuilds every derived number from scratch, and is cheap enough to run on
 *    every sync ("Recomputing 5 years of daily values is milliseconds. Do not
 *    build incremental derivation.").
 *
 *  - SPEC §6: the MV3 worker can die mid-sync, so progress is checkpointed into
 *    meta.syncState after each step and the next run picks up where it stopped.
 */

import { HISTORY_START, PRICE_PERIOD, SYNC } from './config.js';
import { chunk, fetchAccountOverview, fetchPriceChunk, fetchProductsInfo, fetchTransactions } from './degiro.js';
import { SessionExpiredError } from './degiro.js';
import { computePortfolio } from './engine.js';
import { addDays, todayISO } from './dates.js';
import { parseCashMovements, parseProducts, parseTransactions, parseUpdate } from './parse.js';
import { SESSION_MESSAGES, checkSession, resolveSession } from './session.js';
import {
  getAll,
  getDerived,
  getMeta,
  getPriceMap,
  mergePriceSeries,
  putAll,
  setDerived,
  setMeta,
} from './store.js';

/**
 * Re-fetch this many days before the last sync. Reporting rows are sometimes
 * booked with a value date a few days back, so a strict watermark loses them.
 */
const OVERLAP_DAYS = 10;

let running = null;

/**
 * Rebuild every derived series from the raw stores and cache the result.
 * Pure-ish: reads the database, calls the pure engine, writes one cache record.
 */
export async function recompute({ liveTotal = null } = {}) {
  const [rawTx, rawCash, rawProducts, prices] = await Promise.all([
    getAll('transactions'),
    getAll('cashflows'),
    getAll('products'),
    getPriceMap(),
  ]);

  const products = Object.fromEntries(rawProducts.map((p) => [p.id, p]));
  const total = liveTotal ?? (await getMeta('liveTotal', null));

  const result = computePortfolio({
    transactions: rawTx,
    cashRows: rawCash,
    products,
    prices,
    today: todayISO(),
    liveTotal: total,
  });

  await setDerived(result);
  return result;
}

/**
 * Run a full sync. Safe to call repeatedly: concurrent calls share one run, and
 * a run inside the cooldown window is a no-op unless `force` is set.
 *
 * @param {{force?: boolean, onProgress?: (step: {phase: string, message: string, pct: number}) => void}} opts
 */
export async function runSync(opts = {}) {
  if (running) return running;
  running = doSync(opts).finally(() => {
    running = null;
  });
  return running;
}

async function doSync({ force = false, onProgress = () => {} } = {}) {
  const report = (phase, message, pct) => {
    onProgress({ phase, message, pct });
    return setMeta('syncState', { phase, message, pct, at: new Date().toISOString() });
  };

  const lastSyncAt = await getMeta('lastSyncAt', 0);
  if (!force && Date.now() - lastSyncAt < SYNC.minSyncIntervalMs) {
    return { ok: true, skipped: 'cooldown', result: await getDerived() };
  }

  // --- session ------------------------------------------------------------
  await report('session', 'Checking your DEGIRO session…', 2);
  const session = await resolveSession();
  if (!session.ok) {
    await setMeta('lastError', { reason: session.reason, at: new Date().toISOString() });
    return { ok: false, reason: session.reason, message: SESSION_MESSAGES[session.reason] ?? 'Session unavailable.' };
  }

  const probe = await checkSession(session);
  if (!probe.ok) {
    await setMeta('lastError', { reason: probe.reason, at: new Date().toISOString() });
    return { ok: false, reason: probe.reason, message: SESSION_MESSAGES[probe.reason] ?? 'Session unavailable.' };
  }

  const today = todayISO();

  try {
    // --- current portfolio, for reconciliation --------------------------
    const update = parseUpdate(probe.update);
    if (update.totalValue != null) await setMeta('liveTotal', update.totalValue);
    await setMeta('liveSnapshot', { at: new Date().toISOString(), ...update });

    // --- transactions & cash movements ----------------------------------
    const watermark = await getMeta('lastDataDate', null);
    const fromDate = watermark ? addDays(watermark, -OVERLAP_DAYS) : HISTORY_START;

    await report('transactions', 'Fetching transactions…', 15);
    const transactions = parseTransactions(
      await fetchTransactions({ ...session, fromDate, toDate: today }),
    );
    await putAll('transactions', transactions);

    await report('cashflows', 'Fetching cash movements…', 30);
    const cashRows = parseCashMovements(
      await fetchAccountOverview({ ...session, fromDate, toDate: today }),
    );
    await putAll('cashflows', cashRows);

    // --- product metadata for anything new -------------------------------
    await report('products', 'Fetching product details…', 45);
    const known = new Set((await getAll('products')).map((p) => p.id));
    const needed = new Set();
    for (const t of await getAll('transactions')) if (!known.has(t.productId)) needed.add(t.productId);
    for (const p of update.positions) if (!known.has(p.productId)) needed.add(p.productId);

    if (needed.size) {
      for (const ids of chunk([...needed])) {
        const info = parseProducts(await fetchProductsInfo({ ...session, productIds: ids }));
        await putAll('products', Object.values(info));
      }
    }

    // --- prices ----------------------------------------------------------
    const products = await getAll('products');
    const stored = await getPriceMap();

    // SPEC §3.1 steps 4-5: full history for new instruments, a short tail for
    // the ones we already have.
    const backfill = [];
    const tail = [];
    for (const p of products) {
      if (!p.vwdId) continue;
      (stored[p.vwdId] ? tail : backfill).push(p.vwdId);
    }

    const chunks = [
      ...chunk(backfill).map((ids) => ({ ids, period: PRICE_PERIOD.backfill })),
      ...chunk(tail).map((ids) => ({ ids, period: PRICE_PERIOD.tail })),
    ];

    for (const [i, c] of chunks.entries()) {
      await report(
        'prices',
        `Fetching prices (${i + 1}/${chunks.length})…`,
        50 + Math.round((i / Math.max(chunks.length, 1)) * 40),
      );
      const series = await fetchPriceChunk({ vwdIds: c.ids, userToken: session.userToken, period: c.period });
      for (const [vwdId, s] of Object.entries(series)) await mergePriceSeries(vwdId, s);

      const missing = c.ids.filter((id) => !series[id]);
      if (missing.length) {
        await setMeta('missingPriceSeries', missing);
      }
    }

    // --- derive -----------------------------------------------------------
    await report('derive', 'Rebuilding the history…', 92);
    const result = await recompute({ liveTotal: update.totalValue });

    await setMeta('lastDataDate', today);
    await setMeta('lastSyncAt', Date.now());
    await setMeta('lastError', null);
    await report('done', 'Up to date.', 100);

    return { ok: true, result, reconciliation: result.reconciliation };
  } catch (err) {
    const reason = err instanceof SessionExpiredError ? 'expired' : 'error';
    await setMeta('lastError', { reason, message: String(err.message ?? err), at: new Date().toISOString() });
    // The checkpoint in meta.syncState stays where it was, so the next run
    // resumes from the same phase rather than restarting the backfill.
    return { ok: false, reason, message: SESSION_MESSAGES[reason] ?? String(err.message ?? err) };
  }
}

/** Current state for the popup, without touching the network. */
export async function getStatus() {
  const [derived, lastSyncAt, lastError, syncState, live] = await Promise.all([
    getDerived(),
    getMeta('lastSyncAt', 0),
    getMeta('lastError', null),
    getMeta('syncState', null),
    getMeta('liveSnapshot', null),
  ]);
  return { derived, lastSyncAt, lastError, syncState, live, syncing: running != null };
}

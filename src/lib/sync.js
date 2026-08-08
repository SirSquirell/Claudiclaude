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

/** Steps the UI knows about, so it can show "3 of 6" rather than a spinner. */
export const SYNC_STEPS = ['session', 'portfolio', 'transactions', 'cashflows', 'products', 'prices', 'derive'];

/**
 * Turn a failure into a sentence someone can act on.
 *
 * The friendly text alone is not enough — "DEGIRO returned an error" tells the
 * user nothing and tells a bug report even less. Where an underlying error
 * exists, it gets appended verbatim; it is the only thing that identifies which
 * endpoint failed and how.
 */
function explain(reason, detail) {
  const base = SESSION_MESSAGES[reason] ?? 'Sync failed.';
  const extra = typeof detail === 'string' ? detail : detail?.message;
  return extra && extra !== reason ? `${base} (${extra})` : base;
}

async function doSync({ force = false, onProgress = () => {} } = {}) {
  const startedAt = Date.now();
  const log = [];

  /**
   * Progress is checkpointed into meta rather than pushed to the caller: the
   * popup and the page are separate documents that may not even be open, and
   * the worker can be torn down between two steps. Whoever asks next reads the
   * last known state from disk.
   */
  const report = async (phase, message, pct) => {
    const entry = { phase, message, pct, at: new Date().toISOString() };
    log.push(entry);
    onProgress(entry);
    await setMeta('syncState', { ...entry, startedAt, done: phase === 'done', failed: false });
    await setMeta('syncLog', log.slice(-40));
  };

  const fail = async (phase, message, detail) => {
    const entry = { phase, message, pct: null, at: new Date().toISOString(), error: true, detail };
    log.push(entry);
    await setMeta('syncState', { ...entry, startedAt, done: true, failed: true });
    await setMeta('syncLog', log.slice(-40));
    await setMeta('lastError', { reason: phase, message, detail, at: entry.at });
  };

  const lastSyncAt = await getMeta('lastSyncAt', 0);
  if (!force && Date.now() - lastSyncAt < SYNC.minSyncIntervalMs) {
    return { ok: true, skipped: 'cooldown', result: await getDerived() };
  }

  // --- session ------------------------------------------------------------
  await report('session', 'Checking your DEGIRO session…', 2);
  const session = await resolveSession();
  if (!session.ok) {
    const message = explain(session.reason, session.error);
    await fail('session', message, session.error ?? session.reason);
    return { ok: false, reason: session.reason, message };
  }

  await report('portfolio', 'Reading your current portfolio…', 8);
  const probe = await checkSession(session);
  if (!probe.ok) {
    const message = explain(probe.reason, probe.error);
    await fail('portfolio', message, probe.error ?? probe.reason);
    return { ok: false, reason: probe.reason, message };
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
    await report('transactions', `Fetched ${transactions.length} transactions.`, 25);

    await report('cashflows', 'Fetching cash movements…', 30);
    const cashRows = parseCashMovements(
      await fetchAccountOverview({ ...session, fromDate, toDate: today }),
    );
    await putAll('cashflows', cashRows);
    const unknown = cashRows.filter((r) => r.category === 'UNKNOWN').length;
    await report(
      'cashflows',
      `Fetched ${cashRows.length} cash movements${unknown ? `, ${unknown} unrecognised` : ''}.`,
      40,
    );

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
    await report('done', `Up to date — ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`, 100);

    // Deliberately not returning `result`: it is a few megabytes of daily
    // arrays, and every message reply gets structure-cloned across the worker
    // boundary. The caller re-reads it from IndexedDB instead.
    return {
      ok: true,
      reconciliation: result.reconciliation,
      counts: {
        transactions: result.stats.transactions,
        cashRows: result.stats.cashRows,
        unclassified: result.stats.unclassified,
        instruments: result.byProduct.length,
        days: result.days.length,
      },
      tookMs: Date.now() - startedAt,
    };
  } catch (err) {
    const reason = err instanceof SessionExpiredError ? 'expired' : 'error';
    const message = reason === 'expired' ? SESSION_MESSAGES.expired : String(err.message ?? err);
    const phase = (await getMeta('syncState', null))?.phase ?? 'error';
    await fail(phase, message, { name: err.name, status: err.status ?? null });
    // The checkpoint in meta.syncState stays where it was, so the next run
    // resumes from the same phase rather than restarting the backfill.
    return { ok: false, reason, message };
  }
}

/**
 * Current state, without touching the network.
 * `includeDerived` is off by default: the derived bundle is large and the
 * progress poller asks for this several times a second.
 */
export async function getStatus({ includeDerived = false } = {}) {
  const [derived, lastSyncAt, lastError, syncState, syncLog, live] = await Promise.all([
    includeDerived ? getDerived() : Promise.resolve(undefined),
    getMeta('lastSyncAt', 0),
    getMeta('lastError', null),
    getMeta('syncState', null),
    getMeta('syncLog', []),
    getMeta('liveSnapshot', null),
  ]);
  return {
    derived,
    hasData: derived !== undefined ? derived != null : undefined,
    lastSyncAt,
    lastError,
    syncState,
    syncLog,
    live,
    syncing: running != null,
    steps: SYNC_STEPS,
  };
}

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

import { EMPTY_YEARS_BEFORE_STOP, HISTORY_FLOOR, HISTORY_START, PRICE_PERIOD, SYNC } from './config.js';
import { chunk, fetchAccountOverview, fetchPriceChunk, fetchProductsInfo, fetchTransactions } from './degiro.js';
import { DegiroHttpError, SessionExpiredError } from './degiro.js';
import { computePortfolio } from './engine.js';
import { addDays, splitWindows, subMonths, todayISO } from './dates.js';
import { getFieldStats, parseCashMovements, parseProducts, parseTransactions, parseUpdate, resetFieldStats } from './parse.js';
import { SESSION_MESSAGES, checkSession, resolveSession } from './session.js';
import {
  IDENTIFYING_META,
  delMeta,
  getAll,
  getDerived,
  getMeta,
  getPriceMap,
  mergePriceSeries,
  putAll,
  setDerived,
  setMeta,
  wipeAll,
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
  const cash = await getMeta('liveCash', null);
  // DEGIRO states the size of every open position. The engine checks ours
  // against it: if today's position is wrong, so is every day behind it.
  const snapshot = await getMeta('liveSnapshot', null);

  const result = computePortfolio({
    transactions: rawTx,
    cashRows: rawCash,
    products,
    prices,
    today: todayISO(),
    liveTotal: total,
    liveCash: cash,
    livePositions: snapshot?.positions ?? null,
  });

  await setDerived(result);
  return result;
}

/**
 * Run a full sync. Safe to call repeatedly: concurrent calls share one run, and
 * a run inside the cooldown window is a no-op unless `force` is set.
 *
 * `scheduled: true` marks a run nobody asked for — the alarm and the DEGIRO-tab
 * listener — which is what a disconnected account refuses (US-79).
 *
 * @param {{force?: boolean, scheduled?: boolean, onProgress?: (step: {phase: string, message: string, pct: number}) => void}} opts
 */
export async function runSync(opts = {}) {
  if (running) return running;
  running = doSync(opts).finally(() => {
    running = null;
  });
  return running;
}

/**
 * Disconnect: forget who this account is, keep everything it did. US-79.
 *
 * The words matter here, because the request that produced this story said
 * *"wipe"* and then said *"but the figures freeze"*, which is the opposite of
 * what `wipeAndResync` below does. A later session reading "wipe" in a chat log
 * and pointing it at `wipeAll` would ship exactly the wrong feature. So:
 *
 *  - **Nothing is deleted from the raw or derived stores.** Freezing costs
 *    nothing, and that is rule 2 rather than luck: the raw responses are the
 *    truth, every figure on screen is a pure function of them, and neither needs
 *    the network to render. A disconnected app is the demo path with real data.
 *  - **What goes is `IDENTIFYING_META`** — the list `store.js` already keeps for
 *    exactly this classification, so a key added next month is covered on the day
 *    it is added rather than when somebody remembers this function. Writing the
 *    four names out again here is how the 0.10.0 export leak happened (rule 7).
 *  - **DEGIRO's own `JSESSIONID` is not touched, because it was never ours.** It
 *    is read from the cookie jar per request and stored nowhere. Deleting it
 *    would log the reader out of their own trading tab, which is the mirror image
 *    of rule 9.
 *
 * The flag is the other half: without it the next alarm calls `resolveSession`,
 * re-reads `/pa/secure/client` and re-caches everything this just forgot, so a
 * disconnect would have an hour's half-life. The caller clears the alarm too —
 * that is `sw.js`, which owns the alarms.
 */
export async function disconnectAccount() {
  // Same reason as the wipe below: a sync in flight is about to write the very
  // identifiers we are removing.
  if (running) await running.catch(() => {});
  await setMeta('disconnected', true);
  await setMeta('disconnectedAt', new Date().toISOString());
  await delMeta(IDENTIFYING_META);
  return { disconnected: true, forgotten: [...IDENTIFYING_META] };
}

/** Is the account disconnected? Read per call; it is one row. */
export const isDisconnected = async () => (await getMeta('disconnected', false)) === true;

/**
 * Wipe every store and start over.
 *
 * The wait is the whole point. Wiping while a sync is in flight leaves the
 * database in a state that looks fine and is not: everything the sync wrote
 * before the wipe is gone, everything after it survives, and the sync still
 * reports success. That produced a real report of a portfolio with cash and no
 * holdings — the transactions had been written just before the wipe and the
 * cash movements just after, so the position ledger was silently empty.
 *
 * Awaiting the in-flight run first is enough; `runSync` then starts a genuinely
 * new one, because the old promise has settled and cleared the guard.
 */
export async function wipeAndResync({ onProgress } = {}) {
  if (running) {
    await running.catch(() => {});
  }
  await wipeAll();
  return runSync({ force: true, onProgress });
}

/**
 * Widest date window we ask the reporting endpoints for in one request.
 *
 * DEGIRO answers a multi-year range with a 502: their query times out, and
 * since nothing about the request changed, retrying is pure waste. A year at a
 * time goes through on the accounts we have seen; anything that still fails
 * gets halved by `fetchWindowed` below.
 */
const REPORTING_WINDOW_MONTHS = 12;

/** Stop halving here. Below a month, a 502 is not about the window size. */
const MIN_WINDOW_MONTHS = 1;

/**
 * Fetch one reporting endpoint across a date range, a window at a time,
 * narrowing any window the server chokes on.
 *
 * @param {(args: {fromDate: string, toDate: string}, opts: object) => Promise<any>} fetchFn
 * @param {(raw: any) => Array} parseFn
 */
export async function fetchWindowed({ fetchFn, parseFn, session, fromDate, toDate, onWindow, onDrop, onGap }) {
  const rows = [];
  const queue = splitWindows(fromDate, toDate, REPORTING_WINDOW_MONTHS).map((w) => ({
    ...w,
    months: REPORTING_WINDOW_MONTHS,
  }));

  /** Windows DEGIRO would not serve even at the minimum width. */
  const gaps = [];
  let done = 0;
  while (queue.length) {
    const w = queue.shift();
    try {
      // One retry only: a 502 here means "too much data", and the fix is a
      // narrower window, not the same question asked louder.
      const raw = await fetchFn({ ...session, fromDate: w.from, toDate: w.to }, { retries: 1 });
      const parsed = parseFn(raw);
      // A parser that silently discards rows is the quietest way this can be
      // wrong: the sync succeeds, the chart is short of a year, and nothing
      // says so. Whatever it could not read is carried up, per window.
      if (parsed.dropped?.count) onDrop?.(parsed.dropped, w);
      rows.push(...parsed);
      done++;
      await onWindow?.(w, done, done + queue.length);
    } catch (err) {
      const tooMuch = err instanceof DegiroHttpError && err.status >= 500;
      if (!tooMuch) throw err;

      if (w.months > MIN_WINDOW_MONTHS) {
        // Split this window in half and put both halves back at the front.
        const months = Math.max(MIN_WINDOW_MONTHS, Math.floor(w.months / 2));
        const halves = splitWindows(w.from, w.to, months).map((h) => ({ ...h, months }));
        queue.unshift(...halves);
        continue;
      }

      // A single month that still answers 502 is not "too much data" any more —
      // the comment above says so — it is one month DEGIRO will not serve today.
      //
      // This used to `throw`, which discarded every window already fetched and
      // failed the whole sync over one bad month. Five years of successful
      // requests thrown away, and the user gets nothing at all. A gap that is
      // *reported* is strictly better: the reconciliation will notice the
      // missing rows, this says which month they were, and the next sync tries
      // again.
      gaps.push({ from: w.from, to: w.to, status: err.status });
      done++;
      await onWindow?.(w, done, done + queue.length);
    }
  }

  if (gaps.length) {
    Object.defineProperty(rows, 'gaps', { value: gaps, enumerable: false });
    onGap?.(gaps);
  }
  return rows;
}

/**
 * Keep stepping a year further back while rows keep turning up, so an account
 * older than HISTORY_START still reconstructs completely.
 *
 * Only worth doing on a first sync — afterwards the watermark covers it.
 */
export async function extendBackwards({ fetchFn, parseFn, session, before, onWindow }) {
  const rows = [];
  let emptyYears = 0;
  let end = addDays(before, -1);

  while (end >= HISTORY_FLOOR && emptyYears < EMPTY_YEARS_BEFORE_STOP) {
    const start = subMonths(end, 12);
    const from = start < HISTORY_FLOOR ? HISTORY_FLOOR : start;
    let found;
    try {
      const raw = await fetchFn({ ...session, fromDate: from, toDate: end }, { retries: 1 });
      found = parseFn(raw);
    } catch (err) {
      // A failure this far back is not worth failing the whole sync over; we
      // already have everything from HISTORY_START onwards.
      if (err instanceof DegiroHttpError) break;
      throw err;
    }

    rows.push(...found);
    emptyYears = found.length ? 0 : emptyYears + 1;
    await onWindow?.(from, rows.length);
    end = addDays(from, -1);
  }

  return rows;
}

/**
 * The keys of an object, filtered down to things that are unmistakably field
 * names.
 *
 * An API field name is letters, and may carry digits or an underscore. A value
 * that leaked into a key position would not be — and the check is written the
 * strict way round on purpose, because `tools/inspect-fields.mjs` shipped the
 * loose version first and let a person's name and an IBAN through on its very
 * first run. Anything that does not look like an identifier is dropped rather
 * than reported, and the count is capped so a pathological response cannot turn
 * into a payload.
 */
export function fieldNames(obj, limit = 60) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.keys(obj)
    .filter((k) => /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(k))
    // …and no run of three digits, which is the rule that actually earns its
    // keep. `NL91ABNA0417164300` is a letter followed by alphanumerics and sails
    // through the line above — the identifier shape alone would have shipped an
    // IBAN, in the very function whose comment says it will not. The test caught
    // it. A real field name has a digit or two at most (`total2`, `v4`); a long
    // digit run means the string is data wearing a name's clothes.
    .filter((k) => !/\d{3}/.test(k))
    .slice(0, limit);
}

/** Steps the UI knows about, so it can show "3 of 6" rather than a spinner. */
export const SYNC_STEPS = ['session', 'portfolio', 'transactions', 'cashflows', 'products', 'prices', 'derive'];

/**
 * Does this checkpoint describe the run the caller asked for?
 *
 * The page cannot follow a sync by waiting on the message reply — Chrome may
 * terminate the worker mid-call and the callback then never fires at all — so
 * it follows `meta.syncState` instead. The trap is the window between the click
 * and the worker's first write: the checkpoint still describes the *previous*
 * run, which is finished, and reading that as "done" reports success for work
 * that has not started. `startedAt` is what separates them.
 *
 * It lives here rather than in the page because this module is what writes the
 * field, so the two definitions cannot drift apart.
 *
 * @param {object|null} now the checkpoint as it reads now
 * @param {object|null} before the checkpoint as it stood when the run was asked for
 */
export function isSameRun(now, before) {
  if (!now) return false;
  // A strictly newer run is unambiguously the one we asked for.
  if ((now.startedAt ?? 0) > (before?.startedAt ?? 0)) return true;
  // Otherwise it is only ours if it is the run that was *already* unfinished
  // when we asked, which `runSync` hands back rather than starting a second.
  return before?.done === false && now.startedAt === before.startedAt;
}

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

async function doSync({ force = false, scheduled = false, onProgress = () => {} } = {}) {
  /**
   * US-79 AC3. A disconnected account reaches the network for exactly one
   * reason: the reader pressed Sync.
   *
   * So the two callers that are not a person — the periodic alarm and the
   * DEGIRO-tab listener — pass `scheduled` and stop here, and any other sync is
   * a reconnect: the flag goes, `resolveSession` finds no cached identifiers and
   * fetches them exactly as it does on a first run. No second code path, which
   * is the point: a "reconnect" that had its own path would be a second way to
   * authenticate, and there is only supposed to be one.
   */
  if (scheduled) {
    if (await isDisconnected()) return { ok: true, skipped: 'disconnected' };
  } else {
    await setMeta('disconnected', false);
  }

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

  /** Rows the parsers could not read, per source. Counted, never swallowed. */
  const unreadable = { transactions: { count: 0, reasons: {} }, cashRows: { count: 0, reasons: {} } };
  /** Date windows DEGIRO would not serve at all. Reported, never silent. */
  const missingWindows = [];
  const noteDrop = (into) => (d) => {
    into.count += d.count;
    for (const [why, n] of Object.entries(d.reasons ?? {})) into.reasons[why] = (into.reasons[why] ?? 0) + n;
  };

  /**
   * US-17. The field tally covers this run and no other.
   *
   * Reset here rather than never, because the counter is a *rate* and a rate
   * accumulated across four syncs cannot answer the question it exists for: a
   * field renamed today would sit at 25 % missing against three earlier runs and
   * never cross the threshold.
   */
  resetFieldStats();

  try {
    // --- current portfolio, for reconciliation --------------------------
    const update = parseUpdate(probe.update);
    if (update.totalValue != null) await setMeta('liveTotal', update.totalValue);
    // The fallback anchor when DEGIRO states no total — see the engine's §7.
    if (update.totalCash != null) await setMeta('liveCash', update.totalCash);
    // When it is missing, record *which fields DEGIRO did send*, names only.
    //
    // Without a total there is no anchor, and the reconciliation — the one check
    // that says whether any of this is right (CLAUDE.md rule 6) — cannot run at
    // all. Two real accounts report exactly that, and there has been no way to
    // tell a broken field name from a genuinely empty response. The candidate
    // list in `parseUpdate` is a guess made without a real capture; this is how
    // it stops being a guess.
    //
    // Names, never values: this ends up in the bug report, which is the file
    // people paste into a chat window.
    await setMeta('liveTotalFields', update.totalValue != null ? null : fieldNames(update.totals));
    await setMeta('liveSnapshot', { at: new Date().toISOString(), ...update });

    // --- transactions & cash movements ----------------------------------
    const watermark = await getMeta('lastDataDate', null);
    const firstSync = !watermark;
    const fromDate = watermark ? addDays(watermark, -OVERLAP_DAYS) : HISTORY_START;

    await report('transactions', 'Fetching transactions…', 15);
    const transactions = await fetchWindowed({
      fetchFn: fetchTransactions,
      parseFn: parseTransactions,
      session,
      fromDate,
      toDate: today,
      onWindow: (w, i, total) =>
        report('transactions', `Fetching transactions… ${w.from.slice(0, 4)} (${i}/${total})`, 15 + Math.round((i / total) * 10)),
      onDrop: noteDrop(unreadable.transactions),
      onGap: (g) => missingWindows.push(...g.map((x) => ({ ...x, source: 'transactions' }))),
    });
    if (firstSync) {
      transactions.push(
        ...(await extendBackwards({
          fetchFn: fetchTransactions,
          parseFn: parseTransactions,
          session,
          before: HISTORY_START,
          onWindow: (from, n) => report('transactions', `Checking for older transactions… ${from.slice(0, 4)} (${n} so far)`, 25),
        })),
      );
    }
    await putAll('transactions', transactions);
    await report('transactions', `Fetched ${transactions.length} transactions.`, 25);

    await report('cashflows', 'Fetching cash movements…', 30);
    const cashRows = await fetchWindowed({
      fetchFn: fetchAccountOverview,
      parseFn: parseCashMovements,
      session,
      fromDate,
      toDate: today,
      onWindow: (w, i, total) =>
        report('cashflows', `Fetching cash movements… ${w.from.slice(0, 4)} (${i}/${total})`, 30 + Math.round((i / total) * 10)),
      onDrop: noteDrop(unreadable.cashRows),
      onGap: (g) => missingWindows.push(...g.map((x) => ({ ...x, source: 'cashflows' }))),
    });
    if (firstSync) {
      cashRows.push(
        ...(await extendBackwards({
          fetchFn: fetchAccountOverview,
          parseFn: parseCashMovements,
          session,
          before: HISTORY_START,
          onWindow: (from, n) => report('cashflows', `Checking for older cash movements… ${from.slice(0, 4)} (${n} so far)`, 40),
        })),
      );
    }
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
    // DEGIRO reports cash funds among the positions with ids like FLATEX_EUR.
    // They are not tradable instruments, have no vwdId, and asking about them
    // just pollutes the product store.
    const isInstrument = (pid) => /^\d+$/.test(String(pid));
    for (const t of await getAll('transactions')) if (isInstrument(t.productId) && !known.has(t.productId)) needed.add(t.productId);
    for (const p of update.positions) if (isInstrument(p.productId) && !known.has(p.productId)) needed.add(p.productId);

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
      (stored[p.vwdId] ? tail : backfill).push({ id: p.vwdId, type: p.vwdIdType || 'issueid' });
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

      const missing = c.ids.filter((v) => !series[v.id]).map((v) => v.id);
      if (missing.length) {
        await setMeta('missingPriceSeries', missing);
      }
    }

    /**
     * A source that came back completely empty *because every window failed* is
     * not a quiet Tuesday — it is a failed sync wearing one.
     *
     * `fetchWindowed` deliberately turns a window it cannot get into a reported
     * gap rather than throwing, so one bad month does not cost the four years
     * around it. That is right, and it leaves a hole at the other end: when
     * *every* window fails the run still reaches this point with an empty array
     * and no error, and the popup says it worked.
     *
     * This was hidden until F10 was fixed. The old storage tripwire happened to
     * fire on the count mismatch that an all-empty fetch produced, so the sync
     * failed — for the wrong reason, with the wrong message, telling the user to
     * wipe. Removing that accident is what made the real gap visible.
     */
    const emptied = [
      missingWindows.some((w) => w.source === 'transactions') && transactions.length === 0 ? 'transactions' : null,
      missingWindows.some((w) => w.source === 'cashflows') && cashRows.length === 0 ? 'cash movements' : null,
    ].filter(Boolean);

    if (emptied.length) {
      const message =
        `DEGIRO refused every request for ${emptied.join(' and ')} in this range, so nothing could be ` +
        `read. This is usually temporary — try again in a few minutes. Your stored history is untouched.`;
      await fail('derive', message, { missingWindows: missingWindows.slice(0, 40) });
      return { ok: false, reason: 'all-windows-failed', message };
    }

    // --- derive -----------------------------------------------------------
    await report('derive', 'Rebuilding the history…', 92);
    const result = await recompute({ liveTotal: update.totalValue });

    // Tripwire. If what we just fetched is not what the engine read back, the
    // database changed under us mid-sync and the result is quietly wrong —
    // which is exactly how an account once ended up charted as cash-only.
    // Two different faults look alike here, and telling the user the wrong one
    // sends them to a button that cannot help. Rows that collide on their key
    // never reach storage in the first place; a count that drops between
    // storing and reading back means something else wrote to the database.
    const uniqueTx = new Set(transactions.map((t) => t.id)).size;
    const uniqueCash = new Set(cashRows.map((r) => r.id)).size;

    if (uniqueTx !== transactions.length || uniqueCash !== cashRows.length) {
      const message =
        `${transactions.length - uniqueTx + (cashRows.length - uniqueCash)} row(s) shared a storage key and ` +
        `would have overwritten each other. This is a bug in the extension, not something you can fix — ` +
        `please report it with the counts below.`;
      await fail('derive', message, {
        fetched: { transactions: transactions.length, cashRows: cashRows.length },
        unique: { transactions: uniqueTx, cashRows: uniqueCash },
      });
      return { ok: false, reason: 'key-collision', message };
    }

    /**
     * The store must contain **at least** every row this run just wrote.
     *
     * It used to demand equality, and that was wrong in a way that only shows
     * up on a real account. `fromDate` is the watermark, so an incremental sync
     * fetches one window — three transactions, say — while `recompute` reads the
     * whole history back, eighty-nine. Equality holds on a first sync and never
     * again. Every incremental sync after that failed, told the user to wipe and
     * re-download five years of history, and the wipe "worked" precisely because
     * a full sync makes the two numbers match again — so the advice looked sound
     * and the error came straight back the next day.
     *
     * The invariant that survives an incremental sync is the one the guard
     * actually wanted: rows we just stored cannot have vanished. A wipe landing
     * mid-sync still trips it; a normal Tuesday does not.
     */
    if (result.stats.transactions < uniqueTx || result.stats.cashRows < uniqueCash) {
      const message =
        `Storage changed during the sync: ${uniqueTx} transactions and ${uniqueCash} cash movements were ` +
        `stored, but only ${result.stats.transactions} and ${result.stats.cashRows} came back. Press ` +
        `“Wipe & resync” and let it finish without interrupting it.`;
      await fail('derive', message, {
        stored: { transactions: uniqueTx, cashRows: uniqueCash },
        readBack: { transactions: result.stats.transactions, cashRows: result.stats.cashRows },
      });
      return { ok: false, reason: 'storage-race', message };
    }

    // Whatever the parsers could not read, stored so the page and the bug
    // report can both say it. Null when nothing was lost, so the field's
    // presence is itself the signal.
    await setMeta('missingWindows', missingWindows.length ? missingWindows.slice(0, 40) : null);
    await setMeta('unreadableRows', unreadable.transactions.count + unreadable.cashRows.count > 0 ? unreadable : null);
    /**
     * Which candidate field name carried each value, and on how many rows.
     *
     * Stored rather than computed on the page for the reason the page cannot
     * compute it: `loadFromExtension` reads rows that were *already parsed*, so
     * `parse.js` never runs there. This is the only place that knows.
     *
     * Field names are ours, not the account's — there is nothing here to redact,
     * which is why it can go straight into the bug report.
     */
    await setMeta('fieldStats', getFieldStats());
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
  const [derived, lastSyncAt, lastError, syncState, syncLog, live, disconnected, disconnectedAt] = await Promise.all([
    includeDerived ? getDerived() : Promise.resolve(undefined),
    getMeta('lastSyncAt', 0),
    getMeta('lastError', null),
    getMeta('syncState', null),
    getMeta('syncLog', []),
    getMeta('liveSnapshot', null),
    getMeta('disconnected', false),
    getMeta('disconnectedAt', null),
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
    // US-79: both UIs need to say "frozen, as of this date" rather than showing
    // figures that read as today's.
    disconnected,
    disconnectedAt,
    steps: SYNC_STEPS,
  };
}

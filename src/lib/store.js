/**
 * IndexedDB wrapper.
 *
 * SPEC §4: "IndexedDB, not chrome.storage.local. Price series is the bulky
 * object (~1300 points × number of instruments ever held) and chrome.storage is
 * a poor fit for it."
 *
 * Only the raw API payloads are truth here. Everything derived is a cache that
 * can be thrown away and recomputed (SPEC §1.2).
 */

import { STORAGE } from './config.js';
import { addDays, daysBetween } from './dates.js';

const KEY_PATHS = {
  transactions: 'id',
  cashflows: 'id',
  products: 'id',
  prices: 'vwdId',
  derived: 'key',
  meta: 'key',
};

/**
 * A storage failure with a reason a person can act on.
 *
 * Everything in this file used to fail as a bare `DOMException`, whose message
 * is written by the browser for the browser: "The transaction was aborted" does
 * not tell anyone that their disk is full, and "A mutation operation was
 * attempted on a database that did not allow mutations" does not say "you are
 * in a private window". Those are three different situations with three
 * different answers, and the sync reported all of them identically.
 *
 * The reason travels; the browser's own message is kept alongside it, because
 * it is occasionally the only clue, and it is scrubbed before it can leave.
 */
export class StoreError extends Error {
  constructor(reason, cause) {
    super(STORE_MESSAGES[reason] ?? STORE_MESSAGES.unknown);
    this.name = 'StoreError';
    this.reason = reason;
    this.detail = String(cause?.name ?? cause?.message ?? cause ?? '').slice(0, 120);
  }
}

/** What to tell the reader. Each one names the next thing to do. */
export const STORE_MESSAGES = {
  blocked: 'Another tab has an older version of this extension open. Close it and try again.',
  quota: 'Out of browser storage. Free some space, or wipe and resync to rebuild a smaller database.',
  unsupported: 'This browser will not let the extension store data — private windows usually block it.',
  unknown: 'The local database could not be opened.',
};

/** Which of the four a DOM exception is. */
function classifyStoreError(err) {
  const name = err?.name ?? '';
  if (name === 'QuotaExceededError') return 'quota';
  if (name === 'SecurityError' || name === 'InvalidStateError' || name === 'UnknownError') return 'unsupported';
  return 'unknown';
}

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(STORAGE.dbName, STORAGE.dbVersion);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      for (const name of STORAGE.stores) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: KEY_PATHS[name] ?? 'id' });
        }
      }

      // v2 changed how a row's key is derived. Records written under the old
      // scheme would not be overwritten by their replacements, they would sit
      // beside them and double every amount, so they are dropped and re-fetched.
      // Safe by SPEC §1.2: only the raw API responses are truth, and those come
      // back from DEGIRO. The watermark goes too, or the refetch would only
      // cover the last few days.
      if (event.oldVersion > 0 && event.oldVersion < 2) {
        const upgrade = req.transaction;
        for (const name of ['transactions', 'cashflows', 'derived']) {
          if (db.objectStoreNames.contains(name)) upgrade.objectStore(name).clear();
        }
        if (db.objectStoreNames.contains('meta')) {
          upgrade.objectStore('meta').delete('lastDataDate');
          upgrade.objectStore('meta').delete('lastSyncAt');
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new StoreError(classifyStoreError(req.error), req.error));
    req.onblocked = () => reject(new StoreError('blocked', req.error));
  });

  /**
   * A failed open must not be remembered.
   *
   * `dbPromise` was assigned before this and never cleared, so the *first*
   * failure was cached and every later call got the same rejection back
   * without touching IndexedDB again. Two of the four reasons above are
   * transient — the other tab gets closed, the disk gets freed — and caching
   * turned both of them into "broken until you reload the extension". The
   * retry cost is one `indexedDB.open`.
   */
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function tx(db, names, mode) {
  const t = db.transaction(names, mode);
  return {
    t,
    done: new Promise((resolve, reject) => {
      t.oncomplete = () => resolve();
      // A write transaction aborts for one reason in practice: the disk is
      // full. A first backfill writes ~1300 points per instrument ever held,
      // which is the largest thing this extension does, so it is also where it
      // happens. `QuotaExceededError` says so; "transaction aborted" does not.
      t.onerror = () => reject(new StoreError(classifyStoreError(t.error), t.error));
      t.onabort = () => reject(new StoreError(classifyStoreError(t.error), t.error ?? { name: 'AbortError' }));
    }),
  };
}

const request = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new StoreError(classifyStoreError(req.error), req.error));
  });

export async function getAll(storeName) {
  const db = await openDb();
  const { t } = tx(db, [storeName], 'readonly');
  return request(t.objectStore(storeName).getAll());
}

export async function get(storeName, key) {
  const db = await openDb();
  const { t } = tx(db, [storeName], 'readonly');
  return request(t.objectStore(storeName).get(key));
}

/** Upsert many records in one transaction. */
export async function putAll(storeName, records) {
  if (!records?.length) return 0;
  const db = await openDb();
  const { t, done } = tx(db, [storeName], 'readwrite');
  const store = t.objectStore(storeName);
  for (const r of records) store.put(r);
  await done;
  return records.length;
}

export async function put(storeName, record) {
  return putAll(storeName, [record]);
}

async function clearStore(storeName) {
  const db = await openDb();
  const { t, done } = tx(db, [storeName], 'readwrite');
  t.objectStore(storeName).clear();
  await done;
}

/** SPEC §4: "wipe and resync". */
export async function wipeAll() {
  for (const name of STORAGE.stores) await clearStore(name);
}

// --- meta ------------------------------------------------------------------

export async function getMeta(key, fallback = null) {
  const row = await get('meta', key);
  return row ? row.value : fallback;
}

export async function setMeta(key, value) {
  await put('meta', { key, value, updatedAt: new Date().toISOString() });
}

// --- derived cache ---------------------------------------------------------

export async function getDerived() {
  const row = await get('derived', 'latest');
  return row?.result ?? null;
}

export async function setDerived(result) {
  await put('derived', { key: 'latest', result, storedAt: new Date().toISOString() });
}

// --- prices ----------------------------------------------------------------

/** @returns {Record<string, {start, stepDays, points}>} keyed by vwdId */
export async function getPriceMap() {
  const rows = await getAll('prices');
  const out = {};
  for (const row of rows) out[row.vwdId] = { start: row.start, stepDays: row.stepDays, points: row.points };
  return out;
}

/**
 * Combine a stored series with a freshly fetched one.
 *
 * The daily run fetches a three-month tail that overlaps what we already have,
 * and the two responses do not share an anchor date — offsets are relative to
 * each response's own `times`. So both sides are re-based onto the earlier
 * anchor before merging, and points are keyed by their absolute day so an
 * overlap replaces rather than duplicates.
 *
 * Pure, and exported separately from the write so it can be tested without a
 * database. Getting this wrong shows up as a doubled or time-shifted price
 * series, which looks like a market event rather than a bug.
 */
export function mergeSeriesPoints(existing, incoming) {
  const anchor = existing.start <= incoming.start ? existing.start : incoming.start;
  const rebase = (series) => {
    const shift = daysBetween(anchor, series.start);
    return (series.points ?? []).map((p) => ({ offsetDays: p.offsetDays + shift, close: p.close }));
  };

  const merged = new Map();
  for (const p of rebase(existing)) merged.set(p.offsetDays, p.close);
  for (const p of rebase(incoming)) merged.set(p.offsetDays, p.close); // newer wins

  const points = [...merged.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([offsetDays, close]) => ({ offsetDays, close }));

  return {
    start: anchor,
    stepDays: existing.stepDays ?? incoming.stepDays ?? 1,
    points,
    lastPointDate: points.length ? addDays(anchor, points.at(-1).offsetDays) : null,
  };
}

/** Merge new quotes into the stored series for one instrument. */
export async function mergePriceSeries(vwdId, incoming) {
  const existing = await get('prices', vwdId);
  if (!existing) {
    await put('prices', { vwdId, ...incoming, updatedAt: new Date().toISOString() });
    return incoming.points.length;
  }

  const merged = mergeSeriesPoints(existing, incoming);
  await put('prices', { vwdId, ...merged, updatedAt: new Date().toISOString() });
  return merged.points.length;
}

// --- export ----------------------------------------------------------------

/**
 * Keys that identify the person rather than describe the account.
 *
 * The export exists to be sent to someone else — it is how every defect in this
 * project has been reported — so it must not carry anything the recipient has no
 * business holding. Nothing here is needed to reconstruct or audit a portfolio.
 *
 * The session cookie is not in this list because it is never stored: it is read
 * from the cookie jar per request and never written to disk.
 */
/**
 * Meta keys the export may carry. CLAUDE.md rule 7: what leaves the machine is
 * declared, and anything undeclared is redacted.
 *
 * This list is deliberately an allowlist. 0.10.0 shipped the inverse — four
 * named keys to strip — and that shape encodes its own next failure: a key added
 * to the store tomorrow is exported by default, and keeps being exported until
 * somebody remembers. It leaked `displayName`, `intAccount` and `userToken`
 * exactly that way, because nobody had listed them.
 *
 * Everything here answers "what state was the sync in", which is what a bug
 * report needs. Nothing here says who you are.
 */
export const EXPORTABLE_META = [
  'lastDataDate',
  'lastError',
  'lastSyncAt',
  'liveSnapshot',
  'liveTotal',
  // The cash half of the derived reconciliation anchor. A single number DEGIRO
  // already states; it travels because without it a null reconciliation cannot
  // be told apart from a wrong one.
  'liveCash',
  // Field *names* from DEGIRO's account-total response, written only when the
  // total could not be read. Two gates stand in front of it — `fieldNames` in
  // sync.js drops anything not shaped like an identifier, and report.js names
  // it explicitly — and this is the third: a key nobody classified does not
  // leave, whatever it holds.
  'liveTotalFields',
  'missingPriceSeries',
  // Counts and reasons only -- no row, no amount, no description. See parse.js.
  // Dates and HTTP statuses only.
  'missingWindows',
  'unreadableRows',
  'syncLog',
  'syncState',
  'urls',
  // Scrubbed at the moment of recording, not on the way out: see errlog.js.
  // URLs, long digit runs and every stack frame but the first are already gone
  // by the time the value reaches this store.
  'persistedErrors',
];

/**
 * Keys known to identify the account holder. Not consulted by `redactMeta` —
 * anything outside `EXPORTABLE_META` is redacted whether it is listed here or
 * not. It exists so the leak guard and the classification test have something
 * to check new keys against, and so the decision is recorded rather than
 * implied by an absence.
 */
export const IDENTIFYING_META = ['displayName', 'intAccount', 'userToken', 'clientId'];

/**
 * Keep only the declared rows. Pure, so it is tested for real rather than by a
 * test that reimplements it — `exportEverything` needs IndexedDB, and this is
 * the part that has to be right.
 *
 * Portfolio values, dates and instrument names stay: they are the point of the
 * file, and no redaction makes them safe. That is a property of the export
 * itself, said plainly in the README.
 */
export function redactMeta(rows) {
  const allow = new Set(EXPORTABLE_META);
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => (allow.has(row?.key) ? row : { ...row, value: '[redacted]' }));
}

/** SPEC §4: "Ship an 'export JSON' ... button." */
export async function exportEverything() {
  const out = { exportedAt: new Date().toISOString(), version: STORAGE.dbVersion };
  for (const name of STORAGE.stores) out[name] = await getAll(name);
  out.meta = redactMeta(out.meta);
  out.exportedMetaKeys = EXPORTABLE_META;
  return out;
}

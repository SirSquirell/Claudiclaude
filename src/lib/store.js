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

let dbPromise = null;

export function openDb() {
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
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'));
  });
  return dbPromise;
}

function tx(db, names, mode) {
  const t = db.transaction(names, mode);
  return {
    t,
    done: new Promise((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error ?? new Error('transaction aborted'));
    }),
  };
}

const request = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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

export async function clearStore(storeName) {
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

export async function getAllMeta() {
  const rows = await getAll('meta');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
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
export const IDENTIFYING_META = ['displayName', 'intAccount', 'userToken', 'clientId'];

/**
 * Strip the identifying rows from a meta store. Pure, so it is tested for real
 * rather than by a test that reimplements it — `exportEverything` needs
 * IndexedDB and this is the part that has to be right.
 *
 * Values, dates and instrument names stay: they are the whole point of the file.
 */
export function redactMeta(rows) {
  const drop = new Set(IDENTIFYING_META);
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => (drop.has(row?.key) ? { ...row, value: '[redacted]' } : row));
}

/** SPEC §4: "Ship an 'export JSON' ... button." */
export async function exportEverything() {
  const out = { exportedAt: new Date().toISOString(), version: STORAGE.dbVersion };
  for (const name of STORAGE.stores) out[name] = await getAll(name);
  out.meta = redactMeta(out.meta);
  out.redacted = IDENTIFYING_META;
  return out;
}

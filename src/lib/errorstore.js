/**
 * Errors from the contexts that do not survive long enough to be asked.
 *
 * The full page keeps its errors in memory, and that is correct there: the page
 * showing you a bug report is the same page that hit the bug. Two contexts
 * cannot do that.
 *
 *  - **The service worker.** Chrome tears it down after thirty seconds of
 *    quiet, so an alarm-driven sync that fails at four in the morning is gone
 *    before anyone looks. Until now it was worse than gone: `sw.js` had two
 *    `runSync().catch(() => {})` handlers, the project's only deliberate
 *    discard of an error, written when the only failure worth expecting was
 *    "the session is gone". That stopped being the whole truth once the worker
 *    began writing to IndexedDB, deriving five years of daily values and
 *    reconciling them.
 *  - **The popup.** It closes when you click away from it, which is usually the
 *    same gesture as giving up on it.
 *
 * So both write here instead, in the same scrubbed, counted, capped shape the
 * page uses, and the bug report carries all of it. Writing is cheap because
 * repeats fold into a count: a sync that fails hourly for a week is one row and
 * `count: 168`, not a week of rows.
 */

import { fold } from './errlog.js';
import { getMeta, setMeta } from './store.js';

const KEY = 'persistedErrors';

/**
 * Fold one failure into the persisted ring.
 *
 * Never throws, and never needs awaiting. It is called from `catch` blocks and
 * from error handlers, and a recorder that can fail is a recorder that replaces
 * the diagnosis with itself — a write that fails because the disk is full would
 * otherwise take out the sync that was reporting the full disk.
 *
 * @param {string} kind  where it came from, e.g. `alarm-sync`, `popup-main`
 */
export async function recordError(kind, err, at = new Date().toISOString()) {
  try {
    const kept = await getMeta(KEY);
    const ring = Array.isArray(kept) ? kept : [];
    const entry = { kind, message: err?.message ?? String(err), stack: err?.stack, at };
    // Evicting rather than refusing: this ring outlives its writers by months,
    // and a full one that refuses new entries would freeze the record at
    // whatever went wrong first. See `fold`.
    if (!fold(ring, entry, { evictOldest: true })) return;
    await setMeta(KEY, ring);
  } catch {
    /* see above: the recorder never becomes the failure */
  }
}

/**
 * What the bug report reads. Always an array.
 *
 * There is no `clear` beside it. `wipeAll` empties the whole meta store, so one
 * would be a second way to do what a wipe already does — and nothing else
 * should be clearing this. In particular a sync that succeeds must not:
 * "it works now" and "it has never failed" are different facts, and the second
 * is the one a report should not be able to claim falsely. An intermittent
 * failure is the hardest kind to diagnose and the easiest kind to erase.
 */
export async function persistedErrors() {
  const kept = await getMeta(KEY);
  return Array.isArray(kept) ? kept : [];
}

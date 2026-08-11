/**
 * Everything the page throws, kept where the bug report can find it.
 *
 * Until now a defect that broke a render produced *nothing*: a red banner for
 * whoever was looking at it, and a bug report that cheerfully described a
 * healthy account. Two of this project's defects were found that way — a
 * `ReferenceError` took the whole page down while 194 unit tests stayed green,
 * and a chart dropped half its labels with the suite untouched. Neither is
 * catchable by `node --test`, because neither is arithmetic. They are catchable
 * by *hearing about them*, and that needs the page to write them down.
 *
 * The scrubbing and the ring are in `../lib/errlog.js`, shared with the service
 * worker. This file is only the part that needs a `window`.
 */

import { fold } from '../lib/errlog.js';

/** @type {Array<{at: string|null, kind: string, message: string, where: string|null, count: number}>} */
const kept = [];
let dropped = 0;

export function record(kind, message, stack, at = new Date().toISOString()) {
  if (!fold(kept, { kind, message, stack, at })) dropped++;
}

/** Catch what nobody caught. Idempotent, so a second call is harmless. */
let installed = false;
export function installErrorCapture() {
  if (installed) return;
  installed = true;

  window.addEventListener('error', (e) => {
    // A failed <img> or <script> also fires this, with no `error` object.
    if (!e.error && !e.message) return;
    record('error', e.message ?? String(e.error), e.error?.stack);
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    record('unhandled-rejection', reason?.message ?? String(reason), reason?.stack);
  });
}

/** What to put in the bug report. Empty array when nothing went wrong. */
export const captured = () => ({ errors: kept.map((e) => ({ ...e })), dropped });

/** Test seam. Nothing in the running extension calls this. */
export function __resetForTest() {
  kept.length = 0;
  dropped = 0;
  installed = false;
}

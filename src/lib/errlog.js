/**
 * What went wrong, written down in a form that can be pasted.
 *
 * This is the pure half of the error record: the scrubbing, the ring, and the
 * counting. It has no `window` and no `chrome`, so both surfaces can use it —
 * `src/ui/errors.js` installs it on the page's `error` and `unhandledrejection`
 * events, and `src/sw.js` installs it on the service worker's, where it also
 * has to survive the worker being torn down.
 *
 * ## Rule 7 applies here more than anywhere
 *
 * An exception message is the one string in this project written by somebody
 * else — a browser, or Chart.js — and it can carry whatever was in scope. So
 * nothing here is passed through untouched:
 *
 *  - URLs become `<url>`, because a DEGIRO URL carries a session id and an
 *    account number in its path (the 0.20.0 leak);
 *  - any run of four or more digits becomes `<n>`, because an amount, an
 *    account number and a product id are all that shape;
 *  - the stack keeps file and line and drops everything else;
 *  - and every string is truncated, so a stringified object cannot become the
 *    payload.
 *
 * ## Why it is a ring and not a log
 *
 * A render that throws tends to throw again on the next render, and the next.
 * An unbounded list turns one defect into ten thousand copies and an
 * unpasteable report; a ring keeps the first few, which is what diagnosis
 * needs. Repeats are counted rather than stored.
 */

export const MAX_KEPT = 12;
const MAX_MESSAGE = 200;

/** Strip anything that could be an identifier or an amount. */
export function scrub(text) {
  if (typeof text !== 'string') return null;
  return text
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/chrome-extension:\/\/[a-z]+/g, '<ext>')
    .replace(/\d{4,}/g, '<n>')
    .slice(0, MAX_MESSAGE);
}

/**
 * Where it happened, as file and line only.
 *
 * The first frame is enough to find a defect and the rest is noise; a full
 * stack is also the most likely place for an interpolated value to be hiding.
 */
export function firstFrame(stack) {
  if (typeof stack !== 'string') return null;
  const line = stack.split('\n').find((l) => /\.js:\d+/.test(l));
  if (!line) return null;
  const m = /([\w-]+\.js):(\d+)/.exec(line);
  return m ? `${m[1]}:${m[2]}` : null;
}

/**
 * Fold one error into a ring, in place.
 *
 * Returns `true` when the ring changed, which is what tells a persisting
 * caller whether it is worth a write. A hundred repeats of one error are a
 * hundred `count++`s and one write, not a hundred writes.
 *
 * @param {Array} kept  the ring, mutated
 * @param {{kind: string, message?: string, stack?: string, at?: string}} entry
 * @param {{evictOldest?: boolean}} [opts]  which end to keep when full
 */
export function fold(kept, { kind, message, stack, at }, { evictOldest = false } = {}) {
  const scrubbed = scrub(message) ?? '(no message)';
  const where = firstFrame(stack);

  const same = kept.find((e) => e.kind === kind && e.message === scrubbed && e.where === where);
  if (same) {
    same.count++;
    same.lastAt = at ?? same.lastAt;
    return true;
  }

  /**
   * Which twelve to keep depends on how long the ring lives.
   *
   * A page's ring lives for one visit, so the *first* twelve are the right
   * ones: the first error is usually the cause and the rest are its
   * consequences. The worker's ring lives in IndexedDB for as long as the
   * extension is installed, and there keeping the first twelve means twelve
   * errors from March silently block everything that happens in April. So it
   * evicts instead — and evicts the oldest by count-weighted age, which is
   * just "the front", since new entries are pushed to the back.
   */
  if (kept.length >= MAX_KEPT) {
    if (!evictOldest) return false;
    kept.shift();
  }
  kept.push({ at: at ?? null, kind, message: scrubbed, where, count: 1 });
  return true;
}

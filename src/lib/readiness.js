/**
 * US-113 variant B — is the DEGIRO tab quiet enough to start an opportunistic sync?
 *
 * Pure, in the shape `bannermodel.js` already establishes: timestamps in,
 * ready-or-not out, no DOM and no `chrome.*`. `src/content/readywatch.js`
 * observes the page and calls this; it does not decide.
 *
 * We must not learn "DEGIRO is ready" by reading DEGIRO's page (rule 9, read
 * from the other side — see US-113 in BACKLOG.md). What the content script
 * may pass here is resource-timing *timestamps* — a rate, never a `name`,
 * which is a URL and would carry `intAccount`/`sessionId`.
 *
 * A trading screen can stream continuously, in which case there is no quiet
 * window and the rate never goes to zero — a sync that silently never
 * happens is worse than one that happens at a bad moment, so `QUIET_CEILING_MS`
 * is not a tuning knob, it is the story's own fallback: past it we sync
 * anyway, which is variant A. Both constants are provisional — no capture of
 * a real, funded, logged-in DEGIRO tab has ever fed this module (see
 * BACKLOG.md's stop condition for US-113); tighten them once one does.
 */

export const QUIET_WINDOW_MS = 1000;
export const QUIET_CEILING_MS = 15000;

/**
 * @param {{resourceTimestamps: number[], now: number}} args
 *   `resourceTimestamps` and `now` share one clock — `performance.now()` on
 *   the page being watched — so `now` alone (no separate "page start") is
 *   enough to apply the ceiling.
 */
export function pageIsReady({ resourceTimestamps, now }) {
  if (now >= QUIET_CEILING_MS) return true;
  const windowStart = now - QUIET_WINDOW_MS;
  return !resourceTimestamps.some((t) => t > windowStart && t <= now);
}

/**
 * US-113 variant B — waits for trader.degiro.nl to go quiet, then asks the
 * worker to sync.
 *
 * Deliberately its own module, imported by `boot.js` independently of
 * `banner.js`: the sync trigger must run whether or not the strip or the
 * toast are shown, or dismissed (`banner.js`'s own `main()` returns early in
 * both cases, and hanging this off it would make closing a UI element
 * quietly turn off a data feature). It reads nothing from the page beyond
 * resource-timing *counts* and touches nothing in it.
 *
 * `PerformanceObserver` entries are the only thing this module looks at, and
 * only their timing fields (`responseEnd`/`startTime` — numbers) — never
 * `.name`, which is a URL and would carry `intAccount`/`sessionId` straight
 * past rule 9's promise.
 */

import { pageIsReady } from '../lib/readiness.js';

const POLL_MS = 250;

function watch() {
  if (window !== window.top) return; // never inside an iframe of the broker

  const resourceTimestamps = [];
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      resourceTimestamps.push(entry.responseEnd || entry.startTime);
    }
  });
  observer.observe({ type: 'resource', buffered: true });

  const timer = setInterval(() => {
    if (!pageIsReady({ resourceTimestamps, now: performance.now() })) return;
    clearInterval(timer);
    observer.disconnect();
    // A signal from the page, not a person pressing a button: distinct from
    // `sync` so it reaches `runSync({ scheduled: true })` and never re-arms
    // an alarm a disconnect deliberately cleared (BACKLOG.md, US-113).
    chrome.runtime.sendMessage({ type: 'tab-ready' }).catch(() => {});
  }, POLL_MS);
}

watch();
